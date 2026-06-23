import { Router } from 'express';
import * as userController from '../controllers/userController';
import * as profileVisitsController from '../controllers/profileVisitsController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { uploadLimiter, interactionLimiter } from '../middleware/rateLimiter';
import { userFollowLimit } from '../middleware/tieredRateLimiter';
import { spamCheckFollow } from '../middleware/antiSpamMiddleware';
import { upload } from '../services/storageService';
import { cacheMiddleware } from '../middleware/cache';
import {
  updateUserValidator,
  userIdValidator,
  searchUsersValidator,
  getFollowersValidator,
  getFollowingValidator,
} from '../validators/userValidator';
import {
  getProfileVisitorsValidator,
  getProfileVisitStatsValidator,
  updateProfilePrivacySettingsValidator,
} from '../validators/profileVisitsValidator';

const router = Router();

// ===================================
// Static routes (MUST be before /:id routes)
// ===================================

/**
 * @swagger
 * /api/v1/users/mention-search:
 *   get:
 *     summary: Search users for @mention autocomplete
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query for username matching
 *     responses:
 *       200:
 *         description: List of matching users for mention
 */
router.get('/mention-search', optionalAuth, userController.mentionSearch);

/**
 * @swagger
 * /api/v1/users/search:
 *   get:
 *     summary: Search users by username or name
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
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
 *         description: List of matching users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 */
router.get('/search', optionalAuth, validate(searchUsersValidator), cacheMiddleware(60), userController.searchUsers);

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     summary: Get current authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, userController.getUser);

/**
 * @swagger
 * /api/v1/users/me/followers:
 *   get:
 *     summary: Get current user's followers
 *     tags: [Users]
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
 *         description: List of followers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Not authenticated
 */
router.get('/me/followers', authenticate, validate(getFollowersValidator), userController.getFollowers);

/**
 * @swagger
 * /api/v1/users/me/following:
 *   get:
 *     summary: Get users the current user is following
 *     tags: [Users]
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
 *         description: List of followed users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Not authenticated
 */
router.get('/me/following', authenticate, validate(getFollowingValidator), userController.getFollowing);

/**
 * @swagger
 * /api/v1/users:
 *   put:
 *     summary: Update current user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               bio:
 *                 type: string
 *               avatar:
 *                 type: string
 *                 format: binary
 *               displayName:
 *                 type: string
 *               website:
 *                 type: string
 *     responses:
 *       200:
 *         description: User profile updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.put('/', authenticate, uploadLimiter, validate(updateUserValidator), upload.single('avatar'), userController.updateUser);

/**
 * @swagger
 * /api/v1/users/suggested:
 *   get:
 *     summary: Get suggested users to follow
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of suggested users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 */
router.get('/suggested', authenticate, cacheMiddleware(300), userController.getSuggestedUsers);

/**
 * @swagger
 * /api/v1/users/activity:
 *   get:
 *     summary: Get current user's activity feed
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User activity feed
 *       401:
 *         description: Not authenticated
 */
router.get('/activity', authenticate, userController.getActivity);

/**
 * @swagger
 * /api/v1/users/linked-accounts:
 *   get:
 *     summary: Get all linked accounts for current user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of linked accounts
 *       401:
 *         description: Not authenticated
 */
router.get('/linked-accounts', authenticate, userController.getLinkedAccounts);

/**
 * @swagger
 * /api/v1/users/link-account:
 *   post:
 *     summary: Link an external account (e.g., GitHub, Google)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - code
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [github, google]
 *               code:
 *                 type: string
 *                 description: OAuth authorization code
 *     responses:
 *       200:
 *         description: Account linked successfully
 *       400:
 *         description: Account already linked or invalid code
 *       401:
 *         description: Not authenticated
 */
router.post('/link-account', authenticate, userController.linkAccount);

/**
 * @swagger
 * /api/v1/users/switch-account:
 *   post:
 *     summary: Switch to a linked account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountId
 *             properties:
 *               accountId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Switched to linked account
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Linked account not found
 */
router.post('/switch-account', authenticate, userController.switchAccount);

/**
 * @swagger
 * /api/v1/users/linked-accounts/{accountId}:
 *   delete:
 *     summary: Unlink an external account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Account unlinked successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Linked account not found
 */
router.delete('/linked-accounts/:accountId', authenticate, userController.unlinkAccount);

/**
 * @swagger
 * /api/v1/users/interests:
 *   get:
 *     summary: Get current user's interests
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user interests
 *       401:
 *         description: Not authenticated
 *   post:
 *     summary: Update current user's interests
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - interests
 *             properties:
 *               interests:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Interests updated
 *       401:
 *         description: Not authenticated
 */
router.get('/interests', authenticate, userController.getInterests);
router.post('/interests', authenticate, userController.updateInterests);

/**
 * @swagger
 * /api/v1/users/interests/suggestions:
 *   get:
 *     summary: Get suggested interests based on user activity
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of suggested interests
 *       401:
 *         description: Not authenticated
 */
router.get('/interests/suggestions', authenticate, userController.getSuggestedInterests);

/**
 * @swagger
 * /api/v1/users/email:
 *   put:
 *     summary: Update current user's email address
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email updated, verification email sent
 *       400:
 *         description: Invalid email or email already in use
 *       401:
 *         description: Not authenticated
 */
router.put('/email', authenticate, userController.updateEmail);

/**
 * @swagger
 * /api/v1/users/delete:
 *   post:
 *     summary: Schedule account for deletion
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deletion scheduled
 *       401:
 *         description: Not authenticated
 *   delete:
 *     summary: Cancel scheduled account deletion
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deletion cancelled
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: No pending deletion found
 */
router.post('/delete', authenticate, userController.scheduleAccountDeletion);
router.delete('/delete', authenticate, userController.cancelAccountDeletion);

/**
 * @swagger
 * /api/v1/users/deletion-status:
 *   get:
 *     summary: Get account deletion status
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deletion status
 *       401:
 *         description: Not authenticated
 */
router.get('/deletion-status', authenticate, userController.getAccountDeletionStatus);

/**
 * @swagger
 * /api/v1/users/profile-visits:
 *   get:
 *     summary: Get users who visited your profile
 *     tags: [Users]
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
 *         description: List of profile visitors
 *       401:
 *         description: Not authenticated
 */
router.get('/profile-visits', authenticate, validate(getProfileVisitorsValidator), profileVisitsController.getProfileVisitors);

/**
 * @swagger
 * /api/v1/users/profile-visits/stats:
 *   get:
 *     summary: Get profile visit statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to get stats for
 *     responses:
 *       200:
 *         description: Profile visit statistics
 *       401:
 *         description: Not authenticated
 */
router.get('/profile-visits/stats', authenticate, validate(getProfileVisitStatsValidator), profileVisitsController.getProfileVisitStats);

/**
 * @swagger
 * /api/v1/users/profile-visits/settings:
 *   get:
 *     summary: Get profile privacy settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile privacy settings
 *       401:
 *         description: Not authenticated
 *   put:
 *     summary: Update profile privacy settings
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               showProfileVisits:
 *                 type: boolean
 *               allowAnonymousVisits:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Privacy settings updated
 *       401:
 *         description: Not authenticated
 */
router.get('/profile-visits/settings', authenticate, profileVisitsController.getProfilePrivacySettings);
router.put('/profile-visits/settings', authenticate, validate(updateProfilePrivacySettingsValidator), profileVisitsController.updateProfilePrivacySettings);

/**
 * @swagger
 * /api/v1/users/blocked:
 *   get:
 *     summary: Get list of blocked users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of blocked users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 */
import * as userActionsController from '../controllers/userActionsController';
router.get('/blocked', authenticate, userActionsController.getBlockedUsers);

// ===================================
// Presence / online status routes
// ===================================

/**
 * @swagger
 * /api/v1/users/presence:
 *   patch:
 *     summary: Update current user's lastSeen to now (heartbeat)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Presence updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *       401:
 *         description: Not authenticated
 */
router.patch('/presence', authenticate, async (req: any, res: any) => {
  try {
    const db = req.app.locals.db;
    await db.query(
      'UPDATE users SET last_seen = NOW() WHERE id = $1',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update presence' });
  }
});

/**
 * @swagger
 * /api/v1/users/online-count:
 *   get:
 *     summary: Count of users active in the last 5 minutes
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Online user count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 */
router.get('/online-count', async (req: any, res: any) => {
  try {
    const db = req.app.locals.db;
    const result = await db.query(
      "SELECT COUNT(*) AS count FROM users WHERE last_seen > NOW() - INTERVAL '5 minutes'"
    );
    const count = parseInt(result.rows[0]?.count ?? '0', 10);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch online count' });
  }
});

/**
 * @swagger
 * /api/v1/users/online:
 *   get:
 *     summary: List users active in the last 5 minutes (with avatars)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of online users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       avatar:
 *                         type: string
 *                         nullable: true
 */
router.get('/online', async (req: any, res: any) => {
  try {
    const db = req.app.locals.db;
    const result = await db.query(
      `SELECT id, username, avatar
       FROM users
       WHERE last_seen > NOW() - INTERVAL '5 minutes'
       ORDER BY last_seen DESC
       LIMIT 50`
    );
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch online users' });
  }
});

// ===================================
// Dynamic routes with :id parameter
// ===================================

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get user profile by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get('/:id', optionalAuth, validate(userIdValidator), cacheMiddleware(300), userController.getUser);

/**
 * @swagger
 * /api/v1/users/{id}/followers:
 *   get:
 *     summary: Get a user's followers
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: List of followers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   type: object
 *       404:
 *         description: User not found
 */
router.get('/:id/followers', optionalAuth, validate(getFollowersValidator), cacheMiddleware(120), userController.getFollowers);

/**
 * @swagger
 * /api/v1/users/{id}/following:
 *   get:
 *     summary: Get users a user is following
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
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
 *         description: List of followed users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   type: object
 *       404:
 *         description: User not found
 */
router.get('/:id/following', optionalAuth, validate(getFollowingValidator), cacheMiddleware(120), userController.getFollowing);

/**
 * @swagger
 * /api/v1/users/{id}/tagged-posts:
 *   get:
 *     summary: Get posts where a user is tagged
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of posts the user is tagged in
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
 *         description: User not found
 */
router.get('/:id/tagged-posts', optionalAuth, validate(userIdValidator), cacheMiddleware(180), userController.getTaggedPosts);

/**
 * @swagger
 * /api/v1/users/{id}/follow:
 *   post:
 *     summary: Follow or unfollow a user (toggle)
 *     tags: [Users]
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
 *         description: Follow status toggled
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 */
router.post('/:id/follow', authenticate, interactionLimiter, userFollowLimit, spamCheckFollow, validate(userIdValidator), userController.followUser);

/**
 * @swagger
 * /api/v1/users/{id}/block:
 *   post:
 *     summary: Block a user
 *     tags: [Users]
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
 *         description: User blocked
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 *   delete:
 *     summary: Unblock a user
 *     tags: [Users]
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
 *         description: User unblocked
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 */
router.post('/:id/block', authenticate, interactionLimiter, validate(userIdValidator), userActionsController.blockUser);
router.delete('/:id/block', authenticate, interactionLimiter, validate(userIdValidator), userActionsController.unblockUser);

export default router;

