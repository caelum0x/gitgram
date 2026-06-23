/**
 * Integration Tests: Web Search Routes
 *
 * Tests the web search endpoints:
 * - POST /v1/web-search - Perform web search
 * - POST /v1/web-search/scrape - Scrape URL content
 * - GET /v1/web-search/history - Get search history
 * - GET /v1/web-search/providers - Get available providers
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockEvents,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Web Search Routes", () => {
  // ==========================================================================
  // POST /v1/web-search - Perform search
  // ==========================================================================
  describe("POST /v1/web-search", () => {
    it("should perform a web search and return results", async () => {
      const res = await request(app)
        .post("/v1/web-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({ query: "test search query" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("results");
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("query");
      expect(res.body.query).toBe("test search query");
      expect(res.body).toHaveProperty("provider");
    });

    it("should return 400 for missing query", async () => {
      const res = await request(app)
        .post("/v1/web-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
    });

    it("should return 400 for empty query", async () => {
      const res = await request(app)
        .post("/v1/web-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({ query: "" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for query exceeding 500 characters", async () => {
      const res = await request(app)
        .post("/v1/web-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({ query: "a".repeat(501) });

      expect(res.status).toBe(400);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app)
        .post("/v1/web-search")
        .send({ query: "test" });

      expect(res.status).toBe(401);
    });

    it("should accept optional parameters", async () => {
      const res = await request(app)
        .post("/v1/web-search")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "test with options",
          limit: 5,
          safe_search: false,
          region: "US",
          language: "en",
        });

      expect(res.status).toBe(200);
      expect(res.body.safe_search).toBe(false);
    });
  });

  // ==========================================================================
  // POST /v1/web-search/scrape - Scrape URL
  // ==========================================================================
  describe("POST /v1/web-search/scrape", () => {
    it("should scrape content from a URL", async () => {
      const res = await request(app)
        .post("/v1/web-search/scrape")
        .set("X-API-Key", TEST_API_KEY)
        .send({ url: "https://example.com" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("provider");
    });

    it("should return 400 for missing URL", async () => {
      const res = await request(app)
        .post("/v1/web-search/scrape")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid URL", async () => {
      const res = await request(app)
        .post("/v1/web-search/scrape")
        .set("X-API-Key", TEST_API_KEY)
        .send({ url: "not-a-url" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid selectors type", async () => {
      const res = await request(app)
        .post("/v1/web-search/scrape")
        .set("X-API-Key", TEST_API_KEY)
        .send({ url: "https://example.com", selectors: "not-an-array" });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // GET /v1/web-search/history - Search history
  // ==========================================================================
  describe("GET /v1/web-search/history", () => {
    it("should return search history for authenticated user", async () => {
      // Seed some search history events
      mockEvents.push(
        {
          id: "evt_ws_001",
          projectId: "system",
          userId: "user_test_001",
          eventType: "web_search",
          payload: {
            id: "ws_001",
            query: "first search",
            results_count: 5,
            safe_search: true,
            provider: "mock",
          },
          timestamp: new Date(),
        },
        {
          id: "evt_ws_002",
          projectId: "system",
          userId: "user_test_001",
          eventType: "web_search",
          payload: {
            id: "ws_002",
            query: "second search",
            results_count: 3,
            safe_search: false,
            provider: "mock",
          },
          timestamp: new Date(),
        }
      );

      const res = await request(app)
        .get("/v1/web-search/history")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("pagination");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should support pagination", async () => {
      const res = await request(app)
        .get("/v1/web-search/history")
        .set("X-API-Key", TEST_API_KEY)
        .query({ limit: "5", offset: "0" });

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
      expect(res.body.pagination.offset).toBe(0);
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/v1/web-search/history");

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // GET /v1/web-search/providers - List providers
  // ==========================================================================
  describe("GET /v1/web-search/providers", () => {
    it("should return available search and scraping providers", async () => {
      const res = await request(app)
        .get("/v1/web-search/providers")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("search");
      expect(res.body).toHaveProperty("scraping");
      expect(res.body.search).toHaveProperty("active_provider");
      expect(res.body.search).toHaveProperty("available_providers");
      expect(res.body.scraping).toHaveProperty("active_provider");
      expect(res.body.scraping).toHaveProperty("available_providers");
    });

    it("should return 401 without authentication", async () => {
      const res = await request(app).get("/v1/web-search/providers");

      expect(res.status).toBe(401);
    });
  });
});
