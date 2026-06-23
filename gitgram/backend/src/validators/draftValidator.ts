import { param, body } from 'express-validator';

export const draftIdValidator = [
  param('id')
    .notEmpty()
    .withMessage('Draft ID is required')
    .isString()
    .withMessage('Draft ID must be a string'),
];

export const createDraftValidator = [
  body('content')
    .optional()
    .isString()
    .isLength({ max: 5000 })
    .withMessage('Content must be less than 5000 characters')
    .trim(),
  body('mediaUrls')
    .optional()
    .isArray({ max: 10 })
    .withMessage('mediaUrls must be an array with max 10 items'),
];

export const updateDraftValidator = [
  param('id')
    .notEmpty()
    .withMessage('Draft ID is required')
    .isString()
    .withMessage('Draft ID must be a string'),
  body('content')
    .optional()
    .isString()
    .isLength({ max: 5000 })
    .withMessage('Content must be less than 5000 characters')
    .trim(),
  body('mediaUrls')
    .optional()
    .isArray({ max: 10 })
    .withMessage('mediaUrls must be an array with max 10 items'),
];

export const syncDraftsValidator = [
  body('drafts')
    .isArray({ min: 1, max: 50 })
    .withMessage('Drafts must be an array with 1-50 items'),
  body('drafts.*.content')
    .optional()
    .isString()
    .isLength({ max: 5000 })
    .withMessage('Content must be less than 5000 characters'),
];
