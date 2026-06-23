/**
 * Integration Tests: Universal Search
 *
 * Tests the /v1/universal-search endpoints:
 * - POST /v1/universal-search     - Search across all sources
 * - POST /v1/universal-search/query - Conversational query
 * - GET  /v1/universal-search/sources - List available sources
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockSavedContexts,
  mockChatMessages,
  mockCodeEmbeddings,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Universal Search API - /v1/universal-search", () => {
  // ========================================================================
  // POST /v1/universal-search - Basic search
  // ========================================================================
  describe("POST /v1/universal-search", () => {
    it("should perform a search with a valid query", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "debugging",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "debugging");
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty("pagination");
    });

    it("should include pagination information", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test",
        });

      expect(res.status).toBe(200);
      const { pagination } = res.body;
      expect(pagination).toHaveProperty("total");
      expect(pagination).toHaveProperty("limit");
      expect(pagination).toHaveProperty("offset");
      expect(pagination).toHaveProperty("has_more");
      expect(typeof pagination.total).toBe("number");
      expect(typeof pagination.limit).toBe("number");
      expect(typeof pagination.offset).toBe("number");
      expect(typeof pagination.has_more).toBe("boolean");
    });

    it("should return search_mode and sources in the response", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "hello",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("search_mode");
      expect(res.body).toHaveProperty("sources");
    });

    it("should return 400 when query is missing", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should return 400 when query is empty string", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "",
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 when query is whitespace-only", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "   ",
        });

      expect(res.status).toBe(400);
    });

    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .send({ query: "test" });

      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // Filtered search
  // ========================================================================
  describe("POST /v1/universal-search - Filtered search", () => {
    it("should accept sources filter", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test",
          sources: ["context"],
        });

      expect(res.status).toBe(200);
      expect(res.body.sources).toEqual(["context"]);
    });

    it("should accept search_mode parameter", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "function",
          search_mode: "unified",
        });

      expect(res.status).toBe(200);
      expect(res.body.search_mode).toBe("unified");
    });

    it("should accept repositories filter", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "handler",
          repositories: ["repo_001"],
        });

      expect(res.status).toBe(200);
    });

    it("should accept data_sources filter", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "documentation",
          data_sources: ["ds_001"],
        });

      expect(res.status).toBe(200);
    });
  });

  // ========================================================================
  // Pagination
  // ========================================================================
  describe("POST /v1/universal-search - Pagination", () => {
    it("should accept custom limit", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test",
          limit: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });

    it("should accept custom offset", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test",
          offset: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.pagination.offset).toBe(10);
    });

    it("should accept both limit and offset together", async () => {
      const res = await request(app)
        .post("/v1/universal-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test",
          limit: 5,
          offset: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.pagination.offset).toBe(10);
    });
  });

  // ========================================================================
  // POST /v1/universal-search/query - Conversational query
  // ========================================================================
  describe("POST /v1/universal-search/query", () => {
    it("should accept a query with context", async () => {
      const res = await request(app)
        .post("/v1/universal-search/query")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "how to fix the bug",
          context: [
            { role: "user", content: "I found a bug in the auth module" },
            { role: "assistant", content: "Let me look at the auth middleware" },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "how to fix the bug");
      expect(res.body).toHaveProperty("context_length", 2);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("pagination");
    });

    it("should return 400 when query is missing", async () => {
      const res = await request(app)
        .post("/v1/universal-search/query")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          context: [],
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 when context has invalid format", async () => {
      const res = await request(app)
        .post("/v1/universal-search/query")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test",
          context: "invalid-not-an-array",
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 when context messages have invalid roles", async () => {
      const res = await request(app)
        .post("/v1/universal-search/query")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test",
          context: [{ role: "invalid_role", content: "hello" }],
        });

      expect(res.status).toBe(400);
    });

    it("should work with empty context array", async () => {
      const res = await request(app)
        .post("/v1/universal-search/query")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test",
          context: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.context_length).toBe(0);
    });

    it("should include source_breakdown when include_sources is true", async () => {
      const res = await request(app)
        .post("/v1/universal-search/query")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test",
          include_sources: true,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("source_breakdown");
    });

    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/universal-search/query")
        .send({ query: "test" });

      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // GET /v1/universal-search/sources - List available sources
  // ========================================================================
  describe("GET /v1/universal-search/sources", () => {
    it("should return a list of available search sources", async () => {
      const res = await request(app)
        .get("/v1/universal-search/sources")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sources");
      expect(Array.isArray(res.body.sources)).toBe(true);

      // Check that expected source types are present
      const sourceIds = res.body.sources.map((s: any) => s.id);
      expect(sourceIds).toContain("code");
      expect(sourceIds).toContain("context");
      expect(sourceIds).toContain("message");
    });

    it("should include search_modes in the response", async () => {
      const res = await request(app)
        .get("/v1/universal-search/sources")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("search_modes");
      expect(Array.isArray(res.body.search_modes)).toBe(true);

      const modeIds = res.body.search_modes.map((m: any) => m.id);
      expect(modeIds).toContain("unified");
      expect(modeIds).toContain("hybrid");
      expect(modeIds).toContain("semantic");
    });

    it("should include metadata about each source", async () => {
      const res = await request(app)
        .get("/v1/universal-search/sources")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      for (const source of res.body.sources) {
        expect(source).toHaveProperty("id");
        expect(source).toHaveProperty("name");
        expect(source).toHaveProperty("description");
        expect(source).toHaveProperty("available");
      }
    });

    it("should require authentication", async () => {
      const res = await request(app).get("/v1/universal-search/sources");

      expect(res.status).toBe(401);
    });
  });
});
