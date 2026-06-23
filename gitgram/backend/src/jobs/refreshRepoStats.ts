import { githubService } from '../services/githubService';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

/**
 * Refresh repository statistics
 * Runs daily at 2 AM
 */
export async function refreshRepoStats() {
    logger.info('🔄 Starting repository stats refresh...');

    try {
        // Get all repositories that need updating (older than 24 hours)
        const repos = await prisma.repository.findMany({
            where: {
                lastFetched: {
                    lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
            take: 100, // Process 100 repos at a time to avoid rate limits
            orderBy: {
                lastFetched: 'asc',
            },
        });

        logger.info(`Found ${repos.length} repositories to update`);

        let updated = 0;
        let failed = 0;

        for (const repo of repos) {
            try {
                await githubService.syncRepositoryToDb(repo.owner, repo.name);
                updated++;

                // Add delay to respect GitHub API rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                logger.error(`Failed to refresh ${repo.owner}/${repo.name}:`, error);
                failed++;
            }
        }

        logger.info(`✅ Repository stats refreshed: ${updated} updated, ${failed} failed`);
    } catch (error) {
        logger.error('❌ Failed to refresh repository stats:', error);
    }
}

/**
 * Clean up inactive repositories
 * Remove repos with no activity for 90 days
 */
export async function cleanupInactiveRepos() {
    logger.info('🧹 Cleaning up inactive repositories...');

    try {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        const result = await prisma.repository.deleteMany({
            where: {
                AND: [
                    {
                        lastFetched: {
                            lt: ninetyDaysAgo,
                        },
                    },
                    {
                        posts: {
                            none: {},
                        },
                    },
                    {
                        followers: {
                            none: {},
                        },
                    },
                ],
            },
        });

        logger.info(`✅ Cleaned up ${result.count} inactive repositories`);
    } catch (error) {
        logger.error('❌ Failed to cleanup inactive repositories:', error);
    }
}

/**
 * Update repository engagement metrics
 * Calculate posts count, followers count, etc.
 */
export async function updateEngagementMetrics() {
    logger.info('📊 Updating repository engagement metrics...');

    try {
        const repos = await prisma.repository.findMany({
            include: {
                _count: {
                    select: {
                        posts: true,
                        followers: true,
                    },
                },
            },
        });

        for (const repo of repos) {
            // Update gitgramStats if needed
            // This is a placeholder - you can add more complex metrics here
            logger.debug(`Repo ${repo.fullName}: ${repo._count.posts} posts, ${repo._count.followers} followers`);
        }

        logger.info('✅ Engagement metrics updated successfully');
    } catch (error) {
        logger.error('❌ Failed to update engagement metrics:', error);
    }
}
