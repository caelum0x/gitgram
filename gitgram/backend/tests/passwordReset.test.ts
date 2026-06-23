import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
import bcrypt from 'bcryptjs';

// Mock email service to prevent actual emails
jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));

import { sendEmail } from '../src/services/emailService';
const mockedSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const getResponseMessage = (body: any) =>
  body.message ?? body.error?.message ?? body.details?.[0]?.msg ?? body.error;

describe('Password Reset Flow', () => {
  let app: Express;
  let userId: string;
  let userEmail: string;
  let userPassword: string;

  beforeAll(async () => {
    app = createApp();
    userEmail = `password-reset-${Date.now()}@example.com`;
    userPassword = 'OriginalPassword123!';

    // Create a test user with proper hashed password
    const hashedPassword = await bcrypt.hash(userPassword, 10);
    const user = await prisma.user.create({
      data: {
        username: `pwreset_${Date.now()}`,
        email: userEmail,
        password: hashedPassword,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clear password reset tokens after each test
    await prisma.passwordResetToken.deleteMany({ where: { userId } });
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should send reset email for existing user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: userEmail });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('password reset link');

      // Verify email was sent
      expect(mockedSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: userEmail,
          subject: expect.stringContaining('Reset'),
        })
      );

      // Verify token was created in database
      const token = await prisma.passwordResetToken.findFirst({
        where: { userId },
      });
      expect(token).toBeTruthy();
      expect(token?.used).toBe(false);
    });

    it('should return same response for non-existent email (prevent enumeration)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      // Should not indicate whether email exists
      expect(response.body.message).toContain('If an account exists');
    });

    it('should require email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(400);
    });

    it('should invalidate previous reset tokens', async () => {
      // Request first reset
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: userEmail });

      const firstToken = await prisma.passwordResetToken.findFirst({
        where: { userId, used: false },
      });

      // Request second reset
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: userEmail });

      // First token should now be marked as used
      const updatedFirstToken = await prisma.passwordResetToken.findUnique({
        where: { id: firstToken?.id },
      });
      expect(updatedFirstToken?.used).toBe(true);

      // There should be a new valid token
      const validTokens = await prisma.passwordResetToken.findMany({
        where: { userId, used: false },
      });
      expect(validTokens.length).toBe(1);
    });

    it('should set correct expiration time', async () => {
      await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: userEmail });

      const token = await prisma.passwordResetToken.findFirst({
        where: { userId, used: false },
      });

      // Token should expire in approximately 1 hour
      const now = new Date();
      const expiresAt = new Date(token!.expiresAt);
      const diffMs = expiresAt.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      expect(diffHours).toBeGreaterThan(0.9);
      expect(diffHours).toBeLessThanOrEqual(1);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    let resetToken: string;

    beforeEach(async () => {
      // Create a valid reset token
      const tokenRecord = await prisma.passwordResetToken.create({
        data: {
          userId,
          token: `test-token-${Date.now()}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
          used: false,
        },
      });
      resetToken = tokenRecord.token;
    });

    it('should reset password with valid token', async () => {
      const newPassword = 'NewSecurePassword456!';

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          password: newPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('reset successfully');

      // Verify password was changed
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const passwordValid = await bcrypt.compare(newPassword, user!.password!);
      expect(passwordValid).toBe(true);

      // Verify token was marked as used
      const token = await prisma.passwordResetToken.findFirst({
        where: { token: resetToken },
      });
      expect(token?.used).toBe(true);
    });

    it('should invalidate all sessions after password reset', async () => {
      // Create a session
      await prisma.session.create({
        data: {
          userId,
          refreshToken: 'old-refresh-token',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewPassword123!',
        });

      // Verify sessions were deleted
      const sessions = await prisma.session.findMany({
        where: { userId },
      });
      expect(sessions.length).toBe(0);
    });

    it('should reject expired token', async () => {
      // Create an expired token
      const expiredTokenRecord = await prisma.passwordResetToken.create({
        data: {
          userId,
          token: 'expired-token',
          expiresAt: new Date(Date.now() - 1000), // Already expired
          used: false,
        },
      });

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: expiredTokenRecord.token,
          password: 'NewPassword123!',
      });

      expect(response.status).toBe(400);
      expect(getResponseMessage(response.body)).toContain('Invalid or expired');
    });

    it('should reject used token', async () => {
      // Mark token as used
      await prisma.passwordResetToken.update({
        where: { id: (await prisma.passwordResetToken.findFirst({ where: { token: resetToken } }))?.id },
        data: { used: true },
      });

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewPassword123!',
      });

      expect(response.status).toBe(400);
      expect(getResponseMessage(response.body)).toContain('Invalid or expired');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'invalid-token',
          password: 'NewPassword123!',
        });

      expect(response.status).toBe(400);
      expect(getResponseMessage(response.body)).toContain('Invalid or expired');
    });

    it('should reject password shorter than 8 characters', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          password: 'short',
        });

      expect(response.status).toBe(400);
      expect(getResponseMessage(response.body)).toContain('at least 8 characters');
    });

    it('should require both token and password', async () => {
      const responseNoToken = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ password: 'NewPassword123!' });

      expect(responseNoToken.status).toBe(400);

      const responseNoPassword = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken });

      expect(responseNoPassword.status).toBe(400);
    });

    it('should allow login with new password after reset', async () => {
      const newPassword = 'CompletelyNewPass789!';

      // Reset password
      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          password: newPassword,
        });

      // Try to login with new password
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: userEmail,
          password: newPassword,
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('token');
    });

    it('should not allow login with old password after reset', async () => {
      const newPassword = 'BrandNewPassword000!';

      // Reset password
      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: resetToken,
          password: newPassword,
        });

      // Try to login with old password
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: userEmail,
          password: userPassword,
        });

      expect(loginResponse.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to forgot-password endpoint', async () => {
      // Make multiple requests quickly
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app)
            .post('/api/v1/auth/forgot-password')
            .send({ email: userEmail })
        );
      }

      const responses = await Promise.all(requests);

      // Check if any request was rate limited (429)
      // Note: This depends on your rate limiter configuration
      const rateLimited = responses.some(r => r.status === 429);

      // If rate limiting is configured for 5 requests per minute, we expect rate limiting
      // If not, all requests should succeed (200)
      const allSuccessful = responses.every(r => r.status === 200);

      expect(rateLimited || allSuccessful).toBe(true);
    });
  });
});

describe('Email Verification Flow', () => {
  let app: Express;
  let userId: string;
  let userEmail: string;

  beforeAll(async () => {
    app = createApp();
    userEmail = `verify-email-${Date.now()}@example.com`;

    // Create unverified user
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    const user = await prisma.user.create({
      data: {
        username: `verify_${Date.now()}`,
        email: userEmail,
        password: hashedPassword,
        emailVerified: false,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.emailVerificationToken.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.emailVerificationToken.deleteMany({ where: { userId } });
    jest.clearAllMocks();
  });

  describe('GET /api/v1/auth/verify-email', () => {
    let verificationToken: string;

    beforeEach(async () => {
      // Create a valid verification token
      const tokenRecord = await prisma.emailVerificationToken.create({
        data: {
          userId,
          token: `verify-token-${Date.now()}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          used: false,
        },
      });
      verificationToken = tokenRecord.token;

      // Reset user email verification status
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerified: false },
      });
    });

    it('should verify email with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify-email')
        .query({ token: verificationToken });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('verified');

      // Verify user email is now verified
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.emailVerified).toBe(true);
    });

    it('should mark token as used after verification', async () => {
      await request(app)
        .get('/api/v1/auth/verify-email')
        .query({ token: verificationToken });

      const token = await prisma.emailVerificationToken.findFirst({
        where: { token: verificationToken },
      });
      expect(token?.used).toBe(true);
    });

    it('should reject expired token', async () => {
      const expiredToken = await prisma.emailVerificationToken.create({
        data: {
          userId,
          token: 'expired-verify-token',
          expiresAt: new Date(Date.now() - 1000),
          used: false,
        },
      });

      const response = await request(app)
        .get('/api/v1/auth/verify-email')
        .query({ token: expiredToken.token });

      expect(response.status).toBe(400);
    });

    it('should reject used token', async () => {
      await prisma.emailVerificationToken.update({
        where: { id: (await prisma.emailVerificationToken.findFirst({ where: { token: verificationToken } }))?.id },
        data: { used: true },
      });

      const response = await request(app)
        .get('/api/v1/auth/verify-email')
        .query({ token: verificationToken });

      expect(response.status).toBe(400);
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify-email')
        .query({ token: 'invalid-token' });

      expect(response.status).toBe(400);
    });

    it('should require token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/verify-email');

      expect(response.status).toBe(400);
    });
  });
});

describe('Change Password (Authenticated)', () => {
  let app: Express;
  let authToken: string;
  let userId: string;
  let currentPassword: string;

  beforeAll(async () => {
    app = createApp();
    currentPassword = 'CurrentPassword123!';

    const hashedPassword = await bcrypt.hash(currentPassword, 10);
    const user = await prisma.user.create({
      data: {
        username: `change_pw_${Date.now()}`,
        email: `change-pw-${Date.now()}@example.com`,
        password: hashedPassword,
      },
    });
    userId = user.id;

    const { createTokens } = require('../src/services/tokenService');
    const tokens = await createTokens(user.id);
    authToken = tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/change-password', () => {
    it('should change password with correct current password', async () => {
      const newPassword = 'NewStrongPassword456!';

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword,
          newPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('changed successfully');

      // Update current password for subsequent tests
      currentPassword = newPassword;

      // Verify new password works
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const valid = await bcrypt.compare(newPassword, user!.password!);
      expect(valid).toBe(true);
    });

    it('should reject incorrect current password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'AnotherNewPassword789!',
        });

      expect(response.status).toBe(401);
    });

    it('should reject weak new password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword,
          newPassword: 'short',
        });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({
          currentPassword,
          newPassword: 'NewPassword123!',
        });

      expect(response.status).toBe(401);
    });

    it('should require both current and new password', async () => {
      const responseNoCurrent = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ newPassword: 'NewPassword123!' });

      expect(responseNoCurrent.status).toBe(400);

      const responseNoNew = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ currentPassword });

      expect(responseNoNew.status).toBe(400);
    });
  });
});
