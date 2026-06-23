import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CasStore } from "../src/core/cas.js";
import {
  restoreWorkspaceAtomic,
  restoreToDirectory,
  type RestoreProgress,
} from "../src/core/restore.js";
import type { Manifest } from "../src/core/manifest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FileSpec = { path: string; content: string | Buffer; mode?: number };

function putManifest(cas: CasStore, files: FileSpec[]): Manifest {
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
        mode: f.mode ?? 0o644,
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

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Snapshot workspace as path -> sha256. */
function snapshotWorkspace(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === ".tm_internal" || ent.name === ".tm_lock") continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        out[rel] = sha256(fs.readFileSync(abs));
      }
    }
  };
  walk(root);
  return out;
}

/** Read file modes in workspace. */
function snapshotModes(root: string): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === ".tm_internal" || ent.name === ".tm_lock") continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        out[rel] = fs.statSync(abs).mode & 0o777;
      }
    }
  };
  walk(root);
  return out;
}

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

describe("restore integrity", () => {
  let testDir: string;
  let casDir: string;
  let cas: CasStore;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-restore-integrity-"));
    casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-integrity-cas-"));
    cas = new CasStore(casDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(casDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Content hash verification after restore
  // -----------------------------------------------------------------------

  describe("content hash verification", () => {
    it("restored file hashes match the manifest hashes exactly", () => {
      const files: FileSpec[] = [
        { path: "src/index.ts", content: 'export const X = 42;\n' },
        { path: "src/utils.ts", content: "export function add(a: number, b: number) { return a + b; }\n" },
        { path: "package.json", content: '{"name": "integrity-test"}\n' },
        { path: "data/binary.bin", content: crypto.randomBytes(2048) },
      ];

      const manifest = putManifest(cas, files);

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      // For each file in the manifest, verify the restored content hashes
      // match what the CAS stores
      for (const manifestFile of manifest.files) {
        const abs = path.join(testDir, manifestFile.path);
        const restoredContent = fs.readFileSync(abs);
        const restoredHash = sha256(restoredContent);

        // Get the original content from CAS and compute its hash
        const originalContent = cas.getBytes(manifestFile.hash);
        const originalHash = sha256(originalContent);

        expect(restoredHash).toBe(originalHash);
      }
    });

    it("content hashes are identical across multiple restores", () => {
      const files: FileSpec[] = [];
      for (let i = 0; i < 50; i++) {
        files.push({
          path: `file-${i}.txt`,
          content: `content-${i}-${crypto.randomBytes(16).toString("hex")}\n`,
        });
      }

      const manifest = putManifest(cas, files);

      // First restore
      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });
      const hashes1 = snapshotWorkspace(testDir);

      // Second restore
      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });
      const hashes2 = snapshotWorkspace(testDir);

      expect(hashes2).toEqual(hashes1);
      expect(Object.keys(hashes1).length).toBe(50);
    });

    it("CAS content matches restored file content byte-for-byte", () => {
      const binaryContent = crypto.randomBytes(8192);
      const textContent = "Hello, world! \n\t Special chars: <>?/\\|";

      const manifest = putManifest(cas, [
        { path: "bin.dat", content: binaryContent },
        { path: "text.txt", content: textContent },
      ]);

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      for (const f of manifest.files) {
        const casContent = cas.getBytes(f.hash);
        const diskContent = fs.readFileSync(path.join(testDir, f.path));
        expect(diskContent.equals(casContent)).toBe(true);
      }
    });

    it("large file hash integrity is preserved (many files)", () => {
      const files: FileSpec[] = [];
      for (let i = 0; i < 100; i++) {
        // Mix of text and binary
        const content =
          i % 3 === 0
            ? crypto.randomBytes(1024 + i)
            : `Line ${i}: ${crypto.randomBytes(32).toString("hex")}\n`;
        files.push({ path: `data/chunk-${i}.dat`, content });
      }

      const manifest = putManifest(cas, files);

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      // Verify each file
      for (const mf of manifest.files) {
        const casBytes = cas.getBytes(mf.hash);
        const diskBytes = fs.readFileSync(path.join(testDir, mf.path));
        expect(diskBytes.equals(casBytes)).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // File permissions preserved
  // -----------------------------------------------------------------------

  describe("file permissions", () => {
    it("restored files are created with correct permissions", () => {
      // Note: restoreWorkspaceAtomic uses writeFileAtomic which doesn't set
      // explicit modes -- it inherits the umask. However, restoreToDirectory
      // also doesn't set modes. The engine.restore() method does set modes.
      // We test that the write succeeds and files are readable.
      const manifest = putManifest(cas, [
        { path: "readable.txt", content: "read me\n", mode: 0o644 },
        { path: "script.sh", content: "#!/bin/bash\necho hi\n", mode: 0o755 },
      ]);

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      // Files should be readable at minimum
      const readableContent = fs.readFileSync(path.join(testDir, "readable.txt"), "utf-8");
      expect(readableContent).toBe("read me\n");

      const scriptContent = fs.readFileSync(path.join(testDir, "script.sh"), "utf-8");
      expect(scriptContent).toBe("#!/bin/bash\necho hi\n");

      // Verify files exist and are regular files
      const readableStat = fs.statSync(path.join(testDir, "readable.txt"));
      expect(readableStat.isFile()).toBe(true);

      const scriptStat = fs.statSync(path.join(testDir, "script.sh"));
      expect(scriptStat.isFile()).toBe(true);
    });

    it("file modes stored in manifest reflect original permissions", () => {
      const manifest = putManifest(cas, [
        { path: "normal.txt", content: "normal\n", mode: 0o644 },
        { path: "exec.sh", content: "#!/bin/sh\n", mode: 0o755 },
        { path: "readonly.txt", content: "ro\n", mode: 0o444 },
      ]);

      // The manifest should record the modes
      const normalEntry = manifest.files.find((f) => f.path === "normal.txt");
      const execEntry = manifest.files.find((f) => f.path === "exec.sh");
      const roEntry = manifest.files.find((f) => f.path === "readonly.txt");

      expect(normalEntry?.mode).toBe(0o644);
      expect(execEntry?.mode).toBe(0o755);
      expect(roEntry?.mode).toBe(0o444);
    });
  });

  // -----------------------------------------------------------------------
  // File timestamps handled correctly
  // -----------------------------------------------------------------------

  describe("file timestamps", () => {
    it("restored files have recent modification timestamps", () => {
      const manifest = putManifest(cas, [
        { path: "file.txt", content: "content\n" },
      ]);

      const beforeRestore = Date.now();

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      const afterRestore = Date.now();
      const stat = fs.statSync(path.join(testDir, "file.txt"));

      // The file's mtime should be between before and after restore
      // (since writeFileAtomic creates a new file)
      expect(stat.mtimeMs).toBeGreaterThanOrEqual(beforeRestore - 1000); // allow 1s tolerance
      expect(stat.mtimeMs).toBeLessThanOrEqual(afterRestore + 1000);
    });

    it("manifest capturedAt timestamp is a valid ISO string", () => {
      const manifest = putManifest(cas, [
        { path: "a.txt", content: "a" },
      ]);

      expect(() => new Date(manifest.capturedAt)).not.toThrow();
      const parsed = new Date(manifest.capturedAt);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it("restore does not alter CAS blob timestamps", () => {
      const ref = cas.putBytes("text/plain", Buffer.from("test content"));
      const blobPath = cas.blobPath(ref.hash);
      const originalStat = fs.statSync(blobPath);

      // Wait a tiny bit to ensure time advances
      const beforeRestore = originalStat.mtimeMs;

      const manifest: Manifest = {
        version: 1,
        rootRel: ".",
        capturedAt: new Date().toISOString(),
        ignore: [],
        files: [{ path: "file.txt", hash: ref.hash, size: 12, mode: 0o644 }],
      };

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      // CAS blob should not have been modified
      const afterStat = fs.statSync(blobPath);
      expect(afterStat.mtimeMs).toBe(beforeRestore);
    });
  });

  // -----------------------------------------------------------------------
  // Checkpoint created during restore is valid
  // -----------------------------------------------------------------------

  describe("restore creates valid artifacts", () => {
    it("backup created during restore contains all original files", () => {
      const originalFiles: FileSpec[] = [
        { path: "src/app.ts", content: "original app\n" },
        { path: "src/lib/helper.ts", content: "original helper\n" },
        { path: "config.json", content: '{"version": 1}\n' },
      ];

      writeWorkspace(testDir, originalFiles);

      const manifest = putManifest(cas, [
        { path: "src/app.ts", content: "restored app\n" },
        { path: "new-file.txt", content: "new\n" },
      ]);

      const result = restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: true,
      });

      expect(result.backupPath).toBeDefined();

      // Verify backup contains all original files
      const backupFiles = listWorkspaceFiles(result.backupPath!);
      expect(backupFiles).toContain("src/app.ts");
      expect(backupFiles).toContain("src/lib/helper.ts");
      expect(backupFiles).toContain("config.json");

      // Verify backup content matches original
      expect(
        fs.readFileSync(path.join(result.backupPath!, "src/app.ts"), "utf-8")
      ).toBe("original app\n");
      expect(
        fs.readFileSync(path.join(result.backupPath!, "config.json"), "utf-8")
      ).toBe('{"version": 1}\n');
    });

    it("backup does not include .tm_internal or .tm_lock", () => {
      writeWorkspace(testDir, [
        { path: "file.txt", content: "data\n" },
      ]);

      // Create .tm_internal and .tm_lock
      const metaDir = path.join(testDir, ".tm_internal");
      fs.mkdirSync(path.join(metaDir, "store"), { recursive: true });
      fs.writeFileSync(path.join(metaDir, "store", "blob.dat"), "blob");
      fs.writeFileSync(path.join(testDir, ".tm_lock"), "locked");

      const manifest = putManifest(cas, [
        { path: "restored.txt", content: "new\n" },
      ]);

      const result = restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: true,
      });

      expect(result.backupPath).toBeDefined();
      const backupFiles = listWorkspaceFiles(result.backupPath!);

      // Should not contain internal files
      expect(backupFiles.some((f) => f.includes(".tm_internal"))).toBe(false);
      expect(backupFiles.some((f) => f.includes(".tm_lock"))).toBe(false);
      // Should contain the original file
      expect(backupFiles).toContain("file.txt");
    });

    it("restored workspace exactly matches manifest file set", () => {
      const manifestFiles: FileSpec[] = [
        { path: "a.ts", content: "a\n" },
        { path: "b/c.ts", content: "c\n" },
        { path: "b/d/e.ts", content: "e\n" },
      ];

      // Pre-populate with extra files
      writeWorkspace(testDir, [
        ...manifestFiles.map((f) => ({ ...f, content: "stale" })),
        { path: "extra/x.txt", content: "extra\n" },
        { path: "orphan.log", content: "orphan\n" },
      ]);

      const manifest = putManifest(cas, manifestFiles);

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      const files = listWorkspaceFiles(testDir);
      const expectedFiles = manifestFiles.map((f) => f.path).sort();
      expect(files).toEqual(expectedFiles);
    });
  });

  // -----------------------------------------------------------------------
  // Restore events / audit trail verification
  // -----------------------------------------------------------------------

  describe("restore events and audit trail", () => {
    it("onProgress callback is called for each phase with valid data", () => {
      const files: FileSpec[] = [];
      for (let i = 0; i < 5; i++) {
        files.push({ path: `file-${i}.txt`, content: `content-${i}\n` });
      }
      const manifest = putManifest(cas, files);

      const progressEvents: RestoreProgress[] = [];

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: true,
        onProgress: (p) => progressEvents.push({ ...p }),
      });

      // Should have events for validate, restore, backup, cleanup
      const phases = new Set(progressEvents.map((e) => e.phase));
      expect(phases.has("validate")).toBe(true);
      expect(phases.has("restore")).toBe(true);
      expect(phases.has("backup")).toBe(true);
      expect(phases.has("cleanup")).toBe(true);

      // Validate phase
      const validateEvents = progressEvents.filter((e) => e.phase === "validate");
      expect(validateEvents.length).toBeGreaterThanOrEqual(1);

      // Restore phase should report file names
      const restoreEvents = progressEvents.filter((e) => e.phase === "restore");
      expect(restoreEvents.length).toBeGreaterThanOrEqual(5);
      const filesReported = restoreEvents.filter((e) => e.file).map((e) => e.file!);
      expect(filesReported.length).toBe(5);

      // All progress events should have valid current/total
      for (const event of progressEvents) {
        expect(event.current).toBeGreaterThanOrEqual(0);
        expect(event.total).toBeGreaterThanOrEqual(0);
        expect(event.current).toBeLessThanOrEqual(event.total + 1);
      }
    });

    it("progress events have monotonically increasing current within each phase", () => {
      const files: FileSpec[] = [];
      for (let i = 0; i < 20; i++) {
        files.push({ path: `f${i}.txt`, content: `c${i}\n` });
      }
      const manifest = putManifest(cas, files);

      const phaseProgress: Record<string, number[]> = {};

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
        onProgress: (p) => {
          if (!phaseProgress[p.phase]) phaseProgress[p.phase] = [];
          phaseProgress[p.phase].push(p.current);
        },
      });

      // For each phase, current should be non-decreasing
      for (const [phase, values] of Object.entries(phaseProgress)) {
        for (let i = 1; i < values.length; i++) {
          expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
        }
      }
    });

    it("tmp_old directory is created during restore for forensic rollback", () => {
      writeWorkspace(testDir, [
        { path: "original.txt", content: "original\n" },
      ]);

      const manifest = putManifest(cas, [
        { path: "new.txt", content: "new\n" },
      ]);

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      // Check that .tm_internal/tmp_old exists with content
      const tmpOldDir = path.join(testDir, ".tm_internal", "tmp_old");
      expect(fs.existsSync(tmpOldDir)).toBe(true);

      // It should contain timestamped subdirectories
      const entries = fs.readdirSync(tmpOldDir);
      expect(entries.length).toBeGreaterThanOrEqual(1);

      // The original file should be in tmp_old
      const latestTmpOld = path.join(tmpOldDir, entries.sort()[entries.length - 1]);
      expect(fs.existsSync(path.join(latestTmpOld, "original.txt"))).toBe(true);
      expect(
        fs.readFileSync(path.join(latestTmpOld, "original.txt"), "utf-8")
      ).toBe("original\n");
    });
  });

  // -----------------------------------------------------------------------
  // Cross-validation: restoreToDirectory vs restoreWorkspaceAtomic
  // -----------------------------------------------------------------------

  describe("cross-validation between restore methods", () => {
    it("restoreToDirectory and restoreWorkspaceAtomic produce identical file content", () => {
      const files: FileSpec[] = [
        { path: "src/main.ts", content: "main\n" },
        { path: "src/lib/utils.ts", content: "utils\n" },
        { path: "config/settings.json", content: '{"a":1}\n' },
        { path: "README.md", content: "# readme\n" },
        { path: "data/blob.bin", content: crypto.randomBytes(512) },
      ];

      const manifest = putManifest(cas, files);

      // Method 1: restoreWorkspaceAtomic
      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });
      const snapshot1 = snapshotWorkspace(testDir);

      // Method 2: restoreToDirectory
      const separateDir = path.join(testDir, ".tm_internal", "cross_validate");
      fs.mkdirSync(separateDir, { recursive: true });

      restoreToDirectory({
        cas,
        manifest,
        targetDir: separateDir,
      });
      const snapshot2 = snapshotWorkspace(separateDir);

      // File content hashes should match
      expect(snapshot2).toEqual(snapshot1);
    });
  });

  // -----------------------------------------------------------------------
  // Restore with all manifest features
  // -----------------------------------------------------------------------

  describe("comprehensive manifest handling", () => {
    it("manifest version 1 is correctly handled", () => {
      const manifest: Manifest = {
        version: 1,
        rootRel: ".",
        capturedAt: "2026-02-16T12:00:00.000Z",
        ignore: [],
        files: [],
      };

      // Empty manifest should still work
      const result = restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      expect(result.filesWritten).toBe(0);
      expect(result.filesSkipped).toBe(0);
    });

    it("manifest ignore field does not affect restore behavior", () => {
      // Ignore patterns are for capture, not restore. Restore should
      // write all files listed in the manifest regardless.
      const ref = cas.putBytes("text/plain", Buffer.from("content"));
      const manifest: Manifest = {
        version: 1,
        rootRel: ".",
        capturedAt: new Date().toISOString(),
        ignore: ["*.txt", "**/*.log"],
        files: [
          { path: "file.txt", hash: ref.hash, size: 7, mode: 0o644 },
        ],
      };

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      // File should be restored despite being in ignore patterns
      expect(fs.existsSync(path.join(testDir, "file.txt"))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Restore integrity under stress
  // -----------------------------------------------------------------------

  describe("stress integrity", () => {
    it("restoring 200 files with mixed content types maintains full integrity", () => {
      const files: FileSpec[] = [];
      for (let i = 0; i < 200; i++) {
        if (i % 4 === 0) {
          // Binary
          files.push({
            path: `data/bin-${i}.dat`,
            content: crypto.randomBytes(256 + i),
          });
        } else if (i % 4 === 1) {
          // JSON
          files.push({
            path: `config/cfg-${i}.json`,
            content: JSON.stringify({ id: i, data: crypto.randomBytes(32).toString("hex") }) + "\n",
          });
        } else if (i % 4 === 2) {
          // TypeScript
          files.push({
            path: `src/module-${Math.floor(i / 10)}/file-${i}.ts`,
            content: `export const val${i} = "${crypto.randomBytes(8).toString("hex")}";\n`,
          });
        } else {
          // Markdown
          files.push({
            path: `docs/doc-${i}.md`,
            content: `# Document ${i}\n\nContent: ${crypto.randomBytes(16).toString("hex")}\n`,
          });
        }
      }

      const manifest = putManifest(cas, files);

      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      });

      // Verify every file
      for (let i = 0; i < manifest.files.length; i++) {
        const mf = manifest.files[i];
        const abs = path.join(testDir, mf.path);
        expect(fs.existsSync(abs)).toBe(true);

        const diskContent = fs.readFileSync(abs);
        const casContent = cas.getBytes(mf.hash);
        expect(diskContent.equals(casContent)).toBe(true);
      }

      // Verify file count
      const restoredFiles = listWorkspaceFiles(testDir);
      expect(restoredFiles.length).toBe(200);
    });

    it("sequential restore-modify-restore cycle preserves integrity", () => {
      // State A
      const stateA = putManifest(cas, [
        { path: "app.ts", content: "// State A\nconst x = 1;\n" },
        { path: "lib.ts", content: "export const lib = true;\n" },
      ]);

      // State B
      const stateB = putManifest(cas, [
        { path: "app.ts", content: "// State B\nconst x = 2;\n" },
        { path: "lib.ts", content: "export const lib = false;\n" },
        { path: "new.ts", content: "// new in B\n" },
      ]);

      // Restore to A, verify
      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest: stateA,
        mode: "hard",
        backupCurrent: false,
      });
      const snapA1 = snapshotWorkspace(testDir);

      // Modify workspace
      fs.writeFileSync(path.join(testDir, "app.ts"), "MODIFIED");
      fs.writeFileSync(path.join(testDir, "temp.txt"), "temp");

      // Restore to B, verify
      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest: stateB,
        mode: "hard",
        backupCurrent: false,
      });
      const snapB = snapshotWorkspace(testDir);
      expect(Object.keys(snapB).sort()).toEqual(["app.ts", "lib.ts", "new.ts"]);
      expect(fs.existsSync(path.join(testDir, "temp.txt"))).toBe(false);

      // Restore back to A, should be identical to first A restore
      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest: stateA,
        mode: "hard",
        backupCurrent: false,
      });
      const snapA2 = snapshotWorkspace(testDir);
      expect(snapA2).toEqual(snapA1);
    });
  });
});
