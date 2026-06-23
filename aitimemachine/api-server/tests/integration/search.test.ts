/**
 * Integration Tests: Search Routes
 *
 * Tests the /v1/search endpoints:
 * - POST /v1/search/universal       - Cross-source search
 * - POST /v1/search/checkpoints     - Checkpoint search
 * - POST /v1/search/conversations   - Message search
 * - POST /v1/search/code            - Code search
 * - POST /v1/search/symbols         - Symbol search
 * - POST /v1/search/find-definition - Definition lookup
 * - POST /v1/search/find-usages     - Usage search
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockCheckpoints,
  mockChatMessages,
  mockCodeEmbeddings,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();

  // Seed search-specific test data
  mockCheckpoints.push({
    id: "cp_search_001",
    userId: "user_test_001",
    projectId: "proj_test_001",
    name: "deploy fix",
    description: "Fixed deployment",
    scope: "full",
    createdAt: new Date(),
  });

  mockChatMessages.push({
    id: "msg_search_001",
    userId: "user_test_001",
    projectId: "proj_test_001",
    sessionId: "sess_001",
    role: "user",
    content: "How do I deploy this app?",
    timestamp: new Date(),
  });

  mockCodeEmbeddings.push({
    id: "emb_001",
    userId: "user_test_001",
    projectId: "proj_test_001",
    filePath: "src/index.ts",
    symbol: "main",
    symbolType: "function",
    content: "function main() { console.log('hello'); }",
    lineStart: 1,
    lineEnd: 3,
    language: "typescript",
    createdAt: new Date(),
  });
});

describe("Search API - /v1/search", () => {
  // ==========================================================================
  // POST /v1/search/universal
  // ==========================================================================
  describe("POST /v1/search/universal", () => {
    it("should return results matching the query", async () => {
      const res = await request(app)
        .post("/v1/search/universal")
        .set("X-API-Key", TEST_API_KEY)
        .send({ query: "deploy" });

      expect(res.status).toBe(200);
      // sendSuccess wraps response in { ok: true, data: { ... } }
      expect(res.body).toHaveProperty("ok", true);
      expect(res.body.data).toHaveProperty("query", "deploy");
      expect(res.body.data).toHaveProperty("sources");
      expect(res.body.data).toHaveProperty("results");
      expect(res.body.data).toHaveProperty("total");
      expect(Array.isArray(res.body.data.results)).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);

      // Verify at least one result came back from either checkpoints or messages
      const sources = res.body.data.results.map((r: any) => r.source);
      expect(
        sources.includes("checkpoint") || sources.includes("message")
      ).toBe(true);
    });

    it("should return 400 without query", async () => {
      const res = await request(app)
        .post("/v1/search/universal")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.type).toBe("validation_error");
      expect(res.body.error.code).toBe("missing_parameter");
      expect(res.body.error.param).toBe("query");
    });

    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/search/universal")
        .send({ query: "deploy" });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // POST /v1/search/checkpoints
  // ==========================================================================
  describe("POST /v1/search/checkpoints", () => {
    it("should return checkpoint results matching the query", async () => {
      const res = await request(app)
        .post("/v1/search/checkpoints")
        .set("X-API-Key", TEST_API_KEY)
        .send({ query: "deploy" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "deploy");
      expect(res.body).toHaveProperty("results");
      expect(res.body).toHaveProperty("total");
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const first = res.body.results[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("scope");
      expect(first).toHaveProperty("project_id");
      expect(first).toHaveProperty("created_at");
    });

    it("should return 400 without query", async () => {
      const res = await request(app)
        .post("/v1/search/checkpoints")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.type).toBe("validation_error");
      expect(res.body.error.code).toBe("missing_parameter");
    });
  });

  // ==========================================================================
  // POST /v1/search/conversations
  // ==========================================================================
  describe("POST /v1/search/conversations", () => {
    it("should return message results with role filter", async () => {
      const res = await request(app)
        .post("/v1/search/conversations")
        .set("X-API-Key", TEST_API_KEY)
        .send({ query: "deploy", role: "user" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "deploy");
      expect(res.body).toHaveProperty("role", "user");
      expect(res.body).toHaveProperty("results");
      expect(res.body).toHaveProperty("total");
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const first = res.body.results[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("role", "user");
      expect(first).toHaveProperty("content");
      expect(first).toHaveProperty("session_id");
      expect(first).toHaveProperty("created_at");
    });

    it("should return 400 without query", async () => {
      const res = await request(app)
        .post("/v1/search/conversations")
        .set("X-API-Key", TEST_API_KEY)
        .send({ role: "user" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.type).toBe("validation_error");
      expect(res.body.error.code).toBe("missing_parameter");
    });
  });

  // ==========================================================================
  // POST /v1/search/code
  // ==========================================================================
  describe("POST /v1/search/code", () => {
    it("should return code results matching the query", async () => {
      const res = await request(app)
        .post("/v1/search/code")
        .set("X-API-Key", TEST_API_KEY)
        .send({ query: "console" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "console");
      expect(res.body).toHaveProperty("results");
      expect(res.body).toHaveProperty("total");
      expect(res.body).toHaveProperty("indexed", true);
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const first = res.body.results[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("file_path");
      expect(first).toHaveProperty("symbol");
      expect(first).toHaveProperty("symbol_type");
      expect(first).toHaveProperty("content_preview");
      expect(first).toHaveProperty("language");
      expect(first).toHaveProperty("project_id");
    });

    it("should return 400 without query", async () => {
      const res = await request(app)
        .post("/v1/search/code")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.type).toBe("validation_error");
      expect(res.body.error.code).toBe("missing_parameter");
    });
  });

  // ==========================================================================
  // POST /v1/search/symbols
  // ==========================================================================
  describe("POST /v1/search/symbols", () => {
    it("should return 400 without symbol", async () => {
      const res = await request(app)
        .post("/v1/search/symbols")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.type).toBe("validation_error");
      expect(res.body.error.code).toBe("missing_parameter");
      expect(res.body.error.param).toBe("symbol");
    });
  });

  // ==========================================================================
  // POST /v1/search/find-definition
  // ==========================================================================
  describe("POST /v1/search/find-definition", () => {
    it("should return found:false when no definition exists", async () => {
      const res = await request(app)
        .post("/v1/search/find-definition")
        .set("X-API-Key", TEST_API_KEY)
        .send({ symbol: "nonExistentSymbol" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("symbol", "nonExistentSymbol");
      expect(res.body).toHaveProperty("found", false);
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toContain("nonExistentSymbol");
    });
  });

  // ==========================================================================
  // POST /v1/search/find-usages
  // ==========================================================================
  describe("POST /v1/search/find-usages", () => {
    it("should return usages array for a symbol found in content", async () => {
      const res = await request(app)
        .post("/v1/search/find-usages")
        .set("X-API-Key", TEST_API_KEY)
        .send({ symbol: "main" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("symbol", "main");
      expect(res.body).toHaveProperty("usages");
      expect(res.body).toHaveProperty("total");
      expect(Array.isArray(res.body.usages)).toBe(true);
      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const first = res.body.usages[0];
      expect(first).toHaveProperty("file_path");
      expect(first).toHaveProperty("in_symbol");
      expect(first).toHaveProperty("symbol_type");
      expect(first).toHaveProperty("line");
      expect(first).toHaveProperty("context");
    });
  });
});
