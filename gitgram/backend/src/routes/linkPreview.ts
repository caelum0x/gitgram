import { Router } from 'express';
import { query, body, param } from 'express-validator';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { apiLimiter } from '../middleware/rateLimiter';
import * as linkPreviewController from '../controllers/linkPreviewController';

const router = Router();

/**
 * @swagger
 * /api/v1/link-preview:
 *   get:
 *     summary: Generate a link preview for a URL
 *     tags: [LinkPreview]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: The URL to generate a preview for
 *     responses:
 *       200:
 *         description: Link preview generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 preview:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     image:
 *                       type: string
 *                     siteName:
 *                       type: string
 *                     favicon:
 *                       type: string
 *                     domain:
 *                       type: string
 *       400:
 *         description: Invalid URL
 *       404:
 *         description: Could not generate preview
 */
router.get(
  '/',
  optionalAuth,
  apiLimiter,
  validate([
    query('url')
      .isString()
      .isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Valid HTTP/HTTPS URL is required')
      .isLength({ max: 2048 })
      .withMessage('URL must be less than 2048 characters'),
  ]),
  linkPreviewController.generateLinkPreview
);

/**
 * @swagger
 * /api/v1/link-preview/post/{postId}:
 *   get:
 *     summary: Get link previews for a post
 *     tags: [LinkPreview]
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: string
 *         description: The post ID
 *     responses:
 *       200:
 *         description: Link previews retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 postId:
 *                   type: string
 *                 previews:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid post ID
 */
router.get(
  '/post/:postId',
  optionalAuth,
  validate([
    param('postId')
      .isString()
      .isLength({ min: 1, max: 50 })
      .withMessage('Valid post ID is required'),
  ]),
  linkPreviewController.getPostLinkPreviews
);

/**
 * @swagger
 * /api/v1/link-preview/bulk:
 *   post:
 *     summary: Generate link previews for multiple URLs
 *     tags: [LinkPreview]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 10
 *     responses:
 *       200:
 *         description: Link previews generated successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/bulk',
  authenticate,
  apiLimiter,
  validate([
    body('urls')
      .isArray({ min: 1, max: 10 })
      .withMessage('URLs must be an array with 1-10 items'),
    body('urls.*')
      .isString()
      .isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Each URL must be a valid HTTP/HTTPS URL'),
  ]),
  linkPreviewController.generateBulkLinkPreviews
);

export default router;
