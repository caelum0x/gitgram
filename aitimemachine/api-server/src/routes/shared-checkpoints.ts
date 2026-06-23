/**
 * Shared Checkpoints API Routes
 *
 * Enables team collaboration by allowing checkpoints to be shared
 * within organizations and accessed by team members.
 */

import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc, or, inArray } from "drizzle-orm";
import { AuthenticatedRequest, apiKeyAuth } from "../middleware/auth.js";
import { requireScope, SCOPES } from "../middleware/scopeCheck.js";
import { asyncHandler } from "../middleware/errors.js";
import { Errors } from "../middleware/errors.js";

const router = Router();

// Apply auth to all routes
router.use(apiKeyAuth);

/**
 * GET /v1/shared-checkpoints
 * List all checkpoints shared with the user (via their organizations)
 */
router.get(
  "/",
  requireScope(SCOPES.READ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const { project_id, limit = 50, offset = 0 } = req.query;

    // Get user's organizations
    const userOrgs = await db
      .select({ orgId: schema.orgMembers.orgId })
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.userId, userId));

    const orgIds: string[] = userOrgs
      .map((o: any) => o.orgId)
      .filter((id: unknown): id is string => typeof id === "string");

    if (orgIds.length === 0) {
      return res.json({
        checkpoints: [],
        total: 0,
        message: "You are not a member of any organization",
      });
    }

    // Build query conditions
    let conditions = and(
      inArray(schema.checkpoints.orgId, orgIds),
      // Exclude user's own checkpoints (they already see those)
      // Actually include them so they see all org checkpoints
    );

    if (project_id) {
      conditions = and(conditions, eq(schema.checkpoints.projectId, String(project_id)));
    }

    // Get shared checkpoints
    const checkpoints = await db
      .select({
        id: schema.checkpoints.id,
        projectId: schema.checkpoints.projectId,
        userId: schema.checkpoints.userId,
        orgId: schema.checkpoints.orgId,
        name: schema.checkpoints.name,
        description: schema.checkpoints.description,
        triggerType: schema.checkpoints.triggerType,
        createdAt: schema.checkpoints.createdAt,
        metadata: schema.checkpoints.metadata,
      })
      .from(schema.checkpoints)
      .where(conditions!)
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    // Get creator names
    const userIds = [
      ...new Set(
        checkpoints
          .map((c: any) => c.userId)
          .filter((id: unknown): id is string => typeof id === "string")
      ),
    ] as string[];
    const users = userIds.length > 0
      ? await db
          .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
          .from(schema.users)
          .where(inArray(schema.users.id, userIds))
      : [];

    const userMap = new Map(users.map((u: any) => [u.id, u]));

    // Enrich checkpoints with creator info
    const enrichedCheckpoints = checkpoints.map((cp: any) => ({
      ...cp,
      creator: userMap.get(cp.userId) || { id: cp.userId, name: "Unknown" },
      is_own: cp.userId === userId,
    }));

    // Get total count
    const countResult = await db
      .select({ count: schema.checkpoints.id })
      .from(schema.checkpoints)
      .where(conditions!);

    res.json({
      checkpoints: enrichedCheckpoints,
      total: countResult.length,
      organizations: orgIds,
    });
  })
);

/**
 * POST /v1/shared-checkpoints/:id/share
 * Share a checkpoint with an organization
 */
router.post(
  "/:id/share",
  requireScope(SCOPES.WRITE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { org_id } = req.body;
    const userId = req.user!.userId;

    if (!org_id) {
      throw Errors.missingParameter("org_id");
    }

    // Verify user owns the checkpoint
    const [checkpoint] = await db
      .select()
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, id),
          eq(schema.checkpoints.userId, userId)
        )
      )
      .limit(1);

    if (!checkpoint) {
      throw Errors.notFound("Checkpoint", id);
    }

    // Verify user is a member of the organization
    const [membership] = await db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.orgId, org_id),
          eq(schema.orgMembers.userId, userId)
        )
      )
      .limit(1);

    if (!membership) {
      throw Errors.permissionDenied("You are not a member of this organization");
    }

    // Update checkpoint to be shared with org
    await db
      .update(schema.checkpoints)
      .set({ orgId: org_id })
      .where(eq(schema.checkpoints.id, id));

    res.json({
      shared: true,
      checkpoint_id: id,
      org_id,
      message: "Checkpoint is now shared with the organization",
    });
  })
);

/**
 * DELETE /v1/shared-checkpoints/:id/unshare
 * Remove checkpoint from organization (make private)
 */
router.delete(
  "/:id/unshare",
  requireScope(SCOPES.WRITE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Verify user owns the checkpoint
    const [checkpoint] = await db
      .select()
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, id),
          eq(schema.checkpoints.userId, userId)
        )
      )
      .limit(1);

    if (!checkpoint) {
      throw Errors.notFound("Checkpoint", id);
    }

    // Remove org association
    await db
      .update(schema.checkpoints)
      .set({ orgId: null })
      .where(eq(schema.checkpoints.id, id));

    res.json({
      unshared: true,
      checkpoint_id: id,
      message: "Checkpoint is now private",
    });
  })
);

/**
 * GET /v1/shared-checkpoints/:id
 * Get a specific shared checkpoint (if user has access)
 */
router.get(
  "/:id",
  requireScope(SCOPES.READ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Get user's organizations
    const userOrgs = await db
      .select({ orgId: schema.orgMembers.orgId })
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.userId, userId));

    const orgIds: string[] = userOrgs
      .map((o: any) => o.orgId)
      .filter((id: unknown): id is string => typeof id === "string");

    // Get checkpoint if user owns it OR it's shared with their org
    const [checkpoint] = await db
      .select()
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, id),
          or(
            eq(schema.checkpoints.userId, userId),
            orgIds.length > 0 ? inArray(schema.checkpoints.orgId, orgIds) : undefined
          )
        )
      )
      .limit(1);

    if (!checkpoint) {
      throw Errors.notFound("Checkpoint", id);
    }

    // Get creator info
    const [creator] = await db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, checkpoint.userId))
      .limit(1);

    // Get org info if shared
    let organization = null;
    if (checkpoint.orgId) {
      const [org] = await db
        .select({ id: schema.organizations.id, name: schema.organizations.name, slug: schema.organizations.slug })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, checkpoint.orgId))
        .limit(1);
      organization = org;
    }

    res.json({
      checkpoint: {
        ...checkpoint,
        creator,
        organization,
        is_own: checkpoint.userId === userId,
      },
    });
  })
);

/**
 * GET /v1/shared-checkpoints/org/:orgId
 * List all checkpoints shared with a specific organization
 */
router.get(
  "/org/:orgId",
  requireScope(SCOPES.READ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { orgId } = req.params;
    const userId = req.user!.userId;
    const { limit = 50, offset = 0 } = req.query;

    // Verify user is a member of the organization
    const [membership] = await db
      .select()
      .from(schema.orgMembers)
      .where(
        and(
          eq(schema.orgMembers.orgId, orgId),
          eq(schema.orgMembers.userId, userId)
        )
      )
      .limit(1);

    if (!membership) {
      throw Errors.permissionDenied("You are not a member of this organization");
    }

    // Get org checkpoints
    const checkpoints = await db
      .select({
        id: schema.checkpoints.id,
        projectId: schema.checkpoints.projectId,
        userId: schema.checkpoints.userId,
        name: schema.checkpoints.name,
        description: schema.checkpoints.description,
        triggerType: schema.checkpoints.triggerType,
        createdAt: schema.checkpoints.createdAt,
        metadata: schema.checkpoints.metadata,
      })
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.orgId, orgId))
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    // Get creator names
    const userIds = [
      ...new Set(
        checkpoints
          .map((c: any) => c.userId)
          .filter((id: unknown): id is string => typeof id === "string")
      ),
    ] as string[];
    const users = userIds.length > 0
      ? await db
          .select({ id: schema.users.id, name: schema.users.name })
          .from(schema.users)
          .where(inArray(schema.users.id, userIds))
      : [];

    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const enrichedCheckpoints = checkpoints.map((cp: any) => ({
      ...cp,
      creator: userMap.get(cp.userId) || { id: cp.userId, name: "Unknown" },
      is_own: cp.userId === userId,
    }));

    res.json({
      checkpoints: enrichedCheckpoints,
      org_id: orgId,
      total: checkpoints.length,
    });
  })
);

export default router;
