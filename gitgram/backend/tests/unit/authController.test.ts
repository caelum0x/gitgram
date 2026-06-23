/**
 * Unit tests for authController.ts
 *
 * All external dependencies (Prisma, bcrypt, email, oauthService,
 * twoFactorService) are mocked so tests run purely in-memory.
 *
 * Framework: Jest (ts-jest) — same runner used across the backend.
 */

// ---------------------------------------------------------------------------
// Module-level mocks — declared before any imports that load the module
// ---------------------------------------------------------------------------

jest.mock('../../src/services/oauthService', () => ({
  authenticateWithGitHub: jest.fn(),
  authenticateWithGoogle: jest.fn(),
}));

jest.mock('../../src/services/twoFactorService', () => ({
  setup2FA: jest.fn(),
  verify2FA: jest.fn(),
  verifyAndEnable2FA: jest.fn(),
  disable2FA: jest.fn(),
  regenerateBackupCodes: jest.fn(),
}));

jest.mock('../../src/services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/index';
import { mockPrisma } from '../setup';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as oauthService from '../../src/services/oauthService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-secret-key-for-testing-at-least-32-chars';
const JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing';

function makeToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

function makeRefreshToken(userId: string): string {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

let app: Express;

beforeAll(() => {
  app = createApp();
});

function clearModel(modelName: string): void {
  (mockPrisma as any)[modelName].__rows.length = 0;
}

function clearAuthModels(): void {
  ['user', 'account', 'session', 'emailVerificationToken', 'passwordResetToken'].forEach(clearModel);
}

async function seedUserWithPassword(
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; email: string; password: string; username: string }> {
  const raw = 'Password123!';
  const hashed = await bcrypt.hash(raw, 10);
  const user = {
    id: `user-${Date.now()}-${Math.random()}`,
    username: 'testuser',
    email: 'test@example.com',
    password: hashed,
    emailVerified: true,
    suspended: false,
    twoFactorEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  mockPrisma.user.__rows.push(user);
  return { ...user, password: raw };
}

function seedAccount(userId: string, username: string = 'testuser') {
  const account = {
    id: `acc-${Date.now()}`,
    type: 'USER',
    username,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockPrisma.account.__rows.push(account);
  return account;
}

function seedSession(userId: string, refreshToken: string) {
  const session = {
    id: `sess-${Date.now()}`,
    userId,
    refreshToken,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockPrisma.session.__rows.push(session);
  return session;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/register — register', () => {
  beforeEach(() => {
    clearAuthModels();
    jest.clearAllMocks();
  });

  it('registers a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'newuser', email: 'new@example.com', password: 'Password123!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('new@example.com');
    expect(res.body.user.emailVerified).toBe(false);
  });

  it('returns 400 when email is already registered', async () => {
    await seedUserWithPassword({ email: 'dup@example.com', username: 'dupuser' });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'othername', email: 'dup@example.com', password: 'Password123!' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/already exists/i);
  });

  it('returns 400 when username is already taken', async () => {
    // First user takes the username via account
    await seedUserWithPassword({ username: 'taken', email: 'first@example.com' });
    seedAccount('some-id', 'taken');

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'taken', email: 'second@example.com', password: 'Password123!' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/username/i);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/login — login', () => {
  beforeEach(() => {
    clearAuthModels();
    jest.clearAllMocks();
  });

  it('logs in successfully with correct credentials', async () => {
    const user = await seedUserWithPassword({ email: 'login@example.com', username: 'loginuser' });
    seedAccount(user.id, 'loginuser');

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@example.com', password: user.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('returns 401 when password is wrong', async () => {
    await seedUserWithPassword({ email: 'wrong@example.com', username: 'wrongpw' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'wrong@example.com', password: 'WrongPassword99!' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when user is not found', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.com', password: 'SomePassword1!' });

    expect(res.status).toBe(401);
  });

  it('requires 2FA code when 2FA is enabled — returns challenge', async () => {
    const user = await seedUserWithPassword({ email: '2fa@example.com', username: 'twofa', twoFactorEnabled: true });
    seedAccount(user.id, 'twofa');
    // Seed 2FA record
    mockPrisma.twoFactorAuth.__rows.push({
      id: '2fa-rec',
      userId: user.id,
      enabled: true,
      secret: 'TOPSECRET',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: '2fa@example.com', password: user.password });

    expect(res.status).toBe(200);
    expect(res.body.requires2FA).toBe(true);
    expect(res.body).toHaveProperty('tempToken');
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/logout — logout', () => {
  beforeEach(() => {
    clearAuthModels();
    jest.clearAllMocks();
  });

  it('logs out and deletes the session', async () => {
    const user = await seedUserWithPassword({ email: 'logout@example.com', username: 'logoutuser' });
    const refreshToken = makeRefreshToken(user.id);
    seedSession(user.id, refreshToken);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
    const sessions = mockPrisma.session.__rows.filter((s: any) => s.refreshToken === refreshToken);
    expect(sessions).toHaveLength(0);
  });

  it('succeeds even without a refresh token body', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/refresh — refreshAccessToken', () => {
  beforeEach(() => {
    clearAuthModels();
    jest.clearAllMocks();
  });

  it('issues a new access token for a valid refresh token', async () => {
    const user = await seedUserWithPassword({ email: 'refresh@example.com', username: 'refreshuser' });
    const refreshToken = makeRefreshToken(user.id);
    seedSession(user.id, refreshToken);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('returns 401 when refresh token is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});

    expect(res.status).toBe(401);
  });

  it('returns 401 when refresh token is not found in DB', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-in-db-token' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when session is expired', async () => {
    const user = await seedUserWithPassword({ email: 'expired@example.com', username: 'expireduser' });
    const refreshToken = makeRefreshToken(user.id);
    // Seed an expired session
    mockPrisma.session.__rows.push({
      id: 'expired-sess',
      userId: user.id,
      refreshToken,
      expiresAt: new Date(Date.now() - 1000), // already expired
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/github — githubAuth (OAuth callback)', () => {
  beforeEach(() => {
    clearAuthModels();
    jest.clearAllMocks();
  });

  it('authenticates an existing user via GitHub OAuth code', async () => {
    const mockResult = {
      user: { id: 'gh-user-1', email: 'gh@example.com', username: 'ghuser' },
      account: { id: 'gh-acc-1', username: 'ghuser' },
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      isNewUser: false,
    };
    (oauthService.authenticateWithGitHub as jest.Mock).mockResolvedValueOnce(mockResult);

    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({ code: 'valid-github-code' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('gh@example.com');
    expect(res.body.isNewUser).toBe(false);
    expect(res.body.accessToken).toBe('mock-access-token');
  });

  it('creates a new account for first-time GitHub users', async () => {
    const mockResult = {
      user: { id: 'gh-new-1', email: 'ghnew@example.com', username: 'ghnew' },
      account: { id: 'gh-acc-new', username: 'ghnew' },
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      isNewUser: true,
    };
    (oauthService.authenticateWithGitHub as jest.Mock).mockResolvedValueOnce(mockResult);

    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({ code: 'first-time-code' });

    expect(res.status).toBe(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.message).toMatch(/created/i);
  });

  it('returns 400 when GitHub code is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({});

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/code/i);
  });

  it('returns 400 when GitHub email is not public', async () => {
    (oauthService.authenticateWithGitHub as jest.Mock).mockRejectedValueOnce(
      new Error('Email not available from GitHub'),
    );

    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({ code: 'no-email-code' });

    expect(res.status).toBe(400);
  });

  it('returns 503 when GitHub OAuth is not configured', async () => {
    (oauthService.authenticateWithGitHub as jest.Mock).mockRejectedValueOnce(
      new Error('GitHub OAuth not configured'),
    );

    const res = await request(app)
      .post('/api/v1/auth/github')
      .send({ code: 'any-code' });

    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/forgot-password — forgotPassword', () => {
  beforeEach(() => {
    clearAuthModels();
    jest.clearAllMocks();
  });

  it('returns success message when email exists (does not expose existence)', async () => {
    await seedUserWithPassword({ email: 'forgot@example.com', username: 'forgotuser' });

    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'forgot@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
  });

  it('returns same success message when email does not exist (prevents enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
  });

  it('returns 400 when email field is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/reset-password — resetPassword', () => {
  beforeEach(() => {
    clearAuthModels();
    jest.clearAllMocks();
  });

  it('resets password successfully with a valid token', async () => {
    const user = await seedUserWithPassword({ email: 'reset@example.com', username: 'resetuser' });
    const resetToken = {
      id: 'rt-1',
      userId: user.id,
      token: 'valid-reset-token',
      used: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockPrisma.passwordResetToken.__rows.push(resetToken);

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'valid-reset-token', password: 'NewPassword99!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset successfully/i);
  });

  it('returns 400 when the reset token is invalid or already used', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'expired-or-fake-token', password: 'NewPassword99!' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'some-token', password: 'short' });

    expect(res.status).toBe(400);
  });
});
