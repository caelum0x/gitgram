import { Response, NextFunction } from "express";
import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { AuthenticatedRequest } from "./auth.js";
import { logger } from "../lib/monitoring.js";

// ============================================
// TYPES
// ============================================

export type TeamRole = "admin" | "member" | "viewer";

export interface TeamInfo {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: string | null;
}

export interface TeamMembership {
  role: TeamRole;
  joinedAt: Date | null;
}

export interface TeamAuthenticatedRequest extends AuthenticatedRequest {
  team?: TeamInfo;
  teamMembership?: TeamMembership;
}

// ============================================
// HELPERS
// ============================================

/**
 * Extract team ID from request params.
 * Looks for :id in route params.
 */
function getTeamIdFromRequest(req: TeamAuthenticatedRequest): string | null {
  return req.params.id ?? null;
}

/**
 * Map org-level roles to team roles.
 * Organizations use owner/admin/member; teams add viewer and collapse owner->admin.
 */
function toTeamRole(orgRole: string): TeamRole {
  if (orgRole === "owner" || orgRole === "admin") return "admin";
  if (orgRole === "viewer") return "viewer";
  return "member";
}

/**
 * Middleware factory: enforce a minimum team role.
 * Must be used after apiKeyAuth.
 */
function requireTeamRole(allowedRoles: TeamRole[]) {
  return async (
    req: TeamAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized", message: "Authentication required" });
        return;
      }

      const teamId = getTeamIdFromRequest(req);
      if (!teamId) {
        res.status(400).json({ error: "Bad request", message: "Team ID is required" });
        return;
      }

      const [org] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, teamId))
        .limit(1);

      if (!org) {
        res.status(404).json({ error: "Not found", message: "Team not found" });
        return;
      }

      const [membership] = await db
        .select()
        .from(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, teamId),
            eq(schema.orgMembers.userId, req.user.userId)
          )
        )
        .limit(1);

      if (!membership) {
        res.status(403).json({ error: "Forbidden", message: "You are not a member of this team" });
        return;
      }

      const teamRole = toTeamRole(membership.role);
      if (!allowedRoles.includes(teamRole)) {
        res.status(403).json({
          error: "Forbidden",
          message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
        });
        return;
      }

      req.team = {
        id: org.id,
        name: org.name,
        slug: org.slug,
        ownerId: org.ownerId,
        plan: org.plan,
      };
      req.teamMembership = { role: teamRole, joinedAt: membership.joinedAt };

      next();
    } catch (error) {
      logger.error("Team auth error", error instanceof Error ? error : undefined, {
        details: String(error),
      });
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to verify team access",
      });
    }
  };
}

// ============================================
// EXPORTED MIDDLEWARE
// ============================================

/**
 * requireTeamMember — user must be any member (admin, member, or viewer).
 */
export const requireTeamMember = requireTeamRole(["admin", "member", "viewer"]);

/**
 * requireTeamAdmin — user must be an admin of the team.
 */
export const requireTeamAdmin = requireTeamRole(["admin"]);
