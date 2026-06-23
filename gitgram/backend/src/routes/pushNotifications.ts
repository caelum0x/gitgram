import express from 'express';
import { authenticate } from '../middleware/auth';
import { registerDevice, unregisterDevice } from '../controllers/pushNotificationController';
import { validate } from '../middleware/validation';
import { body } from 'express-validator';

const router = express.Router();

// All push notification routes require authentication
router.use(authenticate);

// Register device for push notifications
router.post(
  '/register-device',
  validate([
    body('pushToken').isString().notEmpty(),
    body('platform').optional().isIn(['ios', 'android', 'web']),
    body('deviceName').optional().isString(),
  ]),
  registerDevice
);

// Unregister device (e.g., on logout)
router.post(
  '/unregister-device',
  validate([
    body('pushToken').isString().notEmpty(),
  ]),
  unregisterDevice
);

export default router;

