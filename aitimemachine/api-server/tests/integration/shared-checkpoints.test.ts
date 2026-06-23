/**
 * Integration Tests: Shared Checkpoints Routes
 *
 * Tests the /v1/shared-checkpoints endpoints:
 * - GET    /v1/shared-checkpoints              - List shared checkpoints
 * - GET    /v1/shared-checkpoints/:id          - Get specific shared checkpoint
 * - POST   /v1/shared-checkpoints/:id/share    - Share a checkpoint with an org
 * - DELETE /v1/shared-checkpoints/:id/unshare  - Unshare a checkpoint
 * - GET    /v1/shared-checkpoints/org/:orgId   - List org checkpoints
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockCheckpoints,
  mockOrgMembers,
  mockOrganizations,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

/**
 * Seed an organization membership for the test user so shared-checkpoint
 * queries can resolve org-scoped data.
 */
function seedOrgMembership() {
  mockOrganizations.push({
    id: "org_test_001",
    name: "Test Org",
    slug: "test-org",
    ownerId: "user_test_001",
    plan: "team",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);

  mockOrgMembers.push({
    id: "mem_test_001",
    orgId: "org_test_001",
    userId: "user_test_001",
    role: "owner",
    invitedBy: null,
    joinedAt: new Date(),
  } as any);
}

/**
 * Seed a checkpoint owned by the test user with an orgId so it is "shared".
 */
function seedSharedCheckpoint() {
  mockCheckpoints.push({
    id: "cp_shared_001",
    projectId: "proj_test_001",
    userId: "user_test_001",
    orgId: "org_test_001",
    name: "Shared Checkpoint",
    description: "A checkpoint shared with the org",
    triggerType: "manual",
    rootTreeHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  } as any);
}

/**
 * Seed an unshared checkpoint owned by the test user.
 */
function seedOwnedCheckpoint() {
  mockCheckpoints.push({
    id: "cp_owned_001",
    projectId: "proj_test_001",
    userId: "user_test_001",
    orgId: null,
    name: "Owned Checkpoint",
    description: "A private checkpoint",
    triggerType: "manual",
    rootTreeHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  } as any);
}

describe("Shared Checkpoints Routes - /v1/shared-checkpoints", () => {
  // ========================================================================
  // GET /v1/shared-checkpoints - List shared checkpoints
  // ========================================================================
  describe("GET /v1/shared-checkpoints", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/shared-checkpoints");

      expect(res.status).toBe(401);
    });

    it("should return empty when user has no org memberships", async () => {
      const res = await request(app)
        .get("/v1/shared-checkpoints")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("checkpoints");
      expect(res.body.checkpoints).toHaveLength(0);
      expect(res.body).toHaveProperty("message");
    });

    it("should return shared checkpoints when user is in an org", async () => {
      seedOrgMembership();
      seedSharedCheckpoint();

      const res = await request(app)
        .get("/v1/shared-checkpoints")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("checkpoints");
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("organizations");
      expect(res.body.organizations).toContain("org_test_001");
    });
  });

  // ========================================================================
  // GET /v1/shared-checkpoints/:id - Get specific shared checkpoint
  // ========================================================================
  describe("GET /v1/shared-checkpoints/:id", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/shared-checkpoints/cp_shared_001");

      expect(res.status).toBe(401);
    });

    it("should return 404 for a non-existent checkpoint", async () => {
      const res = await request(app)
        .get("/v1/shared-checkpoints/cp_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should return checkpoint details for an owned checkpoint", async () => {
      seedOwnedCheckpoint();

      const res = await request(app)
        .get("/v1/shared-checkpoints/cp_owned_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("checkpoint");
      expect(res.body.checkpoint).toHaveProperty("id", "cp_owned_001");
      expect(res.body.checkpoint).toHaveProperty("is_own", true);
    });
  });

  // ========================================================================
  // POST /v1/shared-checkpoints/:id/share - Share checkpoint with org
  // ========================================================================
  describe("POST /v1/shared-checkpoints/:id/share", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/shared-checkpoints/cp_owned_001/share")
        .send({ org_id: "org_test_001" });

      expect(res.status).toBe(401);
    });

    it("should return 400 when org_id is missing", async () => {
      seedOwnedCheckpoint();

      const res = await request(app)
        .post("/v1/shared-checkpoints/cp_owned_001/share")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should return 404 when checkpoint does not exist", async () => {
      const res = await request(app)
        .post("/v1/shared-checkpoints/cp_nonexistent/share")
        .set("X-API-Key", TEST_API_KEY)
        .send({ org_id: "org_test_001" });

      expect(res.status).toBe(404);
    });

    it("should share a checkpoint with an org", async () => {
      seedOrgMembership();
      seedOwnedCheckpoint();

      const res = await request(app)
        .post("/v1/shared-checkpoints/cp_owned_001/share")
        .set("X-API-Key", TEST_API_KEY)
        .send({ org_id: "org_test_001" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("shared", true);
      expect(res.body).toHaveProperty("checkpoint_id", "cp_owned_001");
      expect(res.body).toHaveProperty("org_id", "org_test_001");
    });
  });

  // ========================================================================
  // DELETE /v1/shared-checkpoints/:id/unshare - Unshare checkpoint
  // ========================================================================
  describe("DELETE /v1/shared-checkpoints/:id/unshare", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .delete("/v1/shared-checkpoints/cp_shared_001/unshare");

      expect(res.status).toBe(401);
    });

    it("should return 404 when checkpoint does not exist", async () => {
      const res = await request(app)
        .delete("/v1/shared-checkpoints/cp_nonexistent/unshare")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should unshare a shared checkpoint", async () => {
      seedOrgMembership();
      seedSharedCheckpoint();

      const res = await request(app)
        .delete("/v1/shared-checkpoints/cp_shared_001/unshare")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("unshared", true);
      expect(res.body).toHaveProperty("checkpoint_id", "cp_shared_001");
    });
  });

  // ========================================================================
  // GET /v1/shared-checkpoints/org/:orgId - List org checkpoints
  // ========================================================================
  describe("GET /v1/shared-checkpoints/org/:orgId", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/shared-checkpoints/org/org_test_001");

      expect(res.status).toBe(401);
    });

    it("should return 403 when user is not a member of the org", async () => {
      const res = await request(app)
        .get("/v1/shared-checkpoints/org/org_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(403);
    });

    it("should return org checkpoints when user is a member", async () => {
      seedOrgMembership();
      seedSharedCheckpoint();

      const res = await request(app)
        .get("/v1/shared-checkpoints/org/org_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("checkpoints");
      expect(res.body).toHaveProperty("org_id", "org_test_001");
      expect(res.body).toHaveProperty("total");
    });
  });
});
