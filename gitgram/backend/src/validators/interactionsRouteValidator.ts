import { param, body, query } from 'express-validator';

const CONTENT_TYPES = ['post', 'comment', 'reel', 'story', 'snippet', 'repository', 'message'];

export const contentParamsValidator = [
  param('contentType')
    .notEmpty()
    .isString()
    .isLength({ max: 20 })
    .withMessage('Content type must be a valid string'),
  param('contentId')
    .notEmpty()
    .isString()
    .withMessage('Content ID must be a string')
    .isLength({ min: 1, max: 50 })
    .withMessage('Content ID must be between 1 and 50 characters'),
];

export const addCommentValidator = [
  param('contentType')
    .notEmpty()
    .isString()
    .isLength({ max: 20 })
    .withMessage('Content type must be a valid string'),
  param('contentId')
    .notEmpty()
    .isString()
    .withMessage('Content ID must be a string'),
  body('content')
    .notEmpty()
    .withMessage('Content is required')
    .isString()
    .withMessage('Content must be a string')
    .isLength({ min: 1, max: 500 })
    .withMessage('Content must be between 1 and 500 characters')
    .trim(),
  body('parentId')
    .optional()
    .isString()
    .withMessage('Parent ID must be a string'),
];

export const getCommentsValidator = [
  param('contentType')
    .notEmpty()
    .isString()
    .isLength({ max: 20 })
    .withMessage('Content type must be a valid string'),
  param('contentId')
    .notEmpty()
    .isString()
    .withMessage('Content ID must be a string'),
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
