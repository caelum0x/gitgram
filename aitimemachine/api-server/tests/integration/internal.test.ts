import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  mockCodeEmbeddings,
  mockConsents,
  mockKnowledgeBaseArtifacts,
  mockKnowledgeBaseFiles,
} from "../setup.js";

const INTERNAL_SECRET = "test-internal-secret";
process.env.INTERNAL_SECRET = INTERNAL_SECRET;

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();

  mockKnowledgeBaseFiles.push({
    id: "kb_file_001",
    userId: "user_test_001",
    projectId: "proj_test_001",
    repositoryId: "repo_test_001",
    filePath: "src/semantic-search.ts",
    content: "export function semanticSearch() { return 'ready'; }",
    size: 128,
    language: "ts",
    source: "local",
    storage: "db",
    indexedAt: new Date(),
    updatedAt: new Date(),
    createdAt: new Date(),
  });

  mockKnowledgeBaseArtifacts.push({
    id: "kb_artifact_001",
    userId: "user_test_001",
    projectId: "proj_test_001",
    jobId: "pipeline_mock_existing",
    type: "pipeline",
    format: "jsonl",
    storage: "db",
    content: { summary: "semantic search export artifact" },
    size: 256,
    stats: { records: 2 },
    createdAt: new Date(),
  });

  mockCodeEmbeddings.push({
    id: "kb_embedding_001",
    userId: "user_test_001",
    projectId: "proj_test_001",
    repositoryId: "repo_test_001",
    filePath: "src/semantic-search.ts",
    symbol: "semanticSearch",
    symbolType: "function",
    language: "ts",
    lineStart: 1,
    lineEnd: 3,
    content: "export function semanticSearch() { return 'ready'; }",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("Internal Routes - /api/internal", () => {
  describe("GET /api/internal/knowledge-base/search", () => {
    it("requires internal auth", async () => {
      const res = await request(app)
        .get("/api/internal/knowledge-base/search")
        .query({ userId: "user_test_001", query: "semantic" });

      expect(res.status).toBe(401);
    });

    it("returns unified search results for website dashboards", async () => {
      const res = await request(app)
        .get("/api/internal/knowledge-base/search")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .query({ userId: "user_test_001", query: "semantic", projectId: "proj_test_001" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("query", "semantic");
      expect(res.body.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "kb_file_001",
            filePath: "src/semantic-search.ts",
          }),
        ])
      );
      expect(res.body.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "kb_artifact_001",
            type: "pipeline",
          }),
        ])
      );
      expect(res.body.embeddings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "kb_embedding_001",
            symbol: "semanticSearch",
          }),
        ])
      );
    });
  });

  describe("GET /api/internal/knowledge-base/stats", () => {
    it("returns stats payload shape for semantic search dashboard", async () => {
      const res = await request(app)
        .get("/api/internal/knowledge-base/stats")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .query({ userId: "user_test_001", projectId: "proj_test_001" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("files");
      expect(res.body).toHaveProperty("artifacts");
      expect(res.body).toHaveProperty("totalSize");
    });
  });

  describe("GET /api/internal/knowledge-base/artifacts", () => {
    it("returns filtered artifact rows", async () => {
      const res = await request(app)
        .get("/api/internal/knowledge-base/artifacts")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .query({ userId: "user_test_001", type: "pipeline", projectId: "proj_test_001" });

      expect(res.status).toBe(200);
      expect(res.body.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "kb_artifact_001",
            type: "pipeline",
          }),
        ])
      );
    });
  });

  describe("training export consent", () => {
    it("lists projects with current training export decisions", async () => {
      const res = await request(app)
        .get("/api/internal/consent/training-export")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .query({ userId: "user_test_001" });

      expect(res.status).toBe(200);
      expect(res.body.projects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            projectId: "proj_test_001",
            projectName: "Test Project",
            decision: expect.objectContaining({
              allowed: expect.any(Boolean),
            }),
          }),
        ])
      );
    });

    it("stores a project-level training export consent decision", async () => {
      const res = await request(app)
        .post("/api/internal/consent/training-export")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({
          userId: "user_test_001",
          projectId: "proj_test_001",
          granted: true,
          metadata: { source: "dashboard" },
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body.decision).toEqual(
        expect.objectContaining({
          allowed: true,
          source: "project",
          reason: "project_consent_granted",
        })
      );
    });
  });

  describe("training export pipeline", () => {
    it("rejects pipeline creation when the selected project is explicitly denied", async () => {
      mockConsents.push({
        projectId: "proj_test_001",
        organizationId: null,
        consentType: "training_export",
        granted: false,
        grantedByUserId: "user_test_001",
        effectiveFrom: new Date(Date.now() - 60_000),
        effectiveTo: null,
        metadata: {},
        createdAt: new Date(),
      });

      const res = await request(app)
        .post("/api/internal/pipeline")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({
          userId: "user_test_001",
          projectIds: ["proj_test_001"],
          format: "generic",
          redactSecrets: true,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toEqual(
        expect.objectContaining({
          message: "Training export consent required",
          type: "permission_denied",
        })
      );
    });

    it("creates, lists, and fetches a pipeline job when consent is allowed", async () => {
      mockConsents.push({
        projectId: "proj_test_001",
        organizationId: null,
        consentType: "training_export",
        granted: true,
        grantedByUserId: "user_test_001",
        effectiveFrom: new Date(Date.now() - 60_000),
        effectiveTo: null,
        metadata: {},
        createdAt: new Date(),
      });

      const createRes = await request(app)
        .post("/api/internal/pipeline")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .send({
          userId: "user_test_001",
          projectIds: ["proj_test_001"],
          format: "generic",
          redactSecrets: true,
          includeChats: true,
          includeCodeChanges: true,
          includeTerminalCommands: true,
          includeCheckpoints: true,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body).toHaveProperty("job");
      expect(createRes.body.job).toEqual(
        expect.objectContaining({
          userId: "user_test_001",
          status: "pending",
        })
      );

      const jobId = createRes.body.job.id as string;

      const listRes = await request(app)
        .get("/api/internal/pipeline")
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .query({ userId: "user_test_001" });

      expect(listRes.status).toBe(200);
      expect(listRes.body.jobs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: jobId,
          }),
        ])
      );

      const detailRes = await request(app)
        .get(`/api/internal/pipeline/${jobId}`)
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .query({ userId: "user_test_001" });

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.job).toEqual(
        expect.objectContaining({
          id: jobId,
          userId: "user_test_001",
        })
      );

      const downloadRes = await request(app)
        .get(`/api/internal/pipeline/${jobId}/download`)
        .set("X-Internal-Secret", INTERNAL_SECRET)
        .query({ userId: "user_test_001" });

      expect(downloadRes.status).toBe(409);
      expect(downloadRes.body.error).toEqual(
        expect.objectContaining({
          message: "Pipeline job is not completed",
          type: "conflict",
        })
      );
    });
  });
});
