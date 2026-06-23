import { body, param, query, ValidationChain } from 'express-validator';

// Supported content types for interactions
const CONTENT_TYPES = ['POST', 'COMMENT', 'REEL', 'STORY', 'SNIPPET', 'REPOSITORY', 'MESSAGE'];
const INTERACTION_TYPES = ['like', 'save', 'share', 'view', 'bookmark'];

/**
 * Create interaction validator
 */
export const createInteractionValidator: ValidationChain[] = [
  body('contentType')
    .notEmpty()
    .withMessage('Content type is required')
    .isIn(CONTENT_TYPES)
    .withMessage(`Content type must be one of: ${CONTENT_TYPES.join(', ')}`),
  body('contentId')
    .notEmpty()
    .withMessage('Content ID is required')
    .isString()
    .withMessage('Content ID must be a string'),
  body('type')
    .notEmpty()
    .withMessage('Interaction type is required')
    .isIn(INTERACTION_TYPES)
    .withMessage(`Interaction type must be one of: ${INTERACTION_TYPES.join(', ')}`),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
];

/**
 * Get interactions validator
 */
export const getInteractionsValidator: ValidationChain[] = [
  query('contentType')
    .optional()
    .isIn(CONTENT_TYPES)
    .withMessage('Invalid content type'),
  query('contentId')
    .optional()
    .isString(),
  query('type')
    .optional()
    .isIn(INTERACTION_TYPES)
    .withMessage('Invalid interaction type'),
  query('userId')
    .optional()
    .isString(),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
];

/**
 * Delete interaction validator
 */
export const deleteInteractionValidator: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('Interaction ID is required')
    .isString()
    .withMessage('Interaction ID must be a string'),
];

/**
 * Toggle interaction validator (like/unlike, save/unsave)
 */
export const toggleInteractionValidator: ValidationChain[] = [
  param('contentType')
    .notEmpty()
    .isIn(CONTENT_TYPES)
    .withMessage('Invalid content type'),
  param('contentId')
    .notEmpty()
    .isString()
    .withMessage('Content ID must be a string'),
  param('interactionType')
    .notEmpty()
    .isIn(INTERACTION_TYPES)
    .withMessage('Invalid interaction type'),
];

/**
 * Check if user has interacted validator
 */
export const checkInteractionValidator: ValidationChain[] = [
  query('contentType')
    .notEmpty()
    .isIn(CONTENT_TYPES)
    .withMessage('Content type is required'),
  query('contentId')
    .notEmpty()
    .isString()
    .withMessage('Content ID is required'),
  query('type')
    .notEmpty()
    .isIn(INTERACTION_TYPES)
    .withMessage('Interaction type is required'),
];
