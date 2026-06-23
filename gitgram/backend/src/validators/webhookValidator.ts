import { param, body } from 'express-validator';

export const webhookIdValidator = [
  param('id')
    .notEmpty()
    .withMessage('Webhook ID is required')
    .isString()
    .withMessage('Webhook ID must be a string'),
];

export const createWebhookValidator = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isString()
    .withMessage('Name must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
    .trim(),
  body('url')
    .notEmpty()
    .withMessage('URL is required')
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('URL must be a valid HTTP or HTTPS URL'),
  body('secret')
    .optional()
    .isString()
    .withMessage('Secret must be a string')
    .isLength({ max: 256 })
    .withMessage('Secret must be less than 256 characters'),
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

export const updateWebhookValidator = [
  param('id')
    .notEmpty()
    .withMessage('Webhook ID is required')
    .isString()
    .withMessage('Webhook ID must be a string'),
  body('name')
    .optional()
    .isString()
    .withMessage('Name must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
    .trim(),
  body('url')
    .optional()
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('URL must be a valid HTTP or HTTPS URL'),
  body('events')
    .optional()
    .isArray()
    .withMessage('Events must be an array'),
  body('events.*')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Each event must be a string with max 50 characters'),
  body('active')
    .optional()
    .isBoolean()
    .withMessage('Active must be a boolean'),
];
