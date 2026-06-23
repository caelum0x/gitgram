import { body } from 'express-validator';

export const updateNotificationPreferencesValidator = [
  body('likes')
    .optional()
    .isBoolean()
    .withMessage('likes must be a boolean'),
  body('comments')
    .optional()
    .isBoolean()
    .withMessage('comments must be a boolean'),
  body('follows')
    .optional()
    .isBoolean()
    .withMessage('follows must be a boolean'),
  body('mentions')
    .optional()
    .isBoolean()
    .withMessage('mentions must be a boolean'),
  body('messages')
    .optional()
    .isBoolean()
    .withMessage('messages must be a boolean'),
  body('posts')
    .optional()
    .isBoolean()
    .withMessage('posts must be a boolean'),
];
