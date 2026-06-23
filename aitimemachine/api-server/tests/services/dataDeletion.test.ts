import { beforeEach, describe, expect, it } from "vitest";
import {
  mockJobs,
  mockProjects,
  seedTestData,
} from "../setup.js";
import {
  processDeleteRequestJob,
  processPendingDeleteRequestsForUser,
} from "../../src/services/dataDeletion.js";

describe("dataDeletion service", () => {
  beforeEach(() => {
    seedTestData();
  });

  it("runs dry-run preview without completing job", async () => {
    mockJobs.push({
      id: "delreq_test_001",
      userId: "user_test_001",
      type: "data_delete_request",
      status: "pending",
      params: {
        scope: "project",
        projectId: "proj_test_001",
      },
      result: { state: "queued" },
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    });

    const res = await processDeleteRequestJob("delreq_test_001", "user_test_001", {
      dryRun: true,
    });

    expect(res.dryRun).toBe(true);
    expect(res.summary.scope).toBe("project");

    const job = mockJobs.find((j) => j.id === "delreq_test_001");
    expect(job?.status).toBe("pending");
    expect(job?.result?.state).toBe("dry_run_preview");

    expect(mockProjects.find((p) => p.id === "proj_test_001")).toBeTruthy();
  });

  it("processes job and completes deletion", async () => {
    mockJobs.push({
      id: "delreq_test_002",
      userId: "user_test_001",
      type: "data_delete_request",
      status: "pending",
      params: {
        scope: "project",
        projectId: "proj_test_001",
      },
      result: { state: "queued" },
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    });

    const res = await processDeleteRequestJob("delreq_test_002", "user_test_001");

    expect(res.alreadyCompleted).toBe(false);
    expect(res.summary.scope).toBe("project");

    const job = mockJobs.find((j) => j.id === "delreq_test_002");
    expect(job?.status).toBe("completed");
    expect(job?.progress).toBe(100);
    expect(job?.result?.state).toBe("completed");

    expect(mockProjects.find((p) => p.id === "proj_test_001")).toBeUndefined();
  });

  it("batch processes pending requests in dry-run mode", async () => {
    mockJobs.push({
      id: "delreq_test_003",
      userId: "user_test_001",
      type: "data_delete_request",
      status: "pending",
      params: {
        scope: "project",
        projectId: "proj_test_001",
      },
      result: { state: "queued" },
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
    });

    const results = await processPendingDeleteRequestsForUser("user_test_001", 10, {
      dryRun: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);

    const job = mockJobs.find((j) => j.id === "delreq_test_003");
    expect(job?.status).toBe("pending");
    expect(job?.result?.state).toBe("dry_run_preview");
  });
});
