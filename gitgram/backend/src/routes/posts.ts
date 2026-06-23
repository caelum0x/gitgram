import { Router } from 'express';
import * as postController from '../controllers/postController';
import * as archiveController from '../controllers/archiveController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { uploadLimiter, interactionLimiter } from '../middleware/rateLimiter';
import { userPostLimit, userCommentLimit, userReactionLimit, userReportLimit } from '../middleware/tieredRateLimiter';
import { spamCheckPost, spamCheckComment, spamCheckReaction, spamCheckReport } from '../middleware/antiSpamMiddleware';
import { moderatePost } from '../middleware/moderationMiddleware';
import { upload } from '../services/storageService';
import { validatePostUpload } from '../middleware/mediaValidation';
import {
  createPostValidator,
  createPostFromCheckpointValidator,
  getPostsValidator,
  postIdValidator,
  createCommentValidator,
  getCommentsValidator,
} from '../validators/postValidator';

const router = Router();

/**
 * @swagger
 * /api/v1/posts/feed:
 *   get:
 *     summary: Get personalized feed
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: List of posts for feed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 posts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Post'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 */
router.get('/feed', authenticate, postController.getFeed);

/**
 * @swagger
 * /api/v1/posts/feed/unified:
 *   get:
 *     summary: Get unified feed with posts from followed users and repos
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unified feed
 */
router.get('/feed/unified', authenticate, postController.getUnifiedFeed);

/**
 * @swagger
 * /api/v1/posts/explore:
 *   get:
 *     summary: Get explore feed with trending and recommended content
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Explore feed
 */
router.get('/explore', authenticate, postController.getExploreFeed);

/**
 * @swagger
 * /api/v1/posts/trending:
 *   get:
 *     summary: Get trending posts
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: week
 *     responses:
 *       200:
 *         description: Trending posts
 */
router.get('/trending', optionalAuth, postController.getTrending);

/**
 * @swagger
 * /api/v1/posts/search:
 *   get:
 *     summary: Search posts
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [all, code, image, video]
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', optionalAuth, postController.searchPosts);
router.get('/tagged/:userId', optionalAuth, postController.getTaggedPosts);

// Optimal posting times - also available under /scheduled-posts/optimal-times
import { getOptimalPostingTimes } from '../controllers/scheduledPostsController';
router.get('/optimal-times', authenticate, getOptimalPostingTimes);

/**
 * @swagger
 * /api/v1/posts/archived:
 *   get:
 *     summary: Get user's archived posts
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: List of archived posts
 */
router.get('/archived', authenticate, archiveController.getArchivedPosts);

/**
 * @swagger
 * /api/v1/posts:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               mediaType:
 *                 type: string
 *                 enum: [image, code, video, text]
 *               media:
 *                 type: string
 *                 format: binary
 *               codeSnippet:
 *                 type: string
 *               language:
 *                 type: string
 *               hashtags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Post created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 post:
 *                   $ref: '#/components/schemas/Post'
 *       400:
 *         description: Validation error
 *   get:
 *     summary: Get posts with filters
 *     tags: [Posts]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of posts
 */
router.post('/', authenticate, uploadLimiter, userPostLimit, spamCheckPost, moderatePost, validate(createPostValidator), upload.single('media'), validatePostUpload, postController.createPost);
router.get('/', optionalAuth, validate(getPostsValidator), postController.getPosts);

/**
 * @swagger
 * /api/v1/posts/from-checkpoint:
 *   post:
 *     summary: Create a post from an AITM checkpoint
 *     tags: [Posts, AITM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - checkpointId
 *               - projectId
 *             properties:
 *               checkpointId:
 *                 type: string
 *                 description: AITM checkpoint ID
 *               projectId:
 *                 type: string
 *                 description: AITM project ID
 *               message:
 *                 type: string
 *                 description: Optional custom message for the post
 *               visibility:
 *                 type: string
 *                 enum: [public, followers, private]
 *                 default: public
 *     responses:
 *       201:
 *         description: Post created from checkpoint
 *       400:
 *         description: Validation error
 *       404:
 *         description: Account not found
 */
router.post('/from-checkpoint', authenticate, uploadLimiter, userPostLimit, validate(createPostFromCheckpointValidator), postController.createPostFromCheckpoint);

/**
 * @swagger
 * /api/v1/posts/{id}:
 *   get:
 *     summary: Get a single post by ID
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 post:
 *                   $ref: '#/components/schemas/Post'
 *       404:
 *         description: Post not found
 */
router.get('/:id', optionalAuth, validate(postIdValidator), postController.getPost);
import { requireOwnershipOrRole } from '../middleware/authorization';

router.delete('/:id', authenticate, validate(postIdValidator), requireOwnershipOrRole('Post'), postController.deletePost);

// Comments
router.get('/:id/comments', optionalAuth, validate(getCommentsValidator), postController.getComments);
router.post('/:id/comments', authenticate, interactionLimiter, userCommentLimit, spamCheckComment, validate(createCommentValidator), postController.addComment);

// Likes
router.post('/:id/like', authenticate, interactionLimiter, userReactionLimit, spamCheckReaction, validate(postIdValidator), postController.likePost);
router.delete('/:id/like', authenticate, interactionLimiter, userReactionLimit, validate(postIdValidator), postController.unlikePost);
router.get('/:id/likes', optionalAuth, validate(postIdValidator), postController.getPostLikes);

// Post Analytics
import { getDetailedPostAnalytics } from '../controllers/analyticsController';

/**
 * @swagger
 * /api/v1/posts/{id}/analytics:
 *   get:
 *     summary: Get detailed analytics for a post (owner only)
 *     tags: [Posts, Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to analyze (default 30)
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [hour, day]
 *           default: day
 *         description: Time granularity for timeline data
 *     responses:
 *       200:
 *         description: Detailed post analytics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 postId:
 *                   type: string
 *                 impressions:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     unique:
 *                       type: integer
 *                     timeline:
 *                       type: array
 *                 engagement:
 *                   type: object
 *                   properties:
 *                     likes:
 *                       type: object
 *                     comments:
 *                       type: object
 *                     shares:
 *                       type: integer
 *                     saves:
 *                       type: integer
 *                     engagementRate:
 *                       type: number
 *                 reach:
 *                   type: object
 *                   properties:
 *                     followers:
 *                       type: integer
 *                     nonFollowers:
 *                       type: integer
 *                 demographics:
 *                   type: object
 *                   properties:
 *                     topLocations:
 *                       type: array
 *                     deviceBreakdown:
 *                       type: array
 *       403:
 *         description: Access denied - not the post owner
 *       404:
 *         description: Post not found
 */
router.get('/:id/analytics', authenticate, validate(postIdValidator), getDetailedPostAnalytics);

// Post actions
import * as postActionsController from '../controllers/postActionsController';

/**
 * @swagger
 * /api/v1/posts/{id}/save:
 *   post:
 *     summary: Save a post (optionally to collections)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               collectionIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional array of collection IDs to add the post to
 *     responses:
 *       200:
 *         description: Post saved
 */
router.post('/:id/save', authenticate, interactionLimiter, validate(postIdValidator), postActionsController.savePost);

/**
 * @swagger
 * /api/v1/posts/{id}/save:
 *   delete:
 *     summary: Unsave a post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post unsaved
 */
router.delete('/:id/save', authenticate, interactionLimiter, validate(postIdValidator), postActionsController.unsavePost);

/**
 * @swagger
 * /api/v1/posts/{id}/saved:
 *   get:
 *     summary: Check if a post is saved
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Saved status and collections
 */
router.get('/:id/saved', authenticate, postActionsController.isPostSaved);

/**
 * @swagger
 * /api/v1/posts/saved:
 *   get:
 *     summary: Get all saved posts
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: collectionId
 *         schema:
 *           type: string
 *         description: Filter by collection ID
 *     responses:
 *       200:
 *         description: List of saved posts
 */
router.get('/saved', authenticate, postActionsController.getSavedPosts);

router.post('/:id/share', authenticate, interactionLimiter, validate(postIdValidator), postActionsController.sharePost);
router.get('/:id/shares', optionalAuth, validate(postIdValidator), postActionsController.getPostShares);
router.post('/:id/report', authenticate, interactionLimiter, userReportLimit, spamCheckReport, validate(postIdValidator), postActionsController.reportPost);
router.post('/:id/retweet', authenticate, interactionLimiter, validate(postIdValidator), postActionsController.retweetPost);

/**
 * @swagger
 * /api/v1/posts/{id}/archive:
 *   post:
 *     summary: Archive a post (hide from feeds without deleting)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post archived successfully
 *       403:
 *         description: Not authorized to archive this post
 *       404:
 *         description: Post not found
 */
router.post('/:id/archive', authenticate, validate(postIdValidator), archiveController.archivePost);

/**
 * @swagger
 * /api/v1/posts/{id}/unarchive:
 *   post:
 *     summary: Unarchive a post (restore to feeds)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Post unarchived successfully
 *       403:
 *         description: Not authorized to unarchive this post
 *       404:
 *         description: Post not found
 */
router.post('/:id/unarchive', authenticate, validate(postIdValidator), archiveController.unarchivePost);

export default router;
