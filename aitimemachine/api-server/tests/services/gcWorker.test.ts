import { beforeEach, describe, expect, it } from "vitest";
import {
  mockBlobs,
  mockCheckpoints,
  mockCheckpointFiles,
  seedTestData,
} from "../setup.js";
import { processGCWorker } from "../../src/services/gcWorker.js";

describe("gcWorker service", () => {
  beforeEach(() => {
    seedTestData();
    mockBlobs.length = 0;
    mockCheckpoints.length = 0;
    mockCheckpointFiles.length = 0;
  });

  it("reports orphaned blobs in dry-run mode", async () => {
    const oldDate = new Date("2024-01-01T00:00:00.000Z");

    // Create a blob that is not referenced by any checkpoint
    mockBlobs.push({
      id: "blob_orphan_001",
      hash: "hash_orphan_001",
      content: "old data",
      size: 1024,
      userId: "user_test_001",
      createdAt: oldDate,
    });

    const result = await processGCWorker({
      dryRun: true,
      olderThanDays: 30,
      limit: 100,
    });

    expect(result.dryRun).toBe(true);
    expect(result.orphanedBlobsFound).toBe(1);
    expect(result.orphanedBlobsDeleted).toBe(0);
    expect(result.bytesFreed).toBe(1024);

    // Blob should still exist (dry run)
    expect(mockBlobs.find((b) => b.id === "blob_orphan_001")).toBeTruthy();
  });

  it("deletes orphaned blobs in execute mode", async () => {
    const oldDate = new Date("2024-01-01T00:00:00.000Z");

    mockBlobs.push({
      id: "blob_orphan_002",
      hash: "hash_orphan_002",
      content: "stale data",
      size: 2048,
      userId: "user_test_001",
      createdAt: oldDate,
    });

    const result = await processGCWorker({
      dryRun: false,
      olderThanDays: 30,
      limit: 100,
    });

    expect(result.dryRun).toBe(false);
    expect(result.orphanedBlobsFound).toBe(1);
    expect(result.orphanedBlobsDeleted).toBe(1);
    expect(result.bytesFreed).toBe(2048);

    // Blob should be removed
    expect(mockBlobs.find((b) => b.id === "blob_orphan_002")).toBeUndefined();
  });

  it("preserves blobs referenced by checkpoints", async () => {
    const oldDate = new Date("2024-01-01T00:00:00.000Z");

    mockBlobs.push({
      id: "blob_referenced_001",
      hash: "hash_ref_001",
      content: "important data",
      size: 512,
      userId: "user_test_001",
      createdAt: oldDate,
    });

    // Checkpoint references this blob
    mockCheckpoints.push({
      id: "cp_ref_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      manifestHash: "hash_ref_001",
      name: "checkpoint-1",
      description: null,
      parentId: null,
      triggerType: "manual",
      metadata: {},
      createdAt: oldDate,
    });

    const result = await processGCWorker({
      dryRun: false,
      olderThanDays: 30,
      limit: 100,
    });

    expect(result.orphanedBlobsFound).toBe(0);
    expect(result.orphanedBlobsDeleted).toBe(0);

    // Blob should still exist
    expect(mockBlobs.find((b) => b.id === "blob_referenced_001")).toBeTruthy();
  });

  it("detects stale checkpoint files", async () => {
    // Checkpoint file that references a non-existent checkpoint
    mockCheckpointFiles.push({
      id: "cpf_stale_001",
      checkpointId: "cp_nonexistent_001",
      filePath: "/src/old.ts",
      hash: "abc123",
      size: 100,
    });

    const result = await processGCWorker({
      dryRun: false,
      limit: 100,
    });

    expect(result.staleCheckpointFilesFound).toBe(1);
    expect(result.staleCheckpointFilesDeleted).toBe(1);

    // Checkpoint file should be removed
    expect(mockCheckpointFiles.find((f) => f.id === "cpf_stale_001")).toBeUndefined();
  });

  it("respects limit parameter", async () => {
    const oldDate = new Date("2024-01-01T00:00:00.000Z");

    for (let i = 0; i < 5; i++) {
      mockBlobs.push({
        id: `blob_batch_${i}`,
        hash: `hash_batch_${i}`,
        content: "data",
        size: 100,
        userId: "user_test_001",
        createdAt: oldDate,
      });
    }

    const result = await processGCWorker({
      dryRun: false,
      olderThanDays: 30,
      limit: 3,
    });

    expect(result.orphanedBlobsFound).toBeLessThanOrEqual(3);
    expect(result.orphanedBlobsDeleted).toBeLessThanOrEqual(3);
  });

  it("returns zeros when nothing to clean", async () => {
    const result = await processGCWorker({
      dryRun: false,
      limit: 100,
    });

    expect(result.orphanedBlobsFound).toBe(0);
    expect(result.orphanedBlobsDeleted).toBe(0);
    expect(result.bytesFreed).toBe(0);
    expect(result.staleCheckpointFilesFound).toBe(0);
    expect(result.staleCheckpointFilesDeleted).toBe(0);
  });
});
