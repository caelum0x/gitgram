import { query, body } from 'express-validator';

export const getProfileVisitorsValidator = [
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

export const getProfileVisitStatsValidator = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
    .toInt(),
];

export const updateProfilePrivacySettingsValidator = [
  body('profileVisitsEnabled')
    .optional()
    .isBoolean()
    .withMessage('profileVisitsEnabled must be a boolean'),
  body('showProfileVisitors')
    .optional()
    .isBoolean()
    .withMessage('showProfileVisitors must be a boolean'),
];

export const trackVisitSourceValidator = [
  query('source')
    .optional()
    .isIn(['search', 'post', 'comment', 'mention', 'suggestion', 'direct', 'followers', 'following', 'repository'])
    .withMessage('Invalid source value'),
];
