import { Router } from 'express';
import * as privacyController from '../controllers/privacyController';
import { authenticate } from '../middleware/auth';
import { interactionLimiter } from '../middleware/rateLimiter';
import { userReportLimit } from '../middleware/tieredRateLimiter';
import { spamCheck } from '../middleware/antiSpamMiddleware';
import { validate } from '../middleware/validation';
import { userIdParamValidator, reportContentValidator } from '../validators/privacyValidator';

const router = Router();

router.post('/block/:userId', authenticate, validate(userIdParamValidator), privacyController.blockUser);
router.delete('/block/:userId', authenticate, validate(userIdParamValidator), privacyController.unblockUser);
router.get('/blocked', authenticate, privacyController.getBlockedUsers);
router.post(
  '/report',
  authenticate,
  interactionLimiter,
  userReportLimit,
  spamCheck('report', { contentField: 'reason', targetIdParam: 'postId', hasContent: true }),
  validate(reportContentValidator),
  privacyController.reportContent
);

export default router;
