/**
 * Per-user / per-project workspace sandbox helpers.
 *
 * Workspace introspection must be multi-tenant: each authenticated user only
 * ever sees files under their own sandbox root, never the shared server
 * filesystem. The sandbox root is:
 *
 *   <WORKSPACE_ROOT>/<userId>[/<projectId>]
 *
 * where WORKSPACE_ROOT defaults to a `workspaces` directory under the OS temp
 * dir (overridable via WORKSPACE_ROOT). All path resolution is confined to the
 * sandbox via realpath containment checks, and file walking / content search is
 * performed in-process with `fs` rather than shelling out, so no user input is
 * ever interpolated into a shell command.
 */

import path from "path";
import os from "os";
import fs from "fs/promises";

const WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT || path.join(os.tmpdir(), "aitm-workspaces");

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".turbo"]);
const MAX_FILES = 10000;
const MAX_SEARCH_MATCHES = 50;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // skip files larger than 2MB when searching

/** Validate a user/project id segment so it cannot escape the sandbox root. */
function isSafeSegment(segment: string): boolean {
  return /^[A-Za-z0-9_.\-]+$/.test(segment) && segment !== "." && segment !== "..";
}

/**
 * Resolve (and create) the sandbox root for a user, optionally scoped to a
 * project. Returns null if any id segment is unsafe.
 */
export async function resolveSandboxRoot(
  userId: string,
  projectId?: string
): Promise<string | null> {
  if (!isSafeSegment(userId)) {
    return null;
  }
  if (projectId !== undefined && !isSafeSegment(projectId)) {
    return null;
  }

  const root = projectId
    ? path.join(WORKSPACE_ROOT, userId, projectId)
    : path.join(WORKSPACE_ROOT, userId);

  await fs.mkdir(root, { recursive: true });
  return root;
}

/**
 * Resolve a relative path within the sandbox, guaranteeing the result stays
 * inside `root`. Returns null on any traversal attempt.
 */
export function resolveWithin(root: string, rel: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, rel);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return resolved;
}

export interface WalkResult {
  files: string[];
  truncated: boolean;
}

/** Recursively list files under the sandbox root, skipping ignored dirs. */
export async function walkFiles(root: string): Promise<WalkResult> {
  const files: string[] = [];
  let truncated = false;

  async function visit(dir: string): Promise<void> {
    if (files.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await visit(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        files.push(path.relative(root, path.join(dir, entry.name)));
      }
    }
  }

  await visit(root);
  return { files, truncated };
}

export interface SearchResult {
  files: string[];
  count: number;
  truncated: boolean;
}

/**
 * Search file contents for a literal substring (case-sensitive), restricted to
 * files whose extension matches `extensions` (if provided). Performed entirely
 * in-process — the query is never passed to a shell.
 */
export async function searchContents(
  root: string,
  query: string,
  extensions: string[] | null
): Promise<SearchResult> {
  const { files } = await walkFiles(root);
  const matches: string[] = [];
  let truncated = false;

  const extSet =
    extensions && extensions.length > 0
      ? new Set(extensions.map((e) => e.toLowerCase().replace(/^\./, "")))
      : null;

  for (const rel of files) {
    if (matches.length >= MAX_SEARCH_MATCHES) {
      truncated = true;
      break;
    }
    if (extSet) {
      const ext = path.extname(rel).slice(1).toLowerCase();
      if (!extSet.has(ext)) continue;
    }
    const abs = path.join(root, rel);
    try {
      const stat = await fs.stat(abs);
      if (stat.size > MAX_FILE_BYTES) continue;
      const content = await fs.readFile(abs, "utf8");
      if (content.includes(query)) {
        matches.push(rel);
      }
    } catch {
      // Unreadable / binary file — skip.
    }
  }

  return { files: matches, count: matches.length, truncated };
}

export { WORKSPACE_ROOT, IGNORED_DIRS };
