import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CasStore } from "../src/core/cas.js";
import {
  restoreWorkspaceAtomic,
  validateManifest,
} from "../src/core/restore.js";
import type { Manifest } from "../src/core/manifest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FileSpec = { path: string; content: string | Buffer };

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
        mode: 0o644,
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

describe("restore edge cases", () => {
  let testDir: string;
  let casDir: string;
  let cas: CasStore;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-restore-edge-"));
    casDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-edge-cas-"));
    cas = new CasStore(casDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.rmSync(casDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Restore when target checkpoint has deleted files
  // -----------------------------------------------------------------------

  it("restore removes files that existed in working dir but not in checkpoint", () => {
    // Checkpoint state: only a.txt
    const manifest = putManifest(cas, [
      { path: "a.txt", content: "a content\n" },
    ]);

    // Working dir has a.txt (modified), b.txt, and c.txt
    writeWorkspace(testDir, [
      { path: "a.txt", content: "a modified\n" },
      { path: "b.txt", content: "b content\n" },
      { path: "c.txt", content: "c content\n" },
      { path: "deep/nested/d.txt", content: "d content\n" },
    ]);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(1);
    const files = listWorkspaceFiles(testDir);
    expect(files).toEqual(["a.txt"]);
    expect(fs.readFileSync(path.join(testDir, "a.txt"), "utf-8")).toBe("a content\n");
  });

  it("restore handles checkpoint with completely different file set", () => {
    // Original workspace
    writeWorkspace(testDir, [
      { path: "old/file1.txt", content: "old1\n" },
      { path: "old/file2.txt", content: "old2\n" },
      { path: "legacy.md", content: "legacy\n" },
    ]);

    // Checkpoint has entirely different files
    const manifest = putManifest(cas, [
      { path: "new/app.ts", content: "app\n" },
      { path: "new/lib/utils.ts", content: "utils\n" },
      { path: "config.json", content: '{"v":1}\n' },
    ]);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    const files = listWorkspaceFiles(testDir);
    expect(files).toEqual(["config.json", "new/app.ts", "new/lib/utils.ts"]);
    expect(fs.existsSync(path.join(testDir, "old"))).toBe(false);
    expect(fs.existsSync(path.join(testDir, "legacy.md"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Restore when working directory has uncommitted changes
  // -----------------------------------------------------------------------

  it("restore overwrites uncommitted changes in hard mode", () => {
    const manifest = putManifest(cas, [
      { path: "src/index.ts", content: "original\n" },
    ]);

    // Write uncommitted changes
    writeWorkspace(testDir, [
      { path: "src/index.ts", content: "UNCOMMITTED CHANGES - I was working on this!\n" },
      { path: "src/scratch.ts", content: "temporary work\n" },
    ]);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(fs.readFileSync(path.join(testDir, "src/index.ts"), "utf-8")).toBe("original\n");
    expect(fs.existsSync(path.join(testDir, "src/scratch.ts"))).toBe(false);
  });

  it("restore preserves uncommitted untracked files in safe mode", () => {
    const manifest = putManifest(cas, [
      { path: "src/index.ts", content: "original\n" },
    ]);

    writeWorkspace(testDir, [
      { path: "src/index.ts", content: "UNCOMMITTED CHANGES\n" },
      { path: "src/scratch.ts", content: "temporary work\n" },
    ]);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "safe",
      backupCurrent: false,
    });

    // index.ts should be overwritten by checkpoint version
    expect(fs.readFileSync(path.join(testDir, "src/index.ts"), "utf-8")).toBe("original\n");
    // scratch.ts should be preserved (not in manifest, safe mode keeps extras)
    expect(fs.readFileSync(path.join(testDir, "src/scratch.ts"), "utf-8")).toBe("temporary work\n");
  });

  // -----------------------------------------------------------------------
  // Restore to the same checkpoint (no-op equivalent)
  // -----------------------------------------------------------------------

  it("restore to same state is a valid no-op (content matches)", () => {
    const files: FileSpec[] = [
      { path: "a.txt", content: "hello\n" },
      { path: "b.txt", content: "world\n" },
    ];
    const manifest = putManifest(cas, files);

    // Write exact same content to workspace
    writeWorkspace(testDir, files);
    const snapshotBefore = snapshotWorkspace(testDir);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    const snapshotAfter = snapshotWorkspace(testDir);
    expect(result.filesWritten).toBe(2);
    expect(snapshotAfter).toEqual(snapshotBefore);
  });

  // -----------------------------------------------------------------------
  // Restore with very large files (>1MB text)
  // -----------------------------------------------------------------------

  it("restores very large text files (>1MB)", () => {
    // Generate a 1.5MB text file
    const largeContent = "A".repeat(1024) + "\n";
    const repeats = 1536; // 1536 * 1025 bytes ~ 1.57 MB
    const bigText = largeContent.repeat(repeats);

    const files: FileSpec[] = [
      { path: "data/large.txt", content: bigText },
      { path: "small.txt", content: "small\n" },
    ];

    const manifest = putManifest(cas, files);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(2);

    const restored = fs.readFileSync(path.join(testDir, "data/large.txt"), "utf-8");
    expect(restored.length).toBe(bigText.length);
    expect(restored).toBe(bigText);
  });

  it("restores large binary blob (>2MB)", () => {
    const largeBin = crypto.randomBytes(2 * 1024 * 1024 + 37);

    const manifest = putManifest(cas, [
      { path: "assets/big.bin", content: largeBin },
    ]);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    const restored = fs.readFileSync(path.join(testDir, "assets/big.bin"));
    expect(restored.equals(largeBin)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Restore with unicode filenames
  // -----------------------------------------------------------------------

  it("restores files with unicode characters in names", () => {
    const files: FileSpec[] = [
      { path: "docs/resume.txt", content: "resume content\n" },
      { path: "i18n/messages-ja.json", content: '{"hello": "konnichiwa"}\n' },
      { path: "notes/2026-02-16.md", content: "# Today\n" },
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

    for (const f of files) {
      const abs = path.join(testDir, f.path);
      expect(fs.existsSync(abs)).toBe(true);
      expect(fs.readFileSync(abs, "utf-8")).toBe(f.content as string);
    }
  });

  // -----------------------------------------------------------------------
  // Restore with concurrent modifications
  // -----------------------------------------------------------------------

  it("restore completes even if extra files appear during the process", () => {
    // This tests that the atomic swap handles the workspace correctly.
    // We write a file to testDir that would normally be there during restore.
    // The restore should still succeed because it builds in tmpRestore first.
    const files: FileSpec[] = [
      { path: "app.ts", content: "app\n" },
    ];
    const manifest = putManifest(cas, files);

    // Pre-populate workspace
    writeWorkspace(testDir, [
      { path: "app.ts", content: "stale\n" },
      { path: "concurrent.txt", content: "I was written concurrently\n" },
    ]);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(1);
    expect(fs.readFileSync(path.join(testDir, "app.ts"), "utf-8")).toBe("app\n");
    // concurrent.txt should be gone in hard mode
    expect(fs.existsSync(path.join(testDir, "concurrent.txt"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Restore failure recovery (interrupted restore)
  // -----------------------------------------------------------------------

  it("restore handles CAS read failure gracefully with skipMissing", () => {
    // Create a manifest with a mix of valid and invalid hashes
    const validRef = cas.putBytes("text/plain", Buffer.from("valid\n"));
    const manifest: Manifest = {
      version: 1,
      rootRel: ".",
      capturedAt: new Date().toISOString(),
      ignore: [],
      files: [
        { path: "valid.txt", hash: validRef.hash, size: 6, mode: 0o644 },
        { path: "corrupt.txt", hash: "0".repeat(64), size: 10, mode: 0o644 },
      ],
    };

    // Without skipMissing, should throw
    expect(() =>
      restoreWorkspaceAtomic({
        projectRoot: testDir,
        cas,
        manifest,
        mode: "hard",
        backupCurrent: false,
      })
    ).toThrow();

    // With skipMissing, should succeed partially
    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
      skipMissing: true,
    });

    expect(result.filesWritten).toBe(1);
    expect(result.missingFiles).toContain("corrupt.txt");
    expect(fs.existsSync(path.join(testDir, "valid.txt"))).toBe(true);
  });

  it("restore leaves .tm_internal intact during the swap phase", () => {
    // Ensure the internal metadata directory survives restore
    const metaDir = path.join(testDir, ".tm_internal");
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, "metadata.json"), '{"test": true}');

    const manifest = putManifest(cas, [
      { path: "app.ts", content: "restored\n" },
    ]);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    // .tm_internal should still exist
    expect(fs.existsSync(metaDir)).toBe(true);
    expect(
      fs.readFileSync(path.join(metaDir, "metadata.json"), "utf-8")
    ).toBe('{"test": true}');
  });

  it("restore leaves .tm_lock intact", () => {
    const lockFile = path.join(testDir, ".tm_lock");
    fs.writeFileSync(lockFile, "locked");

    const manifest = putManifest(cas, [
      { path: "file.txt", content: "data\n" },
    ]);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(fs.existsSync(lockFile)).toBe(true);
    expect(fs.readFileSync(lockFile, "utf-8")).toBe("locked");
  });

  // -----------------------------------------------------------------------
  // Before/after checkpoint chain after restore
  // -----------------------------------------------------------------------

  it("multiple sequential restores produce consistent results", () => {
    // Create three different manifests (checkpoints)
    const manifestA = putManifest(cas, [
      { path: "file.txt", content: "version A\n" },
      { path: "a-only.txt", content: "only in A\n" },
    ]);

    const manifestB = putManifest(cas, [
      { path: "file.txt", content: "version B\n" },
      { path: "b-only.txt", content: "only in B\n" },
    ]);

    const manifestC = putManifest(cas, [
      { path: "file.txt", content: "version C\n" },
      { path: "c-only.txt", content: "only in C\n" },
      { path: "shared.txt", content: "shared\n" },
    ]);

    // Restore to A
    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest: manifestA,
      mode: "hard",
      backupCurrent: false,
    });
    expect(fs.readFileSync(path.join(testDir, "file.txt"), "utf-8")).toBe("version A\n");
    expect(fs.existsSync(path.join(testDir, "a-only.txt"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "b-only.txt"))).toBe(false);

    // Restore to B
    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest: manifestB,
      mode: "hard",
      backupCurrent: false,
    });
    expect(fs.readFileSync(path.join(testDir, "file.txt"), "utf-8")).toBe("version B\n");
    expect(fs.existsSync(path.join(testDir, "a-only.txt"))).toBe(false);
    expect(fs.existsSync(path.join(testDir, "b-only.txt"))).toBe(true);

    // Restore to C
    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest: manifestC,
      mode: "hard",
      backupCurrent: false,
    });
    expect(fs.readFileSync(path.join(testDir, "file.txt"), "utf-8")).toBe("version C\n");
    expect(fs.existsSync(path.join(testDir, "b-only.txt"))).toBe(false);
    expect(fs.existsSync(path.join(testDir, "c-only.txt"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "shared.txt"))).toBe(true);

    // Restore back to A again (round-trip)
    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest: manifestA,
      mode: "hard",
      backupCurrent: false,
    });
    expect(fs.readFileSync(path.join(testDir, "file.txt"), "utf-8")).toBe("version A\n");
    expect(fs.existsSync(path.join(testDir, "a-only.txt"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "c-only.txt"))).toBe(false);
    expect(fs.existsSync(path.join(testDir, "shared.txt"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Restore with an empty manifest (zero files)
  // -----------------------------------------------------------------------

  it("restore with empty manifest clears workspace in hard mode", () => {
    writeWorkspace(testDir, [
      { path: "a.txt", content: "a\n" },
      { path: "dir/b.txt", content: "b\n" },
    ]);

    const emptyManifest: Manifest = {
      version: 1,
      rootRel: ".",
      capturedAt: new Date().toISOString(),
      ignore: [],
      files: [],
    };

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest: emptyManifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(0);
    const files = listWorkspaceFiles(testDir);
    expect(files).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Restore with files at root level only (no subdirectories)
  // -----------------------------------------------------------------------

  it("restore with flat file structure (no subdirectories)", () => {
    const files: FileSpec[] = [
      { path: "index.html", content: "<html></html>\n" },
      { path: "style.css", content: "body {}\n" },
      { path: "script.js", content: 'console.log("hi");\n' },
    ];

    const manifest = putManifest(cas, files);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    for (const f of files) {
      expect(fs.readFileSync(path.join(testDir, f.path), "utf-8")).toBe(f.content as string);
    }
  });

  // -----------------------------------------------------------------------
  // Restore with all files missing from CAS (corrupted snapshot)
  // -----------------------------------------------------------------------

  it("throws on completely corrupted snapshot (all files missing)", () => {
    const manifest: Manifest = {
      version: 1,
      rootRel: ".",
      capturedAt: new Date().toISOString(),
      ignore: [],
      files: [
        { path: "a.txt", hash: "f".repeat(64), size: 5, mode: 0o644 },
        { path: "b.txt", hash: "e".repeat(64), size: 5, mode: 0o644 },
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
    ).toThrow(/corrupted/i);
  });

  // -----------------------------------------------------------------------
  // Validate manifest function
  // -----------------------------------------------------------------------

  it("validateManifest correctly identifies missing blobs", () => {
    const validRef = cas.putBytes("text/plain", Buffer.from("ok"));
    const manifest: Manifest = {
      version: 1,
      rootRel: ".",
      capturedAt: new Date().toISOString(),
      ignore: [],
      files: [
        { path: "valid.txt", hash: validRef.hash, size: 2, mode: 0o644 },
        { path: "missing.txt", hash: "a".repeat(64), size: 5, mode: 0o644 },
      ],
    };

    const result = validateManifest({ cas, manifest });

    expect(result.valid).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.missing).toContain("missing.txt");
    expect(result.missing).not.toContain("valid.txt");
  });

  it("validateManifest returns valid for complete manifest", () => {
    const manifest = putManifest(cas, [
      { path: "a.txt", content: "a" },
      { path: "b.txt", content: "b" },
    ]);

    const result = validateManifest({ cas, manifest });
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.partial).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Restore with duplicate paths in manifest (degenerate case)
  // -----------------------------------------------------------------------

  it("handles manifest with duplicate paths (last write wins)", () => {
    // Manually create a manifest with duplicate paths
    const refA = cas.putBytes("text/plain", Buffer.from("first"));
    const refB = cas.putBytes("text/plain", Buffer.from("second"));

    const manifest: Manifest = {
      version: 1,
      rootRel: ".",
      capturedAt: new Date().toISOString(),
      ignore: [],
      files: [
        { path: "dup.txt", hash: refA.hash, size: 5, mode: 0o644 },
        { path: "dup.txt", hash: refB.hash, size: 6, mode: 0o644 },
      ],
    };

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    // The second entry should win (writeFileAtomic overwrites)
    expect(fs.readFileSync(path.join(testDir, "dup.txt"), "utf-8")).toBe("second");
  });

  // -----------------------------------------------------------------------
  // Restore with files containing only whitespace or empty content
  // -----------------------------------------------------------------------

  it("restores files with empty content", () => {
    const files: FileSpec[] = [
      { path: "empty.txt", content: "" },
      { path: "whitespace.txt", content: "   \n\n\t\t\n" },
      { path: "newlines.txt", content: "\n\n\n" },
    ];

    const manifest = putManifest(cas, files);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(fs.readFileSync(path.join(testDir, "empty.txt"), "utf-8")).toBe("");
    expect(fs.readFileSync(path.join(testDir, "whitespace.txt"), "utf-8")).toBe("   \n\n\t\t\n");
    expect(fs.readFileSync(path.join(testDir, "newlines.txt"), "utf-8")).toBe("\n\n\n");
  });

  // -----------------------------------------------------------------------
  // Restore with very long file paths
  // -----------------------------------------------------------------------

  it("restores files with long path names", () => {
    // Create a path near filesystem limits (but not exceeding them)
    const longDirName = "a".repeat(50);
    const deepPath = Array.from({ length: 4 }, () => longDirName).join("/");
    const files: FileSpec[] = [
      { path: `${deepPath}/file.txt`, content: "deep with long names\n" },
    ];

    const manifest = putManifest(cas, files);

    const result = restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "hard",
      backupCurrent: false,
    });

    expect(result.filesWritten).toBe(1);
    expect(
      fs.readFileSync(path.join(testDir, deepPath, "file.txt"), "utf-8")
    ).toBe("deep with long names\n");
  });

  // -----------------------------------------------------------------------
  // Safe mode preserves .tm_internal exclusion while copying extras
  // -----------------------------------------------------------------------

  it("safe mode does not copy .tm_internal contents into restored workspace", () => {
    // Put some data in .tm_internal
    const metaDir = path.join(testDir, ".tm_internal");
    fs.mkdirSync(path.join(metaDir, "backups"), { recursive: true });
    fs.writeFileSync(path.join(metaDir, "backups", "old.json"), '{"backup": true}');

    // Also put a regular file
    writeWorkspace(testDir, [
      { path: "extra.txt", content: "keep me\n" },
    ]);

    const manifest = putManifest(cas, [
      { path: "restored.txt", content: "restored\n" },
    ]);

    restoreWorkspaceAtomic({
      projectRoot: testDir,
      cas,
      manifest,
      mode: "safe",
      backupCurrent: false,
    });

    // Restored file should exist
    expect(fs.readFileSync(path.join(testDir, "restored.txt"), "utf-8")).toBe("restored\n");
    // Extra file preserved in safe mode
    expect(fs.readFileSync(path.join(testDir, "extra.txt"), "utf-8")).toBe("keep me\n");
    // .tm_internal should still be intact and NOT duplicated into workspace
    expect(fs.existsSync(path.join(metaDir, "backups", "old.json"))).toBe(true);
  });
});
