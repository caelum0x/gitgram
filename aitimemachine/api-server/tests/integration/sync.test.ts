/**
 * Integration Tests: Sync Routes
 *
 * Tests the data sync endpoints:
 * - POST /v1/sync/projects - Create/update project
 * - POST /v1/sync/checkpoints - Create checkpoint
 * - POST /v1/sync/blobs - Upload blob
 * - POST /v1/sync/blobs/check - Check existing blobs
 * - POST /v1/sync/sessions - Sync chat session
 * - POST /v1/sync/messages - Sync message
 * - POST /v1/sync/messages/batch - Batch sync messages
 * - POST /v1/sync/terminal-events - Sync terminal event
 * - POST /v1/sync/events - Sync generic event
 * - GET /v1/sync/quota - Get storage quota
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
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Sync Routes", () => {
  // ==========================================================================
  // POST /v1/sync/projects
  // ==========================================================================
  describe("POST /v1/sync/projects", () => {
    it("should create a new project", async () => {
      const res = await request(app)
        .post("/v1/sync/projects")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          id: "proj_new_001",
          name: "New Project",
          rootPath: "/home/user/new-project",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.projectId).toBe("proj_new_001");
    });

    it("should update an existing project", async () => {
      const res = await request(app)
        .post("/v1/sync/projects")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          id: "proj_test_001",
          name: "Updated Project Name",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/v1/sync/projects")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "No ID" });

      expect(res.status).toBe(400);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app)
        .post("/v1/sync/projects")
        .send({ id: "proj_unauthed", name: "Unauthed" });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // POST /v1/sync/checkpoints
  // ==========================================================================
  describe("POST /v1/sync/checkpoints", () => {
    it("should create a checkpoint for an owned project", async () => {
      const res = await request(app)
        .post("/v1/sync/checkpoints")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          id: "cp_sync_001",
          projectId: "proj_test_001",
          name: "New Checkpoint",
          manifestHash: "abc123hash",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.checkpointId).toBe("cp_sync_001");
    });

    it("should return 403 for non-owned project (consent gate blocks)", async () => {
      const res = await request(app)
        .post("/v1/sync/checkpoints")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          id: "cp_other",
          projectId: "proj_nonexistent",
          name: "Orphan Checkpoint",
          manifestHash: "hash",
        });

      // The consent service's checkConsent returns { allowed: false } when
      // the project is not found, which results in a 403 before the ownership check.
      expect(res.status).toBe(403);
    });

    it("should return 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/v1/sync/checkpoints")
        .set("X-API-Key", TEST_API_KEY)
        .send({ id: "cp_bad" });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // POST /v1/sync/blobs
  // ==========================================================================
  describe("POST /v1/sync/blobs", () => {
    it("should upload a new blob", async () => {
      const res = await request(app)
        .post("/v1/sync/blobs")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          hash: "new_blob_hash",
          size: 1024,
          content: "dGVzdCBjb250ZW50",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exists).toBe(false);
      expect(res.body.hash).toBe("new_blob_hash");
    });

    it("should detect existing blob and return exists: true", async () => {
      mockBlobs.push({
        hash: "existing_blob",
        userId: "user_test_001",
        size: 512,
        content: "ZXhpc3Rpbmc=",
        storageType: "inline",
      });

      const res = await request(app)
        .post("/v1/sync/blobs")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          hash: "existing_blob",
          size: 512,
          content: "ZXhpc3Rpbmc=",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.exists).toBe(true);
    });

    it("should return 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/v1/sync/blobs")
        .set("X-API-Key", TEST_API_KEY)
        .send({ hash: "incomplete" });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // POST /v1/sync/blobs/check
  // ==========================================================================
  describe("POST /v1/sync/blobs/check", () => {
    it("should return existing and missing blobs", async () => {
      mockBlobs.push({
        hash: "check_exists",
        userId: "user_test_001",
        size: 100,
        content: "YQ==",
        storageType: "inline",
      });

      const res = await request(app)
        .post("/v1/sync/blobs/check")
        .set("X-API-Key", TEST_API_KEY)
        .send({ hashes: ["check_exists", "check_missing"] });

      expect(res.status).toBe(200);
      expect(res.body.existing).toContain("check_exists");
      expect(res.body.missing).toContain("check_missing");
    });
  });

  // ==========================================================================
  // POST /v1/sync/sessions
  // ==========================================================================
  describe("POST /v1/sync/sessions", () => {
    it("should create a chat session", async () => {
      const res = await request(app)
        .post("/v1/sync/sessions")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          id: "sess_sync_001",
          projectId: "proj_test_001",
          tool: "claude-code",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessionId).toBe("sess_sync_001");
    });

    it("should return 400 for missing fields", async () => {
      const res = await request(app)
        .post("/v1/sync/sessions")
        .set("X-API-Key", TEST_API_KEY)
        .send({ id: "bad_session" });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // POST /v1/sync/messages
  // ==========================================================================
  describe("POST /v1/sync/messages", () => {
    it("should sync a message", async () => {
      const res = await request(app)
        .post("/v1/sync/messages")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          sessionId: "sess_001",
          projectId: "proj_test_001",
          role: "user",
          content: "Hello, world!",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("messageId");
    });

    it("should return 400 for invalid role", async () => {
      const res = await request(app)
        .post("/v1/sync/messages")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          sessionId: "sess_001",
          projectId: "proj_test_001",
          role: "invalid_role",
          content: "Bad role",
        });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // POST /v1/sync/messages/batch
  // ==========================================================================
  describe("POST /v1/sync/messages/batch", () => {
    it("should batch sync multiple messages", async () => {
      const res = await request(app)
        .post("/v1/sync/messages/batch")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          messages: [
            {
              sessionId: "sess_001",
              projectId: "proj_test_001",
              role: "user",
              content: "First message",
            },
            {
              sessionId: "sess_001",
              projectId: "proj_test_001",
              role: "assistant",
              content: "Second message",
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.synced).toBe(2);
      expect(res.body.total).toBe(2);
    });
  });

  // ==========================================================================
  // POST /v1/sync/terminal-events
  // ==========================================================================
  describe("POST /v1/sync/terminal-events", () => {
    it("should sync a terminal event", async () => {
      const res = await request(app)
        .post("/v1/sync/terminal-events")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          eventType: "command",
          command: "npm test",
          exitCode: 0,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("eventId");
    });

    it("should return 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/v1/sync/terminal-events")
        .set("X-API-Key", TEST_API_KEY)
        .send({ command: "npm test" });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // POST /v1/sync/events
  // ==========================================================================
  describe("POST /v1/sync/events", () => {
    it("should sync a generic event", async () => {
      const res = await request(app)
        .post("/v1/sync/events")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          eventType: "file_change",
          payload: { files: ["src/index.ts"] },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("eventId");
    });
  });

  // ==========================================================================
  // GET /v1/sync/quota
  // ==========================================================================
  describe("GET /v1/sync/quota", () => {
    it("should return storage quota info", async () => {
      const res = await request(app)
        .get("/v1/sync/quota")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("used");
      expect(res.body).toHaveProperty("limit");
      expect(res.body).toHaveProperty("percentage");
      expect(res.body).toHaveProperty("plan");
    });
  });
});
