import { beforeEach, describe, expect, it } from "vitest";
import {
  mockJobs,
  mockProjects,
  mockUsers,
  seedTestData,
} from "../setup.js";
import { processDeleteRequestsWorker } from "../../src/services/deleteRequestsWorker.js";

describe("processDeleteRequestsWorker", () => {
  beforeEach(() => {
    seedTestData();
  });

  it("processes pending requests in dry-run mode", async () => {
    mockJobs.push({
      id: "delreq_worker_001",
      userId: "user_test_001",
      type: "data_delete_request",
      status: "pending",
      params: { scope: "project", projectId: "proj_test_001" },
      result: { state: "queued" },
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      error: null,
    });

    const result = await processDeleteRequestsWorker({ dryRun: true, limit: 10 });

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockJobs[0].status).toBe("pending");
    expect(mockJobs[0].result?.state).toBe("dry_run_preview");
  });

  it("processes pending requests in execute mode", async () => {
    mockProjects.push({
      id: "proj_worker_002",
      userId: "user_test_001",
      orgId: null,
      name: "Worker Project",
      rootPath: "/tmp/worker",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSyncedAt: null,
    });

    mockJobs.push({
      id: "delreq_worker_002",
      userId: "user_test_001",
      type: "data_delete_request",
      status: "pending",
      params: { scope: "project", projectId: "proj_worker_002" },
      result: { state: "queued" },
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      error: null,
    });

    const result = await processDeleteRequestsWorker({ dryRun: false, limit: 10 });

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockJobs[0].status).toBe("completed");
    expect(mockUsers[0].id).toBe("user_test_001");
  });
});
