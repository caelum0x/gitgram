import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockRepositories,
  mockProjects,
} from "../setup.js";

function createGitHubSignature(secret: string, body: string): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", secret).update(body).digest("hex")
  );
}

describe("Repositories - GitHub Webhook Auto-Reindexing", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedTestData();

    // Seed a repository with webhook configured
    mockRepositories.push({
      id: "repo_test_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      name: "test-repo",
      rootPath: "/tmp/aitm-repos/user_test_001/testowner/test-repo",
      indexStatus: "completed",
      fileCount: 10,
      symbolCount: 50,
      lastIndexedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        url: "https://github.com/testowner/test-repo.git",
        branch: "main",
        isGitHub: true,
      },
    });
  });

  describe("POST /v1/repositories/:id/webhook/configure", () => {
    it("should return webhook URL, secret, and instructions", async () => {
      const res = await request(app)
        .post("/v1/repositories/repo_test_001/webhook/configure")
        .set("X-API-Key", TEST_API_KEY)
        .send();

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("webhook_url");
      expect(res.body).toHaveProperty("webhook_secret");
      expect(res.body).toHaveProperty("instructions");
    });

    it("should store webhook secret in repository metadata", async () => {
      await request(app)
        .post("/v1/repositories/repo_test_001/webhook/configure")
        .set("X-API-Key", TEST_API_KEY)
        .send();

      expect(mockRepositories[0].metadata.webhookSecret).toBeDefined();
      expect(typeof mockRepositories[0].metadata.webhookSecret).toBe("string");
    });

    it("should return 404 for non-existent repository", async () => {
      const res = await request(app)
        .post("/v1/repositories/repo_nonexistent/webhook/configure")
        .set("X-API-Key", TEST_API_KEY)
        .send();

      expect(res.status).toBe(404);
    });
  });

  describe("POST /v1/repositories/:id/webhook", () => {
    let webhookSecret: string;

    beforeEach(async () => {
      // Configure the webhook first to get a secret
      await request(app)
        .post("/v1/repositories/repo_test_001/webhook/configure")
        .set("X-API-Key", TEST_API_KEY)
        .send();

      webhookSecret = mockRepositories[0].metadata.webhookSecret;
    });

    it("should trigger reindexing on valid push to main branch", async () => {
      const payload = JSON.stringify({
        ref: "refs/heads/main",
        repository: {
          full_name: "testowner/test-repo",
        },
      });

      const signature = createGitHubSignature(webhookSecret, payload);

      const res = await request(app)
        .post("/v1/repositories/repo_test_001/webhook")
        .set("X-API-Key", TEST_API_KEY)
        .set("X-Hub-Signature-256", signature)
        .set("X-GitHub-Event", "push")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("Reindexing triggered");
    });

    it("should return 401 for invalid signature", async () => {
      const payload = JSON.stringify({
        ref: "refs/heads/main",
        repository: {
          full_name: "testowner/test-repo",
        },
      });

      const invalidSignature = "sha256=invalidsignaturevalue";

      const res = await request(app)
        .post("/v1/repositories/repo_test_001/webhook")
        .set("X-API-Key", TEST_API_KEY)
        .set("X-Hub-Signature-256", invalidSignature)
        .set("X-GitHub-Event", "push")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(401);
    });

    it("should return 401 when signature header is missing", async () => {
      const payload = JSON.stringify({
        ref: "refs/heads/main",
        repository: {
          full_name: "testowner/test-repo",
        },
      });

      const res = await request(app)
        .post("/v1/repositories/repo_test_001/webhook")
        .set("X-API-Key", TEST_API_KEY)
        .set("X-GitHub-Event", "push")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(401);
    });

    it("should respond with pong for ping event", async () => {
      const payload = JSON.stringify({
        zen: "Keep it logically awesome.",
        hook_id: 12345,
      });

      const signature = createGitHubSignature(webhookSecret, payload);

      const res = await request(app)
        .post("/v1/repositories/repo_test_001/webhook")
        .set("X-API-Key", TEST_API_KEY)
        .set("X-Hub-Signature-256", signature)
        .set("X-GitHub-Event", "ping")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("pong");
    });

    it("should ignore push to non-default branch", async () => {
      const payload = JSON.stringify({
        ref: "refs/heads/feature-branch",
        repository: {
          full_name: "testowner/test-repo",
        },
      });

      const signature = createGitHubSignature(webhookSecret, payload);

      const res = await request(app)
        .post("/v1/repositories/repo_test_001/webhook")
        .set("X-API-Key", TEST_API_KEY)
        .set("X-Hub-Signature-256", signature)
        .set("X-GitHub-Event", "push")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("Ignoring push to non-default branch");
    });
  });
});
