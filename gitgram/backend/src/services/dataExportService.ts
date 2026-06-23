import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

const EXPORT_DIR = path.join(__dirname, '../../exports');
const EXPORT_TTL_DAYS = 7;
const EXPORT_TTL_MS = EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportStatus = 'processing' | 'ready' | 'expired' | 'failed';

export interface ExportRequest {
  exportId: string;
  userId: string;
  status: ExportStatus;
  progress: number;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
  filePath: string | null;
}

export interface ExportStatusResult {
  exportId: string;
  status: ExportStatus;
  progress: number;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}

// In-memory store keyed by exportId.
// Production deployments should persist this to Redis or a database table.
const exportStore = new Map<string, ExportRequest>();

// Per-user timestamps of their most recent export request (for rate limiting).
const lastRequestByUser = new Map<string, Date>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureExportDir(): void {
  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

function isExpired(record: ExportRequest): boolean {
  if (!record.expiresAt) {
    return false;
  }
  return new Date() > record.expiresAt;
}

function resolveStatus(record: ExportRequest): ExportStatus {
  if (record.status === 'ready' && isExpired(record)) {
    return 'expired';
  }
  return record.status;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new export request for the given user.
 * Enforces a 24-hour rate limit: only one pending/ready request per day.
 */
export async function createExportRequest(userId: string): Promise<ExportRequest> {
  const lastRequest = lastRequestByUser.get(userId);
  if (lastRequest && Date.now() - lastRequest.getTime() < RATE_LIMIT_WINDOW_MS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (Date.now() - lastRequest.getTime());
    const retryAfterMins = Math.ceil(retryAfterMs / 60_000);
    throw new Error(
      `Export already requested. You can request another export in ${retryAfterMins} minute(s).`,
    );
  }

  const exportId = randomUUID();
  const now = new Date();

  const record: ExportRequest = {
    exportId,
    userId,
    status: 'processing',
    progress: 0,
    createdAt: now,
    completedAt: null,
    expiresAt: null,
    filePath: null,
  };

  exportStore.set(exportId, record);
  lastRequestByUser.set(userId, now);

  logger.info(`Data export requested: exportId=${exportId} userId=${userId}`);

  return { ...record };
}

/**
 * Generate the export file for the given exportId.
 * This is meant to be called asynchronously (e.g. from a job queue).
 */
export async function generateExport(exportId: string): Promise<void> {
  const record = exportStore.get(exportId);
  if (!record) {
    throw new Error(`Export not found: ${exportId}`);
  }

  const updateProgress = (progress: number): void => {
    const current = exportStore.get(exportId);
    if (current) {
      exportStore.set(exportId, { ...current, progress });
    }
  };

  try {
    const { userId } = record;

    // --- collect data in parallel ---
    updateProgress(10);

    const [user, posts, snippets, collections, messages, followers, following] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            email: true,
            displayName: true,
            bio: true,
            avatar: true,
            avatarUrl: true,
            githubUsername: true,
            interests: true,
            emailVerified: true,
            isPrivate: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.post.findMany({
          where: { userId },
          select: {
            id: true,
            content: true,
            mediaUrls: true,
            type: true,
            status: true,
            likesCount: true,
            commentsCount: true,
            sharesCount: true,
            viewsCount: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.codeSnippet.findMany({
          where: { userId },
          select: {
            id: true,
            title: true,
            description: true,
            code: true,
            language: true,
            likesCount: true,
            viewsCount: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.savedCollection.findMany({
          where: { userId },
          select: {
            id: true,
            name: true,
            description: true,
            isPrivate: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        // Messages where user sent via Account – fetch by account linked to user
        prisma.user
          .findUnique({ where: { id: userId }, select: { account: { select: { id: true } } } })
          .then(async (u) => {
            if (!u?.account?.id) return [];
            return prisma.message.findMany({
              where: { senderId: u.account.id },
              select: {
                id: true,
                content: true,
                mediaUrl: true,
                read: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 1000,
            });
          }),
        prisma.follow.findMany({
          where: { followerUserId: userId },
          select: { followingId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.follow.findMany({
          where: { followingUserId: userId },
          select: { followerId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    updateProgress(70);

    // --- assemble export payload ---
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      exportId,
      profile: user,
      posts,
      snippets,
      collections,
      messages,
      social: {
        followingCount: following.length,
        following,
        followerCount: followers.length,
        followers,
      },
    };

    updateProgress(85);

    // --- write to disk ---
    ensureExportDir();
    const filename = `export-${userId}-${exportId}.json`;
    const filePath = path.join(EXPORT_DIR, filename);
    await fs.promises.writeFile(filePath, JSON.stringify(exportPayload, null, 2), 'utf8');

    updateProgress(100);

    const completedAt = new Date();
    const expiresAt = new Date(completedAt.getTime() + EXPORT_TTL_MS);

    exportStore.set(exportId, {
      ...record,
      status: 'ready',
      progress: 100,
      completedAt,
      expiresAt,
      filePath,
    });

    logger.info(
      `Data export complete: exportId=${exportId} userId=${userId} expiresAt=${expiresAt.toISOString()}`,
    );
  } catch (error: unknown) {
    exportStore.set(exportId, { ...record, status: 'failed', progress: 0 });
    logger.error(`Data export failed: exportId=${exportId}`, error);
    throw error;
  }
}

/**
 * Return the status of an export, verifying ownership.
 */
export async function getExportStatus(
  exportId: string,
  userId: string,
): Promise<ExportStatusResult> {
  const record = exportStore.get(exportId);

  if (!record || record.userId !== userId) {
    throw new Error('Export not found');
  }

  return {
    exportId: record.exportId,
    status: resolveStatus(record),
    progress: record.progress,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    expiresAt: record.expiresAt,
  };
}

/**
 * Return the absolute file path for a ready, non-expired export.
 */
export async function getExportDownload(exportId: string, userId: string): Promise<string> {
  const record = exportStore.get(exportId);

  if (!record || record.userId !== userId) {
    throw new Error('Export not found');
  }

  const currentStatus = resolveStatus(record);

  if (currentStatus === 'processing') {
    throw new Error('Export is still being generated. Please check back shortly.');
  }

  if (currentStatus === 'expired') {
    throw new Error('Export has expired. Please request a new one.');
  }

  if (currentStatus === 'failed') {
    throw new Error('Export generation failed. Please request a new one.');
  }

  if (!record.filePath) {
    throw new Error('Export file not available');
  }

  if (!fs.existsSync(record.filePath)) {
    exportStore.set(exportId, { ...record, status: 'expired' });
    throw new Error('Export file no longer exists. Please request a new one.');
  }

  return record.filePath;
}

/**
 * Return all export requests for a user, most recent first.
 */
export async function listExportHistory(userId: string): Promise<ExportStatusResult[]> {
  const results: ExportStatusResult[] = [];

  for (const record of exportStore.values()) {
    if (record.userId !== userId) continue;

    results.push({
      exportId: record.exportId,
      status: resolveStatus(record),
      progress: record.progress,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      expiresAt: record.expiresAt,
    });
  }

  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Remove expired exports from disk and from the in-memory store.
 * Intended to be called by a periodic maintenance cron job.
 * Returns the number of exports cleaned up.
 */
export async function cleanupExpiredExports(): Promise<number> {
  let removed = 0;

  for (const [exportId, record] of exportStore.entries()) {
    if (resolveStatus(record) !== 'expired') continue;

    if (record.filePath && fs.existsSync(record.filePath)) {
      try {
        await fs.promises.unlink(record.filePath);
      } catch (err: unknown) {
        logger.warn(`Failed to delete export file: ${record.filePath}`, err);
      }
    }

    exportStore.delete(exportId);
    removed++;
  }

  if (removed > 0) {
    logger.info(`Cleaned up ${removed} expired export(s)`);
  }

  return removed;
}

// ---------------------------------------------------------------------------
// Legacy compatibility export used by dataExportController
// ---------------------------------------------------------------------------

/**
 * Synchronously generate and write an export file for the given user,
 * returning the absolute path on disk.
 * @deprecated Use createExportRequest + generateExport for async job pattern.
 */
export async function exportUserData(userId: string): Promise<string> {
  const request = await createExportRequest(userId);
  await generateExport(request.exportId);

  const updated = exportStore.get(request.exportId);
  if (!updated?.filePath) {
    throw new Error('Export generation did not produce a file');
  }

  return updated.filePath;
}

export default {
  createExportRequest,
  generateExport,
  getExportStatus,
  getExportDownload,
  listExportHistory,
  cleanupExpiredExports,
  exportUserData,
};
