import { param, body, query } from 'express-validator';

export const commentParamsValidator = [
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  param('commentId')
    .notEmpty()
    .withMessage('Comment ID is required')
    .isString()
    .withMessage('Comment ID must be a string'),
];

export const postIdOnlyValidator = [
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
];

export const updateCommentValidator = [
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  param('commentId')
    .notEmpty()
    .withMessage('Comment ID is required')
    .isString()
    .withMessage('Comment ID must be a string'),
  body('content')
    .notEmpty()
    .withMessage('Content is required')
    .isString()
    .withMessage('Content must be a string')
    .isLength({ min: 1, max: 500 })
    .withMessage('Content must be between 1 and 500 characters')
    .trim(),
];

export const replyToCommentValidator = [
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  param('commentId')
    .notEmpty()
    .withMessage('Comment ID is required')
    .isString()
    .withMessage('Comment ID must be a string'),
  body('content')
    .notEmpty()
    .withMessage('Content is required')
    .isString()
    .withMessage('Content must be a string')
    .isLength({ min: 1, max: 500 })
    .withMessage('Content must be between 1 and 500 characters')
    .trim(),
];

export const commentRepliesPaginationValidator = [
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  param('commentId')
    .notEmpty()
    .withMessage('Comment ID is required')
    .isString()
    .withMessage('Comment ID must be a string'),
  query('cursor')
    .optional()
    .isISO8601()
    .withMessage('Cursor must be a valid ISO 8601 date string'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
];
