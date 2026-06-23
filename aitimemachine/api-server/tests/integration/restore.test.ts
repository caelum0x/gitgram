/**
 * Integration Tests: Restore Routes
 *
 * Tests the restore/read endpoints:
 * - GET /v1/restore/projects - List projects
 * - GET /v1/restore/projects/:id - Get project
 * - GET /v1/restore/projects/:id/checkpoints - List checkpoints
 * - GET /v1/restore/projects/:id/checkpoints/:id - Get checkpoint
 * - GET /v1/restore/blobs/:hash - Get blob (ownership enforced)
 * - POST /v1/restore/blobs/batch - Batch get blobs (ownership enforced)
 * - GET /v1/restore/projects/:id/sessions - List sessions
 * - GET /v1/restore/projects/:id/checkpoints/:id/full - Full restore
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockProjects,
  mockCheckpoints,
  mockBlobs,
  mockChatSessions,
  mockChatMessages,
  mockTerminalEvents,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Restore Routes", () => {
  // ==========================================================================
  // GET /v1/restore/projects
  // ==========================================================================
  describe("GET /v1/restore/projects", () => {
    it("should list projects for authenticated user", async () => {
      const res = await request(app)
        .get("/v1/restore/projects")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("projects");
      expect(Array.isArray(res.body.projects)).toBe(true);
      expect(res.body.projects.length).toBeGreaterThanOrEqual(1);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/v1/restore/projects");

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // GET /v1/restore/projects/:projectId
  // ==========================================================================
  describe("GET /v1/restore/projects/:projectId", () => {
    it("should return project details", async () => {
      const res = await request(app)
        .get("/v1/restore/projects/proj_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("project");
      expect(res.body.project.id).toBe("proj_test_001");
    });

    it("should return 404 for non-existent project", async () => {
      const res = await request(app)
        .get("/v1/restore/projects/proj_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // GET /v1/restore/projects/:projectId/checkpoints
  // ==========================================================================
  describe("GET /v1/restore/projects/:projectId/checkpoints", () => {
    it("should list checkpoints for a project", async () => {
      // Seed a checkpoint
      mockCheckpoints.push({
        id: "cp_test_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        name: "Test Checkpoint",
        description: "A test checkpoint",
        manifestHash: "manifest_hash_001",
        createdAt: new Date(),
      });

      const res = await request(app)
        .get("/v1/restore/projects/proj_test_001/checkpoints")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("checkpoints");
      expect(res.body).toHaveProperty("project");
      expect(Array.isArray(res.body.checkpoints)).toBe(true);
    });

    it("should return 404 for non-existent project", async () => {
      const res = await request(app)
        .get("/v1/restore/projects/proj_nonexistent/checkpoints")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // GET /v1/restore/blobs/:hash - Ownership enforced
  // ==========================================================================
  describe("GET /v1/restore/blobs/:hash", () => {
    it("should return blob owned by the user", async () => {
      mockBlobs.push({
        hash: "blob_hash_001",
        userId: "user_test_001",
        size: 1024,
        content: "dGVzdCBjb250ZW50",
        storageType: "inline",
      });

      const res = await request(app)
        .get("/v1/restore/blobs/blob_hash_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("blob");
      expect(res.body.blob.hash).toBe("blob_hash_001");
    });

    it("should return 404 for blob owned by another user", async () => {
      mockBlobs.push({
        hash: "blob_other_user",
        userId: "user_other",
        size: 512,
        content: "b3RoZXI=",
        storageType: "inline",
      });

      const res = await request(app)
        .get("/v1/restore/blobs/blob_other_user")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should return 404 for non-existent blob", async () => {
      const res = await request(app)
        .get("/v1/restore/blobs/nonexistent_hash")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // POST /v1/restore/blobs/batch - Batch get with ownership
  // ==========================================================================
  describe("POST /v1/restore/blobs/batch", () => {
    it("should return only blobs owned by the user", async () => {
      mockBlobs.push(
        {
          hash: "batch_blob_1",
          userId: "user_test_001",
          size: 100,
          content: "Y29udGVudDE=",
          storageType: "inline",
        },
        {
          hash: "batch_blob_2",
          userId: "user_test_001",
          size: 200,
          content: "Y29udGVudDI=",
          storageType: "inline",
        },
        {
          hash: "batch_blob_other",
          userId: "user_other",
          size: 300,
          content: "b3RoZXI=",
          storageType: "inline",
        }
      );

      const res = await request(app)
        .post("/v1/restore/blobs/batch")
        .set("X-API-Key", TEST_API_KEY)
        .send({ hashes: ["batch_blob_1", "batch_blob_2", "batch_blob_other"] });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("blobs");
      // Only user's blobs should be returned
      const returnedHashes = res.body.blobs.map((b: any) => b.hash);
      expect(returnedHashes).toContain("batch_blob_1");
      expect(returnedHashes).toContain("batch_blob_2");
      expect(returnedHashes).not.toContain("batch_blob_other");
    });

    it("should return 400 for missing hashes array", async () => {
      const res = await request(app)
        .post("/v1/restore/blobs/batch")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
    });

    it("should return 400 for empty hashes array", async () => {
      const res = await request(app)
        .post("/v1/restore/blobs/batch")
        .set("X-API-Key", TEST_API_KEY)
        .send({ hashes: [] });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // GET /v1/restore/projects/:id/sessions
  // ==========================================================================
  describe("GET /v1/restore/projects/:projectId/sessions", () => {
    it("should list sessions for a project", async () => {
      mockChatSessions.push({
        id: "sess_test_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        tool: "claude-code",
        startedAt: new Date(),
      });

      const res = await request(app)
        .get("/v1/restore/projects/proj_test_001/sessions")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sessions");
      expect(Array.isArray(res.body.sessions)).toBe(true);
    });
  });

  // ==========================================================================
  // GET /v1/restore/projects/:id/checkpoints/:id/full
  // ==========================================================================
  describe("GET /v1/restore/projects/:id/checkpoints/:id/full", () => {
    it("should return full restore data including checkpoint, manifest, messages, and terminal events", async () => {
      mockCheckpoints.push({
        id: "cp_full_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        name: "Full Restore Checkpoint",
        description: "Test",
        manifestHash: "manifest_full_hash",
        createdAt: new Date(),
      });

      mockBlobs.push({
        hash: "manifest_full_hash",
        userId: "user_test_001",
        size: 256,
        content: "eyJmaWxlcyI6W119",
        storageType: "inline",
      });

      mockChatMessages.push({
        id: "msg_001",
        sessionId: "sess_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        role: "user",
        content: "Hello",
        timestamp: new Date(),
      });

      mockTerminalEvents.push({
        id: "te_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        eventType: "command",
        command: "npm test",
        timestamp: new Date(),
      });

      const res = await request(app)
        .get("/v1/restore/projects/proj_test_001/checkpoints/cp_full_001/full")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("checkpoint");
      expect(res.body.checkpoint.id).toBe("cp_full_001");
      expect(res.body).toHaveProperty("manifest");
      expect(res.body).toHaveProperty("messages");
      expect(res.body).toHaveProperty("terminalEvents");
    });

    it("should return 404 for non-existent checkpoint", async () => {
      const res = await request(app)
        .get("/v1/restore/projects/proj_test_001/checkpoints/cp_nonexistent/full")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });
});
