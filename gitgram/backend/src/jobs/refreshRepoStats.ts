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

// Engagement scoring weights and the recency window used for the trending score.
const TRENDING_WINDOW_DAYS = 7;
const SCORE_WEIGHTS = {
    post: 3,
    follower: 5,
    reel: 4,
    snippet: 2,
    star: 1,
} as const;

/**
 * Computes a normalized engagement/trending score for a repository from its
 * current social counts and recent activity.
 */
function computeTrendingScore(input: {
    posts: number;
    followers: number;
    reels: number;
    snippets: number;
    stars: number;
    recentPosts: number;
}): number {
    const base =
        input.posts * SCORE_WEIGHTS.post +
        input.followers * SCORE_WEIGHTS.follower +
        input.reels * SCORE_WEIGHTS.reel +
        input.snippets * SCORE_WEIGHTS.snippet +
        input.stars * SCORE_WEIGHTS.star;

    // Recency boost: recent posts in the trending window count double.
    const recencyBoost = input.recentPosts * SCORE_WEIGHTS.post;

    return Math.round((base + recencyBoost) * 100) / 100;
}

/**
 * Update repository engagement metrics.
 *
 * Recomputes denormalized social counts (postsCount, followersCount) and a
 * trendingScore from live relation counts, then persists them back to each
 * Repository row. Only rows whose computed values changed are written.
 */
export async function updateEngagementMetrics() {
    logger.info('📊 Updating repository engagement metrics...');

    try {
        const recentSince = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

        const repos = await prisma.repository.findMany({
            select: {
                id: true,
                fullName: true,
                postsCount: true,
                followersCount: true,
                trendingScore: true,
                trending: true,
                _count: {
                    select: {
                        posts: true,
                        followers: true,
                        reels: true,
                        snippets: true,
                        starredBy: true,
                    },
                },
            },
        });

        let updated = 0;

        for (const repo of repos) {
            const recentPosts = await prisma.post.count({
                where: { repositoryId: repo.id, createdAt: { gte: recentSince } },
            });

            const trendingScore = computeTrendingScore({
                posts: repo._count.posts,
                followers: repo._count.followers,
                reels: repo._count.reels,
                snippets: repo._count.snippets,
                stars: repo._count.starredBy,
                recentPosts,
            });

            const isTrending = recentPosts > 0 && trendingScore > 0;

            const changed =
                repo.postsCount !== repo._count.posts ||
                repo.followersCount !== repo._count.followers ||
                repo.trendingScore !== trendingScore ||
                repo.trending !== isTrending;

            if (!changed) continue;

            await prisma.repository.update({
                where: { id: repo.id },
                data: {
                    postsCount: repo._count.posts,
                    followersCount: repo._count.followers,
                    trendingScore,
                    trending: isTrending,
                },
            });
            updated++;
        }

        logger.info(`✅ Engagement metrics updated: ${updated}/${repos.length} repositories changed`);
    } catch (error) {
        logger.error('❌ Failed to update engagement metrics:', error);
    }
}
