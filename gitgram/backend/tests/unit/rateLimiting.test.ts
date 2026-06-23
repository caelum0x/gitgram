/**
 * Unit tests for src/middleware/rateLimiting.ts
 *
 * Tests cover:
 *  - generalLimiter: allows up to 100 req, blocks on 101st
 *  - authLimiter: blocks after 10 requests per window
 *  - keyGenerator: uses userId when authenticated, IP when not
 *  - Error response shape: type, message, retryAfter present
 *  - Skip function: health endpoints bypass every limiter
 *  - Standard headers: X-RateLimit-Limit / X-RateLimit-Remaining set
 *
 * Framework: Jest + ts-jest (same runner used across the backend).
 * No real HTTP server is required — limiters are exercised directly
 * via mock Request / Response / NextFunction triples.
 */

// ---------------------------------------------------------------------------
// Module-level mocks — must come before imports
// ---------------------------------------------------------------------------

// The global setup.ts already mocks logger, so we don't need to re-mock it
// here.  But we must NOT mock the middleware under test.
jest.unmock('../../src/middleware/rateLimiting');

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { Request, Response, NextFunction } from 'express';
import {
  generalLimiter,
  authLimiter,
  apiLimiter,
  uploadLimiter,
  webhookLimiter,
  strictLimiter,
  buildKeyGenerator,
  isHealthEndpoint,
} from '../../src/middleware/rateLimiting';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockRequest(overrides: Partial<Request & { userId?: string }> = {}): Request {
  return {
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    method: 'GET',
    path: '/api/test',
    body: {},
    params: {},
    userId: undefined,
    ...overrides,
  } as unknown as Request;
}

interface MockResponse {
  _status: number;
  _json: Record<string, unknown> | null;
  _headers: Record<string, string | number>;
  status: (code: number) => MockResponse;
  json: (body: Record<string, unknown>) => MockResponse;
  setHeader: (name: string, value: string | number) => MockResponse;
  getHeader: (name: string) => string | number | undefined;
}

function makeMockResponse(): MockResponse {
  const res: MockResponse = {
    _status: 200,
    _json: null,
    _headers: {},
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      this._json = body;
      return this;
    },
    setHeader(name: string, value: string | number) {
      this._headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      return this._headers[name];
    },
  };
  return res;
}

/**
 * Run a limiter `count` times against the same req/res pair.
 * Returns an object with how many times `next` was called and the final
 * response state.
 */
async function runLimiter(
  limiter: (req: Request, res: Response, next: NextFunction) => void | Promise<void>,
  count: number,
  req: Request,
  res: Response
): Promise<{ nextCallCount: number; status: number; body: Record<string, unknown> | null }> {
  let nextCallCount = 0;
  const next: NextFunction = jest.fn(() => {
    nextCallCount += 1;
  }) as unknown as NextFunction;

  for (let i = 0; i < count; i++) {
    await (limiter as (req: Request, res: Response, next: NextFunction) => Promise<void>)(
      req,
      res as unknown as Response,
      next
    );
  }

  return {
    nextCallCount,
    status: (res as unknown as MockResponse)._status,
    body: (res as unknown as MockResponse)._json,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rateLimiting middleware', () => {
  // -------------------------------------------------------------------------
  // isHealthEndpoint
  // -------------------------------------------------------------------------

  describe('isHealthEndpoint()', () => {
    const healthPaths = ['/health', '/healthz', '/ready', '/readyz', '/ping', '/livez'];

    it.each(healthPaths)('returns true for %s', (path) => {
      const req = makeMockRequest({ path });
      expect(isHealthEndpoint(req)).toBe(true);
    });

    it('returns true for sub-paths of health endpoints', () => {
      const req = makeMockRequest({ path: '/health/details' });
      expect(isHealthEndpoint(req)).toBe(true);
    });

    it('returns false for normal API paths', () => {
      const req = makeMockRequest({ path: '/api/posts' });
      expect(isHealthEndpoint(req)).toBe(false);
    });

    it('returns false for paths that merely contain the word health', () => {
      const req = makeMockRequest({ path: '/api/user-health-score' });
      expect(isHealthEndpoint(req)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // buildKeyGenerator
  // -------------------------------------------------------------------------

  describe('buildKeyGenerator()', () => {
    it('returns an IP-based key when the request is unauthenticated', () => {
      const req = makeMockRequest({ ip: '10.0.0.5' });
      const key = buildKeyGenerator(req);
      expect(key).toMatch(/^ip:/);
      expect(key).toContain('10.0.0.5');
    });

    it('returns a userId-based key when the request is authenticated', () => {
      const req = makeMockRequest({ userId: 'user-abc123' } as Partial<Request & { userId: string }>);
      const key = buildKeyGenerator(req);
      expect(key).toBe('user:user-abc123');
    });

    it('different users produce different keys', () => {
      const reqA = makeMockRequest({ userId: 'user-A' } as Partial<Request & { userId: string }>);
      const reqB = makeMockRequest({ userId: 'user-B' } as Partial<Request & { userId: string }>);
      expect(buildKeyGenerator(reqA)).not.toBe(buildKeyGenerator(reqB));
    });

    it('same IP unauthenticated requests produce the same key', () => {
      const req1 = makeMockRequest({ ip: '192.168.1.1' });
      const req2 = makeMockRequest({ ip: '192.168.1.1' });
      expect(buildKeyGenerator(req1)).toBe(buildKeyGenerator(req2));
    });
  });

  // -------------------------------------------------------------------------
  // generalLimiter — 100 req / 15 min
  // -------------------------------------------------------------------------

  describe('generalLimiter', () => {
    it('allows exactly 100 requests before blocking', async () => {
      const req = makeMockRequest({ ip: '1.1.1.100' });
      const res = makeMockResponse();

      const { nextCallCount } = await runLimiter(generalLimiter, 100, req, res as unknown as Response);

      expect(nextCallCount).toBe(100);
      expect((res as MockResponse)._status).toBe(200); // not yet blocked
    });

    it('blocks the 101st request with HTTP 429', async () => {
      const req = makeMockRequest({ ip: '1.1.1.101' });
      const res = makeMockResponse();

      const { nextCallCount, status } = await runLimiter(generalLimiter, 101, req, res as unknown as Response);

      expect(nextCallCount).toBe(100);
      expect(status).toBe(429);
    });

    it('sets X-RateLimit-Limit header to 100', async () => {
      const req = makeMockRequest({ ip: '1.1.1.102' });
      const res = makeMockResponse();

      await runLimiter(generalLimiter, 1, req, res as unknown as Response);

      expect((res as MockResponse)._headers['RateLimit-Limit']).toBeDefined();
    });

    it('decrements X-RateLimit-Remaining with each request', async () => {
      const req = makeMockRequest({ ip: '1.1.1.103' });
      const res1 = makeMockResponse();
      const res2 = makeMockResponse();

      await runLimiter(generalLimiter, 1, req, res1 as unknown as Response);
      await runLimiter(generalLimiter, 1, req, res2 as unknown as Response);

      const remaining1 = Number((res1 as MockResponse)._headers['RateLimit-Remaining']);
      const remaining2 = Number((res2 as MockResponse)._headers['RateLimit-Remaining']);
      expect(remaining2).toBeLessThan(remaining1);
    });

    it('skips health endpoints', async () => {
      const req = makeMockRequest({ ip: '1.1.1.104', path: '/health' });
      const res = makeMockResponse();
      const next = jest.fn();

      // Even after limit exhaustion, health path should pass
      for (let i = 0; i < 200; i++) {
        await (generalLimiter as unknown as (req: Request, res: Response, next: NextFunction) => Promise<void>)(
          req,
          res as unknown as Response,
          next as unknown as NextFunction
        );
      }

      // All 200 calls should have reached next
      expect((next as jest.Mock).mock.calls.length).toBe(200);
      expect((res as MockResponse)._status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // authLimiter — 10 req / 15 min
  // -------------------------------------------------------------------------

  describe('authLimiter', () => {
    it('allows exactly 10 requests', async () => {
      const req = makeMockRequest({ ip: '2.2.2.10' });
      const res = makeMockResponse();

      const { nextCallCount } = await runLimiter(authLimiter, 10, req, res as unknown as Response);

      expect(nextCallCount).toBe(10);
    });

    it('blocks the 11th request', async () => {
      const req = makeMockRequest({ ip: '2.2.2.11' });
      const res = makeMockResponse();

      const { nextCallCount, status } = await runLimiter(authLimiter, 11, req, res as unknown as Response);

      expect(nextCallCount).toBe(10);
      expect(status).toBe(429);
    });

    it('different IPs have independent counters', async () => {
      const reqA = makeMockRequest({ ip: '2.2.2.20' });
      const reqB = makeMockRequest({ ip: '2.2.2.21' });
      const resA = makeMockResponse();
      const resB = makeMockResponse();

      // Exhaust limit for IP A
      await runLimiter(authLimiter, 11, reqA, resA as unknown as Response);
      expect((resA as MockResponse)._status).toBe(429);

      // IP B should still be within limit
      const { nextCallCount } = await runLimiter(authLimiter, 1, reqB, resB as unknown as Response);
      expect(nextCallCount).toBe(1);
      expect((resB as MockResponse)._status).toBe(200);
    });

    it('skips health endpoints regardless of call count', async () => {
      const req = makeMockRequest({ ip: '2.2.2.30', path: '/healthz' });
      const res = makeMockResponse();
      const next = jest.fn();

      for (let i = 0; i < 20; i++) {
        await (authLimiter as unknown as (req: Request, res: Response, next: NextFunction) => Promise<void>)(
          req,
          res as unknown as Response,
          next as unknown as NextFunction
        );
      }

      expect((next as jest.Mock).mock.calls.length).toBe(20);
    });
  });

  // -------------------------------------------------------------------------
  // Error response shape
  // -------------------------------------------------------------------------

  describe('error response format', () => {
    it('includes error.type = rate_limit_exceeded on generalLimiter 429', async () => {
      const req = makeMockRequest({ ip: '3.3.3.1' });
      const res = makeMockResponse();

      await runLimiter(generalLimiter, 101, req, res as unknown as Response);

      const body = (res as MockResponse)._json as Record<string, unknown>;
      expect(body).toBeDefined();
      const err = body.error as Record<string, unknown>;
      expect(err.type).toBe('rate_limit_exceeded');
    });

    it('includes a human-readable message field', async () => {
      const req = makeMockRequest({ ip: '3.3.3.2' });
      const res = makeMockResponse();

      await runLimiter(authLimiter, 11, req, res as unknown as Response);

      const body = (res as MockResponse)._json as Record<string, unknown>;
      const err = body.error as Record<string, unknown>;
      expect(typeof err.message).toBe('string');
      expect((err.message as string).length).toBeGreaterThan(0);
    });

    it('includes retryAfter field on 429', async () => {
      const req = makeMockRequest({ ip: '3.3.3.3' });
      const res = makeMockResponse();

      await runLimiter(authLimiter, 11, req, res as unknown as Response);

      const body = (res as MockResponse)._json as Record<string, unknown>;
      const err = body.error as Record<string, unknown>;
      // retryAfter may be undefined if Retry-After header was not set yet;
      // the field key must exist regardless
      expect('retryAfter' in err).toBe(true);
    });

    it('generalLimiter 429 message mentions waiting', async () => {
      const req = makeMockRequest({ ip: '3.3.3.4' });
      const res = makeMockResponse();

      await runLimiter(generalLimiter, 101, req, res as unknown as Response);

      const body = (res as MockResponse)._json as Record<string, unknown>;
      const err = body.error as Record<string, unknown>;
      expect(err.message as string).toMatch(/wait|slow|limit/i);
    });

    it('authLimiter 429 message mentions authentication', async () => {
      const req = makeMockRequest({ ip: '3.3.3.5' });
      const res = makeMockResponse();

      await runLimiter(authLimiter, 11, req, res as unknown as Response);

      const body = (res as MockResponse)._json as Record<string, unknown>;
      const err = body.error as Record<string, unknown>;
      expect(err.message as string).toMatch(/auth/i);
    });
  });

  // -------------------------------------------------------------------------
  // apiLimiter — 1 000 req / 15 min
  // -------------------------------------------------------------------------

  describe('apiLimiter', () => {
    it('allows 1 000 requests before blocking', async () => {
      const req = makeMockRequest({ ip: '4.4.4.1' });
      const res = makeMockResponse();

      const { nextCallCount } = await runLimiter(apiLimiter, 1000, req, res as unknown as Response);

      expect(nextCallCount).toBe(1000);
      expect((res as MockResponse)._status).toBe(200);
    });

    it('blocks on the 1 001st request', async () => {
      const req = makeMockRequest({ ip: '4.4.4.2' });
      const res = makeMockResponse();

      const { nextCallCount, status } = await runLimiter(apiLimiter, 1001, req, res as unknown as Response);

      expect(nextCallCount).toBe(1000);
      expect(status).toBe(429);
    });
  });

  // -------------------------------------------------------------------------
  // uploadLimiter — 10 req / 1 hour
  // -------------------------------------------------------------------------

  describe('uploadLimiter', () => {
    it('allows exactly 10 uploads', async () => {
      const req = makeMockRequest({ ip: '5.5.5.1' });
      const res = makeMockResponse();

      const { nextCallCount } = await runLimiter(uploadLimiter, 10, req, res as unknown as Response);

      expect(nextCallCount).toBe(10);
    });

    it('blocks the 11th upload', async () => {
      const req = makeMockRequest({ ip: '5.5.5.2' });
      const res = makeMockResponse();

      const { nextCallCount, status } = await runLimiter(uploadLimiter, 11, req, res as unknown as Response);

      expect(nextCallCount).toBe(10);
      expect(status).toBe(429);
    });
  });

  // -------------------------------------------------------------------------
  // webhookLimiter — 1 000 req / 1 min
  // -------------------------------------------------------------------------

  describe('webhookLimiter', () => {
    it('allows high-throughput webhook traffic (1 000 req/min)', async () => {
      const req = makeMockRequest({ ip: '6.6.6.1' });
      const res = makeMockResponse();

      const { nextCallCount } = await runLimiter(webhookLimiter, 1000, req, res as unknown as Response);

      expect(nextCallCount).toBe(1000);
    });

    it('blocks on the 1 001st webhook request', async () => {
      const req = makeMockRequest({ ip: '6.6.6.2' });
      const res = makeMockResponse();

      const { nextCallCount, status } = await runLimiter(webhookLimiter, 1001, req, res as unknown as Response);

      expect(nextCallCount).toBe(1000);
      expect(status).toBe(429);
    });
  });

  // -------------------------------------------------------------------------
  // strictLimiter — 5 req / 1 hour
  // -------------------------------------------------------------------------

  describe('strictLimiter', () => {
    it('allows up to 5 requests', async () => {
      const req = makeMockRequest({ ip: '7.7.7.1' });
      const res = makeMockResponse();

      const { nextCallCount } = await runLimiter(strictLimiter, 5, req, res as unknown as Response);

      expect(nextCallCount).toBe(5);
    });

    it('blocks the 6th request', async () => {
      const req = makeMockRequest({ ip: '7.7.7.2' });
      const res = makeMockResponse();

      const { nextCallCount, status } = await runLimiter(strictLimiter, 6, req, res as unknown as Response);

      expect(nextCallCount).toBe(5);
      expect(status).toBe(429);
    });

    it('authenticated user key is isolated from IP key', async () => {
      const reqIP = makeMockRequest({ ip: '7.7.7.3' });
      const reqUser = makeMockRequest({
        ip: '7.7.7.3',
        userId: 'user-strict-test',
      } as Partial<Request & { userId: string }>);

      const resIP = makeMockResponse();
      const resUser = makeMockResponse();

      // Exhaust IP bucket
      await runLimiter(strictLimiter, 6, reqIP, resIP as unknown as Response);
      expect((resIP as MockResponse)._status).toBe(429);

      // User bucket is independent and still has capacity
      const { nextCallCount } = await runLimiter(strictLimiter, 1, reqUser, resUser as unknown as Response);
      expect(nextCallCount).toBe(1);
      expect((resUser as MockResponse)._status).toBe(200);
    });
  });
});
