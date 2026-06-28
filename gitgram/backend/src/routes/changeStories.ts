import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import changeStoryService from '../services/changeStoryService';
import logger from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const autoGenerateValidator = [
  body('projectId')
    .isString()
    .isLength({ min: 1, max: 128 })
    .withMessage('projectId is required'),
  body('checkpointId')
    .isString()
    .isLength({ min: 1, max: 128 })
    .withMessage('checkpointId is required'),
  body('previousCheckpointId')
    .optional()
    .isString()
    .isLength({ min: 1, max: 128 }),
  body('label')
    .optional()
    .isString()
    .isLength({ max: 200 }),
  body('message')
    .optional()
    .isString()
    .isLength({ max: 2000 }),
  body('filesChanged')
    .optional()
    .isArray({ max: 500 }),
  body('linesAdded')
    .optional()
    .isInt({ min: 0 }),
  body('linesRemoved')
    .optional()
    .isInt({ min: 0 }),
];

const publishDraftValidator = [
  body('draftId')
    .isString()
    .isLength({ min: 1, max: 128 })
    .withMessage('draftId is required'),
];

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/change-stories/auto-generate
 * Called by AITM webhook when a checkpoint is created.
 * Generates a draft change story and notifies the repo owner.
 */
router.post(
  '/auto-generate',
  validate(autoGenerateValidator),
  async (req: Request, res: Response) => {
    try {
      const result = await changeStoryService.createDraftAndNotify(req.body);
      if (!result) {
        return res.status(200).json({ message: 'No auto-story repository linked to this project' });
      }
      return res.status(201).json({ message: 'Change story draft created', draftId: result.draftId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Auto-generate change story failed:', message);
      return res.status(500).json({ message: 'Failed to auto-generate change story' });
    }
  }
);

/**
 * POST /api/v1/change-stories/publish
 * Publish a draft change story post.
 */
router.post(
  '/publish',
  authenticate,
  validate(publishDraftValidator),
  async (req: AuthRequest, res: Response) => {
    try {
      const { draftId } = req.body;
      const post = await changeStoryService.publishDraft(draftId, req.userId!);
      return res.status(200).json({ message: 'Change story published', post });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Draft not found') {
        return res.status(404).json({ message });
      }
      if (message === 'Not authorized to publish this draft') {
        return res.status(403).json({ message });
      }
      logger.error('Publish change story failed:', message);
      return res.status(500).json({ message: 'Failed to publish change story' });
    }
  }
);

export default router;
