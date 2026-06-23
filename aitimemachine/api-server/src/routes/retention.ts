import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logAction } from "../services/auditLog.js";
import { applyRetentionForProject, DATA_CLASSES, DataClass } from "../services/retention.js";
import { logger } from "../lib/monitoring.js";

const router = Router();
router.use(apiKeyAuth);

const policySchema = z
  .object({
    dataClass: z.enum(DATA_CLASSES),
    retentionDays: z.number().int().positive().max(3650),
    hardDelete: z.boolean().default(false),
    projectId: z.string().min(1).optional(),
    organizationId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.projectId) !== Boolean(value.organizationId), {
    message: "Exactly one of projectId or organizationId is required",
    path: ["projectId"],
  });

const listPolicySchema = z.object({
  projectId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  dataClass: z.enum(DATA_CLASSES).optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const applySchema = z.object({
  projectId: z.string().min(1),
  dataClass: z.enum(DATA_CLASSES).optional(),
  dryRun: z.boolean().default(true),
});

async function ensureProjectOwned(userId: string, projectId: string) {
  const [project] = await db
    .select({ id: schema.projects.id, orgId: schema.projects.orgId })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  return project;
}

async function ensureOrgAccessible(userId: string, organizationId: string) {
  const [membership] = await db
    .select({ orgId: schema.orgMembers.orgId })
    .from(schema.orgMembers)
    .where(
      and(
        eq(schema.orgMembers.orgId, organizationId),
        eq(schema.orgMembers.userId, userId)
      )
    )
    .limit(1);

  return membership;
}

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = policySchema.parse(req.body);

    if (payload.projectId) {
      const project = await ensureProjectOwned(userId, payload.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
    }

    if (payload.organizationId) {
      const org = await ensureOrgAccessible(userId, payload.organizationId);
      if (!org) {
        return res.status(403).json({ error: "Organization access denied" });
      }
    }

    const query = payload.projectId
      ? and(
          eq(schema.retentionPolicies.projectId, payload.projectId),
          eq(schema.retentionPolicies.dataClass, payload.dataClass)
        )
      : and(
          eq(schema.retentionPolicies.organizationId, payload.organizationId!),
          eq(schema.retentionPolicies.dataClass, payload.dataClass)
        );

    const [existing] = await db
      .select({ id: schema.retentionPolicies.id })
      .from(schema.retentionPolicies)
      .where(query)
      .orderBy(desc(schema.retentionPolicies.updatedAt))
      .limit(1);

    let policy: typeof schema.retentionPolicies.$inferSelect;

    if (existing) {
      const [updated] = await db
        .update(schema.retentionPolicies)
        .set({
          retentionDays: payload.retentionDays,
          hardDelete: payload.hardDelete,
          updatedAt: new Date(),
        })
        .where(eq(schema.retentionPolicies.id, existing.id))
        .returning();

      policy = updated;
    } else {
      const [created] = await db
        .insert(schema.retentionPolicies)
        .values({
          projectId: payload.projectId || null,
          organizationId: payload.organizationId || null,
          dataClass: payload.dataClass,
          retentionDays: payload.retentionDays,
          hardDelete: payload.hardDelete,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      policy = created;
    }

    await logAction(
      userId,
      "retention.updated",
      "settings",
      policy.id,
      {
        dataClass: payload.dataClass,
        retentionDays: payload.retentionDays,
        hardDelete: payload.hardDelete,
        scope: payload.projectId
          ? { type: "project", id: payload.projectId }
          : { type: "organization", id: payload.organizationId },
      },
      req
    );

    return res.status(201).json({ success: true, policy });
  } catch (error) {
    logger.error("retention upsert error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid retention policy payload" });
  }
});

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const query = listPolicySchema.parse(req.query);

    if (query.projectId) {
      const project = await ensureProjectOwned(userId, query.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
    }

    if (query.organizationId) {
      const org = await ensureOrgAccessible(userId, query.organizationId);
      if (!org) {
        return res.status(403).json({ error: "Organization access denied" });
      }
    }

    let rows: Array<typeof schema.retentionPolicies.$inferSelect> = [];

    if (query.projectId) {
      rows = await db
        .select()
        .from(schema.retentionPolicies)
        .where(eq(schema.retentionPolicies.projectId, query.projectId))
        .orderBy(desc(schema.retentionPolicies.updatedAt))
        .limit(query.limit)
        .offset(query.offset);
    } else if (query.organizationId) {
      rows = await db
        .select()
        .from(schema.retentionPolicies)
        .where(eq(schema.retentionPolicies.organizationId, query.organizationId))
        .orderBy(desc(schema.retentionPolicies.updatedAt))
        .limit(query.limit)
        .offset(query.offset);
    } else {
      const projectRows = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.userId, userId));
      const orgRows = await db
        .select({ id: schema.orgMembers.orgId })
        .from(schema.orgMembers)
        .where(eq(schema.orgMembers.userId, userId));

      const projectIds = projectRows.map((p: any) => p.id);
      const orgIds = orgRows.map((o: any) => o.id);

      const [projectPolicies, orgPolicies] = await Promise.all([
        projectIds.length > 0
          ? db
              .select()
              .from(schema.retentionPolicies)
              .where(inArray(schema.retentionPolicies.projectId, projectIds))
          : Promise.resolve([]),
        orgIds.length > 0
          ? db
              .select()
              .from(schema.retentionPolicies)
              .where(inArray(schema.retentionPolicies.organizationId, orgIds))
          : Promise.resolve([]),
      ]);

      rows = [...projectPolicies, ...orgPolicies]
        .sort(
          (a, b) =>
            new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        )
        .slice(query.offset, query.offset + query.limit);
    }

    const filtered = query.dataClass
      ? rows.filter((row) => row.dataClass === query.dataClass)
      : rows;

    return res.json({
      success: true,
      policies: filtered,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: filtered.length === query.limit,
      },
    });
  } catch (error) {
    logger.error("retention list error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid retention policy query" });
  }
});

router.post("/apply", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = applySchema.parse(req.body);

    const project = await ensureProjectOwned(userId, payload.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    const result = await applyRetentionForProject(userId, payload.projectId, {
      dataClass: payload.dataClass as DataClass | undefined,
      dryRun: payload.dryRun,
    });

    await logAction(
      userId,
      "retention.applied",
      "settings",
      payload.projectId,
      {
        projectId: payload.projectId,
        dataClass: payload.dataClass || "all",
        dryRun: payload.dryRun,
        summary: result.summary,
      },
      req
    );

    return res.json({ success: true, ...result });
  } catch (error) {
    logger.error("retention apply error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid retention apply request" });
  }
});

export default router;
