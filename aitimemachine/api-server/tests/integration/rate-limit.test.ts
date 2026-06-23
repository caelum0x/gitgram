/**
 * Integration Tests: Rate Limiting
 *
 * Tests the rate limiting middleware:
 * - Requests under limit return 200
 * - Requests over limit return 429
 * - Rate limit headers are present
 * - Retry-After header on 429
 *
 * NOTE: The GET /v1 info endpoint is registered BEFORE the rate limiter
 * middleware in index.ts, so it bypasses rate limiting. These tests use
 * GET /v1/contexts instead, which goes through the rate limiter.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  enableRateLimit,
  disableRateLimit,
  resetMockRateLimiter,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
  resetMockRateLimiter();
});

describe("Rate Limiting Middleware", () => {
  // ========================================================================
  // Requests under limit (passthrough mode)
  // ========================================================================
  describe("Under rate limit", () => {
    it("should return 200 for authenticated requests under the rate limit", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
    });

    it("should return rate limit headers on every response", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      // Check for standard rate limit headers
      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(res.headers["x-ratelimit-reset"]).toBeDefined();
    });

    it("should include monthly quota headers", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.headers["x-ratelimit-limit-month"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining-month"]).toBeDefined();
      expect(res.headers["x-ratelimit-reset-month"]).toBeDefined();
    });

    it("should show remaining count decreasing with requests", async () => {
      // Enable the mock rate limiter so remaining actually decreases
      enableRateLimit();

      const res1 = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      const remaining1 = parseInt(res1.headers["x-ratelimit-remaining"], 10);

      const res2 = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      const remaining2 = parseInt(res2.headers["x-ratelimit-remaining"], 10);

      // After a second request, remaining should be less
      expect(remaining2).toBeLessThan(remaining1);

      disableRateLimit();
    });
  });

  // ========================================================================
  // Rate limit headers format
  // ========================================================================
  describe("Rate limit headers format", () => {
    it("should have numeric X-RateLimit-Limit", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      const limit = parseInt(res.headers["x-ratelimit-limit"], 10);
      expect(limit).toBeGreaterThan(0);
    });

    it("should have non-negative X-RateLimit-Remaining", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      const remaining = parseInt(res.headers["x-ratelimit-remaining"], 10);
      expect(remaining).toBeGreaterThanOrEqual(0);
    });

    it("should have X-RateLimit-Reset as a Unix timestamp", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      const reset = parseInt(res.headers["x-ratelimit-reset"], 10);
      // Should be a reasonable Unix timestamp (after year 2020)
      expect(reset).toBeGreaterThan(1577836800);
    });

    it("should have X-RateLimit-Limit-Month for monthly quota", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      const monthLimit = parseInt(res.headers["x-ratelimit-limit-month"], 10);
      expect(monthLimit).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Over rate limit (mock rate limiter enabled)
  // ========================================================================
  describe("Over rate limit", () => {
    beforeAll(() => {
      enableRateLimit();
    });

    afterAll(() => {
      disableRateLimit();
    });

    beforeEach(() => {
      resetMockRateLimiter();
    });

    it("should return 429 when per-minute rate limit is exceeded", async () => {
      // The free plan has 10 requests per minute.
      // We fire enough requests sequentially to exceed it.
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .get("/v1/contexts")
            .set("X-API-Key", TEST_API_KEY)
        );
      }

      const results = await Promise.all(requests);
      const statuses = results.map((r) => r.status);

      // At least some should be 429 (free plan = 10/min)
      const has429 = statuses.some((s) => s === 429);
      expect(has429).toBe(true);
    });

    it("should include Retry-After header when rate limited", async () => {
      // Exceed the limit
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .get("/v1/contexts")
            .set("X-API-Key", TEST_API_KEY)
        );
      }

      const results = await Promise.all(requests);
      const rateLimited = results.find((r) => r.status === 429);

      expect(rateLimited).toBeDefined();
      expect(rateLimited!.headers["retry-after"]).toBeDefined();
      const retryAfter = parseInt(rateLimited!.headers["retry-after"], 10);
      expect(retryAfter).toBeGreaterThan(0);
    });

    it("should return a structured error body when rate limited", async () => {
      // Exceed the limit
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .get("/v1/contexts")
            .set("X-API-Key", TEST_API_KEY)
        );
      }

      const results = await Promise.all(requests);
      const rateLimited = results.find((r) => r.status === 429);

      expect(rateLimited).toBeDefined();
      expect(rateLimited!.body).toHaveProperty("error");
      expect(rateLimited!.body.error).toHaveProperty("type", "rate_limit_exceeded");
      expect(rateLimited!.body.error).toHaveProperty("code");
      expect(rateLimited!.body.error).toHaveProperty("message");
      expect(rateLimited!.body.error).toHaveProperty("details");
      expect(rateLimited!.body.error.details).toHaveProperty("retry_after");
    });

    it("should include limit details in the 429 error body", async () => {
      const requests = [];
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .get("/v1/contexts")
            .set("X-API-Key", TEST_API_KEY)
        );
      }

      const results = await Promise.all(requests);
      const rateLimited = results.find((r) => r.status === 429);

      expect(rateLimited).toBeDefined();
      const { details } = rateLimited!.body.error;
      expect(details).toHaveProperty("limit");
      expect(details).toHaveProperty("current");
      expect(typeof details.limit).toBe("number");
      expect(typeof details.current).toBe("number");
      expect(details.current).toBeGreaterThan(details.limit);
    });
  });

  // ========================================================================
  // Unauthenticated rate limiting (by IP)
  // ========================================================================
  describe("Unauthenticated rate limiting", () => {
    it("should still set rate limit headers on unauthenticated requests", async () => {
      // Rate limiter runs before auth middleware, so headers are set
      // even though the request ultimately gets 401
      const res = await request(app).get("/v1/contexts");

      // Should have rate limit headers even without auth
      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
    });
  });

  // ========================================================================
  // Health endpoint (no rate limiting)
  // ========================================================================
  describe("Health endpoint exemption", () => {
    it("should not apply rate limiting to /health endpoints", async () => {
      // Health routes are registered before the rate limiter middleware
      // so they bypass it entirely. Fire many requests - none should be 429.
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(request(app).get("/health"));
      }

      const results = await Promise.all(requests);
      const allSuccessful = results.every((r) => r.status !== 429);
      expect(allSuccessful).toBe(true);
    });
  });
});
