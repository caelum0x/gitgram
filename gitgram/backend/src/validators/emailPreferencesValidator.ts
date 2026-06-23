import { body } from 'express-validator';

export const updateEmailPreferencesValidator = [
  body('marketingEmails')
    .optional()
    .isBoolean()
    .withMessage('marketingEmails must be a boolean'),
  body('newFollowerEmails')
    .optional()
    .isBoolean()
    .withMessage('newFollowerEmails must be a boolean'),
  body('commentEmails')
    .optional()
    .isBoolean()
    .withMessage('commentEmails must be a boolean'),
  body('likeEmails')
    .optional()
    .isBoolean()
    .withMessage('likeEmails must be a boolean'),
  body('mentionEmails')
    .optional()
    .isBoolean()
    .withMessage('mentionEmails must be a boolean'),
  body('weeklyDigest')
    .optional()
    .isBoolean()
    .withMessage('weeklyDigest must be a boolean'),
];
