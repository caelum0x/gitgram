import { Response, NextFunction } from "express";
import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { AuthenticatedRequest } from "./auth.js";
import { logger } from "../lib/monitoring.js";

export type OrgRole = "owner" | "admin" | "member";

export interface OrgAuthenticatedRequest extends AuthenticatedRequest {
  org?: {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    plan: string | null;
  };
  orgMembership?: {
    role: OrgRole;
    joinedAt: Date | null;
  };
}

/**
 * Extract organization from request params or query.
 * Looks for :orgId in params or orgId in query string.
 */
export function getOrgFromRequest(req: OrgAuthenticatedRequest): string | null {
  // Check route params first (e.g., /organizations/:orgId)
  if (req.params.orgId) {
    return req.params.orgId;
  }
  // Check for :id when the route is /organizations/:id
  if (req.params.id) {
    return req.params.id;
  }
  // Check query string
  if (req.query.orgId && typeof req.query.orgId === "string") {
    return req.query.orgId;
  }
  return null;
}

/**
 * Middleware factory to check if user has required role in organization.
 * Must be used after apiKeyAuth middleware.
 *
 * @param roles - Array of allowed roles (e.g., ["owner", "admin"])
 */
export function requireOrgRole(roles: OrgRole[]) {
  return async (
    req: OrgAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Authentication required",
        });
      }

      const orgId = getOrgFromRequest(req);
      if (!orgId) {
        return res.status(400).json({
          error: "Bad request",
          message: "Organization ID is required",
        });
      }

      // Get organization
      const [org] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, orgId))
        .limit(1);

      if (!org) {
        return res.status(404).json({
          error: "Not found",
          message: "Organization not found",
        });
      }

      // Get user's membership in the organization
      const [membership] = await db
        .select()
        .from(schema.orgMembers)
        .where(
          and(
            eq(schema.orgMembers.orgId, orgId),
            eq(schema.orgMembers.userId, req.user.userId)
          )
        )
        .limit(1);

      if (!membership) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You are not a member of this organization",
        });
      }

      // Check if user has required role
      const userRole = membership.role as OrgRole;
      if (!roles.includes(userRole)) {
        return res.status(403).json({
          error: "Forbidden",
          message: `This action requires one of these roles: ${roles.join(", ")}`,
        });
      }

      // Attach org and membership to request
      req.org = {
        id: org.id,
        name: org.name,
        slug: org.slug,
        ownerId: org.ownerId,
        plan: org.plan,
      };
      req.orgMembership = {
        role: userRole,
        joinedAt: membership.joinedAt,
      };

      next();
    } catch (error) {
      logger.error("Org auth error", error instanceof Error ? error : undefined, { details: String(error) });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to verify organization access",
      });
    }
  };
}

/**
 * Middleware to check if user is a member of the organization (any role).
 * Shorthand for requireOrgRole(["owner", "admin", "member"])
 */
export const requireOrgMember = requireOrgRole(["owner", "admin", "member"]);

/**
 * Middleware to check if user is admin or owner of the organization.
 * Shorthand for requireOrgRole(["owner", "admin"])
 */
export const requireOrgAdmin = requireOrgRole(["owner", "admin"]);

/**
 * Middleware to check if user is owner of the organization.
 * Shorthand for requireOrgRole(["owner"])
 */
export const requireOrgOwner = requireOrgRole(["owner"]);

/**
 * Optional organization context - attaches org info if orgId is present,
 * but doesn't fail if it's not.
 */
export async function optionalOrgContext(
  req: OrgAuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      return next();
    }

    const orgId = getOrgFromRequest(req);
    if (!orgId) {
      return next();
    }

    // Get organization
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    if (!org) {
      return next();
    }

    // Get user's membership
    const [membership] = await db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.orgId, orgId),
          eq(schema.orgMembers.userId, req.user.userId)
        )
      )
      .limit(1);

    if (membership) {
      req.org = {
        id: org.id,
        name: org.name,
        slug: org.slug,
        ownerId: org.ownerId,
        plan: org.plan,
      };
      req.orgMembership = {
        role: membership.role as OrgRole,
        joinedAt: membership.joinedAt,
      };
    }

    next();
  } catch (error) {
    // Don't fail on optional context errors
    next();
  }
}

/**
 * Helper to check if a user can perform actions on another member.
 * - Owners can manage anyone
 * - Admins can manage members but not other admins or owners
 * - Members cannot manage anyone
 */
export function canManageMember(
  actorRole: OrgRole,
  targetRole: OrgRole
): boolean {
  if (actorRole === "owner") {
    return true;
  }
  if (actorRole === "admin" && targetRole === "member") {
    return true;
  }
  return false;
}

/**
 * Role hierarchy for comparison.
 * Higher number = more permissions.
 */
export const roleHierarchy: Record<OrgRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * Check if a role has at least the permissions of another role.
 */
export function hasMinimumRole(userRole: OrgRole, requiredRole: OrgRole): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}
