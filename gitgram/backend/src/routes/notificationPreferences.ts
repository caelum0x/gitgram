import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getPreferences,
  updatePreferences,
} from '../controllers/notificationPreferencesController';
import { validate } from '../middleware/validation';
import { updateNotificationPreferencesValidator } from '../validators/notificationPreferencesValidator';

const router = Router();

router.use(authenticate);

// Get notification preferences
router.get('/', getPreferences);

// Update notification preferences
router.put('/', validate(updateNotificationPreferencesValidator), updatePreferences);

export default router;
