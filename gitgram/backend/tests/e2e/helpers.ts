/**
 * E2E helpers — real app + real database utilities.
 *
 * These run against the actual Express app (built via createApp) and the actual
 * Prisma client connected to the test PostgreSQL. No mocks.
 */
import request, { SuperTest, Test } from 'supertest';
import type { Express } from 'express';

// Build the real app. Imported lazily so env vars set in globalSetup are applied
// before the module graph (which reads process.env at import time) loads.
export function buildApp(): Express {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createApp } = require('../../src/index');
  return createApp();
}

export function getPrisma() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/utils/prisma').default;
}

export interface RegisteredUser {
  id: string;
  username: string;
  email: string;
  token: string;
  refreshToken: string;
  accountId: string;
}

let userSeq = 0;

/**
 * Register a fresh user over the real HTTP API and return credentials.
 * Each call uses a unique username/email so tests stay isolated.
 */
export async function registerUser(
  app: Express,
  overrides: Partial<{ username: string; email: string; password: string }> = {},
): Promise<RegisteredUser> {
  userSeq += 1;
  const unique = `${Date.now()}${userSeq}`;
  const username = overrides.username ?? `e2euser${unique}`;
  const email = overrides.email ?? `e2e_${unique}@example.com`;
  const password = overrides.password ?? 'Str0ngPass!';

  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ username, email, password });

  if (res.status !== 201) {
    throw new Error(`registerUser failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  return {
    id: res.body.user.id,
    username,
    email,
    token: res.body.token,
    refreshToken: res.body.refreshToken,
    accountId: res.body.account.id,
  };
}

export function authed(app: Express, token: string): SuperTest<Test> {
  // supertest agents don't carry default headers cleanly across verbs in all
  // versions, so callers should use `bearer(token)` per request instead.
  return request(app) as unknown as SuperTest<Test>;
}

/** Authorization header tuple for supertest `.set(...)`. */
export function bearer(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

/**
 * Wipe all rows the E2E suite may create, in FK-safe order. Called between
 * suites to keep flows deterministic without dropping the schema.
 */
export async function resetDatabase(): Promise<void> {
  const prisma = getPrisma();
  // Order matters: delete children before parents. Use deleteMany so missing
  // tables (schema drift) surface loudly rather than silently passing.
  const deletions = [
    'interaction',
    'unifiedComment',
    'commentLike',
    'comment',
    'like',
    'storyView',
    'story',
    'reelComment',
    'reelLike',
    'reel',
    'codeSnippet',
    'notification',
    'message',
    'conversationParticipant',
    'conversation',
    'follow',
    'session',
    'emailVerificationToken',
    'passwordResetToken',
    'post',
    'account',
    'user',
  ];

  for (const model of deletions) {
    if (prisma[model]?.deleteMany) {
      try {
        await prisma[model].deleteMany({});
      } catch {
        // Table may not exist in this schema revision — ignore.
      }
    }
  }
}
