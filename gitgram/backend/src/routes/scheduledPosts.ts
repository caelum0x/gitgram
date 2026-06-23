import express from 'express';
import * as scheduledPostsController from '../controllers/scheduledPostsController';
import { authenticate } from '../middleware/auth';
import { requirePremium } from '../middleware/requirePremium';
import { validate } from '../middleware/validation';
import {
  scheduledPostIdValidator,
  createScheduledPostValidator,
  updateScheduledPostValidator,
  bulkScheduleValidator,
  getScheduledPostsValidator,
  retryScheduledPostValidator,
  optimalTimesValidator,
  deleteScheduledPostValidator,
} from '../validators/scheduledPostValidator';

const router = express.Router();

// Bulk schedule multiple posts
router.post('/bulk', authenticate, requirePremium, validate(bulkScheduleValidator), scheduledPostsController.bulkCreateScheduledPosts);

// Get optimal posting times based on follower activity
router.get('/optimal-times', authenticate, validate(optimalTimesValidator), scheduledPostsController.getOptimalPostingTimes);

// Create a scheduled post
router.post('/', authenticate, requirePremium, validate(createScheduledPostValidator), scheduledPostsController.createScheduledPost);

// Get all scheduled posts for current user
router.get('/', authenticate, requirePremium, validate(getScheduledPostsValidator), scheduledPostsController.getScheduledPosts);

// Get failed scheduled posts
router.get('/failed', authenticate, requirePremium, scheduledPostsController.getFailedScheduledPosts);

// Get a single scheduled post
router.get('/:id', authenticate, requirePremium, validate(scheduledPostIdValidator), scheduledPostsController.getScheduledPost);

// Update a scheduled post
router.put('/:id', authenticate, requirePremium, validate(updateScheduledPostValidator), scheduledPostsController.updateScheduledPost);

// Retry a failed scheduled post
router.post('/:id/retry', authenticate, requirePremium, validate(retryScheduledPostValidator), scheduledPostsController.retryScheduledPost);

// Stop recurring for a scheduled post
router.post('/:id/stop-recurring', authenticate, requirePremium, validate(scheduledPostIdValidator), scheduledPostsController.stopRecurring);

// Delete/cancel a scheduled post
router.delete('/:id', authenticate, requirePremium, validate(deleteScheduledPostValidator), scheduledPostsController.deleteScheduledPost);

export default router;
