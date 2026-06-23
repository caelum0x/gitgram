/**
 * Integration Tests: Knowledge Base Routes
 *
 * Tests the /v1/knowledge-base endpoints:
 * - GET  /v1/knowledge-base/files               - List KB files
 * - GET  /v1/knowledge-base/files/search         - Search KB files
 * - GET  /v1/knowledge-base/artifacts            - List artifacts
 * - GET  /v1/knowledge-base/artifacts/:id        - Get artifact by ID
 * - GET  /v1/knowledge-base/search               - Search across files
 * - GET  /v1/knowledge-base/stats                - Storage statistics
 * - GET  /v1/knowledge-base/embeddings/status    - Embedding coverage
 * - GET  /v1/knowledge-base/unified-search       - Unified search
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockKnowledgeBaseFiles,
  mockKnowledgeBaseArtifacts,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Knowledge Base Routes - /v1/knowledge-base", () => {
  // ========================================================================
  // GET /v1/knowledge-base/files - List files
  // ========================================================================
  describe("GET /v1/knowledge-base/files", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/knowledge-base/files");

      expect(res.status).toBe(401);
    });

    it("should return a list of KB files", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/files")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("files");
      expect(Array.isArray(res.body.files)).toBe(true);
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("limit");
      expect(res.body).toHaveProperty("offset");
    });

    it("should support pagination parameters", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/files")
        .query({ limit: 10, offset: 0 })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(10);
      expect(res.body.offset).toBe(0);
    });
  });

  // ========================================================================
  // GET /v1/knowledge-base/files/search - Search files
  // ========================================================================
  describe("GET /v1/knowledge-base/files/search", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/files/search")
        .query({ q: "test" });

      expect(res.status).toBe(401);
    });

    it("should return 400 when query is missing", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/files/search")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should search files with a valid query", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/files/search")
        .query({ q: "index" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "index");
      expect(res.body).toHaveProperty("results");
      expect(res.body).toHaveProperty("total");
    });
  });

  // ========================================================================
  // GET /v1/knowledge-base/artifacts - List artifacts
  // ========================================================================
  describe("GET /v1/knowledge-base/artifacts", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/knowledge-base/artifacts");

      expect(res.status).toBe(401);
    });

    it("should return a list of artifacts", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/artifacts")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("artifacts");
      expect(Array.isArray(res.body.artifacts)).toBe(true);
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("limit");
      expect(res.body).toHaveProperty("offset");
    });
  });

  // ========================================================================
  // GET /v1/knowledge-base/artifacts/:id - Get artifact by ID
  // ========================================================================
  describe("GET /v1/knowledge-base/artifacts/:id", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/knowledge-base/artifacts/art_001");

      expect(res.status).toBe(401);
    });

    it("should return 404 for a non-existent artifact", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/artifacts/art_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });
  });

  // ========================================================================
  // GET /v1/knowledge-base/search - Search KB
  // ========================================================================
  describe("GET /v1/knowledge-base/search", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/search")
        .query({ query: "test" });

      expect(res.status).toBe(401);
    });

    it("should return 400 when query is missing", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/search")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should return search results", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/search")
        .query({ query: "function" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "function");
      expect(res.body).toHaveProperty("results");
      expect(res.body).toHaveProperty("total");
    });
  });

  // ========================================================================
  // GET /v1/knowledge-base/stats - Storage statistics
  // ========================================================================
  describe("GET /v1/knowledge-base/stats", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/knowledge-base/stats");

      expect(res.status).toBe(401);
    });

    it("should return storage statistics", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/stats")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      // stats response shape depends on getKnowledgeStats service
    });
  });

  // ========================================================================
  // GET /v1/knowledge-base/embeddings/status - Embedding coverage
  // ========================================================================
  describe("GET /v1/knowledge-base/embeddings/status", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/knowledge-base/embeddings/status");

      expect(res.status).toBe(401);
    });

    it("should return embedding status", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/embeddings/status")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("files");
      expect(res.body).toHaveProperty("artifacts");
      expect(res.body).toHaveProperty("overall");
      expect(res.body.overall).toHaveProperty("coverage");
      expect(res.body.overall).toHaveProperty("meets_threshold");
    });
  });

  // ========================================================================
  // GET /v1/knowledge-base/unified-search - Unified search
  // ========================================================================
  describe("GET /v1/knowledge-base/unified-search", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/unified-search")
        .query({ query: "test" });

      expect(res.status).toBe(401);
    });

    it("should return 400 when query is missing", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/unified-search")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should return unified search results", async () => {
      const res = await request(app)
        .get("/v1/knowledge-base/unified-search")
        .query({ query: "test" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "test");
      expect(res.body).toHaveProperty("files");
      expect(res.body).toHaveProperty("artifacts");
      expect(res.body).toHaveProperty("embeddings");
      expect(res.body).toHaveProperty("total");
    });
  });
});
