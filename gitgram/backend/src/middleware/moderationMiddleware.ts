import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { moderateContent } from '../services/moderationService';
import logger from '../utils/logger';

export const moderatePost = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { content } = req.body;
    const userId = req.userId!;

    const result = await moderateContent(content, userId);

    if (result.action === 'reject') {
      return res.status(403).json({
        error: 'Content violates community guidelines',
        flags: result.flags,
        message: 'Your content was flagged for: ' + result.flags.join(', ')
      });
    }

    if (result.action === 'review') {
      req.body.needsReview = true;
    }

    req.body.moderationResult = result;
    next();
  } catch (error) {
    logger.error('Moderation error:', error);
    next(); // Continue on error to not block users
  }
};
