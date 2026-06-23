import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  createTestApp,
  mockProjects,
  seedTestData,
  TEST_API_KEY,
} from "../setup.js";

let app: Express;

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Data Deletion Requests", () => {
  it("queues a project delete request", async () => {
    const res = await request(app)
      .post("/v1/data/delete-request")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        scope: "project",
        projectId: "proj_test_001",
        reason: "cleanup",
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.request.id).toMatch(/^delreq_/);
    expect(res.body.request.status).toBe("pending");
  });

  it("supports dry-run processing without completing the job", async () => {
    const queued = await request(app)
      .post("/v1/data/delete-request")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        scope: "project",
        projectId: "proj_test_001",
      });

    const requestId = queued.body.request.id as string;

    const processed = await request(app)
      .post(`/v1/data/delete-request/${requestId}/process`)
      .set("X-API-Key", TEST_API_KEY)
      .send({ dryRun: true });

    expect(processed.status).toBe(200);
    expect(processed.body.success).toBe(true);
    expect(processed.body.result.dryRun).toBe(true);
    expect(processed.body.result.summary.scope).toBe("project");

    const job = await request(app)
      .get(`/v1/data/delete-request/${requestId}`)
      .set("X-API-Key", TEST_API_KEY);

    expect(job.status).toBe(200);
    expect(job.body.request.status).toBe("pending");
    expect(job.body.request.result.state).toBe("dry_run_preview");
  });

  it("processes request and marks it completed", async () => {
    const queued = await request(app)
      .post("/v1/data/delete-request")
      .set("X-API-Key", TEST_API_KEY)
      .send({
        scope: "project",
        projectId: "proj_test_001",
      });

    const requestId = queued.body.request.id as string;

    const processed = await request(app)
      .post(`/v1/data/delete-request/${requestId}/process`)
      .set("X-API-Key", TEST_API_KEY)
      .send({ dryRun: false });

    expect(processed.status).toBe(200);
    expect(processed.body.success).toBe(true);
    expect(processed.body.result.alreadyCompleted).toBe(false);
    expect(processed.body.result.summary.scope).toBe("project");

    const job = await request(app)
      .get(`/v1/data/delete-request/${requestId}`)
      .set("X-API-Key", TEST_API_KEY);

    expect(job.status).toBe(200);
    expect(job.body.request.status).toBe("completed");
    expect(job.body.request.progress).toBe(100);

    expect(mockProjects.find((p) => p.id === "proj_test_001")).toBeUndefined();
  });
});
