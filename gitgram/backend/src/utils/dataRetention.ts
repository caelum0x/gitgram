import { prisma } from './prisma';
import logger from './logger';

/**
 * Data retention cleanup for production.
 *
 * Handles GDPR/compliance-oriented cleanup that goes beyond the regular
 * scheduler jobs (expired stories, notifications, sessions, etc.).
 * Specifically targets:
 *   - Old read notifications past the retention window
 *   - Expired sessions
 *   - Old expired stories
 *   - Failed scheduled posts past retention
 */

const RETENTION_DAYS = parseInt(process.env.MEDIA_RETENTION_DAYS || '30', 10);
const INTERVAL_MS = 6 * 60 * 60 * 1000; // Every 6 hours

async function runDataRetentionCleanup(): Promise<void> {
  logger.info('[DataRetention] Starting data retention cleanup...');

  const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  try {
    // 1. Purge old read notifications past retention
    const oldNotifications = await prisma.notification.deleteMany({
      where: {
        read: true,
        createdAt: { lt: retentionCutoff },
      },
    });
    if (oldNotifications.count > 0) {
      logger.info(`[DataRetention] Purged ${oldNotifications.count} old notifications`);
    }

    // 2. Clean expired sessions
    const expiredSessions = await prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    if (expiredSessions.count > 0) {
      logger.info(`[DataRetention] Cleaned ${expiredSessions.count} expired sessions`);
    }

    // 3. Purge expired stories
    const expiredStories = await prisma.story.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    if (expiredStories.count > 0) {
      logger.info(`[DataRetention] Purged ${expiredStories.count} expired stories`);
    }

    // 4. Purge failed scheduled posts older than retention period
    const failedPosts = await prisma.scheduledPost.deleteMany({
      where: {
        status: 'failed',
        createdAt: { lt: retentionCutoff },
      },
    });
    if (failedPosts.count > 0) {
      logger.info(`[DataRetention] Purged ${failedPosts.count} failed scheduled posts`);
    }

    logger.info('[DataRetention] Data retention cleanup completed');
  } catch (error: any) {
    logger.error('[DataRetention] Cleanup failed:', error.message);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Schedule periodic data retention cleanup.
 * Runs immediately on start, then every INTERVAL_MS.
 */
export function scheduleDataRetentionCleanup(): void {
  // Run once on startup (non-blocking)
  runDataRetentionCleanup().catch((err) =>
    logger.error('[DataRetention] Initial run failed:', err.message)
  );

  intervalHandle = setInterval(() => {
    runDataRetentionCleanup().catch((err) =>
      logger.error('[DataRetention] Scheduled run failed:', err.message)
    );
  }, INTERVAL_MS);

  logger.info(`[DataRetention] Cleanup scheduled every ${INTERVAL_MS / 3600000}h`);
}

export function stopDataRetentionCleanup(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
