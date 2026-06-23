import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  createTestApp,
  mockCheckpoints,
  mockBlobs,
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

describe("Actions + Time Routes", () => {
  describe("POST /v1/actions/before", () => {
    it("creates a before_action checkpoint and returns an actionId", async () => {
      const res = await request(app)
        .post("/v1/actions/before")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          sessionId: "sess_actions_001",
          action: "edit_file",
          args: { path: "src/index.ts" },
          files: [{ path: "src/index.ts", content: "console.log('before');" }],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.idempotent).toBe(false);
      expect(res.body.checkpointBeforeId).toMatch(/^cp_before_/);
      expect(res.body.actionId).toBeTruthy();
    });

    it("is idempotent when called with same idempotencyKey", async () => {
      const payload = {
        projectId: "proj_test_001",
        sessionId: "sess_actions_001",
        action: "edit_file",
        idempotencyKey: "idem-before-001",
        files: [{ path: "src/index.ts", content: "console.log('before');" }],
      };

      const first = await request(app)
        .post("/v1/actions/before")
        .set("X-API-Key", TEST_API_KEY)
        .send(payload);

      const second = await request(app)
        .post("/v1/actions/before")
        .set("X-API-Key", TEST_API_KEY)
        .send(payload);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.idempotent).toBe(true);
      expect(second.body.checkpointBeforeId).toBe(first.body.checkpointBeforeId);
    });
  });

  describe("POST /v1/actions/after", () => {
    it("creates an after_action checkpoint linked to before checkpoint", async () => {
      const before = await request(app)
        .post("/v1/actions/before")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          sessionId: "sess_actions_001",
          action: "create_file",
          idempotencyKey: "idem-chain-001",
          files: [{ path: "src/new.ts", content: "" }],
        });

      const after = await request(app)
        .post("/v1/actions/after")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          sessionId: "sess_actions_001",
          action: "create_file",
          beforeCheckpointId: before.body.checkpointBeforeId,
          actionId: before.body.actionId,
          success: true,
          result: { created: ["src/new.ts"] },
          files: [{ path: "src/new.ts", content: "export const x = 1;" }],
        });

      expect(after.status).toBe(200);
      expect(after.body.success).toBe(true);
      expect(after.body.idempotent).toBe(false);
      expect(after.body.checkpointAfterId).toMatch(/^cp_after_/);
      expect(after.body.checkpointBeforeId).toBe(before.body.checkpointBeforeId);
    });
  });

  describe("POST /v1/time/restore", () => {
    it("restores folder scope from checkpoint manifest", async () => {
      mockBlobs.push({
        hash: "manifest_hash_restore_001",
        userId: "user_test_001",
        size: 100,
        mimeType: "application/json",
        content: JSON.stringify({
          files: [
            { path: "src/a.ts", content: "a" },
            { path: "src/nested/b.ts", content: "b" },
            { path: "README.md", content: "readme" },
          ],
        }),
        storageType: "inline",
      });

      mockCheckpoints.push({
        id: "cp_restore_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        name: "Restore Point",
        description: "Checkpoint for restore test",
        scope: "files+chat",
        manifestHash: "manifest_hash_restore_001",
        triggerType: "manual",
        linkedCheckpointId: null,
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      });

      const res = await request(app)
        .post("/v1/time/restore")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          checkpointId: "cp_restore_001",
          scopeType: "folder",
          scopePath: "src",
          includeContext: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.restoredCount).toBe(2);
      expect(res.body.restoredFiles.map((f: any) => f.path)).toEqual(
        expect.arrayContaining(["src/a.ts", "src/nested/b.ts"])
      );
    });
  });

  describe("POST /v1/time/undo", () => {
    it("restores to linked before checkpoint from latest after_action", async () => {
      mockBlobs.push({
        hash: "manifest_hash_before_undo_001",
        userId: "user_test_001",
        size: 64,
        mimeType: "application/json",
        content: JSON.stringify({
          files: [{ path: "src/x.ts", content: "before" }],
        }),
        storageType: "inline",
      });

      mockBlobs.push({
        hash: "manifest_hash_after_undo_001",
        userId: "user_test_001",
        size: 64,
        mimeType: "application/json",
        content: JSON.stringify({
          files: [{ path: "src/x.ts", content: "after" }],
        }),
        storageType: "inline",
      });

      mockCheckpoints.push({
        id: "cp_before_undo_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        name: "Before bad change",
        description: "before",
        scope: "files+chat",
        manifestHash: "manifest_hash_before_undo_001",
        triggerType: "before_action",
        linkedCheckpointId: null,
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      });

      mockCheckpoints.push({
        id: "cp_after_undo_001",
        projectId: "proj_test_001",
        userId: "user_test_001",
        name: "After bad change",
        description: "after",
        scope: "files+chat",
        manifestHash: "manifest_hash_after_undo_001",
        triggerType: "after_action",
        linkedCheckpointId: "cp_before_undo_001",
        createdAt: new Date("2026-01-01T10:01:00.000Z"),
      });

      const res = await request(app)
        .post("/v1/time/undo")
        .set("X-API-Key", TEST_API_KEY)
        .send({
          projectId: "proj_test_001",
          includeContext: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.undoFromCheckpointId).toBe("cp_after_undo_001");
      expect(res.body.undoToCheckpointId).toBe("cp_before_undo_001");
      expect(res.body.restoredCount).toBe(1);
      expect(res.body.restoredFiles[0].path).toBe("src/x.ts");
    });
  });
});
