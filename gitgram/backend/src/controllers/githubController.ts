import { Request, Response } from 'express'
import { Octokit } from '@octokit/rest'
import prisma from '../utils/prisma'
import { AuthRequest } from '../middleware/auth'
import { githubService } from '../services/githubService'
import { githubRecommendationService } from '../services/githubRecommendationService'
import { createActivityFeedService, publicActivityFeedService } from '../services/githubActivityFeedService'
import logger from '../utils/logger'
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler'
import { getCachedProfile, setCachedProfile, setCachedRepo } from '../utils/githubProfileCache'
import { fetchGitHubTrending } from '../services/ghSocialBridge'
import { GitHubService } from '../services/githubService'
import { createNotification } from '../services/notificationService'

/**
 * Resolve the authenticated user's stored GitHub OAuth token, or throw a
 * 400 telling them to connect GitHub. Shared by all two-way GitHub actions.
 */
async function requireUserGitHubToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubAccessToken: true },
  })
  if (!user?.githubAccessToken) {
    throw Errors.badRequest('GitHub account not linked. Connect GitHub in settings first.')
  }
  return user.githubAccessToken
}

export const githubController = {
  // Existing endpoints
  syncProjects: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user?.githubAccessToken) {
      throw Errors.badRequest('GitHub not connected')
    }

    const account = await prisma.account.findFirst({ where: { userId } });
    if (!account) throw Errors.notFound('Account');

    const octokit = new Octokit({ auth: user.githubAccessToken })
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({ per_page: 100 })

    for (const repo of repos) {
      // Trim + cache the repo payload so subsequent reads skip the GitHub API
      const trimmed = await setCachedRepo({
        id: repo.id,
        node_id: repo.node_id,
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description ?? null,
        fork: repo.fork,
        forks_count: repo.forks_count,
        stargazers_count: repo.stargazers_count,
        watchers_count: repo.watchers_count,
        topics: repo.topics ?? [],
        owner: {
          id: repo.owner.id,
          node_id: repo.owner.node_id,
          login: repo.owner.login,
          name: null,
          avatar_url: repo.owner.avatar_url,
          bio: null,
          blog: null,
          followers: 0,
          following: 0,
          html_url: repo.owner.html_url,
          type: repo.owner.type,
          company: null,
        },
      })

      await prisma.project.upsert({
        where: { githubId: repo.id.toString() },
        create: {
          githubId: repo.id.toString(),
          accountId: account.id,
          name: trimmed.name,
          owner: trimmed.owner.login,
          description: trimmed.description,
          url: trimmed.html_url,
          stars: trimmed.stargazers_count,
          forks: trimmed.forks_count,
          language: repo.language || null,
          userId,
        },
        update: {
          stars: trimmed.stargazers_count,
          forks: trimmed.forks_count,
          description: trimmed.description,
        },
      })
    }

    res.json({ message: 'Projects synced', count: repos.length })
  }),

  getProjects: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { stars: 'desc' },
    })
    res.json({ projects })
  }),

  getProject: asyncHandler(async (req: Request, res: Response) => {
    const { owner, repo } = req.params
    const project = await prisma.project.findFirst({
      where: { owner, name: repo },
    })

    if (!project) {
      throw Errors.notFound('Project')
    }

    res.json(project)
  }),

  getProjectPosts: asyncHandler(async (req: Request, res: Response) => {
    const { owner, repo } = req.params
    const project = await prisma.project.findFirst({ where: { owner, name: repo } })

    if (!project) {
      throw Errors.notFound('Project')
    }

    const posts = await prisma.post.findMany({
      where: { projectId: project.id },
      include: { user: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ posts })
  }),

  createProjectPost: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, repo } = req.params
    const { content } = req.body
    const userId = req.userId!

    const account = await prisma.account.findFirst({ where: { userId } });
    if (!account) throw Errors.notFound('Account');

    const project = await prisma.project.findFirst({ where: { owner, name: repo } })

    if (!project) {
      throw Errors.notFound('Project')
    }

    const post = await prisma.post.create({
      data: {
        content,
        accountId: account.id,
        userId,
        projectId: project.id,
      },
      include: { user: { select: { id: true, username: true, avatar: true } } },
    })

    res.json(post)
  }),

  claimAccount: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { githubUsername } = req.body
    const userId = req.userId!

    // Try cache first — avoids GitHub API call for repeated/concurrent claims
    let profileId: string
    const cached = await getCachedProfile(githubUsername)
    if (cached) {
      profileId = cached.id.toString()
    } else {
      const octokit = new Octokit()
      const { data: githubUser } = await octokit.users.getByUsername({ username: githubUsername })
      await setCachedProfile({
        id: githubUser.id,
        node_id: githubUser.node_id,
        login: githubUser.login,
        name: githubUser.name ?? null,
        avatar_url: githubUser.avatar_url,
        bio: githubUser.bio ?? null,
        blog: githubUser.blog ?? null,
        followers: githubUser.followers,
        following: githubUser.following,
        html_url: githubUser.html_url,
        type: githubUser.type,
        company: githubUser.company ?? null,
      })
      profileId = githubUser.id.toString()
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        githubUsername,
        githubId: profileId,
      },
    })

    res.json({ message: 'Account claimed. Verification email sent.' })
  }),

  getPopularProjects: asyncHandler(async (req: Request, res: Response) => {
    const projects = await prisma.project.findMany({
      orderBy: { stars: 'desc' },
      take: 20,
    })
    res.json({ projects })
  }),

  // NEW ENDPOINTS

  /**
   * Get trending repositories
   */
  getTrendingRepositories: asyncHandler(async (req: Request, res: Response) => {
    const requestedPeriod = String(req.params.period || req.query.timeframe || 'daily')
    const period = ({ day: 'daily', week: 'weekly', month: 'monthly' } as Record<string, 'daily' | 'weekly' | 'monthly'>)[requestedPeriod] || requestedPeriod as 'daily' | 'weekly' | 'monthly'
    const { language, limit = 25, page = 1 } = req.query

    // Check local DB first; fall back to ghSocialBridge when fewer than 5 repos are indexed
    const localRepos = await prisma.repository.findMany({ take: 20, orderBy: { stars: 'desc' } })

    if (localRepos.length < 5) {
      // Supplement with GitHub trending via ghSocialBridge
      try {
        const bridgeRepos = await fetchGitHubTrending(
          language as string | undefined,
          period as 'daily' | 'weekly' | 'monthly'
        )
        const combined = [...localRepos, ...bridgeRepos].slice(0, 20)
        return res.json({
          repositories: combined,
          period,
          source: localRepos.length === 0 ? 'github' : 'mixed',
          pagination: {
            page: Number(page),
            limit: Number(limit),
            hasMore: combined.length === Number(limit),
          },
        })
      } catch (bridgeError: unknown) {
        logger.warn('[githubController] ghSocialBridge fallback failed, using githubService', bridgeError)
      }
    }

    const repos = await githubService.fetchTrendingRepos(
      period,
      language as string,
      Number(limit)
    )

    res.json({
      repositories: repos,
      period,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        hasMore: repos.length === Number(limit),
      },
    })
  }),

  /**
   * Get personalized repository recommendations
   */
  getRecommendedRepositories: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const { limit = 20 } = req.query

    const recommendations = await githubRecommendationService.getPersonalizedRecommendations(
      userId,
      Number(limit)
    )

    res.json({ repositories: recommendations })
  }),

  /**
   * Search repositories
   */
  searchRepositories: asyncHandler(async (req: Request, res: Response) => {
    const { q, language, topics, minStars, sort, limit = 30 } = req.query

    if (!q || typeof q !== 'string') {
      throw Errors.badRequest('Query required')
    }

    const results = await githubService.searchRepositories(q as string, {
      language: language as string,
      topics: topics ? (topics as string).split(',') : undefined,
      minStars: minStars ? Number(minStars) : undefined,
      sort: sort as 'stars' | 'forks' | 'updated',
      limit: Number(limit),
    })

    res.json({ repositories: results })
  }),

  /**
   * Get repositories by language
   */
  getRepositoryByLanguage: asyncHandler(async (req: Request, res: Response) => {
    const { language } = req.params
    const { limit = 30 } = req.query

    const repos = await githubService.getRepositoriesByLanguage(language, Number(limit))

    res.json({ repositories: repos, language })
  }),

  /**
   * Get repositories by topic
   */
  getRepositoryByTopic: asyncHandler(async (req: Request, res: Response) => {
    const { topic } = req.params
    const { limit = 30 } = req.query

    const repos = await githubService.getRepositoriesByTopic(topic, Number(limit))

    res.json({ repositories: repos, topic })
  }),

  /**
   * Follow a repository
   */
  followRepository: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, repo } = req.params
    const userId = req.userId!

    // Sync repository to database if not exists
    const repository = await githubService.syncRepositoryToDb(owner, repo)

    // Create follow
    await prisma.repositoryFollow.create({
      data: {
        userId,
        repositoryId: repository.id,
      },
    })

    // Update user preferences
    await githubRecommendationService.updateUserPreferences(userId, repository.id)

    res.json({ message: 'Repository followed', repository })
  }),

  /**
   * Unfollow a repository
   */
  unfollowRepository: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, repo } = req.params
    const userId = req.userId!

    const repository = await prisma.repository.findUnique({
      where: { owner_name: { owner, name: repo } },
    })

    if (!repository) {
      throw Errors.notFound('Repository')
    }

    await prisma.repositoryFollow.delete({
      where: {
        userId_repositoryId: {
          userId,
          repositoryId: repository.id,
        },
      },
    })

    res.json({ message: 'Repository unfollowed' })
  }),

  /**
   * Bookmark a repository
   */
  bookmarkRepository: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, repo } = req.params
    const userId = req.userId!

    const repository = await githubService.syncRepositoryToDb(owner, repo)

    await prisma.repositoryBookmark.create({
      data: {
        userId,
        repositoryId: repository.id,
      },
    })

    res.json({ message: 'Repository bookmarked', repository })
  }),

  /**
   * Remove bookmark
   */
  unbookmarkRepository: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, repo } = req.params
    const userId = req.userId!

    const repository = await prisma.repository.findUnique({
      where: { owner_name: { owner, name: repo } },
    })

    if (!repository) {
      throw Errors.notFound('Repository')
    }

    await prisma.repositoryBookmark.delete({
      where: {
        userId_repositoryId: {
          userId,
          repositoryId: repository.id,
        },
      },
    })

    res.json({ message: 'Bookmark removed' })
  }),

  /**
   * Get similar repositories
   */
  getSimilarRepositories: asyncHandler(async (req: Request, res: Response) => {
    const { owner, repo } = req.params
    const { limit = 10 } = req.query

    const repository = await prisma.repository.findUnique({
      where: { owner_name: { owner, name: repo } },
    })

    if (!repository) {
      throw Errors.notFound('Repository')
    }

    const similar = await githubRecommendationService.getSimilarRepositories(
      repository.id,
      Number(limit)
    )

    res.json({ repositories: similar })
  }),

  /**
   * Get repository statistics
   */
  getRepositoryStats: asyncHandler(async (req: Request, res: Response) => {
    const { owner, repo } = req.params

    const repository = await prisma.repository.findUnique({
      where: { owner_name: { owner, name: repo } },
      include: {
        _count: {
          select: { posts: true, followers: true },
        },
      },
    })

    if (!repository) {
      throw Errors.notFound('Repository')
    }

    res.json({
      repository: {
        owner: repository.owner,
        name: repository.name,
        stars: repository.stars,
        forks: repository.forks,
        watchers: repository.watchers,
        openIssues: repository.openIssues,
      },
      gitgramStats: {
        posts: repository._count?.posts || 0,
        followers: repository._count?.followers || 0,
      },
    })
  }),

  // ============================================
  // GITHUB ACTIVITY FEED ENDPOINTS
  // ============================================

  /**
   * Get current user's GitHub activity feed
   * GET /api/v1/github/activity
   */
  getCurrentUserActivity: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const { page = 1, per_page = 30 } = req.query

    const activityService = await createActivityFeedService(userId)
    const activity = await activityService.getCurrentUserActivity({
      page: Number(page),
      perPage: Math.min(Number(per_page), 100),
    })

    // Get rate limit info
    const rateLimitInfo = activityService.getCachedRateLimitInfo()

    res.json({
      activity,
      pagination: {
        page: Number(page),
        perPage: Math.min(Number(per_page), 100),
        hasMore: activity.length === Number(per_page),
      },
      rateLimit: rateLimitInfo,
    })
  }),

  /**
   * Get a specific user's public GitHub activity
   * GET /api/v1/github/activity/:username
   */
  getUserActivity: asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params
    const { page = 1, per_page = 30 } = req.query

    const activity = await publicActivityFeedService.getUserActivity(username, {
      page: Number(page),
      perPage: Math.min(Number(per_page), 100),
    })

    res.json({
      activity,
      user: username,
      pagination: {
        page: Number(page),
        perPage: Math.min(Number(per_page), 100),
        hasMore: activity.length === Number(per_page),
      },
    })
  }),

  /**
   * Get repository activity feed
   * GET /api/v1/github/repos/:owner/:repo/activity
   */
  getRepoActivity: asyncHandler(async (req: Request, res: Response) => {
    const { owner, repo } = req.params
    const { page = 1, per_page = 30, detailed = 'false' } = req.query

    if (detailed === 'true') {
      // Return detailed activity with commits, PRs, issues, releases
      const detailedActivity = await publicActivityFeedService.getDetailedRepoActivity(
        owner,
        repo,
        {
          page: Number(page),
          perPage: Math.min(Number(per_page), 100),
        }
      )

      return res.json({
        ...detailedActivity,
        repository: { owner, repo, fullName: `${owner}/${repo}` },
      })
    }

    // Return standard event-based activity
    const activity = await publicActivityFeedService.getRepositoryActivity(owner, repo, {
      page: Number(page),
      perPage: Math.min(Number(per_page), 100),
    })

    res.json({
      activity,
      repository: { owner, repo, fullName: `${owner}/${repo}` },
      pagination: {
        page: Number(page),
        perPage: Math.min(Number(per_page), 100),
        hasMore: activity.length === Number(per_page),
      },
    })
  }),

  /**
   * Get combined activity feed (own + followed repos + received)
   * GET /api/v1/github/activity/feed
   */
  getCombinedActivityFeed: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const {
      page = 1,
      per_page = 30,
      include_own = 'true',
      include_followed = 'true',
      include_received = 'true',
    } = req.query

    const activityService = await createActivityFeedService(userId)
    const activity = await activityService.getCombinedActivityFeed(userId, {
      page: Number(page),
      perPage: Math.min(Number(per_page), 100),
      includeOwn: include_own === 'true',
      includeFollowed: include_followed === 'true',
      includeReceived: include_received === 'true',
    })

    const rateLimitInfo = activityService.getCachedRateLimitInfo()

    res.json({
      activity,
      pagination: {
        page: Number(page),
        perPage: Math.min(Number(per_page), 100),
        hasMore: activity.length === Number(per_page),
      },
      rateLimit: rateLimitInfo,
    })
  }),

  /**
   * Get activity from followed repositories only
   * GET /api/v1/github/activity/followed
   */
  getFollowedReposActivity: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const { page = 1, per_page = 30 } = req.query

    const activityService = await createActivityFeedService(userId)
    const activity = await activityService.getFollowedRepositoriesActivity(userId, {
      page: Number(page),
      perPage: Math.min(Number(per_page), 100),
    })

    const rateLimitInfo = activityService.getCachedRateLimitInfo()

    res.json({
      activity,
      pagination: {
        page: Number(page),
        perPage: Math.min(Number(per_page), 100),
        hasMore: activity.length === Number(per_page),
      },
      rateLimit: rateLimitInfo,
    })
  }),

  /**
   * Get received activity (from users you follow on GitHub)
   * GET /api/v1/github/activity/received
   */
  getReceivedActivity: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const { page = 1, per_page = 30 } = req.query

    const activityService = await createActivityFeedService(userId)
    const activity = await activityService.getReceivedActivity({
      page: Number(page),
      perPage: Math.min(Number(per_page), 100),
    })

    const rateLimitInfo = activityService.getCachedRateLimitInfo()

    res.json({
      activity,
      pagination: {
        page: Number(page),
        perPage: Math.min(Number(per_page), 100),
        hasMore: activity.length === Number(per_page),
      },
      rateLimit: rateLimitInfo,
    })
  }),

  /**
   * Get GitHub API rate limit status
   * GET /api/v1/github/rate-limit
   */
  getRateLimitStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const activityService = await createActivityFeedService(userId)
    const rateLimit = await activityService.getRateLimitStatus()

    res.json({
      rateLimit,
      resetIn: Math.max(0, Math.floor((rateLimit.reset.getTime() - Date.now()) / 1000)),
    })
  }),

  /**
   * Clear activity cache for current user
   * POST /api/v1/github/activity/refresh
   */
  refreshActivityCache: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const activityService = await createActivityFeedService(userId)
    await activityService.clearUserCache(userId)

    res.json({ message: 'Activity cache cleared successfully' })
  }),

  // ============================================
  // TWO-WAY GITHUB ACTIONS (write-back via user OAuth token)
  // Ported from gh-social: star/unstar a repo and follow/unfollow a user on
  // GitHub.com, plus live "have I starred / am I following" status checks.
  // ============================================

  /**
   * Star a repository on GitHub.com using the user's OAuth token.
   * PUT /api/v1/github/star/:owner/:repo
   */
  starRepo: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, repo } = req.params
    const userId = req.userId!
    const token = await requireUserGitHubToken(userId)

    const github = new GitHubService(token)
    const fullName = `${owner}/${repo}`
    const starred = await github.starRepo(fullName)

    res.json({ message: 'Repository starred on GitHub', repository: fullName, starred })
  }),

  /**
   * Remove a star from a repository on GitHub.com.
   * DELETE /api/v1/github/star/:owner/:repo
   */
  unstarRepo: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, repo } = req.params
    const userId = req.userId!
    const token = await requireUserGitHubToken(userId)

    const github = new GitHubService(token)
    const fullName = `${owner}/${repo}`
    const starred = await github.unstarRepo(fullName)

    res.json({ message: 'Repository unstarred on GitHub', repository: fullName, starred })
  }),

  /**
   * Live check: has the user starred this repo on GitHub.com?
   * GET /api/v1/github/star/:owner/:repo
   */
  getStarStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, repo } = req.params
    const userId = req.userId!
    const token = await requireUserGitHubToken(userId)

    const github = new GitHubService(token)
    const fullName = `${owner}/${repo}`
    const starred = await github.hasStarred(fullName)

    res.json({ repository: fullName, starred })
  }),

  /**
   * Follow a GitHub user on GitHub.com using the user's OAuth token.
   * When the followed GitHub user maps to a Gitgram account, send them an
   * in-app notification (mirrors gh-social's follow notification).
   * PUT /api/v1/github/follow-user/:username
   */
  followGitHubUser: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { username } = req.params
    const userId = req.userId!
    const token = await requireUserGitHubToken(userId)

    const github = new GitHubService(token)
    const following = await github.followUser(username)

    // Notify the target if they have a Gitgram account linked to this GitHub login.
    const actor = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    })
    const target = await prisma.user.findFirst({
      where: { githubUsername: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    })
    if (target && target.id !== userId && actor?.username) {
      try {
        await createNotification(
          target.id,
          'FOLLOW',
          `${actor.username} followed you on GitHub`,
          userId
        )
      } catch (notifyError: unknown) {
        logger.error('Failed to send GitHub follow notification:', notifyError)
      }
    }

    res.json({ message: 'User followed on GitHub', username, following })
  }),

  /**
   * Unfollow a GitHub user on GitHub.com.
   * DELETE /api/v1/github/follow-user/:username
   */
  unfollowGitHubUser: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { username } = req.params
    const userId = req.userId!
    const token = await requireUserGitHubToken(userId)

    const github = new GitHubService(token)
    const following = await github.unfollowUser(username)

    res.json({ message: 'User unfollowed on GitHub', username, following })
  }),

  /**
   * Live check: is the user following this GitHub user?
   * GET /api/v1/github/follow-user/:username
   */
  getFollowUserStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { username } = req.params
    const userId = req.userId!
    const token = await requireUserGitHubToken(userId)

    const github = new GitHubService(token)
    const following = await github.isFollowing(username)

    res.json({ username, following })
  }),
}
