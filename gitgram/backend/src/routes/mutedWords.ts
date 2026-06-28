import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import { validate } from '../middleware/validation';
import {
  upsertMutedWordValidator,
  removeMutedWordValidator,
} from '../validators/mutedWordValidator';
import {
  getMutedWordsForUser,
  upsertMutedWord,
  removeMutedWord,
  type MutedWordTarget,
  type MutedWordActorTarget,
} from '../services/mutedWordsService';

const router = express.Router();

// All muted-word routes require authentication; they manage the viewer's own list.
router.use(authenticate);

/**
 * @swagger
 * /api/v1/muted-words:
 *   get:
 *     summary: List the current user's muted words and tags
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The user's muted words (expired entries flagged via isExpired)
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const mutedWords = await getMutedWordsForUser(userId);
    res.json({ mutedWords });
  })
);

/**
 * @swagger
 * /api/v1/muted-words:
 *   post:
 *     summary: Add or update a muted word/tag (upsert by normalized value)
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value:
 *                 type: string
 *               targets:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [content, tag]
 *               actorTarget:
 *                 type: string
 *                 enum: [all, exclude-following]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *     responses:
 *       201:
 *         description: The created/updated muted word
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/',
  validate(upsertMutedWordValidator),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const {
      value,
      targets,
      actorTarget,
      expiresAt,
    }: {
      value: string;
      targets?: MutedWordTarget[];
      actorTarget?: MutedWordActorTarget;
      expiresAt?: string | null;
    } = req.body;

    const mutedWord = await upsertMutedWord(userId, {
      value,
      targets: targets ?? ['content'],
      actorTarget: actorTarget ?? 'all',
      expiresAt: expiresAt ?? null,
    });

    res.status(201).json({ mutedWord });
  })
);

/**
 * @swagger
 * /api/v1/muted-words/{id}:
 *   delete:
 *     summary: Remove a muted word/tag
 *     tags: [Moderation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Muted word removed
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Muted word not found
 */
router.delete(
  '/:id',
  validate(removeMutedWordValidator),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const removed = await removeMutedWord(userId, id);
    if (!removed) {
      throw Errors.notFound('Muted word');
    }
    res.status(204).end();
  })
);

export default router;
