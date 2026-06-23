/**
 * Tree service: persists and queries Git-like tree objects in the database.
 *
 * This service handles:
 * - Storing tree objects during checkpoint creation
 * - Retrieving tree entries for a directory at a specific checkpoint
 * - Content-addressed deduplication (same directory state = same tree record)
 */

import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import type { TreeEntryJson } from "../db/schema.js";
import crypto from "crypto";

// ============================================
// Types
// ============================================

export interface TreeEntry {
  name: string;
  type: "blob" | "tree";
  hash: string;
  mode: number;
  size: number;
}

export interface Tree {
  id: string;
  projectId: string;
  hash: string;
  parentPath: string;
  entries: TreeEntry[];
  createdAt: Date | null;
}

export interface FileInput {
  path: string;
  hash: string;
  size: number;
  mode?: number;
}

// ============================================
// Tree hash computation
// ============================================

/**
 * Compute the content-addressed hash for a tree from its sorted entries.
 * Identical to the core tree-builder logic to ensure consistency.
 */
function computeTreeHash(entries: TreeEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const canonical = sorted
    .map((e) => `${e.type}:${e.hash}:${e.name}:${e.mode}:${e.size}`)
    .join("\n");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// ============================================
// Tree building from flat file list
// ============================================

interface TreeNode {
  blobs: Map<string, { hash: string; mode: number; size: number }>;
  children: Map<string, TreeNode>;
}

interface BuiltTree {
  hash: string;
  parentPath: string;
  entries: TreeEntry[];
}

/**
 * Build tree objects from a flat list of files.
 * Returns all tree objects and the root tree hash.
 */
function buildTreesFromFiles(
  files: FileInput[]
): { trees: BuiltTree[]; rootTreeHash: string } {
  const root: TreeNode = { blobs: new Map(), children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts.pop()!;

    let current = root;
    for (const dir of parts) {
      if (!current.children.has(dir)) {
        current.children.set(dir, { blobs: new Map(), children: new Map() });
      }
      current = current.children.get(dir)!;
    }

    current.blobs.set(fileName, {
      hash: file.hash,
      mode: file.mode ?? 0o644,
      size: file.size,
    });
  }

  const allTrees: BuiltTree[] = [];

  function buildTree(
    node: TreeNode,
    dirPath: string
  ): { hash: string; entries: TreeEntry[] } {
    const entries: TreeEntry[] = [];

    for (const [childName, childNode] of node.children) {
      const childPath =
        dirPath === "/" ? `${childName}/` : `${dirPath}${childName}/`;
      const childResult = buildTree(childNode, childPath);

      entries.push({
        name: childName,
        type: "tree",
        hash: childResult.hash,
        mode: 0o755,
        size: 0,
      });
    }

    for (const [name, blob] of node.blobs) {
      entries.push({
        name,
        type: "blob",
        hash: blob.hash,
        mode: blob.mode,
        size: blob.size,
      });
    }

    const hash = computeTreeHash(entries);

    allTrees.push({
      hash,
      parentPath: dirPath,
      entries,
    });

    return { hash, entries };
  }

  const rootResult = buildTree(root, "/");

  return {
    trees: allTrees,
    rootTreeHash: rootResult.hash,
  };
}

// ============================================
// Database operations
// ============================================

/**
 * Build and persist tree objects for a checkpoint.
 *
 * Takes a flat list of files, builds the tree hierarchy, and stores
 * each tree in the database. Uses content-addressed deduplication:
 * if a tree with the same project+hash already exists, it is not re-inserted.
 *
 * @returns The root tree hash to be stored on the checkpoint record.
 */
export async function buildAndStoreTrees(
  projectId: string,
  files: FileInput[]
): Promise<string> {
  if (files.length === 0) {
    // Empty project: store a single empty root tree
    const emptyHash = computeTreeHash([]);
    await upsertTree(projectId, emptyHash, "/", []);
    return emptyHash;
  }

  const { trees, rootTreeHash } = buildTreesFromFiles(files);

  // Insert all trees, skipping duplicates by (projectId, hash)
  for (const tree of trees) {
    await upsertTree(projectId, tree.hash, tree.parentPath, tree.entries);
  }

  return rootTreeHash;
}

/**
 * Insert a tree record if it doesn't already exist for this project+hash.
 */
async function upsertTree(
  projectId: string,
  hash: string,
  parentPath: string,
  entries: TreeEntry[]
): Promise<void> {
  // Check if tree already exists (content-addressed dedup)
  const [existing] = await db
    .select({ id: schema.trees.id })
    .from(schema.trees)
    .where(
      and(eq(schema.trees.projectId, projectId), eq(schema.trees.hash, hash))
    )
    .limit(1);

  if (existing) return;

  await db.insert(schema.trees).values({
    projectId,
    hash,
    parentPath,
    entries: entries as TreeEntryJson[],
  });
}

/**
 * Get a tree by its content hash within a project.
 */
export async function getTreeByHash(
  projectId: string,
  hash: string
): Promise<Tree | null> {
  const [row] = await db
    .select()
    .from(schema.trees)
    .where(
      and(eq(schema.trees.projectId, projectId), eq(schema.trees.hash, hash))
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    projectId: row.projectId,
    hash: row.hash,
    parentPath: row.parentPath,
    entries: row.entries as TreeEntry[],
    createdAt: row.createdAt,
  };
}

/**
 * Get the tree for a specific directory path at a given checkpoint.
 *
 * Walks the tree hierarchy from the root to the target path.
 *
 * @param projectId - The project ID
 * @param rootTreeHash - Root tree hash from the checkpoint
 * @param targetPath - Directory path to resolve (e.g. "/" or "src/utils/")
 * @returns The tree at that path, or null if not found
 */
export async function getTreeAtPath(
  projectId: string,
  rootTreeHash: string,
  targetPath: string
): Promise<Tree | null> {
  const normalized =
    targetPath === "/" || targetPath === "" ? "/" : targetPath;

  // Get the root tree
  const rootTree = await getTreeByHash(projectId, rootTreeHash);
  if (!rootTree) return null;

  if (normalized === "/") {
    return rootTree;
  }

  // Walk the path segments
  const cleanPath = normalized.replace(/^\//, "").replace(/\/$/, "");
  const segments = cleanPath.split("/");

  let currentTree = rootTree;
  for (const segment of segments) {
    const entry = currentTree.entries.find(
      (e) => e.name === segment && e.type === "tree"
    );
    if (!entry) return null;

    const nextTree = await getTreeByHash(projectId, entry.hash);
    if (!nextTree) return null;

    currentTree = nextTree;
  }

  return currentTree;
}

/**
 * Get tree entries for a checkpoint at a given directory path.
 * This is the main API-facing function for directory listings.
 *
 * @param checkpointId - The checkpoint ID
 * @param projectId - The project ID
 * @param userId - The user ID (for ownership verification)
 * @param dirPath - Directory path (default: "/" for root)
 * @returns Tree entries at that path, or null if checkpoint/tree not found
 */
export async function getTreeEntriesForCheckpoint(
  checkpointId: string,
  projectId: string,
  userId: string,
  dirPath: string = "/"
): Promise<{
  tree: Tree;
  checkpoint: { id: string; name: string; rootTreeHash: string };
} | null> {
  // Get the checkpoint and verify ownership
  const [checkpoint] = await db
    .select({
      id: schema.checkpoints.id,
      name: schema.checkpoints.name,
      rootTreeHash: schema.checkpoints.rootTreeHash,
      projectId: schema.checkpoints.projectId,
      userId: schema.checkpoints.userId,
    })
    .from(schema.checkpoints)
    .where(
      and(
        eq(schema.checkpoints.id, checkpointId),
        eq(schema.checkpoints.projectId, projectId),
        eq(schema.checkpoints.userId, userId)
      )
    )
    .limit(1);

  if (!checkpoint || !checkpoint.rootTreeHash) return null;

  const tree = await getTreeAtPath(
    projectId,
    checkpoint.rootTreeHash,
    dirPath
  );
  if (!tree) return null;

  return {
    tree,
    checkpoint: {
      id: checkpoint.id,
      name: checkpoint.name,
      rootTreeHash: checkpoint.rootTreeHash,
    },
  };
}
