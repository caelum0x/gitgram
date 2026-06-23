import { beforeEach, describe, expect, it } from "vitest";
import {
  mockChatMessages,
  mockProjects,
  mockRetentionPolicies,
  seedTestData,
} from "../setup.js";
import { processRetentionWorker } from "../../src/services/retentionWorker.js";

describe("retentionWorker service", () => {
  beforeEach(() => {
    seedTestData();
    mockRetentionPolicies.length = 0;
    mockChatMessages.length = 0;
  });

  it("processes target projects in dry-run mode", async () => {
    mockRetentionPolicies.push({
      id: "rp_worker_001",
      projectId: "proj_test_001",
      organizationId: null,
      dataClass: "messages",
      retentionDays: 30,
      hardDelete: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockChatMessages.push({
      id: "msg_worker_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      sessionId: "sess_worker",
      role: "user",
      content: "old message",
      timestamp: new Date("2024-01-01T00:00:00.000Z"),
    });

    const result = await processRetentionWorker({
      dryRun: true,
      limit: 10,
    });

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[0].summary?.messages?.deleted).toBe(1);

    expect(mockChatMessages.find((m) => m.id === "msg_worker_001")).toBeTruthy();
  });

  it("executes retention deletion in non-dry-run mode", async () => {
    mockRetentionPolicies.push({
      id: "rp_worker_002",
      projectId: "proj_test_001",
      organizationId: null,
      dataClass: "messages",
      retentionDays: 30,
      hardDelete: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockChatMessages.push({
      id: "msg_worker_002",
      projectId: "proj_test_001",
      userId: "user_test_001",
      sessionId: "sess_worker",
      role: "assistant",
      content: "stale",
      timestamp: new Date("2024-01-01T00:00:00.000Z"),
    });

    const result = await processRetentionWorker({
      dryRun: false,
      projectId: "proj_test_001",
      userId: "user_test_001",
    });

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0].summary?.messages?.deleted).toBe(1);

    expect(mockProjects.find((p) => p.id === "proj_test_001")).toBeTruthy();
    expect(mockChatMessages.find((m) => m.id === "msg_worker_002")).toBeUndefined();
  });
});
