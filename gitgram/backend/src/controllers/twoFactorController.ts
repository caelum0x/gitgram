import { Request, Response } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import prisma from '../utils/prisma';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Setup 2FA - Generate secret and QR code
 * POST /api/auth/2fa/setup
 */
export const setup2FA = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId;
    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        throw Errors.notFound('User');
    }

    if (user.twoFactorEnabled) {
        throw Errors.badRequest('2FA is already enabled');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
        name: `Gitgram (${user.email})`,
        length: 32,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Store secret temporarily (not enabled yet)
    await prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: secret.base32 },
    });

    res.json({
        secret: secret.base32,
        qrCode: qrCodeUrl,
        message: 'Scan the QR code with your authenticator app',
    });
});

/**
 * Verify and enable 2FA
 * POST /api/auth/2fa/verify
 */
export const verify2FA = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId;
    const { token } = req.body;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    if (!token) {
        throw Errors.badRequest('Token required');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
        throw Errors.badRequest('2FA not set up');
    }

    // Verify token
    const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token,
        window: 2, // Allow 2 time steps before/after
    });

    if (!verified) {
        throw Errors.badRequest('Invalid token');
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
        crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Hash backup codes before storing
    const hashedBackupCodes = backupCodes.map((code) =>
        crypto.createHash('sha256').update(code).digest('hex')
    );

    // Enable 2FA
    await prisma.user.update({
        where: { id: userId },
        data: {
            twoFactorEnabled: true,
            // Store hashed backup codes in a JSON field (you may need to add this to schema)
        },
    });

    res.json({
        message: '2FA enabled successfully',
        backupCodes, // Return plain codes once for user to save
    });
});

/**
 * Disable 2FA
 * POST /api/auth/2fa/disable
 */
export const disable2FA = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId;
    const { password } = req.body;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    if (!password) {
        throw Errors.badRequest('Password required');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        throw Errors.notFound('User');
    }

    // Verify password (you'll need to import bcrypt)
    const bcrypt = require('bcryptjs');
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        throw Errors.unauthorized('Invalid password');
    }

    // Disable 2FA
    await prisma.user.update({
        where: { id: userId },
        data: {
            twoFactorEnabled: false,
            twoFactorSecret: null,
        },
    });

    res.json({ message: '2FA disabled successfully' });
});

/**
 * Verify 2FA token during login
 * POST /api/auth/2fa/verify-login
 */
export const verify2FALogin = asyncHandler(async (req: Request, res: Response) => {
    const { userId, token } = req.body;

    if (!userId || !token) {
        throw Errors.badRequest('User ID and token required');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        throw Errors.badRequest('Invalid request');
    }

    // Verify token
    const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token,
        window: 2,
    });

    if (!verified) {
        throw Errors.badRequest('Invalid token');
    }

    res.json({
        message: 'Token verified',
        verified: true
    });
});

/**
 * Get 2FA status
 * GET /api/auth/2fa/status
 */
export const get2FAStatus = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId;
    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorEnabled: true },
    });

    res.json({
        enabled: user?.twoFactorEnabled || false,
    });
});
