import request from 'supertest';
import { Express } from 'express';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/index';
import { mockPrisma } from './setup';
import { testFixtures } from './fixtures';
import {
  generateTestAccessToken,
  generateTestRefreshToken,
  generateExpiredToken,
  authHeader,
  TEST_USER_ID,
} from './helpers';

// ---------------------------------------------------------------------------
// Mock services that the auth controller calls but are NOT mocked in setup.ts
// ---------------------------------------------------------------------------

jest.mock('../src/services/oauthService', () => ({
  authenticateWithGitHub: jest.fn(),
  authenticateWithGoogle: jest.fn(),
}));

jest.mock('../src/services/twoFactorService', () => ({
  setup2FA: jest.fn(),
  verifyAndEnable2FA: jest.fn(),
  verify2FA: jest.fn().mockResolvedValue({ valid: false }),
  disable2FA: jest.fn(),
  regenerateBackupCodes: jest.fn(),
  is2FAEnabled: jest.fn().mockResolvedValue(false),
  getBackupCodesCount: jest.fn().mockResolvedValue(0),
}));

jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

// Pull mocked modules so we can configure per-test return values
import * as oauthService from '../src/services/oauthService';

const mockedOauth = oauthService as jest.Mocked<typeof oauthService>;

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

let app: Express;

beforeAll(() => {
  app = createApp();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hash a password with bcrypt so the controller's bcrypt.compare succeeds. */
const hashPassword = (plain: string) => bcrypt.hashSync(plain, 10);

/**
 * Build a full Prisma-shaped user record with a real bcrypt hash so login
 * tests pass password comparison.
 */
const prismaUserWithPassword = (plainPassword: string, overrides: Record<string, any> = {}) =>
  testFixtures.createPrismaUser({
    password: hashPassword(plainPassword),
    ...overrides,
  });

// ============================================================================
// POST /api/v1/auth/register
// ============================================================================

describe('POST /api/v1/auth/register', () => {
  it('should register a new user successfully', async () => {
    // No existing user with this email or username
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.account.findUnique.mockResolvedValue(null);
    // create returns the new user
    mockPrisma.user.create.mockResolvedValue(
      testFixtures.createPrismaUser({ id: 'new-user-id', email: 'new@example.com', username: 'newuser' }),
    );
    mockPrisma.account.create.mockResolvedValue({ id: 'acc-1', type: 'USER', username: 'newuser', userId: 'new-user-id' });
    mockPrisma.emailVerificationToken.create.mockResolvedValue({ id: 'evt-1' });
    mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'newuser', email: 'new@example.com', password: 'StrongPass1!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('new@example.com');
    expect(mockPrisma.user.create).toHaveBeenCalled();
    expect(mockPrisma.session.create).toHaveBeenCalled();
  });

  it('should reject registration when the email is already taken', async () => {
    // Simulate an existing user with this email
    mockPrisma.user.findUnique.mockResolvedValue(
      testFixtures.createPrismaUser({ email: 'taken@example.com' }),
    );

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'uniqueuser', email: 'taken@example.com', password: 'StrongPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should reject registration when the username is already taken', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null); // email is free
    mockPrisma.account.findUnique.mockResolvedValue({ id: 'existing-acc', username: 'takenuser' }); // username taken

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'takenuser', email: 'fresh@example.com', password: 'StrongPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should reject an invalid email address', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'validuser', email: 'not-an-email', password: 'StrongPass1!' });

    expect(res.status).toBe(400);
  });

  it('should reject a weak password (too short)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'validuser', email: 'valid@example.com', password: 'Ab1' });

    expect(res.status).toBe(400);
  });

  it('should reject a password without uppercase letter', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'validuser', email: 'valid@example.com', password: 'weakpassword1' });

    expect(res.status).toBe(400);
  });

  it('should reject a password without a digit', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'validuser', email: 'valid@example.com', password: 'NoDigitsHere!' });

    expect(res.status).toBe(400);
  });

  it('should reject when username is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'valid@example.com', password: 'StrongPass1!' });

    expect(res.status).toBe(400);
  });

  it('should reject when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'validuser', password: 'StrongPass1!' });

    expect(res.status).toBe(400);
  });

  it('should reject when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'validuser', email: 'valid@example.com' });

    expect(res.status).toBe(400);
  });

  it('should reject a username shorter than 3 characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'ab', email: 'valid@example.com', password: 'StrongPass1!' });

    expect(res.status).toBe(400);
  });

  it('should reject a username with special characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'inv@lid!', email: 'valid@example.com', password: 'StrongPass1!' });

    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST /api/v1/auth/login
// ============================================================================

describe('POST /api/v1/auth/login', () => {
  const VALID_PASSWORD = 'CorrectPass1!';

  it('should login successfully with valid credentials', async () => {
    const user = prismaUserWithPassword(VALID_PASSWORD, { id: TEST_USER_ID });
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.twoFactorAuth.findUnique.mockResolvedValue(null); // no 2FA
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', type: 'USER', username: 'testuser', userId: TEST_USER_ID });
    mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.id).toBe(TEST_USER_ID);
  });

  it('should reject login with wrong password', async () => {
    const user = prismaUserWithPassword(VALID_PASSWORD);
    mockPrisma.user.findUnique.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('should reject login for a non-existent user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'Whatever1!' });

    expect(res.status).toBe(401);
  });

  it('should reject login when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'StrongPass1!' });

    expect(res.status).toBe(400);
  });

  it('should reject login when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
  });

  it('should reject login with invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'StrongPass1!' });

    expect(res.status).toBe(400);
  });

  it('should return 2FA challenge when 2FA is enabled and no code is provided', async () => {
    const user = prismaUserWithPassword(VALID_PASSWORD);
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.twoFactorAuth.findUnique.mockResolvedValue({ id: '2fa-1', userId: TEST_USER_ID, enabled: true });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.requires2FA).toBe(true);
    expect(res.body).toHaveProperty('tempToken');
    // Should NOT have a full access token
    expect(res.body.token).toBeUndefined();
  });
});

// ============================================================================
// POST /api/v1/auth/refresh
// ============================================================================

describe('POST /api/v1/auth/refresh', () => {
  it('should issue a new access token with a valid refresh token', async () => {
    const refreshToken = generateTestRefreshToken(TEST_USER_ID);
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: TEST_USER_ID,
      refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('should reject when no refresh token is provided', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});

    expect(res.status).toBe(401);
  });

  it('should reject an invalid (unknown) refresh token', async () => {
    mockPrisma.session.findUnique.mockResolvedValue(null); // no matching session

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'completely-invalid-token' });

    expect(res.status).toBe(401);
  });

  it('should reject an expired session refresh token', async () => {
    const refreshToken = generateTestRefreshToken(TEST_USER_ID);
    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'sess-expired',
      userId: TEST_USER_ID,
      refreshToken,
      expiresAt: new Date(Date.now() - 1000), // already expired
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });
});

// ============================================================================
// POST /api/v1/auth/logout
// ============================================================================

describe('POST /api/v1/auth/logout', () => {
  it('should logout successfully when authenticated', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);
    mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', authHeader(token))
      .send({ refreshToken: 'some-refresh-token' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
    expect(mockPrisma.session.deleteMany).toHaveBeenCalled();
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({});

    expect(res.status).toBe(401);
  });

  it('should logout even without providing a refresh token body', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', authHeader(token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });
});

// ============================================================================
// GET /api/v1/auth/me
// ============================================================================

describe('GET /api/v1/auth/me', () => {
  it('should return the current user when authenticated', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);
    const prismaUser = testFixtures.createPrismaUser({ id: TEST_USER_ID });
    mockPrisma.user.findUnique.mockResolvedValue(prismaUser);
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', type: 'USER', username: 'testuser', userId: TEST_USER_ID });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.id).toBe(TEST_USER_ID);
    expect(res.body).toHaveProperty('account');
  });

  it('should return 401 when no token is provided', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
  });

  it('should return 401 with an expired token', async () => {
    const expiredToken = generateExpiredToken(TEST_USER_ID);

    // Small delay so the 0s token definitely expires
    await new Promise((r) => setTimeout(r, 50));

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authHeader(expiredToken));

    expect(res.status).toBe(401);
  });

  it('should return 401 with a malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not.a.valid.jwt');

    expect(res.status).toBe(401);
  });
});

// ============================================================================
// POST /api/v1/auth/forgot-password  (password reset request)
// ============================================================================

describe('POST /api/v1/auth/forgot-password', () => {
  it('should return success message when user exists', async () => {
    const user = testFixtures.createPrismaUser({ email: 'forgot@example.com' });
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'forgot@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password reset link/i);
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalled();
  });

  it('should return the same success message when user does NOT exist (no email enumeration)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password reset link/i);
    // No token should be created for a non-existent user
    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('should reject when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should reject an invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'bad-format' });

    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST /api/v1/auth/reset-password
// ============================================================================

describe('POST /api/v1/auth/reset-password', () => {
  it('should reset the password with a valid token', async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue({
      id: 'prt-1',
      userId: TEST_USER_ID,
      token: 'valid-token-hex',
      used: false,
      expiresAt: new Date(Date.now() + 3600000),
    });
    // $transaction mock resolves the array of promises
    mockPrisma.$transaction.mockResolvedValue([{}, {}, {}]);

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'valid-token-hex', password: 'NewStrong1!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password has been reset/i);
  });

  it('should reject with an invalid or expired token', async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'expired-token', password: 'NewStrong1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should reject when token is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ password: 'NewStrong1!' });

    expect(res.status).toBe(400);
  });

  it('should reject when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'some-token' });

    expect(res.status).toBe(400);
  });

  it('should reject a new password that is too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'some-token', password: 'Ab1' });

    expect(res.status).toBe(400);
  });

  it('should reject a new password missing uppercase/lowercase/digit', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'some-token', password: 'alllowercase' });

    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST /api/v1/auth/change-password
// ============================================================================

describe('POST /api/v1/auth/change-password', () => {
  const CURRENT_PASSWORD = 'OldPassword1!';
  const NEW_PASSWORD = 'BrandNew1!';

  it('should change the password when the current password is correct', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);
    const user = prismaUserWithPassword(CURRENT_PASSWORD, { id: TEST_USER_ID });
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.user.update.mockResolvedValue({ ...user, password: 'newhash' });

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', authHeader(token))
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password changed/i);
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });

  it('should reject when the current password is wrong', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);
    const user = prismaUserWithPassword(CURRENT_PASSWORD, { id: TEST_USER_ID });
    mockPrisma.user.findUnique.mockResolvedValue(user);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', authHeader(token))
      .send({ currentPassword: 'WrongOldPass1!', newPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('should reject when not authenticated', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('should reject when currentPassword field is missing', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', authHeader(token))
      .send({ newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('should reject when newPassword field is missing', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', authHeader(token))
      .send({ currentPassword: CURRENT_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('should reject a new password that is too short', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', authHeader(token))
      .send({ currentPassword: CURRENT_PASSWORD, newPassword: 'Ab1' });

    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST /api/v1/auth/github  (GitHub OAuth)
// ============================================================================

describe('POST /api/v1/auth/github', () => {
  it('should authenticate successfully with a valid GitHub code', async () => {
    const oauthResult = {
      user: { id: 'gh-user-1', email: 'ghuser@github.com', username: 'ghuser', avatar: null, githubUsername: 'ghuser' },
      account: { id: 'acc-gh-1', type: 'USER', username: 'ghuser', userId: 'gh-user-1' },
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      isNewUser: true,
    };
    mockedOauth.authenticateWithGitHub.mockResolvedValue(oauthResult);

    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({ code: 'valid-github-auth-code' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('user');
    expect(res.body.isNewUser).toBe(true);
    expect(mockedOauth.authenticateWithGitHub).toHaveBeenCalledWith('valid-github-auth-code');
  });

  it('should return existing-user response when GitHub account is already linked', async () => {
    const oauthResult = {
      user: { id: 'gh-user-existing', email: 'existing@github.com', username: 'existinguser', avatar: null, githubUsername: 'existinguser' },
      account: { id: 'acc-gh-2', type: 'USER', username: 'existinguser', userId: 'gh-user-existing' },
      accessToken: 'mock-access-token-2',
      refreshToken: 'mock-refresh-token-2',
      isNewUser: false,
    };
    mockedOauth.authenticateWithGitHub.mockResolvedValue(oauthResult);

    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({ code: 'returning-user-code' });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
    expect(res.body.message).toMatch(/login successful/i);
  });

  it('should reject when authorization code is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should handle GitHub email-not-available error gracefully', async () => {
    mockedOauth.authenticateWithGitHub.mockRejectedValue(
      new Error('Email not available from GitHub'),
    );

    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({ code: 'code-without-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should handle GitHub-not-configured error with 503', async () => {
    mockedOauth.authenticateWithGitHub.mockRejectedValue(
      new Error('GitHub OAuth not configured'),
    );

    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({ code: 'some-code' });

    expect(res.status).toBe(503);
  });
});

// ============================================================================
// POST /api/v1/auth/google  (Google OAuth)
// ============================================================================

describe('POST /api/v1/auth/google', () => {
  it('should authenticate successfully with a valid Google code', async () => {
    const oauthResult = {
      user: { id: 'g-user-1', email: 'guser@gmail.com', username: 'guser', avatar: null },
      account: { id: 'acc-g-1', type: 'USER', username: 'guser', userId: 'g-user-1' },
      accessToken: 'mock-google-access',
      refreshToken: 'mock-google-refresh',
      isNewUser: true,
    };
    mockedOauth.authenticateWithGoogle.mockResolvedValue(oauthResult);

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ code: 'valid-google-auth-code' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('user');
    expect(res.body.isNewUser).toBe(true);
    expect(mockedOauth.authenticateWithGoogle).toHaveBeenCalledWith('valid-google-auth-code');
  });

  it('should return existing-user response when Google account is already linked', async () => {
    const oauthResult = {
      user: { id: 'g-user-existing', email: 'existing@gmail.com', username: 'existgoogle', avatar: null },
      account: { id: 'acc-g-2', type: 'USER', username: 'existgoogle', userId: 'g-user-existing' },
      accessToken: 'mock-google-access-2',
      refreshToken: 'mock-google-refresh-2',
      isNewUser: false,
    };
    mockedOauth.authenticateWithGoogle.mockResolvedValue(oauthResult);

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ code: 'returning-google-code' });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(false);
    expect(res.body.message).toMatch(/login successful/i);
  });

  it('should reject when authorization code is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should handle Google email-not-verified error gracefully', async () => {
    mockedOauth.authenticateWithGoogle.mockRejectedValue(
      new Error('Email not verified with Google'),
    );

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ code: 'unverified-email-code' });

    expect(res.status).toBe(400);
  });

  it('should handle Google-not-configured error with 503', async () => {
    mockedOauth.authenticateWithGoogle.mockRejectedValue(
      new Error('Google OAuth not configured'),
    );

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ code: 'some-code' });

    expect(res.status).toBe(503);
  });
});

// ============================================================================
// GET /api/v1/auth/verify-email
// ============================================================================

describe('GET /api/v1/auth/verify-email', () => {
  it('should verify email with a valid token', async () => {
    mockPrisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: 'evt-1',
      userId: TEST_USER_ID,
      token: 'valid-verify-token',
      used: false,
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockPrisma.$transaction.mockResolvedValue([{}, {}]);

    const res = await request(app)
      .get('/api/v1/auth/verify-email')
      .query({ token: 'valid-verify-token' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verified/i);
  });

  it('should reject an invalid or expired verification token', async () => {
    mockPrisma.emailVerificationToken.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/auth/verify-email')
      .query({ token: 'expired-token' });

    expect(res.status).toBe(400);
  });

  it('should reject when no token query param is provided', async () => {
    const res = await request(app)
      .get('/api/v1/auth/verify-email');

    expect(res.status).toBe(400);
  });
});

// ============================================================================
// DELETE /api/v1/auth/delete-account
// ============================================================================

describe('DELETE /api/v1/auth/delete-account', () => {
  const PASSWORD = 'DeleteMe1!';

  it('should delete the account when password is correct', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);
    const user = prismaUserWithPassword(PASSWORD, { id: TEST_USER_ID });
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.$transaction.mockResolvedValue([{}, {}, {}]);

    const res = await request(app)
      .delete('/api/v1/auth/delete-account')
      .set('Authorization', authHeader(token))
      .send({ password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('should reject when password is wrong', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);
    const user = prismaUserWithPassword(PASSWORD, { id: TEST_USER_ID });
    mockPrisma.user.findUnique.mockResolvedValue(user);

    const res = await request(app)
      .delete('/api/v1/auth/delete-account')
      .set('Authorization', authHeader(token))
      .send({ password: 'WrongPass1!' });

    expect(res.status).toBe(401);
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/delete-account')
      .send({ password: PASSWORD });

    expect(res.status).toBe(401);
  });

  it('should reject when password body field is missing', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);

    const res = await request(app)
      .delete('/api/v1/auth/delete-account')
      .set('Authorization', authHeader(token))
      .send({});

    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST /api/v1/auth/resend-verification
// ============================================================================

describe('POST /api/v1/auth/resend-verification', () => {
  it('should resend verification email for an unverified user', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);
    mockPrisma.user.findUnique.mockResolvedValue(
      testFixtures.createPrismaUser({ id: TEST_USER_ID, emailVerified: false, email: 'unverified@example.com' }),
    );
    mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.emailVerificationToken.create.mockResolvedValue({ id: 'evt-new' });

    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verification email sent/i);
  });

  it('should reject when email is already verified', async () => {
    const token = generateTestAccessToken(TEST_USER_ID);
    mockPrisma.user.findUnique.mockResolvedValue(
      testFixtures.createPrismaUser({ id: TEST_USER_ID, emailVerified: true }),
    );

    const res = await request(app)
      .post('/api/v1/auth/resend-verification')
      .set('Authorization', authHeader(token));

    expect(res.status).toBe(400);
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app).post('/api/v1/auth/resend-verification');

    expect(res.status).toBe(401);
  });
});

// ============================================================================
// POST /api/v1/auth/recover-account
// ============================================================================

describe('POST /api/v1/auth/recover-account', () => {
  it('should return a success message when the user exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      testFixtures.createPrismaUser({ email: 'recover@example.com' }),
    );

    const res = await request(app)
      .post('/api/v1/auth/recover-account')
      .send({ email: 'recover@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/recovery instructions/i);
  });

  it('should return the same success message when user does not exist (no enumeration)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/recover-account')
      .send({ email: 'nonexistent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/recovery instructions/i);
  });
});
