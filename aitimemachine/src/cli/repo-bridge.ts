/**
 * Bridge between CLI commands and the global SqliteRepo + CasStore.
 *
 * The CLI historically used TimeMachineEngine (file-based, per-project).
 * The MCP server uses SqliteRepo (SQLite-backed) + CasStore (content-addressable).
 * This bridge lets CLI commands access MCP checkpoints too.
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import type { SqliteRepo } from "../store/sqlite_repo.js";
import type { CasStore } from "../core/cas.js";

let _repo: SqliteRepo | null = null;
let _cas: CasStore | null = null;

/**
 * Get the global data directory (~/.aitimemachine).
 */
export function getGlobalDataDir(): string {
  return path.join(os.homedir(), ".aitimemachine");
}

/**
 * Get or create the global SqliteRepo instance.
 * Returns null if the database doesn't exist yet (user hasn't run MCP).
 */
export async function getGlobalRepo(): Promise<SqliteRepo | null> {
  if (_repo) return _repo;

  const dataDir = getGlobalDataDir();
  const dbPath = path.join(dataDir, "db.sqlite");

  if (!fs.existsSync(dbPath)) {
    return null;
  }

  try {
    const { SqliteRepo } = await import("../store/sqlite_repo.js");
    _repo = new SqliteRepo(dbPath);
    return _repo;
  } catch {
    return null;
  }
}

/**
 * Get or create the global CasStore instance.
 */
export async function getGlobalCas(): Promise<CasStore | null> {
  if (_cas) return _cas;

  const dataDir = getGlobalDataDir();
  const blobsDir = path.join(dataDir, "blobs");

  if (!fs.existsSync(blobsDir)) {
    return null;
  }

  try {
    const { CasStore } = await import("../core/cas.js");
    _cas = new CasStore(blobsDir);
    return _cas;
  } catch {
    return null;
  }
}

/**
 * Derive a project ID from a project path (same hash the MCP uses).
 */
export function projectIdFromPath(projectPath: string): string {
  return crypto.createHash("sha256").update(projectPath).digest("hex").slice(0, 16);
}

/**
 * Find the project ID for the current working directory.
 * Checks both exact match and parent directories.
 */
export async function findProjectId(projectPath: string): Promise<string | null> {
  const repo = await getGlobalRepo();
  if (!repo) return null;

  // Try exact match first
  const exactId = projectIdFromPath(projectPath);
  const project = repo.getProject(exactId);
  if (project) return exactId;

  // Try listing all projects and finding one whose rootPath matches
  const projects = repo.listProjects();
  for (const p of projects) {
    if (p.rootPath === projectPath) return p.projectId;
    // Check if cwd is inside a registered project
    if (projectPath.startsWith(p.rootPath + path.sep)) return p.projectId;
  }

  return null;
}

/**
 * Unified checkpoint entry that can come from either store.
 */
export interface UnifiedCheckpoint {
  id: string;
  name: string;
  createdAt: string;
  source: "local" | "mcp";
  scope?: string;
  linkedCheckpointId?: string | null;
  manifestBlobHash?: string;
}

/**
 * List checkpoints from both local TimeMachineEngine and global SqliteRepo,
 * merged and sorted newest-first.
 */
export async function listUnifiedCheckpoints(
  projectPath: string,
  limit: number = 50
): Promise<UnifiedCheckpoint[]> {
  const results: UnifiedCheckpoint[] = [];

  // Get local checkpoints from TimeMachineEngine
  try {
    const { TimeMachineEngine } = await import("../core/engine.js");
    const engine = new TimeMachineEngine(projectPath);
    const localTps = engine.listTimePoints();
    for (const tp of localTps) {
      results.push({
        id: tp.id,
        name: tp.description,
        createdAt: tp.timestamp instanceof Date ? tp.timestamp.toISOString() : String(tp.timestamp),
        source: "local",
      });
    }
  } catch {
    // No local engine data
  }

  // Get MCP checkpoints from SqliteRepo
  const repo = await getGlobalRepo();
  if (repo) {
    const projectId = await findProjectId(projectPath);
    if (projectId) {
      const mcpCheckpoints = repo.listCheckpointsNewestFirst(projectId, limit);
      for (const cp of mcpCheckpoints) {
        // Avoid duplicates (same ID)
        if (!results.some(r => r.id === cp.checkpointId)) {
          results.push({
            id: cp.checkpointId,
            name: cp.name,
            createdAt: cp.createdAt,
            source: "mcp",
            scope: cp.scope,
            linkedCheckpointId: cp.linkedCheckpointId,
            manifestBlobHash: cp.manifestBlobHash,
          });
        }
      }
    }
  }

  // Sort newest first
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return results.slice(0, limit);
}

/**
 * Find a checkpoint by ID, description, or natural language query.
 * Searches both local and MCP stores.
 */
export async function findCheckpoint(
  projectPath: string,
  query: string
): Promise<UnifiedCheckpoint | null> {
  const all = await listUnifiedCheckpoints(projectPath, 200);

  // Exact ID match
  const byId = all.find(c => c.id === query);
  if (byId) return byId;

  // Partial ID match
  const byPartialId = all.find(c => c.id.startsWith(query));
  if (byPartialId) return byPartialId;

  // Try natural language via SqliteRepo
  const repo = await getGlobalRepo();
  if (repo) {
    const projectId = await findProjectId(projectPath);
    if (projectId) {
      try {
        const { parseAdvancedQuery, findCheckpointForAdvancedQuery } = await import("./natural-language.js");
        const parsed = parseAdvancedQuery(query);
        const results = findCheckpointForAdvancedQuery(repo, projectId, parsed, 1);
        if (results.length > 0) {
          const cp = results[0].checkpoint;
          return {
            id: cp.checkpointId,
            name: cp.name,
            createdAt: cp.createdAt,
            source: "mcp",
            scope: cp.scope,
            linkedCheckpointId: cp.linkedCheckpointId,
            manifestBlobHash: cp.manifestBlobHash,
          };
        }
      } catch {
        // Natural language module not available
      }
    }
  }

  // Description fuzzy match on all checkpoints
  const queryLower = query.toLowerCase();
  const scored = all.map(c => {
    let score = 0;
    const nameLower = c.name.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    for (const word of queryWords) {
      if (word.length > 2 && nameLower.includes(word)) score += 10;
    }
    if (nameLower.includes(queryLower)) score += 20;
    return { ...c, score };
  });

  const best = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score)[0];
  return best || null;
}
