/**
 * Team Workspace Routes
 *
 * Team workspaces are a collaborative layer on top of AITM organizations.
 * They share the same underlying `organizations` / `orgMembers` storage but
 * expose a workspace-oriented API surface with roles: admin | member | viewer.
 *
 * Routes:
 *   POST   /teams                              - Create a team
 *   GET    /teams/:id                          - Get team details + stats
 *   PATCH  /teams/:id                          - Update team (admin only)
 *   POST   /teams/:id/members                  - Invite a member (admin only)
 *   POST   /teams/invitations/:token/accept    - Redeem an invitation
 *   DELETE /teams/:id/members/:userId          - Remove a member (admin only)
 *   GET    /teams/:id/sessions                 - List shared sessions
 *   POST   /teams/:id/sessions/:sessionId/share - Share a session with the team
 *   GET    /teams/:id/activity                 - Team activity feed
 */

import { Router } from "express";
import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  requireTeamMember,
  requireTeamAdmin,
  TeamAuthenticatedRequest,
} from "../middleware/teamMiddleware.js";
import { eq, and, desc, count, or, sql } from "drizzle-orm";
import { logger } from "../lib/monitoring.js";
import { sendInviteEmail } from "./teamInviteEmail.js";
import {
  createTeamSchema,
  updateTeamSchema,
  inviteMemberSchema,
  acceptInvitationSchema,
  generateTeamId,
  generateMemberId,
  generateInviteCode,
  generateInvitationId,
  normalizeSlug,
} from "./teamHelpers.js";

const router = Router();

// All team routes require authentication
router.use(apiKeyAuth);


// ============================================
// POST /teams — Create a team
// ============================================

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = createTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        message: parsed.error.errors[0]?.message ?? "Invalid input",
        details: parsed.error.errors,
      });
    }

    const { name, slug: rawSlug, description } = parsed.data;
    const userId = req.user!.userId;

    let slug = rawSlug ? normalizeSlug(rawSlug) : normalizeSlug(name);
    if (slug.length < 3) {
      return res.status(400).json({
        error: "Validation error",
        message: "Team slug must be at least 3 characters",
      });
    }

    // Ensure slug uniqueness — append random suffix if taken
    const [existing] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, slug))
      .limit(1);

    if (existing) {
      slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
    }

    const teamId = generateTeamId();
    const memberId = generateMemberId();
    const inviteCode = generateInviteCode();
    const now = new Date();

    await db.insert(schema.organizations).values({
      id: teamId,
      name,
      slug,
      ownerId: userId,
      plan: "team",
      metadata: { description: description ?? null, inviteCode },
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.orgMembers).values({
      id: memberId,
      orgId: teamId,
      userId,
      role: "owner",
      invitedBy: null,
      joinedAt: now,
    });

    const [team] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, teamId))
      .limit(1);

    return res.status(201).json({ team, inviteCode });
  } catch (error) {
    logger.error("Create team error", error instanceof Error ? error : undefined, {
      details: String(error),
    });
    return res.status(500).json({ error: "Failed to create team" });
  }
});

// ============================================
// GET /teams/:id — Get team details + stats
// ============================================

router.get(
  "/:id",
  requireTeamMember,
  async (req: TeamAuthenticatedRequest, res) => {
    try {
      const team = req.team!;
      const membership = req.teamMembership!;

      // Fetch members with user info
      const members = await db
        .select({
          id: schema.orgMembers.id,
          userId: schema.orgMembers.userId,
          role: schema.orgMembers.role,
          joinedAt: schema.orgMembers.joinedAt,
          email: schema.users.email,
        })
        .from(schema.orgMembers)
        .innerJoin(schema.users, eq(schema.orgMembers.userId, schema.users.id))
        .where(eq(schema.orgMembers.orgId, team.id))
        .orderBy(schema.orgMembers.joinedAt);

      // Shared session count: sessions whose metadata marks them as team-shared
      const [sharedSessionCount] = await db
        .select({ count: count() })
        .from(schema.chatSessions)
        .where(
          sql`${schema.chatSessions.metadata}->>'teamId' = ${team.id}`
        );

      const [memberCount] = await db
        .select({ count: count() })
        .from(schema.orgMembers)
        .where(eq(schema.orgMembers.orgId, team.id));

      const stats = {
        members: memberCount?.count ?? 0,
        sharedSessions: sharedSessionCount?.count ?? 0,
      };

      return res.json({
        team,
        members,
        membership: { role: membership.role, joinedAt: membership.joinedAt },
        stats,
      });
    } catch (error) {
      logger.error("Get team error", error instanceof Error ? error : undefined, {
        details: String(error),
      });
      return res.status(500).json({ error: "Failed to get team" });
    }
  }
);

// ============================================
// PATCH /teams/:id — Update team (admin only)
// ============================================

router.patch(
  "/:id",
  requireTeamAdmin,
  async (req: TeamAuthenticatedRequest, res) => {
    try {
      const team = req.team!;

      const parsed = updateTeamSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: parsed.error.errors[0]?.message ?? "Invalid input",
          details: parsed.error.errors,
        });
      }

      const { name, slug: rawSlug, description } = parsed.data;

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (name !== undefined) {
        updates.name = name;
      }

      if (rawSlug !== undefined) {
        const slug = normalizeSlug(rawSlug);
        if (slug.length < 3) {
          return res.status(400).json({
            error: "Validation error",
            message: "Team slug must be at least 3 characters",
          });
        }

        const [taken] = await db
          .select({ id: schema.organizations.id })
          .from(schema.organizations)
          .where(eq(schema.organizations.slug, slug))
          .limit(1);

        if (taken && taken.id !== team.id) {
          return res.status(400).json({
            error: "Validation error",
            message: "Team slug is already taken",
          });
        }

        updates.slug = slug;
      }

      if (description !== undefined) {
        // Merge description into existing metadata
        const [current] = await db
          .select({ metadata: schema.organizations.metadata })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, team.id))
          .limit(1);

        updates.metadata = {
          ...(current?.metadata as Record<string, unknown> | null ?? {}),
          description,
        };
      }

      await db
        .update(schema.organizations)
        .set(updates)
        .where(eq(schema.organizations.id, team.id));

      const [updated] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, team.id))
        .limit(1);

      return res.json({ team: updated });
    } catch (error) {
      logger.error("Update team error", error instanceof Error ? error : undefined, {
        details: String(error),
      });
      return res.status(500).json({ error: "Failed to update team" });
    }
  }
);

// ============================================
// POST /teams/:id/members — Invite a member (admin only)
// ============================================

router.post(
  "/:id/members",
  requireTeamAdmin,
  async (req: TeamAuthenticatedRequest, res) => {
    try {
      const team = req.team!;
      const actorId = req.user!.userId;

      const parsed = inviteMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: parsed.error.errors[0]?.message ?? "Invalid input",
          details: parsed.error.errors,
        });
      }

      const { email, role } = parsed.data;

      // Check if user with this email already exists in the team
      const [targetUser] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);

      if (targetUser) {
        const [alreadyMember] = await db
          .select({ id: schema.orgMembers.id })
          .from(schema.orgMembers)
          .where(
            and(
              eq(schema.orgMembers.orgId, team.id),
              eq(schema.orgMembers.userId, targetUser.id)
            )
          )
          .limit(1);

        if (alreadyMember) {
          return res.status(409).json({
            error: "Conflict",
            message: "User is already a member of this team",
          });
        }
      }

      // Create an invitation
      const invitationId = generateInvitationId();
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const now = new Date();

      await db.insert(schema.orgInvitations).values({
        id: invitationId,
        orgId: team.id,
        email,
        role,
        token,
        expiresAt,
        createdAt: now,
        invitedBy: actorId,
      });

      // Deliver the invitation email. Email failures must not roll back the
      // invitation row — the token is still valid and can be resent — so we
      // capture delivery status and surface it to the caller.
      let emailDelivered = false;
      try {
        await sendInviteEmail({
          email,
          teamName: team.name,
          inviterEmail: req.user!.email,
          role,
          token,
          expiresAt,
        });
        emailDelivered = true;
      } catch (emailError) {
        logger.error(
          "Failed to send team invitation email",
          emailError instanceof Error ? emailError : undefined,
          { details: String(emailError), invitationId }
        );
      }

      return res.status(201).json({
        invitation: {
          id: invitationId,
          email,
          role,
          token,
          expiresAt,
          teamId: team.id,
        },
        emailDelivered,
        message: emailDelivered
          ? `Invitation sent to ${email}`
          : `Invitation created for ${email}, but the email could not be delivered`,
      });
    } catch (error) {
      logger.error("Invite team member error", error instanceof Error ? error : undefined, {
        details: String(error),
      });
      return res.status(500).json({ error: "Failed to invite team member" });
    }
  }
);

// ============================================
// POST /teams/invitations/:token/accept — Redeem an invitation
// ============================================
//
// Note: this route is intentionally NOT guarded by requireTeamMember/Admin —
// the caller is not yet a member of the target team. It only requires a valid
// authenticated user (apiKeyAuth, applied router-wide) whose email matches the
// invitation. Placed before "/:id/members/:userId" so the literal
// "invitations" segment is matched ahead of the "/:id" param routes.

router.post("/invitations/:token/accept", async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = acceptInvitationSchema.safeParse({ token: req.params.token });
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        message: "Invalid invitation token",
      });
    }

    const userId = req.user!.userId;
    const userEmail = req.user!.email;
    const { token } = parsed.data;

    const [invitation] = await db
      .select()
      .from(schema.orgInvitations)
      .where(eq(schema.orgInvitations.token, token))
      .limit(1);

    if (!invitation) {
      return res.status(404).json({
        error: "Not found",
        message: "Invitation not found or already used",
      });
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      // Clean up expired invitation so the token cannot be retried.
      await db
        .delete(schema.orgInvitations)
        .where(eq(schema.orgInvitations.id, invitation.id));
      return res.status(410).json({
        error: "Gone",
        message: "This invitation has expired",
      });
    }

    // The invitation is bound to a specific email; only that recipient may redeem it.
    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      return res.status(403).json({
        error: "Forbidden",
        message: "This invitation was issued for a different email address",
      });
    }

    // Idempotency: if already a member, consume the invitation and report success.
    const [existingMember] = await db
      .select({ id: schema.orgMembers.id })
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.orgId, invitation.orgId),
          eq(schema.orgMembers.userId, userId)
        )
      )
      .limit(1);

    if (existingMember) {
      await db
        .delete(schema.orgInvitations)
        .where(eq(schema.orgInvitations.id, invitation.id));
      return res.json({
        success: true,
        alreadyMember: true,
        teamId: invitation.orgId,
        message: "You are already a member of this team",
      });
    }

    const now = new Date();
    await db.insert(schema.orgMembers).values({
      id: generateMemberId(),
      orgId: invitation.orgId,
      userId,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      joinedAt: now,
    });

    // Invitation is single-use — remove it once redeemed.
    await db
      .delete(schema.orgInvitations)
      .where(eq(schema.orgInvitations.id, invitation.id));

    const [team] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, invitation.orgId))
      .limit(1);

    return res.status(201).json({
      success: true,
      teamId: invitation.orgId,
      role: invitation.role,
      team: team ?? null,
      message: "Invitation accepted — you are now a member of the team",
    });
  } catch (error) {
    logger.error("Accept team invitation error", error instanceof Error ? error : undefined, {
      details: String(error),
    });
    return res.status(500).json({ error: "Failed to accept invitation" });
  }
});

// ============================================
// DELETE /teams/:id/members/:userId — Remove member (admin only)
// ============================================

router.delete(
  "/:id/members/:userId",
  requireTeamAdmin,
  async (req: TeamAuthenticatedRequest, res) => {
    try {
      const team = req.team!;
      const actorId = req.user!.userId;
      const { userId: targetUserId } = req.params;

      // Cannot remove yourself
      if (targetUserId === actorId) {
        return res.status(400).json({
          error: "Bad request",
          message: "You cannot remove yourself from the team",
        });
      }

      // Cannot remove the team owner
      if (targetUserId === team.ownerId) {
        return res.status(403).json({
          error: "Forbidden",
          message: "The team owner cannot be removed",
        });
      }

      const [membership] = await db
        .select()
        .from(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, team.id),
            eq(schema.orgMembers.userId, targetUserId)
          )
        )
        .limit(1);

      if (!membership) {
        return res.status(404).json({
          error: "Not found",
          message: "User is not a member of this team",
        });
      }

      await db
        .delete(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, team.id),
            eq(schema.orgMembers.userId, targetUserId)
          )
        );

      return res.json({ success: true, message: "Member removed from team" });
    } catch (error) {
      logger.error("Remove team member error", error instanceof Error ? error : undefined, {
        details: String(error),
      });
      return res.status(500).json({ error: "Failed to remove team member" });
    }
  }
);

// ============================================
// GET /teams/:id/sessions — List shared sessions
// ============================================

router.get(
  "/:id/sessions",
  requireTeamMember,
  async (req: TeamAuthenticatedRequest, res) => {
    try {
      const team = req.team!;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
      const offset = (page - 1) * limit;

      // Sessions shared with this team are stored with metadata.teamId = team.id
      // We query chatSessions that have been shared — stored via the share endpoint
      const sharedSessions = await db
        .select({
          id: schema.chatSessions.id,
          projectId: schema.chatSessions.projectId,
          userId: schema.chatSessions.userId,
          tool: schema.chatSessions.tool,
          startedAt: schema.chatSessions.startedAt,
          endedAt: schema.chatSessions.endedAt,
          metadata: schema.chatSessions.metadata,
          ownerEmail: schema.users.email,
        })
        .from(schema.chatSessions)
        .innerJoin(schema.users, eq(schema.chatSessions.userId, schema.users.id))
        .where(
          sql`${schema.chatSessions.metadata}->>'teamId' = ${team.id}`
        )
        .orderBy(desc(schema.chatSessions.startedAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await db
        .select({ count: count() })
        .from(schema.chatSessions)
        .where(
          sql`${schema.chatSessions.metadata}->>'teamId' = ${team.id}`
        );

      return res.json({
        sessions: sharedSessions,
        meta: {
          total: totalRow?.count ?? 0,
          page,
          limit,
        },
      });
    } catch (error) {
      logger.error("List team sessions error", error instanceof Error ? error : undefined, {
        details: String(error),
      });
      return res.status(500).json({ error: "Failed to list team sessions" });
    }
  }
);

// ============================================
// POST /teams/:id/sessions/:sessionId/share — Share a session with the team
// ============================================

router.post(
  "/:id/sessions/:sessionId/share",
  requireTeamMember,
  async (req: TeamAuthenticatedRequest, res) => {
    try {
      const team = req.team!;
      const userId = req.user!.userId;
      const { sessionId } = req.params;

      // Verify session exists and belongs to this user
      const [session] = await db
        .select()
        .from(schema.chatSessions)
        .where(
          and(
            eq(schema.chatSessions.id, sessionId),
            eq(schema.chatSessions.userId, userId)
          )
        )
        .limit(1);

      if (!session) {
        return res.status(404).json({
          error: "Not found",
          message: "Session not found or does not belong to you",
        });
      }

      // Merge teamId into session metadata
      const currentMeta = (session.metadata as Record<string, unknown> | null) ?? {};
      const updatedMeta = { ...currentMeta, teamId: team.id, sharedAt: new Date().toISOString() };

      await db
        .update(schema.chatSessions)
        .set({ metadata: updatedMeta })
        .where(eq(schema.chatSessions.id, sessionId));

      return res.json({
        success: true,
        sessionId,
        teamId: team.id,
        message: "Session shared with team",
      });
    } catch (error) {
      logger.error("Share team session error", error instanceof Error ? error : undefined, {
        details: String(error),
      });
      return res.status(500).json({ error: "Failed to share session with team" });
    }
  }
);

// ============================================
// GET /teams/:id/activity — Team activity feed
// ============================================

router.get(
  "/:id/activity",
  requireTeamMember,
  async (req: TeamAuthenticatedRequest, res) => {
    try {
      const team = req.team!;
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "30"), 10)));
      const offset = (page - 1) * limit;

      // Collect team member user IDs
      const memberRows = await db
        .select({ userId: schema.orgMembers.userId })
        .from(schema.orgMembers)
        .where(eq(schema.orgMembers.orgId, team.id));

      const memberIds = memberRows.map((m) => m.userId);

      if (memberIds.length === 0) {
        return res.json({ activity: [], meta: { total: 0, page, limit } });
      }

      // Pull audit log entries for all team members' actions within this team context.
      // Falls back to recent chatSession starts across team members as a proxy feed.
      const recentSessions = await db
        .select({
          id: schema.chatSessions.id,
          type: schema.chatSessions.tool,
          userId: schema.chatSessions.userId,
          userEmail: schema.users.email,
          projectId: schema.chatSessions.projectId,
          occurredAt: schema.chatSessions.startedAt,
          metadata: schema.chatSessions.metadata,
        })
        .from(schema.chatSessions)
        .innerJoin(schema.users, eq(schema.chatSessions.userId, schema.users.id))
        .where(
          or(
            ...memberIds.map((uid) => eq(schema.chatSessions.userId, uid))
          )
        )
        .orderBy(desc(schema.chatSessions.startedAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await db
        .select({ count: count() })
        .from(schema.chatSessions)
        .where(
          or(
            ...memberIds.map((uid) => eq(schema.chatSessions.userId, uid))
          )
        );

      const activity = recentSessions.map((s) => ({
        id: s.id,
        type: "session_started",
        actor: { userId: s.userId, email: s.userEmail },
        projectId: s.projectId,
        tool: s.type,
        occurredAt: s.occurredAt,
        metadata: s.metadata,
      }));

      return res.json({
        activity,
        meta: {
          total: totalRow?.count ?? 0,
          page,
          limit,
        },
      });
    } catch (error) {
      logger.error("Team activity error", error instanceof Error ? error : undefined, {
        details: String(error),
      });
      return res.status(500).json({ error: "Failed to get team activity" });
    }
  }
);

export default router;
