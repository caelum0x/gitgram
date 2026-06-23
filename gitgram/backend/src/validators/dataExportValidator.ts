import { param } from 'express-validator';

export const filenameValidator = [
  param('filename')
    .notEmpty()
    .withMessage('Filename is required')
    .isString()
    .withMessage('Filename must be a string')
    .isLength({ min: 1, max: 255 })
    .withMessage('Filename must be between 1 and 255 characters')
    .matches(/^[a-zA-Z0-9_\-\.]+$/)
    .withMessage('Filename can only contain letters, numbers, underscores, hyphens, and dots'),
];
