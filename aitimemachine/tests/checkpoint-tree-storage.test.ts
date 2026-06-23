import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteRepo } from "../src/store/sqlite_repo.js";
import { persistCheckpointTrees } from "../src/core/checkpoint-tree-storage.js";
import { computeTreeHash } from "../src/core/tree-builder.js";

describe("checkpoint tree storage", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-tree-store-"));
    dbPath = path.join(tmpDir, "db.sqlite");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persists canonical trees and resolves directories by path", () => {
    const repo = new SqliteRepo(dbPath);
    repo.insertProject({
      projectId: "proj1",
      rootPath: "/tmp/proj1",
      name: "proj1",
      ignoreGlobs: [],
    });

    const rootTreeHash = persistCheckpointTrees(repo, "proj1", [
      { path: "src/index.ts", hash: "h1", size: 10, mode: 0o644 },
      { path: "src/lib/util.ts", hash: "h2", size: 20, mode: 0o644 },
      { path: "README.md", hash: "h3", size: 5, mode: 0o644 },
    ]);

    expect(rootTreeHash).toBeTruthy();
    const root = repo.getTreeByHash?.("proj1", rootTreeHash as string);
    expect(root).not.toBeNull();
    const src = repo.getTreeAtPath?.("proj1", rootTreeHash as string, "src");
    expect(src).not.toBeNull();
    expect(src?.entries.some((e) => e.name === "index.ts" && e.type === "blob")).toBe(true);
  });

  it("produces deterministic root tree hash regardless of file order", () => {
    const repo = new SqliteRepo(dbPath);
    repo.insertProject({
      projectId: "proj1",
      rootPath: "/tmp/proj1",
      name: "proj1",
      ignoreGlobs: [],
    });

    const filesA = [
      { path: "b.txt", hash: "hb", size: 2, mode: 0o644 },
      { path: "a.txt", hash: "ha", size: 1, mode: 0o644 },
      { path: "src/z.ts", hash: "hz", size: 3, mode: 0o644 },
    ];
    const filesB = [...filesA].reverse();

    const hashA = persistCheckpointTrees(repo, "proj1", filesA);
    const hashB = persistCheckpointTrees(repo, "proj1", filesB);

    expect(hashA).toBe(hashB);
  });

  it("traverses parent->child relationships correctly through nested trees", () => {
    const repo = new SqliteRepo(dbPath);
    repo.insertProject({
      projectId: "proj_traverse",
      rootPath: "/tmp/proj_traverse",
      name: "proj_traverse",
      ignoreGlobs: [],
    });

    const rootTreeHash = persistCheckpointTrees(repo, "proj_traverse", [
      { path: "src/components/Button.tsx", hash: "hbutton", size: 100, mode: 0o644 },
      { path: "src/components/Input.tsx", hash: "hinput", size: 80, mode: 0o644 },
      { path: "src/utils/hash.ts", hash: "hhash", size: 50, mode: 0o644 },
      { path: "src/index.ts", hash: "hindex", size: 30, mode: 0o644 },
      { path: "package.json", hash: "hpkg", size: 200, mode: 0o644 },
    ]);

    expect(rootTreeHash).toBeTruthy();

    // Root tree should have "src" (tree) and "package.json" (blob)
    const root = repo.getTreeByHash?.("proj_traverse", rootTreeHash as string);
    expect(root).not.toBeNull();
    expect(root!.entries.some((e) => e.name === "src" && e.type === "tree")).toBe(true);
    expect(root!.entries.some((e) => e.name === "package.json" && e.type === "blob")).toBe(true);

    // Walk root -> src
    const srcEntry = root!.entries.find((e) => e.name === "src" && e.type === "tree");
    expect(srcEntry).toBeDefined();
    const srcTree = repo.getTreeByHash?.("proj_traverse", srcEntry!.hash);
    expect(srcTree).not.toBeNull();

    // src should have "components" (tree), "utils" (tree), "index.ts" (blob)
    expect(srcTree!.entries.some((e) => e.name === "components" && e.type === "tree")).toBe(true);
    expect(srcTree!.entries.some((e) => e.name === "utils" && e.type === "tree")).toBe(true);
    expect(srcTree!.entries.some((e) => e.name === "index.ts" && e.type === "blob")).toBe(true);

    // Walk src -> components
    const componentsEntry = srcTree!.entries.find((e) => e.name === "components" && e.type === "tree");
    expect(componentsEntry).toBeDefined();
    const componentsTree = repo.getTreeByHash?.("proj_traverse", componentsEntry!.hash);
    expect(componentsTree).not.toBeNull();
    expect(componentsTree!.entries).toHaveLength(2);
    expect(componentsTree!.entries.some((e) => e.name === "Button.tsx" && e.hash === "hbutton")).toBe(true);
    expect(componentsTree!.entries.some((e) => e.name === "Input.tsx" && e.hash === "hinput")).toBe(true);

    // Walk src -> utils
    const utilsEntry = srcTree!.entries.find((e) => e.name === "utils" && e.type === "tree");
    expect(utilsEntry).toBeDefined();
    const utilsTree = repo.getTreeByHash?.("proj_traverse", utilsEntry!.hash);
    expect(utilsTree).not.toBeNull();
    expect(utilsTree!.entries).toHaveLength(1);
    expect(utilsTree!.entries[0].name).toBe("hash.ts");
    expect(utilsTree!.entries[0].hash).toBe("hhash");

    // Also verify getTreeAtPath traversal for deeply nested path
    const componentsViaPath = repo.getTreeAtPath?.("proj_traverse", rootTreeHash as string, "src/components");
    expect(componentsViaPath).not.toBeNull();
    expect(componentsViaPath!.hash).toBe(componentsEntry!.hash);
  });

  it("verifies tree hash integrity - recomputed hash matches stored hash", () => {
    const repo = new SqliteRepo(dbPath);
    repo.insertProject({
      projectId: "proj_integrity",
      rootPath: "/tmp/proj_integrity",
      name: "proj_integrity",
      ignoreGlobs: [],
    });

    const rootTreeHash = persistCheckpointTrees(repo, "proj_integrity", [
      { path: "a.ts", hash: "ha", size: 10, mode: 0o644 },
      { path: "b.ts", hash: "hb", size: 20, mode: 0o644 },
      { path: "lib/c.ts", hash: "hc", size: 30, mode: 0o644 },
      { path: "lib/d.ts", hash: "hd", size: 40, mode: 0o644 },
    ]);

    expect(rootTreeHash).toBeTruthy();

    // Retrieve every stored tree and verify its hash matches the recomputed hash from its entries
    const root = repo.getTreeByHash?.("proj_integrity", rootTreeHash as string);
    expect(root).not.toBeNull();
    const recomputedRootHash = computeTreeHash(root!.entries);
    expect(recomputedRootHash).toBe(root!.hash);
    expect(recomputedRootHash).toBe(rootTreeHash);

    // Verify the child tree too
    const libEntry = root!.entries.find((e) => e.name === "lib" && e.type === "tree");
    expect(libEntry).toBeDefined();
    const libTree = repo.getTreeByHash?.("proj_integrity", libEntry!.hash);
    expect(libTree).not.toBeNull();
    const recomputedLibHash = computeTreeHash(libTree!.entries);
    expect(recomputedLibHash).toBe(libTree!.hash);
    expect(recomputedLibHash).toBe(libEntry!.hash);
  });

  it("stores and retrieves trees correctly after round-trip through database", () => {
    const repo = new SqliteRepo(dbPath);
    repo.insertProject({
      projectId: "proj_roundtrip",
      rootPath: "/tmp/proj_roundtrip",
      name: "proj_roundtrip",
      ignoreGlobs: [],
    });

    const files = [
      { path: "src/main.ts", hash: "hmain", size: 100, mode: 0o644 },
      { path: "src/config.ts", hash: "hconfig", size: 50, mode: 0o755 },
      { path: "test/main.test.ts", hash: "htest", size: 80, mode: 0o644 },
    ];

    const rootTreeHash = persistCheckpointTrees(repo, "proj_roundtrip", files);
    expect(rootTreeHash).toBeTruthy();

    // Open a fresh repo instance pointing at same DB to prove persistence
    const repo2 = new SqliteRepo(dbPath);
    const root = repo2.getTreeByHash?.("proj_roundtrip", rootTreeHash as string);
    expect(root).not.toBeNull();
    expect(root!.hash).toBe(rootTreeHash);

    // Verify all blob entries can be traced
    const srcTree = repo2.getTreeAtPath?.("proj_roundtrip", rootTreeHash as string, "src");
    expect(srcTree).not.toBeNull();
    const mainEntry = srcTree!.entries.find((e) => e.name === "main.ts");
    expect(mainEntry).toBeDefined();
    expect(mainEntry!.hash).toBe("hmain");
    expect(mainEntry!.size).toBe(100);
    expect(mainEntry!.mode).toBe(0o644);

    const configEntry = srcTree!.entries.find((e) => e.name === "config.ts");
    expect(configEntry).toBeDefined();
    expect(configEntry!.hash).toBe("hconfig");
    expect(configEntry!.mode).toBe(0o755);
  });

  it("returns null for non-existent tree paths", () => {
    const repo = new SqliteRepo(dbPath);
    repo.insertProject({
      projectId: "proj_missing",
      rootPath: "/tmp/proj_missing",
      name: "proj_missing",
      ignoreGlobs: [],
    });

    const rootTreeHash = persistCheckpointTrees(repo, "proj_missing", [
      { path: "a.ts", hash: "ha", size: 10, mode: 0o644 },
    ]);

    expect(rootTreeHash).toBeTruthy();

    // Non-existent path
    const missing = repo.getTreeAtPath?.("proj_missing", rootTreeHash as string, "does/not/exist");
    expect(missing).toBeNull();

    // Non-existent root hash
    const missingRoot = repo.getTreeByHash?.("proj_missing", "nonexistenthash");
    expect(missingRoot).toBeNull();
  });

  it("content-deduplicates identical subtrees", () => {
    const repo = new SqliteRepo(dbPath);
    repo.insertProject({
      projectId: "proj_dedup",
      rootPath: "/tmp/proj_dedup",
      name: "proj_dedup",
      ignoreGlobs: [],
    });

    // Two directories with identical content should produce the same tree hash
    const rootTreeHash = persistCheckpointTrees(repo, "proj_dedup", [
      { path: "dirA/file.ts", hash: "hx", size: 10, mode: 0o644 },
      { path: "dirB/file.ts", hash: "hx", size: 10, mode: 0o644 },
    ]);

    expect(rootTreeHash).toBeTruthy();
    const root = repo.getTreeByHash?.("proj_dedup", rootTreeHash as string);
    expect(root).not.toBeNull();

    const dirAEntry = root!.entries.find((e) => e.name === "dirA");
    const dirBEntry = root!.entries.find((e) => e.name === "dirB");
    expect(dirAEntry).toBeDefined();
    expect(dirBEntry).toBeDefined();

    // Both should have the same tree hash since they contain identical content
    expect(dirAEntry!.hash).toBe(dirBEntry!.hash);
  });
});
