import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { Repository } from '@prisma/client';

interface RecommendationScore {
    repositoryId: string;
    score: number;
    reasons: string[];
}

export class GitHubRecommendationService {
    /**
     * Get personalized repository recommendations for a user
     */
    async getPersonalizedRecommendations(userId: string, limit: number = 20): Promise<any[]> {
        try {
            // Get user's language preferences
            const languagePrefs = await this.getUserLanguagePreferences(userId);

            // Get user's topic interests
            const topicInterests = await this.getUserTopicInterests(userId);

            // Get repositories user already follows
            const followedRepos = await prisma.repositoryFollow.findMany({
                where: { userId },
                select: { repositoryId: true },
            });
            const followedIds = followedRepos.map(f => f.repositoryId);

            // Get collaborative filtering recommendations
            const collaborativeRecs = await this.getCollaborativeRecommendations(userId, followedIds);

            // Get content-based recommendations
            const contentRecs = await this.getContentBasedRecommendations(
                languagePrefs,
                topicInterests,
                followedIds
            );

            // Combine and score recommendations
            const combined = this.combineRecommendations(collaborativeRecs, contentRecs);

            // Get repository details
            const recommendations = await prisma.repository.findMany({
                where: {
                    id: { in: combined.slice(0, limit).map(r => r.repositoryId) },
                },
                include: {
                    posts: {
                        take: 3,
                        orderBy: { createdAt: 'desc' },
                        include: {
                            user: { select: { id: true, username: true, avatar: true } },
                        },
                    },
                    followers: { take: 5 },
                    _count: {
                        select: { posts: true, followers: true },
                    },
                },
            });

            // Sort by recommendation score
            const scoreMap = new Map(combined.map(r => [r.repositoryId, r.score]));
            recommendations.sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0));

            return recommendations;
        } catch (error: any) {
            logger.error('Failed to get personalized recommendations:', error);
            throw new Error('Failed to get recommendations');
        }
    }

    /**
     * Get similar repositories based on language and topics
     */
    async getSimilarRepositories(repositoryId: string, limit: number = 10): Promise<any[]> {
        try {
            const repository = await prisma.repository.findUnique({
                where: { id: repositoryId },
            });

            if (!repository) {
                throw new Error('Repository not found');
            }

            // Find repositories with similar language and topics
            const similar = await prisma.repository.findMany({
                where: {
                    AND: [
                        { id: { not: repositoryId } },
                        {
                            OR: [
                                { language: repository.language },
                                { topics: { hasSome: repository.topics } },
                            ],
                        },
                    ],
                },
                take: limit * 2,
                orderBy: [
                    { stars: 'desc' },
                    { trendingScore: 'desc' },
                ],
                include: {
                    _count: {
                        select: { posts: true, followers: true },
                    },
                },
            });

            // Calculate similarity scores
            const scored = similar.map(repo => {
                let score = 0;

                // Language match
                if (repo.language === repository.language) score += 3;

                // Topic overlap
                const commonTopics = repo.topics.filter(t => repository.topics.includes(t));
                score += commonTopics.length * 2;

                // Popularity factor
                score += Math.log(repo.stars + 1) * 0.1;

                return { ...repo, similarityScore: score };
            });

            // Sort by similarity score and return top results
            scored.sort((a, b) => b.similarityScore - a.similarityScore);
            return scored.slice(0, limit);
        } catch (error: any) {
            logger.error('Failed to get similar repositories:', error);
            throw new Error('Failed to get similar repositories');
        }
    }

    /**
     * Calculate trending score for a repository
     */
    async calculateTrendingScore(repository: Repository): Promise<number> {
        try {
            const now = new Date();
            const ageInDays = Math.max(
                1,
                (now.getTime() - repository.createdAt.getTime()) / (1000 * 60 * 60 * 24)
            );

            // Get Gitgram-specific metrics
            const gitgramMetrics = await prisma.repository.findUnique({
                where: { id: repository.id },
                include: {
                    _count: {
                        select: { posts: true, followers: true },
                    },
                },
            });

            const postsCount = gitgramMetrics?._count?.posts || 0;
            const followersCount = gitgramMetrics?._count?.followers || 0;
            const viewsCount = 0;

            // Trending score formula
            const score =
                (repository.stars * 1.0 +
                    repository.forks * 0.5 +
                    repository.watchers * 0.3 +
                    postsCount * 2.0 +
                    followersCount * 1.5 +
                    viewsCount * 0.1) /
                Math.pow(ageInDays, 0.8);

            return score;
        } catch (error: any) {
            logger.error('Failed to calculate trending score:', error);
            return 0;
        }
    }

    /**
     * Update user preferences based on repository interaction
     */
    async updateUserPreferences(userId: string, repositoryId: string): Promise<void> {
        try {
            const repository = await prisma.repository.findUnique({
                where: { id: repositoryId },
            });

            if (!repository) return;

            // Update language preference
            if (repository.language) {
                await prisma.userLanguagePreference.upsert({
                    where: {
                        userId_language: {
                            userId,
                            language: repository.language,
                        },
                    },
                    create: {
                        userId,
                        language: repository.language,
                        score: 1.0,
                    },
                    update: {
                        score: { increment: 0.1 },
                    },
                });
            }

            // Update topic interests
            for (const topic of repository.topics) {
                await prisma.userTopicInterest.upsert({
                    where: {
                        userId_topic: {
                            userId,
                            topic,
                        },
                    },
                    create: {
                        userId,
                        topic,
                        score: 1.0,
                    },
                    update: {
                        score: { increment: 0.1 },
                    },
                });
            }
        } catch (error: any) {
            logger.error('Failed to update user preferences:', error);
        }
    }

    /**
     * Get user's language preferences
     */
    private async getUserLanguagePreferences(userId: string) {
        return prisma.userLanguagePreference.findMany({
            where: { userId },
            orderBy: { score: 'desc' },
            take: 5,
        });
    }

    /**
     * Get user's topic interests
     */
    private async getUserTopicInterests(userId: string) {
        return prisma.userTopicInterest.findMany({
            where: { userId },
            orderBy: { score: 'desc' },
            take: 10,
        });
    }

    /**
     * Collaborative filtering: users who liked X also liked Y
     */
    private async getCollaborativeRecommendations(
        userId: string,
        excludeIds: string[]
    ): Promise<RecommendationScore[]> {
        try {
            // Find users with similar interests (who follow similar repos)
            const userFollows = await prisma.repositoryFollow.findMany({
                where: { userId },
                select: { repositoryId: true },
            });

            if (userFollows.length === 0) return [];

            const userRepoIds = userFollows.map(f => f.repositoryId);

            // Find other users who follow these repos
            const similarUsers = await prisma.repositoryFollow.groupBy({
                by: ['userId'],
                where: {
                    repositoryId: { in: userRepoIds },
                    userId: { not: userId },
                },
                _count: { repositoryId: true },
                orderBy: { _count: { repositoryId: 'desc' } },
                take: 20,
            });

            // Get repos followed by similar users
            const recommendations = await prisma.repositoryFollow.groupBy({
                by: ['repositoryId'],
                where: {
                    userId: { in: similarUsers.map(u => u.userId).filter((id): id is string => id !== null) },
                    repositoryId: { notIn: [...excludeIds, ...userRepoIds] },
                },
                _count: { userId: true },
                orderBy: { _count: { userId: 'desc' } },
                take: 30,
            });

            return recommendations.map(r => ({
                repositoryId: r.repositoryId,
                score: (r._count as { userId: number }).userId * 2.0, // Collaborative score
                reasons: ['Popular with similar users'],
            }));
        } catch (error: any) {
            logger.error('Failed to get collaborative recommendations:', error);
            return [];
        }
    }

    /**
     * Content-based filtering: based on user's language and topic preferences
     */
    private async getContentBasedRecommendations(
        languagePrefs: any[],
        topicInterests: any[],
        excludeIds: string[]
    ): Promise<RecommendationScore[]> {
        try {
            const languages = languagePrefs.map(p => p.language);
            const topics = topicInterests.map(i => i.topic);

            if (languages.length === 0 && topics.length === 0) return [];

            const repositories = await prisma.repository.findMany({
                where: {
                    id: { notIn: excludeIds },
                    OR: [
                        { language: { in: languages } },
                        { topics: { hasSome: topics } },
                    ],
                },
                take: 50,
                orderBy: [
                    { trendingScore: 'desc' },
                    { stars: 'desc' },
                ],
            });

            return repositories.map(repo => {
                let score = 0;
                const reasons: string[] = [];

                // Language match
                const langPref = languagePrefs.find(p => p.language === repo.language);
                if (langPref) {
                    score += langPref.score * 1.5;
                    reasons.push(`Matches your interest in ${repo.language}`);
                }

                // Topic match
                const matchingTopics = repo.topics.filter(t =>
                    topics.includes(t)
                );
                if (matchingTopics.length > 0) {
                    const topicScore = matchingTopics.reduce((sum, topic) => {
                        const interest = topicInterests.find(i => i.topic === topic);
                        return sum + (interest?.score || 0);
                    }, 0);
                    score += topicScore;
                    reasons.push(`Matches topics: ${matchingTopics.join(', ')}`);
                }

                // Popularity boost
                score += Math.log(repo.stars + 1) * 0.2;

                return { repositoryId: repo.id, score, reasons };
            });
        } catch (error: any) {
            logger.error('Failed to get content-based recommendations:', error);
            return [];
        }
    }

    /**
     * Combine collaborative and content-based recommendations
     */
    private combineRecommendations(
        collaborative: RecommendationScore[],
        contentBased: RecommendationScore[]
    ): RecommendationScore[] {
        const scoreMap = new Map<string, RecommendationScore>();

        // Add collaborative recommendations
        for (const rec of collaborative) {
            scoreMap.set(rec.repositoryId, rec);
        }

        // Merge content-based recommendations
        for (const rec of contentBased) {
            const existing = scoreMap.get(rec.repositoryId);
            if (existing) {
                existing.score += rec.score;
                existing.reasons.push(...rec.reasons);
            } else {
                scoreMap.set(rec.repositoryId, rec);
            }
        }

        // Convert to array and sort by score
        const combined = Array.from(scoreMap.values());
        combined.sort((a, b) => b.score - a.score);

        return combined;
    }
}

// Export singleton instance
export const githubRecommendationService = new GitHubRecommendationService();
