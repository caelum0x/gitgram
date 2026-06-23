import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

/**
 * Generate a valid access token for testing
 */
export function generateTestAccessToken(userId: string, expiresIn: string = '15m'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ userId, type: 'access' }, JWT_SECRET, { expiresIn } as any);
}

/**
 * Generate a valid refresh token for testing
 */
export function generateTestRefreshToken(userId: string, expiresIn: string = '7d'): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ userId, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn } as any);
}

/**
 * Generate both access and refresh tokens
 */
export function generateTestTokens(userId: string) {
  return {
    accessToken: generateTestAccessToken(userId),
    refreshToken: generateTestRefreshToken(userId),
  };
}

/**
 * Generate an expired access token for testing auth failures
 */
export function generateExpiredToken(userId: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign({ userId, type: 'access' }, JWT_SECRET, { expiresIn: '0s' } as any);
}

/**
 * Create auth header value
 */
export function authHeader(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Standard test user IDs
 */
export const TEST_USER_ID = 'test-user-id-001';
export const TEST_USER_ID_2 = 'test-user-id-002';
export const TEST_ADMIN_ID = 'test-admin-id-001';
