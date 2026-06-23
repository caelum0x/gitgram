/**
 * Integration Tests: Pipeline Routes
 *
 * Tests the /v1/pipeline endpoints:
 * - POST   /v1/pipeline             - Create a pipeline job
 * - GET    /v1/pipeline             - List pipeline jobs
 * - GET    /v1/pipeline/:id         - Get pipeline job details
 * - GET    /v1/pipeline/:id/download - Download pipeline output
 * - DELETE /v1/pipeline/schedule     - Cancel scheduled pipeline
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Pipeline Routes - /v1/pipeline", () => {
  // ========================================================================
  // POST /v1/pipeline - Create pipeline job
  // ========================================================================
  describe("POST /v1/pipeline", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/pipeline")
        .send({ format: "openai" });

      expect(res.status).toBe(401);
    });

    it("should create a pipeline job", async () => {
      const res = await request(app)
        .post("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          format: "openai",
          redact_secrets: true,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.id).toMatch(/^pipeline_mock_/);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("created_at");
    });

    it("should create a pipeline job with custom options", async () => {
      const res = await request(app)
        .post("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          format: "generic",
          include_chats: true,
          include_code_changes: false,
          include_terminal: false,
          include_checkpoints: true,
          min_turns: 5,
          redact_secrets: true,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("config");
      expect(res.body.config).toHaveProperty("format", "generic");
    });

    it("should create a pipeline with schedule option", async () => {
      const res = await request(app)
        .post("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          format: "openai",
          schedule: "daily",
        });

      expect(res.status).toBe(201);
      expect(res.body.config).toHaveProperty("schedule", "daily");
    });
  });

  // ========================================================================
  // GET /v1/pipeline - List pipeline jobs
  // ========================================================================
  describe("GET /v1/pipeline", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/pipeline");

      expect(res.status).toBe(401);
    });

    it("should return a list of pipeline jobs", async () => {
      const res = await request(app)
        .get("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("should include created jobs in the list", async () => {
      // Create a job first
      await request(app)
        .post("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY)
        .send({ format: "openai", redact_secrets: true });

      const res = await request(app)
        .get("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ========================================================================
  // GET /v1/pipeline/:id - Get pipeline job details
  // ========================================================================
  describe("GET /v1/pipeline/:id", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/pipeline/some_id");

      expect(res.status).toBe(401);
    });

    it("should return 404 for a non-existent job", async () => {
      const res = await request(app)
        .get("/v1/pipeline/pipeline_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should return job details for an existing job", async () => {
      // Create a job first
      const createRes = await request(app)
        .post("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY)
        .send({ format: "openai", redact_secrets: true });

      const jobId = createRes.body.id;

      const res = await request(app)
        .get(`/v1/pipeline/${jobId}`)
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", jobId);
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("progress");
      expect(res.body).toHaveProperty("created_at");
    });
  });

  // ========================================================================
  // DELETE /v1/pipeline/schedule - Cancel scheduled pipeline
  // ========================================================================
  describe("DELETE /v1/pipeline/schedule", () => {
    it("should require authentication", async () => {
      const res = await request(app).delete("/v1/pipeline/schedule");

      expect(res.status).toBe(401);
    });

    it("should return a cancellation response", async () => {
      const res = await request(app)
        .delete("/v1/pipeline/schedule")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("cancelled");
      expect(res.body).toHaveProperty("message");
    });
  });
});
