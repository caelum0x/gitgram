import { param, query } from 'express-validator';

export const daysQueryValidator = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
    .toInt(),
];

export const postAnalyticsValidator = [
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
    .toInt(),
];

export const detailedAnalyticsValidator = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
    .toInt(),
  query('type')
    .optional()
    .isIn(['all', 'posts', 'reels', 'stories'])
    .withMessage('Type must be one of: all, posts, reels, stories'),
];

export const engagementPostsValidator = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
];
