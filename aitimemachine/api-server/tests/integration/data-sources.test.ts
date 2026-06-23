/**
 * Integration Tests: Data Sources Routes
 *
 * Tests the /v1/data-sources endpoints:
 * - GET    /v1/data-sources          - List data sources
 * - POST   /v1/data-sources          - Create a data source (scrape URL)
 * - GET    /v1/data-sources/:id      - Get data source details
 * - DELETE /v1/data-sources/:id      - Delete a data source
 * - GET    /v1/data-sources/:id/content - Get scraped content
 * - PATCH  /v1/data-sources/:id      - Rename data source
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockProjects,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Data Sources Routes - /v1/data-sources", () => {
  // ========================================================================
  // GET /v1/data-sources - List data sources
  // ========================================================================
  describe("GET /v1/data-sources", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/data-sources");

      expect(res.status).toBe(401);
    });

    it("should return a list of data sources", async () => {
      const res = await request(app)
        .get("/v1/data-sources")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty("has_more");
    });
  });

  // ========================================================================
  // POST /v1/data-sources - Create data source
  // ========================================================================
  describe("POST /v1/data-sources", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/data-sources")
        .send({ url: "https://example.com" });

      expect(res.status).toBe(401);
    });

    it("should create a new data source with a valid URL", async () => {
      const res = await request(app)
        .post("/v1/data-sources")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          url: "https://example.com/docs",
          name: "Example Docs",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.id).toMatch(/^ds_/);
      expect(res.body).toHaveProperty("url", "https://example.com/docs");
      expect(res.body).toHaveProperty("created_at");
    });

    it("should return 400 when url is missing", async () => {
      const res = await request(app)
        .post("/v1/data-sources")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "No URL" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should return 400 for an invalid URL", async () => {
      const res = await request(app)
        .post("/v1/data-sources")
        .set("X-API-Key", TEST_API_KEY)
        .send({ url: "not-a-valid-url" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });
  });

  // ========================================================================
  // GET /v1/data-sources/:id - Get data source details
  // ========================================================================
  describe("GET /v1/data-sources/:id", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/data-sources/proj_test_001");

      expect(res.status).toBe(401);
    });

    it("should return data source details for existing project", async () => {
      const res = await request(app)
        .get("/v1/data-sources/proj_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", "proj_test_001");
      expect(res.body).toHaveProperty("name");
      expect(res.body).toHaveProperty("status");
    });

    it("should return 404 for a non-existent data source", async () => {
      const res = await request(app)
        .get("/v1/data-sources/ds_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  // ========================================================================
  // DELETE /v1/data-sources/:id - Delete data source
  // ========================================================================
  describe("DELETE /v1/data-sources/:id", () => {
    it("should require authentication", async () => {
      const res = await request(app).delete("/v1/data-sources/proj_test_001");

      expect(res.status).toBe(401);
    });

    it("should delete an existing data source", async () => {
      const res = await request(app)
        .delete("/v1/data-sources/proj_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("deleted", true);
      expect(res.body).toHaveProperty("id", "proj_test_001");
    });

    it("should return 404 for a non-existent data source", async () => {
      const res = await request(app)
        .delete("/v1/data-sources/ds_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  // ========================================================================
  // PATCH /v1/data-sources/:id - Rename data source
  // ========================================================================
  describe("PATCH /v1/data-sources/:id", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .patch("/v1/data-sources/proj_test_001")
        .send({ name: "Renamed" });

      expect(res.status).toBe(401);
    });

    it("should rename an existing data source", async () => {
      const res = await request(app)
        .patch("/v1/data-sources/proj_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "Renamed Data Source" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", "proj_test_001");
      expect(res.body).toHaveProperty("name", "Renamed Data Source");
      expect(res.body).toHaveProperty("updated_at");
    });

    it("should return 404 for a non-existent data source", async () => {
      const res = await request(app)
        .patch("/v1/data-sources/ds_nonexistent")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "Fail" });

      expect(res.status).toBe(404);
    });
  });
});
