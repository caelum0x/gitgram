/**
 * Integration Tests: Export Routes
 *
 * Tests the export endpoints including:
 * - POST /v1/export/training - Create training export job
 * - POST /v1/export/analytics - Create analytics export job
 * - GET /v1/export/status/:id - Check export job status
 * - GET /v1/export/download/:id - Download export data
 * - GET /v1/export/jobs - List export jobs for user
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { seedTestData, createTestApp, TEST_API_KEY } from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Export Routes", () => {
  // ==========================================================================
  // POST /v1/export/training
  // ==========================================================================
  describe("POST /v1/export/training", () => {
    it("should return 202 with job info for valid training export request", async () => {
      const res = await request(app)
        .post("/v1/export/training")
        .set("x-api-key", TEST_API_KEY)
        .send({ format: "openai" });

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty("id");
      expect(res.body.id).toMatch(/^exp_/);
      expect(res.body.status).toBe("processing");
      expect(res.body.type).toBe("training");
      expect(res.body.format).toBe("openai");
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body).toHaveProperty("message");
    });

    it("should return 400 for invalid format", async () => {
      const res = await request(app)
        .post("/v1/export/training")
        .set("x-api-key", TEST_API_KEY)
        .send({ format: "invalid_format" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.type).toBe("invalid_request_error");
      expect(res.body.error.message).toContain("format must be");
    });

    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/export/training")
        .send({ format: "openai" });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // POST /v1/export/analytics
  // ==========================================================================
  describe("POST /v1/export/analytics", () => {
    it("should return 202 with job info for valid analytics export request", async () => {
      const res = await request(app)
        .post("/v1/export/analytics")
        .set("x-api-key", TEST_API_KEY)
        .send({ format: "json" });

      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty("id");
      expect(res.body.id).toMatch(/^exp_/);
      expect(res.body.status).toBe("processing");
      expect(res.body.type).toBe("analytics");
      expect(res.body.format).toBe("json");
      expect(res.body).toHaveProperty("createdAt");
      expect(res.body).toHaveProperty("message");
    });

    it("should return 400 for invalid format like xml", async () => {
      const res = await request(app)
        .post("/v1/export/analytics")
        .set("x-api-key", TEST_API_KEY)
        .send({ format: "xml" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.type).toBe("invalid_request_error");
      expect(res.body.error.message).toContain("format must be");
    });
  });

  // ==========================================================================
  // GET /v1/export/status/:id
  // ==========================================================================
  describe("GET /v1/export/status/:id", () => {
    it("should return 404 for non-existent job", async () => {
      const res = await request(app)
        .get("/v1/export/status/exp_nonexistent")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.type).toBe("not_found_error");
    });

    it("should return job details after creation", async () => {
      // Create a training export job first
      const createRes = await request(app)
        .post("/v1/export/training")
        .set("x-api-key", TEST_API_KEY)
        .send({ format: "anthropic" });

      expect(createRes.status).toBe(202);
      const jobId = createRes.body.id;

      // Check the status of the created job (found in-memory)
      const statusRes = await request(app)
        .get(`/v1/export/status/${jobId}`)
        .set("x-api-key", TEST_API_KEY);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.id).toBe(jobId);
      expect(statusRes.body.type).toBe("training");
      expect(statusRes.body.format).toBe("anthropic");
      expect(statusRes.body).toHaveProperty("status");
      expect(statusRes.body).toHaveProperty("createdAt");
    });
  });

  // ==========================================================================
  // GET /v1/export/download/:id
  // ==========================================================================
  describe("GET /v1/export/download/:id", () => {
    it("should return 404 for non-existent job", async () => {
      const res = await request(app)
        .get("/v1/export/download/exp_nonexistent")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.type).toBe("not_found_error");
    });

    it("should return 409 when job is not yet completed", async () => {
      // Create a training export job
      const createRes = await request(app)
        .post("/v1/export/training")
        .set("x-api-key", TEST_API_KEY)
        .send({ format: "generic" });

      expect(createRes.status).toBe(202);
      const jobId = createRes.body.id;

      // Immediately attempt to download before async processing completes
      const downloadRes = await request(app)
        .get(`/v1/export/download/${jobId}`)
        .set("x-api-key", TEST_API_KEY);

      expect(downloadRes.status).toBe(409);
      expect(downloadRes.body).toHaveProperty("error");
      expect(downloadRes.body.error.type).toBe("conflict_error");
    });
  });

  // ==========================================================================
  // GET /v1/export/jobs
  // ==========================================================================
  describe("GET /v1/export/jobs", () => {
    it("should return jobs list for authenticated user", async () => {
      // Create a couple of export jobs first
      await request(app)
        .post("/v1/export/training")
        .set("x-api-key", TEST_API_KEY)
        .send({ format: "openai" });

      await request(app)
        .post("/v1/export/analytics")
        .set("x-api-key", TEST_API_KEY)
        .send({ format: "csv" });

      const res = await request(app)
        .get("/v1/export/jobs")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("jobs");
      expect(res.body).toHaveProperty("total");
      expect(Array.isArray(res.body.jobs)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(res.body.jobs.length).toBe(res.body.total);
    });
  });
});
