import { Router } from "express";
import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { apiKeyAuth } from "../middleware/auth.js";
import {
  requireOrgAdmin,
  requireOrgMember,
  OrgAuthenticatedRequest,
  OrgRole,
  canManageMember,
  roleHierarchy,
} from "../middleware/orgAuth.js";
import { eq, and, desc, gt } from "drizzle-orm";
import { getEmailService } from "../services/email.js";
import { logger } from "../lib/monitoring.js";

const router = Router({ mergeParams: true }); // mergeParams to access :id from parent router

// All routes require authentication
router.use(apiKeyAuth);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a unique member ID.
 */
function generateMemberId(): string {
  return `mem_${crypto.randomBytes(12).toString("hex")}`;
}

/**
 * Generate a unique invitation ID.
 */
function generateInvitationId(): string {
  return `inv_${crypto.randomBytes(12).toString("hex")}`;
}

/**
 * Generate a secure invitation token.
 */
function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ============================================
// LIST MEMBERS
// ============================================

router.get(
  "/members",
  requireOrgMember,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;

      // Get all members with user info
      const members = await db
        .select({
          id: schema.orgMembers.id,
          userId: schema.orgMembers.userId,
          role: schema.orgMembers.role,
          joinedAt: schema.orgMembers.joinedAt,
          invitedBy: schema.orgMembers.invitedBy,
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.orgMembers)
        .innerJoin(schema.users, eq(schema.orgMembers.userId, schema.users.id))
        .where(eq(schema.orgMembers.orgId, org.id))
        .orderBy(desc(schema.orgMembers.joinedAt));

      res.json({ members });
    } catch (error) {
      logger.error("List members error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to list members" });
    }
  }
);

// ============================================
// INVITE MEMBER
// ============================================

router.post(
  "/invitations",
  requireOrgAdmin,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;
      const userId = req.user!.userId;
      const { email, role = "member" } = req.body;

      if (!email || typeof email !== "string") {
        return res.status(400).json({
          error: "Validation error",
          message: "Email is required",
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid email format",
        });
      }

      // Validate role (can only invite as admin or member, not owner)
      if (!["admin", "member"].includes(role)) {
        return res.status(400).json({
          error: "Validation error",
          message: "Role must be 'admin' or 'member'",
        });
      }

      // Admins can only invite members, not other admins
      if (req.orgMembership!.role === "admin" && role === "admin") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Admins can only invite members, not other admins",
        });
      }

      // Check if user is already a member
      const [existingUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email.toLowerCase()))
        .limit(1);

      if (existingUser) {
        const [existingMember] = await db
          .select()
          .from(schema.orgMembers)
          .where(
            and(
              eq(schema.orgMembers.orgId, org.id),
              eq(schema.orgMembers.userId, existingUser.id)
            )
          )
          .limit(1);

        if (existingMember) {
          return res.status(400).json({
            error: "Already a member",
            message: "This user is already a member of the organization",
          });
        }
      }

      // Check for existing pending invitation
      const [existingInvitation] = await db
        .select()
        .from(schema.orgInvitations)
        .where(
          and(
            eq(schema.orgInvitations.orgId, org.id),
            eq(schema.orgInvitations.email, email.toLowerCase()),
            gt(schema.orgInvitations.expiresAt, new Date())
          )
        )
        .limit(1);

      if (existingInvitation) {
        return res.status(400).json({
          error: "Invitation exists",
          message: "A pending invitation already exists for this email",
        });
      }

      // Create invitation
      const invitationId = generateInvitationId();
      const token = generateInvitationToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

      await db.insert(schema.orgInvitations).values({
        id: invitationId,
        orgId: org.id,
        email: email.toLowerCase(),
        role,
        token,
        expiresAt,
        invitedBy: userId,
        createdAt: new Date(),
      });

      // Return invitation
      const [invitation] = await db
        .select()
        .from(schema.orgInvitations)
        .where(eq(schema.orgInvitations.id, invitationId))
        .limit(1);

      // Send invitation email
      const inviteUrl = `${process.env.WEBSITE_URL || "https://timemachine.gitgram.app"}/invite/${token}`;
      try {
        await getEmailService().send({
          to: email.toLowerCase(),
          subject: `You've been invited to join ${org.name} on Gitgram TimeMachine`,
          html: `
            <h2>You've been invited!</h2>
            <p>You've been invited to join <strong>${org.name}</strong> as a <strong>${role}</strong>.</p>
            <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Accept Invitation</a></p>
            <p>This invitation expires on ${expiresAt.toLocaleDateString()}.</p>
            <p>If you didn't expect this invitation, you can ignore this email.</p>
          `,
          text: `You've been invited to join ${org.name} as a ${role}. Accept here: ${inviteUrl} — Expires ${expiresAt.toLocaleDateString()}.`,
        });
      } catch (emailError) {
        logger.error("Failed to send invitation email", emailError instanceof Error ? emailError : undefined, { details: String(emailError) });
        // Don't fail the request — invitation was created successfully
      }

      res.status(201).json({
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
        token: token,
      });
    } catch (error) {
      logger.error("Invite member error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to create invitation" });
    }
  }
);

// ============================================
// LIST PENDING INVITATIONS
// ============================================

router.get(
  "/invitations",
  requireOrgAdmin,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;

      // Get all pending invitations
      const invitations = await db
        .select({
          id: schema.orgInvitations.id,
          email: schema.orgInvitations.email,
          role: schema.orgInvitations.role,
          expiresAt: schema.orgInvitations.expiresAt,
          createdAt: schema.orgInvitations.createdAt,
          invitedBy: schema.orgInvitations.invitedBy,
          inviterEmail: schema.users.email,
          inviterName: schema.users.name,
        })
        .from(schema.orgInvitations)
        .innerJoin(
          schema.users,
          eq(schema.orgInvitations.invitedBy, schema.users.id)
        )
        .where(
          and(
            eq(schema.orgInvitations.orgId, org.id),
            gt(schema.orgInvitations.expiresAt, new Date())
          )
        )
        .orderBy(desc(schema.orgInvitations.createdAt));

      res.json({ invitations });
    } catch (error) {
      logger.error("List invitations error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to list invitations" });
    }
  }
);

// ============================================
// CANCEL INVITATION
// ============================================

router.delete(
  "/invitations/:invitationId",
  requireOrgAdmin,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;
      const { invitationId } = req.params;

      // Find invitation
      const [invitation] = await db
        .select()
        .from(schema.orgInvitations)
        .where(
          and(
            eq(schema.orgInvitations.id, invitationId),
            eq(schema.orgInvitations.orgId, org.id)
          )
        )
        .limit(1);

      if (!invitation) {
        return res.status(404).json({
          error: "Not found",
          message: "Invitation not found",
        });
      }

      // Delete invitation
      await db
        .delete(schema.orgInvitations)
        .where(eq(schema.orgInvitations.id, invitationId));

      res.json({
        success: true,
        message: "Invitation cancelled",
      });
    } catch (error) {
      logger.error("Cancel invitation error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to cancel invitation" });
    }
  }
);

// ============================================
// REMOVE MEMBER
// ============================================

router.delete(
  "/members/:userId",
  requireOrgAdmin,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;
      const currentUserId = req.user!.userId;
      const actorRole = req.orgMembership!.role;
      const { userId: targetUserId } = req.params;

      // Cannot remove yourself (use leave instead)
      if (targetUserId === currentUserId) {
        return res.status(400).json({
          error: "Invalid operation",
          message: "Cannot remove yourself. Use the leave endpoint instead.",
        });
      }

      // Find target member
      const [targetMember] = await db
        .select()
        .from(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, org.id),
            eq(schema.orgMembers.userId, targetUserId)
          )
        )
        .limit(1);

      if (!targetMember) {
        return res.status(404).json({
          error: "Not found",
          message: "Member not found",
        });
      }

      const targetRole = targetMember.role as OrgRole;

      // Cannot remove owner
      if (targetRole === "owner") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Cannot remove the organization owner",
        });
      }

      // Check if actor can manage target
      if (!canManageMember(actorRole, targetRole)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission to remove this member",
        });
      }

      // Remove member
      await db
        .delete(schema.orgMembers)
        .where(eq(schema.orgMembers.id, targetMember.id));

      res.json({
        success: true,
        message: "Member removed from organization",
      });
    } catch (error) {
      logger.error("Remove member error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to remove member" });
    }
  }
);

// ============================================
// UPDATE MEMBER ROLE
// ============================================

router.patch(
  "/members/:userId",
  requireOrgAdmin,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;
      const currentUserId = req.user!.userId;
      const actorRole = req.orgMembership!.role;
      const { userId: targetUserId } = req.params;
      const { role: newRole } = req.body;

      if (!newRole || !["owner", "admin", "member"].includes(newRole)) {
        return res.status(400).json({
          error: "Validation error",
          message: "Role must be 'owner', 'admin', or 'member'",
        });
      }

      // Find target member
      const [targetMember] = await db
        .select()
        .from(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, org.id),
            eq(schema.orgMembers.userId, targetUserId)
          )
        )
        .limit(1);

      if (!targetMember) {
        return res.status(404).json({
          error: "Not found",
          message: "Member not found",
        });
      }

      const targetRole = targetMember.role as OrgRole;

      // Only owner can transfer ownership or promote to owner
      if (newRole === "owner" && actorRole !== "owner") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only the owner can transfer ownership",
        });
      }

      // Cannot change owner's role (they must transfer ownership first)
      if (targetRole === "owner" && newRole !== "owner") {
        return res.status(400).json({
          error: "Invalid operation",
          message: "Owner must transfer ownership before changing their role",
        });
      }

      // Admins can only change members, not other admins
      if (actorRole === "admin") {
        if (targetRole === "admin") {
          return res.status(403).json({
            error: "Forbidden",
            message: "Admins cannot change other admins' roles",
          });
        }
        if (newRole === "admin") {
          return res.status(403).json({
            error: "Forbidden",
            message: "Admins cannot promote members to admin",
          });
        }
      }

      // Handle ownership transfer
      if (newRole === "owner") {
        // Demote current owner to admin
        await db
          .update(schema.orgMembers)
          .set({ role: "admin" })
          .where(
            and(
              eq(schema.orgMembers.orgId, org.id),
              eq(schema.orgMembers.userId, currentUserId)
            )
          );

        // Update organization owner
        await db
          .update(schema.organizations)
          .set({ ownerId: targetUserId, updatedAt: new Date() })
          .where(eq(schema.organizations.id, org.id));
      }

      // Update target member's role
      await db
        .update(schema.orgMembers)
        .set({ role: newRole })
        .where(eq(schema.orgMembers.id, targetMember.id));

      // Return updated member
      const [updatedMember] = await db
        .select({
          id: schema.orgMembers.id,
          userId: schema.orgMembers.userId,
          role: schema.orgMembers.role,
          joinedAt: schema.orgMembers.joinedAt,
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.orgMembers)
        .innerJoin(schema.users, eq(schema.orgMembers.userId, schema.users.id))
        .where(eq(schema.orgMembers.id, targetMember.id))
        .limit(1);

      res.json({ member: updatedMember });
    } catch (error) {
      logger.error("Update member role error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to update member role" });
    }
  }
);

// ============================================
// LEAVE ORGANIZATION
// ============================================

router.post(
  "/leave",
  requireOrgMember,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;
      const userId = req.user!.userId;
      const membership = req.orgMembership!;

      // Owner cannot leave (must transfer ownership first)
      if (membership.role === "owner") {
        return res.status(400).json({
          error: "Cannot leave",
          message:
            "Organization owner cannot leave. Transfer ownership to another member first.",
        });
      }

      // Remove membership
      await db
        .delete(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, org.id),
            eq(schema.orgMembers.userId, userId)
          )
        );

      res.json({
        success: true,
        message: "Left organization successfully",
      });
    } catch (error) {
      logger.error("Leave organization error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to leave organization" });
    }
  }
);

export default router;
