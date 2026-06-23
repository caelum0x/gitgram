import { body, param, query, ValidationChain } from 'express-validator';

// Supported programming languages
const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'rust', 'go', 'java', 'csharp',
  'cpp', 'c', 'swift', 'kotlin', 'ruby', 'php', 'scala', 'haskell',
  'elixir', 'clojure', 'sql', 'html', 'css', 'scss', 'json', 'yaml',
  'markdown', 'bash', 'powershell', 'dockerfile', 'terraform', 'other'
];

/**
 * Create snippet validator
 */
export const createSnippetValidator: ValidationChain[] = [
  body('code')
    .notEmpty()
    .withMessage('Code is required')
    .isString()
    .isLength({ min: 1, max: 50000 })
    .withMessage('Code must be between 1 and 50,000 characters')
    .trim(),
  body('title')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Title must be less than 200 characters')
    .trim()
    .escape(),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters')
    .trim(),
  body('language')
    .optional()
    .isString()
    .isIn(SUPPORTED_LANGUAGES)
    .withMessage(`Language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`),
  body('repositoryId')
    .optional()
    .isString()
    .withMessage('Repository ID must be a string'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean'),
  body('filePath')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('File path must be less than 500 characters'),
  body('startLine')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Start line must be a positive integer')
    .toInt(),
  body('endLine')
    .optional()
    .isInt({ min: 1 })
    .withMessage('End line must be a positive integer')
    .toInt()
    .custom((value, { req }) => {
      if (req.body.startLine && value < req.body.startLine) {
        throw new Error('End line must be greater than or equal to start line');
      }
      return true;
    }),
];

/**
 * Update snippet validator
 */
export const updateSnippetValidator: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('Snippet ID is required')
    .isString(),
  body('code')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50000 })
    .withMessage('Code must be between 1 and 50,000 characters')
    .trim(),
  body('title')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('Title must be less than 200 characters')
    .trim()
    .escape(),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters')
    .trim(),
  body('language')
    .optional()
    .isString()
    .isIn(SUPPORTED_LANGUAGES)
    .withMessage(`Language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`),
];

/**
 * Get snippets validator
 */
export const getSnippetsValidator: ValidationChain[] = [
  query('language')
    .optional()
    .isString()
    .isIn(SUPPORTED_LANGUAGES)
    .withMessage('Invalid language'),
  query('repositoryId')
    .optional()
    .isString(),
  query('userId')
    .optional()
    .isString(),
  query('mine')
    .optional()
    .isBoolean()
    .toBoolean(),
  query('q')
    .optional()
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
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

/**
 * Snippet ID parameter validator
 */
export const snippetIdValidator: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('Snippet ID is required')
    .isString()
    .withMessage('Snippet ID must be a string'),
];
