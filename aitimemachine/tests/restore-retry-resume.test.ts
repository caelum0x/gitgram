import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { CasStore } from "../src/core/cas.js";
import {
  restoreWorkspaceWithRetry,
  resumeRestoreFromLatestTmp,
  getRestoreDiagnosticsSummary,
  listRestoreDiagnostics,
  computeBackoffMs,
  type RestoreProgress,
  type RestoreDiagnosticsPayload,
} from "../src/core/restore.js";
import type { Manifest } from "../src/core/manifest.js";

function putManifest(cas: CasStore, files: Array<{ path: string; content: string }>): Manifest {
  return {
    version: 1,
    rootRel: ".",
    capturedAt: new Date().toISOString(),
    ignore: [],
    files: files.map((f) => {
      const ref = cas.putBytes("text/plain", Buffer.from(f.content, "utf8"));
      return {
        path: f.path,
        hash: ref.hash,
        size: Buffer.byteLength(f.content),
        mode: 0o644,
      };
    }),
  };
}

describe("restore retry/resume", () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanupPaths.length > 0) {
      const p = cleanupPaths.pop();
      if (p) fs.rmSync(p, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Existing tests (preserved)
  // ---------------------------------------------------------------------------

  it("retries transient filesystem failures and succeeds", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-retry-ok-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-retry-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [{ path: "src/a.ts", content: "export const a = 1;\n" }]);

    let getBytesCalls = 0;
    const unstableCas = {
      has: (hash: string) => cas.has(hash),
      getBytes: (hash: string) => {
        getBytesCalls++;
        if (getBytesCalls === 1) {
          const err = new Error("busy blob read") as NodeJS.ErrnoException;
          err.code = "EBUSY";
          throw err;
        }
        return cas.getBytes(hash);
      },
    } as unknown as CasStore;

    const phases: RestoreProgress["phase"][] = [];
    const result = restoreWorkspaceWithRetry({
      projectRoot,
      cas: unstableCas,
      manifest,
      mode: "hard",
      backupCurrent: false,
      maxAttempts: 2,
      onProgress: (p) => phases.push(p.phase),
    });

    expect(result.attempts).toBe(2);
    expect(result.filesWritten).toBe(1);
    expect(phases.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(projectRoot, "src/a.ts"))).toBe(true);
  });

  it("writes diagnostics when retries are exhausted", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-retry-fail-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-retry-fail-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [{ path: "file.txt", content: "x" }]);

    const alwaysBusyCas = {
      has: (hash: string) => cas.has(hash),
      getBytes: (_hash: string) => {
        const err = new Error("resource busy") as NodeJS.ErrnoException;
        err.code = "EBUSY";
        throw err;
      },
    } as unknown as CasStore;

    expect(() =>
      restoreWorkspaceWithRetry({
        projectRoot,
        cas: alwaysBusyCas,
        manifest,
        mode: "hard",
        backupCurrent: false,
        maxAttempts: 2,
      })
    ).toThrow(/restore-resume/i);

    const diagDir = path.join(projectRoot, ".tm_internal", "restore-diagnostics");
    const entries = fs.readdirSync(diagDir).filter((f) => f.endsWith(".json"));
    expect(entries.length).toBeGreaterThan(0);

    const latest = entries.sort()[entries.length - 1];
    const payload = JSON.parse(fs.readFileSync(path.join(diagDir, latest), "utf8"));
    expect(Array.isArray(payload.attempts)).toBe(true);
    expect(payload.attempts).toHaveLength(2);
    expect(payload.suggestedNextCommand).toBe("aitm restore-resume");
  });

  it("resumes latest interrupted restore staging", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-resume-"));
    cleanupPaths.push(projectRoot);

    const ts = "2026-02-15T12-00-00-000Z";
    const tmpRestore = path.join(projectRoot, ".tm_internal", "tmp_restore", ts);
    const tmpOld = path.join(projectRoot, ".tm_internal", "tmp_old", ts);
    fs.mkdirSync(path.join(tmpRestore, "dir"), { recursive: true });
    fs.mkdirSync(tmpOld, { recursive: true });

    fs.writeFileSync(path.join(projectRoot, "dir"), "stale", "utf8");
    fs.writeFileSync(path.join(tmpRestore, "dir", "restored.txt"), "new-content", "utf8");
    fs.writeFileSync(path.join(tmpRestore, "root.txt"), "root-new", "utf8");

    const result = resumeRestoreFromLatestTmp({ projectRoot });

    expect(result.timestamp).toBe(ts);
    expect(result.restoredEntries).toBe(2);
    expect(result.tmpOldPath).toBe(tmpOld);
    expect(fs.existsSync(path.join(tmpRestore))).toBe(false);
    expect(fs.readFileSync(path.join(projectRoot, "root.txt"), "utf8")).toBe("root-new");
    expect(fs.readFileSync(path.join(projectRoot, "dir", "restored.txt"), "utf8")).toBe("new-content");
  });

  // ---------------------------------------------------------------------------
  // Resume from a partially completed restore (simulate crash mid-restore)
  // ---------------------------------------------------------------------------

  it("resumes a partially completed restore where only some files were staged", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-resume-partial-"));
    cleanupPaths.push(projectRoot);

    // Simulate a crash: only some files made it to staging
    const ts = "2026-02-16T10-30-00-000Z";
    const tmpRestore = path.join(projectRoot, ".tm_internal", "tmp_restore", ts);
    fs.mkdirSync(path.join(tmpRestore, "src"), { recursive: true });

    // Only file1 made it; file2 did not (simulating crash mid-materialize)
    fs.writeFileSync(path.join(tmpRestore, "src", "file1.ts"), "restored-file1", "utf8");
    // file2.ts would have been here but wasn't written before crash

    // Existing workspace has old content
    fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "src", "file1.ts"), "old-file1", "utf8");
    fs.writeFileSync(path.join(projectRoot, "src", "file2.ts"), "old-file2", "utf8");
    fs.writeFileSync(path.join(projectRoot, "config.json"), '{"old": true}', "utf8");

    const result = resumeRestoreFromLatestTmp({ projectRoot });

    expect(result.timestamp).toBe(ts);
    // Only the staged 'src' directory entry gets moved
    expect(result.restoredEntries).toBe(1);
    // The existing 'src' directory was replaced
    expect(result.replacedEntries).toBe(1);
    // file1.ts should be the restored version
    expect(fs.readFileSync(path.join(projectRoot, "src", "file1.ts"), "utf8")).toBe("restored-file1");
    // file2.ts was not in staging, so it does NOT survive (the src dir was replaced entirely)
    expect(fs.existsSync(path.join(projectRoot, "src", "file2.ts"))).toBe(false);
    // config.json was not in staging, so it remains untouched
    expect(fs.readFileSync(path.join(projectRoot, "config.json"), "utf8")).toBe('{"old": true}');
  });

  it("resumes picks the latest tmp directory when multiple exist", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-resume-multi-"));
    cleanupPaths.push(projectRoot);

    // Simulate two interrupted restores
    const ts1 = "2026-02-15T09-00-00-000Z";
    const ts2 = "2026-02-16T14-30-00-000Z";
    const tmpRestore1 = path.join(projectRoot, ".tm_internal", "tmp_restore", ts1);
    const tmpRestore2 = path.join(projectRoot, ".tm_internal", "tmp_restore", ts2);

    fs.mkdirSync(tmpRestore1, { recursive: true });
    fs.mkdirSync(tmpRestore2, { recursive: true });
    fs.writeFileSync(path.join(tmpRestore1, "old-attempt.txt"), "from-first", "utf8");
    fs.writeFileSync(path.join(tmpRestore2, "new-attempt.txt"), "from-second", "utf8");

    const result = resumeRestoreFromLatestTmp({ projectRoot });

    // Should pick ts2 (lexicographically later)
    expect(result.timestamp).toBe(ts2);
    expect(result.restoredEntries).toBe(1);
    expect(fs.readFileSync(path.join(projectRoot, "new-attempt.txt"), "utf8")).toBe("from-second");
    // ts1 staging should still exist (only ts2 was cleaned)
    expect(fs.existsSync(tmpRestore1)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Diagnostics file format validation
  // ---------------------------------------------------------------------------

  it("diagnostics JSON has correct schema with all required fields", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-schema-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-schema-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [{ path: "f.txt", content: "data" }]);

    const failCas = {
      has: (hash: string) => cas.has(hash),
      getBytes: () => {
        const err = new Error("io error") as NodeJS.ErrnoException;
        err.code = "EIO";
        throw err;
      },
    } as unknown as CasStore;

    try {
      restoreWorkspaceWithRetry({
        projectRoot,
        cas: failCas,
        manifest,
        mode: "safe",
        backupCurrent: true,
        skipMissing: false,
        maxAttempts: 3,
      });
    } catch {
      // expected
    }

    const diagDir = path.join(projectRoot, ".tm_internal", "restore-diagnostics");
    const files = fs.readdirSync(diagDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(1);

    const payload: RestoreDiagnosticsPayload = JSON.parse(
      fs.readFileSync(path.join(diagDir, files[0]), "utf8")
    );

    // Validate all top-level required fields
    expect(typeof payload.recordedAt).toBe("string");
    expect(new Date(payload.recordedAt).getTime()).not.toBeNaN();
    expect(payload.mode).toBe("safe");
    expect(payload.backupCurrent).toBe(true);
    expect(payload.skipMissing).toBe(false);
    expect(payload.suggestedNextCommand).toBe("aitm restore-resume");

    // Validate attempts array
    expect(Array.isArray(payload.attempts)).toBe(true);
    expect(payload.attempts.length).toBe(3);

    for (const attempt of payload.attempts) {
      expect(typeof attempt.attempt).toBe("number");
      expect(["validate", "backup", "restore", "cleanup"]).toContain(attempt.phase);
      expect(typeof attempt.message).toBe("string");
      expect(attempt.message.length).toBeGreaterThan(0);
      expect(typeof attempt.retryable).toBe("boolean");
      expect(typeof attempt.timestamp).toBe("string");
      expect(new Date(attempt.timestamp).getTime()).not.toBeNaN();
    }

    // First attempt should be attempt 1, second attempt 2, etc.
    expect(payload.attempts[0].attempt).toBe(1);
    expect(payload.attempts[1].attempt).toBe(2);
    expect(payload.attempts[2].attempt).toBe(3);

    // All should have error code EIO
    for (const attempt of payload.attempts) {
      expect(attempt.code).toBe("EIO");
      expect(attempt.retryable).toBe(true);
    }
  });

  it("diagnostics filename follows expected pattern", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-name-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-name-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [{ path: "a.txt", content: "a" }]);

    const failCas = {
      has: (hash: string) => cas.has(hash),
      getBytes: () => {
        const err = new Error("busy") as NodeJS.ErrnoException;
        err.code = "EBUSY";
        throw err;
      },
    } as unknown as CasStore;

    try {
      restoreWorkspaceWithRetry({
        projectRoot,
        cas: failCas,
        manifest,
        mode: "hard",
        backupCurrent: false,
        maxAttempts: 1,
      });
    } catch {
      // expected
    }

    const diagDir = path.join(projectRoot, ".tm_internal", "restore-diagnostics");
    const files = fs.readdirSync(diagDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(1);

    // Filename should be restore-failure-<ISO timestamp with colons/dots replaced>-<random suffix>.json
    expect(files[0]).toMatch(/^restore-failure-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-z0-9]+\.json$/);
  });

  // ---------------------------------------------------------------------------
  // Retry with increasing backoff between attempts
  // ---------------------------------------------------------------------------

  it("computeBackoffMs produces exponentially increasing delays", () => {
    // Default base: 100ms, max: 5000ms
    expect(computeBackoffMs(1)).toBe(100);     // 100 * 2^0 = 100
    expect(computeBackoffMs(2)).toBe(200);     // 100 * 2^1 = 200
    expect(computeBackoffMs(3)).toBe(400);     // 100 * 2^2 = 400
    expect(computeBackoffMs(4)).toBe(800);     // 100 * 2^3 = 800
    expect(computeBackoffMs(5)).toBe(1600);    // 100 * 2^4 = 1600
    expect(computeBackoffMs(6)).toBe(3200);    // 100 * 2^5 = 3200
    expect(computeBackoffMs(7)).toBe(5000);    // 100 * 2^6 = 6400, capped at 5000
    expect(computeBackoffMs(10)).toBe(5000);   // always capped
  });

  it("computeBackoffMs respects custom base and max", () => {
    expect(computeBackoffMs(1, 50, 1000)).toBe(50);
    expect(computeBackoffMs(2, 50, 1000)).toBe(100);
    expect(computeBackoffMs(3, 50, 1000)).toBe(200);
    expect(computeBackoffMs(5, 50, 1000)).toBe(800);
    expect(computeBackoffMs(6, 50, 1000)).toBe(1000); // capped
  });

  it("retries with backoff take measurably longer than without", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-backoff-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-backoff-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [{ path: "f.txt", content: "x" }]);

    let callCount = 0;
    const failTwiceCas = {
      has: (hash: string) => cas.has(hash),
      getBytes: (hash: string) => {
        callCount++;
        if (callCount <= 2) {
          const err = new Error("busy") as NodeJS.ErrnoException;
          err.code = "EBUSY";
          throw err;
        }
        return cas.getBytes(hash);
      },
    } as unknown as CasStore;

    const start = Date.now();
    const result = restoreWorkspaceWithRetry({
      projectRoot,
      cas: failTwiceCas,
      manifest,
      mode: "hard",
      backupCurrent: false,
      maxAttempts: 3,
    });
    const elapsed = Date.now() - start;

    expect(result.attempts).toBe(3);
    expect(result.filesWritten).toBe(1);
    // With backoff of 100ms + 200ms = 300ms total minimum delay
    // Allow some tolerance (busy-wait is not perfectly precise)
    expect(elapsed).toBeGreaterThanOrEqual(200);
  });

  // ---------------------------------------------------------------------------
  // Resume edge cases: no tmp dir found
  // ---------------------------------------------------------------------------

  it("throws when no tmp_restore directory exists", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-no-tmp-"));
    cleanupPaths.push(projectRoot);

    expect(() => resumeRestoreFromLatestTmp({ projectRoot })).toThrow(
      /no interrupted restore found/i
    );
  });

  it("throws when tmp_restore exists but is empty", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-empty-tmp-"));
    cleanupPaths.push(projectRoot);

    const tmpRestoreRoot = path.join(projectRoot, ".tm_internal", "tmp_restore");
    fs.mkdirSync(tmpRestoreRoot, { recursive: true });

    expect(() => resumeRestoreFromLatestTmp({ projectRoot })).toThrow(
      /no.*restore.*found|no staged/i
    );
  });

  it("throws when staging directory entries are empty (nothing to resume)", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-empty-staging-"));
    cleanupPaths.push(projectRoot);

    const ts = "2026-02-16T12-00-00-000Z";
    const tmpRestore = path.join(projectRoot, ".tm_internal", "tmp_restore", ts);
    // Create the timestamp directory but leave it empty
    fs.mkdirSync(tmpRestore, { recursive: true });

    expect(() => resumeRestoreFromLatestTmp({ projectRoot })).toThrow(
      /empty/i
    );

    // The empty directory should have been cleaned up
    expect(fs.existsSync(tmpRestore)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Resume edge case: corrupted tmp dir (permission denied simulation)
  // ---------------------------------------------------------------------------

  it("throws descriptive error when staging directory is unreadable", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-corrupt-tmp-"));
    cleanupPaths.push(projectRoot);

    const ts = "2026-02-16T11-00-00-000Z";
    const tmpRestore = path.join(projectRoot, ".tm_internal", "tmp_restore", ts);
    fs.mkdirSync(tmpRestore, { recursive: true });
    fs.writeFileSync(path.join(tmpRestore, "file.txt"), "data", "utf8");

    // Make the directory unreadable (skip on Windows where chmod is limited)
    try {
      fs.chmodSync(tmpRestore, 0o000);
    } catch {
      // If chmod is not supported, skip this test
      return;
    }

    try {
      expect(() => resumeRestoreFromLatestTmp({ projectRoot })).toThrow(
        /corrupted|cannot read/i
      );
    } finally {
      // Restore permissions for cleanup
      try {
        fs.chmodSync(tmpRestore, 0o755);
      } catch {
        // best effort
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Diagnostics summary functions
  // ---------------------------------------------------------------------------

  it("getRestoreDiagnosticsSummary returns null when no diagnostics exist", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-no-diag-"));
    cleanupPaths.push(projectRoot);

    const summary = getRestoreDiagnosticsSummary({ projectRoot });
    expect(summary).toBeNull();
  });

  it("getRestoreDiagnosticsSummary returns null when diagnostics dir exists but is empty", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-empty-diag-"));
    cleanupPaths.push(projectRoot);

    fs.mkdirSync(path.join(projectRoot, ".tm_internal", "restore-diagnostics"), { recursive: true });

    const summary = getRestoreDiagnosticsSummary({ projectRoot });
    expect(summary).toBeNull();
  });

  it("getRestoreDiagnosticsSummary returns correct summary for a single failure", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-summary-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-summary-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [{ path: "a.txt", content: "a" }]);

    const failCas = {
      has: (hash: string) => cas.has(hash),
      getBytes: () => {
        const err = new Error("device io error") as NodeJS.ErrnoException;
        err.code = "EIO";
        throw err;
      },
    } as unknown as CasStore;

    try {
      restoreWorkspaceWithRetry({
        projectRoot,
        cas: failCas,
        manifest,
        mode: "hard",
        backupCurrent: false,
        maxAttempts: 2,
      });
    } catch {
      // expected
    }

    const summary = getRestoreDiagnosticsSummary({ projectRoot });
    expect(summary).not.toBeNull();
    expect(summary!.totalAttempts).toBe(2);
    expect(summary!.lastErrorCode).toBe("EIO");
    expect(summary!.lastErrorMessage).toContain("Failed to restore file");
    expect(summary!.mode).toBe("hard");
    expect(summary!.suggestedNextCommand).toBe("aitm restore-resume");
    expect(summary!.allDiagnosticsCount).toBe(1);
    expect(summary!.latestFile).toMatch(/^restore-failure-.*\.json$/);
    expect(new Date(summary!.recordedAt).getTime()).not.toBeNaN();
  });

  it("listRestoreDiagnostics returns entries ordered newest first", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-list-"));
    cleanupPaths.push(projectRoot);

    // Manually write two diagnostics files with different timestamps
    const diagDir = path.join(projectRoot, ".tm_internal", "restore-diagnostics");
    fs.mkdirSync(diagDir, { recursive: true });

    const payload1: RestoreDiagnosticsPayload = {
      recordedAt: "2026-02-15T10:00:00.000Z",
      attempts: [{ attempt: 1, phase: "restore", message: "error1", retryable: true, timestamp: "2026-02-15T10:00:00.000Z", code: "EBUSY" }],
      mode: "hard",
      backupCurrent: false,
      skipMissing: false,
      suggestedNextCommand: "aitm restore-resume",
    };
    const payload2: RestoreDiagnosticsPayload = {
      recordedAt: "2026-02-16T12:00:00.000Z",
      attempts: [{ attempt: 1, phase: "validate", message: "error2", retryable: false, timestamp: "2026-02-16T12:00:00.000Z" }],
      mode: "safe",
      backupCurrent: true,
      skipMissing: true,
      suggestedNextCommand: "aitm restore-resume",
    };

    fs.writeFileSync(path.join(diagDir, "restore-failure-2026-02-15T10-00-00-000Z.json"), JSON.stringify(payload1), "utf8");
    fs.writeFileSync(path.join(diagDir, "restore-failure-2026-02-16T12-00-00-000Z.json"), JSON.stringify(payload2), "utf8");

    const list = listRestoreDiagnostics({ projectRoot });
    expect(list.length).toBe(2);
    // Newest first
    expect(list[0].filename).toContain("2026-02-16");
    expect(list[1].filename).toContain("2026-02-15");
    // Verify payloads are deserialized correctly
    expect(list[0].payload.mode).toBe("safe");
    expect(list[1].payload.mode).toBe("hard");
  });

  it("listRestoreDiagnostics skips corrupted JSON files", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-corrupt-"));
    cleanupPaths.push(projectRoot);

    const diagDir = path.join(projectRoot, ".tm_internal", "restore-diagnostics");
    fs.mkdirSync(diagDir, { recursive: true });

    // Write a valid file and a corrupted file
    const validPayload: RestoreDiagnosticsPayload = {
      recordedAt: "2026-02-16T10:00:00.000Z",
      attempts: [{ attempt: 1, phase: "restore", message: "err", retryable: false, timestamp: "2026-02-16T10:00:00.000Z" }],
      mode: "hard",
      backupCurrent: false,
      skipMissing: false,
      suggestedNextCommand: "aitm restore-resume",
    };
    fs.writeFileSync(path.join(diagDir, "restore-failure-2026-02-16T10-00-00-000Z.json"), JSON.stringify(validPayload), "utf8");
    fs.writeFileSync(path.join(diagDir, "restore-failure-2026-02-16T11-00-00-000Z.json"), "NOT VALID JSON {{{{", "utf8");

    const list = listRestoreDiagnostics({ projectRoot });
    // Only the valid file should appear
    expect(list.length).toBe(1);
    expect(list[0].payload.recordedAt).toBe("2026-02-16T10:00:00.000Z");
  });

  it("getRestoreDiagnosticsSummary reports allDiagnosticsCount correctly with multiple failures", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-multi-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-diag-multi-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [{ path: "x.txt", content: "x" }]);

    const failCas = {
      has: (hash: string) => cas.has(hash),
      getBytes: () => {
        const err = new Error("busy") as NodeJS.ErrnoException;
        err.code = "EBUSY";
        throw err;
      },
    } as unknown as CasStore;

    // Trigger two separate failure rounds
    for (let i = 0; i < 2; i++) {
      try {
        restoreWorkspaceWithRetry({
          projectRoot,
          cas: failCas,
          manifest,
          mode: "hard",
          backupCurrent: false,
          maxAttempts: 1,
        });
      } catch {
        // expected
      }
    }

    const summary = getRestoreDiagnosticsSummary({ projectRoot });
    expect(summary).not.toBeNull();
    expect(summary!.allDiagnosticsCount).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Non-retryable errors do not retry
  // ---------------------------------------------------------------------------

  it("does not retry non-retryable errors", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-noretry-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-noretry-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [{ path: "a.txt", content: "a" }]);

    let callCount = 0;
    const nonRetryableCas = {
      has: (hash: string) => cas.has(hash),
      getBytes: () => {
        callCount++;
        const err = new Error("permission denied") as NodeJS.ErrnoException;
        err.code = "EACCES"; // not in the retryable list
        throw err;
      },
    } as unknown as CasStore;

    expect(() =>
      restoreWorkspaceWithRetry({
        projectRoot,
        cas: nonRetryableCas,
        manifest,
        mode: "hard",
        backupCurrent: false,
        maxAttempts: 3,
      })
    ).toThrow(/restore-resume/i);

    // Should have only tried once because EACCES is not retryable
    expect(callCount).toBe(1);

    // Diagnostics should reflect exactly 1 attempt
    const diagDir = path.join(projectRoot, ".tm_internal", "restore-diagnostics");
    const files = fs.readdirSync(diagDir).filter((f) => f.endsWith(".json"));
    const payload = JSON.parse(fs.readFileSync(path.join(diagDir, files[0]), "utf8"));
    expect(payload.attempts).toHaveLength(1);
    expect(payload.attempts[0].retryable).toBe(false);
    expect(payload.attempts[0].code).toBe("EACCES");
  });

  // ---------------------------------------------------------------------------
  // CLI restore-resume output format
  // ---------------------------------------------------------------------------

  it("resume result contains all expected output fields", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-resume-fields-"));
    cleanupPaths.push(projectRoot);

    const ts = "2026-02-16T15-00-00-000Z";
    const tmpRestore = path.join(projectRoot, ".tm_internal", "tmp_restore", ts);
    fs.mkdirSync(tmpRestore, { recursive: true });
    fs.writeFileSync(path.join(tmpRestore, "app.ts"), "code", "utf8");

    // Pre-existing file in the project root that will be replaced
    fs.writeFileSync(path.join(projectRoot, "app.ts"), "old-code", "utf8");

    const result = resumeRestoreFromLatestTmp({ projectRoot });

    // Verify the result has all the fields the CLI command relies on
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("restoredEntries");
    expect(result).toHaveProperty("replacedEntries");
    expect(result).toHaveProperty("tmpRestorePath");
    expect(result).toHaveProperty("warnings");
    expect(typeof result.timestamp).toBe("string");
    expect(typeof result.restoredEntries).toBe("number");
    expect(typeof result.replacedEntries).toBe("number");
    expect(typeof result.tmpRestorePath).toBe("string");
    expect(Array.isArray(result.warnings)).toBe(true);

    // Fields should have correct values
    expect(result.timestamp).toBe(ts);
    expect(result.restoredEntries).toBe(1);
    expect(result.replacedEntries).toBe(1);
    expect(result.tmpRestorePath).toBe(tmpRestore);
  });

  it("resume with no old staging dir sets tmpOldPath to undefined", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-resume-noold-"));
    cleanupPaths.push(projectRoot);

    const ts = "2026-02-16T16-00-00-000Z";
    const tmpRestore = path.join(projectRoot, ".tm_internal", "tmp_restore", ts);
    fs.mkdirSync(tmpRestore, { recursive: true });
    fs.writeFileSync(path.join(tmpRestore, "file.txt"), "content", "utf8");

    // Do NOT create tmp_old directory

    const result = resumeRestoreFromLatestTmp({ projectRoot });
    expect(result.tmpOldPath).toBeUndefined();
  });

  it("resume with existing old staging dir sets tmpOldPath", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-resume-withold-"));
    cleanupPaths.push(projectRoot);

    const ts = "2026-02-16T17-00-00-000Z";
    const tmpRestore = path.join(projectRoot, ".tm_internal", "tmp_restore", ts);
    const tmpOld = path.join(projectRoot, ".tm_internal", "tmp_old", ts);
    fs.mkdirSync(tmpRestore, { recursive: true });
    fs.mkdirSync(tmpOld, { recursive: true });
    fs.writeFileSync(path.join(tmpRestore, "file.txt"), "content", "utf8");

    const result = resumeRestoreFromLatestTmp({ projectRoot });
    expect(result.tmpOldPath).toBe(tmpOld);
  });

  // ---------------------------------------------------------------------------
  // Single attempt (maxAttempts = 1) should not retry
  // ---------------------------------------------------------------------------

  it("single attempt mode does not retry", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-single-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-single-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [{ path: "a.txt", content: "a" }]);

    let callCount = 0;
    const failOnceCas = {
      has: (hash: string) => cas.has(hash),
      getBytes: () => {
        callCount++;
        const err = new Error("busy") as NodeJS.ErrnoException;
        err.code = "EBUSY";
        throw err;
      },
    } as unknown as CasStore;

    expect(() =>
      restoreWorkspaceWithRetry({
        projectRoot,
        cas: failOnceCas,
        manifest,
        mode: "hard",
        backupCurrent: false,
        maxAttempts: 1,
      })
    ).toThrow(/1 attempt/);

    expect(callCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Successful restore on first attempt produces correct result
  // ---------------------------------------------------------------------------

  it("successful restore on first attempt returns attempts = 1", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-firstok-"));
    const casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-firstok-cas-"));
    cleanupPaths.push(projectRoot, casDir);

    const cas = new CasStore(casDir);
    const manifest = putManifest(cas, [
      { path: "a.txt", content: "hello" },
      { path: "b.txt", content: "world" },
    ]);

    const result = restoreWorkspaceWithRetry({
      projectRoot,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
      maxAttempts: 3,
    });

    expect(result.attempts).toBe(1);
    expect(result.filesWritten).toBe(2);
    expect(result.filesSkipped).toBe(0);
    expect(result.missingFiles).toEqual([]);
    expect(result.warnings).toEqual([]);
    // No diagnostics should be written for a successful restore
    const diagDir = path.join(projectRoot, ".tm_internal", "restore-diagnostics");
    expect(fs.existsSync(diagDir)).toBe(false);
  });
});
