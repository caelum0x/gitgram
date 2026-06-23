/**
 * Integration Tests: Contexts CRUD Operations
 *
 * Tests the /v1/contexts endpoints:
 * - GET /v1/contexts          - List contexts
 * - POST /v1/contexts         - Create a new context
 * - GET /v1/contexts/:id      - Get context by ID
 * - PUT /v1/contexts/:id      - Update a context
 * - DELETE /v1/contexts/:id   - Delete a context
 * - GET /v1/contexts/search/text - Text search
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockSavedContexts,
  mockProjects,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Contexts API - /v1/contexts", () => {
  // ========================================================================
  // GET /v1/contexts - List contexts
  // ========================================================================
  describe("GET /v1/contexts", () => {
    it("should return a list of contexts for the authenticated user", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty("has_more");
      expect(res.body).toHaveProperty("limit");
      expect(res.body).toHaveProperty("offset");
    });

    it("should return contexts with expected fields", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        const ctx = res.body.data[0];
        expect(ctx).toHaveProperty("id");
        expect(ctx).toHaveProperty("name");
        expect(ctx).toHaveProperty("project_id");
        expect(ctx).toHaveProperty("tool");
        expect(ctx).toHaveProperty("created_at");
      }
    });

    it("should support limit and offset query parameters", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .query({ limit: 5, offset: 0 })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(5);
      expect(res.body.offset).toBe(0);
    });

    it("should filter by projectId when provided", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .query({ projectId: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
    });

    it("should support snake_case project_id parameter", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .query({ project_id: "proj_test_001" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
    });

    it("should filter by tool when provided", async () => {
      const res = await request(app)
        .get("/v1/contexts")
        .query({ tool: "claude-code" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
    });

    it("should require authentication", async () => {
      const res = await request(app).get("/v1/contexts");

      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // POST /v1/contexts - Create context
  // ========================================================================
  describe("POST /v1/contexts", () => {
    it("should create a new context with required fields", async () => {
      const res = await request(app)
        .post("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          name: "New Context",
          messages: [
            { role: "user", content: "How do I do X?" },
            { role: "assistant", content: "You can do X by..." },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("New Context");
      expect(res.body.message_count).toBe(2);
    });

    it("should return 400 when projectId is missing", async () => {
      const res = await request(app)
        .post("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          name: "Context Without Project",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should return 400 when name is missing", async () => {
      const res = await request(app)
        .post("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should accept optional fields", async () => {
      const res = await request(app)
        .post("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          name: "Full Context",
          description: "A comprehensive context",
          messages: [
            { role: "system", content: "You are a helpful assistant." },
          ],
          tool: "cursor",
          tags: ["feature", "review"],
          gitBranch: "feature/new-thing",
          openFiles: ["src/main.ts", "src/utils.ts"],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.id).toMatch(/^ctx_/);
    });

    it("should support snake_case field names", async () => {
      const res = await request(app)
        .post("/v1/contexts")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          project_id: "proj_test_001",
          name: "Snake Case Context",
          git_branch: "main",
          open_files: ["README.md"],
          is_auto_saved: true,
        });

      expect(res.status).toBe(201);
    });

    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/contexts")
        .send({
          projectId: "proj_test_001",
          name: "Unauthenticated Context",
        });

      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // GET /v1/contexts/:id - Get context by ID
  // ========================================================================
  describe("GET /v1/contexts/:id", () => {
    it("should return a specific context by ID", async () => {
      const res = await request(app)
        .get("/v1/contexts/ctx_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("ctx_test_001");
      expect(res.body.name).toBe("Test Context");
      expect(res.body).toHaveProperty("messages");
      expect(res.body).toHaveProperty("project_id");
    });

    it("should return full context details including messages", async () => {
      const res = await request(app)
        .get("/v1/contexts/ctx_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body).toHaveProperty("system_prompt");
      expect(res.body).toHaveProperty("open_files");
      expect(res.body).toHaveProperty("git_branch");
      expect(res.body).toHaveProperty("tool");
      expect(res.body).toHaveProperty("tags");
      expect(res.body).toHaveProperty("created_at");
      expect(res.body).toHaveProperty("updated_at");
    });

    it("should return 404 for a non-existent context", async () => {
      const res = await request(app)
        .get("/v1/contexts/ctx_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
    });

    it("should require authentication", async () => {
      const res = await request(app).get("/v1/contexts/ctx_test_001");

      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // PUT /v1/contexts/:id - Update context
  // ========================================================================
  describe("PUT /v1/contexts/:id", () => {
    it("should update a context name", async () => {
      const res = await request(app)
        .put("/v1/contexts/ctx_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          name: "Updated Context Name",
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated Context Name");
      expect(res.body).toHaveProperty("updated_at");
    });

    it("should update context description", async () => {
      const res = await request(app)
        .put("/v1/contexts/ctx_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          description: "Updated description",
        });

      expect(res.status).toBe(200);
    });

    it("should update context tags", async () => {
      const res = await request(app)
        .put("/v1/contexts/ctx_test_001")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          tags: ["updated", "production"],
        });

      expect(res.status).toBe(200);
    });

    it("should return 404 when updating a non-existent context", async () => {
      const res = await request(app)
        .put("/v1/contexts/ctx_nonexistent")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          name: "Should Fail",
        });

      expect(res.status).toBe(404);
    });

    it("should require authentication", async () => {
      const res = await request(app)
        .put("/v1/contexts/ctx_test_001")
        .send({ name: "No Auth" });

      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // DELETE /v1/contexts/:id - Delete context
  // ========================================================================
  describe("DELETE /v1/contexts/:id", () => {
    it("should delete a context and return confirmation", async () => {
      const res = await request(app)
        .delete("/v1/contexts/ctx_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("deleted", true);
      expect(res.body).toHaveProperty("id", "ctx_test_001");
    });

    it("should return 404 when deleting a non-existent context", async () => {
      const res = await request(app)
        .delete("/v1/contexts/ctx_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should require authentication", async () => {
      const res = await request(app).delete("/v1/contexts/ctx_test_001");

      expect(res.status).toBe(401);
    });
  });

  // ========================================================================
  // GET /v1/contexts/search/text - Text search
  // ========================================================================
  describe("GET /v1/contexts/search/text", () => {
    it("should search contexts by query string", async () => {
      const res = await request(app)
        .get("/v1/contexts/search/text")
        .query({ q: "debugging" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "debugging");
      expect(res.body).toHaveProperty("results");
      expect(res.body).toHaveProperty("total");
    });

    it("should accept 'query' parameter as alternative to 'q'", async () => {
      const res = await request(app)
        .get("/v1/contexts/search/text")
        .query({ query: "test" })
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "test");
    });

    it("should return 400 when no search query is provided", async () => {
      const res = await request(app)
        .get("/v1/contexts/search/text")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should require authentication", async () => {
      const res = await request(app)
        .get("/v1/contexts/search/text")
        .query({ q: "test" });

      expect(res.status).toBe(401);
    });
  });
});
