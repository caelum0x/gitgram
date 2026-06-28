import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as socialController from '../controllers/socialController';
import { interactionLimiter } from '../middleware/rateLimiter';
import { userFollowLimit } from '../middleware/tieredRateLimiter';
import { spamCheckFollow } from '../middleware/antiSpamMiddleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/social/suggested-users:
 *   get:
 *     summary: Get suggested users to follow
 *     tags: [Social]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Maximum number of suggestions to return (default 10)
 *     responses:
 *       200:
 *         description: List of suggested users
 *       401:
 *         description: Authentication required
 */
router.get('/suggested-users', socialController.getSuggestedUsers);

/**
 * @swagger
 * /api/v1/social/mutual-followers/{targetUserId}:
 *   get:
 *     summary: Get mutual followers between authenticated user and target user
 *     tags: [Social]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: targetUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to compare followers with
 *     responses:
 *       200:
 *         description: List of mutual followers and count
 *       400:
 *         description: targetUserId is required
 *       401:
 *         description: Authentication required
 */
router.get('/mutual-followers/:targetUserId', socialController.getMutualFollowers);

/**
 * @swagger
 * /api/v1/social/follow-suggestions:
 *   get:
 *     summary: Get follow suggestions based on social graph
 *     tags: [Social]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Maximum number of suggestions to return (default 10)
 *     responses:
 *       200:
 *         description: List of follow suggestions
 *       401:
 *         description: Authentication required
 */
router.get('/follow-suggestions', socialController.getFollowSuggestions);

/**
 * @swagger
 * /api/v1/social/activity-feed:
 *   get:
 *     summary: Get social activity feed for authenticated user
 *     tags: [Social]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Maximum number of activities to return (default 20)
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor from previous response
 *     responses:
 *       200:
 *         description: Activity feed entries
 *       401:
 *         description: Authentication required
 */
router.get('/activity-feed', socialController.getActivityFeed);

/**
 * @swagger
 * /api/v1/social/suggestions:
 *   get:
 *     summary: Get follow suggestions (alias for /follow-suggestions)
 *     tags: [Social]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of suggested users to follow
 *       401:
 *         description: Authentication required
 */
router.get('/suggestions', socialController.getFollowSuggestions);

/**
 * @swagger
 * /api/v1/social/follow/{userId}:
 *   post:
 *     summary: Follow a user
 *     tags: [Social]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to follow
 *     responses:
 *       200:
 *         description: "Follow toggled (returns following: true)"
 *       400:
 *         description: Cannot follow yourself or invalid userId
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User not found
 *   delete:
 *     summary: Unfollow a user
 *     tags: [Social]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to unfollow
 *     responses:
 *       200:
 *         description: "Unfollowed (returns following: false)"
 *       400:
 *         description: Not currently following this user
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User not found
 */
router.post(
  '/follow/:userId',
  interactionLimiter,
  userFollowLimit,
  spamCheckFollow,
  socialController.followUser,
);
router.delete(
  '/follow/:userId',
  interactionLimiter,
  socialController.unfollowUser,
);

/**
 * @swagger
 * /api/v1/social/followers/{userId}:
 *   get:
 *     summary: Get paginated followers of a user (cursor-based)
 *     tags: [Social]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: ISO 8601 date cursor returned by the previous page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of results per page (default 20)
 *     responses:
 *       200:
 *         description: Paginated list of followers
 *       401:
 *         description: Authentication required
 */
router.get('/followers/:userId', socialController.getUserFollowers);

/**
 * @swagger
 * /api/v1/social/following/{userId}:
 *   get:
 *     summary: Get paginated list of users a user is following (cursor-based)
 *     tags: [Social]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: ISO 8601 date cursor returned by the previous page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of results per page (default 20)
 *     responses:
 *       200:
 *         description: Paginated list of following
 *       401:
 *         description: Authentication required
 */
router.get('/following/:userId', socialController.getUserFollowing);

export default router;
