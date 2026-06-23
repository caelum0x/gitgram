import { beforeEach, describe, expect, it, vi } from "vitest";
import { triggerWebhooksForUser } from "../../src/services/webhookDelivery.js";
import {
  mockCheckpoints,
  mockRestoreEvents,
  seedTestData,
} from "../setup.js";
import { recordRestoreEventAndEmitWebhooks } from "../../src/services/restoreEvents.js";

describe("restoreEvents service", () => {
  beforeEach(() => {
    seedTestData();
    mockRestoreEvents.length = 0;
    mockCheckpoints.length = 0;
    vi.clearAllMocks();
  });

  it("records restore event and emits enriched webhooks", async () => {
    mockCheckpoints.push({
      id: "cp_to_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      name: "After Fix",
      description: "stable point",
      scope: "files+chat",
      manifestHash: "mh_to",
      triggerType: "manual",
      linkedCheckpointId: null,
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
    });

    mockCheckpoints.push({
      id: "cp_from_001",
      projectId: "proj_test_001",
      userId: "user_test_001",
      name: "Before Bug",
      description: "bad point",
      scope: "files+chat",
      manifestHash: "mh_from",
      triggerType: "after_action",
      linkedCheckpointId: null,
      createdAt: new Date("2026-01-01T09:00:00.000Z"),
    });

    const result = await recordRestoreEventAndEmitWebhooks({
      userId: "user_test_001",
      projectId: "proj_test_001",
      fromCheckpointId: "cp_from_001",
      toCheckpointId: "cp_to_001",
      scopeType: "file",
      scopePath: "src/index.ts",
      source: "undo",
      details: { reason: "rollback" },
    });

    expect(result.id).toBeTruthy();
    expect(mockRestoreEvents.length).toBe(1);
    expect(mockRestoreEvents[0].toCheckpointId).toBe("cp_to_001");
    expect(mockRestoreEvents[0].fromCheckpointId).toBe("cp_from_001");
    expect(mockRestoreEvents[0].scopeType).toBe("file");

    const webhookMock = triggerWebhooksForUser as unknown as ReturnType<typeof vi.fn>;
    expect(webhookMock).toHaveBeenCalledTimes(2);

    expect(webhookMock).toHaveBeenCalledWith(
      "user_test_001",
      "checkpoint.restored",
      expect.objectContaining({
        restoreEventId: result.id,
        checkpointId: "cp_to_001",
        checkpointName: "After Fix",
        fromCheckpointId: "cp_from_001",
        fromCheckpointName: "Before Bug",
        scopeType: "file",
      })
    );

    expect(webhookMock).toHaveBeenCalledWith(
      "user_test_001",
      "restore.event",
      expect.objectContaining({
        restoreEventId: result.id,
        toCheckpointId: "cp_to_001",
        scopeType: "file",
        source: "undo",
      })
    );
  });
});
