/**
 * Unit tests for backupService.ts
 *
 * Mocks @aws-sdk/client-s3 so no real S3 calls are made.
 * Env-gating tests verify that all public functions short-circuit
 * when the required variables are absent.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @aws-sdk/client-s3 before importing the service under test
// ---------------------------------------------------------------------------

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = mockSend;
  }
  class PutObjectCommand {
    constructor(public input: any) {}
  }
  class GetObjectCommand {
    constructor(public input: any) {}
  }
  class ListObjectsV2Command {
    constructor(public input: any) {}
  }
  class DeleteObjectCommand {
    constructor(public input: any) {}
  }
  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    DeleteObjectCommand,
  };
});

// ---------------------------------------------------------------------------
// Mock monitoring so we don't need the full app logger
// ---------------------------------------------------------------------------
vi.mock("../../src/lib/monitoring.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Lazy-import the service after mocks are registered
// ---------------------------------------------------------------------------
import {
  isConfigured,
  backupSession,
  restoreSession,
  listBackups,
  deleteBackup,
  getStorageStats,
  SessionBackup,
} from "../../src/services/backupService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionData(overrides: Partial<SessionBackup> = {}): SessionBackup {
  return {
    sessionId: "sess_abc123",
    userId: "user_001",
    projectId: "proj_001",
    projectPath: "/home/user/my-project",
    tool: "claude-code",
    createdAt: new Date("2026-06-01T12:00:00.000Z").toISOString(),
    duration: 3600,
    filesChanged: ["src/index.ts", "src/utils.ts"],
    checkpoints: [],
    backupVersion: 1,
    ...overrides,
  };
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("backupService", () => {
  // Reset env and mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
    setEnv({
      BACKUP_S3_BUCKET: undefined,
      BACKUP_S3_ACCESS_KEY: undefined,
      BACKUP_S3_SECRET_KEY: undefined,
      BACKUP_S3_REGION: undefined,
      BACKUP_S3_ENDPOINT: undefined,
    });
  });

  // =========================================================================
  // isConfigured
  // =========================================================================

  describe("isConfigured", () => {
    it("returns false when all env vars are absent", () => {
      expect(isConfigured()).toBe(false);
    });

    it("returns false when only BACKUP_S3_BUCKET is set", () => {
      setEnv({ BACKUP_S3_BUCKET: "my-bucket" });
      expect(isConfigured()).toBe(false);
    });

    it("returns false when only credentials are set but bucket is missing", () => {
      setEnv({
        BACKUP_S3_ACCESS_KEY: "key",
        BACKUP_S3_SECRET_KEY: "secret",
      });
      expect(isConfigured()).toBe(false);
    });

    it("returns true when all three required vars are present", () => {
      setEnv({
        BACKUP_S3_BUCKET: "my-bucket",
        BACKUP_S3_ACCESS_KEY: "key",
        BACKUP_S3_SECRET_KEY: "secret",
      });
      expect(isConfigured()).toBe(true);
    });
  });

  // =========================================================================
  // backupSession
  // =========================================================================

  describe("backupSession", () => {
    it("returns null immediately when not configured", async () => {
      const result = await backupSession("sess_1", makeSessionData());
      expect(result).toBeNull();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("uploads to S3 and returns a BackupResult with the correct key format", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      mockSend.mockResolvedValueOnce({});

      const data = makeSessionData({ sessionId: "sess_xyz" });
      const result = await backupSession("sess_xyz", data);

      expect(result).not.toBeNull();
      // Key must follow backups/{year}/{month}/{sessionId}.json
      expect(result!.key).toMatch(/^backups\/\d{4}\/\d{2}\/sess_xyz\.json$/);
      expect(typeof result!.size).toBe("number");
      expect(result!.size).toBeGreaterThan(0);
      expect(result!.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("sends a PutObjectCommand to S3 with correct metadata", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      mockSend.mockResolvedValueOnce({});

      const data = makeSessionData({ userId: "user_42", backupVersion: 2 });
      await backupSession("sess_meta", data);

      expect(mockSend).toHaveBeenCalledOnce();
      const sentCommand = mockSend.mock.calls[0][0];
      expect(sentCommand.input.Bucket).toBe("aitm-backups");
      expect(sentCommand.input.ContentType).toBe("application/json");
      expect(sentCommand.input.Metadata.sessionId).toBe("sess_meta");
      expect(sentCommand.input.Metadata.userId).toBe("user_42");
      expect(sentCommand.input.Metadata.backupVersion).toBe("2");
    });

    it("propagates S3 errors", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      mockSend.mockRejectedValueOnce(new Error("S3 upload failure"));

      await expect(backupSession("sess_err", makeSessionData())).rejects.toThrow(
        "S3 upload failure"
      );
    });
  });

  // =========================================================================
  // restoreSession
  // =========================================================================

  describe("restoreSession", () => {
    it("returns null when not configured", async () => {
      const result = await restoreSession("sess_1");
      expect(result).toBeNull();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("returns null when no backup exists for the session", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      // ListObjectsV2 returns no matching object
      mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

      const result = await restoreSession("sess_missing");
      expect(result).toBeNull();
    });

    it("downloads and parses the session backup from S3", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });

      const data = makeSessionData({ sessionId: "sess_download" });
      const payload = JSON.stringify(data, null, 2);

      // First call: ListObjectsV2 returns a matching key
      mockSend.mockResolvedValueOnce({
        Contents: [
          {
            Key: "backups/2026/06/sess_download.json",
            LastModified: new Date(),
            Size: payload.length,
          },
        ],
        IsTruncated: false,
      });

      // Second call: GetObject returns a readable stream with the payload
      const { Readable } = await import("stream");
      const bodyStream = Readable.from([Buffer.from(payload, "utf8")]);
      mockSend.mockResolvedValueOnce({ Body: bodyStream });

      const result = await restoreSession("sess_download");
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe("sess_download");
      expect(result!.userId).toBe("user_001");
    });

    it("returns null on NoSuchKey error from GetObject", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      // ListObjectsV2 finds a key
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: "backups/2026/06/sess_gone.json", LastModified: new Date(), Size: 10 }],
        IsTruncated: false,
      });
      // GetObject throws NoSuchKey
      const err = Object.assign(new Error("The specified key does not exist."), {
        name: "NoSuchKey",
      });
      mockSend.mockRejectedValueOnce(err);

      const result = await restoreSession("sess_gone");
      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // listBackups
  // =========================================================================

  describe("listBackups", () => {
    it("returns an empty array when not configured", async () => {
      const result = await listBackups();
      expect(result).toEqual([]);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("maps S3 objects to BackupMeta records", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      const lastModified = new Date("2026-05-20T10:00:00.000Z");
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "backups/2026/05/sess_a.json", Size: 512, LastModified: lastModified },
          { Key: "backups/2026/05/sess_b.json", Size: 1024, LastModified: lastModified },
        ],
        IsTruncated: false,
      });

      const result = await listBackups();
      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe("sess_a");
      expect(result[0].key).toBe("backups/2026/05/sess_a.json");
      expect(result[0].size).toBe(512);
      expect(result[0].lastModified).toBe(lastModified.toISOString());
    });

    it("respects the limit option", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      const date = new Date("2026-01-01T00:00:00.000Z");
      mockSend.mockResolvedValueOnce({
        Contents: Array.from({ length: 10 }, (_, i) => ({
          Key: `backups/2026/01/sess_${i}.json`,
          Size: 100,
          LastModified: date,
        })),
        IsTruncated: false,
      });

      const result = await listBackups({ limit: 3 });
      expect(result).toHaveLength(3);
    });

    it("filters out objects modified on or after the 'before' date", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      const old = new Date("2025-12-01T00:00:00.000Z");
      const recent = new Date("2026-06-01T00:00:00.000Z");
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "backups/2025/12/sess_old.json", Size: 200, LastModified: old },
          { Key: "backups/2026/06/sess_new.json", Size: 200, LastModified: recent },
        ],
        IsTruncated: false,
      });

      const result = await listBackups({ before: "2026-01-01T00:00:00.000Z" });
      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBe("sess_old");
    });
  });

  // =========================================================================
  // deleteBackup
  // =========================================================================

  describe("deleteBackup", () => {
    it("returns false when not configured", async () => {
      const result = await deleteBackup("sess_1");
      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("returns false when no backup key is found", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      mockSend.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

      const result = await deleteBackup("sess_missing");
      expect(result).toBe(false);
    });

    it("deletes the object and returns true on success", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      // ListObjectsV2
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: "backups/2026/06/sess_del.json", LastModified: new Date(), Size: 300 }],
        IsTruncated: false,
      });
      // DeleteObject
      mockSend.mockResolvedValueOnce({});

      const result = await deleteBackup("sess_del");
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it("propagates S3 errors during deletion", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: "backups/2026/06/sess_err.json", LastModified: new Date(), Size: 100 }],
        IsTruncated: false,
      });
      mockSend.mockRejectedValueOnce(new Error("Access Denied"));

      await expect(deleteBackup("sess_err")).rejects.toThrow("Access Denied");
    });
  });

  // =========================================================================
  // getStorageStats
  // =========================================================================

  describe("getStorageStats", () => {
    it("returns zeros when not configured", async () => {
      const result = await getStorageStats();
      expect(result).toEqual({ totalFiles: 0, totalSizeBytes: 0 });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("aggregates file count and total size across all objects", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: "backups/2026/05/a.json", Size: 1000 },
          { Key: "backups/2026/06/b.json", Size: 2000 },
          { Key: "backups/2026/06/c.json", Size: 500 },
        ],
        IsTruncated: false,
      });

      const result = await getStorageStats();
      expect(result.totalFiles).toBe(3);
      expect(result.totalSizeBytes).toBe(3500);
    });

    it("handles missing Size fields gracefully (counts as 0 bytes)", async () => {
      setEnv({
        BACKUP_S3_BUCKET: "aitm-backups",
        BACKUP_S3_ACCESS_KEY: "AKID",
        BACKUP_S3_SECRET_KEY: "SECRET",
      });
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: "backups/2026/06/no-size.json" }],
        IsTruncated: false,
      });

      const result = await getStorageStats();
      expect(result.totalFiles).toBe(1);
      expect(result.totalSizeBytes).toBe(0);
    });
  });
});
