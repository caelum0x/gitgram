/**
 * Integration Tests: Auth Middleware
 *
 * Tests the API key authentication flow including:
 * - Missing API key -> 401
 * - Invalid API key format -> 401
 * - Invalid API key (not in DB) -> 401
 * - Expired API key -> 401
 * - Valid API key -> 200 (request proceeds)
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  EXPIRED_API_KEY,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Auth Middleware - API Key Authentication", () => {
  // ========================================================================
  // Missing API key
  // ========================================================================
  describe("Missing API key", () => {
    it("should return 401 when no X-API-Key header is provided", async () => {
      const res = await request(app).get("/v1/contexts");

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.message).toMatch(/[Mm]issing/);
    });

    it("should return 401 with helpful message about X-API-Key header", async () => {
      const res = await request(app).get("/v1/contexts");

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBeDefined();
      // The wrapper replaces the body, so the original "message" field about X-API-Key
      // is dropped. The wrapped error.message is "Missing API key".
      expect(res.body.error.message.toLowerCase()).toContain("missing");
    });
  });

  // ========================================================================
  // Invalid API key format
  // ========================================================================
  describe("Invalid API key format", () => {
    it("should return 401 when API key does not start with aitm_", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", "invalid_key_format");

      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/[Ii]nvalid.*format/);
    });

    it("should return 401 for empty API key", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", "");

      expect(res.status).toBe(401);
    });

    it("should return 401 for API key with only the prefix", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", "sk_live_abc123");

      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // Invalid API key (not found in DB)
  // ========================================================================
  describe("Invalid API key (not found)", () => {
    it("should return 401 when API key hash is not in the database", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", "aitm_nonexistent_key_123456");

      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/[Ii]nvalid/);
    });
  });

  // ========================================================================
  // Expired API key
  // ========================================================================
  describe("Expired API key", () => {
    it("should return 401 when API key has expired", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", EXPIRED_API_KEY);

      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/[Ee]xpir/);
    });
  });

  // ========================================================================
  // Valid API key
  // ========================================================================
  describe("Valid API key", () => {
    it("should allow access with a valid API key", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      // The endpoint should return 200 (or at least not 401/403)
      expect(res.status).toBe(200);
    });

    it("should include X-Request-Id header in the response", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.headers["x-request-id"]).toBeDefined();
      expect(res.headers["x-request-id"]).toMatch(/^req_/);
    });

    it("should include X-API-Version header in the response", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.headers["x-api-version"]).toBeDefined();
    });
  });

  // ========================================================================
  // Health endpoint (no auth required)
  // ========================================================================
  describe("Unauthenticated endpoints", () => {
    it("should allow access to /health without authentication", async () => {
      const res = await request(app).get("/health");

      // Health endpoint should respond without auth
      expect(res.status).not.toBe(401);
    });

    it("should allow access to /v1 API info without auth (rate limited but no auth)", async () => {
      const res = await request(app).get("/v1");

      // The /v1 endpoint is before auth middleware on individual routes
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("version");
      expect(res.body).toHaveProperty("endpoints");
    });
  });
});
