import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { registerPushDevice, unregisterPushDevice } from '../services/pushService';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const registerDevice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { pushToken, platform, deviceName } = req.body;

  if (!pushToken) {
    throw Errors.badRequest('Push token is required');
  }

  await registerPushDevice(
    userId,
    pushToken,
    platform || 'android',
    deviceName
  );

  logger.info('Device registered for push notifications', {
    userId,
    platform,
  });

  res.json({ message: 'Device registered successfully' });
});

export const unregisterDevice = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { pushToken } = req.body;

  if (!pushToken) {
    throw Errors.badRequest('Push token is required');
  }

  await unregisterPushDevice(pushToken);

  res.json({ message: 'Device unregistered successfully' });
});
