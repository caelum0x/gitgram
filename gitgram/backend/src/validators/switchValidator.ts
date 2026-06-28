import { body } from 'express-validator';

export const switchAccountValidator = [
  body('accountId')
    .notEmpty()
    .withMessage('Account ID is required')
    .isString()
    .withMessage('Account ID must be a string')
    .isLength({ min: 1, max: 50 })
    .withMessage('Account ID must be between 1 and 50 characters'),
];

export const switchGrantValidator = [
  body('targetUserId')
    .notEmpty()
    .withMessage('targetUserId is required')
    .isString()
    .withMessage('targetUserId must be a string')
    .isLength({ min: 1, max: 50 })
    .withMessage('targetUserId must be between 1 and 50 characters'),
];
