/**
 * Tree builder: converts a flat file list into a Git-like tree hierarchy.
 *
 * Given a list of FileEntry objects (flat paths like "src/utils/hash.ts"),
 * this module builds a recursive tree structure where each directory is
 * represented by a Tree object containing TreeEntry references to blobs
 * (files) and child trees (subdirectories).
 *
 * Trees are content-addressed: the hash of a tree is derived from the
 * sorted, serialized entries. Identical directory states produce the
 * same hash, enabling efficient deduplication and comparison.
 */

import crypto from "node:crypto";
import type { FileEntry, TreeEntry, Tree } from "./types.js";

/**
 * Internal node used during tree construction.
 * Represents a directory that accumulates its child blobs and subdirectories.
 */
interface TreeNode {
  /** Files directly in this directory */
  blobs: Map<string, { hash: string; mode: number; size: number }>;
  /** Subdirectories */
  children: Map<string, TreeNode>;
}

/**
 * Compute the content-addressed hash for a tree from its sorted entries.
 * Follows the same deterministic approach as Git: entries are sorted by name
 * and then hashed together.
 */
export function computeTreeHash(entries: TreeEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const canonical = sorted
    .map((e) => `${e.type}:${e.hash}:${e.name}:${e.mode}:${e.size}`)
    .join("\n");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Build a full tree hierarchy from a flat list of file entries.
 *
 * @param projectId - The project this tree belongs to
 * @param files - Flat list of file entries with relative paths (posix-style)
 * @returns An array of Tree objects (one per directory) and the root tree hash
 */
export function buildTreesFromFiles(
  projectId: string,
  files: FileEntry[]
): { trees: Tree[]; rootTreeHash: string } {
  // Step 1: Build an in-memory directory tree
  const root: TreeNode = { blobs: new Map(), children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts.pop()!;

    // Walk/create the directory chain
    let current = root;
    for (const dir of parts) {
      if (!current.children.has(dir)) {
        current.children.set(dir, { blobs: new Map(), children: new Map() });
      }
      current = current.children.get(dir)!;
    }

    // Add the file as a blob entry in its directory
    current.blobs.set(fileName, {
      hash: file.hash,
      mode: file.mode ?? 0o644,
      size: file.size,
    });
  }

  // Step 2: Recursively convert TreeNodes into Tree objects (bottom-up)
  const allTrees: Tree[] = [];

  function buildTree(node: TreeNode, dirPath: string): { hash: string; entries: TreeEntry[] } {
    const entries: TreeEntry[] = [];

    // Process subdirectories first (recursive, bottom-up)
    for (const [childName, childNode] of node.children) {
      const childPath = dirPath === "/" ? `${childName}/` : `${dirPath}${childName}/`;
      const childResult = buildTree(childNode, childPath);

      entries.push({
        name: childName,
        type: "tree",
        hash: childResult.hash,
        mode: 0o755,
        size: 0,
      });
    }

    // Process files (blobs)
    for (const [name, blob] of node.blobs) {
      entries.push({
        name,
        type: "blob",
        hash: blob.hash,
        mode: blob.mode,
        size: blob.size,
      });
    }

    // Compute the content-addressed hash for this tree
    const hash = computeTreeHash(entries);

    // Create the Tree object
    const tree: Tree = {
      id: crypto.randomUUID(),
      projectId,
      hash,
      parentPath: dirPath,
      entries,
    };

    allTrees.push(tree);

    return { hash, entries };
  }

  const rootResult = buildTree(root, "/");

  return {
    trees: allTrees,
    rootTreeHash: rootResult.hash,
  };
}

/**
 * Resolve a directory path within a tree hierarchy.
 *
 * Given a set of trees (indexed by hash) and a root tree hash,
 * walk the tree to find the tree object at the given path.
 *
 * @param trees - Map of tree hash to Tree object
 * @param rootTreeHash - Hash of the root tree
 * @param targetPath - Path to resolve (e.g. "src/utils/")
 * @returns The Tree at the target path, or null if not found
 */
export function resolveTreeAtPath(
  trees: Map<string, Tree>,
  rootTreeHash: string,
  targetPath: string
): Tree | null {
  // Normalize: "/" means root
  const normalized = targetPath === "/" || targetPath === "" ? "/" : targetPath;

  if (normalized === "/") {
    return trees.get(rootTreeHash) || null;
  }

  // Split path into segments and walk the tree
  const cleanPath = normalized.replace(/^\//, "").replace(/\/$/, "");
  const segments = cleanPath.split("/");

  let currentTree = trees.get(rootTreeHash);
  if (!currentTree) return null;

  for (const segment of segments) {
    const entry = currentTree.entries.find(
      (e) => e.name === segment && e.type === "tree"
    );
    if (!entry) return null;

    currentTree = trees.get(entry.hash);
    if (!currentTree) return null;
  }

  return currentTree;
}

/**
 * Flatten a tree hierarchy back into a list of file entries.
 * This is the inverse of buildTreesFromFiles.
 *
 * @param trees - Map of tree hash to Tree object
 * @param rootTreeHash - Hash of the root tree
 * @returns Flat list of file paths with their blob hashes
 */
export function flattenTree(
  trees: Map<string, Tree>,
  rootTreeHash: string
): Array<{ path: string; hash: string; mode: number; size: number }> {
  const result: Array<{ path: string; hash: string; mode: number; size: number }> = [];

  function walk(treeHash: string, prefix: string) {
    const tree = trees.get(treeHash);
    if (!tree) return;

    for (const entry of tree.entries) {
      if (entry.type === "blob") {
        result.push({
          path: prefix ? `${prefix}${entry.name}` : entry.name,
          hash: entry.hash,
          mode: entry.mode,
          size: entry.size,
        });
      } else if (entry.type === "tree") {
        walk(entry.hash, prefix ? `${prefix}${entry.name}/` : `${entry.name}/`);
      }
    }
  }

  walk(rootTreeHash, "");

  return result;
}
