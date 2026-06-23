import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getNotifications,
  getNotification,
  getGroupedNotifications,
  markAsRead,
  getUnreadNotificationCount,
  deleteNotification,
} from '../controllers/notificationController';
import { validate } from '../middleware/validation';
import { body, query } from 'express-validator';

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/notifications:
 *   get:
 *     summary: Get notifications for the current user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, return only unread notifications
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notification'
 *                 pagination:
 *                   type: object
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/',
  validate([
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('unreadOnly').optional().isBoolean(),
  ]),
  getNotifications
);

/**
 * @swagger
 * /api/v1/notifications/unread/count:
 *   get:
 *     summary: Get total unread notification count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notification count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *       401:
 *         description: Not authenticated
 */
router.get('/unread/count', getUnreadNotificationCount);

router.get(
  '/grouped',
  validate([query('limit').optional().isInt({ min: 1, max: 100 })]),
  getGroupedNotifications
);

/**
 * @swagger
 * /api/v1/notifications/{id}:
 *   get:
 *     summary: Get one notification
 *     tags: [Notifications]
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
 *         description: Notification details
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Notification not found
 */
router.get('/:id', getNotification);

/**
 * @swagger
 * /api/v1/notifications/read:
 *   put:
 *     summary: Mark notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notificationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of notification IDs to mark as read. If omitted, all notifications are marked as read.
 *     responses:
 *       200:
 *         description: Notifications marked as read
 *       401:
 *         description: Not authenticated
 */
router.put(
  '/read',
  validate([
    body('notificationIds').optional().isArray(),
    body('notificationIds.*').optional().isString(),
  ]),
  markAsRead
);

/**
 * @swagger
 * /api/v1/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
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
 *         description: Notification deleted
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Notification not found
 */
router.delete('/:id', deleteNotification);

export default router;
