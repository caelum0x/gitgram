import { beforeEach, describe, expect, it } from "vitest";
import {
  mockChatMessages,
  mockCheckpoints,
  mockRetentionPolicies,
  seedTestData,
} from "../setup.js";
import { applyRetentionForProject } from "../../src/services/retention.js";

describe("retention service", () => {
  beforeEach(() => {
    seedTestData();
  });

  it("returns dry-run deletion summary without deleting records", async () => {
    const cutoffOld = new Date("2025-01-01T00:00:00.000Z");

    mockRetentionPolicies.push({
      id: "rp_msg_001",
      projectId: "proj_test_001",
      organizationId: null,
      dataClass: "messages",
      retentionDays: 30,
      hardDelete: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockChatMessages.push({
      id: "msg_old_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      sessionId: "sess_1",
      role: "user",
      content: "old",
      timestamp: cutoffOld,
    });

    const res = await applyRetentionForProject("user_test_001", "proj_test_001", {
      dataClass: "messages",
      dryRun: true,
    });

    expect(res.dryRun).toBe(true);
    expect(res.summary.messages.deleted).toBe(1);
    expect(mockChatMessages.find((m) => m.id === "msg_old_001")).toBeTruthy();
  });

  it("deletes checkpoints when retention is applied in execute mode", async () => {
    const oldDate = new Date("2024-12-01T00:00:00.000Z");

    mockRetentionPolicies.push({
      id: "rp_cp_001",
      projectId: "proj_test_001",
      organizationId: null,
      dataClass: "checkpoints",
      retentionDays: 30,
      hardDelete: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockCheckpoints.push({
      id: "cp_old_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      name: "old checkpoint",
      description: null,
      scope: "files+chat",
      manifestHash: "mh_old",
      triggerType: "manual",
      linkedCheckpointId: null,
      createdAt: oldDate,
    });

    const res = await applyRetentionForProject("user_test_001", "proj_test_001", {
      dataClass: "checkpoints",
      dryRun: false,
    });

    expect(res.dryRun).toBe(false);
    expect(res.summary.checkpoints.deleted).toBe(1);
    expect(mockCheckpoints.find((cp) => cp.id === "cp_old_001")).toBeUndefined();
  });
});
