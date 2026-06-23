import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { seedTestData, createTestApp, TEST_API_KEY } from "../setup.js";

describe("Data Pipeline Integration", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedTestData();
  });

  describe("POST /v1/pipeline", () => {
    it("returns 201 with job id and status", async () => {
      const res = await request(app)
        .post("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY)
        .send({ format: "openai", redact_secrets: true });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.id).toMatch(/^pipeline_mock_/);
      expect(res.body).toHaveProperty("status");
    });

    it("returns created_at in response", async () => {
      const res = await request(app)
        .post("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY)
        .send({ format: "openai", redact_secrets: true });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("created_at");
    });
  });

  describe("GET /v1/pipeline", () => {
    it("returns array of jobs including the created one", async () => {
      const createRes = await request(app)
        .post("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY)
        .send({ format: "openai", redact_secrets: true });

      const jobId = createRes.body.id;

      const res = await request(app)
        .get("/v1/pipeline")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((job: { id: string }) => job.id === jobId)).toBe(true);
    });
  });

  describe("GET /v1/pipeline/:id", () => {
    it("returns job details with correct id", async () => {
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
    });

    it("returns 404 for non-existent job", async () => {
      const res = await request(app)
        .get("/v1/pipeline/pipeline_mock_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /v1/pipeline/schedule", () => {
    it("returns cancelled: true", async () => {
      const res = await request(app)
        .delete("/v1/pipeline/schedule")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("cancelled", true);
    });
  });
});
