import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validation';
import {
  verify2FAValidator,
  verifyCodeValidator,
  disable2FAValidator,
  regenerateBackupCodesValidator,
  verifyLoginValidator,
} from '../validators/twoFactorValidator';

const router = Router();

/**
 * Two-Factor Authentication (TOTP) routes — mounted at /api/v1/auth/2fa.
 *
 * This is the single, canonical 2FA route surface. All handlers delegate to
 * authController, which is backed by twoFactorService (the `twoFactorAuth`
 * Prisma model with hashed, single-use backup codes). The previous duplicate
 * twoFactorController (which used user.twoFactorSecret) has been removed to
 * avoid a divergent secret store.
 */

/**
 * @swagger
 * /api/v1/auth/2fa/status:
 *   get:
 *     summary: Get 2FA status and remaining backup codes
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status
 */
router.get('/status', authenticate, authController.get2FAStatus);

/**
 * @swagger
 * /api/v1/auth/2fa/setup:
 *   post:
 *     summary: Initialize 2FA setup (generate secret, QR code, backup codes)
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA setup initialized
 */
router.post('/setup', authenticate, authLimiter, authController.setupTwoFactor);

/**
 * @swagger
 * /api/v1/auth/2fa/setup/verify:
 *   post:
 *     summary: Verify a TOTP code and enable 2FA
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA enabled
 *       400:
 *         description: Invalid verification code
 */
router.post(
  '/setup/verify',
  authenticate,
  authLimiter,
  validate(verify2FAValidator),
  authController.verifyTwoFactorSetup
);

/**
 * @swagger
 * /api/v1/auth/2fa/verify:
 *   post:
 *     summary: Verify a 2FA code (TOTP or backup) for an authenticated user
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA code verified
 *       400:
 *         description: Invalid 2FA code
 */
router.post(
  '/verify',
  authenticate,
  authLimiter,
  validate(verifyCodeValidator),
  authController.verifyTwoFactor
);

/**
 * @swagger
 * /api/v1/auth/2fa/disable:
 *   post:
 *     summary: Disable 2FA (requires password and a current 2FA code)
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA disabled
 *       400:
 *         description: Invalid 2FA code
 *       401:
 *         description: Invalid password
 */
router.post(
  '/disable',
  authenticate,
  authLimiter,
  validate(disable2FAValidator),
  authController.disableTwoFactor
);

/**
 * @swagger
 * /api/v1/auth/2fa/backup-codes:
 *   post:
 *     summary: Regenerate backup codes (requires password)
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: New backup codes generated
 *       401:
 *         description: Invalid password
 */
router.post(
  '/backup-codes',
  authenticate,
  authLimiter,
  validate(regenerateBackupCodesValidator),
  authController.regenerateBackupCodes
);

/**
 * @swagger
 * /api/v1/auth/2fa/verify-login:
 *   post:
 *     summary: Complete a 2FA-challenged login by exchanging the tempToken + code
 *     tags: [Two-Factor Authentication]
 *     responses:
 *       200:
 *         description: Login completed, session issued
 *       401:
 *         description: Invalid temporary token or 2FA code
 */
router.post(
  '/verify-login',
  authLimiter,
  validate(verifyLoginValidator),
  authController.verifyTwoFactorLogin
);

/**
 * @swagger
 * /api/v1/auth/2fa/resend:
 *   post:
 *     summary: Guidance for obtaining a current 2FA code
 *     tags: [Two-Factor Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Guidance returned
 */
router.post('/resend', authenticate, authController.resendTwoFactor);

export default router;
