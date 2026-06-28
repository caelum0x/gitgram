import { body, param } from 'express-validator';
import {
  MAX_MUTED_WORD_LENGTH,
  MUTED_WORD_TARGETS,
  MUTED_WORD_ACTOR_TARGETS,
} from '../services/mutedWordsService';

/**
 * Validators for the muted-words API.
 *
 * Mirrors the AppBskyActorDefs.MutedWord config shape:
 *   value / targets[] / actorTarget / expiresAt.
 */

export const upsertMutedWordValidator = [
  body('value')
    .isString()
    .withMessage('value must be a string')
    .bail()
    .trim()
    .isLength({ min: 1, max: MAX_MUTED_WORD_LENGTH })
    .withMessage(`value must be between 1 and ${MAX_MUTED_WORD_LENGTH} characters`),
  body('targets')
    .optional()
    .isArray({ min: 1 })
    .withMessage('targets must be a non-empty array'),
  body('targets.*')
    .optional()
    .isIn(MUTED_WORD_TARGETS as readonly string[])
    .withMessage(`each target must be one of: ${MUTED_WORD_TARGETS.join(', ')}`),
  body('actorTarget')
    .optional()
    .isIn(MUTED_WORD_ACTOR_TARGETS as readonly string[])
    .withMessage(`actorTarget must be one of: ${MUTED_WORD_ACTOR_TARGETS.join(', ')}`),
  body('expiresAt')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('expiresAt must be an ISO-8601 date string')
    .bail()
    .custom((value: string) => {
      if (new Date(value).getTime() <= Date.now()) {
        throw new Error('expiresAt must be in the future');
      }
      return true;
    }),
];

export const removeMutedWordValidator = [
  param('id')
    .isString()
    .withMessage('id must be a string')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('id is required'),
];
