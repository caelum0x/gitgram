import type { CasStore } from "./cas.js";
import type { Manifest } from "./manifest.js";
import { parseManifestJson } from "./manifest.js";
import type { Repo } from "../store/repo.js";
import { TmError } from "./errors.js";

export type IntegrityCheckLevel = "light" | "deep";

export type IntegrityCheckResult = {
  level: IntegrityCheckLevel;
  passed: boolean;
  checkpointsChecked: number;
  manifestsVerified: number;
  blobsVerified: number;
  errors: IntegrityError[];
  warnings: string[];
};

export type IntegrityError = {
  type: "missing_manifest" | "corrupt_manifest" | "missing_blob" | "corrupt_blob";
  checkpointId?: string;
  blobHash?: string;
  message: string;
};

/**
 * Verify integrity of checkpoints and blobs
 */
export async function verifyIntegrity(
  repo: Repo,
  cas: CasStore,
  projectId: string,
  level: IntegrityCheckLevel = "light"
): Promise<IntegrityCheckResult> {
  const result: IntegrityCheckResult = {
    level,
    passed: true,
    checkpointsChecked: 0,
    manifestsVerified: 0,
    blobsVerified: 0,
    errors: [],
    warnings: [],
  };

  // Get all checkpoints for project
  const checkpoints = repo.listCheckpointsNewestFirst(projectId, 10000);
  result.checkpointsChecked = checkpoints.length;

  for (const checkpoint of checkpoints) {
    // Verify manifest blob exists
    try {
      const manifestBuf = cas.getBytes(checkpoint.manifestBlobHash);
      result.manifestsVerified++;

      // Verify manifest can be parsed
      let manifest: Manifest;
      try {
        manifest = parseManifestJson(manifestBuf.toString("utf8"));
      } catch (e) {
        result.errors.push({
          type: "corrupt_manifest",
          checkpointId: checkpoint.checkpointId,
          blobHash: checkpoint.manifestBlobHash,
          message: `Failed to parse manifest: ${e instanceof Error ? e.message : String(e)}`,
        });
        result.passed = false;
        continue;
      }

      // Light check: verify referenced blobs exist
      // Deep check: also verify blob hashes match content
      for (const fileEntry of manifest.files) {
        try {
          if (level === "deep") {
            // Re-hash blob and verify
            const blobBuf = cas.getBytes(fileEntry.hash);
            const actualHash = cas.sha256Hex(blobBuf);
            if (actualHash !== fileEntry.hash) {
              result.errors.push({
                type: "corrupt_blob",
                checkpointId: checkpoint.checkpointId,
                blobHash: fileEntry.hash,
                message: `Blob hash mismatch for ${fileEntry.path}: expected ${fileEntry.hash}, got ${actualHash}`,
              });
              result.passed = false;
            } else {
              result.blobsVerified++;
            }
          } else {
            // Light check: just verify existence
            cas.getBytes(fileEntry.hash); // throws if missing
            result.blobsVerified++;
          }
        } catch (e) {
          result.errors.push({
            type: "missing_blob",
            checkpointId: checkpoint.checkpointId,
            blobHash: fileEntry.hash,
            message: `Missing blob for ${fileEntry.path}: ${fileEntry.hash}`,
          });
          result.passed = false;
        }
      }
    } catch (e) {
      result.errors.push({
        type: "missing_manifest",
        checkpointId: checkpoint.checkpointId,
        blobHash: checkpoint.manifestBlobHash,
        message: `Missing manifest blob: ${checkpoint.manifestBlobHash}`,
      });
      result.passed = false;
    }
  }

  return result;
}

/**
 * Verify integrity before restore operation
 * Throws TmError if integrity check fails
 */
export async function verifyBeforeRestore(
  cas: CasStore,
  manifestBlobHash: string,
  checkpointId: string
): Promise<Manifest> {
  // Verify manifest blob exists
  let manifestBuf: Buffer;
  try {
    manifestBuf = cas.getBytes(manifestBlobHash);
  } catch (e) {
    throw new TmError("TM_MANIFEST_CORRUPT", `Missing manifest blob for checkpoint ${checkpointId}`, {
      checkpointId,
      manifestBlobHash,
    });
  }

  // Verify manifest can be parsed
  let manifest: Manifest;
  try {
    manifest = parseManifestJson(manifestBuf.toString("utf8"));
  } catch (e) {
    throw new TmError("TM_MANIFEST_CORRUPT", `Corrupt manifest for checkpoint ${checkpointId}`, {
      checkpointId,
      manifestBlobHash,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // Verify all referenced blobs exist
  const missingBlobs: string[] = [];
  for (const fileEntry of manifest.files) {
    try {
      cas.getBytes(fileEntry.hash);
    } catch (e) {
      missingBlobs.push(`${fileEntry.path} (${fileEntry.hash})`);
    }
  }

  if (missingBlobs.length > 0) {
    throw new TmError("TM_BLOB_MISSING", `Missing ${missingBlobs.length} blobs for checkpoint ${checkpointId}`, {
      checkpointId,
      missingBlobs: missingBlobs.slice(0, 10), // limit to first 10
      totalMissing: missingBlobs.length,
    });
  }

  return manifest;
}
