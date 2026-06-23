/**
 * Garbage Collection Worker
 *
 * Identifies and removes orphaned blobs that are no longer referenced
 * by any checkpoint. Operates at the database level (cloud GC), distinct
 * from the local-filesystem GC in src/core/gc.ts.
 */

import { and, eq, inArray, lte, SQL } from "drizzle-orm";
import { db, schema } from "../db/index.js";

export interface GCWorkerOptions {
  /** Maximum number of orphaned blobs to process per run */
  limit?: number;
  /** If true, only report what would be deleted without deleting */
  dryRun?: boolean;
  /** Only process blobs older than this many days (default: 30) */
  olderThanDays?: number;
  /** Restrict to a specific user */
  userId?: string;
}

export interface GCWorkerResult {
  dryRun: boolean;
  orphanedBlobsFound: number;
  orphanedBlobsDeleted: number;
  bytesFreed: number;
  staleCheckpointFilesFound: number;
  staleCheckpointFilesDeleted: number;
}

/**
 * Find checkpoint file records whose checkpoint no longer exists.
 * Uses separate queries to avoid left join (works with both real DB and test mocks).
 */
async function findStaleCheckpointFiles(
  limit: number
): Promise<Array<{ checkpointId: string; filePath: string }>> {
  // Fetch a batch of checkpoint file records
  const fileRows = await db
    .select({
      checkpointId: schema.checkpointFiles.checkpointId,
      filePath: schema.checkpointFiles.filePath,
    })
    .from(schema.checkpointFiles)
    .limit(limit * 2);

  if (fileRows.length === 0) return [];

  // Get the unique checkpoint IDs they reference
  const uniqueCheckpointIds: string[] = Array.from(
    new Set(
      fileRows
        .map((f) => f.checkpointId)
        .filter((id): id is string => typeof id === "string")
    )
  );

  // Check which of those checkpoints actually exist
  const existingCheckpoints = await db
    .select({ id: schema.checkpoints.id })
    .from(schema.checkpoints)
    .where(inArray(schema.checkpoints.id, uniqueCheckpointIds));

  const existingIds = new Set(existingCheckpoints.map((c) => c.id));

  // Stale = file references a checkpoint that does not exist
  return fileRows
    .filter((f) => !existingIds.has(f.checkpointId))
    .slice(0, limit);
}

/**
 * Find blobs that are not referenced by any checkpoint's manifestHash.
 */
async function findOrphanedBlobs(
  options: { limit: number; olderThanDays: number; userId?: string }
): Promise<Array<{ hash: string; size: number }>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - options.olderThanDays);

  const conditions: SQL[] = [lte(schema.blobs.createdAt, cutoff)];

  if (options.userId) {
    conditions.push(eq(schema.blobs.userId, options.userId));
  }

  // Get blobs that are not referenced as a manifestHash by any checkpoint
  // This is a simple approach: fetch candidate blobs, then check references.
  const candidateBlobs = await db
    .select({
      hash: schema.blobs.hash,
      size: schema.blobs.size,
    })
    .from(schema.blobs)
    .where(and(...conditions))
    .limit(options.limit * 2); // Over-fetch since some may be referenced

  if (candidateBlobs.length === 0) {
    return [];
  }

  // Find which of these hashes are still referenced
  const candidateHashes: string[] = candidateBlobs
    .map((b) => b.hash)
    .filter((hash): hash is string => typeof hash === "string");
  const referencedRows = await db
    .select({ manifestHash: schema.checkpoints.manifestHash })
    .from(schema.checkpoints)
    .where(inArray(schema.checkpoints.manifestHash, candidateHashes));

  const referencedHashes = new Set(referencedRows.map((r) => r.manifestHash));

  const orphaned = candidateBlobs.filter((b) => !referencedHashes.has(b.hash));
  return orphaned.slice(0, options.limit);
}

export async function processGCWorker(
  options: GCWorkerOptions = {}
): Promise<GCWorkerResult> {
  const limit = Math.min(Math.max(Number(options.limit || 200), 1), 5000);
  const dryRun = options.dryRun ?? false;
  const olderThanDays = options.olderThanDays ?? 30;

  // Phase 1: Find and clean stale checkpoint_files
  const staleFiles = await findStaleCheckpointFiles(limit);
  let staleCheckpointFilesDeleted = 0;

  if (!dryRun && staleFiles.length > 0) {
    // checkpointFiles uses composite PK (checkpointId, filePath) - delete by checkpointId
    const staleCheckpointIds: string[] = [
      ...new Set(
        staleFiles
          .map((f) => f.checkpointId)
          .filter((id): id is string => typeof id === "string")
      ),
    ];
    await db
      .delete(schema.checkpointFiles)
      .where(inArray(schema.checkpointFiles.checkpointId, staleCheckpointIds));
    staleCheckpointFilesDeleted = staleFiles.length;
  }

  // Phase 2: Find and clean orphaned blobs
  const orphanedBlobs = await findOrphanedBlobs({
    limit,
    olderThanDays,
    userId: options.userId,
  });

  let orphanedBlobsDeleted = 0;
  let bytesFreed = 0;

  if (!dryRun && orphanedBlobs.length > 0) {
    const orphanedHashes: string[] = orphanedBlobs
      .map((b) => b.hash)
      .filter((hash): hash is string => typeof hash === "string");
    await db
      .delete(schema.blobs)
      .where(inArray(schema.blobs.hash, orphanedHashes));

    orphanedBlobsDeleted = orphanedHashes.length;
    bytesFreed = orphanedBlobs.reduce((sum, b) => sum + (b.size || 0), 0);
  } else if (dryRun) {
    bytesFreed = orphanedBlobs.reduce((sum, b) => sum + (b.size || 0), 0);
  }

  return {
    dryRun,
    orphanedBlobsFound: orphanedBlobs.length,
    orphanedBlobsDeleted,
    bytesFreed,
    staleCheckpointFilesFound: staleFiles.length,
    staleCheckpointFilesDeleted,
  };
}
