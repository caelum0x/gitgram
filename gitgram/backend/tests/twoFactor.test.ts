import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../src/index';
import prisma from '../src/utils/prisma';
import { createTokens } from '../src/services/tokenService';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';

describe('Two-Factor Authentication API', () => {
  let app: Express;
  let authToken: string;
  let userId: string;
  let userEmail: string;
  let userPassword: string;

  beforeAll(async () => {
    app = createApp();
    userEmail = `2fa-test-${Date.now()}@example.com`;
    userPassword = 'TestPassword123!';

    // Create a test user with a proper hashed password
    const hashedPassword = await bcrypt.hash(userPassword, 10);
    const user = await prisma.user.create({
      data: {
        username: `twofa_test_${Date.now()}`,
        email: userEmail,
        password: hashedPassword,
      },
    });
    userId = user.id;
    const tokens = await createTokens(user.id);
    authToken = tokens.accessToken;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.twoFactorAuth.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  describe('GET /api/v1/auth/2fa/status', () => {
    beforeEach(async () => {
      // Reset 2FA state before each test
      await prisma.twoFactorAuth.deleteMany({ where: { userId } });
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
    });

    it('should return 2FA disabled for new user', async () => {
      const response = await request(app)
        .get('/api/v1/auth/2fa/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('enabled');
      expect(response.body.enabled).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/auth/2fa/status');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/2fa/setup', () => {
    beforeEach(async () => {
      // Reset 2FA state before each test
      await prisma.twoFactorAuth.deleteMany({ where: { userId } });
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
    });

    it('should generate QR code and secret for 2FA setup', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('qrCode');
      expect(response.body).toHaveProperty('secret');
      expect(response.body).toHaveProperty('backupCodes');
      expect(response.body.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(response.body.secret).toBeTruthy();
      expect(Array.isArray(response.body.backupCodes)).toBe(true);
      expect(response.body.backupCodes.length).toBe(10);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/setup');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/2fa/setup/verify', () => {
    let secret: string;

    beforeEach(async () => {
      // Reset 2FA state
      await prisma.twoFactorAuth.deleteMany({ where: { userId } });
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });

      // Setup 2FA first to get the secret
      const setupResponse = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${authToken}`);

      secret = setupResponse.body.secret;
    });

    it('should enable 2FA with valid token', async () => {
      // Generate a valid TOTP token
      const token = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      const response = await request(app)
        .post('/api/v1/auth/2fa/setup/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token, secret });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('enabled');

      // Verify 2FA is now enabled
      const statusResponse = await request(app)
        .get('/api/v1/auth/2fa/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.body.enabled).toBe(true);
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/setup/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: '000000', secret });

      expect(response.status).toBe(400);
    });

    it('should require token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/setup/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ secret });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/2fa/setup/verify')
        .send({ token: '123456', secret });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/verify-2fa', () => {
    let twoFactorSecret: string;

    beforeAll(async () => {
      // Enable 2FA for verification tests
      const setupResponse = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${authToken}`);

      twoFactorSecret = setupResponse.body.secret;

      const token = speakeasy.totp({
        secret: twoFactorSecret,
        encoding: 'base32',
      });

      await request(app)
        .post('/api/v1/auth/2fa/setup/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token, secret: twoFactorSecret });
    });

    it('should verify valid 2FA code', async () => {
      const code = speakeasy.totp({
        secret: twoFactorSecret,
        encoding: 'base32',
      });

      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('verified', true);
    });

    it('should reject invalid 2FA code', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: '000000' });

      expect(response.status).toBe(400);
    });

    it('should require code', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('Backup Codes', () => {
    let backupCodes: string[];
    let twoFactorSecret: string;

    beforeAll(async () => {
      // Disable any existing 2FA first
      await prisma.twoFactorAuth.deleteMany({ where: { userId } });
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });

      // Enable 2FA fresh
      const setupResponse = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${authToken}`);

      twoFactorSecret = setupResponse.body.secret;
      backupCodes = setupResponse.body.backupCodes;

      const token = speakeasy.totp({
        secret: twoFactorSecret,
        encoding: 'base32',
      });

      await request(app)
        .post('/api/v1/auth/2fa/setup/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token, secret: twoFactorSecret });
    });

    it('should accept valid backup code', async () => {
      // Use first backup code
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: backupCodes[0] });

      expect(response.status).toBe(200);
      expect(response.body.verified).toBe(true);
      // Backup code usage may trigger a warning
      if (response.body.warning) {
        expect(response.body.warning).toContain('Backup code used');
      }
    });

    it('should not accept used backup code twice', async () => {
      // Try to use the same code again (should fail)
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: backupCodes[0] });

      expect(response.status).toBe(400);
    });

    it('should reject invalid backup code', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify-2fa')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ code: 'INVALIDCODE' });

      expect(response.status).toBe(400);
    });
  });

  describe('2FA Disable Flow', () => {
    let twoFactorSecret: string;

    beforeAll(async () => {
      // Ensure 2FA is enabled
      await prisma.twoFactorAuth.deleteMany({ where: { userId } });
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });

      const setupResponse = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${authToken}`);

      twoFactorSecret = setupResponse.body.secret;

      const token = speakeasy.totp({
        secret: twoFactorSecret,
        encoding: 'base32',
      });

      await request(app)
        .post('/api/v1/auth/2fa/setup/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token, secret: twoFactorSecret });
    });

    it('should require password to disable 2FA', async () => {
      const token = speakeasy.totp({
        secret: twoFactorSecret,
        encoding: 'base32',
      });

      const response = await request(app)
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token });

      expect(response.status).toBe(400);
    });

    it('should reject invalid password when disabling 2FA', async () => {
      const token = speakeasy.totp({
        secret: twoFactorSecret,
        encoding: 'base32',
      });

      const response = await request(app)
        .post('/api/v1/auth/2fa/disable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ password: 'wrongpassword', token });

      expect(response.status).toBe(401);
    });
  });
});
