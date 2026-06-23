import { param, query } from 'express-validator';

export const usernameParamValidator = [
  param('username')
    .isString()
    .isLength({ min: 1, max: 39 })
    .withMessage('Username must be between 1 and 39 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    .trim(),
];

export const accountPostsValidator = [
  param('username')
    .isString()
    .isLength({ min: 1, max: 39 })
    .withMessage('Username must be between 1 and 39 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    .trim(),
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
