import { param, body, query } from 'express-validator';

export const scheduledPostIdValidator = [
  param('id')
    .notEmpty()
    .withMessage('Scheduled post ID is required')
    .isString()
    .withMessage('Scheduled post ID must be a string'),
];

export const createScheduledPostValidator = [
  body('content')
    .optional()
    .isString()
    .isLength({ max: 2200 })
    .withMessage('Content must not exceed 2200 characters')
    .trim(),
  body('mediaUrls')
    .optional()
    .isArray({ max: 10 })
    .withMessage('mediaUrls must be an array with max 10 items'),
  body('mediaUrls.*')
    .optional()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('Each media URL must be a valid URL'),
  body('scheduledFor')
    .notEmpty()
    .withMessage('scheduledFor is required')
    .isISO8601()
    .withMessage('scheduledFor must be a valid ISO 8601 date'),
  body('timezone')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Timezone must be a valid string'),
  body('recurrenceType')
    .optional()
    .isIn(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'])
    .withMessage('recurrenceType must be one of: NONE, DAILY, WEEKLY, MONTHLY'),
  body('recurrenceEndDate')
    .optional()
    .isISO8601()
    .withMessage('recurrenceEndDate must be a valid ISO 8601 date'),
];

export const updateScheduledPostValidator = [
  param('id')
    .notEmpty()
    .withMessage('Scheduled post ID is required')
    .isString()
    .withMessage('Scheduled post ID must be a string'),
  body('content')
    .optional()
    .isString()
    .isLength({ max: 2200 })
    .withMessage('Content must not exceed 2200 characters')
    .trim(),
  body('mediaUrls')
    .optional()
    .isArray({ max: 10 })
    .withMessage('mediaUrls must be an array with max 10 items'),
  body('scheduledFor')
    .optional()
    .isISO8601()
    .withMessage('scheduledFor must be a valid ISO 8601 date'),
  body('timezone')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Timezone must be a valid string'),
  body('recurrenceType')
    .optional()
    .isIn(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'])
    .withMessage('recurrenceType must be one of: NONE, DAILY, WEEKLY, MONTHLY'),
  body('recurrenceEndDate')
    .optional()
    .isISO8601()
    .withMessage('recurrenceEndDate must be a valid ISO 8601 date'),
];

export const bulkScheduleValidator = [
  body('posts')
    .isArray({ min: 1, max: 50 })
    .withMessage('Posts must be an array with 1-50 items'),
  body('posts.*.content')
    .optional()
    .isString()
    .isLength({ max: 2200 })
    .withMessage('Content must not exceed 2200 characters'),
  body('posts.*.scheduledFor')
    .notEmpty()
    .withMessage('scheduledFor is required for each post')
    .isISO8601()
    .withMessage('scheduledFor must be a valid ISO 8601 date'),
  body('posts.*.timezone')
    .optional()
    .isString()
    .isLength({ max: 50 }),
  body('posts.*.recurrenceType')
    .optional()
    .isIn(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'])
    .withMessage('recurrenceType must be one of: NONE, DAILY, WEEKLY, MONTHLY'),
];

export const getScheduledPostsValidator = [
  query('status')
    .optional()
    .isIn(['pending', 'published', 'failed', 'cancelled'])
    .withMessage('Status must be one of: pending, published, failed, cancelled'),
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
  query('includeRecurring')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('includeRecurring must be true or false'),
];

export const retryScheduledPostValidator = [
  param('id')
    .notEmpty()
    .withMessage('Scheduled post ID is required')
    .isString()
    .withMessage('Scheduled post ID must be a string'),
  body('scheduledFor')
    .optional()
    .isISO8601()
    .withMessage('scheduledFor must be a valid ISO 8601 date'),
];

export const optimalTimesValidator = [
  query('timezone')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Timezone must be a valid string'),
];

export const deleteScheduledPostValidator = [
  param('id')
    .notEmpty()
    .withMessage('Scheduled post ID is required')
    .isString()
    .withMessage('Scheduled post ID must be a string'),
  query('deleteFutureOccurrences')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('deleteFutureOccurrences must be true or false'),
];
