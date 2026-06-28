import { Router, Request, Response } from "express";
import { execFile, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { apiKeyAuth } from "../middleware/auth.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const router = Router();

// Every workspace endpoint reads the server filesystem (file listings, file
// contents, git status) and some shell out to the OS, so the entire router
// requires an authenticated user — matching the sibling /beads router.
router.use(apiKeyAuth);

const WORKSPACE = process.env.WORKSPACE_PATH || process.cwd();

function safeWorkspacePath(rel: string): string | null {
  const resolved = path.resolve(WORKSPACE, rel);
  if (!resolved.startsWith(path.resolve(WORKSPACE))) return null;
  return resolved;
}

// GET /workspace/files — list files recursively (max 10000)
router.get("/files", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync(
      `find "${WORKSPACE}" -type f ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/.next/*" | head -10000`,
      { cwd: WORKSPACE }
    );
    const files = stdout.trim().split("\n").filter(Boolean).map(f => f.replace(WORKSPACE + "/", ""));
    res.json({ success: true, data: { files, count: files.length } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to list files" });
  }
});

// GET /workspace/summary — file count, language breakdown, largest files
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const { stdout: filesOut } = await execAsync(
      `find "${WORKSPACE}" -type f ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/.next/*"`,
      { cwd: WORKSPACE }
    );
    const files = filesOut.trim().split("\n").filter(Boolean);

    const languages: Record<string, number> = {};
    for (const f of files) {
      const ext = path.extname(f).slice(1).toLowerCase();
      if (ext) languages[ext] = (languages[ext] ?? 0) + 1;
    }

    const { stdout: linesOut } = await execAsync(
      `find "${WORKSPACE}" -type f ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" ! -path "*/.next/*" -exec wc -l {} + 2>/dev/null | tail -1`,
      { cwd: WORKSPACE }
    ).catch(() => ({ stdout: "0" }));
    const totalLines = parseInt(linesOut.trim().split(/\s+/)[0] ?? "0", 10);

    const { stdout: largeOut } = await execAsync(
      `find "${WORKSPACE}" -type f ! -path "*/node_modules/*" ! -path "*/.git/*" -exec du -k {} + | sort -rn | head -10`,
      { cwd: WORKSPACE }
    ).catch(() => ({ stdout: "" }));
    const largestFiles = largeOut.trim().split("\n").filter(Boolean).map(l => l.split("\t")[1]?.replace(WORKSPACE + "/", "") ?? "");

    res.json({
      success: true,
      data: {
        fileCount: files.length,
        languages,
        totalLines,
        largestFiles,
        workspacePath: WORKSPACE,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Failed to summarize workspace" });
  }
});

// POST /workspace/search — search file contents
router.post("/search", async (req: Request, res: Response) => {
  const { query, filePattern } = req.body as { query?: string; filePattern?: string };
  if (!query || typeof query !== "string" || query.length < 1) {
    return res.status(400).json({ success: false, error: "query is required" });
  }

  const pattern = filePattern && /^[a-zA-Z0-9.*_\-/]+$/.test(filePattern) ? filePattern : "*.{ts,tsx,js,jsx,py,go,rs}";
  const safeQuery = query.replace(/['"\\`$]/g, "");

  try {
    const { stdout } = await execAsync(
      `grep -r --include="${pattern}" -n -l "${safeQuery}" "${WORKSPACE}" 2>/dev/null | head -50`,
      { cwd: WORKSPACE }
    ).catch(() => ({ stdout: "" }));

    const files = stdout.trim().split("\n").filter(Boolean).map(f => f.replace(WORKSPACE + "/", ""));
    res.json({ success: true, data: { query, files, count: files.length } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Search failed" });
  }
});

// GET /workspace/git-status — git status --porcelain
router.get("/git-status", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync("git status --porcelain", { cwd: WORKSPACE });
    const lines = stdout.trim().split("\n").filter(Boolean);
    const changes = lines.map(l => ({
      status: l.slice(0, 2).trim(),
      file: l.slice(3),
    }));
    res.json({ success: true, data: { changes, count: changes.length } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "git status failed" });
  }
});

// GET /workspace/recent-changes — git log --oneline -20
router.get("/recent-changes", async (_req: Request, res: Response) => {
  try {
    const { stdout } = await execAsync("git log --oneline -20 --no-color", { cwd: WORKSPACE });
    const commits = stdout.trim().split("\n").filter(Boolean).map(l => {
      const spaceIdx = l.indexOf(" ");
      return { hash: l.slice(0, spaceIdx), message: l.slice(spaceIdx + 1) };
    });
    res.json({ success: true, data: { commits } });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "git log failed" });
  }
});

export default router;
