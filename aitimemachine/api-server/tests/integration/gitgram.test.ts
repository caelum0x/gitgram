/**
 * Integration Tests: Gitgram Social Routes
 *
 * Tests the /v1/gitgram endpoints:
 * - POST /v1/gitgram/repos/import              - Import a repository
 * - POST /v1/gitgram/posts                     - Create a post
 * - GET  /v1/gitgram/posts                     - List posts
 * - POST /v1/gitgram/posts/:postId/comments    - Add comment to post
 * - GET  /v1/gitgram/posts/:postId/comments    - List comments on post
 * - POST /v1/gitgram/reactions                  - React to content
 * - POST /v1/gitgram/follows                   - Follow a user/repo
 * - DELETE /v1/gitgram/follows                 - Unfollow
 * - GET  /v1/gitgram/trending                  - Get trending repos
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockPosts,
  mockRepositories,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Gitgram Routes - /v1/gitgram", () => {
  // ========================================================================
  // POST /v1/gitgram/repos/import - Import repository
  // ========================================================================
  describe("POST /v1/gitgram/repos/import", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/gitgram/repos/import")
        .send({
          projectId: "proj_test_001",
          owner: "testuser",
          name: "testrepo",
        });

      expect(res.status).toBe(401);
    });

    it("should import a repository", async () => {
      const res = await request(app)
        .post("/v1/gitgram/repos/import")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          owner: "testuser",
          name: "testrepo",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("repository");
      expect(res.body.repository).toHaveProperty("owner", "testuser");
      expect(res.body.repository).toHaveProperty("name", "testrepo");
      expect(res.body.repository).toHaveProperty("projectId", "proj_test_001");
    });

    it("should return 400 when projectId is missing", async () => {
      const res = await request(app)
        .post("/v1/gitgram/repos/import")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          owner: "testuser",
          name: "testrepo",
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 when owner is missing", async () => {
      const res = await request(app)
        .post("/v1/gitgram/repos/import")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          name: "testrepo",
        });

      expect(res.status).toBe(400);
    });

    it("should return 404 for non-existent project", async () => {
      const res = await request(app)
        .post("/v1/gitgram/repos/import")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_nonexistent",
          owner: "testuser",
          name: "testrepo",
        });

      expect(res.status).toBe(404);
    });
  });

  // ========================================================================
  // POST /v1/gitgram/posts - Create post
  // ========================================================================
  describe("POST /v1/gitgram/posts", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/gitgram/posts")
        .send({
          projectId: "proj_test_001",
          type: "post",
          caption: "Test post",
        });

      expect(res.status).toBe(401);
    });

    it("should create a post with a project", async () => {
      const res = await request(app)
        .post("/v1/gitgram/posts")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          type: "post",
          caption: "My first gitgram post",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("post");
      expect(res.body.post).toHaveProperty("type", "post");
      expect(res.body.post).toHaveProperty("caption", "My first gitgram post");
    });

    it("should return 400 when neither projectId nor repositoryId is provided", async () => {
      const res = await request(app)
        .post("/v1/gitgram/posts")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          type: "post",
          caption: "Orphan post",
        });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid post type", async () => {
      const res = await request(app)
        .post("/v1/gitgram/posts")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          type: "invalid_type",
        });

      expect(res.status).toBe(400);
    });
  });

  // ========================================================================
  // GET /v1/gitgram/posts - List posts
  // ========================================================================
  describe("GET /v1/gitgram/posts", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/gitgram/posts");

      expect(res.status).toBe(401);
    });

    it("should return a list of posts", async () => {
      const res = await request(app)
        .get("/v1/gitgram/posts")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("posts");
      expect(Array.isArray(res.body.posts)).toBe(true);
      expect(res.body).toHaveProperty("pagination");
    });
  });

  // ========================================================================
  // POST /v1/gitgram/reactions - React to content
  // ========================================================================
  describe("POST /v1/gitgram/reactions", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/gitgram/reactions")
        .send({
          targetType: "post",
          targetId: "some_post_id",
          reaction: "like",
        });

      expect(res.status).toBe(401);
    });

    it("should return 404 when targeting a non-existent post", async () => {
      const res = await request(app)
        .post("/v1/gitgram/reactions")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          targetType: "post",
          targetId: "nonexistent_post_id",
          reaction: "like",
        });

      expect(res.status).toBe(404);
    });

    it("should return 400 for invalid reaction type", async () => {
      const res = await request(app)
        .post("/v1/gitgram/reactions")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          targetType: "post",
          targetId: "some_id",
          reaction: "invalid_reaction",
        });

      expect(res.status).toBe(400);
    });
  });

  // ========================================================================
  // POST /v1/gitgram/follows - Follow
  // ========================================================================
  describe("POST /v1/gitgram/follows", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/v1/gitgram/follows")
        .send({
          targetType: "user",
          targetUserId: "user_other",
        });

      expect(res.status).toBe(401);
    });

    it("should return 400 when trying to follow yourself", async () => {
      const res = await request(app)
        .post("/v1/gitgram/follows")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          targetType: "user",
          targetUserId: "user_test_001",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe("Cannot follow yourself");
    });

    it("should return 400 when required fields are missing", async () => {
      const res = await request(app)
        .post("/v1/gitgram/follows")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          targetType: "user",
        });

      expect(res.status).toBe(400);
    });
  });

  // ========================================================================
  // GET /v1/gitgram/trending - Trending repos
  // ========================================================================
  describe("GET /v1/gitgram/trending", () => {
    it("should require authentication", async () => {
      const res = await request(app).get("/v1/gitgram/trending");

      expect(res.status).toBe(401);
    });

    it("should return trending repositories", async () => {
      const res = await request(app)
        .get("/v1/gitgram/trending")
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("repositories");
      expect(Array.isArray(res.body.repositories)).toBe(true);
    });
  });
});
