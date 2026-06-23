import { Router } from "express";
import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logAction } from "../services/auditLog.js";
import { logger } from "../lib/monitoring.js";

const router = Router();
router.use(apiKeyAuth);

const createConsentSchema = z
  .object({
    consentType: z.enum(["operational_capture", "training_export"]),
    granted: z.boolean(),
    projectId: z.string().min(1).optional(),
    organizationId: z.string().min(1).optional(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((value) => Boolean(value.projectId) !== Boolean(value.organizationId), {
    message: "Exactly one of projectId or organizationId is required",
    path: ["projectId"],
  });

const listConsentSchema = z.object({
  projectId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  consentType: z.enum(["operational_capture", "training_export"]).optional(),
  includeExpired: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().positive().max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const historyConsentSchema = z.object({
  projectId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  consentType: z.enum(["operational_capture", "training_export"]).optional(),
  limit: z.coerce.number().int().positive().max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
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

async function getAccessScopes(userId: string): Promise<{ projectIds: string[]; orgIds: string[] }> {
  const [projectRows, orgRows] = await Promise.all([
    db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId)),
    db
      .select({ id: schema.orgMembers.orgId })
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.userId, userId)),
  ]);

  return {
    projectIds: projectRows.map((r: any) => r.id),
    orgIds: orgRows.map((r: any) => r.id),
  };
}

function serializeConsent(row: typeof schema.consents.$inferSelect) {
  return {
    id: row.id,
    consentType: row.consentType,
    granted: row.granted,
    projectId: row.projectId,
    organizationId: row.organizationId,
    grantedByUserId: row.grantedByUserId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = createConsentSchema.parse(req.body);

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

    const effectiveFrom = payload.effectiveFrom ? new Date(payload.effectiveFrom) : new Date();
    const effectiveTo = payload.effectiveTo ? new Date(payload.effectiveTo) : null;

    if (effectiveTo && effectiveTo <= effectiveFrom) {
      return res.status(400).json({ error: "effectiveTo must be after effectiveFrom" });
    }

    const scopeConditions = payload.projectId
      ? and(
          eq(schema.consents.projectId, payload.projectId),
          eq(schema.consents.consentType, payload.consentType)
        )
      : and(
          eq(schema.consents.organizationId, payload.organizationId!),
          eq(schema.consents.consentType, payload.consentType)
        );

    await db
      .update(schema.consents)
      .set({ effectiveTo: effectiveFrom })
      .where(
        and(
          scopeConditions,
          lte(schema.consents.effectiveFrom, effectiveFrom),
          or(isNull(schema.consents.effectiveTo), gte(schema.consents.effectiveTo, effectiveFrom))
        )
      );

    const [created] = await db
      .insert(schema.consents)
      .values({
        projectId: payload.projectId || null,
        organizationId: payload.organizationId || null,
        consentType: payload.consentType,
        granted: payload.granted,
        grantedByUserId: userId,
        effectiveFrom,
        effectiveTo,
        metadata: payload.metadata || {},
        createdAt: new Date(),
      })
      .returning();

    await logAction(
      userId,
      "consent.updated",
      "consent",
      created.id,
      {
        scope: payload.projectId
          ? { type: "project", id: payload.projectId }
          : { type: "organization", id: payload.organizationId },
        consentType: payload.consentType,
        granted: payload.granted,
      },
      req
    );

    return res.status(201).json({
      success: true,
      consent: serializeConsent(created),
    });
  } catch (error) {
    logger.error("consent create error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid consent request" });
  }
});

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const query = listConsentSchema.parse(req.query);

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

    const { projectIds, orgIds } = await getAccessScopes(userId);

    const conditions: any[] = [];

    if (query.projectId) {
      conditions.push(eq(schema.consents.projectId, query.projectId));
    } else if (query.organizationId) {
      conditions.push(eq(schema.consents.organizationId, query.organizationId));
    } else {
      const scopeConditions: any[] = [];
      if (projectIds.length > 0) {
        scopeConditions.push(inArray(schema.consents.projectId, projectIds));
      }
      if (orgIds.length > 0) {
        scopeConditions.push(inArray(schema.consents.organizationId, orgIds));
      }
      scopeConditions.push(eq(schema.consents.grantedByUserId, userId));
      conditions.push(or(...scopeConditions));
    }

    if (query.consentType) {
      conditions.push(eq(schema.consents.consentType, query.consentType));
    }

    if (!query.includeExpired) {
      conditions.push(
        and(
          lte(schema.consents.effectiveFrom, new Date()),
          or(isNull(schema.consents.effectiveTo), gte(schema.consents.effectiveTo, new Date()))
        )
      );
    }

    const rows = await db
      .select()
      .from(schema.consents)
      .where(and(...conditions))
      .orderBy(desc(schema.consents.effectiveFrom))
      .limit(query.limit + query.offset + 200);

    const latestByScope = new Map<string, typeof schema.consents.$inferSelect>();

    for (const row of rows) {
      const scopeKey = `${row.projectId || ""}|${row.organizationId || ""}|${row.consentType}`;
      if (!latestByScope.has(scopeKey)) {
        latestByScope.set(scopeKey, row);
      }
    }

    const deduped = Array.from(latestByScope.values())
      .slice(query.offset, query.offset + query.limit)
      .map(serializeConsent);

    return res.json({
      success: true,
      consents: deduped,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: deduped.length === query.limit,
      },
    });
  } catch (error) {
    logger.error("consent list error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid consent list request" });
  }
});

router.get("/history", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const query = historyConsentSchema.parse(req.query);

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

    const { projectIds, orgIds } = await getAccessScopes(userId);

    const conditions: any[] = [];

    if (query.projectId) {
      conditions.push(eq(schema.consents.projectId, query.projectId));
    } else if (query.organizationId) {
      conditions.push(eq(schema.consents.organizationId, query.organizationId));
    } else {
      const scopeConditions: any[] = [];
      if (projectIds.length > 0) {
        scopeConditions.push(inArray(schema.consents.projectId, projectIds));
      }
      if (orgIds.length > 0) {
        scopeConditions.push(inArray(schema.consents.organizationId, orgIds));
      }
      scopeConditions.push(eq(schema.consents.grantedByUserId, userId));
      conditions.push(or(...scopeConditions));
    }

    if (query.consentType) {
      conditions.push(eq(schema.consents.consentType, query.consentType));
    }

    const rows = await db
      .select()
      .from(schema.consents)
      .where(and(...conditions))
      .orderBy(desc(schema.consents.effectiveFrom), desc(schema.consents.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return res.json({
      success: true,
      history: rows.map(serializeConsent),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: rows.length === query.limit,
      },
    });
  } catch (error) {
    logger.error("consent history error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid consent history request" });
  }
});

export default router;
