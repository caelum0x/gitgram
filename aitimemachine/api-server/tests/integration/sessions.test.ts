/**
 * Integration Tests: Sessions Management
 *
 * Tests the /v1/sessions endpoints:
 * - GET /v1/sessions              - List user sessions
 * - DELETE /v1/sessions/:id       - Revoke a specific session
 * - DELETE /v1/sessions           - Revoke all sessions
 * - POST /v1/sessions/cleanup     - Cleanup expired sessions
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { seedTestData, createTestApp, TEST_API_KEY } from "../setup.js";
import Module from "module";
import path from "path";

/**
 * The sessions route's formatSession() uses a runtime CJS require() call
 * to load getLocationFromIpSync. Vitest's vi.mock only intercepts ESM
 * imports, so the CJS require() inside the route handler fails to find
 * the .js module (since the source is .ts only).
 *
 * To work around this, we:
 * 1. Patch Module._resolveFilename to return a known cache key for the require
 * 2. Pre-populate require.cache at that cache key with our mock
 */
const FAKE_CACHE_KEY = path.resolve(
  __dirname,
  "../../src/services/sessionManager.js"
);

const sessionManagerMock = {
  createSession: vi.fn(),
  validateSession: vi.fn(),
  updateActivity: vi.fn().mockResolvedValue(undefined),
  getUserSessions: vi.fn().mockResolvedValue([
    {
      id: "sess_001",
      deviceInfo: {
        browser: "Chrome",
        os: "macOS",
        device: "Desktop",
        isMobile: false,
      },
      ipAddress: "192.168.1.1",
      lastActiveAt: new Date(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      isCurrent: false,
    },
  ]),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  revokeAllSessions: vi.fn().mockResolvedValue(1),
  cleanupExpired: vi.fn().mockResolvedValue(3),
  getLocationFromIp: vi.fn().mockResolvedValue("Unknown"),
  getLocationFromIpSync: vi.fn().mockReturnValue("Unknown"),
};

// Inject a fake CJS module into the require cache
const fakeModule = new Module(FAKE_CACHE_KEY);
fakeModule.filename = FAKE_CACHE_KEY;
fakeModule.loaded = true;
(fakeModule as any).exports = sessionManagerMock;
require.cache[FAKE_CACHE_KEY] = fakeModule as any;

// Patch _resolveFilename so that when the sessions route does
// require("../services/sessionManager.js"), it returns our cache key
// instead of throwing MODULE_NOT_FOUND.
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (
  req: string,
  parent: any,
  isMain: boolean,
  options: any
) {
  if (
    req === "../services/sessionManager.js" &&
    parent?.filename?.includes("/src/routes/sessions")
  ) {
    return FAKE_CACHE_KEY;
  }
  return originalResolveFilename.call(this, req, parent, isMain, options);
};

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Sessions API - /v1/sessions", () => {
  // ========================================================================
  // GET /v1/sessions - List sessions
  // ========================================================================
  describe("GET /v1/sessions", () => {
    it("should return a list of sessions for the authenticated user", async () => {
      const res = await request(app)
        .get("/v1/sessions")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sessions");
      expect(res.body).toHaveProperty("total");
      expect(Array.isArray(res.body.sessions)).toBe(true);
      expect(res.body.total).toBe(1);

      const session = res.body.sessions[0];
      expect(session).toHaveProperty("id");
      expect(session).toHaveProperty("device");
      expect(session).toHaveProperty("location");
      expect(session).toHaveProperty("ip_address");
      expect(session).toHaveProperty("last_active");
      expect(session).toHaveProperty("created_at");
      expect(session).toHaveProperty("expires_at");
      expect(session).toHaveProperty("is_current");
    });

    it("should require authentication (401 without API key)", async () => {
      const res = await request(app).get("/v1/sessions");

      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // DELETE /v1/sessions/:id - Revoke a specific session
  // ========================================================================
  describe("DELETE /v1/sessions/:id", () => {
    it("should revoke a session successfully", async () => {
      const res = await request(app)
        .delete("/v1/sessions/sess_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("message", "Session revoked successfully");
    });
  });

  // ========================================================================
  // DELETE /v1/sessions - Revoke all sessions
  // ========================================================================
  describe("DELETE /v1/sessions", () => {
    it("should return 400 when except_current is true but no current_session_id provided", async () => {
      const res = await request(app)
        .delete("/v1/sessions")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.message).toBe(
        "current_session_id is required when except_current is true"
      );
      expect(res.body.error.type).toBe("invalid_request_error");
    });

    it("should revoke all sessions when except_current is false", async () => {
      const res = await request(app)
        .delete("/v1/sessions")
        .query({ except_current: "false" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("revoked_count");
      expect(res.body.revoked_count).toBe(1);
      expect(res.body).toHaveProperty("message");
    });

    it("should revoke all sessions except current when current_session_id is provided", async () => {
      const res = await request(app)
        .delete("/v1/sessions")
        .query({ except_current: "true", current_session_id: "sess_current" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("revoked_count");
      expect(res.body.revoked_count).toBe(1);
      expect(res.body).toHaveProperty("message");
    });
  });

  // ========================================================================
  // POST /v1/sessions/cleanup - Cleanup expired sessions
  // ========================================================================
  describe("POST /v1/sessions/cleanup", () => {
    it("should cleanup expired sessions and return cleaned count", async () => {
      const res = await request(app)
        .post("/v1/sessions/cleanup")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("cleaned_count", 3);
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toContain("3");
    });
  });
});
