import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { userFollowLimit } from '../middleware/tieredRateLimiter';
import { spamCheckFollow } from '../middleware/antiSpamMiddleware';
import {
  sendFollowRequest,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  cancelFollowRequest,
  getFollowRequestStatus
} from '../controllers/followRequestController';
import { validate } from '../middleware/validation';
import {
  sendFollowRequestValidator,
  followRequestIdValidator,
  targetIdParamValidator,
  followRequestsPaginationValidator,
} from '../validators/followRequestValidator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Send a follow request
router.post('/', userFollowLimit, spamCheckFollow, validate(sendFollowRequestValidator), sendFollowRequest);

// Get pending follow requests
router.get('/', validate(followRequestsPaginationValidator), getFollowRequests);

// Get follow request status for a specific user
router.get('/status/:targetId', validate(targetIdParamValidator), getFollowRequestStatus);

// Accept a follow request
router.post('/:requestId/accept', validate(followRequestIdValidator), acceptFollowRequest);

// Reject a follow request
router.post('/:requestId/reject', validate(followRequestIdValidator), rejectFollowRequest);

// Cancel a sent follow request
router.delete('/:targetId', validate(targetIdParamValidator), cancelFollowRequest);

export default router;
