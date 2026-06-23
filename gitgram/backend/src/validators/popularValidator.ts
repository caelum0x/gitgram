import { query } from 'express-validator';

export const popularPaginationValidator = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('Offset must be between 0 and 10000')
    .toInt(),
];
