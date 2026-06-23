import { prisma } from '../utils/prisma';
import { deleteMedia } from './storageService';
import logger from '../utils/logger';

// ============================================
// Configuration
// ============================================

const DEFAULT_RETENTION_DAYS = parseInt(process.env.MEDIA_RETENTION_DAYS || '30', 10);
const STORY_EXPIRY_HOURS = 24;
const STORY_GRACE_PERIOD_DAYS = 7;
const ORPHAN_MEDIA_THRESHOLD_HOURS = parseInt(process.env.ORPHAN_MEDIA_HOURS || '24', 10);

// ============================================
// Story Media Auto-Delete (24h + 7 day grace)
// ============================================

/**
 * Archive and clean up expired story media.
 * Stories expire after 24 hours. Media is retained for 7 additional days
 * (grace period) before permanent deletion.
 */
export async function cleanupExpiredStoryMedia(): Promise<{ archived: number; deleted: number }> {
  let archived = 0;
  let deleted = 0;

  try {
    const now = new Date();

    // 1. Find stories that have expired (past expiresAt) but media not yet soft-deleted
    const expiredStories = await prisma.story.findMany({
      where: {
        expiresAt: { lt: now },
      },
      select: {
        id: true,
        mediaUrl: true,
        userId: true,
        mediaType: true,
        caption: true,
        createdAt: true,
      },
    });

    // Soft-delete the associated media records
    for (const story of expiredStories) {
      try {
        // Mark media as soft-deleted in the Media table
        const mediaRecord = await prisma.media.findFirst({
          where: { storyId: story.id, status: { not: 'SOFT_DELETED' } },
        });

        if (mediaRecord) {
          const graceExpiry = new Date(now.getTime() + STORY_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
          await prisma.media.update({
            where: { id: mediaRecord.id },
            data: {
              status: 'SOFT_DELETED',
              softDeletedAt: now,
              expiresAt: graceExpiry,
            },
          });
          archived++;
        }

        // Archive story data before deletion (if StoryArchive model exists)
        try {
          await prisma.storyArchive.upsert({
            where: { storyId: story.id },
            update: {},
            create: {
              storyId: story.id,
              userId: story.userId || '',
              mediaUrl: story.mediaUrl,
              mediaType: story.mediaType,
              caption: story.caption,
            },
          });
        } catch {
          // StoryArchive upsert may fail if already exists, that's fine
        }
      } catch (error: unknown) {
        logger.error(`Failed to archive story media: ${story.id}`, error);
      }
    }

    // 2. Permanently delete media past the grace period
    const graceCutoff = new Date(now.getTime() - STORY_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const expiredMedia = await prisma.media.findMany({
      where: {
        contentType: 'story',
        status: 'SOFT_DELETED',
        softDeletedAt: { lt: graceCutoff },
      },
    });

    for (const media of expiredMedia) {
      try {
        // Delete from storage
        if (media.originalUrl) await safeDeleteFromStorage(media.originalUrl);
        if (media.processedUrl) await safeDeleteFromStorage(media.processedUrl);
        if (media.thumbnailUrl) await safeDeleteFromStorage(media.thumbnailUrl);
        if (media.webpUrl) await safeDeleteFromStorage(media.webpUrl);

        // Delete resolution variants
        if (media.resolutions && typeof media.resolutions === 'object') {
          const resolutions = media.resolutions as Record<string, string>;
          for (const url of Object.values(resolutions)) {
            await safeDeleteFromStorage(url);
          }
        }

        // Mark as expired (or delete the record)
        await prisma.media.update({
          where: { id: media.id },
          data: { status: 'EXPIRED' },
        });

        deleted++;
      } catch (error: unknown) {
        logger.error(`Failed to delete expired story media: ${media.id}`, error);
      }
    }

    logger.info('Story media cleanup completed', { archived, deleted });
    return { archived, deleted };
  } catch (error: unknown) {
    logger.error('Story media cleanup failed:', error);
    return { archived, deleted };
  }
}

// ============================================
// Orphaned Media Cleanup
// ============================================

/**
 * Clean up media that was uploaded but never attached to a post/story/reel.
 * Media is considered orphaned if it has no postId, reelId, or storyId
 * and was created more than ORPHAN_MEDIA_THRESHOLD_HOURS ago.
 */
export async function cleanupOrphanedMedia(): Promise<number> {
  let cleaned = 0;

  try {
    const cutoff = new Date(Date.now() - ORPHAN_MEDIA_THRESHOLD_HOURS * 60 * 60 * 1000);

    const orphanedMedia = await prisma.media.findMany({
      where: {
        postId: null,
        reelId: null,
        storyId: null,
        contentType: { not: 'avatar' }, // Don't clean up avatar images
        status: { in: ['PENDING', 'READY'] },
        createdAt: { lt: cutoff },
      },
    });

    for (const media of orphanedMedia) {
      try {
        // Delete from storage
        if (media.originalUrl) await safeDeleteFromStorage(media.originalUrl);
        if (media.processedUrl) await safeDeleteFromStorage(media.processedUrl);
        if (media.thumbnailUrl) await safeDeleteFromStorage(media.thumbnailUrl);
        if (media.webpUrl) await safeDeleteFromStorage(media.webpUrl);

        if (media.resolutions && typeof media.resolutions === 'object') {
          const resolutions = media.resolutions as Record<string, string>;
          for (const url of Object.values(resolutions)) {
            await safeDeleteFromStorage(url);
          }
        }

        // Delete the media record
        await prisma.media.delete({ where: { id: media.id } });
        cleaned++;
      } catch (error: unknown) {
        logger.error(`Failed to clean orphaned media: ${media.id}`, error);
      }
    }

    logger.info('Orphaned media cleanup completed', { cleaned });
    return cleaned;
  } catch (error: unknown) {
    logger.error('Orphaned media cleanup failed:', error);
    return cleaned;
  }
}

// ============================================
// Soft Delete with Configurable Retention
// ============================================

/**
 * Soft-delete a media item. It will be permanently deleted after retentionDays.
 */
export async function softDeleteMedia(
  mediaId: string,
  retentionDays: number = DEFAULT_RETENTION_DAYS
): Promise<boolean> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

    await prisma.media.update({
      where: { id: mediaId },
      data: {
        status: 'SOFT_DELETED',
        softDeletedAt: now,
        expiresAt,
        retentionDays,
        isPublic: false,
      },
    });

    logger.info('Media soft-deleted', { mediaId, retentionDays, expiresAt });
    return true;
  } catch (error: unknown) {
    logger.error('Failed to soft-delete media:', error);
    return false;
  }
}

/**
 * Restore a soft-deleted media item (within retention period).
 */
export async function restoreSoftDeletedMedia(mediaId: string): Promise<boolean> {
  try {
    const media = await prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.status !== 'SOFT_DELETED') {
      return false;
    }

    await prisma.media.update({
      where: { id: mediaId },
      data: {
        status: 'READY',
        softDeletedAt: null,
        expiresAt: null,
        isPublic: true,
      },
    });

    logger.info('Media restored from soft-delete', { mediaId });
    return true;
  } catch (error: unknown) {
    logger.error('Failed to restore soft-deleted media:', error);
    return false;
  }
}

/**
 * Permanently delete all media items past their retention period.
 */
export async function purgeExpiredMedia(): Promise<number> {
  let purged = 0;

  try {
    const now = new Date();

    const expiredMedia = await prisma.media.findMany({
      where: {
        status: 'SOFT_DELETED',
        expiresAt: { lt: now },
      },
    });

    for (const media of expiredMedia) {
      try {
        // Delete all associated files from storage
        if (media.originalUrl) await safeDeleteFromStorage(media.originalUrl);
        if (media.processedUrl) await safeDeleteFromStorage(media.processedUrl);
        if (media.thumbnailUrl) await safeDeleteFromStorage(media.thumbnailUrl);
        if (media.webpUrl) await safeDeleteFromStorage(media.webpUrl);

        if (media.resolutions && typeof media.resolutions === 'object') {
          const resolutions = media.resolutions as Record<string, string>;
          for (const url of Object.values(resolutions)) {
            await safeDeleteFromStorage(url);
          }
        }

        // Delete associated transcode jobs
        await prisma.transcodeJob.deleteMany({ where: { mediaId: media.id } });

        // Mark as expired
        await prisma.media.update({
          where: { id: media.id },
          data: { status: 'EXPIRED' },
        });

        purged++;
      } catch (error: unknown) {
        logger.error(`Failed to purge expired media: ${media.id}`, error);
      }
    }

    logger.info('Expired media purge completed', { purged });
    return purged;
  } catch (error: unknown) {
    logger.error('Expired media purge failed:', error);
    return purged;
  }
}

// ============================================
// User Storage Tracking
// ============================================

/**
 * Get detailed storage breakdown for a user.
 */
export async function getUserMediaStats(userId: string) {
  try {
    const [totalStats, imageStats, videoStats, storyStats] = await Promise.all([
      prisma.media.aggregate({
        where: { userId, status: { notIn: ['SOFT_DELETED', 'EXPIRED'] } },
        _sum: { fileSize: true },
        _count: true,
      }),
      prisma.media.aggregate({
        where: { userId, type: 'IMAGE', status: { notIn: ['SOFT_DELETED', 'EXPIRED'] } },
        _sum: { fileSize: true },
        _count: true,
      }),
      prisma.media.aggregate({
        where: { userId, type: 'VIDEO', status: { notIn: ['SOFT_DELETED', 'EXPIRED'] } },
        _sum: { fileSize: true },
        _count: true,
      }),
      prisma.media.aggregate({
        where: { userId, contentType: 'story', status: { notIn: ['SOFT_DELETED', 'EXPIRED'] } },
        _sum: { fileSize: true },
        _count: true,
      }),
    ]);

    return {
      total: {
        count: totalStats._count,
        bytes: totalStats._sum.fileSize || 0,
        mb: Math.round((totalStats._sum.fileSize || 0) / (1024 * 1024)),
      },
      images: {
        count: imageStats._count,
        bytes: imageStats._sum.fileSize || 0,
        mb: Math.round((imageStats._sum.fileSize || 0) / (1024 * 1024)),
      },
      videos: {
        count: videoStats._count,
        bytes: videoStats._sum.fileSize || 0,
        mb: Math.round((videoStats._sum.fileSize || 0) / (1024 * 1024)),
      },
      stories: {
        count: storyStats._count,
        bytes: storyStats._sum.fileSize || 0,
        mb: Math.round((storyStats._sum.fileSize || 0) / (1024 * 1024)),
      },
    };
  } catch (error: unknown) {
    logger.error('Error getting user media stats:', error);
    return null;
  }
}

// ============================================
// Cleanup Old Upload Quotas
// ============================================

/**
 * Delete quota records older than 30 days.
 */
export async function cleanupOldQuotaRecords(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.mediaUploadQuota.deleteMany({
      where: { date: { lt: cutoff } },
    });
    logger.info('Old quota records cleaned', { deleted: result.count });
    return result.count;
  } catch (error: unknown) {
    logger.error('Error cleaning old quota records:', error);
    return 0;
  }
}

// ============================================
// Cleanup Old Expired Media Records
// ============================================

/**
 * Delete media records that have been in EXPIRED status for more than 7 days.
 */
export async function purgeExpiredMediaRecords(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await prisma.media.deleteMany({
      where: {
        status: 'EXPIRED',
        updatedAt: { lt: cutoff },
      },
    });
    logger.info('Expired media records purged', { deleted: result.count });
    return result.count;
  } catch (error: unknown) {
    logger.error('Error purging expired media records:', error);
    return 0;
  }
}

// ============================================
// Cleanup Old Transcode Job Records
// ============================================

/**
 * Delete completed/failed transcode job records older than 30 days.
 */
export async function cleanupOldTranscodeJobs(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await prisma.transcodeJob.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'FAILED'] },
        createdAt: { lt: cutoff },
      },
    });
    logger.info('Old transcode jobs cleaned', { deleted: result.count });
    return result.count;
  } catch (error: unknown) {
    logger.error('Error cleaning old transcode jobs:', error);
    return 0;
  }
}

// ============================================
// Helper: Safe storage deletion
// ============================================

async function safeDeleteFromStorage(url: string): Promise<void> {
  try {
    if (url && url.length > 0) {
      await deleteMedia(url);
    }
  } catch (error: unknown) {
    logger.warn('Failed to delete file from storage:', { url, error: error instanceof Error ? error.message : String(error) });
  }
}
