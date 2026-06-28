import { Router, Request, Response } from "express";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import {
  ingestTask,
  addDependency,
  listDependencies,
  findDependencyCycles,
  type BeadsTask,
} from "../services/memoryService.js";
import { resolveBeadsBinary } from "../services/engineManager.js";
import { logger } from "../lib/monitoring.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/**
 * Resolve the beads binary path through the central engineManager so all
 * engine paths come from one source of truth. Falls back to `bd` on PATH
 * when no bundled/env binary is found, surfacing a clear error at exec time.
 */
function beadsBin(): string {
  return resolveBeadsBinary().path ?? "bd";
}

/**
 * Parse the trimmed stdout of a `bd ... --json` invocation. The binary emits an
 * empty body for some commands; in that case `null` is returned rather than
 * throwing a JSON parse error.
 */
function parseBeadsJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return JSON.parse(trimmed) as unknown;
}

/** A non-empty, trimmed string, or null when the value is absent/blank. */
function cleanId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Coerce a query-string value (string | string[] | undefined) to a single
 * trimmed string. Express types repeated/array query params, so collapse them.
 */
function singleQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value) && value.length > 0) {
    return singleQueryValue(value[0]);
  }
  return undefined;
}

/**
 * Parse a comma-separated (or array) label value into a clean array of
 * non-empty labels.
 */
function labelList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((label) => (typeof label === "string" ? label.trim() : ""))
      .filter((label) => label.length > 0);
  }
  const raw = singleQueryValue(value);
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label.length > 0);
}

/**
 * Parse a bounded integer from a value. Returns undefined when absent or not a
 * finite integer; clamps the result into [min, max].
 */
function boundedInt(
  value: unknown,
  min: number,
  max: number
): number | undefined {
  const raw =
    typeof value === "number" ? String(value) : singleQueryValue(value);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.min(Math.max(parsed, min), max);
}

const DEPENDENCY_TYPES = [
  "blocks",
  "related",
  "parent-child",
  "discovered-from",
] as const;
type DependencyType = (typeof DEPENDENCY_TYPES)[number];

function isDependencyType(value: unknown): value is DependencyType {
  return (
    typeof value === "string" &&
    (DEPENDENCY_TYPES as readonly string[]).includes(value)
  );
}

const router = Router();

// Every beads endpoint reads or mutates task-management state and shells out
// to the beads binary, so the entire router requires an authenticated user.
router.use(apiKeyAuth);

// GET /beads/tasks — list all tasks
router.get("/tasks", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync(`"${beadsBin()}" list --json`);
    const data: unknown = JSON.parse(stdout || "[]");
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to list tasks" });
  }
});

// GET /beads/ready — work-queue query: unblocked, ready-to-work tasks.
// Optional filters: priority (0-4), assignee, unassigned, labels (AND),
// labelsAny (OR), limit (1-100), sort (priority|hybrid|oldest).
//
// With ?claim=1 (or claim=true) the first ready task matching the filters is
// atomically claimed (assignee=actor + status=in_progress) in a single
// compare-and-swap step, so concurrent agents cannot grab the same task. Per
// the beads CLI, --claim cannot be combined with --assignee/--unassigned, so
// those filters are ignored when claiming.
router.get("/ready", async (req: AuthenticatedRequest, res: Response) => {
  const claim =
    singleQueryValue(req.query.claim) === "1" ||
    singleQueryValue(req.query.claim) === "true";

  const args: string[] = ["ready", "--json"];

  const priority = boundedInt(req.query.priority, 0, 4);
  if (priority !== undefined) {
    args.push("--priority", String(priority));
  }

  if (claim) {
    args.push("--claim");
  } else {
    const assignee = singleQueryValue(req.query.assignee);
    if (assignee) {
      args.push("--assignee", assignee);
    }
    if (singleQueryValue(req.query.unassigned) === "true") {
      args.push("--unassigned");
    }
  }

  for (const label of labelList(req.query.labels)) {
    args.push("--label", label);
  }
  for (const label of labelList(req.query.labelsAny)) {
    args.push("--label-any", label);
  }

  const limit = boundedInt(req.query.limit, 1, 100);
  if (limit !== undefined) {
    args.push("--limit", String(limit));
  }

  // --sort only applies to the query form; claiming takes the first match.
  if (!claim) {
    const sort = singleQueryValue(req.query.sort);
    if (sort === "priority" || sort === "hybrid" || sort === "oldest") {
      args.push("--sort", sort);
    }
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), args);
    const data = parseBeadsJson(stdout) ?? [];

    // When a claim succeeds, write the claimed task through to the unified
    // memory layer so it is searchable (best-effort, never blocks the response).
    if (claim) {
      const claimed = Array.isArray(data) ? data[0] : data;
      if (claimed && typeof claimed === "object" && !Array.isArray(claimed)) {
        void ingestTask(claimed as BeadsTask, { userId: req.user?.userId }).catch(
          (error: unknown) => {
            logger.warn("beads: claim memory write-through failed", {
              details: String(error),
            });
          }
        );
      }
    }

    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to query ready tasks",
    });
  }
});

// GET /beads/blocked — list blocked tasks and the dependencies blocking them.
router.get("/blocked", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execFileAsync(beadsBin(), ["blocked", "--json"]);
    res.json({ success: true, data: parseBeadsJson(stdout) ?? [] });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to query blocked tasks",
    });
  }
});

// GET /beads/stats — totals (open/in_progress/closed/blocked/ready) plus the
// average lead time. Backed by `bd status --json` (alias: `bd stats`).
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execFileAsync(beadsBin(), [
      "status",
      "--json",
      "--no-activity",
    ]);
    res.json({ success: true, data: parseBeadsJson(stdout) });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to get statistics",
    });
  }
});

// PUT /beads/tasks/:id/claim — atomically claim a single task.
//
// Sets assignee (to the configured actor) and status=in_progress in one
// compare-and-swap step. This is the multi-agent-safe primitive: two agents
// racing on the same task cannot both win the claim. Idempotent when the task
// is already claimed by the same actor; a 409 is returned when another actor
// holds the claim.
router.put("/tasks/:id/claim", async (req: AuthenticatedRequest, res: Response) => {
  const id = cleanId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, error: "task id is required" });
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), ["update", id, "--claim", "--json"]);
    const data = parseBeadsJson(stdout);

    const claimed = Array.isArray(data) ? data[0] : data;
    if (claimed && typeof claimed === "object" && !Array.isArray(claimed)) {
      void ingestTask(claimed as BeadsTask, { userId: req.user?.userId }).catch(
        (error: unknown) => {
          logger.warn("beads: claim memory write-through failed", {
            details: String(error),
          });
        }
      );
    }

    res.json({ success: true, data });
  } catch (err: unknown) {
    // The CLI exits non-zero when the compare-and-swap claim fails because the
    // task is already in progress / claimed by another actor. Surface that as a
    // 409 so callers can retry a different task instead of treating it as a
    // server fault.
    const message = err instanceof Error ? err.message : "Failed to claim task";
    const conflict = /claim|in[_ ]?progress|already/i.test(message);
    res.status(conflict ? 409 : 500).json({ success: false, error: message });
  }
});

// POST /beads/deps — add a dependency edge to the DAG: `blocked` depends on
// `blocker`. The binary runs a cycle check and refuses an edge that would
// create a cycle (surfaced here as 409). body: { blocked, blocker, type? }
router.post("/deps", async (req: Request, res: Response) => {
  const body = req.body as { blocked?: unknown; blocker?: unknown; type?: unknown };
  const blocked = cleanId(body.blocked);
  const blocker = cleanId(body.blocker);

  if (!blocked || !blocker) {
    return res.status(400).json({
      success: false,
      error: "both blocked and blocker task ids are required",
    });
  }
  if (blocked === blocker) {
    return res
      .status(400)
      .json({ success: false, error: "a task cannot depend on itself" });
  }

  const type = isDependencyType(body.type) ? body.type : undefined;

  try {
    const data = await addDependency(blocked, blocker, type);
    res.status(201).json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add dependency";
    const isCycle = /cycle/i.test(message);
    res.status(isCycle ? 409 : 500).json({ success: false, error: message });
  }
});

// GET /beads/deps?id=:id&direction=down|up — list dependency edges for a task.
//   direction=down (default): what :id depends on (its blockers)
//   direction=up:             what depends on :id (issues it blocks)
router.get("/deps", async (req: Request, res: Response) => {
  const id = cleanId(req.query.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "id query param is required" });
  }

  const direction = singleQueryValue(req.query.direction) === "up" ? "up" : "down";

  try {
    const data = await listDependencies(id, direction);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to list dependencies",
    });
  }
});

// GET /beads/deps/cycles — detect dependency cycles across the whole DAG.
router.get("/deps/cycles", async (_req: Request, res: Response) => {
  try {
    const data = await findDependencyCycles();
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to detect dependency cycles",
    });
  }
});

// POST /beads/tasks — create a task
// body: { title: string, deps?: string[] }
router.post("/tasks", async (req: Request, res: Response) => {
  const { title, deps } = req.body as { title?: string; deps?: string[] };

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return res.status(400).json({ success: false, error: "title is required" });
  }

  const args: string[] = ["add", "--title", title.trim()];

  if (Array.isArray(deps) && deps.length > 0) {
    args.push("--deps", deps.join(","));
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), args);
    const data = parseBeadsJson(stdout);

    // Write-through into the unified memory layer (best-effort; never blocks
    // the response). Falls back to the title when the binary returns no JSON.
    const task: BeadsTask =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as BeadsTask)
        : { title: title.trim(), deps: Array.isArray(deps) ? deps : [] };
    void ingestTask(task).catch((error: unknown) => {
      logger.warn("beads: memory write-through failed", { details: String(error) });
    });

    res.status(201).json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to create task" });
  }
});

// POST /beads/tasks/:id/deps — add a dependency edge from this task to another.
// body: { dependsOn: string, type?: blocks|related|parent-child|discovered-from }
// Models the blocker an agent discovers mid-task (e.g. a discovered-from edge).
router.post("/tasks/:id/deps", async (req: Request, res: Response) => {
  const id = cleanId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, error: "task id is required" });
  }

  const body = req.body as { dependsOn?: unknown; type?: unknown };
  const dependsOn = cleanId(body.dependsOn);
  if (!dependsOn) {
    return res
      .status(400)
      .json({ success: false, error: "dependsOn (a task id) is required" });
  }

  let depType: DependencyType = "blocks";
  if (body.type !== undefined) {
    if (!isDependencyType(body.type)) {
      return res.status(400).json({
        success: false,
        error: `type must be one of: ${DEPENDENCY_TYPES.join(", ")}`,
      });
    }
    depType = body.type;
  }

  // `bd dep add <issue> <depends-on> --type <t>` records that <issue> depends
  // on <depends-on>.
  try {
    const { stdout } = await execFileAsync(beadsBin(), [
      "dep",
      "add",
      id,
      dependsOn,
      "--type",
      depType,
    ]);
    res.status(201).json({ success: true, data: parseBeadsJson(stdout) });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to add dependency",
    });
  }
});

// PUT /beads/tasks/:id/ready — mark task ready
router.put("/tasks/:id/ready", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { stdout } = await execFileAsync(beadsBin(), ["ready", id]);
    res.json({ success: true, data: parseBeadsJson(stdout) });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to mark task ready" });
  }
});

// PUT /beads/tasks/:id/done — mark task done
router.put("/tasks/:id/done", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { stdout } = await execFileAsync(beadsBin(), ["done", id]);
    res.json({ success: true, data: parseBeadsJson(stdout) });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to mark task done" });
  }
});

// PATCH /beads/tasks/:id — edit task fields (title/priority/assignee/status/
// labels). Only provided fields are applied; at least one must be present.
router.patch("/tasks/:id", async (req: Request, res: Response) => {
  const id = cleanId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, error: "task id is required" });
  }

  const body = req.body as {
    title?: unknown;
    priority?: unknown;
    assignee?: unknown;
    status?: unknown;
    labels?: unknown;
  };

  const args: string[] = ["update", id];
  let changed = false;

  const title = cleanId(body.title);
  if (title) {
    args.push("--title", title);
    changed = true;
  }

  if (body.priority !== undefined) {
    const priority = boundedInt(body.priority, 0, 4);
    if (priority === undefined) {
      return res
        .status(400)
        .json({ success: false, error: "priority must be an integer 0-4" });
    }
    args.push("--priority", String(priority));
    changed = true;
  }

  if (body.assignee !== undefined) {
    // An explicit empty string clears the assignee; a value sets it.
    const assignee = typeof body.assignee === "string" ? body.assignee.trim() : "";
    args.push("--assignee", assignee);
    changed = true;
  }

  const status = cleanId(body.status);
  if (status) {
    args.push("--status", status);
    changed = true;
  }

  if (body.labels !== undefined) {
    const labels = labelList(body.labels);
    // Replace the full label set so the update is deterministic.
    args.push("--set-labels", labels.join(","));
    changed = true;
  }

  if (!changed) {
    return res.status(400).json({
      success: false,
      error: "at least one of title, priority, assignee, status, labels is required",
    });
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), args);
    res.json({ success: true, data: parseBeadsJson(stdout) });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to update task",
    });
  }
});

// POST /beads/tasks/:id/close — close a task with an audit-trail reason.
// body: { reason?: string }
router.post("/tasks/:id/close", async (req: Request, res: Response) => {
  const id = cleanId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, error: "task id is required" });
  }

  const body = req.body as { reason?: unknown };
  const reason = cleanId(body.reason) ?? "Completed";

  try {
    const { stdout } = await execFileAsync(beadsBin(), [
      "close",
      id,
      "--reason",
      reason,
    ]);
    res.json({ success: true, data: parseBeadsJson(stdout) });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to close task",
    });
  }
});

// POST /beads/tasks/:id/reopen — reopen a closed task (e.g. a regressed fix).
// body: { reason?: string }
router.post("/tasks/:id/reopen", async (req: Request, res: Response) => {
  const id = cleanId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, error: "task id is required" });
  }

  const body = req.body as { reason?: unknown };
  const reason = cleanId(body.reason);

  const args: string[] = ["reopen", id];
  if (reason) {
    args.push("--reason", reason);
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), args);
    res.json({ success: true, data: parseBeadsJson(stdout) });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to reopen task",
    });
  }
});

// GET /beads/tasks/:id — get a single task
router.get("/tasks/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { stdout } = await execFileAsync(beadsBin(), ["show", "--json", id]);
    const data: unknown = JSON.parse(stdout);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to get task" });
  }
});

export default router;
