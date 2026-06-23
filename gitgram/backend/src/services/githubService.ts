import { Octokit } from '@octokit/rest';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import redisClient from './redisService';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
const CACHE_TTL = {
    TRENDING: 6 * 60 * 60, // 6 hours
    REPOSITORY: 24 * 60 * 60, // 24 hours
    SEARCH: 1 * 60 * 60, // 1 hour
};

export class GitHubService {
    private octokit: Octokit;
    private redis: any;

    constructor(accessToken?: string) {
        this.octokit = new Octokit({
            auth: accessToken || GITHUB_TOKEN,
        });
        this.initRedis();
    }

    private async initRedis() {
        try {
            this.redis = redisClient;
        } catch (error) {
            logger.warn('Redis not available for GitHub caching');
        }
    }

    /**
     * Fetch trending repositories from GitHub
     */
    async fetchTrendingRepos(
        period: 'daily' | 'weekly' | 'monthly' = 'daily',
        language?: string,
        limit: number = 25
    ) {
        const cacheKey = `github:trending:${period}:${language || 'all'}`;

        // Try cache first
        if (this.redis) {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }

        try {
            // Calculate date range for trending
            const since = this.getTrendingDate(period);

            // Search for trending repos
            const { data } = await this.octokit.search.repos({
                q: `created:>${since}${language ? ` language:${language}` : ''}`,
                sort: 'stars',
                order: 'desc',
                per_page: limit,
            });

            const repos = data.items.map(repo => ({
                id: repo.id,
                owner: repo.owner?.login || '',
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                watchers: repo.watchers_count,
                openIssues: repo.open_issues_count,
                language: repo.language,
                topics: repo.topics || [],
                avatarUrl: repo.owner?.avatar_url || '',
                htmlUrl: repo.html_url,
            }));

            // Cache results
            if (this.redis) {
                await this.redis.setex(cacheKey, CACHE_TTL.TRENDING, JSON.stringify(repos));
            }

            return repos;
        } catch (error: any) {
            logger.error('Failed to fetch trending repos:', error);
            throw new Error('Failed to fetch trending repositories');
        }
    }

    /**
     * Search repositories with filters
     */
    async searchRepositories(
        query: string,
        options: {
            language?: string;
            topics?: string[];
            minStars?: number;
            sort?: 'stars' | 'forks' | 'updated';
            limit?: number;
        } = {}
    ) {
        const { language, topics, minStars, sort = 'stars', limit = 30 } = options;

        try {
            let searchQuery = query;

            if (language) searchQuery += ` language:${language}`;
            if (topics && topics.length > 0) {
                topics.forEach(topic => {
                    searchQuery += ` topic:${topic}`;
                });
            }
            if (minStars) searchQuery += ` stars:>=${minStars}`;

            const { data } = await this.octokit.search.repos({
                q: searchQuery,
                sort,
                order: 'desc',
                per_page: limit,
            });

            return data.items.map(repo => ({
                id: repo.id,
                owner: repo.owner?.login || '',
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                watchers: repo.watchers_count,
                openIssues: repo.open_issues_count,
                language: repo.language,
                topics: repo.topics || [],
                avatarUrl: repo.owner?.avatar_url || '',
                htmlUrl: repo.html_url,
            }));
        } catch (error: any) {
            logger.error('Failed to search repositories:', error);
            throw new Error('Failed to search repositories');
        }
    }

    /**
     * Get repository details
     */
    async getRepositoryDetails(owner: string, repo: string) {
        const cacheKey = `github:repo:${owner}/${repo}`;

        // Try cache first
        if (this.redis) {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }

        try {
            const { data } = await this.octokit.repos.get({ owner, repo });

            const repoData = {
                id: data.id,
                owner: data.owner.login,
                name: data.name,
                fullName: data.full_name,
                description: data.description,
                stars: data.stargazers_count,
                forks: data.forks_count,
                watchers: data.watchers_count,
                openIssues: data.open_issues_count,
                language: data.language,
                topics: data.topics || [],
                avatarUrl: data.owner.avatar_url,
                htmlUrl: data.html_url,
            };

            // Cache results
            if (this.redis) {
                await this.redis.setex(cacheKey, CACHE_TTL.REPOSITORY, JSON.stringify(repoData));
            }

            return repoData;
        } catch (error: any) {
            logger.error(`Failed to get repository ${owner}/${repo}:`, error);
            throw new Error('Failed to get repository details');
        }
    }

    /**
     * Get repositories by language
     */
    async getRepositoriesByLanguage(language: string, limit: number = 30) {
        try {
            const { data } = await this.octokit.search.repos({
                q: `language:${language}`,
                sort: 'stars',
                order: 'desc',
                per_page: limit,
            });

            return data.items.map(repo => ({
                id: repo.id,
                owner: repo.owner?.login || '',
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                watchers: repo.watchers_count,
                language: repo.language,
                topics: repo.topics || [],
                avatarUrl: repo.owner?.avatar_url || '',
                htmlUrl: repo.html_url,
            }));
        } catch (error: any) {
            logger.error(`Failed to get repositories for language ${language}:`, error);
            throw new Error('Failed to get repositories by language');
        }
    }

    /**
     * Get repositories by topic
     */
    async getRepositoriesByTopic(topic: string, limit: number = 30) {
        try {
            const { data } = await this.octokit.search.repos({
                q: `topic:${topic}`,
                sort: 'stars',
                order: 'desc',
                per_page: limit,
            });

            return data.items.map(repo => ({
                id: repo.id,
                owner: repo.owner?.login || '',
                name: repo.name,
                fullName: repo.full_name,
                description: repo.description,
                stars: repo.stargazers_count,
                forks: repo.forks_count,
                watchers: repo.watchers_count,
                language: repo.language,
                topics: repo.topics || [],
                avatarUrl: repo.owner?.avatar_url || '',
                htmlUrl: repo.html_url,
            }));
        } catch (error: any) {
            logger.error(`Failed to get repositories for topic ${topic}:`, error);
            throw new Error('Failed to get repositories by topic');
        }
    }

    /**
     * Sync repository to database
     */
    async syncRepositoryToDb(owner: string, name: string) {
        try {
            const repoData = await this.getRepositoryDetails(owner, name);

            const repository = await prisma.repository.upsert({
                where: { owner_name: { owner, name } },
                create: {
                    owner: repoData.owner,
                    name: repoData.name,
                    fullName: repoData.fullName,
                    description: repoData.description,
                    stars: repoData.stars,
                    forks: repoData.forks,
                    watchers: repoData.watchers,
                    openIssues: repoData.openIssues,
                    language: repoData.language,
                    topics: repoData.topics,
                    htmlUrl: repoData.htmlUrl,
                    lastFetched: new Date(),
                },
                update: {
                    description: repoData.description,
                    stars: repoData.stars,
                    forks: repoData.forks,
                    watchers: repoData.watchers,
                    openIssues: repoData.openIssues,
                    language: repoData.language,
                    topics: repoData.topics,
                    lastFetched: new Date(),
                },
            });

            return repository;
        } catch (error: any) {
            logger.error(`Failed to sync repository ${owner}/${name}:`, error);
            throw error;
        }
    }

    /**
     * Batch update repositories
     */
    async batchUpdateRepositories(repos: Array<{ owner: string; name: string }>) {
        const results = [];

        for (const repo of repos) {
            try {
                const updated = await this.syncRepositoryToDb(repo.owner, repo.name);
                results.push(updated);
            } catch (error) {
                logger.error(`Failed to update ${repo.owner}/${repo.name}:`, error);
            }
        }

        return results;
    }

    /**
     * Get rate limit status
     */
    async getRateLimit() {
        try {
            const { data } = await this.octokit.rateLimit.get();
            return {
                limit: data.rate.limit,
                remaining: data.rate.remaining,
                reset: new Date(data.rate.reset * 1000),
            };
        } catch (error: any) {
            logger.error('Failed to get rate limit:', error);
            throw new Error('Failed to get rate limit');
        }
    }

    /**
     * Helper: Get date for trending period
     */
    private getTrendingDate(period: 'daily' | 'weekly' | 'monthly'): string {
        const now = new Date();
        const daysAgo = {
            daily: 1,
            weekly: 7,
            monthly: 30,
        }[period];

        const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
        return date.toISOString().split('T')[0];
    }
}

// Export singleton instance
export const githubService = new GitHubService();
