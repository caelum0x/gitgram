import express from 'express';
import * as moderationController from '../controllers/moderationController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  moderationQueueValidator,
  reviewContentValidator,
  checkUserValidator,
} from '../validators/moderationValidator';

const router = express.Router();

router.get('/queue', authenticate, validate(moderationQueueValidator), moderationController.getModerationQueue);
router.post('/review/:id', authenticate, validate(reviewContentValidator), moderationController.reviewContent);
router.get('/check-user/:userId', authenticate, validate(checkUserValidator), moderationController.checkUser);
router.get('/stats', authenticate, moderationController.getModerationStats);

export default router;
