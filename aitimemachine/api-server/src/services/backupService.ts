/**
 * S3 Backup Service for AITimeMachine
 *
 * Handles backup and restore of AITM session data to/from S3-compatible storage
 * (AWS S3, Cloudflare R2, MinIO, etc.).
 *
 * Environment variables:
 *   BACKUP_S3_BUCKET      — Target bucket name (required)
 *   BACKUP_S3_REGION      — AWS region (default: us-east-1)
 *   BACKUP_S3_ACCESS_KEY  — Access key ID (required)
 *   BACKUP_S3_SECRET_KEY  — Secret access key (required)
 *   BACKUP_S3_ENDPOINT    — Custom endpoint URL for S3-compatible providers (optional)
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { logger } from "../lib/monitoring.js";
import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { CheckpointSummary } from "./exportService.js";
import { buildSessionBackupData } from "./exportService.js";

// ============================================================================
// Types
// ============================================================================

export interface SessionBackup {
  sessionId: string;
  userId: string;
  projectId: string;
  projectPath: string | null;
  tool: string;
  createdAt: string;
  duration: number | null;
  filesChanged: string[];
  checkpoints: CheckpointSummary[];
  backupVersion: number;
}

export interface BackupResult {
  key: string;
  size: number;
  uploadedAt: string;
}

export interface BackupMeta {
  sessionId: string;
  key: string;
  size: number;
  lastModified: string;
}

// ============================================================================
// S3 client singleton (lazy, scoped to backup env vars)
// ============================================================================

let backupClient: S3Client | null = null;

function getBackupClient(): S3Client {
  if (!backupClient) {
    const config: ConstructorParameters<typeof S3Client>[0] = {
      region: process.env.BACKUP_S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.BACKUP_S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.BACKUP_S3_SECRET_KEY ?? "",
      },
    };

    const endpoint = process.env.BACKUP_S3_ENDPOINT;
    if (endpoint) {
      config.endpoint = endpoint;
      // Force path-style for S3-compatible providers (R2, MinIO)
      config.forcePathStyle = true;
    }

    backupClient = new S3Client(config);
  }
  return backupClient;
}

function getBucket(): string {
  return process.env.BACKUP_S3_BUCKET ?? "";
}

// ============================================================================
// Internal helpers
// ============================================================================

function buildKey(sessionId: string, uploadedAt: Date): string {
  const year = uploadedAt.getUTCFullYear();
  const month = String(uploadedAt.getUTCMonth() + 1).padStart(2, "0");
  return `backups/${year}/${month}/${sessionId}.json`;
}

/**
 * Derive the S3 key for a session without knowing the upload date.
 * Lists objects with prefix `backups/` and finds the matching session ID.
 * Returns null when no match is found.
 */
async function findKeyForSession(sessionId: string): Promise<string | null> {
  const s3 = getBackupClient();
  const bucket = getBucket();

  let continuationToken: string | undefined;

  do {
    const response: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "backups/",
        ContinuationToken: continuationToken,
      })
    );

    const match = (response.Contents ?? []).find((obj) =>
      obj.Key?.endsWith(`/${sessionId}.json`)
    );

    if (match?.Key) {
      return match.Key;
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return null;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

function extractSessionIdFromKey(key: string): string {
  const filename = key.split("/").pop() ?? "";
  return filename.replace(/\.json$/, "");
}

// ============================================================================
// Public service functions
// ============================================================================

/**
 * Returns true when all required environment variables are present.
 */
export function isConfigured(): boolean {
  return Boolean(
    process.env.BACKUP_S3_BUCKET &&
      process.env.BACKUP_S3_ACCESS_KEY &&
      process.env.BACKUP_S3_SECRET_KEY
  );
}

/**
 * Serialises session data as JSON and uploads it to S3 at
 * `backups/{year}/{month}/{sessionId}.json`.
 *
 * Returns { key, size, uploadedAt } on success.
 * Returns null when the bucket is not configured.
 */
export async function backupSession(
  sessionId: string,
  data: SessionBackup
): Promise<BackupResult | null> {
  if (!isConfigured()) {
    logger.warn("backupSession: S3 backup not configured, skipping", { sessionId });
    return null;
  }

  const uploadedAt = new Date();
  const key = buildKey(sessionId, uploadedAt);
  const payload = JSON.stringify({ ...data, sessionId }, null, 2);
  const body = Buffer.from(payload, "utf8");

  try {
    await getBackupClient().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: body,
        ContentType: "application/json",
        Metadata: {
          sessionId,
          userId: data.userId,
          backupVersion: String(data.backupVersion),
        },
      })
    );

    logger.info("backupSession: uploaded", { sessionId, key, sizeBytes: body.length });

    return {
      key,
      size: body.length,
      uploadedAt: uploadedAt.toISOString(),
    };
  } catch (err: unknown) {
    logger.error("backupSession: upload failed", err instanceof Error ? err : undefined, { sessionId, key });
    throw err;
  }
}

/**
 * Downloads and deserialises a session backup from S3 by session ID.
 *
 * Returns the parsed SessionBackup or null when:
 *  - The bucket is not configured
 *  - No backup exists for the given session ID
 */
export async function restoreSession(
  sessionId: string
): Promise<SessionBackup | null> {
  if (!isConfigured()) {
    logger.warn("restoreSession: S3 backup not configured, skipping", { sessionId });
    return null;
  }

  let key: string | null;
  try {
    key = await findKeyForSession(sessionId);
  } catch (err: unknown) {
    logger.error("restoreSession: error searching for key", err instanceof Error ? err : undefined, { sessionId });
    throw err;
  }

  if (!key) {
    logger.info("restoreSession: no backup found", { sessionId });
    return null;
  }

  try {
    const response = await getBackupClient().send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: key,
      })
    );

    const body = response.Body;
    if (!body || !(body instanceof Readable)) {
      logger.warn("restoreSession: empty or non-readable body", { sessionId, key });
      return null;
    }

    const buffer = await streamToBuffer(body);
    const parsed: unknown = JSON.parse(buffer.toString("utf8"));

    logger.info("restoreSession: downloaded", { sessionId, key });
    return parsed as SessionBackup;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === "NoSuchKey" || err.name === "NotFound")
    ) {
      return null;
    }
    logger.error("restoreSession: download failed", err instanceof Error ? err : undefined, { sessionId, key });
    throw err;
  }
}

/**
 * Lists backup objects from S3.
 *
 * @param options.limit   Maximum number of results to return (default: 100)
 * @param options.before  ISO-8601 date string; only return backups before this date
 *
 * Returns an empty array when the bucket is not configured.
 */
export async function listBackups(options: {
  limit?: number;
  before?: string;
} = {}): Promise<BackupMeta[]> {
  if (!isConfigured()) {
    return [];
  }

  const limit = options.limit ?? 100;
  const beforeDate = options.before ? new Date(options.before) : null;

  const results: BackupMeta[] = [];
  let continuationToken: string | undefined;

  try {
    do {
      const response: ListObjectsV2CommandOutput = await getBackupClient().send(
        new ListObjectsV2Command({
          Bucket: getBucket(),
          Prefix: "backups/",
          ContinuationToken: continuationToken,
        })
      );

      for (const obj of response.Contents ?? []) {
        if (!obj.Key || !obj.Size || !obj.LastModified) continue;

        if (beforeDate && obj.LastModified >= beforeDate) continue;

        results.push({
          sessionId: extractSessionIdFromKey(obj.Key),
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified.toISOString(),
        });

        if (results.length >= limit) break;
      }

      continuationToken =
        results.length < limit && response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
    } while (continuationToken);
  } catch (err: unknown) {
    logger.error("listBackups: failed", err instanceof Error ? err : undefined);
    throw err;
  }

  return results;
}

/**
 * Removes a backup file from S3 by session ID.
 *
 * Returns true on success, false when the file does not exist or the
 * bucket is not configured.
 */
export async function deleteBackup(sessionId: string): Promise<boolean> {
  if (!isConfigured()) {
    logger.warn("deleteBackup: S3 backup not configured, skipping", { sessionId });
    return false;
  }

  let key: string | null;
  try {
    key = await findKeyForSession(sessionId);
  } catch (err: unknown) {
    logger.error("deleteBackup: error searching for key", err instanceof Error ? err : undefined, { sessionId });
    throw err;
  }

  if (!key) {
    logger.info("deleteBackup: no backup found to delete", { sessionId });
    return false;
  }

  try {
    await getBackupClient().send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: key,
      })
    );

    logger.info("deleteBackup: deleted", { sessionId, key });
    return true;
  } catch (err: unknown) {
    logger.error("deleteBackup: failed", err instanceof Error ? err : undefined, { sessionId, key });
    throw err;
  }
}

/**
 * Build a SessionBackup payload for a session owned by the given user and
 * upload it to S3. Returns the backup result, or null when S3 is not
 * configured. Throws when the session does not exist or is not owned by
 * the user.
 */
export async function backupUserSession(
  userId: string,
  sessionId: string
): Promise<BackupResult | null> {
  const [session] = await db
    .select({ id: schema.chatSessions.id, userId: schema.chatSessions.userId })
    .from(schema.chatSessions)
    .where(
      and(eq(schema.chatSessions.id, sessionId), eq(schema.chatSessions.userId, userId))
    )
    .limit(1);

  if (!session) {
    throw new Error("Session not found");
  }

  const data = await buildSessionBackupData(userId, sessionId);
  if (!data) {
    throw new Error("Session not found");
  }

  return backupSession(sessionId, data);
}

/**
 * Aggregates storage statistics across all objects under the `backups/` prefix.
 *
 * Returns { totalFiles: 0, totalSizeBytes: 0 } when the bucket is not configured.
 */
export async function getStorageStats(): Promise<{
  totalFiles: number;
  totalSizeBytes: number;
}> {
  if (!isConfigured()) {
    return { totalFiles: 0, totalSizeBytes: 0 };
  }

  let totalFiles = 0;
  let totalSizeBytes = 0;
  let continuationToken: string | undefined;

  try {
    do {
      const response: ListObjectsV2CommandOutput = await getBackupClient().send(
        new ListObjectsV2Command({
          Bucket: getBucket(),
          Prefix: "backups/",
          ContinuationToken: continuationToken,
        })
      );

      for (const obj of response.Contents ?? []) {
        totalFiles += 1;
        totalSizeBytes += obj.Size ?? 0;
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);
  } catch (err: unknown) {
    logger.error("getStorageStats: failed", err instanceof Error ? err : undefined);
    throw err;
  }

  return { totalFiles, totalSizeBytes };
}
