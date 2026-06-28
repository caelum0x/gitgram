import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { sendEmail } from '../services/emailService';
import logger from '../utils/logger';
import { config } from '../config/env';
import * as twoFactorService from '../services/twoFactorService';
import * as oauthService from '../services/oauthService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

// Production-grade bcrypt rounds
const BCRYPT_ROUNDS = config.bcrypt.rounds;

const isProduction = process.env.NODE_ENV === 'production';

const signAccessToken = (payload: object, expiresIn: SignOptions['expiresIn'] = '7d') =>
  jwt.sign(payload, config.jwt.secret, { expiresIn });

const signRefreshToken = (payload: object, expiresIn: SignOptions['expiresIn'] = '30d') =>
  // Include a random jti so two refresh tokens minted within the same second
  // (e.g. register-then-login, or rapid re-login) never collide on the unique
  // Session.refreshToken column. Without this, jwt.sign produces identical
  // tokens for the same payload + iat second, causing a 500 on the second mint.
  jwt.sign({ ...payload, jti: crypto.randomUUID() }, config.jwt.refreshSecret, { expiresIn });

/** Set access + refresh tokens as httpOnly cookies */
function setAuthCookies(res: Response, token: string, refreshToken: string) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  });
}

/** Clear auth cookies on logout */
function clearAuthCookies(res: Response) {
  res.clearCookie('token', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
}

// Generate secure random token
const generateToken = (): string => crypto.randomBytes(32).toString('hex');

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const { username, email, password } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw Errors.badRequest('User already exists');

    const existingAccount = await prisma.account.findUnique({ where: { username } });
    if (existingAccount) throw Errors.badRequest('Username already taken');

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({ data: { email, password: hashedPassword, username } });
    const account = await prisma.account.create({ data: { type: 'USER', username, userId: user.id } });

    // Create email verification token
    const verificationToken = generateToken();
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });

    // Send verification email (async, don't block registration)
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    sendEmail({
      to: email,
      subject: 'Verify your Gitgram email',
      html: `<p>Welcome to Gitgram! Click <a href="${verifyUrl}">here</a> to verify your email.</p>`
    }).catch(err => logger.error('Failed to send verification email:', err));

    const token = signAccessToken({ userId: user.id });
    const refreshToken = signRefreshToken({ userId: user.id });

    await prisma.session.create({ data: { userId: user.id, refreshToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });

    setAuthCookies(res, token, refreshToken);
    res.status(201).json({ user: { id: user.id, email, emailVerified: false }, account, token, refreshToken });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password, twoFactorCode } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw Errors.unauthorized('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw Errors.unauthorized('Invalid credentials');

    // Check if 2FA is enabled
    const twoFactorAuth = await prisma.twoFactorAuth.findUnique({ where: { userId: user.id } });
    if (twoFactorAuth?.enabled) {
      // If no 2FA code provided, return challenge
      if (!twoFactorCode) {
        const tempToken = signAccessToken({ userId: user.id, pending2FA: true }, '5m');
        return res.json({ requires2FA: true, tempToken });
      }
      // Verify the 2FA code
      const verified = await twoFactorService.verify2FA(user.id, twoFactorCode);
      if (!verified) {
        throw Errors.unauthorized('Invalid two-factor code');
      }
    }

    const account = await prisma.account.findFirst({ where: { userId: user.id } });
    const token = signAccessToken({ userId: user.id });
    const refreshToken = signRefreshToken({ userId: user.id });

    await prisma.session.create({ data: { userId: user.id, refreshToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });

    setAuthCookies(res, token, refreshToken);
    res.json({ user: { id: user.id, email: user.email, emailVerified: user.emailVerified }, account, token, refreshToken });
  }),

  refreshAccessToken: asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.body.refreshToken || (req as any).cookies?.refreshToken;
    if (!refreshToken) throw Errors.unauthorized('Refresh token required');

    const session = await prisma.session.findUnique({ where: { refreshToken } });
    if (!session || session.expiresAt < new Date()) throw Errors.unauthorized('Invalid refresh token');

    const token = signAccessToken({ userId: session.userId });
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ token });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    // Body may be absent when the client logs out via cookies only — guard
    // against an undefined req.body (Express 5 leaves it undefined with no body).
    const refreshToken = req.body?.refreshToken || (req as any).cookies?.refreshToken;
    if (refreshToken) await prisma.session.deleteMany({ where: { refreshToken } });
    clearAuthCookies(res);
    res.json({ message: 'Logged out' });
  }),

  getMe: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const user = await prisma.user.findUnique({ where: { id: authReq.userId } });
    const account = await prisma.account.findFirst({ where: { userId: authReq.userId } });
    res.json({ user, account });
  }),

  setupTwoFactor: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    if (user.twoFactorEnabled) {
      throw Errors.badRequest('2FA is already enabled');
    }

    const result = await twoFactorService.setup2FA(userId, user.email);

    res.json({
      message: 'Scan the QR code with your authenticator app',
      qrCode: result.qrCodeUrl,
      secret: result.secret, // For manual entry
      backupCodes: result.backupCodes,
    });
  }),

  verifyTwoFactorSetup: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { token } = req.body;

    if (!token) {
      throw Errors.badRequest('Verification code is required');
    }

    const success = await twoFactorService.verifyAndEnable2FA(userId, token);

    if (success) {
      logger.info(`2FA enabled for user ${userId}`);
      res.json({ message: '2FA has been enabled successfully' });
    } else {
      throw Errors.badRequest('Invalid verification code');
    }
  }),

  disableTwoFactor: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { password, token } = req.body;

    // Require password verification
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true, twoFactorEnabled: true },
    });

    if (!user?.password) {
      throw Errors.badRequest('Password not set');
    }

    if (!user.twoFactorEnabled) {
      throw Errors.badRequest('2FA is not enabled');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw Errors.unauthorized('Invalid password');
    }

    // Also require 2FA code
    const result = await twoFactorService.verify2FA(userId, token);
    if (!result.valid) {
      throw Errors.badRequest('Invalid 2FA code');
    }

    await twoFactorService.disable2FA(userId);

    logger.info(`2FA disabled for user ${userId}`);
    res.json({ message: '2FA has been disabled' });
  }),

  regenerateBackupCodes: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { password } = req.body;

    // Require password verification
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user?.password) {
      throw Errors.badRequest('Password not set');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw Errors.unauthorized('Invalid password');
    }

    const newCodes = await twoFactorService.regenerateBackupCodes(userId);

    res.json({
      message: 'New backup codes generated',
      backupCodes: newCodes,
    });
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      throw Errors.badRequest('Email is required');
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists with this email, a password reset link has been sent' });
    }

    // Invalidate any existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true }
    });

    // Create new reset token
    const resetToken = generateToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      }
    });

    // Send password reset email
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: 'Reset your Gitgram password',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to set a new password:</p>
        <p><a href="${resetUrl}">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });

    logger.info(`Password reset email sent to ${email}`);
    res.json({ message: 'If an account exists with this email, a password reset link has been sent' });
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = req.body;

    if (!token || !password) {
      throw Errors.badRequest('Token and password are required');
    }

    if (password.length < 8) {
      throw Errors.badRequest('Password must be at least 8 characters');
    }

    // Find valid token
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token,
        used: false,
        expiresAt: { gt: new Date() }
      }
    });

    if (!resetToken) {
      throw Errors.badRequest('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Update user password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true }
      }),
      // Invalidate all sessions for security
      prisma.session.deleteMany({
        where: { userId: resetToken.userId }
      })
    ]);

    logger.info(`Password reset successful for user ${resetToken.userId}`);
    res.json({ message: 'Password has been reset successfully. Please login with your new password.' });
  }),

  verifyEmail: asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      throw Errors.badRequest('Verification token is required');
    }

    // Find valid token
    const verificationToken = await prisma.emailVerificationToken.findFirst({
      where: {
        token,
        used: false,
        expiresAt: { gt: new Date() }
      }
    });

    if (!verificationToken) {
      throw Errors.badRequest('Invalid or expired verification token');
    }

    // Mark email as verified and token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerified: true }
      }),
      prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { used: true }
      })
    ]);

    logger.info(`Email verified for user ${verificationToken.userId}`);
    res.json({ message: 'Email verified successfully' });
  }),

  resendVerificationEmail: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true }
    });

    if (!user) {
      throw Errors.notFound('User');
    }

    if (user.emailVerified) {
      throw Errors.badRequest('Email is already verified');
    }

    // Invalidate existing tokens
    await prisma.emailVerificationToken.updateMany({
      where: { userId, used: false },
      data: { used: true }
    });

    // Create new verification token
    const verificationToken = generateToken();
    await prisma.emailVerificationToken.create({
      data: {
        userId,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    // Send verification email
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Verify your Gitgram email',
      html: `<p>Click <a href="${verifyUrl}">here</a> to verify your email address.</p>`
    });

    res.json({ message: 'Verification email sent' });
  }),

  verifyTwoFactor: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { code } = req.body;

    if (!code) {
      throw Errors.badRequest('2FA code is required');
    }

    const result = await twoFactorService.verify2FA(userId, code);

    if (result.valid) {
      if (result.usedBackupCode) {
        const remainingCodes = await twoFactorService.getBackupCodesCount(userId);
        return res.json({
          verified: true,
          warning: `Backup code used. ${remainingCodes} codes remaining.`,
        });
      }
      res.json({ verified: true });
    } else {
      throw Errors.badRequest('Invalid 2FA code');
    }
  }),

  get2FAStatus: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const enabled = await twoFactorService.is2FAEnabled(userId);
    const backupCodesCount = enabled ? await twoFactorService.getBackupCodesCount(userId) : 0;

    res.json({
      enabled,
      backupCodesRemaining: backupCodesCount,
    });
  }),

  recoverAccount: asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    if (!email) {
      throw Errors.badRequest('Email is required');
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists with this email, recovery instructions have been sent' });
    }

    // Send account recovery email
    await sendEmail({
      to: email,
      subject: 'Gitgram Account Recovery',
      html: `
        <h2>Account Recovery</h2>
        <p>We received a request to recover your Gitgram account.</p>
        <p>If you can't access your account, please try:</p>
        <ul>
          <li><a href="${process.env.FRONTEND_URL}/forgot-password">Reset your password</a></li>
          <li>Contact support at support@gitgram.com</li>
        </ul>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });

    res.json({ message: 'If an account exists with this email, recovery instructions have been sent' });
  }),

  githubAuth: asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body;

    if (!code) {
      throw Errors.badRequest('Authorization code is required');
    }

    try {
      const result = await oauthService.authenticateWithGitHub(code);

      logger.info(`GitHub auth successful for user ${result.user.id}`);

      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.json({
        message: result.isNewUser ? 'Account created successfully' : 'Login successful',
        user: result.user,
        account: result.account,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        isNewUser: result.isNewUser,
      });
    } catch (error: any) {
      if (error instanceof ApiError) throw error;

      logger.error('GitHub auth error:', error);

      if (error.message.includes('Email not available')) {
        throw Errors.badRequest('Please make your GitHub email public or add a verified email to your GitHub account');
      }

      if (error.message.includes('not configured')) {
        throw new ApiError('server_error', 'service_unavailable', 'GitHub authentication is not configured', 503);
      }

      throw error;
    }
  }),

  googleAuth: asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body;

    if (!code) {
      throw Errors.badRequest('Authorization code is required');
    }

    try {
      const result = await oauthService.authenticateWithGoogle(code);

      logger.info(`Google auth successful for user ${result.user.id}`);

      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.json({
        message: result.isNewUser ? 'Account created successfully' : 'Login successful',
        user: result.user,
        account: result.account,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        isNewUser: result.isNewUser,
      });
    } catch (error: any) {
      if (error instanceof ApiError) throw error;

      logger.error('Google auth error:', error);

      if (error.message.includes('not verified')) {
        throw Errors.badRequest('Please verify your Google email address');
      }

      if (error.message.includes('not configured')) {
        throw new ApiError('server_error', 'service_unavailable', 'Google authentication is not configured', 503);
      }

      throw error;
    }
  }),

  // Delete account
  deleteAccount: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) {
      throw Errors.notFound('User');
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw Errors.unauthorized('Invalid password');
    }

    // Delete user and all associated data (cascades handle most relations)
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId } }),
      prisma.account.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } })
    ]);

    logger.info(`Account deleted for user ${userId}`);
    res.json({ message: 'Account deleted successfully' });
  }),

  // Change password (for logged in users)
  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw Errors.badRequest('Current and new passwords are required');
    }

    if (newPassword.length < 8) {
      throw Errors.badRequest('New password must be at least 8 characters');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) {
      throw Errors.notFound('User');
    }

    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      throw Errors.unauthorized('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    logger.info(`Password changed for user ${userId}`);
    res.json({ message: 'Password changed successfully' });
  }),

  // Complete a login that was challenged for 2FA. The client receives a short-lived
  // `tempToken` (pending2FA) from POST /login when 2FA is enabled; it exchanges that
  // token plus a TOTP/backup code here for a full session. This is the single,
  // canonical login-completion path for 2FA (replaces the legacy verify-login route).
  verifyTwoFactorLogin: asyncHandler(async (req: Request, res: Response) => {
    const { tempToken, code } = req.body;

    if (!tempToken || !code) {
      throw Errors.badRequest('Temporary token and 2FA code are required');
    }

    let payload: { userId?: string; pending2FA?: boolean };
    try {
      payload = jwt.verify(tempToken, config.jwt.secret) as typeof payload;
    } catch {
      throw Errors.unauthorized('Invalid or expired temporary token');
    }

    if (!payload.userId || payload.pending2FA !== true) {
      throw Errors.unauthorized('Invalid temporary token');
    }

    const userId = payload.userId;

    const result = await twoFactorService.verify2FA(userId, code);
    if (!result.valid) {
      throw Errors.unauthorized('Invalid two-factor code');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw Errors.notFound('User');
    }

    const account = await prisma.account.findFirst({ where: { userId } });
    const token = signAccessToken({ userId });
    const refreshToken = signRefreshToken({ userId });

    await prisma.session.create({
      data: { userId, refreshToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    setAuthCookies(res, token, refreshToken);

    if (result.usedBackupCode) {
      const remainingCodes = await twoFactorService.getBackupCodesCount(userId);
      logger.info(`2FA login via backup code for user ${userId} (${remainingCodes} remaining)`);
    }

    res.json({
      user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
      account,
      token,
      refreshToken,
      ...(result.usedBackupCode
        ? { warning: `Backup code used. ${await twoFactorService.getBackupCodesCount(userId)} codes remaining.` }
        : {}),
    });
  }),

  // Resend 2FA - for TOTP this provides guidance since codes are generated by the app
  resendTwoFactor: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });

    if (!user?.twoFactorEnabled) {
      throw Errors.badRequest('2FA is not enabled for this account');
    }

    // TOTP codes are generated by the authenticator app
    // We can't resend them, but we can provide guidance
    res.json({
      message: 'Open your authenticator app to get the current code',
      note: 'Codes refresh every 30 seconds. If you lost access to your authenticator, use a backup code.',
      support: 'If you cannot access your account, contact support@gitgram.app',
    });
  })
};
