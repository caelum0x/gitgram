import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { userReactionLimit, userCommentLimit } from '../middleware/tieredRateLimiter';
import { spamCheckReaction, spamCheckComment } from '../middleware/antiSpamMiddleware';
import * as interactionController from '../controllers/interactionController';
import { validate } from '../middleware/validation';
import {
  contentParamsValidator,
  addCommentValidator,
  getCommentsValidator,
} from '../validators/interactionsRouteValidator';

const router = Router();

// Like/unlike content
router.post('/:contentType/:contentId/like', authenticate, userReactionLimit, spamCheckReaction, validate(contentParamsValidator), interactionController.toggleLike);

// Save/unsave content
router.post('/:contentType/:contentId/save', authenticate, userReactionLimit, spamCheckReaction, validate(contentParamsValidator), interactionController.toggleSave);

// Comments
router.post('/:contentType/:contentId/comments', authenticate, userCommentLimit, spamCheckComment, validate(addCommentValidator), interactionController.addComment);
router.get('/:contentType/:contentId/comments', authenticate, validate(getCommentsValidator), interactionController.getComments);

// Get interaction status (liked, saved)
router.get('/:contentType/:contentId/status', authenticate, validate(contentParamsValidator), interactionController.getInteractionStatus);

export default router;
