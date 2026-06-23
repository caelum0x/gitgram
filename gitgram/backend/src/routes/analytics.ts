import express from 'express';
import * as analyticsController from '../controllers/analyticsController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  daysQueryValidator,
  postAnalyticsValidator,
  detailedAnalyticsValidator,
  engagementPostsValidator,
} from '../validators/analyticsValidator';

const router = express.Router();

// Get analytics overview (totals + basic stats)
router.get('/overview', authenticate, validate(daysQueryValidator), analyticsController.getAnalyticsOverview);

// Get detailed analytics with time series data
router.get('/', authenticate, validate(detailedAnalyticsValidator), analyticsController.getAnalytics);

// Export analytics as CSV
router.get('/export', authenticate, analyticsController.exportAnalyticsCSV);

// === FOLLOWER ANALYTICS ===

// Get basic follower growth data
router.get('/followers', authenticate, validate(daysQueryValidator), analyticsController.getFollowerGrowth);

// Get detailed follower growth (daily/weekly/monthly with net change)
router.get('/followers/growth', authenticate, validate(daysQueryValidator), analyticsController.getFollowerGrowthDetailed_);

// Get follower demographics (interests, account types)
router.get('/followers/demographics', authenticate, validate(daysQueryValidator), analyticsController.getFollowerDemographics_);

// Get follower quality (engagement rate of followers)
router.get('/followers/quality', authenticate, validate(daysQueryValidator), analyticsController.getFollowerQuality_);

// Get follow relationships (mutual, not following back, etc.)
router.get('/followers/relationships', authenticate, validate(daysQueryValidator), analyticsController.getFollowRelationships_);

// Get unfollow tracking data
router.get('/unfollows', authenticate, validate(daysQueryValidator), analyticsController.getUnfollows);

// === ENGAGEMENT ANALYTICS ===

// Get basic engagement rate data
router.get('/engagement', authenticate, validate(daysQueryValidator), analyticsController.getEngagementRate);

// Get overall engagement metrics with period comparison
router.get('/engagement/overall', authenticate, validate(daysQueryValidator), analyticsController.getOverallEngagement_);

// Get per-post engagement breakdown
router.get('/engagement/posts', authenticate, validate(engagementPostsValidator), analyticsController.getEngagementByPost_);

// Get content reach metrics
router.get('/engagement/reach', authenticate, validate(daysQueryValidator), analyticsController.getContentReach_);

// Get best posting times analysis
router.get('/engagement/best-times', authenticate, validate(daysQueryValidator), analyticsController.getBestPostingTimes_);

// Get analytics for a specific post
router.get('/posts/:postId', authenticate, validate(postAnalyticsValidator), analyticsController.getPostAnalytics);

export default router;
