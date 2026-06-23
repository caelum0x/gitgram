import { Router } from "express";
import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  requireOrgOwner,
  requireOrgAdmin,
  requireOrgMember,
  OrgAuthenticatedRequest,
} from "../middleware/orgAuth.js";
import { eq, and, or, desc, count } from "drizzle-orm";
import { logger } from "../lib/monitoring.js";

const router = Router();

// All organization routes require authentication
router.use(apiKeyAuth);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a URL-friendly slug from a name.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

/**
 * Generate a unique organization ID.
 */
function generateOrgId(): string {
  return `org_${crypto.randomBytes(12).toString("hex")}`;
}

/**
 * Generate a unique member ID.
 */
function generateMemberId(): string {
  return `mem_${crypto.randomBytes(12).toString("hex")}`;
}

// ============================================
// CREATE ORGANIZATION
// ============================================

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { name, slug: customSlug } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        error: "Validation error",
        message: "Organization name is required",
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        error: "Validation error",
        message: "Organization name must be 100 characters or less",
      });
    }

    // Generate or validate slug
    let slug = customSlug ? generateSlug(customSlug) : generateSlug(name);

    if (slug.length < 3) {
      return res.status(400).json({
        error: "Validation error",
        message: "Organization slug must be at least 3 characters",
      });
    }

    // Check if slug is unique
    const [existingOrg] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, slug))
      .limit(1);

    if (existingOrg) {
      // Append random suffix if slug exists
      slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
    }

    const orgId = generateOrgId();
    const memberId = generateMemberId();
    const now = new Date();

    // Create organization
    await db.insert(schema.organizations).values({
      id: orgId,
      name: name.trim(),
      slug,
      ownerId: userId,
      plan: "team",
      createdAt: now,
      updatedAt: now,
    });

    // Add creator as owner member
    await db.insert(schema.orgMembers).values({
      id: memberId,
      orgId,
      userId,
      role: "owner",
      invitedBy: null,
      joinedAt: now,
    });

    // Return created organization
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, orgId))
      .limit(1);

    res.status(201).json({
      organization: org,
      membership: {
        role: "owner",
        joinedAt: now,
      },
    });
  } catch (error) {
    logger.error("Create organization error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to create organization" });
  }
});

// ============================================
// LIST USER'S ORGANIZATIONS
// ============================================

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;

    // Get all organizations where user is a member
    const memberships = await db
      .select({
        organization: schema.organizations,
        role: schema.orgMembers.role,
        joinedAt: schema.orgMembers.joinedAt,
      })
      .from(schema.orgMembers)
      .innerJoin(
        schema.organizations,
        eq(schema.orgMembers.orgId, schema.organizations.id)
      )
      .where(eq(schema.orgMembers.userId, userId))
      .orderBy(desc(schema.organizations.createdAt));

    // Get member counts for each organization
    const orgsWithCounts = await Promise.all(
      memberships.map(async (m: any) => {
        const [memberCount] = await db
          .select({ count: count() })
          .from(schema.orgMembers)
          .where(eq(schema.orgMembers.orgId, m.organization.id));

        return {
          ...m.organization,
          role: m.role,
          joinedAt: m.joinedAt,
          memberCount: memberCount?.count || 0,
        };
      })
    );

    res.json({ organizations: orgsWithCounts });
  } catch (error) {
    logger.error("List organizations error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to list organizations" });
  }
});

// ============================================
// GET ORGANIZATION DETAILS
// ============================================

router.get(
  "/:id",
  requireOrgMember,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;
      const membership = req.orgMembership!;

      // Get member count
      const [memberCount] = await db
        .select({ count: count() })
        .from(schema.orgMembers)
        .where(eq(schema.orgMembers.orgId, org.id));

      // Get project count
      const [projectCount] = await db
        .select({ count: count() })
        .from(schema.projects)
        .where(eq(schema.projects.orgId, org.id));

      // Get pending invitation count (for admins/owners)
      let pendingInvitations = 0;
      if (membership.role === "owner" || membership.role === "admin") {
        const [inviteCount] = await db
          .select({ count: count() })
          .from(schema.orgInvitations)
          .where(
            and(
              eq(schema.orgInvitations.orgId, org.id),
              // Only count non-expired invitations
            )
          );
        pendingInvitations = inviteCount?.count || 0;
      }

      res.json({
        organization: org,
        membership: {
          role: membership.role,
          joinedAt: membership.joinedAt,
        },
        stats: {
          members: memberCount?.count || 0,
          projects: projectCount?.count || 0,
          pendingInvitations,
        },
      });
    } catch (error) {
      logger.error("Get organization error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get organization" });
    }
  }
);

// ============================================
// UPDATE ORGANIZATION
// ============================================

router.patch(
  "/:id",
  requireOrgAdmin,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;
      const { name, slug: newSlug, plan } = req.body;

      const updates: Partial<{
        name: string;
        slug: string;
        plan: string;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({
            error: "Validation error",
            message: "Organization name cannot be empty",
          });
        }
        if (name.length > 100) {
          return res.status(400).json({
            error: "Validation error",
            message: "Organization name must be 100 characters or less",
          });
        }
        updates.name = name.trim();
      }

      if (newSlug !== undefined) {
        const slug = generateSlug(newSlug);
        if (slug.length < 3) {
          return res.status(400).json({
            error: "Validation error",
            message: "Organization slug must be at least 3 characters",
          });
        }

        // Check if slug is unique (excluding current org)
        const [existingOrg] = await db
          .select()
          .from(schema.organizations)
          .where(
            and(
              eq(schema.organizations.slug, slug),
              // Exclude current org - would need to use 'ne' or raw SQL
            )
          )
          .limit(1);

        if (existingOrg && existingOrg.id !== org.id) {
          return res.status(400).json({
            error: "Validation error",
            message: "Organization slug is already taken",
          });
        }
        updates.slug = slug;
      }

      // Only owner can change plan
      if (plan !== undefined) {
        if (req.orgMembership!.role !== "owner") {
          return res.status(403).json({
            error: "Forbidden",
            message: "Only organization owner can change the plan",
          });
        }
        if (!["team", "enterprise"].includes(plan)) {
          return res.status(400).json({
            error: "Validation error",
            message: "Invalid plan. Must be 'team' or 'enterprise'",
          });
        }
        updates.plan = plan;
      }

      await db
        .update(schema.organizations)
        .set(updates)
        .where(eq(schema.organizations.id, org.id));

      // Return updated organization
      const [updatedOrg] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, org.id))
        .limit(1);

      res.json({ organization: updatedOrg });
    } catch (error) {
      logger.error("Update organization error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to update organization" });
    }
  }
);

// ============================================
// DELETE ORGANIZATION
// ============================================

router.delete(
  "/:id",
  requireOrgOwner,
  async (req: OrgAuthenticatedRequest, res) => {
    try {
      const org = req.org!;

      // Check if there are any projects in the organization
      const [projectCount] = await db
        .select({ count: count() })
        .from(schema.projects)
        .where(eq(schema.projects.orgId, org.id));

      if (projectCount && projectCount.count > 0) {
        return res.status(400).json({
          error: "Cannot delete",
          message:
            "Organization has projects. Transfer or delete all projects before deleting the organization.",
        });
      }

      // Delete all invitations (cascade should handle this, but explicit for safety)
      await db
        .delete(schema.orgInvitations)
        .where(eq(schema.orgInvitations.orgId, org.id));

      // Delete all memberships (cascade should handle this, but explicit for safety)
      await db
        .delete(schema.orgMembers)
        .where(eq(schema.orgMembers.orgId, org.id));

      // Delete the organization
      await db
        .delete(schema.organizations)
        .where(eq(schema.organizations.id, org.id));

      res.json({
        success: true,
        message: "Organization deleted successfully",
      });
    } catch (error) {
      logger.error("Delete organization error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to delete organization" });
    }
  }
);

export default router;
