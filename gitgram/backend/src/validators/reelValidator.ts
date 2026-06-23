import { body, param, query } from 'express-validator';

export const createReelValidator = [
  body('caption')
    .optional()
    .trim()
    .isLength({ max: 2200 })
    .withMessage('Caption must not exceed 2200 characters')
    .escape(),
  body('hashtags')
    .optional()
    .isArray()
    .withMessage('Hashtags must be an array'),
  body('hashtags.*')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Each hashtag must be a string with max 50 characters'),
  body('mentions')
    .optional()
    .isArray()
    .withMessage('Mentions must be an array'),
  body('mentions.*')
    .optional()
    .isString()
    .withMessage('Each mention must be a string'),
  body('duration')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Duration must be a positive integer')
    .toInt(),
];

export const getReelsValidator = [
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
  query('userId')
    .optional()
    .isString()
    .withMessage('User ID must be a string'),
];

export const reelIdValidator = [
  param('id')
    .notEmpty()
    .withMessage('Reel ID is required')
    .isString()
    .withMessage('Reel ID must be a string'),
];

export const createReelCommentValidator = [
  param('id')
    .notEmpty()
    .withMessage('Reel ID is required')
    .isString()
    .withMessage('Reel ID must be a string'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Comment must be between 1 and 500 characters')
    .escape(),
];

