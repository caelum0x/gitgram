import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  TEST_API_KEY,
  createTestApp,
  mockCheckpoints,
  mockConsents,
  mockDiffs,
  mockPosts,
  mockRepositories,
  mockRestoreEvents,
  mockTrendScores,
  seedTestData,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Time API extensions", () => {
  it("returns checkpoint diff data", async () => {
    mockCheckpoints.push(
      {
        id: "cp_from_diff_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        name: "Before",
        description: "before",
        scope: "files+chat",
        manifestHash: "manifest_before",
        triggerType: "before_action",
        linkedCheckpointId: null,
        parentId: null,
        metadata: { action: "edit_file" },
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      },
      {
        id: "cp_to_diff_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        name: "After",
        description: "after",
        scope: "files+chat",
        manifestHash: "manifest_after",
        triggerType: "after_action",
        linkedCheckpointId: "cp_from_diff_001",
        parentId: "cp_from_diff_001",
        metadata: { action: "edit_file" },
        createdAt: new Date("2026-01-01T10:01:00.000Z"),
      }
    );

    mockDiffs.push({
      fromCheckpointId: "cp_from_diff_001",
      toCheckpointId: "cp_to_diff_001",
      filePath: "src/index.ts",
      diffContent: "@@ -1 +1 @@",
      stats: { added: 2, removed: 1, modified: 1 },
      algorithm: "line",
      createdAt: new Date("2026-01-01T10:01:00.000Z"),
    });

    const res = await request(app)
      .get("/v1/time/diff")
      .set("X-API-Key", TEST_API_KEY)
      .query({
        projectId: "proj_test_001",
        toCheckpointId: "cp_to_diff_001",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.fileCount).toBe(1);
    expect(res.body.summary.added).toBe(2);
    expect(res.body.files[0].filePath).toBe("src/index.ts");
  });

  it("returns timeline and restore events", async () => {
    mockCheckpoints.push({
      id: "cp_timeline_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      name: "Timeline Item",
      description: "timeline",
      scope: "files+chat",
      manifestHash: "manifest_timeline",
      triggerType: "manual",
      linkedCheckpointId: null,
      parentId: null,
      metadata: { action: "save" },
      createdAt: new Date("2026-01-02T10:00:00.000Z"),
    });

    mockRestoreEvents.push({
      id: "rstev_001",
      projectId: "proj_test_001",
      actorUserId: "user_test_001",
      fromCheckpointId: null,
      toCheckpointId: "cp_timeline_001",
      scopeType: "project",
      scopePath: null,
      status: "applied",
      details: { source: "restore" },
      createdAt: new Date("2026-01-02T10:05:00.000Z"),
    });

    const timeline = await request(app)
      .get("/v1/time/timeline")
      .set("X-API-Key", TEST_API_KEY)
      .query({ projectId: "proj_test_001" });

    expect(timeline.status).toBe(200);
    expect(timeline.body.success).toBe(true);
    expect(timeline.body.items.length).toBeGreaterThanOrEqual(1);

    const events = await request(app)
      .get("/v1/time/restore-events")
      .set("X-API-Key", TEST_API_KEY)
      .query({ projectId: "proj_test_001" });

    expect(events.status).toBe(200);
    expect(events.body.success).toBe(true);
    expect(events.body.events[0].id).toBe("rstev_001");
  });
});

describe("Consent + Retention + Context API", () => {
  it("creates and lists consent records", async () => {
    const created = await request(app)
      .post("/v1/consent")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        consentType: "operational_capture",
        granted: true,
        projectId: "proj_test_001",
      });

    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);

    const listed = await request(app)
      .get("/v1/consent")
      .set("X-API-Key", TEST_API_KEY)
      .query({ projectId: "proj_test_001" });

    expect(listed.status).toBe(200);
    expect(listed.body.success).toBe(true);
    expect(listed.body.consents.length).toBeGreaterThanOrEqual(1);

    const history = await request(app)
      .get("/v1/consent/history")
      .set("X-API-Key", TEST_API_KEY)
      .query({ projectId: "proj_test_001" });

    expect(history.status).toBe(200);
    expect(history.body.success).toBe(true);
    expect(history.body.history.length).toBeGreaterThanOrEqual(1);
  });

  it("upserts/lists retention policy and applies dry-run", async () => {
    const upsert = await request(app)
      .post("/v1/retention")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        dataClass: "messages",
        retentionDays: 30,
        hardDelete: false,
        projectId: "proj_test_001",
      });

    expect(upsert.status).toBe(201);
    expect(upsert.body.success).toBe(true);

    const list = await request(app)
      .get("/v1/retention")
      .set("X-API-Key", TEST_API_KEY)
      .query({ projectId: "proj_test_001" });

    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(list.body.policies.length).toBeGreaterThanOrEqual(1);

    const apply = await request(app)
      .post("/v1/retention/apply")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        projectId: "proj_test_001",
        dryRun: true,
      });

    expect(apply.status).toBe(200);
    expect(apply.body.success).toBe(true);
    expect(apply.body.projectId).toBe("proj_test_001");
  });

  it("returns checkpoint context snapshot", async () => {
    mockCheckpoints.push({
      id: "cp_context_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      name: "Context Checkpoint",
      description: "context",
      scope: "files+chat",
      manifestHash: "manifest_context",
      triggerType: "manual",
      linkedCheckpointId: null,
      parentId: null,
      metadata: {},
      createdAt: new Date("2026-01-03T12:00:00.000Z"),
    });

    const res = await request(app)
      .get("/v1/context/cp_context_001")
      .set("X-API-Key", TEST_API_KEY)
      .query({ messageLimit: 5, toolCallLimit: 5, contextLimit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.checkpoint.id).toBe("cp_context_001");
  });
});

describe("Gitgram milestone A API", () => {
  it("imports repo, creates post/comment/reaction/follow, and returns trending", async () => {
    const imported = await request(app)
      .post("/v1/gitgram/repos/import")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        projectId: "proj_test_001",
        owner: "microsoft",
        name: "vscode",
      });

    expect(imported.status).toBe(201);
    const repositoryId = imported.body.repository.id as string;

    const post = await request(app)
      .post("/v1/gitgram/posts")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        repositoryId,
        type: "post",
        caption: "Shipping a new release",
        visibility: "public",
        publishNow: true,
        assets: [],
      });

    expect(post.status).toBe(201);
    const postId = post.body.post.id as string;

    const comment = await request(app)
      .post(`/v1/gitgram/posts/${postId}/comments`)
      .set("X-API-Key", TEST_API_KEY)
      .send({ body: "Looks great" });

    expect(comment.status).toBe(201);

    const reaction = await request(app)
      .post("/v1/gitgram/reactions")
      .set("X-API-Key", TEST_API_KEY)
      .send({ targetType: "post", targetId: postId, reaction: "rocket", active: true });

    expect(reaction.status).toBe(201);

    const follow = await request(app)
      .post("/v1/gitgram/follows")
      .set("X-API-Key", TEST_API_KEY)
      .send({ targetType: "repository", targetRepositoryId: repositoryId });

    expect(follow.status).toBe(201);

    const trending = await request(app)
      .get("/v1/gitgram/trending")
      .set("X-API-Key", TEST_API_KEY)
      .query({ windowDays: 7, limit: 10 });

    expect(trending.status).toBe(200);
    expect(trending.body.success).toBe(true);
    expect(Array.isArray(trending.body.repositories)).toBe(true);
  });

  it("returns feed for repository and supports API alias paths", async () => {
    mockRepositories.push({
      id: "repo_feed_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      name: "owner/repo",
      rootPath: "/github/owner/repo",
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPosts.push({
      id: "post_feed_001",
      authorUserId: "user_test_001",
      repositoryId: "repo_feed_001",
      projectId: "proj_test_001",
      type: "post",
      caption: "feed post",
      visibility: "public",
      codeSnippet: null,
      language: null,
      linkedCheckpointId: null,
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockTrendScores.push({
      repositoryId: "repo_feed_001",
      score: "12.5",
      windowStart: new Date("2026-01-01T00:00:00.000Z"),
      windowEnd: new Date("2026-01-02T00:00:00.000Z"),
      signals: { posts: 1, reactions: 3, comments: 2 },
    });

    const feed = await request(app)
      .get("/v1/gitgram/repos/repo_feed_001/feed")
      .set("X-API-Key", TEST_API_KEY);

    expect(feed.status).toBe(200);
    expect(feed.body.success).toBe(true);
    expect(feed.body.feed.length).toBeGreaterThanOrEqual(1);

    const aliasImport = await request(app)
      .post("/api/repos/import")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        projectId: "proj_test_001",
        owner: "facebook",
        name: "react",
      });

    expect(aliasImport.status).toBe(201);
  });
});
