import { body, param, query } from 'express-validator';

export const createPostValidator = [
  body('content')
    .optional()
    .trim()
    .isLength({ max: 2200 })
    .withMessage('Content must not exceed 2200 characters')
    .escape(),
  body('mediaType')
    .optional()
    .isIn(['image', 'code', 'video', 'text'])
    .withMessage('Media type must be image, code, video, or text'),
  body('codeSnippet')
    .optional()
    .isString()
    .withMessage('Code snippet must be a string'),
  body('language')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Language must be a string with max 50 characters'),
  body('hashtags')
    .optional()
    .isArray()
    .withMessage('Hashtags must be an array'),
  body('hashtags.*')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Each hashtag must be a string with max 50 characters'),
  body('mentions')
    .optional()
    .isArray()
    .withMessage('Mentions must be an array'),
  body('mentions.*')
    .optional()
    .isString()
    .withMessage('Each mention must be a string'),
  body('githubRepoId')
    .optional()
    .isString()
    .withMessage('GitHub repo ID must be a string'),
];

export const createPostFromCheckpointValidator = [
  body('checkpointId')
    .trim()
    .notEmpty()
    .withMessage('checkpointId is required')
    .isString()
    .isLength({ min: 1, max: 128 })
    .withMessage('checkpointId must be between 1 and 128 characters'),
  body('projectId')
    .trim()
    .notEmpty()
    .withMessage('projectId is required')
    .isString()
    .isLength({ min: 1, max: 128 })
    .withMessage('projectId must be between 1 and 128 characters'),
  body('message')
    .optional()
    .trim()
    .isString()
    .isLength({ max: 2200 })
    .withMessage('message must not exceed 2200 characters'),
  body('visibility')
    .optional()
    .isIn(['public', 'followers', 'private'])
    .withMessage('visibility must be one of: public, followers, private'),
];

export const getPostsValidator = [
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
  query('userId')
    .optional()
    .isString()
    .withMessage('User ID must be a string'),
];

export const postIdValidator = [
  param('id')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
];

export const createCommentValidator = [
  param('id')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Comment must be between 1 and 500 characters')
    .escape(),
];

export const getCommentsValidator = [
  param('id')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
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

