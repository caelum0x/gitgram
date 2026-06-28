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

/** Parse an "owner/repo" string into its parts, validating the shape. */
function parseRepoFullName(fullName: string): { owner: string; repo: string } {
    const trimmed = (fullName || '').trim().replace(/\.git$/i, '');
    const parts = trimmed.split('/').filter(Boolean);
    if (parts.length !== 2) {
        throw new Error(`Invalid repository full name: "${fullName}". Expected "owner/repo".`);
    }
    return { owner: parts[0], repo: parts[1] };
}

/** Strip a leading "@" and surrounding whitespace from a username. */
function normalizeUsername(username: string): string {
    const normalized = (username || '').trim().replace(/^@/, '');
    if (!normalized) {
        throw new Error('A GitHub username is required.');
    }
    return normalized;
}

/** Narrow an unknown Octokit error to detect a 404 (not-found) response. */
function isNotFoundError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        (error as { status?: number }).status === 404
    );
}

export class GitHubService {
    private octokit: Octokit;
    private redis: any;
    /** The per-user OAuth token, when this instance was built for a user. */
    private readonly userAccessToken?: string;

    constructor(accessToken?: string) {
        this.userAccessToken = accessToken;
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
     * Get the per-language byte breakdown for a repository.
     * Returns a map of language name -> bytes, as reported by the GitHub API.
     */
    async getRepositoryLanguages(owner: string, repo: string): Promise<Record<string, number>> {
        const cacheKey = `github:languages:${owner}/${repo}`;

        if (this.redis) {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }

        const { data } = await this.octokit.repos.listLanguages({ owner, repo });

        if (this.redis) {
            await this.redis.setex(cacheKey, CACHE_TTL.REPOSITORY, JSON.stringify(data));
        }

        return data;
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

    // ============================================
    // TWO-WAY GITHUB ACTIONS (write-back via user OAuth token)
    //
    // Ported from gh-social (githubApi.ts: starAction, followAction,
    // hasIStarredTheRepo, amIFollowingTheUser). These require a per-user OAuth
    // token with the `public_repo`/`user:follow` scopes — construct the service
    // with `new GitHubService(userAccessToken)`. The shared app token used by
    // the singleton MUST NOT be used here, so each method guards against it.
    // ============================================

    /**
     * Guard: write actions require a per-user OAuth token, never the shared
     * app/server token. Throws a clear error when the service was built without
     * an explicit token.
     */
    private assertUserToken(): void {
        if (!this.userAccessToken) {
            throw new Error(
                'A GitHub user access token is required for write actions. ' +
                'Construct GitHubService with the user OAuth token.'
            );
        }
    }

    /**
     * Star a repository on GitHub.com on behalf of the authenticated user.
     * Idempotent: starring an already-starred repo still resolves to starred.
     * @param fullName - "owner/repo"
     * @returns true when the repo is starred after the call.
     */
    async starRepo(fullName: string): Promise<boolean> {
        this.assertUserToken();
        const { owner, repo } = parseRepoFullName(fullName);
        try {
            await this.octokit.activity.starRepoForAuthenticatedUser({ owner, repo });
            return true;
        } catch (error: unknown) {
            logger.error(`Failed to star repo ${fullName}:`, error);
            throw new Error('Failed to star repository on GitHub');
        }
    }

    /**
     * Remove a star from a repository on GitHub.com.
     * Idempotent: unstarring a not-starred repo still resolves to not-starred.
     * @returns true when the repo is no longer starred after the call.
     */
    async unstarRepo(fullName: string): Promise<boolean> {
        this.assertUserToken();
        const { owner, repo } = parseRepoFullName(fullName);
        try {
            await this.octokit.activity.unstarRepoForAuthenticatedUser({ owner, repo });
            return true;
        } catch (error: unknown) {
            logger.error(`Failed to unstar repo ${fullName}:`, error);
            throw new Error('Failed to unstar repository on GitHub');
        }
    }

    /**
     * Live check: has the authenticated user starred this repo?
     * GitHub returns 204 when starred and 404 when not.
     */
    async hasStarred(fullName: string): Promise<boolean> {
        this.assertUserToken();
        const { owner, repo } = parseRepoFullName(fullName);
        try {
            await this.octokit.activity.checkRepoIsStarredByAuthenticatedUser({ owner, repo });
            return true;
        } catch (error: unknown) {
            if (isNotFoundError(error)) return false;
            logger.error(`Failed to check star status for ${fullName}:`, error);
            throw new Error('Failed to check star status on GitHub');
        }
    }

    /**
     * Follow a GitHub user on behalf of the authenticated user.
     * Idempotent.
     * @returns true when the user is followed after the call.
     */
    async followUser(username: string): Promise<boolean> {
        this.assertUserToken();
        const normalized = normalizeUsername(username);
        try {
            await this.octokit.users.follow({ username: normalized });
            return true;
        } catch (error: unknown) {
            logger.error(`Failed to follow user ${normalized}:`, error);
            throw new Error('Failed to follow user on GitHub');
        }
    }

    /**
     * Unfollow a GitHub user. Idempotent.
     * @returns true when the user is no longer followed after the call.
     */
    async unfollowUser(username: string): Promise<boolean> {
        this.assertUserToken();
        const normalized = normalizeUsername(username);
        try {
            await this.octokit.users.unfollow({ username: normalized });
            return true;
        } catch (error: unknown) {
            logger.error(`Failed to unfollow user ${normalized}:`, error);
            throw new Error('Failed to unfollow user on GitHub');
        }
    }

    /**
     * Live check: is the authenticated user following this GitHub user?
     * GitHub returns 204 when following and 404 when not.
     */
    async isFollowing(username: string): Promise<boolean> {
        this.assertUserToken();
        const normalized = normalizeUsername(username);
        try {
            await this.octokit.users.checkPersonIsFollowedByAuthenticated({ username: normalized });
            return true;
        } catch (error: unknown) {
            if (isNotFoundError(error)) return false;
            logger.error(`Failed to check follow status for ${normalized}:`, error);
            throw new Error('Failed to check follow status on GitHub');
        }
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
