import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
    getTopPosts,
    getAudience,
    getPerformance,
    getInsightsOverview,
} from '../controllers/insightsController';
import { validate } from '../middleware/validation';
import { query } from 'express-validator';

const router = Router();

// All routes require authentication
router.use(authenticate);

const insightsQueryValidator = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
    .toInt(),
];

// Get insights overview (all metrics in one call)
router.get('/', validate(insightsQueryValidator), getInsightsOverview);

// Get top performing posts
router.get('/top-posts', validate(insightsQueryValidator), getTopPosts);

// Get audience demographics
router.get('/audience', validate(insightsQueryValidator), getAudience);

// Get content performance metrics
router.get('/performance', validate(insightsQueryValidator), getPerformance);

export default router;
