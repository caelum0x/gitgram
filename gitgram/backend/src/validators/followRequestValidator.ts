import { param, body, query } from 'express-validator';

export const sendFollowRequestValidator = [
  body('targetId')
    .notEmpty()
    .withMessage('Target user ID is required')
    .isString()
    .withMessage('Target user ID must be a string')
    .isLength({ min: 1, max: 50 })
    .withMessage('Target user ID must be between 1 and 50 characters'),
];

export const followRequestIdValidator = [
  param('requestId')
    .notEmpty()
    .withMessage('Request ID is required')
    .isString()
    .withMessage('Request ID must be a string'),
];

export const targetIdParamValidator = [
  param('targetId')
    .notEmpty()
    .withMessage('Target user ID is required')
    .isString()
    .withMessage('Target user ID must be a string')
    .isLength({ min: 1, max: 50 })
    .withMessage('Target user ID must be between 1 and 50 characters'),
];

export const followRequestsPaginationValidator = [
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
