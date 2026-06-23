import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as messageController from '../controllers/messageController';
import { interactionLimiter } from '../middleware/rateLimiter';
import { userReportLimit } from '../middleware/tieredRateLimiter';
import { spamCheckReport } from '../middleware/antiSpamMiddleware';
import { validate } from '../middleware/validation';
import { body, param, query } from 'express-validator';

const router = Router();

// Inline validators for messages
const sendMessageValidator = [
  body('receiverId')
    .optional()
    .isString()
    .withMessage('Receiver ID must be a string'),
  body('chatId')
    .optional()
    .isString()
    .withMessage('Chat ID must be a string'),
  body('content')
    .notEmpty()
    .withMessage('Content is required')
    .isString()
    .withMessage('Content must be a string')
    .isLength({ max: 2000 })
    .withMessage('Content must not exceed 2000 characters')
    .trim(),
];

const messageIdParam = [
  param('messageId')
    .notEmpty()
    .withMessage('Message ID is required')
    .isString()
    .withMessage('Message ID must be a string'),
];

const conversationIdParam = [
  param('id')
    .notEmpty()
    .withMessage('Conversation ID is required')
    .isString()
    .withMessage('Conversation ID must be a string'),
];

const otherUserIdParam = [
  param('otherUserId')
    .notEmpty()
    .withMessage('User ID is required')
    .isString()
    .withMessage('User ID must be a string'),
];

const messagePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

const searchQueryValidator = [
  query('q')
    .notEmpty()
    .withMessage('Search query is required')
    .isString()
    .withMessage('Search query must be a string')
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
    .trim(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

const createGroupChatValidator = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isString()
    .withMessage('Name must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
    .trim(),
  body('memberIds')
    .isArray({ min: 1, max: 50 })
    .withMessage('memberIds must be an array with 1-50 members'),
  body('memberIds.*')
    .isString()
    .withMessage('Each member ID must be a string'),
];

const editMessageValidator = [
  param('messageId')
    .notEmpty()
    .withMessage('Message ID is required')
    .isString()
    .withMessage('Message ID must be a string'),
  body('content')
    .notEmpty()
    .withMessage('Content is required')
    .isString()
    .withMessage('Content must be a string')
    .isLength({ max: 2000 })
    .withMessage('Content must not exceed 2000 characters')
    .trim(),
];

const reportMessageValidator = [
  param('messageId')
    .notEmpty()
    .withMessage('Message ID is required')
    .isString()
    .withMessage('Message ID must be a string'),
  body('reason')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters')
    .trim(),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters')
    .trim(),
];

const chatIdParam = [
  param('chatId')
    .notEmpty()
    .withMessage('Chat ID is required')
    .isString()
    .withMessage('Chat ID must be a string'),
];

/**
 * @swagger
 * /api/v1/messages:
 *   post:
 *     summary: Send a new message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               receiverId:
 *                 type: string
 *                 description: Recipient user ID (for DMs)
 *               chatId:
 *                 type: string
 *                 description: Chat ID (for group chats)
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.post('/', authenticate, validate(sendMessageValidator), messageController.sendMessage);

/**
 * @swagger
 * /api/v1/messages/conversations:
 *   get:
 *     summary: Get conversations list with unread count per conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 *       401:
 *         description: Not authenticated
 */
router.get('/conversations', authenticate, messageController.getConversations);

/**
 * @swagger
 * /api/v1/messages/conversations/{id}/read:
 *   post:
 *     summary: Mark all messages in a conversation as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: Conversation marked as read
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found
 */
router.post('/conversations/:id/read', authenticate, validate(conversationIdParam), messageController.markConversationAsRead);

/**
 * @swagger
 * /api/v1/messages/unread/count:
 *   get:
 *     summary: Get total unread message count
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread message count
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
router.get('/unread/count', authenticate, messageController.getUnreadCount);

/**
 * @swagger
 * /api/v1/messages/unread-count:
 *   get:
 *     summary: Get total unread message count (alias)
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread message count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unreadCount:
 *                   type: integer
 *       401:
 *         description: Not authenticated
 */
router.get('/unread-count', authenticate, messageController.getUnreadCount);

/**
 * @swagger
 * /api/v1/messages/search:
 *   get:
 *     summary: Search messages by content
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (case-insensitive ILIKE match)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Matching messages grouped by conversation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *                 conversations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       conversationId:
 *                         type: string
 *                       messages:
 *                         type: array
 *                         items:
 *                           $ref: '#/components/schemas/Message'
 *       400:
 *         description: Validation error - missing or invalid query
 *       401:
 *         description: Not authenticated
 */
router.get('/search', authenticate, validate(searchQueryValidator), messageController.searchMessages);

/**
 * @swagger
 * /api/v1/messages/conversations/{id}/read:
 *   put:
 *     summary: Mark all messages in a conversation as read (PUT alias)
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation partner user ID
 *     responses:
 *       200:
 *         description: Conversation marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 readAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found
 */
router.put('/conversations/:id/read', authenticate, validate(conversationIdParam), messageController.markConversationAsRead);

/**
 * @swagger
 * /api/v1/messages/chats:
 *   get:
 *     summary: Get user's group chats
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of group chats
 *       401:
 *         description: Not authenticated
 *   post:
 *     summary: Create a new group chat
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - memberIds
 *             properties:
 *               name:
 *                 type: string
 *               memberIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Group chat created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.get('/chats', authenticate, messageController.getUserChats);
router.post('/chats', authenticate, validate(createGroupChatValidator), messageController.createGroupChat);

/**
 * @swagger
 * /api/v1/messages/chats/{chatId}:
 *   get:
 *     summary: Get messages in a specific group chat
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
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
 *           default: 50
 *     responses:
 *       200:
 *         description: List of messages in the chat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Chat not found
 */
router.get('/chats/:chatId', authenticate, validate([...chatIdParam, ...messagePagination]), messageController.getChatMessages);

/**
 * @swagger
 * /api/v1/messages/single/{messageId}:
 *   get:
 *     summary: Get a single message by ID
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Message not found
 */
router.get('/single/:messageId', authenticate, validate(messageIdParam), messageController.getMessage);

/**
 * @swagger
 * /api/v1/messages/{id}/read:
 *   post:
 *     summary: Mark a specific message as read
 *     tags: [Messages]
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
 *         description: Message marked as read
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Message not found
 */
router.post('/:id/read', authenticate, validate(conversationIdParam), messageController.markMessageAsRead);

/**
 * @swagger
 * /api/v1/messages/{otherUserId}:
 *   get:
 *     summary: Get direct messages with a specific user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: otherUserId
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
 *           default: 50
 *     responses:
 *       200:
 *         description: List of messages with the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 messages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Message'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 */
router.get('/:otherUserId', authenticate, validate([...otherUserIdParam, ...messagePagination]), messageController.getMessages);

/**
 * @swagger
 * /api/v1/messages/{otherUserId}/read:
 *   put:
 *     summary: Mark messages as read (legacy endpoint)
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: otherUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Messages marked as read
 *       401:
 *         description: Not authenticated
 *     deprecated: true
 */
router.put('/:otherUserId/read', authenticate, validate(otherUserIdParam), messageController.markAsRead);

/**
 * @swagger
 * /api/v1/messages/{messageId}:
 *   put:
 *     summary: Edit a message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
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
 *       200:
 *         description: Message edited
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to edit this message
 *       404:
 *         description: Message not found
 *   delete:
 *     summary: Delete a message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message deleted
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to delete this message
 *       404:
 *         description: Message not found
 */
router.put('/:messageId', authenticate, validate(editMessageValidator), messageController.editMessage);
router.delete('/:messageId', authenticate, validate(messageIdParam), messageController.deleteMessage);

/**
 * @swagger
 * /api/v1/messages/{messageId}/report:
 *   post:
 *     summary: Report a message for abuse or spam
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for reporting the message
 *     responses:
 *       200:
 *         description: Message reported
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Message not found
 */
router.post('/:messageId/report', authenticate, interactionLimiter, userReportLimit, spamCheckReport, validate(reportMessageValidator), messageController.reportMessage);

export default router;
