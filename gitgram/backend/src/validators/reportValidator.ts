import { body, param, query, ValidationChain } from 'express-validator';

export const createReportValidator: ValidationChain[] = [
  body('targetType')
    .notEmpty()
    .withMessage('targetType is required')
    .isIn(['POST', 'COMMENT', 'USER', 'REEL', 'STORY'])
    .withMessage('Invalid targetType'),
  body('targetId')
    .notEmpty()
    .withMessage('targetId is required')
    .isString()
    .withMessage('targetId must be a string')
    .trim(),
  body('reason')
    .notEmpty()
    .withMessage('reason is required')
    .isIn(['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'MISINFORMATION', 'OTHER'])
    .withMessage('Invalid reason'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('description must be less than 2000 characters')
    .trim(),
];

export const getMyReportsValidator: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100')
    .toInt(),
];

export const reportIdParamValidator: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('id is required')
    .isString()
    .withMessage('id must be a string'),
];

export const submitAppealValidator: ValidationChain[] = [
  body('moderationLogId')
    .notEmpty()
    .withMessage('moderationLogId is required')
    .isString()
    .withMessage('moderationLogId must be a string')
    .trim(),
  body('appealText')
    .notEmpty()
    .withMessage('appealText is required')
    .isString()
    .withMessage('appealText must be a string')
    .isLength({ min: 10, max: 2000 })
    .withMessage('appealText must be between 10 and 2000 characters')
    .trim(),
];
