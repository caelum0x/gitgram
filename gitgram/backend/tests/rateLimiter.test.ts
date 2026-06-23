/**
 * Tests for Tiered Rate Limiter (per-IP and per-user)
 */

import { Request, Response, NextFunction } from 'express';

// Mock logger to avoid file system issues in tests
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock prisma to avoid DB dependency
jest.mock('../src/utils/prisma', () => ({
  default: { $disconnect: jest.fn() },
  prisma: { $disconnect: jest.fn() },
}));

// Mock abuse detection to avoid deep dependency chain
jest.mock('../src/services/abuseDetectionService', () => ({
  recordViolation: jest.fn(),
}));

// Mock redis config to return null (use in-memory fallback)
jest.mock('../src/config/redis', () => ({
  initializeRedis: jest.fn().mockResolvedValue(null),
  getRedisClient: jest.fn().mockReturnValue(null),
}));

// Override the global mock from setup.ts so we test the real tiered rate limiter
jest.unmock('../src/middleware/tieredRateLimiter');

import {
  ipRateLimit,
  userRateLimit,
  ipStore,
  userStore,
} from '../src/middleware/tieredRateLimiter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    method: 'GET',
    path: '/test',
    body: {},
    params: {},
    userId: undefined,
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response & { _status: number; _json: any; _headers: Record<string, any> } {
  const res: any = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, any>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._json = data;
      return res;
    },
    setHeader(name: string, value: any) {
      res._headers[name] = value;
      return res;
    },
    getHeader(name: string) {
      return res._headers[name];
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tiered Rate Limiter', () => {
  beforeEach(() => {
    // Reset stores between tests
    ipStore.clear();
    userStore.clear();
    // Re-create so new tests start fresh (constructor starts cleanup interval)
    // The stores are module-level singletons, so we just clear them
  });

  afterAll(() => {
    ipStore.clear();
    userStore.clear();
  });

  describe('ipRateLimit', () => {
    it('should allow requests within the limit', async () => {
      const middleware = ipRateLimit('GENERAL_API');
      const req = mockReq();
      const res = mockRes();
      const next = jest.fn();

      // Make 100 requests (the default limit)
      for (let i = 0; i < 100; i++) {
        await middleware(req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(100);
    });

    it('should block requests exceeding the limit', async () => {
      const middleware = ipRateLimit('GENERAL_API');
      const req = mockReq();
      const res = mockRes();
      const next = jest.fn();

      // Make 101 requests (exceeds default 100/min)
      for (let i = 0; i < 101; i++) {
        await middleware(req, res, next);
      }

      // 100 should pass, 1 should be blocked
      expect(next).toHaveBeenCalledTimes(100);
      expect(res._status).toBe(429);
      expect(res._json).toHaveProperty('error', 'Too many requests');
    });

    it('should set rate limit headers', async () => {
      const middleware = ipRateLimit('GENERAL_API');
      const req = mockReq();
      const res = mockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res._headers['X-RateLimit-Limit']).toBe(100);
      expect(res._headers['X-RateLimit-Remaining']).toBeDefined();
      expect(res._headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should use different limits for different tiers', async () => {
      const authMiddleware = ipRateLimit('AUTH');
      const req = mockReq();
      const res = mockRes();
      const next = jest.fn();

      // AUTH has a default limit of 10/min
      for (let i = 0; i < 11; i++) {
        await authMiddleware(req, res, next);
      }

      expect(next).toHaveBeenCalledTimes(10);
      expect(res._status).toBe(429);
    });

    it('should track different IPs separately', async () => {
      const middleware = ipRateLimit('AUTH');
      const next = jest.fn();

      // IP 1: use up all 10 requests
      const req1 = mockReq({ ip: '10.0.0.1' });
      const res1 = mockRes();
      for (let i = 0; i < 11; i++) {
        await middleware(req1, res1, next);
      }
      expect(next).toHaveBeenCalledTimes(10);

      // IP 2: should have its own counter
      const req2 = mockReq({ ip: '10.0.0.2' });
      const res2 = mockRes();
      next.mockClear();
      await middleware(req2, res2, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should set Retry-After header when limit exceeded', async () => {
      const middleware = ipRateLimit('AUTH');
      const req = mockReq();
      const res = mockRes();
      const next = jest.fn();

      for (let i = 0; i < 11; i++) {
        await middleware(req, res, next);
      }

      expect(res._headers['Retry-After']).toBeDefined();
      expect(res._headers['Retry-After']).toBeGreaterThan(0);
    });
  });

  describe('userRateLimit', () => {
    it('should skip rate limiting for unauthenticated requests', async () => {
      const middleware = userRateLimit('POSTS');
      const req = mockReq(); // no userId
      const res = mockRes();
      const next = jest.fn();

      await middleware(req as any, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should allow requests within the user limit', async () => {
      const middleware = userRateLimit('POSTS');
      const next = jest.fn();

      // POSTS default: 30/hour
      for (let i = 0; i < 30; i++) {
        const req = mockReq({ userId: 'user-123' } as any);
        const res = mockRes();
        await middleware(req as any, res, next);
      }

      expect(next).toHaveBeenCalledTimes(30);
    });

    it('should block requests exceeding user limit', async () => {
      const middleware = userRateLimit('POSTS');
      const next = jest.fn();
      let lastRes: any;

      for (let i = 0; i < 31; i++) {
        const req = mockReq({ userId: 'user-456' } as any);
        lastRes = mockRes();
        await middleware(req as any, lastRes, next);
      }

      expect(next).toHaveBeenCalledTimes(30);
      expect(lastRes._status).toBe(429);
      expect(lastRes._json.error).toBe('Too many requests');
    });

    it('should track different users separately', async () => {
      const middleware = userRateLimit('POSTS');
      const next = jest.fn();

      // User A: use up all 30 posts
      for (let i = 0; i < 31; i++) {
        const req = mockReq({ userId: 'user-A' } as any);
        const res = mockRes();
        await middleware(req as any, res, next);
      }
      expect(next).toHaveBeenCalledTimes(30);

      // User B: should have its own counter
      next.mockClear();
      const reqB = mockReq({ userId: 'user-B' } as any);
      const resB = mockRes();
      await middleware(reqB as any, resB, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should enforce different limits for different actions', async () => {
      const commentMiddleware = userRateLimit('COMMENTS');
      const reactionMiddleware = userRateLimit('REACTIONS');
      const next = jest.fn();

      // COMMENTS default: 60/hour - make 61 requests
      for (let i = 0; i < 61; i++) {
        const req = mockReq({ userId: 'user-limits' } as any);
        const res = mockRes();
        await commentMiddleware(req as any, res, next);
      }
      expect(next).toHaveBeenCalledTimes(60);

      // REACTIONS default: 120/hour - should still have capacity
      next.mockClear();
      for (let i = 0; i < 5; i++) {
        const req = mockReq({ userId: 'user-limits' } as any);
        const res = mockRes();
        await reactionMiddleware(req as any, res, next);
      }
      expect(next).toHaveBeenCalledTimes(5);
    });

    it('should apply stricter limits for new accounts', async () => {
      const middleware = userRateLimit('POSTS');
      const next = jest.fn();

      // Simulate a new account (< 24 hours old)
      // Default NEW_ACCOUNT_LIMIT_MULTIPLIER is 0.5, so limit = 15 instead of 30
      for (let i = 0; i < 16; i++) {
        const req = mockReq({ userId: 'new-user-1' } as any);
        (req as any).__accountAgeHours = 2; // 2 hours old
        const res = mockRes();
        await middleware(req as any, res, next);
      }

      // With multiplier 0.5, limit is ceil(30 * 0.5) = 15
      expect(next).toHaveBeenCalledTimes(15);
    });
  });
});
