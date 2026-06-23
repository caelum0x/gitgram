/**
 * Unit tests for sharingService.ts
 *
 * The sharing service stores share records in a process-local Map. Tests
 * must exercise createShare, getShare, revokeShare, and listShares while
 * asserting visibility rules, ownership checks, and expiry logic.
 *
 * The mock DB (from tests/setup.ts) is used for chatSessions lookups.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  mockChatSessions,
  mockCheckpoints,
  mockUsers,
  seedTestData,
} from "../setup.js";
import {
  createShare,
  getShare,
  revokeShare,
  listShares,
  ShareRecord,
} from "../../src/services/sharingService.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed a minimal chatSession record visible to the mock DB. */
function seedSession(
  id: string,
  userId: string = "user_test_001",
  projectId: string = "proj_test_001"
) {
  mockChatSessions.push({
    id,
    projectId,
    userId,
    tool: "claude-code",
    startedAt: new Date(),
    endedAt: null,
    metadata: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sharingService", () => {
  beforeEach(() => {
    seedTestData();
    // Clear dynamic data so each test starts clean
    mockChatSessions.length = 0;
    mockCheckpoints.length = 0;
  });

  // =========================================================================
  // createShare
  // =========================================================================

  describe("createShare", () => {
    it("creates a public share and returns a ShareRecord", async () => {
      seedSession("sess_pub_001");

      const record = await createShare("sess_pub_001", "user_test_001", {
        visibility: "public",
      });

      expect(record.shareId).toBeTruthy();
      expect(record.sessionId).toBe("sess_pub_001");
      expect(record.ownerId).toBe("user_test_001");
      expect(record.visibility).toBe("public");
      expect(record.expiresAt).toBeNull();
    });

    it("creates a private share with an expiry", async () => {
      seedSession("sess_priv_001");

      const record = await createShare("sess_priv_001", "user_test_001", {
        visibility: "private",
        expiresIn: 24, // 24 hours
      });

      expect(record.visibility).toBe("private");
      expect(record.expiresAt).not.toBeNull();
      const diffHours =
        (record.expiresAt!.getTime() - record.createdAt.getTime()) /
        (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0);
    });

    it("creates a team share when teamId is provided", async () => {
      seedSession("sess_team_001");

      const record = await createShare("sess_team_001", "user_test_001", {
        visibility: "team",
        teamId: "team_alpha",
      });

      expect(record.visibility).toBe("team");
      expect(record.teamId).toBe("team_alpha");
    });

    it("throws when visibility is 'team' but teamId is missing", async () => {
      seedSession("sess_team_002");

      await expect(
        createShare("sess_team_002", "user_test_001", {
          visibility: "team",
        })
      ).rejects.toThrow("teamId is required");
    });

    it("throws when the session does not belong to the requesting user", async () => {
      seedSession("sess_other_001", "user_other_999");

      await expect(
        createShare("sess_other_001", "user_test_001", {
          visibility: "public",
        })
      ).rejects.toThrow("not found or not owned");
    });

    it("throws on invalid visibility value", async () => {
      seedSession("sess_badvis_001");

      await expect(
        createShare("sess_badvis_001", "user_test_001", {
          // @ts-expect-error intentionally passing invalid value
          visibility: "unknown_vis",
        })
      ).rejects.toThrow("Invalid visibility");
    });

    it("generates a unique shareId for every call", async () => {
      seedSession("sess_unique_001");
      const a = await createShare("sess_unique_001", "user_test_001", {
        visibility: "public",
      });
      const b = await createShare("sess_unique_001", "user_test_001", {
        visibility: "public",
      });
      expect(a.shareId).not.toBe(b.shareId);
    });
  });

  // =========================================================================
  // getShare
  // =========================================================================

  describe("getShare", () => {
    it("returns share and session data for a public share without auth", async () => {
      seedSession("sess_pub_get_001");
      // Ensure the user (owner) exists — already seeded by seedTestData

      const share = await createShare("sess_pub_get_001", "user_test_001", {
        visibility: "public",
      });

      const result = await getShare(share.shareId);
      expect(result.share.shareId).toBe(share.shareId);
      expect(result.session.id).toBe("sess_pub_get_001");
      expect(result.sharedBy.id).toBe("user_test_001");
    });

    it("throws when the share does not exist", async () => {
      await expect(getShare("nonexistent_share_id")).rejects.toThrow("not found");
    });

    it("throws when the share has expired", async () => {
      seedSession("sess_expired_001");
      const share = await createShare("sess_expired_001", "user_test_001", {
        visibility: "public",
        expiresIn: 0.0001, // expires almost immediately
      });

      // Wait just enough for the expiry to pass
      await new Promise((r) => setTimeout(r, 500));

      await expect(getShare(share.shareId)).rejects.toThrow("expired");
    });

    it("throws when accessing a private share as the wrong user", async () => {
      seedSession("sess_priv_get_001");
      const share = await createShare("sess_priv_get_001", "user_test_001", {
        visibility: "private",
      });

      await expect(
        getShare(share.shareId, "user_stranger_001")
      ).rejects.toThrow("do not have permission");
    });

    it("allows the owner to access their own private share", async () => {
      seedSession("sess_priv_owner_001");
      const share = await createShare("sess_priv_owner_001", "user_test_001", {
        visibility: "private",
      });

      const result = await getShare(share.shareId, "user_test_001");
      expect(result.share.visibility).toBe("private");
    });

    it("throws when accessing a team share with the wrong teamId", async () => {
      seedSession("sess_team_get_001");
      const share = await createShare("sess_team_get_001", "user_test_001", {
        visibility: "team",
        teamId: "team_alpha",
      });

      await expect(
        getShare(share.shareId, "user_test_001", "team_beta")
      ).rejects.toThrow("restricted to a specific team");
    });

    it("allows access to a team share with the correct teamId", async () => {
      seedSession("sess_team_ok_001");
      const share = await createShare("sess_team_ok_001", "user_test_001", {
        visibility: "team",
        teamId: "team_alpha",
      });

      const result = await getShare(share.shareId, "user_test_001", "team_alpha");
      expect(result.share.teamId).toBe("team_alpha");
    });
  });

  // =========================================================================
  // revokeShare
  // =========================================================================

  describe("revokeShare", () => {
    it("removes the share so subsequent getShare throws not found", async () => {
      seedSession("sess_revoke_001");
      const share = await createShare("sess_revoke_001", "user_test_001", {
        visibility: "public",
      });

      await revokeShare(share.shareId, "user_test_001");

      await expect(getShare(share.shareId)).rejects.toThrow("not found");
    });

    it("throws when a non-owner tries to revoke", async () => {
      seedSession("sess_revoke_perm_001");
      const share = await createShare("sess_revoke_perm_001", "user_test_001", {
        visibility: "public",
      });

      await expect(
        revokeShare(share.shareId, "user_intruder_001")
      ).rejects.toThrow("do not have permission to revoke");
    });

    it("throws when trying to revoke a share that does not exist", async () => {
      await expect(revokeShare("ghost_share_id", "user_test_001")).rejects.toThrow(
        "not found"
      );
    });
  });

  // =========================================================================
  // listShares
  // =========================================================================

  describe("listShares", () => {
    it("lists all active shares for a session", async () => {
      seedSession("sess_list_001");
      const a = await createShare("sess_list_001", "user_test_001", {
        visibility: "public",
      });
      const b = await createShare("sess_list_001", "user_test_001", {
        visibility: "private",
      });

      const shares = await listShares("sess_list_001", "user_test_001");
      expect(shares.length).toBe(2);
      // Both share IDs must appear (order may vary when timestamps are equal)
      const ids = shares.map((s) => s.shareId);
      expect(ids).toContain(a.shareId);
      expect(ids).toContain(b.shareId);
    });

    it("excludes expired shares from the listing", async () => {
      seedSession("sess_list_exp_001");
      // Expired share
      await createShare("sess_list_exp_001", "user_test_001", {
        visibility: "public",
        expiresIn: 0.0001,
      });
      // Wait for expiry
      await new Promise((r) => setTimeout(r, 500));
      // Active share
      await createShare("sess_list_exp_001", "user_test_001", {
        visibility: "public",
      });

      const shares = await listShares("sess_list_exp_001", "user_test_001");
      expect(shares.length).toBe(1);
      expect(shares[0].expiresAt).toBeNull();
    });

    it("returns an empty array when no shares exist for the session", async () => {
      seedSession("sess_list_empty_001");
      const shares = await listShares("sess_list_empty_001", "user_test_001");
      expect(shares).toEqual([]);
    });

    it("throws when the session does not belong to the user", async () => {
      seedSession("sess_list_other_001", "user_other_001");

      await expect(
        listShares("sess_list_other_001", "user_test_001")
      ).rejects.toThrow("not found or not owned");
    });
  });
});
