import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CasStore } from "../src/core/cas.js";
import {
  restoreWorkspaceAtomic,
  restoreToDirectory,
} from "../src/core/restore.js";
import type { Manifest } from "../src/core/manifest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FileSpec = { path: string; content: string | Buffer };

function putManifest(
  cas: CasStore,
  files: FileSpec[],
  opts?: { mode?: number }
): Manifest {
  return {
    version: 1,
    rootRel: ".",
    capturedAt: new Date().toISOString(),
    ignore: [],
    files: files.map((f) => {
      const buf =
        typeof f.content === "string"
          ? Buffer.from(f.content, "utf-8")
          : f.content;
      const ref = cas.putBytes("application/octet-stream", buf);
      return {
        path: f.path,
        hash: ref.hash,
        size: buf.byteLength,
        mode: opts?.mode ?? 0o644,
      };
    }),
  };
}

function writeWorkspace(root: string, files: FileSpec[]): void {
  for (const f of files) {
    const abs = path.join(root, f.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (typeof f.content === "string") {
      fs.writeFileSync(abs, f.content, "utf-8");
    } else {
      fs.writeFileSync(abs, f.content);
    }
  }
}

/** Returns a map of relativePath -> sha256 hex for every file in root (excluding .tm_internal). */
function snapshotWorkspace(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === ".tm_internal" || ent.name === ".tm_lock") continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        const buf = fs.readFileSync(abs);
        out[rel] = crypto.createHash("sha256").update(buf).digest("hex");
      }
    }
  };
  walk(root);
  return out;
}

/** Read all file contents in workspace as strings. */
function readWorkspace(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === ".tm_internal" || ent.name === ".tm_lock") continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        out[rel] = fs.readFileSync(abs, "utf-8");
      }
    }
  };
  walk(root);
  return out;
}

/** List all file paths in workspace. */
function listWorkspaceFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === ".tm_internal" || ent.name === ".tm_lock") continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) {
        files.push(path.relative(root, abs).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return files.sort();
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("restore correctness", () => {
  let testDir: string;
  let casDir: string;
  let cas: CasStore;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-restore-correctness-"));
    casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-restore-cas-"));
    cas = new CasStore(casDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(casDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Full project restore
  // -----------------------------------------------------------------------

  it("full project restore: create checkpoint, modify files, restore, verify exact match", () => {
    const originalFiles: FileSpec[] = [
      { path: "src/index.ts", content: 'export const VERSION = "1.0.0";\n' },
      { path: "src/utils/hash.ts", content: "export function hash(s: string) { return s; }\n" },
      { path: "package.json", content: '{"name": "test", "version": "1.0.0"}\n' },
      { path: "README.md", content: "# Test Project\n" },
    ];

    // Create a manifest from the original state
    const manifest = putManifest(cas, originalFiles);

    // Write modified state to workspace
    writeWorkspace(testDir, [
      { path: "src/index.ts", content: 'export const VERSION = "2.0.0"; // CHANGED\n' },
      { path: "src/utils/hash.ts", content: "// COMPLETELY REWRITTEN\n" },
      { path: "package.json", content: '{"name": "test", "version": "2.0.0"}\n' },
      { path: "src/new-file.ts", content: "// This is new\n" },
      // README.md is deleted (not written)
    ]);

    // Restore to the original checkpoint
    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(4);

    // Verify exact content match
    const workspace = readWorkspace(testDir);
    expect(workspace["src/index.ts"]).toBe('export const VERSION = "1.0.0";\n');
    expect(workspace["src/utils/hash.ts"]).toBe("export function hash(s: string) { return s; }\n");
    expect(workspace["package.json"]).toBe('{"name": "test", "version": "1.0.0"}\n');
    expect(workspace["README.md"]).toBe("# Test Project\n");

    // New file should be removed in hard mode
    expect(workspace["src/new-file.ts"]).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Selective file restore (via restoreToDirectory and pattern check)
  // -----------------------------------------------------------------------

  it("selective file restore: restore single file without affecting others", () => {
    // Simulate selective restore by restoring to a separate directory
    // then copying only specific files back
    const checkpointFiles: FileSpec[] = [
      { path: "src/a.ts", content: "const a = 1;\n" },
      { path: "src/b.ts", content: "const b = 2;\n" },
      { path: "src/c.ts", content: "const c = 3;\n" },
    ];
    const manifest = putManifest(cas, checkpointFiles);

    // Current workspace has modified a.ts and added d.ts
    writeWorkspace(testDir, [
      { path: "src/a.ts", content: "const a = 999; // MODIFIED\n" },
      { path: "src/b.ts", content: "const b = 2;\n" },
      { path: "src/c.ts", content: "const c = 3;\n" },
      { path: "src/d.ts", content: "const d = 4; // NEW\n" },
    ]);

    // Restore to a separate directory
    const restoreDir = path.join(testDir, ".tm_internal", "selective_restore");
    fs.mkdirSync(restoreDir, { recursive: true });

    const restoreResult = restoreToDirectory({
      cas,
      manifest,
      targetDir: restoreDir,
    });

    expect(restoreResult.filesWritten).toBe(3);

    // Copy back only a.ts (selective restore)
    const srcA = path.join(restoreDir, "src", "a.ts");
    const destA = path.join(testDir, "src", "a.ts");
    fs.copyFileSync(srcA, destA);

    // Verify: a.ts is restored, b.ts/c.ts unchanged, d.ts still exists
    expect(fs.readFileSync(destA, "utf-8")).toBe("const a = 1;\n");
    expect(fs.readFileSync(path.join(testDir, "src", "b.ts"), "utf-8")).toBe("const b = 2;\n");
    expect(fs.readFileSync(path.join(testDir, "src", "c.ts"), "utf-8")).toBe("const c = 3;\n");
    expect(fs.readFileSync(path.join(testDir, "src", "d.ts"), "utf-8")).toBe("const d = 4; // NEW\n");
  });

  // -----------------------------------------------------------------------
  // Selective folder restore
  // -----------------------------------------------------------------------

  it("selective folder restore: restore a folder without affecting siblings", () => {
    const checkpointFiles: FileSpec[] = [
      { path: "src/auth/login.ts", content: "login v1\n" },
      { path: "src/auth/register.ts", content: "register v1\n" },
      { path: "src/api/routes.ts", content: "routes v1\n" },
      { path: "config/app.json", content: '{"env": "dev"}\n' },
    ];
    const manifest = putManifest(cas, checkpointFiles);

    // Modified workspace
    writeWorkspace(testDir, [
      { path: "src/auth/login.ts", content: "login v2 MODIFIED\n" },
      { path: "src/auth/register.ts", content: "register v2 MODIFIED\n" },
      { path: "src/api/routes.ts", content: "routes v2 MODIFIED\n" },
      { path: "config/app.json", content: '{"env": "prod"}\n' },
    ]);

    // Restore to separate dir and copy back only src/auth/
    const restoreDir = path.join(testDir, ".tm_internal", "selective_folder");
    fs.mkdirSync(restoreDir, { recursive: true });
    restoreToDirectory({ cas, manifest, targetDir: restoreDir });

    // Overwrite only the auth folder
    const srcAuthRestored = path.join(restoreDir, "src", "auth");
    const destAuth = path.join(testDir, "src", "auth");
    fs.rmSync(destAuth, { recursive: true, force: true });
    fs.mkdirSync(destAuth, { recursive: true });
    for (const f of fs.readdirSync(srcAuthRestored)) {
      fs.copyFileSync(path.join(srcAuthRestored, f), path.join(destAuth, f));
    }

    // Auth folder restored, API folder and config untouched
    expect(fs.readFileSync(path.join(testDir, "src/auth/login.ts"), "utf-8")).toBe("login v1\n");
    expect(fs.readFileSync(path.join(testDir, "src/auth/register.ts"), "utf-8")).toBe("register v1\n");
    expect(fs.readFileSync(path.join(testDir, "src/api/routes.ts"), "utf-8")).toBe("routes v2 MODIFIED\n");
    expect(fs.readFileSync(path.join(testDir, "config/app.json"), "utf-8")).toBe('{"env": "prod"}\n');
  });

  // -----------------------------------------------------------------------
  // Restore across many files (100+)
  // -----------------------------------------------------------------------

  it("restores correctly across 150 files in varied directories", () => {
    const files: FileSpec[] = [];
    for (let i = 0; i < 150; i++) {
      const dir = `module-${i % 15}`;
      files.push({
        path: `src/${dir}/component-${i}.tsx`,
        content: `// Component ${i}\nexport default function C${i}() { return null; }\n`,
      });
    }

    const manifest = putManifest(cas, files);

    // Pre-populate workspace with different content
    writeWorkspace(
      testDir,
      files.map((f) => ({ path: f.path, content: `// STALE\n` }))
    );

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(150);

    // Verify every file
    for (const f of files) {
      const abs = path.join(testDir, f.path);
      expect(fs.existsSync(abs)).toBe(true);
      expect(fs.readFileSync(abs, "utf-8")).toBe(f.content as string);
    }
  });

  // -----------------------------------------------------------------------
  // Binary files
  // -----------------------------------------------------------------------

  it("restores binary files correctly", () => {
    // Create various binary content
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const randomBin = crypto.randomBytes(4096);
    const nullBytes = Buffer.alloc(256, 0);
    const mixedBin = Buffer.concat([
      pngHeader,
      crypto.randomBytes(512),
      nullBytes,
      Buffer.from("embedded text\n"),
      crypto.randomBytes(128),
    ]);

    const files: FileSpec[] = [
      { path: "assets/icon.png", content: pngHeader },
      { path: "data/random.bin", content: randomBin },
      { path: "data/nulls.dat", content: nullBytes },
      { path: "assets/mixed.bin", content: mixedBin },
    ];

    const manifest = putManifest(cas, files);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(4);

    // Verify binary content byte-by-byte
    for (const f of files) {
      const abs = path.join(testDir, f.path);
      const restored = fs.readFileSync(abs);
      const original = typeof f.content === "string" ? Buffer.from(f.content) : f.content;
      expect(restored.equals(original)).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Deeply nested directories (10+ levels)
  // -----------------------------------------------------------------------

  it("restores files in deeply nested directories (12 levels)", () => {
    const deepPath = Array.from({ length: 12 }, (_, i) => `level${i}`).join("/");
    const files: FileSpec[] = [
      { path: `${deepPath}/deep-file.txt`, content: "I am deeply nested\n" },
      { path: `${deepPath}/another.json`, content: '{"deep": true}\n' },
      { path: "shallow.txt", content: "I am at root\n" },
    ];

    const manifest = putManifest(cas, files);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(3);
    expect(
      fs.readFileSync(path.join(testDir, deepPath, "deep-file.txt"), "utf-8")
    ).toBe("I am deeply nested\n");
    expect(
      fs.readFileSync(path.join(testDir, deepPath, "another.json"), "utf-8")
    ).toBe('{"deep": true}\n');
    expect(
      fs.readFileSync(path.join(testDir, "shallow.txt"), "utf-8")
    ).toBe("I am at root\n");
  });

  // -----------------------------------------------------------------------
  // Special characters in filenames
  // -----------------------------------------------------------------------

  it("restores files with special characters in names", () => {
    const files: FileSpec[] = [
      { path: "docs/hello world.txt", content: "spaces\n" },
      { path: "docs/file-with-dashes.md", content: "dashes\n" },
      { path: "docs/file_with_underscores.txt", content: "underscores\n" },
      { path: "docs/file.multiple.dots.ts", content: "dots\n" },
      { path: "docs/(parentheses).txt", content: "parens\n" },
      { path: "docs/[brackets].md", content: "brackets\n" },
      { path: "docs/file+plus.txt", content: "plus\n" },
      { path: "docs/UPPERCASE.TXT", content: "upper\n" },
    ];

    const manifest = putManifest(cas, files);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(files.length);

    for (const f of files) {
      const abs = path.join(testDir, f.path);
      expect(fs.existsSync(abs)).toBe(true);
      expect(fs.readFileSync(abs, "utf-8")).toBe(f.content as string);
    }
  });

  // -----------------------------------------------------------------------
  // Empty directories
  // -----------------------------------------------------------------------

  it("restores without empty directory artifacts", () => {
    // After a restore, only directories containing files should exist.
    // restoreWorkspaceAtomic does not create empty dirs; it creates dirs
    // as needed for files.
    const files: FileSpec[] = [
      { path: "src/a.ts", content: "a\n" },
      // Nothing in "src/empty/" -- restoreWorkspaceAtomic only creates dirs for files
    ];

    // Pre-populate workspace with an extra empty dir
    fs.mkdirSync(path.join(testDir, "src", "empty"), { recursive: true });
    writeWorkspace(testDir, [{ path: "src/a.ts", content: "old a\n" }]);

    const manifest = putManifest(cas, files);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    // src/empty should be gone in hard mode (entire workspace replaced)
    expect(fs.existsSync(path.join(testDir, "src", "empty"))).toBe(false);
    expect(fs.readFileSync(path.join(testDir, "src", "a.ts"), "utf-8")).toBe("a\n");
  });

  // -----------------------------------------------------------------------
  // Symlinks (should skip gracefully)
  // -----------------------------------------------------------------------

  it("handles symlinks gracefully during restore", () => {
    // Create workspace with a symlink
    writeWorkspace(testDir, [
      { path: "real/target.txt", content: "target content\n" },
    ]);

    try {
      fs.symlinkSync(
        path.join(testDir, "real", "target.txt"),
        path.join(testDir, "link.txt")
      );
    } catch {
      // Symlinks may not be supported on all platforms; skip gracefully
      return;
    }

    const files: FileSpec[] = [
      { path: "restored.txt", content: "after restore\n" },
    ];
    const manifest = putManifest(cas, files);

    // Should not throw on symlinks -- the swap phase moves everything out
    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(1);
    expect(fs.readFileSync(path.join(testDir, "restored.txt"), "utf-8")).toBe(
      "after restore\n"
    );
    // Symlink should be gone (was in old workspace, moved to tmp_old)
    expect(fs.existsSync(path.join(testDir, "link.txt"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Restore idempotency
  // -----------------------------------------------------------------------

  it("restoring twice produces identical results (idempotency)", () => {
    const files: FileSpec[] = [
      { path: "src/main.ts", content: 'console.log("hello");\n' },
      { path: "src/lib/utils.ts", content: "export const PI = 3.14;\n" },
      { path: "config.json", content: '{"key": "value"}\n' },
      { path: "assets/data.bin", content: crypto.randomBytes(1024) },
    ];

    const manifest = putManifest(cas, files);

    // First restore
    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });
    const snapshot1 = snapshotWorkspace(testDir);

    // Second restore (should produce same result)
    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });
    const snapshot2 = snapshotWorkspace(testDir);

    // Third restore for good measure
    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });
    const snapshot3 = snapshotWorkspace(testDir);

    expect(snapshot2).toEqual(snapshot1);
    expect(snapshot3).toEqual(snapshot1);
  });

  // -----------------------------------------------------------------------
  // Deterministic on repeated runs for large/nested states (original test)
  // -----------------------------------------------------------------------

  it("restores deterministically on repeated runs for large/nested states", () => {
    const files: FileSpec[] = [];
    for (let i = 0; i < 220; i++) {
      files.push({
        path: `src/module-${Math.floor(i / 20)}/file-${i}.ts`,
        content: `export const v${i} = ${i};\n`,
      });
    }
    for (let i = 0; i < 8; i++) {
      files.push({
        path: `assets/blob-${i}.txt`,
        content: "x".repeat(256 * 1024 + i),
      });
    }
    files.push({ path: "docs/edge case name.txt", content: "edge\n" });

    const manifest = putManifest(cas, files);

    writeWorkspace(testDir, [
      { path: "tmp/extra.log", content: "noise" },
      { path: "README.md", content: "old" },
    ]);

    const first = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });
    expect(first.filesWritten).toBe(files.length);

    const snapshot1 = snapshotWorkspace(testDir);
    const second = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });
    expect(second.filesWritten).toBe(files.length);
    const snapshot2 = snapshotWorkspace(testDir);

    expect(snapshot2).toEqual(snapshot1);
  });

  // -----------------------------------------------------------------------
  // Safe mode preserves vs hard mode removes (original test)
  // -----------------------------------------------------------------------

  it("safe mode preserves extra files while hard mode removes them", () => {
    const manifest = putManifest(cas, [
      { path: "app/main.ts", content: "console.log('ok');\n" },
    ]);
    writeWorkspace(testDir, [{ path: "scratch/local.txt", content: "keep-me" }]);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "safe",
      backupCurrent: false,
    });
    expect(fs.existsSync(path.join(testDir, "scratch/local.txt"))).toBe(true);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });
    expect(fs.existsSync(path.join(testDir, "scratch/local.txt"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Partial snapshots with skipMissing (original test)
  // -----------------------------------------------------------------------

  it("handles partial snapshots deterministically with skipMissing", () => {
    const okRef = cas.putBytes("text/plain", Buffer.from("ok\n", "utf-8"));
    const missingHash = "deadbeef".repeat(8);
    const manifest: Manifest = {
      version: 1,
      rootRel: ".",
      capturedAt: new Date().toISOString(),
      ignore: [],
      files: [
        { path: "kept.txt", hash: okRef.hash, size: 3, mode: 0o644 },
        { path: "missing.txt", hash: missingHash, size: 10, mode: 0o644 },
      ],
    };

    expect(() =>
      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      })
    ).toThrow(/Partial snapshot/);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
      skipMissing: true,
    });

    expect(result.filesWritten).toBe(1);
    expect(result.filesSkipped).toBe(1);
    expect(result.missingFiles).toContain("missing.txt");
    expect(fs.existsSync(path.join(testDir, "kept.txt"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "missing.txt"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Backup creation during restore
  // -----------------------------------------------------------------------

  it("creates backup when backupCurrent is true", () => {
    writeWorkspace(testDir, [
      { path: "original.txt", content: "backup me\n" },
    ]);

    const manifest = putManifest(cas, [
      { path: "restored.txt", content: "new file\n" },
    ]);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: true,
    });

    expect(result.backupPath).toBeDefined();
    expect(fs.existsSync(result.backupPath!)).toBe(true);

    // The backup should contain the original file
    const backupFile = path.join(result.backupPath!, "original.txt");
    expect(fs.existsSync(backupFile)).toBe(true);
    expect(fs.readFileSync(backupFile, "utf-8")).toBe("backup me\n");

    // Workspace should have the restored file
    expect(fs.readFileSync(path.join(testDir, "restored.txt"), "utf-8")).toBe("new file\n");
  });

  // -----------------------------------------------------------------------
  // Progress callback reporting
  // -----------------------------------------------------------------------

  it("reports progress during restore", () => {
    const files: FileSpec[] = [];
    for (let i = 0; i < 10; i++) {
      files.push({ path: `file-${i}.txt`, content: `content ${i}\n` });
    }
    const manifest = putManifest(cas, files);

    const phases: string[] = [];
    const fileNames: string[] = [];

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
      onProgress: (p) => {
        if (!phases.includes(p.phase)) phases.push(p.phase);
        if (p.file) fileNames.push(p.file);
      },
    });

    expect(phases).toContain("validate");
    expect(phases).toContain("restore");
    expect(phases).toContain("cleanup");
    expect(fileNames.length).toBeGreaterThanOrEqual(10);
  });

  // -----------------------------------------------------------------------
  // restoreToDirectory
  // -----------------------------------------------------------------------

  it("restoreToDirectory materializes checkpoint to separate location", () => {
    const files: FileSpec[] = [
      { path: "src/index.ts", content: "hello\n" },
      { path: "README.md", content: "# hi\n" },
    ];
    const manifest = putManifest(cas, files);
    const targetDir = path.join(testDir, "materialized");

    const result = restoreToDirectory({
      cas,
      manifest,
      targetDir,
    });

    expect(result.filesWritten).toBe(2);
    expect(result.targetDir).toBe(targetDir);
    expect(fs.readFileSync(path.join(targetDir, "src/index.ts"), "utf-8")).toBe("hello\n");
    expect(fs.readFileSync(path.join(targetDir, "README.md"), "utf-8")).toBe("# hi\n");
  });

  it("restoreToDirectory rejects non-empty target", () => {
    const manifest = putManifest(cas, [{ path: "a.txt", content: "a" }]);
    const targetDir = path.join(testDir, "nonempty");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "existing.txt"), "x");

    expect(() =>
      restoreToDirectory({ cas, manifest, targetDir })
    ).toThrow(/not empty/i);
  });

  it("restoreToDirectory writes context file when contextContent provided", () => {
    const manifest = putManifest(cas, [{ path: "a.txt", content: "a" }]);
    const targetDir = path.join(testDir, "with-context");

    restoreToDirectory({
      cas,
      manifest,
      targetDir,
      contextContent: "# Checkpoint Info\nRestored at 2026-02-16",
    });

    const contextPath = path.join(targetDir, ".aitm", "context.md");
    expect(fs.existsSync(contextPath)).toBe(true);
    expect(fs.readFileSync(contextPath, "utf-8")).toContain("Checkpoint Info");
  });
});
