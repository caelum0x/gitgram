import { param, body, query } from 'express-validator';

export const trendingQueryValidator = [
  query('tier')
    .optional()
    .isIn(['hot', 'today', 'week', 'rising'])
    .withMessage('Tier must be one of: hot, today, week, rising'),
  query('type')
    .optional()
    .isIn(['post', 'repository', 'user'])
    .withMessage('Type must be one of: post, repository, user'),
  query('language')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Language must be less than 50 characters')
    .trim(),
  query('topic')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Topic must be less than 100 characters')
    .trim(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('Offset must be between 0 and 10000')
    .toInt(),
];

export const updateSignalConfigValidator = [
  param('signalName')
    .notEmpty()
    .withMessage('Signal name is required')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Signal name must be between 1 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Signal name can only contain letters, numbers, and underscores'),
  body('weight')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Weight must be between 0 and 100'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters')
    .trim(),
];
