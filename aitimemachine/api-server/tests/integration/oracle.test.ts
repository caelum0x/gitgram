/**
 * Integration Tests: Oracle Research Routes
 *
 * Tests the Oracle autonomous research endpoints:
 * - POST /v1/oracle — create research session
 * - POST /v1/oracle — 400 missing query
 * - GET /v1/oracle/:id — get session status/result
 * - GET /v1/oracle/:id — 404 non-existent
 * - POST /v1/oracle/:id/followup — follow-up question
 * - GET /v1/oracle — list sessions, pagination
 * - DELETE /v1/oracle/:id — cancel session
 * - Auth: 401 without API key
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockOracleSessions,
  mockChatMessages,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Oracle Research Routes", () => {
  // ==========================================================================
  // POST /v1/oracle — Create research session
  // ==========================================================================
  describe("POST /v1/oracle", () => {
    it("should create a research session and return session_id", async () => {
      const res = await request(app)
        .post("/v1/oracle")
        .set("X-API-Key", TEST_API_KEY)
        .send({ query: "What is quantum computing?" });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("session_id");
      expect(res.body.session_id).toMatch(/^oracle_/);
      expect(res.body).toHaveProperty("query", "What is quantum computing?");
      expect(res.body).toHaveProperty("status", "running");
    });

    it("should return 400 when query is missing", async () => {
      const res = await request(app)
        .post("/v1/oracle")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("should return 401 without API key", async () => {
      const res = await request(app)
        .post("/v1/oracle")
        .send({ query: "test" });

      expect(res.status).toBe(401);
    });

    it("should accept optional parameters", async () => {
      const res = await request(app)
        .post("/v1/oracle")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          query: "Machine learning research",
          project_id: "proj_test_001",
          sources: ["https://example.com"],
          max_depth: 5,
          include_web_search: false,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("session_id");
    });
  });

  // ==========================================================================
  // GET /v1/oracle/:id — Get session details
  // ==========================================================================
  describe("GET /v1/oracle/:id", () => {
    it("should return session details for an existing session", async () => {
      // Seed a research job
      mockOracleSessions.push({
        id: "oracle_test_001",
        userId: "user_test_001",
        projectId: null,
        query: "Test query",
        status: "completed",
        progress: 100,
        result: JSON.stringify({ summary: "Test summary", steps: [], sources: [] }),
        sources: ["https://example.com"],
        summary: "Test summary",
        error: null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const res = await request(app)
        .get("/v1/oracle/oracle_test_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", "oracle_test_001");
      expect(res.body).toHaveProperty("query", "Test query");
      expect(res.body).toHaveProperty("status", "completed");
    });

    it("should return 404 for non-existent session", async () => {
      const res = await request(app)
        .get("/v1/oracle/oracle_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should return 401 without API key", async () => {
      const res = await request(app)
        .get("/v1/oracle/oracle_test_001");

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // POST /v1/oracle/:id/followup — Follow-up question
  // ==========================================================================
  describe("POST /v1/oracle/:id/followup", () => {
    beforeEach(() => {
      mockOracleSessions.push({
        id: "oracle_followup_001",
        userId: "user_test_001",
        projectId: null,
        query: "Original research query",
        status: "completed",
        progress: 100,
        result: JSON.stringify({ summary: "Original research summary about AI.", steps: [], sources: [] }),
        sources: [],
        summary: "Original summary",
        error: null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
      });
    });

    it("should process a follow-up question", async () => {
      const res = await request(app)
        .post("/v1/oracle/oracle_followup_001/followup")
        .set("X-API-Key", TEST_API_KEY)
        .send({ message: "Can you elaborate on the key findings?" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("session_id", "oracle_followup_001");
      expect(res.body).toHaveProperty("response");
      expect(res.body).toHaveProperty("status", "completed");
    });

    it("should return 400 when message is missing", async () => {
      const res = await request(app)
        .post("/v1/oracle/oracle_followup_001/followup")
        .set("X-API-Key", TEST_API_KEY)
        .send({});

      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent session", async () => {
      const res = await request(app)
        .post("/v1/oracle/oracle_nonexistent/followup")
        .set("X-API-Key", TEST_API_KEY)
        .send({ message: "test" });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // GET /v1/oracle — List sessions
  // ==========================================================================
  describe("GET /v1/oracle", () => {
    it("should return a list of sessions", async () => {
      mockOracleSessions.push({
        id: "oracle_list_001",
        userId: "user_test_001",
        projectId: null,
        query: "Query 1",
        status: "completed",
        progress: 100,
        createdAt: new Date(),
        completedAt: new Date(),
      });
      mockOracleSessions.push({
        id: "oracle_list_002",
        userId: "user_test_001",
        projectId: null,
        query: "Query 2",
        status: "running",
        progress: 50,
        createdAt: new Date(),
        completedAt: null,
      });

      const res = await request(app)
        .get("/v1/oracle")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sessions");
      expect(Array.isArray(res.body.sessions)).toBe(true);
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(2);
    });

    it("should return 401 without API key", async () => {
      const res = await request(app).get("/v1/oracle");

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // DELETE /v1/oracle/:id — Cancel/delete session
  // ==========================================================================
  describe("DELETE /v1/oracle/:id", () => {
    it("should delete a session", async () => {
      mockOracleSessions.push({
        id: "oracle_delete_001",
        userId: "user_test_001",
        projectId: null,
        query: "Delete me",
        status: "completed",
        progress: 100,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      const res = await request(app)
        .delete("/v1/oracle/oracle_delete_001")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("deleted", true);
      expect(res.body).toHaveProperty("id", "oracle_delete_001");

      // Verify it's deleted
      const remaining = mockOracleSessions.find((s) => s.id === "oracle_delete_001");
      expect(remaining).toBeUndefined();
    });

    it("should return 404 for non-existent session", async () => {
      const res = await request(app)
        .delete("/v1/oracle/oracle_nonexistent")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(404);
    });

    it("should return 401 without API key", async () => {
      const res = await request(app)
        .delete("/v1/oracle/oracle_delete_001");

      expect(res.status).toBe(401);
    });
  });
});
