import { param, query, ValidationChain } from 'express-validator';

export const userAnalyticsPathValidator: ValidationChain[] = [
  param('userId')
    .notEmpty()
    .withMessage('userId is required')
    .isString()
    .withMessage('userId must be a string')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('userId must be between 1 and 100 characters'),
];

export const userAnalyticsDaysValidator: ValidationChain[] = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('days must be an integer between 1 and 365')
    .toInt(),
];

export const userAnalyticsContentValidator: ValidationChain[] = [
  ...userAnalyticsPathValidator,
  ...userAnalyticsDaysValidator,
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100')
    .toInt(),
];

