/**
 * E2E global setup.
 *
 * Runs ONCE before the entire E2E suite. Validates that a real database is
 * configured, then applies the Prisma schema so tables exist. Redis is optional
 * (the app degrades to in-memory cache when REDIS_URL is absent), but when
 * provided the background-job and cache paths are exercised too.
 *
 * Fails fast with a clear message if DATABASE_URL is not pointed at a real,
 * reachable Postgres — these tests intentionally do NOT mock the datastore.
 */
import { execSync } from 'child_process';
import path from 'path';

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

function ensureTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'e2e-test-secret-key-at-least-32-characters-long-x';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET || 'e2e-test-refresh-secret-key-at-least-32-chars-x';
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  // Keep external integrations disabled/no-op during E2E so flows are deterministic.
  process.env.AI_ANALYSIS_ENABLED = process.env.AI_ANALYSIS_ENABLED || 'false';
  // Disable rate limiting so the suite can fire many requests in quick succession.
  process.env.DISABLE_RATE_LIMIT = 'true';
  delete process.env.SENTRY_DSN;
}

function assertDatabaseConfigured(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'E2E setup: DATABASE_URL is not set. The E2E suite requires a real PostgreSQL ' +
        'instance. Start one with `docker compose -f docker-compose.test.yml up -d` and ' +
        'export DATABASE_URL=postgresql://gitgram_test:gitgram_test@localhost:5433/gitgram_test',
    );
  }
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new Error(`E2E setup: DATABASE_URL must be a PostgreSQL connection string, got: ${url}`);
  }
}

export default async function globalSetup(): Promise<void> {
  ensureTestEnv();
  assertDatabaseConfigured();

  // Push the Prisma schema to the (ephemeral) test database. `db push` is used
  // instead of `migrate deploy` so the suite works against a fresh empty DB
  // without requiring a full migration history to be present.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}
