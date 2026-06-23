import { Router, Request, Response } from "express";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";
import { ingestTask, type BeadsTask } from "../services/memoryService.js";
import { logger } from "../lib/monitoring.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BEADS_BIN = process.env.BEADS_BINARY || path.join(__dirname, "../../../../beads/bd");

const router = Router();

// GET /beads/tasks — list all tasks
router.get("/tasks", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync(`"${BEADS_BIN}" list --json`);
    const data: unknown = JSON.parse(stdout || "[]");
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to list tasks" });
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
    const { stdout } = await execFileAsync(BEADS_BIN, args);
    const trimmed = stdout.trim();
    const data: unknown = trimmed ? JSON.parse(trimmed) : null;

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

// PUT /beads/tasks/:id/ready — mark task ready
router.put("/tasks/:id/ready", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { stdout } = await execFileAsync(BEADS_BIN, ["ready", id]);
    const trimmed = stdout.trim();
    const data: unknown = trimmed ? JSON.parse(trimmed) : null;
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to mark task ready" });
  }
});

// PUT /beads/tasks/:id/done — mark task done
router.put("/tasks/:id/done", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { stdout } = await execFileAsync(BEADS_BIN, ["done", id]);
    const trimmed = stdout.trim();
    const data: unknown = trimmed ? JSON.parse(trimmed) : null;
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to mark task done" });
  }
});

// GET /beads/tasks/:id — get a single task
router.get("/tasks/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { stdout } = await execFileAsync(BEADS_BIN, ["show", "--json", id]);
    const data: unknown = JSON.parse(stdout);
    res.json({ success: true, data });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to get task" });
  }
});

export default router;
