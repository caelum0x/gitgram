import express from 'express';
import * as reportController from '../controllers/reportController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { validate } from '../middleware/validation';
import { interactionLimiter } from '../middleware/rateLimiter';
import { spamCheckAppeal, spamCheckReport } from '../middleware/antiSpamMiddleware';
import { userAppealLimit, userModerationActionLimit, userReportLimit } from '../middleware/tieredRateLimiter';
import {
  createReportValidator,
  getMyReportsValidator,
  reportIdParamValidator,
  submitAppealValidator,
} from '../validators/reportValidator';

const router = express.Router();

// User routes
router.post(
  '/',
  authenticate,
  interactionLimiter,
  userReportLimit,
  spamCheckReport,
  validate(createReportValidator),
  reportController.createReport
);
router.get('/my-reports', authenticate, validate(getMyReportsValidator), reportController.getMyReports);
router.get('/my-reports/:id', authenticate, validate(reportIdParamValidator), reportController.getReport);

// User appeal routes
router.post(
  '/appeals',
  authenticate,
  interactionLimiter,
  userAppealLimit,
  spamCheckAppeal,
  validate(submitAppealValidator),
  reportController.submitAppeal
);
router.get('/moderation-history', authenticate, validate(getMyReportsValidator), reportController.getMyModerationHistory);

// Admin/Moderator routes
router.get(
  '/admin',
  authenticate,
  requireRole('ADMIN', 'MODERATOR', 'SUPER_ADMIN'),
  validate(getMyReportsValidator),
  reportController.getAllReports
);
router.get('/admin/stats', authenticate, requireRole('ADMIN', 'MODERATOR', 'SUPER_ADMIN'), reportController.getReportStats);
router.patch(
  '/admin/:id',
  authenticate,
  requireRole('ADMIN', 'MODERATOR', 'SUPER_ADMIN'),
  userModerationActionLimit,
  validate(reportIdParamValidator),
  reportController.updateReportStatus
);

export default router;
