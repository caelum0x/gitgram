/**
 * Integration Tests: Retention Policy Routes
 *
 * Tests the /v1/retention endpoints:
 * - POST /v1/retention         - Create/update a retention policy
 * - GET  /v1/retention         - List retention policies
 * - POST /v1/retention/apply   - Apply retention policies to a project
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockRetentionPolicies,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Retention Routes - /v1/retention", () => {
  // ========================================================================
  // POST /v1/retention - Create/update retention policy
  // ========================================================================
  describe("POST /v1/retention", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/retention")
        .send({
          dataClass: "checkpoints",
          retentionDays: 90,
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(401);
    });

    it("should create a retention policy for a project", async () => {
      const res = await request(app)
        .post("/v1/retention")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          dataClass: "checkpoints",
          retentionDays: 90,
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("policy");
      expect(res.body.policy).toHaveProperty("dataClass", "checkpoints");
      expect(res.body.policy).toHaveProperty("retentionDays", 90);
    });

    it("should create a retention policy for messages", async () => {
      const res = await request(app)
        .post("/v1/retention")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          dataClass: "messages",
          retentionDays: 30,
          hardDelete: true,
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(201);
      expect(res.body.policy.dataClass).toBe("messages");
      expect(res.body.policy.retentionDays).toBe(30);
      expect(res.body.policy.hardDelete).toBe(true);
    });

    it("should return 400 when neither projectId nor organizationId is provided", async () => {
      const res = await request(app)
        .post("/v1/retention")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          dataClass: "checkpoints",
          retentionDays: 90,
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 when both projectId and organizationId are provided", async () => {
      const res = await request(app)
        .post("/v1/retention")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          dataClass: "checkpoints",
          retentionDays: 90,
          projectId: "proj_test_001",
          organizationId: "org_test_001",
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid dataClass", async () => {
      const res = await request(app)
        .post("/v1/retention")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          dataClass: "invalid_class",
          retentionDays: 90,
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 when retentionDays is missing", async () => {
      const res = await request(app)
        .post("/v1/retention")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          dataClass: "checkpoints",
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(400);
    });

    it("should return 404 when project does not exist", async () => {
      const res = await request(app)
        .post("/v1/retention")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          dataClass: "checkpoints",
          retentionDays: 90,
          projectId: "proj_nonexistent",
        });

      expect(res.status).toBe(404);
    });
  });

  // ========================================================================
  // GET /v1/retention - List retention policies
  // ========================================================================
  describe("GET /v1/retention", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/retention");

      expect(res.status).toBe(401);
    });

    it("should return a list of retention policies", async () => {
      const res = await request(app)
        .get("/v1/retention")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("policies");
      expect(Array.isArray(res.body.policies)).toBe(true);
      expect(res.body).toHaveProperty("pagination");
    });

    it("should filter by projectId", async () => {
      const res = await request(app)
        .get("/v1/retention")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("policies");
    });

    it("should include created policies in the list", async () => {
      // Create a policy first
      await request(app)
        .post("/v1/retention")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          dataClass: "checkpoints",
          retentionDays: 60,
          projectId: "proj_test_001",
        });

      const res = await request(app)
        .get("/v1/retention")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.policies.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ========================================================================
  // POST /v1/retention/apply - Apply retention policies
  // ========================================================================
  describe("POST /v1/retention/apply", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/retention/apply")
        .send({
          projectId: "proj_test_001",
          dryRun: true,
        });

      expect(res.status).toBe(401);
    });

    it("should apply retention policies in dry-run mode", async () => {
      const res = await request(app)
        .post("/v1/retention/apply")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          dryRun: true,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("projectId", "proj_test_001");
      expect(res.body).toHaveProperty("dryRun", true);
      expect(res.body).toHaveProperty("summary");
    });

    it("should return 400 when projectId is missing", async () => {
      const res = await request(app)
        .post("/v1/retention/apply")
        .set("X-API-Key", TEST_API_KEY)
        .send({ dryRun: true });

      expect(res.status).toBe(400);
    });

    it("should return 404 when project does not exist", async () => {
      const res = await request(app)
        .post("/v1/retention/apply")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_nonexistent",
          dryRun: true,
        });

      expect(res.status).toBe(404);
    });
  });
});
