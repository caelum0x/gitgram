import { githubService } from '../services/githubService';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import redisClient from '../services/redisService';

/**
 * Update trending repositories
 * Runs every 6 hours
 */
export async function updateTrendingRepos() {
    logger.info('🔄 Starting trending repositories update...');

    try {
        const periods: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly'];
        const languages = ['JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Java'];

        for (const period of periods) {
            // Fetch trending repos for all languages
            logger.info(`Fetching ${period} trending repos...`);
            const allTrending = await githubService.fetchTrendingRepos(period, undefined, 25);

            // Sync to database
            for (const repo of allTrending) {
                try {
                    await githubService.syncRepositoryToDb(repo.owner, repo.name);
                } catch (error) {
                    logger.error(`Failed to sync ${repo.owner}/${repo.name}:`, error);
                }
            }

            // Fetch trending for specific languages
            for (const language of languages) {
                try {
                    const langTrending = await githubService.fetchTrendingRepos(period, language, 10);
                    for (const repo of langTrending) {
                        try {
                            await githubService.syncRepositoryToDb(repo.owner, repo.name);
                        } catch (error) {
                            logger.error(`Failed to sync ${repo.owner}/${repo.name}:`, error);
                        }
                    }
                } catch (error) {
                    logger.error(`Failed to fetch ${language} trending:`, error);
                }
            }
        }

        logger.info('✅ Trending repositories updated successfully');
    } catch (error) {
        logger.error('❌ Failed to update trending repositories:', error);
    }
}

/**
 * Calculate trending score for repositories
 * Based on recent activity and engagement
 */
export async function calculateTrendingScores() {
    logger.info('📊 Calculating trending scores...');

    try {
        const repos = await prisma.repository.findMany({
            where: {
                lastFetched: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                },
            },
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
            // Calculate score based on:
            // - GitHub stars (weight: 1)
            // - Forks (weight: 2)
            // - Gitgram posts (weight: 10)
            // - Gitgram followers (weight: 5)
            // - Recency (decay factor)

            const daysSinceUpdate = Math.floor(
                (Date.now() - new Date(repo.lastFetched!).getTime()) / (1000 * 60 * 60 * 24)
            );
            const recencyFactor = Math.max(0.1, 1 - daysSinceUpdate / 30); // Decay over 30 days

            const score =
                (repo.stars * 1 +
                    repo.forks * 2 +
                    repo._count.posts * 10 +
                    repo._count.followers * 5) * recencyFactor;

            await prisma.repository.update({
                where: { id: repo.id },
                data: {
                    trending: score > 100, // Mark as trending if score > 100
                },
            });
        }

        logger.info('✅ Trending scores calculated successfully');
    } catch (error) {
        logger.error('❌ Failed to calculate trending scores:', error);
    }
}

/**
 * Clean old cache entries
 */
export async function cleanOldCache() {
    logger.info('🧹 Cleaning old cache entries...');

    try {
        const redis = redisClient;
        if (!redis || !redis.isOpen) {
            logger.warn('Redis not available, skipping cache cleanup');
            return;
        }

        // Clean GitHub trending cache older than 6 hours
        const trendingKeys = await redis.keys('github:trending:*');
        for (const key of trendingKeys) {
            const ttl = await redis.ttl(key);
            if (typeof ttl === 'number' && ttl < 0) {
                await redis.del(key);
            }
        }

        // Clean repository cache older than 24 hours
        const repoKeys = await redis.keys('github:repo:*');
        for (const key of repoKeys) {
            const ttl = await redis.ttl(key);
            if (typeof ttl === 'number' && ttl < 0) {
                await redis.del(key);
            }
        }

        logger.info('✅ Cache cleaned successfully');
    } catch (error) {
        logger.error('❌ Failed to clean cache:', error);
    }
}
