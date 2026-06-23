/**
 * Test data constants used across E2E tests.
 *
 * In a real CI environment these would come from environment variables or
 * a seeded test database. The values here are safe defaults for local dev.
 */

/** Unique suffix to avoid collisions between parallel test runs */
const RUN_ID = Date.now().toString(36)

export const TEST_USER = {
  username: `testuser_${RUN_ID}`,
  email: `testuser_${RUN_ID}@gitgram-e2e.test`,
  password: 'Test1234!@#$',
  fullName: 'E2E Test User',
} as const

export const TEST_USER_LOGIN = {
  /** Pre-seeded user for login tests (must exist in the test database) */
  email: process.env.E2E_USER_EMAIL || 'e2e@gitgram.test',
  password: process.env.E2E_USER_PASSWORD || 'TestPassword123!',
} as const

export const TEST_POST = {
  content: `E2E test post ${RUN_ID} -- Hello from Playwright!`,
  comment: `E2E test comment ${RUN_ID}`,
} as const

export const TEST_SEARCH = {
  userQuery: 'testuser',
  repoQuery: 'react',
  postQuery: 'hello',
  hashtagQuery: '#javascript',
} as const

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
