import { query, param, body, ValidationChain } from 'express-validator';

// Maximum allowed values for pagination to prevent DoS
const MAX_LIMIT = 100;
const MAX_OFFSET = 10000;
const DEFAULT_LIMIT = 20;

/**
 * Common pagination validation
 */
export const paginationValidator: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: MAX_LIMIT })
    .withMessage(`Limit must be between 1 and ${MAX_LIMIT}`)
    .toInt(),
  query('offset')
    .optional()
    .isInt({ min: 0, max: MAX_OFFSET })
    .withMessage(`Offset must be between 0 and ${MAX_OFFSET}`)
    .toInt(),
];

/**
 * UUID parameter validation
 */
export const uuidParamValidator = (paramName: string): ValidationChain => {
  return param(paramName)
    .isUUID()
    .withMessage(`${paramName} must be a valid UUID`);
};

/**
 * Common ID parameter validation (supports UUID or CUID)
 */
export const idParamValidator = (paramName: string): ValidationChain => {
  return param(paramName)
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage(`${paramName} must be a valid ID`);
};

/**
 * Search query validation
 */
export const searchQueryValidator: ValidationChain[] = [
  query('q')
    .optional()
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
    .trim()
    .escape(),
  query('query')
    .optional()
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
    .trim()
    .escape(),
];

/**
 * Timeframe/date range validation
 */
export const timeframeValidator: ValidationChain[] = [
  query('timeframe')
    .optional()
    .isIn(['today', 'week', 'month', 'year', 'all'])
    .withMessage('Timeframe must be one of: today, week, month, year, all'),
  query('days')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Days must be between 1 and 365')
    .toInt(),
];

/**
 * Sort/order validation
 */
export const sortValidator: ValidationChain[] = [
  query('sort')
    .optional()
    .isIn(['created', 'updated', 'likes', 'comments', 'trending', 'popular'])
    .withMessage('Invalid sort field'),
  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc'),
];

/**
 * Content body validation (for posts, comments, etc.)
 */
export const contentBodyValidator: ValidationChain[] = [
  body('content')
    .optional()
    .isString()
    .isLength({ max: 5000 })
    .withMessage('Content must be less than 5000 characters')
    .trim(),
];

/**
 * URL validation
 */
export const urlValidator = (fieldName: string, required = false): ValidationChain => {
  const validator = required ? body(fieldName) : body(fieldName).optional();
  return validator
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage(`${fieldName} must be a valid URL`);
};

/**
 * Username validation
 */
export const usernameValidator = (fieldName: string = 'username'): ValidationChain => {
  return body(fieldName)
    .isString()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    .trim();
};

/**
 * Email validation
 */
export const emailValidator = (fieldName: string = 'email'): ValidationChain => {
  return body(fieldName)
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters');
};

/**
 * Password validation
 */
export const passwordValidator = (fieldName: string = 'password'): ValidationChain => {
  return body(fieldName)
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number');
};

/**
 * Hashtag validation
 */
export const hashtagsValidator: ValidationChain = body('hashtags')
  .optional()
  .isArray({ max: 30 })
  .withMessage('Maximum 30 hashtags allowed')
  .custom((hashtags: string[]) => {
    if (!hashtags.every((tag) => typeof tag === 'string' && tag.length <= 50)) {
      throw new Error('Each hashtag must be a string with max 50 characters');
    }
    return true;
  });

/**
 * Report reason validation
 */
export const reportValidator: ValidationChain[] = [
  body('reason')
    .isIn(['spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'misinformation', 'copyright', 'other'])
    .withMessage('Invalid report reason'),
  body('details')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Details must be less than 1000 characters')
    .trim(),
];

/**
 * Middleware to sanitize and enforce pagination defaults
 */
export const sanitizePagination = (req: any, _res: any, next: any) => {
  const limit = Math.min(parseInt(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const offset = Math.min(parseInt(req.query.offset) || 0, MAX_OFFSET);

  req.query.limit = limit;
  req.query.page = page;
  req.query.offset = offset;
  req.query.skip = (page - 1) * limit;

  next();
};
