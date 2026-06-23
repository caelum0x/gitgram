import type { Repo } from "../store/repo.js";
import { buildTreesFromFiles } from "./tree-builder.js";

type ManifestLikeFile = {
  path: string;
  hash: string;
  size: number;
  mode?: number;
};

/**
 * Persist canonical directory trees for a checkpoint and return root tree hash.
 * Falls back to null when tree storage is not available on the repo backend.
 */
export function persistCheckpointTrees(
  repo: Repo,
  projectId: string,
  files: ManifestLikeFile[]
): string | null {
  if (!repo.insertTree) return null;

  const normalized = files.map((f) => ({
    path: f.path,
    hash: f.hash,
    size: f.size,
    mode: f.mode ?? 0o644,
    mtime: 0,
  }));

  const { trees, rootTreeHash } = buildTreesFromFiles(projectId, normalized);
  for (const tree of trees) {
    repo.insertTree({
      projectId,
      hash: tree.hash,
      parentPath: tree.parentPath,
      entries: tree.entries,
    });
  }

  return rootTreeHash;
}
