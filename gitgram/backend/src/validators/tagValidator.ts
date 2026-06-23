import { param, query } from 'express-validator';

export const trendingTagsValidator = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
];

export const searchTagsValidator = [
  query('q')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters')
    .trim()
    .escape(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
];

export const tagPostsValidator = [
  param('name')
    .notEmpty()
    .withMessage('Tag name is required')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Tag name must be between 1 and 100 characters')
    .trim(),
  query('cursor')
    .optional()
    .isISO8601()
    .withMessage('Cursor must be a valid ISO8601 timestamp'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
  query('sort')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort must be asc or desc'),
];

export const tagPostsPaginationValidator = tagPostsValidator;
