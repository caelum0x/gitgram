import { body, query } from 'express-validator';

const SUGGEST_TYPES = ['user', 'repository', 'hashtag', 'snippet'];
const UNIFIED_TYPES = ['all', 'users', 'repos', 'posts', 'snippets', 'hashtags'];

/**
 * Unified search: q (required, 1-200), type (one of UNIFIED_TYPES),
 * limit (1-50), cursor (opaque base64 offset token).
 */
export const unifiedSearchValidator = [
  query('q')
    .isString()
    .isLength({ min: 2, max: 200 })
    .withMessage('Search query must be between 2 and 200 characters')
    .trim(),
  query('type')
    .optional()
    .isIn(UNIFIED_TYPES)
    .withMessage(`Type must be one of: ${UNIFIED_TYPES.join(', ')}`),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
    .toInt(),
  query('cursor')
    .optional()
    .isString()
    .isLength({ max: 256 })
    .withMessage('Cursor must be a valid pagination token'),
];

/**
 * Autocomplete suggestions: q (required, 2-100), comma-separated types,
 * limit (1-25).
 */
export const suggestValidator = [
  query('q')
    .isString()
    .isLength({ min: 2, max: 100 })
    .withMessage('Suggestion query must be between 2 and 100 characters')
    .trim(),
  query('types')
    .optional()
    .isString()
    .custom((value: string) => {
      const parts = value.split(',').map((t) => t.trim()).filter(Boolean);
      return parts.every((t) => SUGGEST_TYPES.includes(t));
    })
    .withMessage(`types must be a comma-separated list of: ${SUGGEST_TYPES.join(', ')}`),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 25 })
    .withMessage('Limit must be between 1 and 25')
    .toInt(),
];

/** Track a search query for trending analytics. */
export const trackSearchValidator = [
  body('query')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('query must be between 1 and 200 characters')
    .trim(),
];

export const searchAllValidator = [
  query('q')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
    .trim()
    .escape(),
  query('type')
    .optional()
    .isIn(['all', 'users', 'posts', 'repositories'])
    .withMessage('Type must be one of: all, users, posts, repositories'),
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

export const advancedSearchValidator = [
  query('q')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
    .trim()
    .escape(),
  query('type')
    .optional()
    .isIn(['users', 'posts', 'repositories', 'snippets'])
    .withMessage('Type must be one of: users, posts, repositories, snippets'),
  query('language')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Language must be less than 50 characters')
    .trim(),
  query('sortBy')
    .optional()
    .isIn(['relevance', 'recent', 'popular'])
    .withMessage('sortBy must be one of: relevance, recent, popular'),
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('dateFrom must be a valid ISO 8601 date'),
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('dateTo must be a valid ISO 8601 date'),
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

export const searchReposValidator = [
  query('q')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
    .trim()
    .escape(),
  query('language')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Language must be less than 50 characters')
    .trim(),
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

export const searchSnippetsValidator = [
  query('q')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
    .trim()
    .escape(),
  query('language')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Language must be less than 50 characters')
    .trim(),
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

export const searchActivitiesValidator = [
  query('q')
    .optional()
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
    .trim()
    .escape(),
  query('eventType')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Event type must be between 1 and 100 characters'),
  query('repositoryId')
    .optional()
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Repository ID must be between 1 and 200 characters'),
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

export const paginationOnlyValidator = [
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
