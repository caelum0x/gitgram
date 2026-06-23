import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
    setup2FA,
    verify2FA,
    disable2FA,
    verify2FALogin,
    get2FAStatus,
} from '../controllers/twoFactorController';
import { validate } from '../middleware/validation';
import {
    verify2FAValidator,
    disable2FAValidator,
    verifyLoginValidator,
} from '../validators/twoFactorValidator';

const router = Router();

/**
 * Get 2FA status
 * GET /api/auth/2fa/status
 */
router.get('/status', authenticate, get2FAStatus);

/**
 * Setup 2FA - Generate secret and QR code
 * POST /api/auth/2fa/setup
 */
router.post('/setup', authenticate, setup2FA);

/**
 * Verify and enable 2FA
 * POST /api/auth/2fa/verify
 */
router.post('/verify', authenticate, validate(verify2FAValidator), verify2FA);

/**
 * Disable 2FA
 * POST /api/auth/2fa/disable
 */
router.post('/disable', authenticate, validate(disable2FAValidator), disable2FA);

/**
 * Verify 2FA token during login (no auth required)
 * POST /api/auth/2fa/verify-login
 */
router.post('/verify-login', validate(verifyLoginValidator), verify2FALogin);

export default router;
