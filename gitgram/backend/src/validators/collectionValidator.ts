import { param, body, query } from 'express-validator';

export const collectionIdValidator = [
  param('id')
    .notEmpty()
    .withMessage('Collection ID is required')
    .isString()
    .withMessage('Collection ID must be a string'),
];

export const createCollectionValidator = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isString()
    .withMessage('Name must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
    .trim(),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters')
    .trim(),
  body('coverImage')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Cover image URL must be less than 2000 characters'),
  body('isPrivate')
    .optional()
    .isBoolean()
    .withMessage('isPrivate must be a boolean'),
];

export const updateCollectionValidator = [
  param('id')
    .notEmpty()
    .withMessage('Collection ID is required')
    .isString()
    .withMessage('Collection ID must be a string'),
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters')
    .trim(),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters')
    .trim(),
  body('coverImage')
    .optional()
    .isString()
    .isLength({ max: 2000 })
    .withMessage('Cover image URL must be less than 2000 characters'),
  body('isPrivate')
    .optional()
    .isBoolean()
    .withMessage('isPrivate must be a boolean'),
];

export const collectionPostsValidator = [
  param('id')
    .notEmpty()
    .withMessage('Collection ID is required')
    .isString()
    .withMessage('Collection ID must be a string'),
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

export const addToCollectionValidator = [
  param('id')
    .notEmpty()
    .withMessage('Collection ID is required')
    .isString()
    .withMessage('Collection ID must be a string'),
  body('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
];

export const removeFromCollectionValidator = [
  param('id')
    .notEmpty()
    .withMessage('Collection ID is required')
    .isString()
    .withMessage('Collection ID must be a string'),
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
];

export const addToMultipleValidator = [
  body('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  body('collectionIds')
    .isArray({ min: 1, max: 20 })
    .withMessage('collectionIds must be an array with 1-20 items'),
  body('collectionIds.*')
    .isString()
    .withMessage('Each collection ID must be a string'),
];

export const checkPostSavedValidator = [
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
];

export const moveSavedPostValidator = [
  param('id')
    .notEmpty()
    .withMessage('Saved post ID is required')
    .isString()
    .withMessage('Saved post ID must be a string'),
  body('toCollectionId')
    .notEmpty()
    .withMessage('toCollectionId is required')
    .isString()
    .withMessage('toCollectionId must be a string'),
  body('fromCollectionId')
    .optional()
    .isString()
    .withMessage('fromCollectionId must be a string'),
];

export const savedPostsPaginationValidator = [
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
