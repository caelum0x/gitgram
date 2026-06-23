import { body, param } from 'express-validator';

const keyValueLineRegex = /^[a-zA-Z][a-zA-Z0-9_]*=.*$/;

export const createChangeStoryValidator = [
  param('owner')
    .isString()
    .isLength({ min: 1, max: 100 })
    .matches(/^[A-Za-z0-9_.-]+$/)
    .withMessage('owner is invalid'),
  param('name')
    .isString()
    .isLength({ min: 1, max: 150 })
    .matches(/^[A-Za-z0-9_.-]+$/)
    .withMessage('repository name is invalid'),
  body('checkpointId')
    .isString()
    .isLength({ min: 3, max: 128 })
    .matches(/^[A-Za-z0-9_.:-]+$/)
    .withMessage('checkpointId is required and must be an identifier'),
  body('fromCheckpointId')
    .optional()
    .isString()
    .isLength({ min: 3, max: 128 })
    .matches(/^[A-Za-z0-9_.:-]+$/)
    .withMessage('fromCheckpointId is invalid'),
  body('aitmProjectId')
    .optional()
    .isString()
    .isLength({ min: 2, max: 128 })
    .matches(/^[A-Za-z0-9_.:-]+$/)
    .withMessage('aitmProjectId is invalid'),
  body('title')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: 160 })
    .withMessage('title must be between 3 and 160 characters'),
  body('summary')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('summary must be less than 5000 characters'),
  body('diffSummary')
    .optional()
    .isObject()
    .withMessage('diffSummary must be an object'),
  body('diffSummary.added')
    .optional()
    .isInt({ min: 0, max: 1000000 })
    .withMessage('diffSummary.added must be a non-negative integer'),
  body('diffSummary.removed')
    .optional()
    .isInt({ min: 0, max: 1000000 })
    .withMessage('diffSummary.removed must be a non-negative integer'),
  body('diffSummary.modified')
    .optional()
    .isInt({ min: 0, max: 1000000 })
    .withMessage('diffSummary.modified must be a non-negative integer'),
  body('changedFiles')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        if (value.length > 10000) {
          throw new Error('changedFiles string is too large');
        }
        return true;
      }
      if (!Array.isArray(value)) {
        throw new Error('changedFiles must be an array or newline-separated string');
      }
      if (value.length > 500) {
        throw new Error('changedFiles supports up to 500 file paths');
      }
      for (const filePath of value) {
        if (typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 512) {
          throw new Error('every changedFiles entry must be a non-empty path string');
        }
      }
      return true;
    }),
  body()
    .custom((payload) => {
      // Prevent abuse of this API by ensuring payload does not include malformed K=V blocks.
      const summary = typeof payload?.summary === 'string' ? payload.summary : '';
      if (summary.includes('[AITM_CHANGE_STORY]') || summary.includes('[/AITM_CHANGE_STORY]')) {
        throw new Error('summary must not contain raw AITM block markers');
      }
      if (summary.split('\n').some((line: string) => line.includes('=') && !keyValueLineRegex.test(line) && line.trim().startsWith('diff'))) {
        throw new Error('summary includes invalid key-value syntax');
      }
      return true;
    }),
];

