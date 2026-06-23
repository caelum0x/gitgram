/**
 * Integration Tests: Tree Routes
 *
 * Tests the /v1/trees endpoints:
 * - GET /v1/trees/:checkpointId            - Get root tree for a checkpoint
 * - GET /v1/trees/:checkpointId/path/*     - Get tree at a specific directory path
 * - GET /v1/trees/hash/:hash               - Get tree by content hash
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockCheckpoints,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

/**
 * Seed a checkpoint with a rootTreeHash for tree queries.
 */
function seedCheckpointWithTree() {
  mockCheckpoints.push({
    id: "cp_tree_001",
    projectId: "proj_test_001",
    userId: "user_test_001",
    orgId: null,
    name: "Checkpoint With Tree",
    description: "Has a root tree hash",
    triggerType: "manual",
    rootTreeHash: "abc123hash",
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  } as any);
}

/**
 * Seed a checkpoint without a rootTreeHash.
 */
function seedCheckpointWithoutTree() {
  mockCheckpoints.push({
    id: "cp_notree_001",
    projectId: "proj_test_001",
    userId: "user_test_001",
    orgId: null,
    name: "Checkpoint Without Tree",
    description: "No tree",
    triggerType: "manual",
    rootTreeHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  } as any);
}

describe("Tree Routes - /v1/trees", () => {
  // ========================================================================
  // GET /v1/trees/:checkpointId - Get root tree
  // ========================================================================
  describe("GET /v1/trees/:checkpointId", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .get("/v1/trees/cp_tree_001")
        .query({ projectId: "proj_test_001" });

      expect(res.status).toBe(401);
    });

    it("should return 400 when projectId query param is missing", async () => {
      const res = await request(app)
        .get("/v1/trees/cp_tree_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
    });

    it("should return 404 for a non-existent checkpoint", async () => {
      const res = await request(app)
        .get("/v1/trees/cp_nonexistent")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should return 404 when checkpoint has no tree", async () => {
      seedCheckpointWithoutTree();

      const res = await request(app)
        .get("/v1/trees/cp_notree_001")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should return 404 when tree hash does not resolve (no trees table data)", async () => {
      seedCheckpointWithTree();

      const res = await request(app)
        .get("/v1/trees/cp_tree_001")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      // The tree service queries the "trees" table which is not in the mock DB,
      // so getTreeAtPath returns null, resulting in a 404.
      expect(res.status).toBe(404);
    });
  });

  // ========================================================================
  // GET /v1/trees/:checkpointId/path/* - Get tree at directory path
  // ========================================================================
  describe("GET /v1/trees/:checkpointId/path/*", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .get("/v1/trees/cp_tree_001/path/src")
        .query({ projectId: "proj_test_001" });

      expect(res.status).toBe(401);
    });

    it("should return 400 when projectId is missing", async () => {
      const res = await request(app)
        .get("/v1/trees/cp_tree_001/path/src")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
    });

    it("should return 404 for a non-existent checkpoint path", async () => {
      const res = await request(app)
        .get("/v1/trees/cp_nonexistent/path/src")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  // ========================================================================
  // GET /v1/trees/hash/:hash - Get tree by hash
  // ========================================================================
  describe("GET /v1/trees/hash/:hash", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .get("/v1/trees/hash/somehash123")
        .query({ projectId: "proj_test_001" });

      expect(res.status).toBe(401);
    });

    it("should return 400 when projectId is missing", async () => {
      const res = await request(app)
        .get("/v1/trees/hash/somehash123")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
    });

    it("should return 404 for a non-existent project", async () => {
      const res = await request(app)
        .get("/v1/trees/hash/somehash123")
        .query({ projectId: "proj_nonexistent" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should return 404 when tree hash does not exist", async () => {
      const res = await request(app)
        .get("/v1/trees/hash/nonexistenthash")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      // The tree service queries the "trees" table which returns empty in mock
      expect(res.status).toBe(404);
    });
  });
});
