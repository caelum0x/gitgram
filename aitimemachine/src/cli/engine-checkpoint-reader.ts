/**
 * Engine-backed CheckpointReader
 *
 * Adapts the project-local TimeMachineEngine store (`.aitimemachine/`) to the
 * narrow `CheckpointReader` interface that the natural-language parser expects.
 *
 * This is the bridge that makes `aitm ask`, `when`, `what-changed`, `back-to`,
 * `fix`, and `diagnose` operate on the SAME checkpoints created by
 * `aitm checkpoint`, `aitm init`, the watch/daemon auto-checkpoints, and the
 * shipped MCP server — all of which write through TimeMachineEngine. Previously
 * these commands read from a separate SqliteRepo store that nothing in the
 * shipped product populated.
 *
 * Mapping (TimePoint -> CheckpointRow):
 *   id            -> checkpointId
 *   description   -> name
 *   timestamp     -> createdAt (ISO string)
 *   stats.* etc.  -> unused by the parser; manifest/tree fields left empty
 */

import type { TimeMachineEngine } from '../core/engine.js';
import type { CheckpointReader } from './natural-language.js';
import type { CheckpointRow } from '../store/repo.js';

function toIso(timestamp: Date | string): string {
  if (timestamp instanceof Date) return timestamp.toISOString();
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function summaryToRow(
  projectId: string,
  tp: { id: string; description: string; timestamp: Date | string },
): CheckpointRow {
  return {
    checkpointId: tp.id,
    projectId,
    name: tp.description,
    createdAt: toIso(tp.timestamp),
    scope: 'project',
    manifestBlobHash: '',
    rootTreeHash: null,
    chatHeadEventId: null,
    terminalHeadEventId: null,
    linkedCheckpointId: null,
  };
}

/**
 * Read-only adapter exposing the engine's TimePoints as CheckpointRows.
 * The `projectId` is a stable identifier for the current project (its root
 * path) — the engine itself is single-project, so all rows share it.
 */
export class EngineCheckpointReader implements CheckpointReader {
  constructor(
    private readonly engine: TimeMachineEngine,
    private readonly projectId: string,
  ) {}

  listCheckpointsNewestFirst(_projectId: string, limit: number): CheckpointRow[] {
    // Engine lists oldest-first; reverse to newest-first to match SqliteRepo.
    const all = this.engine.listTimePoints();
    const newestFirst = [...all].reverse();
    return newestFirst
      .slice(0, Math.max(0, limit))
      .map((tp) => summaryToRow(this.projectId, tp));
  }

  getCheckpoint(_projectId: string, checkpointId: string): CheckpointRow | null {
    const tp =
      this.engine.getTimePoint(checkpointId) ??
      this.engine
        .listTimePoints()
        .find((t) => t.id === checkpointId || t.id.startsWith(checkpointId)) ??
      null;
    if (!tp) return null;
    return summaryToRow(this.projectId, {
      id: tp.id,
      description: tp.description,
      timestamp: tp.timestamp,
    });
  }

  searchCheckpoints(_projectId: string, query: string): CheckpointRow[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return this.engine
      .listTimePoints()
      .reverse()
      .filter((tp) => tp.description.toLowerCase().includes(q))
      .slice(0, 50)
      .map((tp) => summaryToRow(this.projectId, tp));
  }
}
