/**
 * Conflict Service (bundled `aitm serve`)
 *
 * Powers `aitm conflicts list|show|resolve|auto`. In the bundled, single-machine
 * server a "sync conflict" is a file whose current working-tree content has
 * diverged from its content at the most recent checkpoint — i.e. a local change
 * that would be lost (or has to be reconciled) on the next restore/sync.
 *
 * - "local"  = current working-tree content
 * - "remote" = content captured in the latest checkpoint
 *
 * A conflict is "overlapping" when both differ AND the file also changed in the
 * previous checkpoint relative to the latest one (i.e. a 3-way conflict where a
 * naive take-one-side would drop real work). Non-overlapping conflicts are
 * safely auto-resolvable by keeping the local edit.
 *
 * Resolution applies the chosen content to the working tree and records a
 * checkpoint so the reconciliation is itself restorable.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TimeMachineEngine } from '../core/engine.js';

export interface ConflictFile {
  path: string;
  localHash?: string;
  remoteHash?: string;
  overlapping?: boolean;
}

export interface ConflictSummary {
  id: string;
  checkpointId: string;
  device: string;
  files: ConflictFile[];
  createdAt?: string;
}

export interface ConflictDiffSide {
  device: string;
  content: string;
  hash?: string;
  updatedAt?: string;
}

export interface ConflictDetail {
  id: string;
  checkpointId: string;
  files: Array<{
    path: string;
    local: ConflictDiffSide;
    remote: ConflictDiffSide;
    overlapping?: boolean;
  }>;
}

export interface ResolveResult {
  id: string;
  strategy: string;
  resolvedFiles: number;
}

export interface AutoResult {
  resolved: string[];
  skipped: Array<{ id: string; reason: string }>;
}

const DEVICE = `local:${path.basename(process.cwd())}`;

/** Deterministic conflict id derived from the file path, so list/show/resolve agree. */
function conflictId(filePath: string): string {
  return `cf_${Buffer.from(filePath).toString('hex').slice(0, 16)}`;
}

function readWorkingFile(root: string, rel: string): string | null {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf-8');
  } catch {
    return null;
  }
}

interface DetectedConflict {
  file: string;
  localContent: string | null;
  remoteContent: string | null;
  localHash: string;
  remoteHash: string;
  overlapping: boolean;
}

/**
 * Detect conflicts between the working tree and the latest checkpoint, using the
 * previous checkpoint as the merge base to classify overlap.
 */
function detect(engine: TimeMachineEngine): DetectedConflict[] {
  const root = engine.getProjectPath();
  const tps = engine.listTimePoints();
  if (tps.length === 0) return [];

  const latest = engine.getTimePoint(tps[tps.length - 1].id);
  if (!latest) return [];

  const base =
    tps.length > 1 ? engine.getTimePoint(tps[tps.length - 2].id) : null;
  const baseHashes = new Map((base?.files ?? []).map((f) => [f.path, f.hash]));

  const conflicts: DetectedConflict[] = [];

  for (const file of latest.files) {
    const localContent = readWorkingFile(root, file.path);
    if (localContent === null) continue; // file removed locally — not a content conflict
    const localHash = engine.hashContent(localContent);
    if (localHash === file.hash) continue; // unchanged — no conflict

    const remoteContent = engine.getFileContent(latest.id, file.path);
    const baseHash = baseHashes.get(file.path);
    // Overlapping: the file also changed between base->latest (3-way divergence).
    const overlapping = baseHash !== undefined && baseHash !== file.hash;

    conflicts.push({
      file: file.path,
      localContent,
      remoteContent,
      localHash,
      remoteHash: file.hash,
      overlapping,
    });
  }

  return conflicts;
}

export function listConflicts(engine: TimeMachineEngine): ConflictSummary[] {
  const tps = engine.listTimePoints();
  const latestId = tps.length > 0 ? tps[tps.length - 1].id : '';
  const detected = detect(engine);
  // One conflict summary per file keeps ids stable and granular for resolution.
  return detected.map((c) => ({
    id: conflictId(c.file),
    checkpointId: latestId,
    device: DEVICE,
    createdAt: new Date().toISOString(),
    files: [
      {
        path: c.file,
        localHash: c.localHash,
        remoteHash: c.remoteHash,
        overlapping: c.overlapping,
      },
    ],
  }));
}

export function showConflict(
  engine: TimeMachineEngine,
  id: string,
): ConflictDetail | null {
  const tps = engine.listTimePoints();
  const latestId = tps.length > 0 ? tps[tps.length - 1].id : '';
  const match = detect(engine).find((c) => conflictId(c.file) === id);
  if (!match) return null;

  return {
    id,
    checkpointId: latestId,
    files: [
      {
        path: match.file,
        overlapping: match.overlapping,
        local: { device: DEVICE, content: match.localContent ?? '', hash: match.localHash },
        remote: { device: 'checkpoint', content: match.remoteContent ?? '', hash: match.remoteHash },
      },
    ],
  };
}

/** Apply a resolution to the working tree and record a reconciliation checkpoint. */
export function resolveConflict(
  engine: TimeMachineEngine,
  id: string,
  strategy: 'local' | 'remote' | 'manual',
  manualFiles?: Array<{ path: string; content: string }>,
): ResolveResult {
  const root = engine.getProjectPath();
  const match = detect(engine).find((c) => conflictId(c.file) === id);
  if (!match) {
    throw new Error(`Conflict ${id} not found (it may already be resolved)`);
  }

  let resolvedFiles = 0;

  if (strategy === 'manual') {
    for (const f of manualFiles ?? []) {
      fs.mkdirSync(path.dirname(path.join(root, f.path)), { recursive: true });
      fs.writeFileSync(path.join(root, f.path), f.content);
      resolvedFiles += 1;
    }
  } else {
    const content = strategy === 'local' ? match.localContent : match.remoteContent;
    if (content !== null && content !== undefined) {
      fs.mkdirSync(path.dirname(path.join(root, match.file)), { recursive: true });
      fs.writeFileSync(path.join(root, match.file), content);
      resolvedFiles = 1;
    }
  }

  engine.capture(`Resolved conflict in ${match.file} (${strategy})`, { type: 'manual' });

  return { id, strategy, resolvedFiles };
}

/** Auto-resolve all non-overlapping conflicts by keeping the local edit. */
export function autoResolve(engine: TimeMachineEngine, dryRun: boolean): AutoResult {
  const detected = detect(engine);
  const resolved: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const c of detected) {
    const id = conflictId(c.file);
    if (c.overlapping) {
      skipped.push({ id, reason: 'overlapping — needs manual merge' });
      continue;
    }
    if (!dryRun) {
      resolveConflict(engine, id, 'local');
    }
    resolved.push(id);
  }

  return { resolved, skipped };
}
