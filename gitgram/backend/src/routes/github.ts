import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { githubController } from '../controllers/githubController';
import { validate } from '../middleware/validation';
import { body } from 'express-validator';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import type { AuthRequest } from '../middleware/auth';
import type { Response } from 'express';
import { syncAndAutoFollow, syncStarredAsFollows } from '../services/githubSyncService';

const router = Router();

/**
 * @swagger
 * /api/v1/github/sync:
 *   post:
 *     summary: Sync GitHub projects to Gitgram
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Projects synced successfully
 */
router.post('/sync', authenticate, githubController.syncProjects);

/**
 * @swagger
 * /api/v1/github/projects:
 *   get:
 *     summary: Get user's GitHub projects
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's projects
 */
router.get('/projects', authenticate, githubController.getProjects);

/**
 * @swagger
 * /api/v1/github/projects/{owner}/{repo}:
 *   get:
 *     summary: Get a specific project
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project details
 *       404:
 *         description: Project not found
 */
router.get('/projects/:owner/:repo', githubController.getProject);

/**
 * @swagger
 * /api/v1/github/projects/{owner}/{repo}/posts:
 *   get:
 *     summary: Get posts for a project
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of project posts
 *   post:
 *     summary: Create a post for a project
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Post created
 */
router.get('/projects/:owner/:repo/posts', githubController.getProjectPosts);
router.post('/projects/:owner/:repo/posts', authenticate, validate([body('content').notEmpty()]), githubController.createProjectPost);

/**
 * @swagger
 * /api/v1/github/claim:
 *   post:
 *     summary: Claim ownership of a GitHub account
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - githubUsername
 *             properties:
 *               githubUsername:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account claimed successfully
 */
router.post('/claim', authenticate, validate([body('githubUsername').notEmpty()]), githubController.claimAccount);

/**
 * @swagger
 * /api/v1/github/popular:
 *   get:
 *     summary: Get popular GitHub projects
 *     tags: [GitHub]
 *     responses:
 *       200:
 *         description: List of popular projects
 */
router.get('/popular', githubController.getPopularProjects);

/**
 * @swagger
 * /api/v1/github/trending/{period}:
 *   get:
 *     summary: Get trending repositories
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of trending repositories
 */
router.get('/trending', githubController.getTrendingRepositories);
router.get('/trending/:period', githubController.getTrendingRepositories);

/**
 * @swagger
 * /api/v1/github/recommended:
 *   get:
 *     summary: Get recommended repositories based on user interests
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of recommended repositories
 */
router.get('/recommended', authenticate, githubController.getRecommendedRepositories);
router.get('/recommendations', authenticate, githubController.getRecommendedRepositories);

/**
 * @swagger
 * /api/v1/github/similar/{owner}/{repo}:
 *   get:
 *     summary: Get repositories similar to a given repo
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of similar repositories
 */
router.get('/similar/:owner/:repo', githubController.getSimilarRepositories);

/**
 * @swagger
 * /api/v1/github/search:
 *   get:
 *     summary: Search GitHub repositories
 *     tags: [GitHub]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [stars, forks, updated]
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', githubController.searchRepositories);

/**
 * @swagger
 * /api/v1/github/language/{language}:
 *   get:
 *     summary: Get repositories by programming language
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: language
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of repositories
 */
router.get('/language/:language', githubController.getRepositoryByLanguage);

/**
 * @swagger
 * /api/v1/github/topic/{topic}:
 *   get:
 *     summary: Get repositories by topic
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: topic
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of repositories
 */
router.get('/topic/:topic', githubController.getRepositoryByTopic);

/**
 * @swagger
 * /api/v1/github/follow/{owner}/{repo}:
 *   post:
 *     summary: Follow a repository
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository followed
 *   delete:
 *     summary: Unfollow a repository
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository unfollowed
 */
router.post('/follow/:owner/:repo', authenticate, githubController.followRepository);
router.delete('/follow/:owner/:repo', authenticate, githubController.unfollowRepository);

/**
 * @swagger
 * /api/v1/github/bookmark/{owner}/{repo}:
 *   post:
 *     summary: Bookmark a repository
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository bookmarked
 *   delete:
 *     summary: Remove bookmark from repository
 *     tags: [GitHub]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bookmark removed
 */
router.post('/bookmark/:owner/:repo', authenticate, githubController.bookmarkRepository);
router.delete('/bookmark/:owner/:repo', authenticate, githubController.unbookmarkRepository);

/**
 * @swagger
 * /api/v1/github/stats/{owner}/{repo}:
 *   get:
 *     summary: Get repository statistics
 *     tags: [GitHub]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stars:
 *                   type: integer
 *                 forks:
 *                   type: integer
 *                 watchers:
 *                   type: integer
 *                 issues:
 *                   type: integer
 */
router.get('/stats/:owner/:repo', githubController.getRepositoryStats);

// ============================================
// GITHUB ACTIVITY FEED ENDPOINTS
// ============================================

/**
 * @swagger
 * /api/v1/github/activity:
 *   get:
 *     summary: Get current user's GitHub activity feed
 *     tags: [GitHub Activity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 30
 *           maximum: 100
 *     responses:
 *       200:
 *         description: User's GitHub activity feed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activity:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ActivityItem'
 *                 pagination:
 *                   type: object
 *                 rateLimit:
 *                   type: object
 */
router.get('/activity', authenticate, githubController.getCurrentUserActivity);

/**
 * @swagger
 * /api/v1/github/activity/feed:
 *   get:
 *     summary: Get combined activity feed (own + followed repos + received)
 *     tags: [GitHub Activity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: include_own
 *         schema:
 *           type: boolean
 *           default: true
 *       - in: query
 *         name: include_followed
 *         schema:
 *           type: boolean
 *           default: true
 *       - in: query
 *         name: include_received
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: Combined activity feed
 */
router.get('/activity/feed', authenticate, githubController.getCombinedActivityFeed);

/**
 * @swagger
 * /api/v1/github/activity/followed:
 *   get:
 *     summary: Get activity from followed repositories
 *     tags: [GitHub Activity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Activity from followed repositories
 */
router.get('/activity/followed', authenticate, githubController.getFollowedReposActivity);

/**
 * @swagger
 * /api/v1/github/activity/received:
 *   get:
 *     summary: Get received activity (from users you follow on GitHub)
 *     tags: [GitHub Activity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Received activity feed
 */
router.get('/activity/received', authenticate, githubController.getReceivedActivity);

/**
 * @swagger
 * /api/v1/github/activity/refresh:
 *   post:
 *     summary: Clear and refresh activity cache
 *     tags: [GitHub Activity]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared successfully
 */
router.post('/activity/refresh', authenticate, githubController.refreshActivityCache);

/**
 * @swagger
 * /api/v1/github/activity/{username}:
 *   get:
 *     summary: Get a specific user's public GitHub activity
 *     tags: [GitHub Activity]
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: GitHub username
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: User's public GitHub activity
 *       404:
 *         description: User not found
 */
router.get('/activity/:username', githubController.getUserActivity);

/**
 * @swagger
 * /api/v1/github/repos/{owner}/{repo}/activity:
 *   get:
 *     summary: Get repository activity feed
 *     tags: [GitHub Activity]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: repo
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: per_page
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: detailed
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include detailed commits, PRs, issues, and releases
 *     responses:
 *       200:
 *         description: Repository activity feed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activity:
 *                   type: array
 *                 repository:
 *                   type: object
 *                 pagination:
 *                   type: object
 *       404:
 *         description: Repository not found
 */
router.get('/repos/:owner/:repo/activity', githubController.getRepoActivity);

/**
 * @swagger
 * /api/v1/github/rate-limit:
 *   get:
 *     summary: Get GitHub API rate limit status
 *     tags: [GitHub Activity]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rate limit information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rateLimit:
 *                   type: object
 *                   properties:
 *                     remaining:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     reset:
 *                       type: string
 *                       format: date-time
 *                 resetIn:
 *                   type: integer
 *                   description: Seconds until reset
 */
router.get('/rate-limit', authenticate, githubController.getRateLimitStatus);

// ── GitHub Social Graph Sync ─────────────────────────────────────────────────
// Ports the follow/star sync concept from gh-social (MIT).
// Requires the user's GitHub access token in Authorization: Bearer <token>
// OR stored in their linked OAuth account.

router.post(
  '/social/sync-follows',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { prisma } = await import('../utils/prisma');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      throw Errors.badRequest('GitHub account not linked. Connect GitHub in settings first.');
    }

    const result = await syncAndAutoFollow(userId, user.githubAccessToken);
    res.json(result);
  })
);

router.post(
  '/social/sync-stars',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { prisma } = await import('../utils/prisma');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      throw Errors.badRequest('GitHub account not linked. Connect GitHub in settings first.');
    }

    const result = await syncStarredAsFollows(userId, user.githubAccessToken);
    res.json(result);
  })
);

export default router;
