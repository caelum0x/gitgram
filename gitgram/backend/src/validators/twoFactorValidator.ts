import { body } from 'express-validator';

export const verify2FAValidator = [
  body('token')
    .notEmpty()
    .withMessage('Token is required')
    .isString()
    .withMessage('Token must be a string')
    .isLength({ min: 6, max: 6 })
    .withMessage('Token must be exactly 6 digits')
    .matches(/^\d{6}$/)
    .withMessage('Token must contain only digits'),
];

// Verify a 2FA code (TOTP or backup) for an authenticated user. Accepts both
// 6-digit TOTP codes and backup codes (hex), so it only checks non-empty string.
export const verifyCodeValidator = [
  body('code')
    .notEmpty()
    .withMessage('A 2FA code is required')
    .isString()
    .withMessage('Code must be a string'),
];

export const disable2FAValidator = [
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isString()
    .withMessage('Password must be a string')
    .isLength({ min: 1, max: 128 })
    .withMessage('Password must be between 1 and 128 characters'),
  // A current 2FA code (TOTP or backup) is also required to disable, matching
  // authController.disableTwoFactor which calls twoFactorService.verify2FA.
  body('token')
    .notEmpty()
    .withMessage('A current 2FA code is required to disable 2FA')
    .isString()
    .withMessage('Token must be a string'),
];

export const regenerateBackupCodesValidator = [
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isString()
    .withMessage('Password must be a string')
    .isLength({ min: 1, max: 128 })
    .withMessage('Password must be between 1 and 128 characters'),
];

// Login-completion validator: the client exchanges the short-lived tempToken
// (issued by POST /login when 2FA is enabled) plus a TOTP or backup code.
export const verifyLoginValidator = [
  body('tempToken')
    .notEmpty()
    .withMessage('Temporary token is required')
    .isString()
    .withMessage('Temporary token must be a string'),
  body('code')
    .notEmpty()
    .withMessage('A 2FA code is required')
    .isString()
    .withMessage('Code must be a string'),
];
