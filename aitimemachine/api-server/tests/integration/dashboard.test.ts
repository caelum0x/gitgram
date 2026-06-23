/**
 * Integration Tests: Dashboard Routes
 *
 * Tests the dashboard endpoints including:
 * - GET /v1/dashboard/overview - Returns stats and recent data
 * - GET /v1/dashboard/activity - Returns activity timeline
 * - GET /v1/dashboard/search - Search across checkpoints, messages, tool calls
 * - GET /v1/dashboard/projects/:projectId/stats - Project-specific stats
 * - GET /v1/dashboard/projects/:projectId/conversation - Conversation replay
 *
 * All dashboard routes require API key authentication.
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
  mockToolCalls,
  mockChatSessions,
  mockProjects,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Dashboard Routes", () => {
  // ==========================================================================
  // GET /v1/dashboard/overview
  // ==========================================================================
  describe("GET /v1/dashboard/overview", () => {
    it("should return stats and recent data", async () => {
      // Seed data for the overview
      mockCheckpoints.push({
        id: "cp_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        name: "Test Checkpoint",
        description: "test",
        scope: "full",
        createdAt: new Date(),
      });

      mockChatMessages.push({
        id: "msg_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        sessionId: "sess_001",
        role: "user",
        content: "Hello world",
        timestamp: new Date(),
        checkpointId: null,
        isContextInjection: false,
      });

      const res = await request(app)
        .get("/v1/dashboard/overview")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
      expect(res.body.data).toHaveProperty("stats");
      expect(res.body.data).toHaveProperty("recentCheckpoints");
      expect(res.body.data).toHaveProperty("recentMessages");
      expect(Array.isArray(res.body.data.recentCheckpoints)).toBe(true);
      expect(Array.isArray(res.body.data.recentMessages)).toBe(true);
      expect(res.body.data.recentCheckpoints.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.recentMessages.length).toBeGreaterThanOrEqual(1);
    });

    it("should require authentication", async () => {
      const res = await request(app).get("/v1/dashboard/overview");

      expect(res.status).toBe(401);
    });

    it("should include stats.projects, stats.checkpoints, and stats.messages", async () => {
      const res = await request(app)
        .get("/v1/dashboard/overview")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.data.stats).toHaveProperty("projects");
      expect(res.body.data.stats).toHaveProperty("checkpoints");
      expect(res.body.data.stats).toHaveProperty("messages");
      // count() mock returns { type: "count" } which is not a real number,
      // so the route falls back to 0
      expect(typeof res.body.data.stats.projects).toBe("number");
      expect(typeof res.body.data.stats.checkpoints).toBe("number");
      expect(typeof res.body.data.stats.messages).toBe("number");
    });

    it("should truncate message content to 200 characters", async () => {
      const longContent = "A".repeat(300);
      mockChatMessages.push({
        id: "msg_long",
        userId: "user_test_001",
        projectId: "proj_test_001",
        sessionId: "sess_001",
        role: "user",
        content: longContent,
        timestamp: new Date(),
        checkpointId: null,
        isContextInjection: false,
      });

      const res = await request(app)
        .get("/v1/dashboard/overview")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(200);
      const truncatedMessage = res.body.data.recentMessages.find(
        (m: any) => m.id === "msg_long"
      );
      expect(truncatedMessage).toBeDefined();
      // 200 chars + "..."
      expect(truncatedMessage.content.length).toBe(203);
      expect(truncatedMessage.content.endsWith("...")).toBe(true);
    });
  });

  // ==========================================================================
  // GET /v1/dashboard/activity
  // ==========================================================================
  describe("GET /v1/dashboard/activity", () => {
    it("should return activity array", async () => {
      mockCheckpoints.push({
        id: "cp_act_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        name: "Activity Checkpoint",
        description: "test activity",
        scope: "full",
        createdAt: new Date(),
      });

      mockChatMessages.push({
        id: "msg_act_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        sessionId: "sess_001",
        role: "user",
        content: "Activity message",
        timestamp: new Date(),
        checkpointId: null,
        isContextInjection: false,
      });

      mockToolCalls.push({
        id: "tc_act_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        sessionId: "sess_001",
        toolName: "read_file",
        arguments: "{}",
        result: "ok",
        success: true,
        error: null,
        timestamp: new Date(),
      });

      const res = await request(app)
        .get("/v1/dashboard/activity")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("activity");
      expect(Array.isArray(res.body.activity)).toBe(true);
      expect(res.body.activity.length).toBeGreaterThanOrEqual(1);
    });

    it("should respect limit query param", async () => {
      // Seed multiple items
      for (let i = 0; i < 5; i++) {
        mockCheckpoints.push({
          id: `cp_lim_${i}`,
          userId: "user_test_001",
          projectId: "proj_test_001",
          name: `Checkpoint ${i}`,
          description: "test",
          scope: "full",
          createdAt: new Date(Date.now() - i * 1000),
        });
      }

      const res = await request(app)
        .get("/v1/dashboard/activity?limit=2")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.activity.length).toBeLessThanOrEqual(2);
    });
  });

  // ==========================================================================
  // GET /v1/dashboard/search
  // ==========================================================================
  describe("GET /v1/dashboard/search", () => {
    it("should return 400 without q param", async () => {
      const res = await request(app)
        .get("/v1/dashboard/search")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.message).toContain("'q' required");
    });

    it("should return results with q param", async () => {
      mockCheckpoints.push({
        id: "cp_search_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        name: "Searchable Checkpoint",
        description: "find me",
        scope: "full",
        createdAt: new Date(),
      });

      mockChatMessages.push({
        id: "msg_search_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        sessionId: "sess_001",
        role: "user",
        content: "searchable content here",
        timestamp: new Date(),
        checkpointId: null,
        isContextInjection: false,
      });

      mockToolCalls.push({
        id: "tc_search_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        sessionId: "sess_001",
        toolName: "search_tool",
        arguments: "{}",
        result: "found",
        success: true,
        error: null,
        timestamp: new Date(),
      });

      const res = await request(app)
        .get("/v1/dashboard/search?q=test")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("checkpoints");
      expect(res.body).toHaveProperty("messages");
      expect(res.body).toHaveProperty("toolCalls");
      expect(Array.isArray(res.body.checkpoints)).toBe(true);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(Array.isArray(res.body.toolCalls)).toBe(true);
      // The sql mock evaluates ILIKE conditions as true, so all seeded records pass through
      expect(res.body.checkpoints.length).toBeGreaterThanOrEqual(1);
      expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
      expect(res.body.toolCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // GET /v1/dashboard/projects/:projectId/stats
  // ==========================================================================
  describe("GET /v1/dashboard/projects/:projectId/stats", () => {
    it("should return project stats for existing project", async () => {
      mockCheckpoints.push({
        id: "cp_stats_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        name: "Stats Checkpoint",
        description: "for stats",
        scope: "full",
        createdAt: new Date(),
      });

      const res = await request(app)
        .get("/v1/dashboard/projects/proj_test_001/stats")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("project");
      expect(res.body).toHaveProperty("stats");
      expect(res.body.project.id).toBe("proj_test_001");
      expect(res.body.stats).toHaveProperty("checkpoints");
      expect(res.body.stats).toHaveProperty("messages");
      expect(res.body.stats).toHaveProperty("sessions");
      expect(res.body.stats).toHaveProperty("toolCalls");
      expect(res.body.stats).toHaveProperty("firstCheckpoint");
      expect(res.body.stats).toHaveProperty("lastCheckpoint");
    });

    it("should return 404 for non-existent project", async () => {
      const res = await request(app)
        .get("/v1/dashboard/projects/proj_nonexistent/stats")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
      expect(res.body.error.message).toContain("not found");
    });
  });

  // ==========================================================================
  // GET /v1/dashboard/projects/:projectId/conversation
  // ==========================================================================
  describe("GET /v1/dashboard/projects/:projectId/conversation", () => {
    it("should return messages and toolCalls", async () => {
      mockChatMessages.push({
        id: "msg_conv_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        sessionId: "sess_001",
        role: "user",
        content: "Conversation message",
        timestamp: new Date(),
        checkpointId: null,
        isContextInjection: false,
      });

      mockToolCalls.push({
        id: "tc_conv_001",
        userId: "user_test_001",
        projectId: "proj_test_001",
        sessionId: "sess_001",
        toolName: "write_file",
        arguments: '{"path": "test.ts"}',
        result: "written",
        success: true,
        error: null,
        timestamp: new Date(),
      });

      const res = await request(app)
        .get("/v1/dashboard/projects/proj_test_001/conversation")
        .set("x-api-key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("messages");
      expect(res.body).toHaveProperty("toolCalls");
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(Array.isArray(res.body.toolCalls)).toBe(true);
      expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
      expect(res.body.toolCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("should require authentication", async () => {
      const res = await request(app).get(
        "/v1/dashboard/projects/proj_test_001/conversation"
      );

      expect(res.status).toBe(401);
    });
  });
});
