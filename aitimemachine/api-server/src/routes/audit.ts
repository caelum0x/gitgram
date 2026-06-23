import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { eq, and, gte, lte, desc, count, sql } from "drizzle-orm";
import { logger } from "../lib/monitoring.js";

const router = Router();

// All audit routes require authentication
router.use(apiKeyAuth);

// ============================================
// QUERY SCHEMAS
// ============================================

const listAuditLogsQuerySchema = z.object({
  action: z.string().optional(),
  resource_type: z.string().optional(),
  resource_id: z.string().optional(),
  start_date: z.string().optional(), // ISO date string
  end_date: z.string().optional(), // ISO date string
  limit: z.string().optional().default("50"),
  offset: z.string().optional().default("0"),
});

// ============================================
// ROUTES
// ============================================

/**
 * GET /v1/audit
 * List audit logs with pagination and filtering.
 *
 * Query params:
 * - action: Filter by action type (e.g., "key.created", "checkpoint.restored")
 * - resource_type: Filter by resource type (e.g., "api_key", "checkpoint", "webhook")
 * - resource_id: Filter by specific resource ID
 * - start_date: Filter logs from this date (ISO format)
 * - end_date: Filter logs up to this date (ISO format)
 * - limit: Max number of results (default: 50, max: 100)
 * - offset: Number of results to skip (default: 0)
 */
router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const query = listAuditLogsQuerySchema.parse(req.query);

    // Parse and validate pagination
    let limit = Math.min(parseInt(query.limit || "50"), 100);
    let offset = Math.max(parseInt(query.offset || "0"), 0);

    if (isNaN(limit) || limit < 1) limit = 50;
    if (isNaN(offset) || offset < 0) offset = 0;

    // Build filter conditions
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.auditLogs.userId, userId),
    ];

    // Filter by action
    if (query.action) {
      conditions.push(eq(schema.auditLogs.action, query.action));
    }

    // Filter by resource type
    if (query.resource_type) {
      conditions.push(eq(schema.auditLogs.resourceType, query.resource_type));
    }

    // Filter by resource ID
    if (query.resource_id) {
      conditions.push(eq(schema.auditLogs.resourceId, query.resource_id));
    }

    // Filter by date range
    if (query.start_date) {
      const startDate = new Date(query.start_date);
      if (!isNaN(startDate.getTime())) {
        conditions.push(gte(schema.auditLogs.createdAt, startDate));
      }
    }

    if (query.end_date) {
      const endDate = new Date(query.end_date);
      if (!isNaN(endDate.getTime())) {
        conditions.push(lte(schema.auditLogs.createdAt, endDate));
      }
    }

    // Get total count for pagination
    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.auditLogs)
      .where(and(...conditions));

    const total = totalResult?.count || 0;

    // Fetch audit logs
    const logs = await db
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        resourceType: schema.auditLogs.resourceType,
        resourceId: schema.auditLogs.resourceId,
        ipAddress: schema.auditLogs.ipAddress,
        userAgent: schema.auditLogs.userAgent,
        metadata: schema.auditLogs.metadata,
        createdAt: schema.auditLogs.createdAt,
      })
      .from(schema.auditLogs)
      .where(and(...conditions))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      logs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + logs.length < total,
      },
    });
  } catch (error) {
    logger.error("Audit logs list error", error instanceof Error ? error : undefined, { details: String(error) });
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: error.errors,
      });
    }
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

/**
 * GET /v1/audit/summary
 * Get a summary of audit activity for the authenticated user.
 */
router.get("/summary", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { days = "30" } = req.query;

    const daysNum = Math.min(Math.max(parseInt(days as string) || 30, 1), 365);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // Count total actions
    const [totalActions] = await db
      .select({ count: count() })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.userId, userId),
          gte(schema.auditLogs.createdAt, startDate)
        )
      );

    // Count actions by type
    const actionCounts = await db
      .select({
        action: schema.auditLogs.action,
        count: count(),
      })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.userId, userId),
          gte(schema.auditLogs.createdAt, startDate)
        )
      )
      .groupBy(schema.auditLogs.action)
      .orderBy(desc(count()));

    // Count actions by resource type
    const resourceTypeCounts = await db
      .select({
        resourceType: schema.auditLogs.resourceType,
        count: count(),
      })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.userId, userId),
          gte(schema.auditLogs.createdAt, startDate)
        )
      )
      .groupBy(schema.auditLogs.resourceType)
      .orderBy(desc(count()));

    // Get most recent actions
    const recentActions = await db
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        resourceType: schema.auditLogs.resourceType,
        resourceId: schema.auditLogs.resourceId,
        createdAt: schema.auditLogs.createdAt,
      })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.userId, userId))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(10);

    res.json({
      period: {
        days: daysNum,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      total: totalActions?.count || 0,
      byAction: actionCounts.map((a: any) => ({
        action: a.action,
        count: a.count,
      })),
      byResourceType: resourceTypeCounts
        .filter((r: any) => r.resourceType !== null)
        .map((r: any) => ({
          resourceType: r.resourceType,
          count: r.count,
        })),
      recentActions,
    });
  } catch (error) {
    logger.error("Audit summary error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get audit summary" });
  }
});

/**
 * GET /v1/audit/actions
 * Get list of available audit action types.
 */
router.get("/actions", async (req: AuthenticatedRequest, res) => {
  const actions = {
    key: [
      { action: "key.created", description: "API key was created" },
      { action: "key.revoked", description: "API key was revoked" },
      { action: "key.updated", description: "API key was updated" },
    ],
    checkpoint: [
      { action: "checkpoint.created", description: "Checkpoint was created" },
      { action: "checkpoint.restored", description: "Checkpoint was restored" },
      { action: "checkpoint.deleted", description: "Checkpoint was deleted" },
    ],
    webhook: [
      { action: "webhook.created", description: "Webhook was created" },
      { action: "webhook.updated", description: "Webhook was updated" },
      { action: "webhook.deleted", description: "Webhook was deleted" },
    ],
    settings: [
      { action: "settings.updated", description: "Settings were updated" },
    ],
    auth: [
      { action: "login", description: "User logged in" },
      { action: "logout", description: "User logged out" },
      { action: "api_key.used", description: "API key was used for authentication" },
    ],
    project: [
      { action: "project.created", description: "Project was created" },
      { action: "project.updated", description: "Project was updated" },
      { action: "project.deleted", description: "Project was deleted" },
    ],
    repository: [
      { action: "repository.created", description: "Repository was created" },
      { action: "repository.indexed", description: "Repository was indexed" },
      { action: "repository.deleted", description: "Repository was deleted" },
    ],
    research: [
      { action: "research.started", description: "Research job was started" },
      { action: "research.completed", description: "Research job completed" },
    ],
    governance: [
      { action: "consent.checked", description: "Consent policy evaluated" },
      { action: "consent.updated", description: "Consent policy updated" },
      { action: "capture.denied", description: "Capture denied by governance policy" },
      { action: "export.denied", description: "Export denied by governance policy" },
      { action: "data.delete_requested", description: "Data deletion requested by user" },
      { action: "data.delete_processed", description: "Data deletion request processed" },
      { action: "data.delete_failed", description: "Data deletion request processing failed" },
      { action: "retention.updated", description: "Retention policy updated" },
      { action: "retention.applied", description: "Retention policy applied" },
    ],
  };

  res.json({ actions });
});

/**
 * GET /v1/audit/:logId
 * Get a specific audit log entry by ID.
 */
router.get("/:logId", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { logId } = req.params;

    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.id, logId),
          eq(schema.auditLogs.userId, userId)
        )
      )
      .limit(1);

    if (!log) {
      return res.status(404).json({ error: "Audit log not found" });
    }

    res.json({ log });
  } catch (error) {
    logger.error("Audit log get error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;
