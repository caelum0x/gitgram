import express from 'express';
import * as moderationController from '../controllers/moderationController';
import { authenticate } from '../middleware/auth';
import { requireModeratorOrAdmin } from '../middleware/authorization';
import { validate } from '../middleware/validation';
import {
  moderationQueueValidator,
  reviewContentValidator,
  checkUserValidator,
} from '../validators/moderationValidator';

const router = express.Router();

// All moderation routes require an authenticated MODERATOR or ADMIN (hierarchy allows ADMIN/SUPER_ADMIN).
// authenticate populates req.userId; requireModeratorOrAdmin then enforces the role.
router.get(
  '/queue',
  authenticate,
  requireModeratorOrAdmin,
  validate(moderationQueueValidator),
  moderationController.getModerationQueue
);
router.post(
  '/review/:id',
  authenticate,
  requireModeratorOrAdmin,
  validate(reviewContentValidator),
  moderationController.reviewContent
);
router.get(
  '/check-user/:userId',
  authenticate,
  requireModeratorOrAdmin,
  validate(checkUserValidator),
  moderationController.checkUser
);
router.get('/stats', authenticate, requireModeratorOrAdmin, moderationController.getModerationStats);

export default router;
