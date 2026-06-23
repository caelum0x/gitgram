import { body, param, query } from 'express-validator';

export const sendMessageValidator = [
  body('recipientId')
    .notEmpty()
    .withMessage('Recipient ID is required')
    .isString()
    .withMessage('Recipient ID must be a string'),
  body('content')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Message content must not exceed 1000 characters')
    .escape(),
  body('mediaType')
    .optional()
    .isIn(['image', 'video', 'code'])
    .withMessage('Media type must be image, video, or code'),
];

export const getMessagesValidator = [
  param('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .isString()
    .withMessage('User ID must be a string'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

export const messageIdValidator = [
  param('messageId')
    .notEmpty()
    .withMessage('Message ID is required')
    .isString()
    .withMessage('Message ID must be a string'),
];

