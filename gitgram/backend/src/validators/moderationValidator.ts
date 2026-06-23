import { param, query, body } from 'express-validator';

export const moderationQueueValidator = [
  query('action')
    .optional()
    .isIn(['review', 'pending', 'approved', 'rejected'])
    .withMessage('Action must be one of: review, pending, approved, rejected'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

export const reviewContentValidator = [
  param('id')
    .notEmpty()
    .withMessage('Content ID is required')
    .isString()
    .withMessage('Content ID must be a string'),
  body('decision')
    .notEmpty()
    .withMessage('Decision is required')
    .isIn(['approve', 'reject'])
    .withMessage('Decision must be approve or reject'),
];

export const checkUserValidator = [
  param('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .isString()
    .withMessage('User ID must be a string')
    .isLength({ min: 1, max: 50 })
    .withMessage('User ID must be between 1 and 50 characters'),
];
