import fs from "node:fs";
import path from "node:path";
import { CasStore } from "./cas.js";
import { Manifest } from "./manifest.js";
import { getSmart, isChunkedRef, type FileRef } from "./chunked.js";
import { RestoreError } from "../errors.js";

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFileAtomic(targetAbs: string, data: Buffer) {
  ensureDir(path.dirname(targetAbs));
  const tmp = targetAbs + ".tm_tmp_write";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, targetAbs);
}

function copyDir(src: string, dst: string) {
  ensureDir(dst);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
}

/**
 * Validate manifest and check for missing artifacts
 */
export function validateManifest(params: {
  cas: CasStore;
  manifest: Manifest;
}): { valid: boolean; missing: string[]; partial: boolean } {
  const { cas, manifest } = params;
  const missing: string[] = [];

  for (const f of manifest.files) {
    try {
      if (!cas.has(f.hash)) {
        missing.push(f.path);
      }
    } catch {
      missing.push(f.path);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    partial: missing.length > 0 && missing.length < manifest.files.length,
  };
}

/**
 * Options for restore operations
 */
export interface RestoreOptions {
  /** 'safe' preserves untracked files, 'hard' removes them */
  mode: "safe" | "hard";
  /** Create backup before restore */
  backupCurrent: boolean;
  /** Skip missing files instead of failing */
  skipMissing?: boolean;
  /** Callback for progress reporting */
  onProgress?: (progress: RestoreProgress) => void;
  /** Validate artifacts before restore */
  validate?: boolean;
}

export interface RestoreProgress {
  phase: "validate" | "backup" | "restore" | "cleanup";
  current: number;
  total: number;
  file?: string;
}

export interface RestoreResult {
  filesWritten: number;
  filesSkipped: number;
  backupPath?: string;
  missingFiles: string[];
  warnings: string[];
}

export interface RestoreRetryAttempt {
  attempt: number;
  phase: RestoreProgress["phase"];
  message: string;
  code?: string;
  retryable: boolean;
  timestamp: string;
}

export interface RestoreWithRetryResult extends RestoreResult {
  attempts: number;
}

export interface ResumeRestoreResult {
  timestamp: string;
  restoredEntries: number;
  replacedEntries: number;
  tmpRestorePath: string;
  tmpOldPath?: string;
  warnings: string[];
}

export interface RestoreDiagnosticsPayload {
  recordedAt: string;
  attempts: RestoreRetryAttempt[];
  mode: "safe" | "hard";
  backupCurrent: boolean;
  skipMissing: boolean;
  suggestedNextCommand: string;
}

function getErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isRetryableRestoreError(err: unknown): boolean {
  const code = getErrorCode(err);
  if (!code) return false;
  return ["EBUSY", "EMFILE", "ENFILE", "EIO", "ETXTBSY"].includes(code);
}

/**
 * Sleep for the given number of milliseconds (synchronous, blocking).
 * Used for backoff between retry attempts.
 */
function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait; acceptable for short backoff delays in a CLI tool
  }
}

/**
 * Calculate exponential backoff delay in ms for a given attempt (1-indexed).
 * Formula: baseMs * 2^(attempt-1), capped at maxMs.
 */
export function computeBackoffMs(attempt: number, baseMs = 100, maxMs = 5000): number {
  const delay = baseMs * Math.pow(2, attempt - 1);
  return Math.min(delay, maxMs);
}

function writeRestoreDiagnostics(params: {
  projectRoot: string;
  attempts: RestoreRetryAttempt[];
  mode: "safe" | "hard";
  backupCurrent: boolean;
  skipMissing: boolean;
}): string {
  const { projectRoot, attempts, mode, backupCurrent, skipMissing } = params;
  const diagnosticsDir = path.join(projectRoot, ".tm_internal", "restore-diagnostics");
  ensureDir(diagnosticsDir);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  const diagnosticsPath = path.join(diagnosticsDir, `restore-failure-${ts}-${suffix}.json`);
  const payload = {
    recordedAt: new Date().toISOString(),
    attempts,
    mode,
    backupCurrent,
    skipMissing,
    suggestedNextCommand: "aitm restore-resume",
  };
  fs.writeFileSync(diagnosticsPath, JSON.stringify(payload, null, 2), "utf8");
  return diagnosticsPath;
}

export function restoreWorkspaceWithRetry(params: {
  projectRoot: string;
  cas: CasStore;
  manifest: Manifest;
  mode: "safe" | "hard";
  backupCurrent: boolean;
  skipMissing?: boolean;
  onProgress?: (progress: RestoreProgress) => void;
  maxAttempts?: number;
}): RestoreWithRetryResult {
  const maxAttempts = Math.max(1, params.maxAttempts ?? 1);
  const attempts: RestoreRetryAttempt[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let lastPhase: RestoreProgress["phase"] = "validate";
    try {
      const result = restoreWorkspaceAtomic({
        projectRoot: params.projectRoot,
        cas: params.cas,
        manifest: params.manifest,
        mode: params.mode,
        backupCurrent: params.backupCurrent,
        skipMissing: params.skipMissing,
        onProgress: (progress) => {
          lastPhase = progress.phase;
          params.onProgress?.(progress);
        },
      });
      return { ...result, attempts: attempt };
    } catch (err) {
      const retryable = isRetryableRestoreError(err);
      attempts.push({
        attempt,
        phase: lastPhase,
        message: err instanceof Error ? err.message : String(err),
        code: getErrorCode(err),
        retryable,
        timestamp: new Date().toISOString(),
      });

      if (attempt < maxAttempts && retryable) {
        const backoffMs = computeBackoffMs(attempt);
        sleepSync(backoffMs);
        continue;
      }

      const diagnosticsPath = writeRestoreDiagnostics({
        projectRoot: params.projectRoot,
        attempts,
        mode: params.mode,
        backupCurrent: params.backupCurrent,
        skipMissing: params.skipMissing ?? false,
      });
      throw new RestoreError(
        `Restore failed after ${attempt} attempt(s). Run 'aitm restore-resume'. Diagnostics: ${diagnosticsPath}`,
        `Restore could not be completed. Diagnostics: ${diagnosticsPath}. ` +
          `You can attempt recovery with 'aitm restore-resume'.`
      );
    }
  }

  throw new RestoreError(
    "Restore failed",
    "Restore could not be completed after retry processing."
  );
}

export function resumeRestoreFromLatestTmp(params: {
  projectRoot: string;
}): ResumeRestoreResult {
  const { projectRoot } = params;
  const metaDir = path.join(projectRoot, ".tm_internal");
  const tmpRestoreRoot = path.join(metaDir, "tmp_restore");
  const tmpOldRoot = path.join(metaDir, "tmp_old");

  if (!fs.existsSync(tmpRestoreRoot)) {
    throw new RestoreError(
      "No interrupted restore found",
      `No restore staging directory found at ${tmpRestoreRoot}.`
    );
  }

  const candidates = fs
    .readdirSync(tmpRestoreRoot, { withFileTypes: true })
    .filter((ent) => ent.isDirectory())
    .map((ent) => ent.name)
    .sort();

  if (candidates.length === 0) {
    throw new RestoreError(
      "No interrupted restore found",
      "No staged restore snapshot available to resume."
    );
  }

  const timestamp = candidates[candidates.length - 1];
  const tmpRestorePath = path.join(tmpRestoreRoot, timestamp);
  const tmpOldPath = path.join(tmpOldRoot, timestamp);
  const warnings: string[] = [];

  // Validate the tmp directory is readable and not corrupted
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(tmpRestorePath, { withFileTypes: true });
  } catch (err) {
    throw new RestoreError(
      `Corrupted restore staging directory: ${tmpRestorePath}`,
      `Cannot read restore staging directory at ${tmpRestorePath}: ${(err as Error).message}. ` +
      `The staging data may be corrupted. You may need to manually inspect or remove ${tmpRestorePath}.`
    );
  }

  if (entries.length === 0) {
    // Empty staging directory -- nothing to resume
    try {
      fs.rmSync(tmpRestorePath, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
    throw new RestoreError(
      "Empty restore staging directory",
      `The restore staging directory at ${tmpRestorePath} is empty. ` +
      `There is nothing to resume. The interrupted restore may have been partially cleaned up.`
    );
  }

  let restoredEntries = 0;
  let replacedEntries = 0;

  for (const ent of entries) {
    const s = path.join(tmpRestorePath, ent.name);
    const d = path.join(projectRoot, ent.name);

    if (fs.existsSync(d)) {
      replacedEntries++;
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch (err) {
        warnings.push(`Failed to remove existing path before resume: ${d}: ${(err as Error).message}`);
      }
    }

    try {
      fs.renameSync(s, d);
      restoredEntries++;
    } catch (err) {
      warnings.push(`Failed to move entry ${ent.name}: ${(err as Error).message}`);
    }
  }

  try {
    fs.rmSync(tmpRestorePath, { recursive: true, force: true });
  } catch (err) {
    warnings.push(`Failed to clean restore staging path: ${(err as Error).message}`);
  }

  return {
    timestamp,
    restoredEntries,
    replacedEntries,
    tmpRestorePath,
    tmpOldPath: fs.existsSync(tmpOldPath) ? tmpOldPath : undefined,
    warnings,
  };
}

/**
 * Read and return all restore diagnostics files for a project, sorted newest first.
 */
export function listRestoreDiagnostics(params: {
  projectRoot: string;
}): Array<{ filename: string; payload: RestoreDiagnosticsPayload }> {
  const diagnosticsDir = path.join(params.projectRoot, ".tm_internal", "restore-diagnostics");
  if (!fs.existsSync(diagnosticsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(diagnosticsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse(); // newest first

  const results: Array<{ filename: string; payload: RestoreDiagnosticsPayload }> = [];
  for (const filename of files) {
    try {
      const raw = fs.readFileSync(path.join(diagnosticsDir, filename), "utf8");
      const payload = JSON.parse(raw) as RestoreDiagnosticsPayload;
      results.push({ filename, payload });
    } catch {
      // skip unreadable/corrupt files
    }
  }
  return results;
}

/**
 * Get the latest restore diagnostics summary. Returns null if no diagnostics exist.
 */
export function getRestoreDiagnosticsSummary(params: {
  projectRoot: string;
}): {
  latestFile: string;
  recordedAt: string;
  totalAttempts: number;
  lastPhase: string;
  lastErrorCode?: string;
  lastErrorMessage: string;
  mode: "safe" | "hard";
  suggestedNextCommand: string;
  allDiagnosticsCount: number;
} | null {
  const all = listRestoreDiagnostics(params);
  if (all.length === 0) return null;

  const latest = all[0];
  const lastAttempt = latest.payload.attempts[latest.payload.attempts.length - 1];

  return {
    latestFile: latest.filename,
    recordedAt: latest.payload.recordedAt,
    totalAttempts: latest.payload.attempts.length,
    lastPhase: lastAttempt?.phase ?? "unknown",
    lastErrorCode: lastAttempt?.code,
    lastErrorMessage: lastAttempt?.message ?? "unknown",
    mode: latest.payload.mode,
    suggestedNextCommand: latest.payload.suggestedNextCommand,
    allDiagnosticsCount: all.length,
  };
}

// Build restore tree in temp dir, then swap.
// On Windows, rename over existing directories is tricky; safest is:
// - move current root to backup dir (same volume)
// - move temp restore into root
export function restoreWorkspaceAtomic(params: {
  projectRoot: string;
  cas: CasStore;
  manifest: Manifest;
  mode: "safe" | "hard";
  backupCurrent: boolean;
  skipMissing?: boolean;
  onProgress?: (progress: RestoreProgress) => void;
}): RestoreResult {
  const { 
    projectRoot, 
    cas, 
    manifest, 
    mode, 
    backupCurrent, 
    skipMissing = false,
    onProgress 
  } = params;

  const warnings: string[] = [];
  const missingFiles: string[] = [];
  let filesSkipped = 0;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const metaDir = path.join(projectRoot, ".tm_internal");
  const tmpRestore = path.join(metaDir, "tmp_restore", `${ts}`);
  const backups = path.join(metaDir, "backups");
  const tmpOld = path.join(metaDir, "tmp_old", `${ts}`);

  ensureDir(tmpRestore);

  // 1) Validate manifest first
  onProgress?.({ phase: "validate", current: 0, total: manifest.files.length });
  
  const validation = validateManifest({ cas, manifest });
  if (!validation.valid) {
    if (skipMissing) {
      missingFiles.push(...validation.missing);
      warnings.push(`${validation.missing.length} files missing from snapshot, skipping them`);
    } else if (validation.partial) {
      throw new RestoreError(
        `Partial snapshot: ${validation.missing.length}/${manifest.files.length} files missing`,
        `Cannot restore: snapshot is incomplete. ${validation.missing.length} files are missing. ` +
        `Use --skip-missing to restore available files, or choose a different checkpoint.`
      );
    } else {
      throw new RestoreError(
        `Snapshot corrupted: all files missing`,
        `Cannot restore: snapshot data is missing or corrupted. The checkpoint may need to be rebuilt.`
      );
    }
  }

  // 2) materialize into tmpRestore
  onProgress?.({ phase: "restore", current: 0, total: manifest.files.length });
  
  let filesWritten = 0;
  for (let i = 0; i < manifest.files.length; i++) {
    const f = manifest.files[i];
    
    onProgress?.({ phase: "restore", current: i + 1, total: manifest.files.length, file: f.path });
    
    try {
      const data = cas.getBytes(f.hash);
      const outAbs = path.join(tmpRestore, ...f.path.split("/"));
      writeFileAtomic(outAbs, data);
      filesWritten++;
    } catch (err) {
      if (skipMissing) {
        filesSkipped++;
        if (!missingFiles.includes(f.path)) {
          missingFiles.push(f.path);
        }
      } else {
        const wrapped = new RestoreError(
          `Failed to restore file: ${f.path}`,
          `Cannot restore file '${f.path}': ${(err as Error).message}`
        );
        (wrapped as { code?: string }).code = getErrorCode(err);
        throw wrapped;
      }
    }
  }

  // 3) optional: copy over existing extra files if safe mode
  if (mode === "safe") {
    // safe mode: keep current files that are NOT in manifest by copying them into tmpRestore
    // (this preserves new files; safe mode is "non-destructive")
    const expected = new Set(manifest.files.map((x) => x.path));
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name);
        const rel = path.relative(projectRoot, abs).split(path.sep).join("/");
        if (rel.startsWith(".tm_internal/") || rel === ".tm_lock") continue;
        if (ent.isDirectory()) walk(abs);
        else if (ent.isFile()) {
          if (!expected.has(rel)) {
            const dst = path.join(tmpRestore, ...rel.split("/"));
            ensureDir(path.dirname(dst));
            try {
              fs.copyFileSync(abs, dst);
            } catch (err) {
              warnings.push(`Could not preserve untracked file: ${rel}`);
            }
          }
        }
      }
    };
    
    try {
      walk(projectRoot);
    } catch (err) {
      warnings.push(`Error scanning existing files: ${(err as Error).message}`);
    }
  }

  // 4) backup current (optional)
  let backupPath: string | undefined;
  if (backupCurrent) {
    onProgress?.({ phase: "backup", current: 0, total: 1 });
    
    ensureDir(backups);
    backupPath = path.join(backups, `${ts}`);
    ensureDir(backupPath);
    
    try {
      // copy current root excluding internal dir to backupPath
      for (const ent of fs.readdirSync(projectRoot, { withFileTypes: true })) {
        if (ent.name === ".tm_internal" || ent.name === ".tm_lock") continue;
        const s = path.join(projectRoot, ent.name);
        const d = path.join(backupPath, ent.name);
        if (ent.isDirectory()) copyDir(s, d);
        else if (ent.isFile()) fs.copyFileSync(s, d);
      }
    } catch (err) {
      warnings.push(`Backup partially failed: ${(err as Error).message}`);
    }
    
    onProgress?.({ phase: "backup", current: 1, total: 1 });
  }

  // 5) swap
  onProgress?.({ phase: "cleanup", current: 0, total: 2 });
  
  ensureDir(metaDir);
  ensureDir(path.dirname(tmpOld));

  // Move everything (except .tm_internal and .tm_lock) into tmpOld, then move tmpRestore content into root.
  try {
    for (const ent of fs.readdirSync(projectRoot, { withFileTypes: true })) {
      if (ent.name === ".tm_internal" || ent.name === ".tm_lock") continue;
      const s = path.join(projectRoot, ent.name);
      const d = path.join(tmpOld, ent.name);
      ensureDir(tmpOld);
      fs.renameSync(s, d);
    }
  } catch (err) {
    const wrapped = new RestoreError(
      `Failed to move existing files: ${(err as Error).message}`,
      `Cannot complete restore: failed to move existing files. Your project may be in an inconsistent state. ` +
      `Check ${tmpRestore} for the restored files.`
    );
    (wrapped as { code?: string }).code = getErrorCode(err);
    throw wrapped;
  }

  onProgress?.({ phase: "cleanup", current: 1, total: 2 });

  // Move restored contents into root
  try {
    for (const ent of fs.readdirSync(tmpRestore, { withFileTypes: true })) {
      const s = path.join(tmpRestore, ent.name);
      const d = path.join(projectRoot, ent.name);
      fs.renameSync(s, d);
    }
  } catch (err) {
    // Attempt to restore from tmpOld
    warnings.push(`Final swap failed, attempting recovery: ${(err as Error).message}`);
    try {
      for (const ent of fs.readdirSync(tmpOld, { withFileTypes: true })) {
        const s = path.join(tmpOld, ent.name);
        const d = path.join(projectRoot, ent.name);
        if (!fs.existsSync(d)) {
          fs.renameSync(s, d);
        }
      }
    } catch (recoveryErr) {
      const wrapped = new RestoreError(
        `Restore failed and recovery failed: ${(recoveryErr as Error).message}`,
        `CRITICAL: Restore failed and recovery failed. Check ${tmpOld} for original files and ${tmpRestore} for restored files.`
      );
      (wrapped as { code?: string }).code = getErrorCode(recoveryErr);
      throw wrapped;
    }
  }

  onProgress?.({ phase: "cleanup", current: 2, total: 2 });

  // Cleanup tmpRestore dir
  try { fs.rmSync(tmpRestore, { recursive: true, force: true }); } catch {}
  // Keep tmpOld for forensic rollback; a GC job can clean it later.

  return { filesWritten, filesSkipped, backupPath, missingFiles, warnings };
}

/**
 * Materialize a checkpoint to a separate directory (non-destructive).
 * This creates a new folder with the checkpoint contents, leaving the original project untouched.
 * Perfect for browsing past states or diffing.
 */
export function restoreToDirectory(params: {
  cas: CasStore;
  manifest: Manifest;
  targetDir: string;
  /** Optional: include context file with checkpoint info */
  contextContent?: string;
  /** Skip missing files instead of failing */
  skipMissing?: boolean;
}): { filesWritten: number; filesSkipped: number; targetDir: string; missingFiles: string[] } {
  const { cas, manifest, targetDir, contextContent, skipMissing = false } = params;
  const missingFiles: string[] = [];

  // Ensure target directory exists and is empty
  if (fs.existsSync(targetDir)) {
    const contents = fs.readdirSync(targetDir);
    if (contents.length > 0) {
      throw new RestoreError(
        `Target directory is not empty: ${targetDir}`,
        `Cannot restore to ${targetDir}: directory is not empty.`
      );
    }
  } else {
    ensureDir(targetDir);
  }

  // Materialize all files from the manifest
  let filesWritten = 0;
  let filesSkipped = 0;
  
  for (const f of manifest.files) {
    try {
      const data = cas.getBytes(f.hash);
      const outAbs = path.join(targetDir, ...f.path.split("/"));
      writeFileAtomic(outAbs, data);
      filesWritten++;
    } catch (err) {
      if (skipMissing) {
        missingFiles.push(f.path);
        filesSkipped++;
      } else {
        throw new RestoreError(
          `Failed to restore file: ${f.path}`,
          `Cannot restore file '${f.path}': ${(err as Error).message}`
        );
      }
    }
  }

  // Optionally write context file
  if (contextContent) {
    const contextPath = path.join(targetDir, ".aitm", "context.md");
    ensureDir(path.dirname(contextPath));
    fs.writeFileSync(contextPath, contextContent, "utf8");
  }

  return { filesWritten, filesSkipped, targetDir, missingFiles };
}

/**
 * Generate a deterministic folder name for a materialized checkpoint.
 * Format: {projectName}__{date}__{checkpointId}
 */
export function generateMaterializedFolderName(params: {
  projectName: string;
  checkpointId: string;
  timestamp?: string;
}): string {
  const { projectName, checkpointId, timestamp } = params;

  // Sanitize project name for filesystem
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);

  // Use provided timestamp or generate one
  const ts = timestamp || new Date().toISOString();
  const dateStr = ts.split("T")[0]; // YYYY-MM-DD
  const timeStr = ts.split("T")[1]?.slice(0, 5)?.replace(":", "-") || "00-00"; // HH-MM

  // Short checkpoint ID
  const shortCpId = checkpointId.slice(0, 12);

  return `${safeName}__${dateStr}__${timeStr}__${shortCpId}`;
}
