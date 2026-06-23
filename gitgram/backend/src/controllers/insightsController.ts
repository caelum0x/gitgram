import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
    getTopPerformingPosts,
    getAudienceDemographics,
    getContentPerformance,
} from '../services/contentInsightsService';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Get top performing posts
 * GET /api/v1/insights/top-posts
 */
export const getTopPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { limit = '10' } = req.query;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const posts = await getTopPerformingPosts(userId, parseInt(limit as string));
    res.json({ posts });
});

/**
 * Get audience demographics
 * GET /api/v1/insights/audience
 */
export const getAudience = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const demographics = await getAudienceDemographics(userId);
    res.json({ demographics });
});

/**
 * Get content performance metrics
 * GET /api/v1/insights/performance
 */
export const getPerformance = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { days = '30' } = req.query;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const performance = await getContentPerformance(userId, parseInt(days as string));
    res.json({ performance });
});

/**
 * Get all insights overview
 * GET /api/v1/insights
 */
export const getInsightsOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { days = '30' } = req.query;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const [topPosts, demographics, performance] = await Promise.all([
        getTopPerformingPosts(userId, 5),
        getAudienceDemographics(userId),
        getContentPerformance(userId, parseInt(days as string)),
    ]);

    res.json({
        topPosts,
        demographics,
        performance,
    });
});
