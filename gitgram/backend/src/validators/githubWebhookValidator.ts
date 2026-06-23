import { param, body } from 'express-validator';

export const registerWebhookValidator = [
  body('owner')
    .notEmpty()
    .withMessage('Owner is required')
    .isString()
    .withMessage('Owner must be a string')
    .isLength({ min: 1, max: 39 })
    .withMessage('Owner must be between 1 and 39 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Owner can only contain letters, numbers, underscores, and hyphens'),
  body('repo')
    .notEmpty()
    .withMessage('Repo is required')
    .isString()
    .withMessage('Repo must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Repo must be between 1 and 100 characters')
    .matches(/^[a-zA-Z0-9_\-\.]+$/)
    .withMessage('Repo can only contain letters, numbers, underscores, hyphens, and dots'),
  body('events')
    .optional()
    .isArray()
    .withMessage('Events must be an array'),
  body('events.*')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Each event must be a string with max 50 characters'),
];

export const ownerRepoParamsValidator = [
  param('owner')
    .notEmpty()
    .withMessage('Owner is required')
    .isString()
    .isLength({ min: 1, max: 39 })
    .withMessage('Owner must be between 1 and 39 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Owner can only contain letters, numbers, underscores, and hyphens'),
  param('repo')
    .notEmpty()
    .withMessage('Repo is required')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Repo must be between 1 and 100 characters')
    .matches(/^[a-zA-Z0-9_\-\.]+$/)
    .withMessage('Repo can only contain letters, numbers, underscores, hyphens, and dots'),
];
