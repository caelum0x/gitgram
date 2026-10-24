import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  authLimiter,
  passwordResetLimiter,
  refreshTokenLimiter,
  accountDeletionLimiter,
  emailLimiter
} from '../middleware/rateLimiter';
import { registerValidator, loginValidator } from '../validators/authValidator';
import { body } from 'express-validator';

const router = Router();

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       400:
 *         description: Validation error
 *       409:
 *         description: Username or email already exists
 */
router.post('/register',
  authLimiter,
  validate(registerValidator),
  authController.register
);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 */
router.post('/login',
  authLimiter,
  validate(loginValidator),
  authController.login
);

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh',
  refreshTokenLimiter,
  authController.refreshAccessToken
);

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout and invalidate tokens
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Not authenticated
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request password reset email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       400:
 *         description: Invalid email
 */
router.post('/forgot-password',
  passwordResetLimiter,
  validate([body('email').isEmail().normalizeEmail().withMessage('Valid email is required')]),
  authController.forgotPassword
);

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password',
  authLimiter,
  validate([
    body('token').notEmpty().trim().withMessage('Token is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  ]),
  authController.resetPassword
);

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   get:
 *     summary: Verify email address with token
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 */
router.get('/verify-email',
  authLimiter,
  authController.verifyEmail
);

router.post('/resend-verification',
  authenticate,
  emailLimiter,
  authController.resendVerificationEmail
);

// 2FA endpoints are served by the dedicated 2FA router mounted at
// /api/v1/auth/2fa (see routes/twoFactor.ts). They were removed from this file
// to eliminate the duplicate setup/verify surface and the secret-store mismatch.

// Account recovery
router.post('/recover-account',
  passwordResetLimiter,
  validate([
    body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('username').optional().trim().notEmpty().withMessage('Username is required'),
  ]),
  authController.recoverAccount
);

/**
 * @swagger
 * /api/v1/auth/delete-account:
 *   delete:
 *     summary: Delete user account
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 description: Required for password accounts; omitted by OAuth-only accounts
 *     responses:
 *       200:
 *         description: Account deletion initiated
 *       400:
 *         description: Password missing on a password account
 *       401:
 *         description: Invalid password
 */
router.delete('/delete-account',
  authenticate,
  accountDeletionLimiter,
  validate([
    body('password').optional({ nullable: true }).isString().withMessage('Password must be a string'),
  ]),
  authController.deleteAccount
);

// Alias clients used to call (web `userService`, mobile `complianceService`).
// Kept so old app builds that shipped the `/auth/account` path keep working.
router.delete('/account',
  authenticate,
  accountDeletionLimiter,
  validate([
    body('password').optional({ nullable: true }).isString().withMessage('Password must be a string'),
  ]),
  authController.deleteAccount
);

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     summary: Change password (authenticated)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Current password is incorrect
 */
router.post('/change-password',
  authenticate,
  authLimiter,
  validate([
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  ]),
  authController.changePassword
);

// OAuth endpoints
/**
 * @swagger
 * /api/v1/auth/github:
 *   post:
 *     summary: Authenticate with GitHub OAuth
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: GitHub OAuth authorization code
 *     responses:
 *       200:
 *         description: Authentication successful
 *       401:
 *         description: Invalid authorization code
 */
router.post('/github',
  validate([body('code').notEmpty().withMessage('Authorization code is required')]),
  authController.githubAuth
);

/**
 * @swagger
 * /api/v1/auth/google:
 *   post:
 *     summary: Authenticate with Google OAuth
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: Google OAuth authorization code
 *     responses:
 *       200:
 *         description: Authentication successful
 *       401:
 *         description: Invalid authorization code
 */
router.post('/google',
  validate([body('code').notEmpty().withMessage('Authorization code is required')]),
  authController.googleAuth
);

export default router;
