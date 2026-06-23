import { Router } from 'express';
import { repositoryController } from '../controllers/repositoryController';
import { claimController } from '../controllers/claimController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { getActivityTimeline } from '../controllers/githubWebhookController';
import { validate } from '../middleware/validation';
import { createChangeStoryValidator } from '../validators/repositoryValidator';
import { body } from 'express-validator';

const router = Router();

/**
 * @swagger
 * /api/v1/repositories/search:
 *   get:
 *     summary: Search repositories
 *     tags: [Repositories]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by programming language
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 repositories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Repository'
 */
router.get('/search', repositoryController.search);

/**
 * @swagger
 * /api/v1/repositories/trending:
 *   get:
 *     summary: Get trending repositories
 *     tags: [Repositories]
 *     parameters:
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *         description: Filter by programming language
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: weekly
 *     responses:
 *       200:
 *         description: List of trending repositories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 repositories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Repository'
 */
router.get('/trending', repositoryController.trending);

/**
 * @swagger
 * /api/v1/repositories/following:
 *   get:
 *     summary: Get repositories the current user is following
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of followed repositories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 repositories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Repository'
 *       401:
 *         description: Not authenticated
 */
router.get('/following', authenticate, repositoryController.getFollowing);

/**
 * @swagger
 * /api/v1/repositories/bookmarks:
 *   get:
 *     summary: Get bookmarked repositories
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bookmarked repositories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 repositories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Repository'
 *       401:
 *         description: Not authenticated
 */
router.get('/bookmarks', authenticate, repositoryController.getBookmarks);

/**
 * @swagger
 * /api/v1/repositories/claim:
 *   post:
 *     summary: Claim ownership of a repository on Gitgram
 *     description: >
 *       Validates that the authenticated user owns the repository on GitHub
 *       (requires write/admin permission), then creates or updates the
 *       ClaimedRepository record in the database.
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repoFullName
 *             properties:
 *               repoFullName:
 *                 type: string
 *                 description: Repository full name in "owner/name" format
 *                 example: "octocat/hello-world"
 *     responses:
 *       200:
 *         description: Repository claimed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 repository:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     claimedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid repoFullName format, GitHub not connected, or repository already claimed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Authenticated user does not have write access to the repository
 */
router.post(
  '/claim',
  authenticate,
  validate([
    body('repoFullName')
      .isString()
      .trim()
      .notEmpty()
      .matches(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
      .withMessage('repoFullName must be in "owner/name" format (e.g. "octocat/hello-world")'),
  ]),
  claimController.claimByFullName,
);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/export/text:
 *   get:
 *     summary: Export a repository as repo-to-text
 *     tags: [Repositories]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: maxFiles
 *         schema:
 *           type: integer
 *           default: 60
 *       - in: query
 *         name: maxFileBytes
 *         schema:
 *           type: integer
 *           default: 20000
 *     responses:
 *       200:
 *         description: Plain-text repository export
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/:owner/:name/export/text', optionalAuth, repositoryController.exportText);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}:
 *   get:
 *     summary: Get a repository by owner and name
 *     tags: [Repositories]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Repository'
 *       404:
 *         description: Repository not found
 *   put:
 *     summary: Update a repository's settings
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Repository updated
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Repository not found
 *   delete:
 *     summary: Remove a repository from Gitgram
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository removed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Repository not found
 */
router.get('/:owner/:name/posts', optionalAuth, repositoryController.getPosts);
router.get('/:owner/:name/snippets', optionalAuth, repositoryController.getSnippets);
router.get('/:owner/:name/media', optionalAuth, repositoryController.getMedia);
router.get('/:owner/:name/activity', optionalAuth, getActivityTimeline);
router.get('/:owner/:name/followers', optionalAuth, repositoryController.getFollowers);
router.get('/:owner/:name', optionalAuth, repositoryController.get);
router.put('/:owner/:name', authenticate, repositoryController.update);
router.delete('/:owner/:name', authenticate, repositoryController.remove);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/posts:
 *   get:
 *     summary: Get posts related to a repository
 *     tags: [Repositories]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of repository posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 posts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Post'
 *       404:
 *         description: Repository not found
 */
router.get('/:owner/:name/posts', optionalAuth, repositoryController.getPosts);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/snippets:
 *   get:
 *     summary: Get code snippets from a repository
 *     tags: [Repositories]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of code snippets
 *       404:
 *         description: Repository not found
 */
router.get('/:owner/:name/snippets', optionalAuth, repositoryController.getSnippets);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/media:
 *   get:
 *     summary: Get media content from a repository
 *     tags: [Repositories]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of media items
 *       404:
 *         description: Repository not found
 */
router.get('/:owner/:name/media', optionalAuth, repositoryController.getMedia);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/activity:
 *   get:
 *     summary: Get activity timeline for a repository
 *     tags: [Repositories]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository activity timeline
 *       404:
 *         description: Repository not found
 */
router.get('/:owner/:name/activity', optionalAuth, getActivityTimeline);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/followers:
 *   get:
 *     summary: Get users following a repository
 *     tags: [Repositories]
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of repository followers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       404:
 *         description: Repository not found
 */
router.get('/:owner/:name/followers', optionalAuth, repositoryController.getFollowers);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/change-story:
 *   post:
 *     summary: Create a change story for the repository
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
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
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               mediaUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Change story created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Story'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Repository not found
 */
router.post('/:owner/:name/change-story', authenticate, validate(createChangeStoryValidator), repositoryController.createChangeStory);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/aitm-settings:
 *   get:
 *     summary: Get AITM (Gitgram TimeMachine) settings for a repository
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: AITM settings
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Repository not found
 *   put:
 *     summary: Update AITM settings for a repository
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               autoGenerateStories:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: AITM settings updated
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Repository not found
 *   delete:
 *     summary: Remove AITM settings for a repository
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: AITM settings removed
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Repository not found
 */
router.get('/:owner/:name/aitm-settings', authenticate, repositoryController.getAitmSettings);
router.put('/:owner/:name/aitm-settings', authenticate, repositoryController.updateAitmSettings);
router.delete('/:owner/:name/aitm-settings', authenticate, repositoryController.removeAitmSettings);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/follow:
 *   post:
 *     summary: Follow a repository
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository followed
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Repository not found
 *   delete:
 *     summary: Unfollow a repository
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository unfollowed
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Repository not found
 */
router.post('/:owner/:name/follow', authenticate, repositoryController.follow);
router.delete('/:owner/:name/follow', authenticate, repositoryController.unfollow);

/**
 * @swagger
 * /api/v1/repositories/{owner}/{name}/bookmark:
 *   post:
 *     summary: Bookmark a repository
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Repository bookmarked
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Repository not found
 *   delete:
 *     summary: Remove bookmark from a repository
 *     tags: [Repositories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: owner
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bookmark removed
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Repository not found
 */
router.post('/:owner/:name/bookmark', authenticate, repositoryController.bookmark);
router.delete('/:owner/:name/bookmark', authenticate, repositoryController.removeBookmark);

export default router;
