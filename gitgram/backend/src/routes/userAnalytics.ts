import express from 'express';
import * as userAnalyticsController from '../controllers/userAnalyticsController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  userAnalyticsContentValidator,
  userAnalyticsDaysValidator,
  userAnalyticsPathValidator,
} from '../validators/userAnalyticsValidator';

const router = express.Router();

// GET /api/v1/analytics/engagement/:userId - User engagement metrics
// Query params: ?days=30 (default: 30)
router.get(
  '/engagement/:userId',
  authenticate,
  validate([...userAnalyticsPathValidator, ...userAnalyticsDaysValidator]),
  userAnalyticsController.getUserEngagement
);

// GET /api/v1/analytics/followers/:userId - Follower growth over time
// Query params: ?days=30 (default: 30)
router.get(
  '/followers/:userId',
  authenticate,
  validate([...userAnalyticsPathValidator, ...userAnalyticsDaysValidator]),
  userAnalyticsController.getUserFollowers
);

// GET /api/v1/analytics/content/:userId - Content performance metrics
// Query params: ?days=30&limit=20 (defaults: 30, 20)
router.get(
  '/content/:userId',
  authenticate,
  validate(userAnalyticsContentValidator),
  userAnalyticsController.getUserContent
);

export default router;
