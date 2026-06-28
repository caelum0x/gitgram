import { Router, Request, Response } from "express";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import {
  ingestTask,
  addDependency,
  listDependencies,
  listDependencyTree,
  findDependencyCycles,
  compactIssues,
  runBeadsDoctor,
  BEADS_DOCTOR_CHECKS,
  type BeadsDoctorCheck,
  remember,
  recall,
  listMemories,
  forget,
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

// Issue types the bundled `bd` binary accepts on create/update. Aliases
// (enhancement/feat→feature, dec/adr→decision) are resolved by the CLI itself.
const ISSUE_TYPES = [
  "bug",
  "feature",
  "task",
  "epic",
  "chore",
  "decision",
] as const;
type IssueType = (typeof ISSUE_TYPES)[number];

function isIssueType(value: unknown): value is IssueType {
  return (
    typeof value === "string" &&
    (ISSUE_TYPES as readonly string[]).includes(value)
  );
}

/** A trimmed non-empty string body field, or null when absent/blank. */
function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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

// GET /beads/deps/tree?id=:id&direction=down|up|both&maxDepth=:n
// Recursive transitive dependency tree rooted at :id (vs the flat one-hop
// edge list from /beads/deps). Lets an agent plan multi-step work in one call.
//   direction=down (default): the transitive blockers :id depends on
//   direction=up:             the transitive dependents that depend on :id
//   direction=both:           both directions
router.get("/deps/tree", async (req: Request, res: Response) => {
  const id = cleanId(req.query.id);
  if (!id) {
    return res
      .status(400)
      .json({ success: false, error: "id query param is required" });
  }

  const dir = singleQueryValue(req.query.direction);
  const direction: "up" | "down" | "both" =
    dir === "up" ? "up" : dir === "both" ? "both" : "down";

  const maxDepth = boundedInt(req.query.maxDepth, 1, 100);

  try {
    const data = await listDependencyTree(id, direction, maxDepth);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to build dependency tree",
    });
  }
});

// POST /beads/compact — semantic memory decay: summarise old closed issues to
// keep the DAG (and agent context window) from growing unbounded.
// body: { mode?: "stats"|"analyze"|"auto", dryRun?, all?, id?, limit? }
// Defaults to read-only stats; "auto" defaults to a dry-run unless dryRun=false.
router.post("/compact", async (req: Request, res: Response) => {
  const body = req.body as {
    mode?: unknown;
    dryRun?: unknown;
    all?: unknown;
    id?: unknown;
    limit?: unknown;
  };

  const mode =
    body.mode === "analyze" || body.mode === "auto" || body.mode === "stats"
      ? body.mode
      : "stats";

  const options: Parameters<typeof compactIssues>[0] = {
    stats: mode === "stats",
    analyze: mode === "analyze",
  };

  if (mode === "auto") {
    options.dryRun = body.dryRun === false ? false : true;
    options.all = body.all === true;
    const id = cleanId(body.id);
    if (id) {
      options.id = id;
    }
  }

  const limit = boundedInt(body.limit, 1, 10000);
  if (limit !== undefined) {
    options.limit = limit;
  }

  try {
    const data = await compactIssues(options);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to compact issues",
    });
  }
});

// POST /beads/memory — store a durable insight that survives context resets.
// body: { insight: string, key?: string }
router.post("/memory", async (req: Request, res: Response) => {
  const body = req.body as { insight?: unknown; key?: unknown };
  const insight =
    typeof body.insight === "string" ? body.insight.trim() : "";
  if (insight.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "insight is required" });
  }

  const key = cleanId(body.key) ?? undefined;

  try {
    const data = await remember(insight, key);
    res.status(201).json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to store memory",
    });
  }
});

// GET /beads/memory?search=:term — list (or keyword-search) persistent memories.
router.get("/memory", async (req: Request, res: Response) => {
  const search = singleQueryValue(req.query.search);

  try {
    const data = await listMemories(search);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to list memories",
    });
  }
});

// GET /beads/memory/:key — retrieve a single memory (404 when absent).
router.get("/memory/:key", async (req: Request, res: Response) => {
  const key = cleanId(req.params.key);
  if (!key) {
    return res.status(400).json({ success: false, error: "key is required" });
  }

  try {
    const data = await recall(key);
    if (!data.found) {
      return res
        .status(404)
        .json({ success: false, error: `No memory with key '${key}'` });
    }
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to recall memory",
    });
  }
});

// DELETE /beads/memory/:key — forget a memory (404 when absent).
router.delete("/memory/:key", async (req: Request, res: Response) => {
  const key = cleanId(req.params.key);
  if (!key) {
    return res.status(400).json({ success: false, error: "key is required" });
  }

  try {
    const data = await forget(key);
    if (!data.deleted) {
      return res
        .status(404)
        .json({ success: false, error: `No memory with key '${key}'` });
    }
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to forget memory",
    });
  }
});

// POST /beads/tasks — create a task with the full issue model.
// body: {
//   title: string,
//   deps?: string[],
//   description?, design?, acceptanceCriteria?, notes?, externalRef?: string,
//   priority?: number (0-4),
//   issueType?: bug|feature|task|epic|chore|decision
// }
// Only title is required; the rest are forwarded to the `bd add` flags the CLI
// natively supports, so agents can capture full design/acceptance context at
// creation time instead of losing it.
router.post("/tasks", async (req: Request, res: Response) => {
  const body = req.body as {
    title?: unknown;
    deps?: unknown;
    description?: unknown;
    design?: unknown;
    acceptanceCriteria?: unknown;
    notes?: unknown;
    externalRef?: unknown;
    priority?: unknown;
    issueType?: unknown;
  };

  const title = cleanText(body.title);
  if (!title) {
    return res.status(400).json({ success: false, error: "title is required" });
  }

  const deps = Array.isArray(body.deps)
    ? body.deps.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : [];

  const args: string[] = ["add", "--title", title];

  if (deps.length > 0) {
    args.push("--deps", deps.join(","));
  }

  const description = cleanText(body.description);
  if (description) {
    args.push("--description", description);
  }

  const design = cleanText(body.design);
  if (design) {
    args.push("--design", design);
  }

  const acceptanceCriteria = cleanText(body.acceptanceCriteria);
  if (acceptanceCriteria) {
    args.push("--acceptance", acceptanceCriteria);
  }

  const notes = cleanText(body.notes);
  if (notes) {
    args.push("--notes", notes);
  }

  const externalRef = cleanText(body.externalRef);
  if (externalRef) {
    args.push("--external-ref", externalRef);
  }

  if (body.priority !== undefined) {
    const priority = boundedInt(body.priority, 0, 4);
    if (priority === undefined) {
      return res
        .status(400)
        .json({ success: false, error: "priority must be an integer 0-4" });
    }
    args.push("--priority", String(priority));
  }

  if (body.issueType !== undefined) {
    if (!isIssueType(body.issueType)) {
      return res.status(400).json({
        success: false,
        error: `issueType must be one of: ${ISSUE_TYPES.join(", ")}`,
      });
    }
    args.push("--type", body.issueType);
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

// PATCH /beads/tasks/:id — edit task fields. Only provided fields are applied;
// at least one must be present. Beyond the core editable fields (title,
// priority, assignee, status, labels) this also forwards the rich issue model
// the `bd update` CLI supports: description, design, acceptanceCriteria, notes,
// externalRef, and issueType — so agents can refine full task specs after
// creation instead of losing that context.
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
    description?: unknown;
    design?: unknown;
    acceptanceCriteria?: unknown;
    notes?: unknown;
    externalRef?: unknown;
    issueType?: unknown;
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

  const description = cleanText(body.description);
  if (description) {
    args.push("--description", description);
    changed = true;
  }

  const design = cleanText(body.design);
  if (design) {
    args.push("--design", design);
    changed = true;
  }

  const acceptanceCriteria = cleanText(body.acceptanceCriteria);
  if (acceptanceCriteria) {
    args.push("--acceptance", acceptanceCriteria);
    changed = true;
  }

  const notes = cleanText(body.notes);
  if (notes) {
    args.push("--notes", notes);
    changed = true;
  }

  const externalRef = cleanText(body.externalRef);
  if (externalRef) {
    args.push("--external-ref", externalRef);
    changed = true;
  }

  if (body.issueType !== undefined) {
    if (!isIssueType(body.issueType)) {
      return res.status(400).json({
        success: false,
        error: `issueType must be one of: ${ISSUE_TYPES.join(", ")}`,
      });
    }
    args.push("--type", body.issueType);
    changed = true;
  }

  if (!changed) {
    return res.status(400).json({
      success: false,
      error:
        "at least one of title, priority, assignee, status, labels, description, " +
        "design, acceptanceCriteria, notes, externalRef, issueType is required",
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

// GET /beads/stale — issues not updated recently (potentially stuck/abandoned).
//
// Surfaces the fleet-health signal you want for a swarm of agents opening PRs:
// in-progress tasks with no recent activity, forgotten open tasks, and outdated
// work. Optional filters:
//   days   — staleness threshold in days (>=1, default 30, max 3650)
//   status — open | in_progress | blocked | deferred
//   limit  — max issues to return (1-1000, default 50)
const STALE_STATUSES = ["open", "in_progress", "blocked", "deferred"] as const;

router.get("/stale", async (req: Request, res: Response) => {
  const args: string[] = ["stale", "--json"];

  const days = boundedInt(req.query.days, 1, 3650);
  if (days !== undefined) {
    args.push("--days", String(days));
  }

  const status = singleQueryValue(req.query.status);
  if (status !== undefined) {
    if (!(STALE_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${STALE_STATUSES.join(", ")}`,
      });
    }
    args.push("--status", status);
  }

  const limit = boundedInt(req.query.limit, 1, 1000);
  if (limit !== undefined) {
    args.push("--limit", String(limit));
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), args);
    res.json({ success: true, data: parseBeadsJson(stdout) ?? [] });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to query stale tasks",
    });
  }
});

// POST /beads/admin — DAG health diagnostics and optional repair.
//
// Runs `bd doctor` to surface orphaned dependency references, duplicate issues,
// test pollution, git-conflict cruft, and (with deep=true) full graph-integrity
// problems. Read-only by default; mutating repair requires explicit flags so an
// accidental call never alters the store. body:
//   { check?: "validate"|"pollution"|"artifacts",
//     fix?: boolean,    // auto-repair fixable validate findings
//     clean?: boolean,  // delete detected pollution / stale artifacts
//     deep?: boolean }  // slower full graph-integrity validation
router.post("/admin", async (req: Request, res: Response) => {
  const body = req.body as {
    check?: unknown;
    fix?: unknown;
    clean?: unknown;
    deep?: unknown;
  };

  let check: BeadsDoctorCheck | undefined;
  if (body.check !== undefined) {
    const raw = singleQueryValue(body.check);
    if (!raw || !(BEADS_DOCTOR_CHECKS as readonly string[]).includes(raw)) {
      return res.status(400).json({
        success: false,
        error: `check must be one of: ${BEADS_DOCTOR_CHECKS.join(", ")}`,
      });
    }
    check = raw as BeadsDoctorCheck;
  }

  try {
    const data = await runBeadsDoctor({
      check,
      fix: body.fix === true,
      clean: body.clean === true,
      deep: body.deep === true,
    });
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to run beads diagnostics",
    });
  }
});

// GET /beads/prime — AI-optimized workflow context as markdown.
//
// Bootstraps an agent at session start with the current Beads workflow state
// (ready work + conventions) instead of hand-assembling context. The CLI emits
// markdown to stdout; we return it as text. Optional modifiers:
//   mode=full   — force full CLI command reference (ignore MCP detection)
//   mode=mcp    — force minimal MCP-mode reminders
//   stealth=1   — stealth mode (no git operations in the close protocol)
//   memoriesOnly=1 — output only persistent memories (for compact hooks)
router.get("/prime", async (req: Request, res: Response) => {
  const args: string[] = ["prime"];

  const mode = singleQueryValue(req.query.mode);
  if (mode === "full") {
    args.push("--full");
  } else if (mode === "mcp") {
    args.push("--mcp");
  }

  if (singleQueryValue(req.query.stealth) === "1" || singleQueryValue(req.query.stealth) === "true") {
    args.push("--stealth");
  }
  if (
    singleQueryValue(req.query.memoriesOnly) === "1" ||
    singleQueryValue(req.query.memoriesOnly) === "true"
  ) {
    args.push("--memories-only");
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), args);
    // `bd prime` emits markdown to stdout (not JSON); return it verbatim so the
    // caller can inject it directly into an agent's session context.
    res.json({ success: true, data: { format: "markdown", content: stdout } });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to prime agent context",
    });
  }
});

// GET /beads/search?q=:query — full-text search across the issue DAG.
//
// Complements the work-queue routes (ready/blocked/stale) and the unified-memory
// search by exposing `bd search`, which scans ALL issues in the DAG — including
// arbitrary or closed issues that were never write-through-ingested into the
// memory layer. ID-like queries (e.g. "bd-5q") use fast exact/prefix matching;
// text queries match titles. This is the core "has someone already filed this?"
// retrieval primitive for a swarm of agents before opening duplicate work.
//
// Query params (all optional except q):
//   q | query           — the search query (required)
//   status              — open|in_progress|blocked|deferred|closed|all
//                         (default excludes closed; use 'all' to include them)
//   assignee            — filter by assignee
//   type                — bug|feature|task|epic|chore|decision|merge-request|molecule|gate
//   labels              — AND filter (comma-separated or repeated)
//   labelsAny           — OR filter (comma-separated or repeated)
//   limit               — max results (1-1000, default 50)
//   sort                — priority|created|updated|closed|status|id|title|type|assignee
//   reverse             — reverse sort order (1/true)
//   descContains        — description substring (case-insensitive)
//   notesContains       — notes substring (case-insensitive)
//   priorityMin         — minimum priority, inclusive (0-4)
//   priorityMax         — maximum priority, inclusive (0-4)
//   createdAfter        — YYYY-MM-DD or RFC3339
//   createdBefore       — YYYY-MM-DD or RFC3339
//   noAssignee          — only issues with no assignee (1/true)
//   noLabels            — only issues with no labels (1/true)
const SEARCH_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "deferred",
  "closed",
  "all",
] as const;

const SEARCH_SORT_FIELDS = [
  "priority",
  "created",
  "updated",
  "closed",
  "status",
  "id",
  "title",
  "type",
  "assignee",
] as const;

const SEARCH_ISSUE_TYPES = [
  "bug",
  "feature",
  "task",
  "epic",
  "chore",
  "decision",
  "merge-request",
  "molecule",
  "gate",
] as const;

/** A YYYY-MM-DD or RFC3339 date string, validated; null when absent/invalid. */
function dateFlag(value: unknown): string | null {
  const raw = singleQueryValue(value);
  if (!raw) {
    return null;
  }
  // Accept plain dates (YYYY-MM-DD) and full RFC3339 timestamps. Anything the
  // binary cannot parse would be rejected downstream; pre-validate here so we
  // return a 400 instead of leaking a CLI parse error as a 500.
  const isValidShape =
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ||
    !Number.isNaN(Date.parse(raw));
  return isValidShape ? raw : null;
}

function isTruthyFlag(value: unknown): boolean {
  const v = singleQueryValue(value);
  return v === "1" || v === "true";
}

router.get("/search", async (req: Request, res: Response) => {
  const query = singleQueryValue(req.query.q) ?? singleQueryValue(req.query.query);
  if (!query) {
    return res
      .status(400)
      .json({ success: false, error: "q (search query) is required" });
  }

  // Put the positional query after `--` so a query that begins with `-`
  // (e.g. "-flag") is not misparsed as a CLI flag by the binary.
  const args: string[] = ["search", "--json"];

  const status = singleQueryValue(req.query.status);
  if (status !== undefined) {
    if (!(SEARCH_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${SEARCH_STATUSES.join(", ")}`,
      });
    }
    args.push("--status", status);
  }

  const assignee = singleQueryValue(req.query.assignee);
  if (assignee) {
    args.push("--assignee", assignee);
  }

  const issueType = singleQueryValue(req.query.type);
  if (issueType !== undefined) {
    if (!(SEARCH_ISSUE_TYPES as readonly string[]).includes(issueType)) {
      return res.status(400).json({
        success: false,
        error: `type must be one of: ${SEARCH_ISSUE_TYPES.join(", ")}`,
      });
    }
    args.push("--type", issueType);
  }

  for (const label of labelList(req.query.labels)) {
    args.push("--label", label);
  }
  for (const label of labelList(req.query.labelsAny)) {
    args.push("--label-any", label);
  }

  const limit = boundedInt(req.query.limit, 1, 1000);
  if (limit !== undefined) {
    args.push("--limit", String(limit));
  }

  const sort = singleQueryValue(req.query.sort);
  if (sort !== undefined) {
    if (!(SEARCH_SORT_FIELDS as readonly string[]).includes(sort)) {
      return res.status(400).json({
        success: false,
        error: `sort must be one of: ${SEARCH_SORT_FIELDS.join(", ")}`,
      });
    }
    args.push("--sort", sort);
  }

  if (isTruthyFlag(req.query.reverse)) {
    args.push("--reverse");
  }

  const descContains = singleQueryValue(req.query.descContains);
  if (descContains) {
    args.push("--desc-contains", descContains);
  }

  const notesContains = singleQueryValue(req.query.notesContains);
  if (notesContains) {
    args.push("--notes-contains", notesContains);
  }

  const priorityMin = boundedInt(req.query.priorityMin, 0, 4);
  if (priorityMin !== undefined) {
    args.push("--priority-min", String(priorityMin));
  }
  const priorityMax = boundedInt(req.query.priorityMax, 0, 4);
  if (priorityMax !== undefined) {
    args.push("--priority-max", String(priorityMax));
  }

  if (req.query.createdAfter !== undefined) {
    const createdAfter = dateFlag(req.query.createdAfter);
    if (!createdAfter) {
      return res.status(400).json({
        success: false,
        error: "createdAfter must be a YYYY-MM-DD or RFC3339 date",
      });
    }
    args.push("--created-after", createdAfter);
  }
  if (req.query.createdBefore !== undefined) {
    const createdBefore = dateFlag(req.query.createdBefore);
    if (!createdBefore) {
      return res.status(400).json({
        success: false,
        error: "createdBefore must be a YYYY-MM-DD or RFC3339 date",
      });
    }
    args.push("--created-before", createdBefore);
  }

  if (isTruthyFlag(req.query.noAssignee)) {
    args.push("--no-assignee");
  }
  if (isTruthyFlag(req.query.noLabels)) {
    args.push("--no-labels");
  }

  // Terminate flag parsing before the positional query.
  args.push("--", query);

  try {
    const { stdout } = await execFileAsync(beadsBin(), args);
    res.json({ success: true, data: parseBeadsJson(stdout) ?? [] });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to search issues",
    });
  }
});

// GET /beads/tasks/:id/comments — list the discussion/audit comments on an issue.
// Backed by `bd comments <id> --json`. Returns [] when the issue has none.
router.get("/tasks/:id/comments", async (req: Request, res: Response) => {
  const id = cleanId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, error: "task id is required" });
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), ["comments", id, "--json"]);
    res.json({ success: true, data: parseBeadsJson(stdout) ?? [] });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list comments";
    // The CLI exits non-zero when the issue does not exist. Surface that as a
    // 404 rather than a generic server fault so callers can distinguish.
    const notFound = /not found/i.test(message);
    res.status(notFound ? 404 : 500).json({ success: false, error: message });
  }
});

// POST /beads/tasks/:id/comments — attach a comment to an issue's audit trail.
// body: { text: string }
// For a fleet of agents, comments record why an agent did something and hand-off
// notes between agents. Backed by `bd comment <id> <text> --json`.
router.post("/tasks/:id/comments", async (req: Request, res: Response) => {
  const id = cleanId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, error: "task id is required" });
  }

  const body = req.body as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "text (comment body) is required" });
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), [
      "comment",
      id,
      "--json",
      "--",
      text,
    ]);
    res.status(201).json({ success: true, data: parseBeadsJson(stdout) });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to add comment";
    const notFound = /not found/i.test(message);
    res.status(notFound ? 404 : 500).json({ success: false, error: message });
  }
});

// POST /beads/tasks/:id/notes — append a durable working note to an issue.
// body: { text: string }
// The lightweight "leave a breadcrumb on this task" primitive: agents record
// progress/findings without overwriting the description. Backed by
// `bd note <id> <text> --json` (which appends to the issue's notes field).
router.post("/tasks/:id/notes", async (req: Request, res: Response) => {
  const id = cleanId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, error: "task id is required" });
  }

  const body = req.body as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length === 0) {
    return res
      .status(400)
      .json({ success: false, error: "text (note body) is required" });
  }

  try {
    const { stdout } = await execFileAsync(beadsBin(), [
      "note",
      id,
      "--json",
      "--",
      text,
    ]);
    res.status(201).json({ success: true, data: parseBeadsJson(stdout) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add note";
    const notFound = /not found/i.test(message);
    res.status(notFound ? 404 : 500).json({ success: false, error: message });
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
