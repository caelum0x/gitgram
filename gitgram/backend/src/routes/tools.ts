import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import * as toolsController from '../controllers/toolsController';

const router = Router();

/**
 * @swagger
 * /api/v1/tools/repo-to-text:
 *   post:
 *     summary: Convert a GitHub repository to a single XML text blob
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - repoUrl
 *             properties:
 *               repoUrl:
 *                 type: string
 *                 description: GitHub repository URL (e.g. https://github.com/owner/repo)
 *     responses:
 *       200:
 *         description: Repository converted to XML successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 xml:
 *                   type: string
 *                 fileCount:
 *                   type: integer
 *                 estimatedTokens:
 *                   type: integer
 *       400:
 *         description: Invalid or non-GitHub URL
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Repository not found
 */
router.post(
  '/repo-to-text',
  authenticate,
  validate([
    body('repoUrl')
      .isString()
      .isURL({ protocols: ['https'], require_protocol: true })
      .withMessage('repoUrl must be a valid HTTPS URL')
      .isLength({ max: 512 })
      .withMessage('repoUrl must be less than 512 characters'),
  ]),
  toolsController.repoToTextHandler
);

export default router;
