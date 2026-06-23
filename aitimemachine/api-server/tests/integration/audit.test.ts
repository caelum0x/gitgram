/**
 * Integration Tests: Audit Routes
 *
 * Tests the /v1/audit endpoints including:
 * - Listing audit logs with pagination and filtering
 * - Audit summary with configurable time period
 * - Static action types list
 * - Single audit log retrieval
 * - Authentication requirement on all routes
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockAuditLogs,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

/**
 * Helper: seed audit log entries into the mock store.
 */
function seedAuditLogs() {
  mockAuditLogs.push(
    {
      id: "audit_001",
      userId: "user_test_001",
      action: "key.created",
      resourceType: "api_key",
      resourceId: "key_001",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      metadata: null,
      createdAt: new Date("2025-06-01T10:00:00Z"),
    },
    {
      id: "audit_002",
      userId: "user_test_001",
      action: "checkpoint.created",
      resourceType: "checkpoint",
      resourceId: "cp_001",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      metadata: null,
      createdAt: new Date("2025-06-02T12:00:00Z"),
    },
    {
      id: "audit_003",
      userId: "user_test_001",
      action: "key.revoked",
      resourceType: "api_key",
      resourceId: "key_002",
      ipAddress: "192.168.1.1",
      userAgent: "test-agent-2",
      metadata: null,
      createdAt: new Date("2025-06-03T14:00:00Z"),
    },
    {
      id: "audit_004",
      userId: "user_test_001",
      action: "webhook.created",
      resourceType: "webhook",
      resourceId: "wh_001",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      metadata: null,
      createdAt: new Date("2025-06-04T16:00:00Z"),
    },
    {
      id: "audit_005",
      userId: "other_user",
      action: "key.created",
      resourceType: "api_key",
      resourceId: "key_other",
      ipAddress: "10.0.0.1",
      userAgent: "other-agent",
      metadata: null,
      createdAt: new Date("2025-06-05T18:00:00Z"),
    }
  );
}

describe("Audit Routes - /v1/audit", () => {
  // ==========================================================================
  // GET /v1/audit - List audit logs
  // ==========================================================================
  describe("GET /v1/audit", () => {
    it("should return logs list with pagination structure", async () => {
      const res = await request(app)
        .get("/v1/audit")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("logs");
      expect(res.body).toHaveProperty("pagination");
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.pagination).toHaveProperty("total");
      expect(res.body.pagination).toHaveProperty("limit");
      expect(res.body.pagination).toHaveProperty("offset");
      expect(res.body.pagination).toHaveProperty("hasMore");
    });

    it("should require authentication", async () => {
      const res = await request(app).get("/v1/audit");

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    });

    it("should filter logs by action query param", async () => {
      seedAuditLogs();

      const res = await request(app)
        .get("/v1/audit?action=key.created")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.logs)).toBe(true);
      // All returned logs should have the filtered action
      for (const log of res.body.logs) {
        expect(log.action).toBe("key.created");
      }
    });

    it("should return seeded audit log data", async () => {
      seedAuditLogs();

      const res = await request(app)
        .get("/v1/audit")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBeGreaterThan(0);
      // The mock only returns logs for user_test_001 (the authenticated user)
      // audit_005 belongs to "other_user" so it should be excluded
      const logIds = res.body.logs.map((l: any) => l.id);
      expect(logIds).toContain("audit_001");
      expect(logIds).toContain("audit_002");
      expect(logIds).toContain("audit_003");
      expect(logIds).toContain("audit_004");
      expect(logIds).not.toContain("audit_005");
    });

    it("should respect limit and offset query params", async () => {
      seedAuditLogs();

      const res = await request(app)
        .get("/v1/audit?limit=2&offset=1")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.logs.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.offset).toBe(1);
    });
  });

  // ==========================================================================
  // GET /v1/audit/summary - Audit summary
  // ==========================================================================
  describe("GET /v1/audit/summary", () => {
    it("should return summary with period, total, byAction, byResourceType, and recentActions", async () => {
      seedAuditLogs();

      const res = await request(app)
        .get("/v1/audit/summary")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("period");
      expect(res.body.period).toHaveProperty("days");
      expect(res.body.period).toHaveProperty("startDate");
      expect(res.body.period).toHaveProperty("endDate");
      expect(res.body).toHaveProperty("total");
      expect(typeof res.body.total).toBe("number");
      expect(res.body).toHaveProperty("byAction");
      expect(Array.isArray(res.body.byAction)).toBe(true);
      expect(res.body).toHaveProperty("byResourceType");
      expect(Array.isArray(res.body.byResourceType)).toBe(true);
      expect(res.body).toHaveProperty("recentActions");
      expect(Array.isArray(res.body.recentActions)).toBe(true);
    });

    it("should accept a custom days parameter", async () => {
      const res = await request(app)
        .get("/v1/audit/summary?days=7")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.period.days).toBe(7);
    });
  });

  // ==========================================================================
  // GET /v1/audit/actions - Action types list
  // ==========================================================================
  describe("GET /v1/audit/actions", () => {
    it("should return an object containing action type categories", async () => {
      const res = await request(app)
        .get("/v1/audit/actions")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("actions");
      const actions = res.body.actions;
      expect(actions).toHaveProperty("key");
      expect(actions).toHaveProperty("checkpoint");
      expect(actions).toHaveProperty("webhook");
      expect(actions).toHaveProperty("settings");
      expect(actions).toHaveProperty("auth");
      expect(actions).toHaveProperty("project");
      expect(actions).toHaveProperty("repository");
      expect(actions).toHaveProperty("research");
      // Each category should be an array of action objects
      expect(Array.isArray(actions.key)).toBe(true);
      expect(actions.key.length).toBeGreaterThan(0);
      expect(actions.key[0]).toHaveProperty("action");
      expect(actions.key[0]).toHaveProperty("description");
    });
  });

  // ==========================================================================
  // GET /v1/audit/:logId - Single audit log
  // ==========================================================================
  describe("GET /v1/audit/:logId", () => {
    it("should return a specific audit log entry", async () => {
      seedAuditLogs();

      const res = await request(app)
        .get("/v1/audit/audit_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("log");
      expect(res.body.log.id).toBe("audit_001");
      expect(res.body.log.action).toBe("key.created");
      expect(res.body.log.userId).toBe("user_test_001");
    });

    it("should return 404 for a non-existent audit log", async () => {
      const res = await request(app)
        .get("/v1/audit/audit_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.message).toMatch(/not found/i);
    });
  });
});
