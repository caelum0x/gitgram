import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getEmailPreferences,
  updateEmailPreferences,
} from '../controllers/emailPreferencesController';
import { validate } from '../middleware/validation';
import { updateEmailPreferencesValidator } from '../validators/emailPreferencesValidator';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/v1/users/email-preferences
 * @description Get current email notification preferences
 * @access Private
 */
router.get('/', getEmailPreferences);

/**
 * @route PUT /api/v1/users/email-preferences
 * @description Update email notification preferences
 * @access Private
 * @body {
 *   marketingEmails?: boolean,
 *   newFollowerEmails?: boolean,
 *   commentEmails?: boolean,
 *   likeEmails?: boolean,
 *   mentionEmails?: boolean,
 *   weeklyDigest?: boolean
 * }
 * Note: securityAlerts cannot be disabled
 */
router.put('/', validate(updateEmailPreferencesValidator), updateEmailPreferences);

export default router;
