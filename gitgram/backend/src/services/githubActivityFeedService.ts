import { Octokit } from '@octokit/rest';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { cache } from './redisService';

// Cache TTL in seconds
const CACHE_TTL = {
  USER_ACTIVITY: 5 * 60, // 5 minutes
  REPO_ACTIVITY: 5 * 60, // 5 minutes
  FEED_ACTIVITY: 5 * 60, // 5 minutes
};

// Rate limit tracking
interface RateLimitInfo {
  remaining: number;
  reset: Date;
  limit: number;
}

// Activity item types
export type ActivityType =
  | 'push'
  | 'pull_request'
  | 'issue'
  | 'issue_comment'
  | 'pr_review_comment'
  | 'star'
  | 'fork'
  | 'release'
  | 'create'
  | 'delete'
  | 'watch';

// Formatted activity item for feed display
export interface FeedActivityItem {
  id: string;
  type: ActivityType;
  actor: {
    login: string;
    avatarUrl: string;
    url: string;
  };
  repository: {
    id: number;
    name: string;
    fullName: string;
    url: string;
  };
  payload: {
    action?: string;
    ref?: string;
    refType?: string;
    title?: string;
    body?: string;
    number?: number;
    url?: string;
    commits?: Array<{
      sha: string;
      message: string;
      author: string;
      url: string;
    }>;
    size?: number;
    merged?: boolean;
    state?: string;
    tagName?: string;
    prerelease?: boolean;
  };
  createdAt: string;
  isPublic: boolean;
}

interface CommitInfo {
  sha: string;
  message: string;
  author: { name: string | undefined; login: string | undefined; avatarUrl: string | undefined };
  date: string | undefined;
  url: string;
}

interface PullRequestInfo {
  number: number;
  title: string;
  state: string;
  merged: boolean;
  user: { login: string | undefined; avatarUrl: string | undefined };
  createdAt: string;
  updatedAt: string;
  url: string;
  additions: number | undefined;
  deletions: number | undefined;
}

interface IssueInfo {
  number: number;
  title: string;
  state: string;
  user: { login: string | undefined; avatarUrl: string | undefined };
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: (string | undefined)[];
}

interface ReleaseInfo {
  id: number;
  tagName: string;
  name: string | null;
  body: string | undefined;
  prerelease: boolean;
  createdAt: string;
  publishedAt: string | null;
  url: string;
  author: { login: string | undefined; avatarUrl: string | undefined };
}

interface DetailedRepoActivity {
  events: FeedActivityItem[];
  commits: CommitInfo[];
  pullRequests: PullRequestInfo[];
  issues: IssueInfo[];
  releases: ReleaseInfo[];
}

// GitHub API event data is dynamic/untyped - using a permissive record
// to avoid full `any` while acknowledging external data shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GitHubEventPayload = Record<string, any>;

export class GitHubActivityFeedService {
  private octokit: Octokit;
  private rateLimitInfo: RateLimitInfo | null = null;

  constructor(accessToken?: string) {
    this.octokit = new Octokit({
      auth: accessToken || process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN,
    });
  }

  /**
   * Create a service instance for a specific user
   */
  static async forUser(userId: string): Promise<GitHubActivityFeedService> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true },
    });

    return new GitHubActivityFeedService(user?.githubAccessToken || undefined);
  }

  /**
   * Get current user's GitHub activity feed
   */
  async getCurrentUserActivity(options: {
    page?: number;
    perPage?: number;
  } = {}): Promise<FeedActivityItem[]> {
    const { page = 1, perPage = 30 } = options;
    const cacheKey = `github:activity:current:${page}:${perPage}`;

    try {
      // Try cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from GitHub
      const { data, headers } = await this.octokit.activity.listEventsForAuthenticatedUser({
        username: await this.getAuthenticatedUsername(),
        per_page: perPage,
        page,
      });

      this.updateRateLimitInfo(headers);

      const formattedActivity = this.formatEvents(data);

      // Cache results
      await cache.set(cacheKey, formattedActivity, CACHE_TTL.USER_ACTIVITY);

      return formattedActivity;
    } catch (error: unknown) {
      logger.error('Failed to get current user activity:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get a specific user's public GitHub activity
   */
  async getUserActivity(
    username: string,
    options: {
      page?: number;
      perPage?: number;
    } = {}
  ): Promise<FeedActivityItem[]> {
    const { page = 1, perPage = 30 } = options;
    const cacheKey = `github:activity:user:${username}:${page}:${perPage}`;

    try {
      // Try cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from GitHub
      const { data, headers } = await this.octokit.activity.listPublicEventsForUser({
        username,
        per_page: perPage,
        page,
      });

      this.updateRateLimitInfo(headers);

      const formattedActivity = this.formatEvents(data);

      // Cache results
      await cache.set(cacheKey, formattedActivity, CACHE_TTL.USER_ACTIVITY);

      return formattedActivity;
    } catch (error: unknown) {
      logger.error(`Failed to get activity for user ${username}:`, error);
      throw this.handleError(error);
    }
  }

  /**
   * Get repository activity feed
   */
  async getRepositoryActivity(
    owner: string,
    repo: string,
    options: {
      page?: number;
      perPage?: number;
    } = {}
  ): Promise<FeedActivityItem[]> {
    const { page = 1, perPage = 30 } = options;
    const cacheKey = `github:activity:repo:${owner}/${repo}:${page}:${perPage}`;

    try {
      // Try cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from GitHub
      const { data, headers } = await this.octokit.activity.listRepoEvents({
        owner,
        repo,
        per_page: perPage,
        page,
      });

      this.updateRateLimitInfo(headers);

      const formattedActivity = this.formatEvents(data);

      // Cache results
      await cache.set(cacheKey, formattedActivity, CACHE_TTL.REPO_ACTIVITY);

      return formattedActivity;
    } catch (error: unknown) {
      logger.error(`Failed to get activity for repo ${owner}/${repo}:`, error);
      throw this.handleError(error);
    }
  }

  /**
   * Get activity feed from followed repositories
   */
  async getFollowedRepositoriesActivity(
    userId: string,
    options: {
      page?: number;
      perPage?: number;
    } = {}
  ): Promise<FeedActivityItem[]> {
    const { page = 1, perPage = 30 } = options;
    const cacheKey = `github:activity:followed:${userId}:${page}:${perPage}`;

    try {
      // Try cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Get user's followed repositories from database
      const follows = await prisma.repositoryFollow.findMany({
        where: { userId },
        include: {
          repository: {
            select: { owner: true, name: true },
          },
        },
        take: 10, // Limit to avoid too many API calls
      });

      if (follows.length === 0) {
        return [];
      }

      // Fetch activity for each followed repository (in parallel, limited)
      const activityPromises = follows.map(async (follow) => {
        try {
          const { data, headers } = await this.octokit.activity.listRepoEvents({
            owner: follow.repository.owner,
            repo: follow.repository.name,
            per_page: Math.ceil(perPage / follows.length),
            page: 1,
          });
          this.updateRateLimitInfo(headers);
          return this.formatEvents(data);
        } catch (error) {
          logger.warn(`Failed to get activity for ${follow.repository.owner}/${follow.repository.name}`);
          return [];
        }
      });

      const allActivity = await Promise.all(activityPromises);

      // Merge and sort by date
      const mergedActivity = allActivity
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, perPage);

      // Cache results
      await cache.set(cacheKey, mergedActivity, CACHE_TTL.FEED_ACTIVITY);

      return mergedActivity;
    } catch (error: unknown) {
      logger.error('Failed to get followed repositories activity:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get received events (activity from users you follow)
   */
  async getReceivedActivity(options: {
    page?: number;
    perPage?: number;
  } = {}): Promise<FeedActivityItem[]> {
    const { page = 1, perPage = 30 } = options;
    const username = await this.getAuthenticatedUsername();
    const cacheKey = `github:activity:received:${username}:${page}:${perPage}`;

    try {
      // Try cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from GitHub
      const { data, headers } = await this.octokit.activity.listReceivedEventsForUser({
        username,
        per_page: perPage,
        page,
      });

      this.updateRateLimitInfo(headers);

      const formattedActivity = this.formatEvents(data);

      // Cache results
      await cache.set(cacheKey, formattedActivity, CACHE_TTL.FEED_ACTIVITY);

      return formattedActivity;
    } catch (error: unknown) {
      logger.error('Failed to get received activity:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get combined activity feed (own activity + followed repos + received)
   */
  async getCombinedActivityFeed(
    userId: string,
    options: {
      page?: number;
      perPage?: number;
      includeOwn?: boolean;
      includeFollowed?: boolean;
      includeReceived?: boolean;
    } = {}
  ): Promise<FeedActivityItem[]> {
    const {
      page = 1,
      perPage = 30,
      includeOwn = true,
      includeFollowed = true,
      includeReceived = true
    } = options;
    const cacheKey = `github:activity:combined:${userId}:${page}:${perPage}:${includeOwn}:${includeFollowed}:${includeReceived}`;

    try {
      // Try cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const activityPromises: Promise<FeedActivityItem[]>[] = [];

      if (includeOwn) {
        activityPromises.push(
          this.getCurrentUserActivity({ page: 1, perPage: 15 }).catch(() => [])
        );
      }

      if (includeFollowed) {
        activityPromises.push(
          this.getFollowedRepositoriesActivity(userId, { page: 1, perPage: 15 }).catch(() => [])
        );
      }

      if (includeReceived) {
        activityPromises.push(
          this.getReceivedActivity({ page: 1, perPage: 15 }).catch(() => [])
        );
      }

      const allActivity = await Promise.all(activityPromises);

      // Merge, deduplicate, and sort
      const seenIds = new Set<string>();
      const mergedActivity = allActivity
        .flat()
        .filter(item => {
          if (seenIds.has(item.id)) return false;
          seenIds.add(item.id);
          return true;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice((page - 1) * perPage, page * perPage);

      // Cache results
      await cache.set(cacheKey, mergedActivity, CACHE_TTL.FEED_ACTIVITY);

      return mergedActivity;
    } catch (error: unknown) {
      logger.error('Failed to get combined activity feed:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get repository-specific activity with more details
   */
  async getDetailedRepoActivity(
    owner: string,
    repo: string,
    options: {
      page?: number;
      perPage?: number;
      includeCommits?: boolean;
      includePRs?: boolean;
      includeIssues?: boolean;
      includeReleases?: boolean;
    } = {}
  ): Promise<DetailedRepoActivity> {
    const {
      page = 1,
      perPage = 30,
      includeCommits = true,
      includePRs = true,
      includeIssues = true,
      includeReleases = true,
    } = options;
    const cacheKey = `github:activity:detailed:${owner}/${repo}:${page}:${perPage}`;

    try {
      // Try cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const [events, commits, prs, issues, releases] = await Promise.all([
        // Repository events
        this.octokit.activity.listRepoEvents({ owner, repo, per_page: perPage, page })
          .then(({ data }) => this.formatEvents(data))
          .catch(() => []),

        // Recent commits
        includeCommits
          ? this.octokit.repos.listCommits({ owner, repo, per_page: 10, page: 1 })
              .then(({ data }) => data.map(commit => ({
                sha: commit.sha,
                message: commit.commit.message.split('\n')[0],
                author: {
                  name: commit.commit.author?.name,
                  login: commit.author?.login,
                  avatarUrl: commit.author?.avatar_url,
                },
                date: commit.commit.author?.date,
                url: commit.html_url,
              })))
              .catch(() => [])
          : Promise.resolve([]),

        // Recent pull requests
        includePRs
          ? this.octokit.pulls.list({ owner, repo, state: 'all', per_page: 10, page: 1 })
              .then(({ data }) => data.map(pr => ({
                number: pr.number,
                title: pr.title,
                state: pr.state,
                merged: pr.merged_at !== null,
                user: {
                  login: pr.user?.login,
                  avatarUrl: pr.user?.avatar_url,
                },
                createdAt: pr.created_at,
                updatedAt: pr.updated_at,
                url: pr.html_url,
                additions: (pr as Record<string, unknown>).additions as number | undefined,
                deletions: (pr as Record<string, unknown>).deletions as number | undefined,
              })))
              .catch(() => [])
          : Promise.resolve([]),

        // Recent issues
        includeIssues
          ? this.octokit.issues.listForRepo({ owner, repo, state: 'all', per_page: 10, page: 1 })
              .then(({ data }) => data.filter(issue => !issue.pull_request).map(issue => ({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                user: {
                  login: issue.user?.login,
                  avatarUrl: issue.user?.avatar_url,
                },
                createdAt: issue.created_at,
                updatedAt: issue.updated_at,
                url: issue.html_url,
                labels: issue.labels.map((label) => typeof label === 'string' ? label : label.name),
              })))
              .catch(() => [])
          : Promise.resolve([]),

        // Recent releases
        includeReleases
          ? this.octokit.repos.listReleases({ owner, repo, per_page: 5, page: 1 })
              .then(({ data }) => data.map(release => ({
                id: release.id,
                tagName: release.tag_name,
                name: release.name,
                body: release.body?.slice(0, 500),
                prerelease: release.prerelease,
                createdAt: release.created_at,
                publishedAt: release.published_at,
                url: release.html_url,
                author: {
                  login: release.author?.login,
                  avatarUrl: release.author?.avatar_url,
                },
              })))
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      const result = {
        events,
        commits,
        pullRequests: prs,
        issues,
        releases,
      };

      // Cache results
      await cache.set(cacheKey, result, CACHE_TTL.REPO_ACTIVITY);

      return result;
    } catch (error: unknown) {
      logger.error(`Failed to get detailed activity for ${owner}/${repo}:`, error);
      throw this.handleError(error);
    }
  }

  /**
   * Get rate limit status
   */
  async getRateLimitStatus(): Promise<RateLimitInfo> {
    try {
      const { data } = await this.octokit.rateLimit.get();
      return {
        remaining: data.rate.remaining,
        reset: new Date(data.rate.reset * 1000),
        limit: data.rate.limit,
      };
    } catch (error: unknown) {
      logger.error('Failed to get rate limit:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get cached rate limit info (from last request)
   */
  getCachedRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Clear activity cache for a user
   */
  async clearUserCache(userId: string): Promise<void> {
    try {
      await cache.clear(`github:activity:*:${userId}:*`);
      logger.info(`Cleared activity cache for user ${userId}`);
    } catch (error) {
      logger.error('Failed to clear user cache:', error);
    }
  }

  /**
   * Clear activity cache for a repository
   */
  async clearRepoCache(owner: string, repo: string): Promise<void> {
    try {
      await cache.clear(`github:activity:*:${owner}/${repo}:*`);
      logger.info(`Cleared activity cache for repo ${owner}/${repo}`);
    } catch (error) {
      logger.error('Failed to clear repo cache:', error);
    }
  }

  // Private helper methods

  private async getAuthenticatedUsername(): Promise<string> {
    const { data } = await this.octokit.users.getAuthenticated();
    return data.login;
  }

  private updateRateLimitInfo(headers: Record<string, string | number | undefined>): void {
    this.rateLimitInfo = {
      remaining: parseInt(String(headers['x-ratelimit-remaining'] ?? '0'), 10),
      reset: new Date(parseInt(String(headers['x-ratelimit-reset'] ?? '0'), 10) * 1000),
      limit: parseInt(String(headers['x-ratelimit-limit'] ?? '0'), 10),
    };

    // Log warning if rate limit is low
    if (this.rateLimitInfo.remaining < 100) {
      logger.warn(`GitHub API rate limit low: ${this.rateLimitInfo.remaining} remaining`);
    }
  }

  private formatEvents(events: GitHubEventPayload[]): FeedActivityItem[] {
    return events.map(event => this.formatEvent(event)).filter(Boolean) as FeedActivityItem[];
  }

  private formatEvent(event: GitHubEventPayload): FeedActivityItem | null {
    const baseItem = {
      id: event.id,
      actor: {
        login: event.actor?.login || 'unknown',
        avatarUrl: event.actor?.avatar_url || '',
        url: event.actor?.url || '',
      },
      repository: {
        id: event.repo?.id || 0,
        name: event.repo?.name?.split('/')[1] || '',
        fullName: event.repo?.name || '',
        url: `https://github.com/${event.repo?.name}`,
      },
      createdAt: event.created_at,
      isPublic: event.public !== false,
    };

    const payload = event.payload || {};

    switch (event.type) {
      case 'PushEvent':
        return {
          ...baseItem,
          type: 'push',
          payload: {
            ref: payload.ref?.replace('refs/heads/', ''),
            size: payload.size || 0,
            commits: (payload.commits || []).slice(0, 5).map((commit: GitHubEventPayload) => ({
              sha: commit.sha?.slice(0, 7),
              message: commit.message?.split('\n')[0] || '',
              author: commit.author?.name || commit.author?.email || 'unknown',
              url: `https://github.com/${event.repo?.name}/commit/${commit.sha}`,
            })),
          },
        };

      case 'PullRequestEvent':
        return {
          ...baseItem,
          type: 'pull_request',
          payload: {
            action: payload.action,
            number: payload.number || payload.pull_request?.number,
            title: payload.pull_request?.title,
            body: payload.pull_request?.body?.slice(0, 200),
            url: payload.pull_request?.html_url,
            merged: payload.pull_request?.merged,
            state: payload.pull_request?.state,
          },
        };

      case 'IssuesEvent':
        return {
          ...baseItem,
          type: 'issue',
          payload: {
            action: payload.action,
            number: payload.issue?.number,
            title: payload.issue?.title,
            body: payload.issue?.body?.slice(0, 200),
            url: payload.issue?.html_url,
            state: payload.issue?.state,
          },
        };

      case 'IssueCommentEvent':
        return {
          ...baseItem,
          type: 'issue_comment',
          payload: {
            action: payload.action,
            number: payload.issue?.number,
            title: payload.issue?.title,
            body: payload.comment?.body?.slice(0, 200),
            url: payload.comment?.html_url,
          },
        };

      case 'PullRequestReviewCommentEvent':
        return {
          ...baseItem,
          type: 'pr_review_comment',
          payload: {
            action: payload.action,
            number: payload.pull_request?.number,
            title: payload.pull_request?.title,
            body: payload.comment?.body?.slice(0, 200),
            url: payload.comment?.html_url,
          },
        };

      case 'WatchEvent':
        return {
          ...baseItem,
          type: 'star',
          payload: {
            action: payload.action,
          },
        };

      case 'ForkEvent':
        return {
          ...baseItem,
          type: 'fork',
          payload: {
            url: payload.forkee?.html_url,
          },
        };

      case 'ReleaseEvent':
        return {
          ...baseItem,
          type: 'release',
          payload: {
            action: payload.action,
            tagName: payload.release?.tag_name,
            title: payload.release?.name,
            body: payload.release?.body?.slice(0, 300),
            url: payload.release?.html_url,
            prerelease: payload.release?.prerelease,
          },
        };

      case 'CreateEvent':
        return {
          ...baseItem,
          type: 'create',
          payload: {
            refType: payload.ref_type,
            ref: payload.ref,
          },
        };

      case 'DeleteEvent':
        return {
          ...baseItem,
          type: 'delete',
          payload: {
            refType: payload.ref_type,
            ref: payload.ref,
          },
        };

      default:
        // Skip unsupported event types
        return null;
    }
  }

  private handleError(error: unknown): Error {
    const statusError = error as { status?: number; message?: string };
    if (statusError.status === 401) {
      return new Error('GitHub authentication failed. Please reconnect your GitHub account.');
    }
    if (statusError.status === 403) {
      if (this.rateLimitInfo && this.rateLimitInfo.remaining === 0) {
        const resetTime = this.rateLimitInfo.reset.toISOString();
        return new Error(`GitHub API rate limit exceeded. Resets at ${resetTime}`);
      }
      return new Error('GitHub API access forbidden. Check your permissions.');
    }
    if (statusError.status === 404) {
      return new Error('GitHub resource not found.');
    }
    return new Error(statusError.message || 'Failed to fetch GitHub activity');
  }
}

// Export factory function for easy use
export async function createActivityFeedService(userId?: string): Promise<GitHubActivityFeedService> {
  if (userId) {
    return GitHubActivityFeedService.forUser(userId);
  }
  return new GitHubActivityFeedService();
}

// Export singleton for public endpoints
export const publicActivityFeedService = new GitHubActivityFeedService();
