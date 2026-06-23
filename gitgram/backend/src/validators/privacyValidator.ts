import { param, body } from 'express-validator';

export const userIdParamValidator = [
  param('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .isString()
    .withMessage('User ID must be a string')
    .isLength({ min: 1, max: 50 })
    .withMessage('User ID must be between 1 and 50 characters'),
];

export const reportContentValidator = [
  body('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  body('reason')
    .notEmpty()
    .withMessage('Reason is required')
    .isString()
    .withMessage('Reason must be a string')
    .isLength({ min: 1, max: 500 })
    .withMessage('Reason must be between 1 and 500 characters')
    .trim(),
];
