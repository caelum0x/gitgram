/**
 * Integration Tests: Team Workspace Routes (/v1/teams)
 *
 * Covers the team workspace flow, including the previously-untested
 * shared-session paths (GET /teams/:id stats, GET /teams/:id/sessions) that
 * relied on JSONB metadata lookups, and the invitation create/accept flow.
 *
 *   POST   /v1/teams
 *   GET    /v1/teams/:id
 *   PATCH  /v1/teams/:id
 *   POST   /v1/teams/:id/members
 *   POST   /v1/teams/invitations/:token/accept
 *   DELETE /v1/teams/:id/members/:userId
 *   GET    /v1/teams/:id/sessions
 *   POST   /v1/teams/:id/sessions/:sessionId/share
 *   GET    /v1/teams/:id/activity
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  seedTestData,
  createTestApp,
  TEST_API_KEY,
  mockOrganizations,
  mockOrgMembers,
  mockChatSessions,
  mockOrgInvitations,
  mockUsers,
} from "../setup.js";

let app: Express;

const TEST_USER_ID = "user_test_001";

/** Seed a team (org) owned by the test user with an owner membership. */
function seedTeam(teamId: string): void {
  mockOrganizations.push({
    id: teamId,
    name: "Engineering",
    slug: "engineering",
    ownerId: TEST_USER_ID,
    plan: "team",
    metadata: { description: "Eng team" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  mockOrgMembers.push({
    id: "mem_owner_001",
    orgId: teamId,
    userId: TEST_USER_ID,
    role: "owner",
    invitedBy: null,
    joinedAt: new Date(),
  });
}

beforeAll(async () => {
  app = await createTestApp();
});

beforeEach(() => {
  seedTestData();
});

describe("Team Routes - /v1/teams", () => {
  describe("POST /v1/teams", () => {
    it("requires authentication", async () => {
      const res = await request(app).post("/v1/teams").send({ name: "Team" });
      expect(res.status).toBe(401);
    });

    it("creates a team and returns an invite code", async () => {
      const res = await request(app)
        .post("/v1/teams")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "My Team", description: "A team" });

      expect(res.status).toBe(201);
      expect(res.body.team).toHaveProperty("name", "My Team");
      expect(res.body.team).toHaveProperty("slug");
      expect(res.body).toHaveProperty("inviteCode");
    });

    it("rejects an empty name", async () => {
      const res = await request(app)
        .post("/v1/teams")
        .set("X-API-Key", TEST_API_KEY)
        .send({ name: "" });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /v1/teams/:id", () => {
    it("returns team details + stats for a member", async () => {
      const teamId = "team_get_001";
      seedTeam(teamId);

      const res = await request(app)
        .get(`/v1/teams/${teamId}`)
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.team).toHaveProperty("id", teamId);
      expect(res.body).toHaveProperty("members");
      expect(res.body.stats).toHaveProperty("members");
      expect(res.body.stats).toHaveProperty("sharedSessions");
      expect(res.body.membership).toHaveProperty("role", "admin");
    });

    it("returns 403 for a non-member", async () => {
      const teamId = "team_get_002";
      mockOrganizations.push({
        id: teamId,
        name: "Other",
        slug: "other",
        ownerId: "user_other",
        plan: "team",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get(`/v1/teams/${teamId}`)
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(403);
    });

    it("returns 404 for an unknown team", async () => {
      const res = await request(app)
        .get("/v1/teams/team_missing")
        .set("X-API-Key", TEST_API_KEY);
      expect(res.status).toBe(404);
    });
  });

  describe("session sharing", () => {
    it("shares a session and lists shared sessions without error", async () => {
      const teamId = "team_share_001";
      seedTeam(teamId);

      mockChatSessions.push({
        id: "sess_001",
        userId: TEST_USER_ID,
        projectId: "proj_test_001",
        tool: "claude",
        startedAt: new Date(),
        endedAt: null,
        metadata: {},
      });

      const shareRes = await request(app)
        .post(`/v1/teams/${teamId}/sessions/sess_001/share`)
        .set("X-API-Key", TEST_API_KEY)
        .send();

      expect(shareRes.status).toBe(200);
      expect(shareRes.body).toHaveProperty("success", true);
      expect(shareRes.body).toHaveProperty("teamId", teamId);

      // The previously-broken JSONB list path must respond 200 (not 500).
      const listRes = await request(app)
        .get(`/v1/teams/${teamId}/sessions`)
        .set("X-API-Key", TEST_API_KEY);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.sessions)).toBe(true);
      expect(listRes.body.meta).toHaveProperty("page", 1);
    });

    it("returns 404 when sharing a session you do not own", async () => {
      const teamId = "team_share_002";
      seedTeam(teamId);

      const res = await request(app)
        .post(`/v1/teams/${teamId}/sessions/sess_missing/share`)
        .set("X-API-Key", TEST_API_KEY)
        .send();

      expect(res.status).toBe(404);
    });
  });

  describe("invitations", () => {
    it("creates an invitation and reports email delivery", async () => {
      const teamId = "team_inv_001";
      seedTeam(teamId);

      const res = await request(app)
        .post(`/v1/teams/${teamId}/members`)
        .set("X-API-Key", TEST_API_KEY)
        .send({ email: "newbie@example.com", role: "member" });

      expect(res.status).toBe(201);
      expect(res.body.invitation).toHaveProperty("token");
      expect(res.body.invitation).toHaveProperty("email", "newbie@example.com");
      expect(res.body).toHaveProperty("emailDelivered", true);
    });

    it("accepts a valid invitation and adds the user as a member", async () => {
      const teamId = "team_inv_002";
      mockOrganizations.push({
        id: teamId,
        name: "Accept Team",
        slug: "accept-team",
        ownerId: "user_owner_x",
        plan: "team",
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const token = "tok_valid_123";
      mockOrgInvitations.push({
        id: "inv_001",
        orgId: teamId,
        email: mockUsers[0].email, // matches the authenticated test user
        role: "member",
        token,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        invitedBy: "user_owner_x",
      });

      const res = await request(app)
        .post(`/v1/teams/invitations/${token}/accept`)
        .set("X-API-Key", TEST_API_KEY)
        .send();

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("teamId", teamId);
      expect(res.body).toHaveProperty("role", "member");
      // The membership row should have been inserted.
      const added = mockOrgMembers.find(
        (m) => m.orgId === teamId && m.userId === TEST_USER_ID
      );
      expect(added).toBeDefined();
    });

    it("returns 404 for an unknown invitation token", async () => {
      const res = await request(app)
        .post("/v1/teams/invitations/tok_missing/accept")
        .set("X-API-Key", TEST_API_KEY)
        .send();
      expect(res.status).toBe(404);
    });

    it("returns 410 for an expired invitation", async () => {
      const token = "tok_expired_123";
      mockOrgInvitations.push({
        id: "inv_expired",
        orgId: "team_any",
        email: mockUsers[0].email,
        role: "member",
        token,
        expiresAt: new Date(Date.now() - 60_000),
        createdAt: new Date(),
        invitedBy: "user_owner_x",
      });

      const res = await request(app)
        .post(`/v1/teams/invitations/${token}/accept`)
        .set("X-API-Key", TEST_API_KEY)
        .send();
      expect(res.status).toBe(410);
    });

    it("returns 403 when the invitation email does not match the caller", async () => {
      const token = "tok_mismatch_123";
      mockOrgInvitations.push({
        id: "inv_mismatch",
        orgId: "team_any",
        email: "someone-else@example.com",
        role: "member",
        token,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        invitedBy: "user_owner_x",
      });

      const res = await request(app)
        .post(`/v1/teams/invitations/${token}/accept`)
        .set("X-API-Key", TEST_API_KEY)
        .send();
      expect(res.status).toBe(403);
    });
  });

  describe("GET /v1/teams/:id/activity", () => {
    it("returns an activity feed for a member", async () => {
      const teamId = "team_act_001";
      seedTeam(teamId);

      const res = await request(app)
        .get(`/v1/teams/${teamId}/activity`)
        .set("X-API-Key", TEST_API_KEY);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.activity)).toBe(true);
      expect(res.body.meta).toHaveProperty("page", 1);
    });
  });
});
