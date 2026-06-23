import cron from 'node-cron';
import logger from '../utils/logger';
import { updateTrendingRepos, calculateTrendingScores, cleanOldCache } from './updateTrending';
import { refreshRepoStats, cleanupInactiveRepos, updateEngagementMetrics } from './refreshRepoStats';
import {
    computeHotNow,
    computeTrendingToday,
    computeThisWeek,
    computeRisingStars,
    computeAllTiers,
    cleanupTrendingData,
} from './trendingRankingJob';
import { runMediaCleanup, runMediaDeepCleanup } from './mediaCleanup';
import { prisma } from '../utils/prisma';
import { publishScheduledPosts } from '../controllers/scheduledPostsController';

/**
 * Delete expired stories (older than 24 hours past their expiresAt)
 */
async function cleanupExpiredStories() {
    try {
        const now = new Date();

        // Delete stories that have expired
        const result = await prisma.story.deleteMany({
            where: {
                expiresAt: { lt: now },
            },
        });

        logger.info(`Cleaned up ${result.count} expired stories`);
    } catch (error) {
        logger.error('Error cleaning up expired stories:', error);
    }
}

/**
 * Cleanup old notifications (read notifications older than 30 days)
 */
async function cleanupOldNotifications() {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const result = await prisma.notification.deleteMany({
            where: {
                read: true,
                createdAt: { lt: thirtyDaysAgo },
            },
        });

        logger.info(`Deleted ${result.count} old read notifications`);
    } catch (error) {
        logger.error('Error cleaning up old notifications:', error);
    }
}

/**
 * Process scheduled account deletions
 */
async function processAccountDeletions() {
    try {
        const { processScheduledDeletions } = await import('../services/accountDeletionService');
        const result = await processScheduledDeletions();
        logger.info(`Processed ${result.processed} scheduled account deletions`);
    } catch (error) {
        logger.error('Error processing account deletions:', error);
    }
}

/**
 * Cleanup expired sessions
 */
async function cleanupExpiredSessions() {
    try {
        const result = await prisma.session.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });

        logger.info(`Deleted ${result.count} expired sessions`);
    } catch (error) {
        logger.error('Error cleaning up expired sessions:', error);
    }
}

/**
 * Update user activity metrics
 */
async function updateActivityMetrics() {
    try {
        // Update last active for users who have recent interactions
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // This is a simplified version - you might want to track more specific metrics
        const activeUsers = await prisma.post.groupBy({
            by: ['userId'],
            where: {
                createdAt: { gte: oneDayAgo },
            },
        });

        logger.info(`Found ${activeUsers.length} active users in last 24 hours`);
    } catch (error) {
        logger.error('Error updating activity metrics:', error);
    }
}

/**
 * Cleanup failed scheduled posts
 */
async function cleanupFailedScheduledPosts() {
    try {
        // Delete failed scheduled posts older than 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const result = await prisma.scheduledPost.deleteMany({
            where: {
                status: 'failed',
                createdAt: { lt: sevenDaysAgo },
            },
        });

        logger.info(`Deleted ${result.count} old failed scheduled posts`);
    } catch (error) {
        logger.error('Error cleaning up failed scheduled posts:', error);
    }
}

/**
 * Cleanup old published scheduled posts (keeping records for 30 days)
 */
async function cleanupOldPublishedScheduledPosts() {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const result = await prisma.scheduledPost.deleteMany({
            where: {
                status: 'published',
                publishedAt: { lt: thirtyDaysAgo },
            },
        });

        logger.info(`Deleted ${result.count} old published scheduled post records`);
    } catch (error) {
        logger.error('Error cleaning up old published scheduled posts:', error);
    }
}

/**
 * Process scheduled posts - publishes posts that are due
 * This is the core scheduler function that runs every minute
 */
async function processScheduledPosts() {
    try {
        const result = await publishScheduledPosts();
        if (result.processed > 0) {
            logger.info(`Scheduled posts job: Published ${result.processed} posts`);
        }
    } catch (error) {
        logger.error('Error processing scheduled posts:', error);
    }
}

/**
 * Initialize and start all scheduled jobs
 */
export function initializeJobs() {
    logger.info('Initializing background jobs...');

    // =============================================
    // SCHEDULED POSTS - Every minute
    // =============================================
    cron.schedule('* * * * *', async () => {
        await processScheduledPosts();
    });

    // =============================================
    // TRENDING & REPO STATS
    // =============================================

    // Update trending repositories every 6 hours (legacy)
    cron.schedule('0 */6 * * *', async () => {
        logger.info('Running scheduled job: Update Trending Repos');
        await updateTrendingRepos();
        await calculateTrendingScores();
    });

    // Refresh repository stats daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
        logger.info('Running scheduled job: Refresh Repo Stats');
        await refreshRepoStats();
        await updateEngagementMetrics();
    });

    // =============================================
    // TRENDING RANKING (Multi-Tier)
    // =============================================

    // "Hot Now" - every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        logger.info('Running scheduled job: Trending HOT_NOW');
        await computeHotNow();
    });

    // "Trending Today" - every hour at minute 5
    cron.schedule('5 * * * *', async () => {
        logger.info('Running scheduled job: Trending TRENDING_TODAY');
        await computeTrendingToday();
    });

    // "This Week" - daily at 1:30 AM
    cron.schedule('30 1 * * *', async () => {
        logger.info('Running scheduled job: Trending THIS_WEEK');
        await computeThisWeek();
    });

    // "Rising Stars" - daily at 2:30 AM
    cron.schedule('30 2 * * *', async () => {
        logger.info('Running scheduled job: Trending RISING_STARS');
        await computeRisingStars();
    });

    // Cleanup old trending data weekly (Sunday at 4:30 AM)
    cron.schedule('30 4 * * 0', async () => {
        logger.info('Running scheduled job: Cleanup Trending Data');
        await cleanupTrendingData();
    });

    // =============================================
    // CLEANUP JOBS
    // =============================================

    // Cleanup expired stories every hour
    cron.schedule('0 * * * *', async () => {
        logger.info('Running scheduled job: Cleanup Expired Stories');
        await cleanupExpiredStories();
    });

    // Cleanup old notifications daily at 3 AM
    cron.schedule('0 3 * * *', async () => {
        logger.info('Running scheduled job: Cleanup Old Notifications');
        await cleanupOldNotifications();
    });

    // Process account deletions daily at 4 AM
    cron.schedule('0 4 * * *', async () => {
        logger.info('Running scheduled job: Process Account Deletions');
        await processAccountDeletions();
    });

    // Cleanup expired sessions every 6 hours
    cron.schedule('0 */6 * * *', async () => {
        logger.info('Running scheduled job: Cleanup Expired Sessions');
        await cleanupExpiredSessions();
    });

    // Update activity metrics daily at 1 AM
    cron.schedule('0 1 * * *', async () => {
        logger.info('Running scheduled job: Update Activity Metrics');
        await updateActivityMetrics();
    });

    // Cleanup failed scheduled posts weekly (Sunday at 5 AM)
    cron.schedule('0 5 * * 0', async () => {
        logger.info('Running scheduled job: Cleanup Failed Scheduled Posts');
        await cleanupFailedScheduledPosts();
    });

    // Clean old cache weekly (Sunday at 3 AM)
    cron.schedule('0 3 * * 0', async () => {
        logger.info('Running scheduled job: Clean Old Cache');
        await cleanOldCache();
    });

    // Cleanup inactive repos monthly (1st day at 4 AM)
    cron.schedule('0 4 1 * *', async () => {
        logger.info('Running scheduled job: Cleanup Inactive Repos');
        await cleanupInactiveRepos();
    });

    // Cleanup old published scheduled posts weekly (Sunday at 6 AM)
    cron.schedule('0 6 * * 0', async () => {
        logger.info('Running scheduled job: Cleanup Old Published Scheduled Posts');
        await cleanupOldPublishedScheduledPosts();
    });

    // =============================================
    // MEDIA PIPELINE CLEANUP JOBS
    // =============================================

    // Media cleanup: expired stories, orphaned media, soft-deleted past retention - every 2 hours
    cron.schedule('0 */2 * * *', async () => {
        logger.info('Running scheduled job: Media Cleanup');
        await runMediaCleanup();
    });

    // Media deep cleanup: purge old records, transcode jobs - weekly (Saturday at 3 AM)
    cron.schedule('0 3 * * 6', async () => {
        logger.info('Running scheduled job: Media Deep Cleanup');
        await runMediaDeepCleanup();
    });

    logger.info('Background jobs initialized successfully');
    logger.info('Scheduled jobs:');
    logger.info('  - Process Scheduled Posts: Every minute');
    logger.info('  - Update Trending (legacy): Every 6 hours');
    logger.info('  - Trending HOT_NOW: Every 15 minutes');
    logger.info('  - Trending TRENDING_TODAY: Every hour');
    logger.info('  - Trending THIS_WEEK: Daily at 1:30 AM');
    logger.info('  - Trending RISING_STARS: Daily at 2:30 AM');
    logger.info('  - Cleanup Trending Data: Weekly (Sunday 4:30 AM)');
    logger.info('  - Refresh Stats: Daily at 2 AM');
    logger.info('  - Cleanup Stories: Every hour');
    logger.info('  - Cleanup Notifications: Daily at 3 AM');
    logger.info('  - Process Deletions: Daily at 4 AM');
    logger.info('  - Cleanup Sessions: Every 6 hours');
    logger.info('  - Activity Metrics: Daily at 1 AM');
    logger.info('  - Cleanup Failed Posts: Weekly (Sunday 5 AM)');
    logger.info('  - Clean Cache: Weekly (Sunday 3 AM)');
    logger.info('  - Cleanup Inactive: Monthly (1st day 4 AM)');
    logger.info('  - Cleanup Published Scheduled: Weekly (Sunday 6 AM)');
    logger.info('  - Media Cleanup: Every 2 hours');
    logger.info('  - Media Deep Cleanup: Weekly (Saturday 3 AM)');
}

/**
 * Run all jobs immediately (for testing)
 */
export async function runAllJobsNow() {
    logger.info('Running all jobs immediately...');

    try {
        await processScheduledPosts();
        await updateTrendingRepos();
        await calculateTrendingScores();
        await computeAllTiers();
        await refreshRepoStats();
        await updateEngagementMetrics();
        await cleanOldCache();

        logger.info('All jobs completed successfully');
    } catch (error) {
        logger.error('Error running jobs:', error);
    }
}

/**
 * Manually trigger scheduled posts processing (for testing/admin)
 */
export async function triggerScheduledPostsProcessing() {
    logger.info('Manually triggering scheduled posts processing...');
    return processScheduledPosts();
}
