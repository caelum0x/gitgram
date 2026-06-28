import { Router, Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  resolveSandboxRoot,
  walkFiles,
  searchContents,
} from "./workspaceSandbox.js";

const execFileAsync = promisify(execFile);

const router = Router();

// Every workspace endpoint reads a per-user (optionally per-project) sandbox
// directory, so the entire router requires an authenticated user. Each user
// only ever sees files under their own sandbox root — never the shared server
// filesystem.
router.use(apiKeyAuth);

const DEFAULT_SEARCH_EXTENSIONS = ["ts", "tsx", "js", "jsx", "py", "go", "rs"];

/**
 * Resolve the caller's sandbox root for the current request. Sends an error
 * response and returns null if the user is missing or the project id is unsafe.
 */
async function getSandbox(
  req: AuthenticatedRequest,
  res: Response,
  projectId?: string
): Promise<string | null> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return null;
  }
  const root = await resolveSandboxRoot(userId, projectId);
  if (!root) {
    res.status(400).json({ success: false, error: "Invalid project identifier" });
    return null;
  }
  return root;
}

function readProjectId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// GET /workspace/files — list files in the caller's sandbox (max 10000)
router.get("/files", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const root = await getSandbox(req, res, readProjectId(req.query.projectId));
    if (!root) return;

    const { files, truncated } = await walkFiles(root);
    res.json({ success: true, data: { files, count: files.length, truncated } });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to list files",
    });
  }
});

// GET /workspace/summary — file count, language breakdown, largest files
router.get("/summary", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const root = await getSandbox(req, res, readProjectId(req.query.projectId));
    if (!root) return;

    const { files, truncated } = await walkFiles(root);

    const languages: Record<string, number> = {};
    let totalLines = 0;
    const sizes: Array<{ file: string; size: number }> = [];

    for (const rel of files) {
      const ext = path.extname(rel).slice(1).toLowerCase();
      if (ext) languages[ext] = (languages[ext] ?? 0) + 1;

      const abs = path.join(root, rel);
      try {
        const stat = await fs.stat(abs);
        sizes.push({ file: rel, size: stat.size });
        if (stat.size <= 2 * 1024 * 1024) {
          const content = await fs.readFile(abs, "utf8");
          totalLines += content.length === 0 ? 0 : content.split("\n").length;
        }
      } catch {
        // Skip unreadable files.
      }
    }

    const largestFiles = sizes
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map((s) => s.file);

    res.json({
      success: true,
      data: {
        fileCount: files.length,
        languages,
        totalLines,
        largestFiles,
        truncated,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Failed to summarize workspace",
    });
  }
});

// POST /workspace/search — search file contents within the caller's sandbox
router.post("/search", async (req: AuthenticatedRequest, res: Response) => {
  const { query, filePattern, projectId } = req.body as {
    query?: string;
    filePattern?: string;
    projectId?: string;
  };

  if (!query || typeof query !== "string" || query.length < 1) {
    return res.status(400).json({ success: false, error: "query is required" });
  }
  if (query.length > 512) {
    return res.status(400).json({ success: false, error: "query is too long" });
  }

  try {
    const root = await getSandbox(req, res, readProjectId(projectId));
    if (!root) return;

    // filePattern is accepted as a comma/brace list of extensions (e.g.
    // "ts,tsx" or "*.{ts,py}"); we extract bare extensions and match in-process.
    const extensions =
      typeof filePattern === "string" && filePattern.trim().length > 0
        ? Array.from(filePattern.matchAll(/[A-Za-z0-9]+/g)).map((m) => m[0])
        : DEFAULT_SEARCH_EXTENSIONS;

    const { files, count, truncated } = await searchContents(root, query, extensions);
    res.json({ success: true, data: { query, files, count, truncated } });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Search failed",
    });
  }
});

// GET /workspace/git-status — git status --porcelain within the sandbox
router.get("/git-status", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const root = await getSandbox(req, res, readProjectId(req.query.projectId));
    if (!root) return;

    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain"],
      { cwd: root }
    ).catch(() => ({ stdout: "" }));

    const lines = stdout.trim().split("\n").filter(Boolean);
    const changes = lines.map((l) => ({
      status: l.slice(0, 2).trim(),
      file: l.slice(3),
    }));
    res.json({ success: true, data: { changes, count: changes.length } });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "git status failed",
    });
  }
});

// GET /workspace/recent-changes — git log --oneline -20 within the sandbox
router.get("/recent-changes", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const root = await getSandbox(req, res, readProjectId(req.query.projectId));
    if (!root) return;

    const { stdout } = await execFileAsync(
      "git",
      ["log", "--oneline", "-20", "--no-color"],
      { cwd: root }
    ).catch(() => ({ stdout: "" }));

    const commits = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const spaceIdx = l.indexOf(" ");
        return { hash: l.slice(0, spaceIdx), message: l.slice(spaceIdx + 1) };
      });
    res.json({ success: true, data: { commits } });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "git log failed",
    });
  }
});

export default router;
