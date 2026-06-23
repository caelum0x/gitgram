import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import {
  toggleCommentLike,
  updateComment,
  deleteComment,
  getCommentLikes,
  replyToComment,
  getCommentReplies,
  togglePinComment,
  getPinnedComment
} from '../controllers/commentActionsController';
import { validate } from '../middleware/validation';
import {
  commentParamsValidator,
  postIdOnlyValidator,
  updateCommentValidator,
  replyToCommentValidator,
  commentRepliesPaginationValidator,
} from '../validators/commentActionValidator';

const router = Router();

// Get pinned comment (public)
router.get('/:postId/comments/pinned', optionalAuth, validate(postIdOnlyValidator), getPinnedComment);

// Get comment replies (public)
router.get('/:postId/comments/:commentId/replies', optionalAuth, validate(commentRepliesPaginationValidator), getCommentReplies);

// Get comment likes (public)
router.get('/:postId/comments/:commentId/likes', optionalAuth, validate(commentParamsValidator), getCommentLikes);

// Routes requiring authentication
router.use(authenticate);

// Like/unlike a comment
router.post('/:postId/comments/:commentId/like', validate(commentParamsValidator), toggleCommentLike);

// Reply to a comment
router.post('/:postId/comments/:commentId/reply', validate(replyToCommentValidator), replyToComment);

// Pin/unpin a comment (post owner only)
router.post('/:postId/comments/:commentId/pin', validate(commentParamsValidator), togglePinComment);

// Update a comment
router.put('/:postId/comments/:commentId', validate(updateCommentValidator), updateComment);

// Delete a comment
router.delete('/:postId/comments/:commentId', validate(commentParamsValidator), deleteComment);

export default router;
