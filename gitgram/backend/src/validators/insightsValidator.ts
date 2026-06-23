import { param, query, ValidationChain } from 'express-validator';

// Supported timeframes for analytics
const TIMEFRAMES = ['today', '7d', '30d', '90d', 'year', 'all'];
const METRIC_TYPES = ['views', 'likes', 'comments', 'shares', 'saves', 'reach', 'engagement', 'followers'];
const CONTENT_TYPES = ['posts', 'reels', 'stories', 'all'];

/**
 * Get account insights validator
 */
export const getAccountInsightsValidator: ValidationChain[] = [
  query('timeframe')
    .optional()
    .isIn(TIMEFRAMES)
    .withMessage(`Timeframe must be one of: ${TIMEFRAMES.join(', ')}`),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date')
    .toDate(),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .toDate()
    .custom((value, { req }) => {
      if (req.query?.startDate && new Date(value) < new Date(req.query.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
];

/**
 * Get post insights validator
 */
export const getPostInsightsValidator: ValidationChain[] = [
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  query('metrics')
    .optional()
    .isString()
    .custom((value) => {
      const metrics = value.split(',');
      const invalid = metrics.filter((m: string) => !METRIC_TYPES.includes(m.trim()));
      if (invalid.length > 0) {
        throw new Error(`Invalid metrics: ${invalid.join(', ')}`);
      }
      return true;
    }),
];

/**
 * Get content performance validator
 */
export const getContentPerformanceValidator: ValidationChain[] = [
  query('contentType')
    .optional()
    .isIn(CONTENT_TYPES)
    .withMessage(`Content type must be one of: ${CONTENT_TYPES.join(', ')}`),
  query('timeframe')
    .optional()
    .isIn(TIMEFRAMES)
    .withMessage('Invalid timeframe'),
  query('sortBy')
    .optional()
    .isIn(METRIC_TYPES)
    .withMessage('Invalid sort metric'),
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
];

/**
 * Get audience insights validator
 */
export const getAudienceInsightsValidator: ValidationChain[] = [
  query('type')
    .optional()
    .isIn(['demographics', 'locations', 'interests', 'activeHours', 'growth'])
    .withMessage('Invalid audience insight type'),
  query('timeframe')
    .optional()
    .isIn(TIMEFRAMES)
    .withMessage('Invalid timeframe'),
];

/**
 * Get reach insights validator
 */
export const getReachInsightsValidator: ValidationChain[] = [
  query('timeframe')
    .optional()
    .isIn(TIMEFRAMES)
    .withMessage('Invalid timeframe'),
  query('breakdown')
    .optional()
    .isIn(['daily', 'weekly', 'monthly'])
    .withMessage('Breakdown must be daily, weekly, or monthly'),
];

/**
 * Export insights data validator
 */
export const exportInsightsValidator: ValidationChain[] = [
  query('format')
    .optional()
    .isIn(['csv', 'json', 'xlsx'])
    .withMessage('Format must be csv, json, or xlsx'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('includeContent')
    .optional()
    .isBoolean()
    .toBoolean(),
];
