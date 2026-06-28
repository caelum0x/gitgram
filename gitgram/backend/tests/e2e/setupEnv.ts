/**
 * Per-worker E2E env setup.
 *
 * globalSetup runs in a separate process, so env vars it sets do not reach the
 * Jest worker processes that import the app. This file runs inside each worker
 * (via `setupFiles`) before the module graph loads, ensuring the app sees the
 * correct test configuration.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'e2e-test-secret-key-at-least-32-characters-long-x';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'e2e-test-refresh-secret-key-at-least-32-chars-x';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
process.env.AI_ANALYSIS_ENABLED = process.env.AI_ANALYSIS_ENABLED || 'false';
process.env.DISABLE_RATE_LIMIT = 'true';
delete process.env.SENTRY_DSN;
