import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, gte, lte, count, sum, sql } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// ============================================================================
// Plan Limits Configuration
// ============================================================================

interface PlanLimits {
  checkpoints: number;
  storage_bytes: number;
  repositories: number;
  indexed_files: number;
  contexts: number;
  api_calls_per_day: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    checkpoints: 100,
    storage_bytes: 1024 * 1024 * 100, // 100 MB
    repositories: 3,
    indexed_files: 1000,
    contexts: 10,
    api_calls_per_day: 1000,
  },
  pro: {
    checkpoints: 10000,
    storage_bytes: 1024 * 1024 * 1024 * 10, // 10 GB
    repositories: 50,
    indexed_files: 100000,
    contexts: 500,
    api_calls_per_day: 50000,
  },
  team: {
    checkpoints: 100000,
    storage_bytes: 1024 * 1024 * 1024 * 100, // 100 GB
    repositories: 500,
    indexed_files: 1000000,
    contexts: 5000,
    api_calls_per_day: 500000,
  },
  enterprise: {
    checkpoints: -1, // Unlimited
    storage_bytes: -1, // Unlimited
    repositories: -1, // Unlimited
    indexed_files: -1, // Unlimited
    contexts: -1, // Unlimited
    api_calls_per_day: -1, // Unlimited
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current billing period start and end dates
 */
function getCurrentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Calculate percentage, handling unlimited (-1) limits
 */
function calculatePercentage(current: number, limit: number): number {
  if (limit === -1) return 0; // Unlimited
  if (limit === 0) return current > 0 ? 100 : 0;
  return Math.round((current / limit) * 100);
}

// ============================================================================
// GET /v1/usage - Get usage summary for current period
// ============================================================================

/**
 * GET /v1/usage
 * Get usage summary for current period
 */
router.get("/", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: "Unauthorized",
        type: "authentication_error",
      },
    });
  }

  try {
    const userId = req.user.userId;
    const userPlan = req.user.plan || "free";
    const { start, end } = getCurrentPeriod();

    // Get checkpoint count for current period
    const [checkpointResult] = await db
      .select({ count: count() })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.userId, userId),
          gte(schema.checkpoints.createdAt, start),
          lte(schema.checkpoints.createdAt, end)
        )
      );

    // Get total storage used (from user record)
    const [userRecord] = await db
      .select({ storageUsedBytes: schema.users.storageUsedBytes })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    // Get repository count
    const [repositoryResult] = await db
      .select({ count: count() })
      .from(schema.repositories)
      .where(eq(schema.repositories.userId, userId));

    // Get total indexed files
    const [indexedFilesResult] = await db
      .select({ count: count() })
      .from(schema.indexedFiles)
      .innerJoin(
        schema.repositories,
        eq(schema.indexedFiles.repositoryId, schema.repositories.id)
      )
      .where(eq(schema.repositories.userId, userId));

    // Get saved contexts count
    const [contextsResult] = await db
      .select({ count: count() })
      .from(schema.savedContexts)
      .where(eq(schema.savedContexts.userId, userId));

    // Get API calls count for current period (from audit logs)
    const [apiCallsResult] = await db
      .select({ count: count() })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.userId, userId),
          gte(schema.auditLogs.createdAt, start),
          lte(schema.auditLogs.createdAt, end)
        )
      );

    const limits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;

    const response = {
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      checkpoints: {
        count: checkpointResult?.count || 0,
        storage_bytes: userRecord?.storageUsedBytes || 0,
        storage_formatted: formatBytes(userRecord?.storageUsedBytes || 0),
      },
      repositories: {
        count: repositoryResult?.count || 0,
        indexed_files: indexedFilesResult?.count || 0,
      },
      contexts: {
        count: contextsResult?.count || 0,
      },
      api_calls: {
        count: apiCallsResult?.count || 0,
      },
      limits: {
        checkpoints: limits.checkpoints,
        storage_bytes: limits.storage_bytes,
        storage_formatted: limits.storage_bytes === -1 ? "Unlimited" : formatBytes(limits.storage_bytes),
        repositories: limits.repositories,
        indexed_files: limits.indexed_files,
        contexts: limits.contexts,
        api_calls_per_day: limits.api_calls_per_day,
      },
    };

    return res.json(response);
  } catch (error) {
    logger.error("Error fetching usage summary", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(500).json({
      error: {
        message: "Failed to fetch usage summary",
        type: "internal_error",
      },
    });
  }
});

// ============================================================================
// GET /v1/usage/history - Get historical usage data
// ============================================================================

/**
 * GET /v1/usage/history
 * Get historical usage data
 * Query params:
 *   - start_date: ISO date string (default: 30 days ago)
 *   - end_date: ISO date string (default: now)
 *   - granularity: daily | weekly | monthly (default: daily)
 */
router.get("/history", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: "Unauthorized",
        type: "authentication_error",
      },
    });
  }

  try {
    const userId = req.user.userId;
    const granularity = (req.query.granularity as string) || "daily";

    // Parse dates
    const endDate = req.query.end_date
      ? new Date(req.query.end_date as string)
      : new Date();
    const startDate = req.query.start_date
      ? new Date(req.query.start_date as string)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    // Validate granularity
    if (!["daily", "weekly", "monthly"].includes(granularity)) {
      return res.status(400).json({
        error: {
          message: "Invalid granularity. Must be 'daily', 'weekly', or 'monthly'",
          type: "invalid_request_error",
        },
      });
    }

    // Determine the date truncation format based on granularity
    const dateTrunc = granularity === "daily" ? "day"
      : granularity === "weekly" ? "week"
      : "month";

    // Get checkpoint history
    const checkpointHistory = await db
      .select({
        date: sql<string>`date_trunc(${dateTrunc}, ${schema.checkpoints.createdAt})::date`.as("date"),
        count: count(),
      })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.userId, userId),
          gte(schema.checkpoints.createdAt, startDate),
          lte(schema.checkpoints.createdAt, endDate)
        )
      )
      .groupBy(sql`date_trunc(${dateTrunc}, ${schema.checkpoints.createdAt})::date`)
      .orderBy(sql`date_trunc(${dateTrunc}, ${schema.checkpoints.createdAt})::date`);

    // Get API calls history (from audit logs)
    const apiCallsHistory = await db
      .select({
        date: sql<string>`date_trunc(${dateTrunc}, ${schema.auditLogs.createdAt})::date`.as("date"),
        count: count(),
      })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.userId, userId),
          gte(schema.auditLogs.createdAt, startDate),
          lte(schema.auditLogs.createdAt, endDate)
        )
      )
      .groupBy(sql`date_trunc(${dateTrunc}, ${schema.auditLogs.createdAt})::date`)
      .orderBy(sql`date_trunc(${dateTrunc}, ${schema.auditLogs.createdAt})::date`);

    // Merge the data into a single timeline
    const dateMap = new Map<string, { checkpoints: number; api_calls: number; storage: number }>();

    checkpointHistory.forEach((item: any) => {
      const dateStr = item.date;
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { checkpoints: 0, api_calls: 0, storage: 0 });
      }
      dateMap.get(dateStr)!.checkpoints = item.count;
    });

    apiCallsHistory.forEach((item: any) => {
      const dateStr = item.date;
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, { checkpoints: 0, api_calls: 0, storage: 0 });
      }
      dateMap.get(dateStr)!.api_calls = item.count;
    });

    // Convert to array and sort by date
    const data = Array.from(dateMap.entries())
      .map(([date, values]) => ({
        date,
        checkpoints: values.checkpoints,
        api_calls: values.api_calls,
        storage: values.storage,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return res.json({
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      granularity,
      data,
    });
  } catch (error) {
    logger.error("Error fetching usage history", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(500).json({
      error: {
        message: "Failed to fetch usage history",
        type: "internal_error",
      },
    });
  }
});

// ============================================================================
// GET /v1/usage/breakdown - Get detailed breakdown by resource type
// ============================================================================

/**
 * GET /v1/usage/breakdown
 * Get detailed breakdown by resource type
 */
router.get("/breakdown", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: "Unauthorized",
        type: "authentication_error",
      },
    });
  }

  try {
    const userId = req.user.userId;

    // Get repositories with their details
    const repositories = await db
      .select({
        id: schema.repositories.id,
        name: schema.repositories.name,
        rootPath: schema.repositories.rootPath,
        indexStatus: schema.repositories.indexStatus,
        fileCount: schema.repositories.fileCount,
        symbolCount: schema.repositories.symbolCount,
        lastIndexedAt: schema.repositories.lastIndexedAt,
        createdAt: schema.repositories.createdAt,
      })
      .from(schema.repositories)
      .where(eq(schema.repositories.userId, userId))
      .orderBy(schema.repositories.createdAt);

    // Get checkpoints grouped by project
    const checkpointsByProject = await db
      .select({
        projectId: schema.checkpoints.projectId,
        projectName: schema.projects.name,
        count: count(),
      })
      .from(schema.checkpoints)
      .innerJoin(schema.projects, eq(schema.checkpoints.projectId, schema.projects.id))
      .where(eq(schema.checkpoints.userId, userId))
      .groupBy(schema.checkpoints.projectId, schema.projects.name)
      .orderBy(sql`count(*) desc`);

    // Get contexts with their details
    const contexts = await db
      .select({
        id: schema.savedContexts.id,
        name: schema.savedContexts.name,
        projectId: schema.savedContexts.projectId,
        tool: schema.savedContexts.tool,
        isAutoSaved: schema.savedContexts.isAutoSaved,
        createdAt: schema.savedContexts.createdAt,
      })
      .from(schema.savedContexts)
      .where(eq(schema.savedContexts.userId, userId))
      .orderBy(schema.savedContexts.createdAt)
      .limit(100); // Limit to avoid large payloads

    // Get storage breakdown by blob type
    const storageBreakdown = await db
      .select({
        storageType: schema.blobs.storageType,
        count: count(),
        totalSize: sum(schema.blobs.size),
      })
      .from(schema.blobs)
      .where(eq(schema.blobs.userId, userId))
      .groupBy(schema.blobs.storageType);

    return res.json({
      repositories: repositories.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        root_path: repo.rootPath,
        index_status: repo.indexStatus,
        file_count: repo.fileCount,
        symbol_count: repo.symbolCount,
        last_indexed_at: repo.lastIndexedAt?.toISOString() || null,
        created_at: repo.createdAt?.toISOString() || null,
      })),
      checkpoints: checkpointsByProject.map((cp: any) => ({
        project_id: cp.projectId,
        project_name: cp.projectName,
        count: cp.count,
      })),
      contexts: contexts.map((ctx: any) => ({
        id: ctx.id,
        name: ctx.name,
        project_id: ctx.projectId,
        tool: ctx.tool,
        is_auto_saved: ctx.isAutoSaved,
        created_at: ctx.createdAt?.toISOString() || null,
      })),
      storage: {
        breakdown: storageBreakdown.map((sb: any) => ({
          type: sb.storageType,
          count: sb.count,
          total_bytes: Number(sb.totalSize) || 0,
          total_formatted: formatBytes(Number(sb.totalSize) || 0),
        })),
      },
    });
  } catch (error) {
    logger.error("Error fetching usage breakdown", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(500).json({
      error: {
        message: "Failed to fetch usage breakdown",
        type: "internal_error",
      },
    });
  }
});

// ============================================================================
// GET /v1/usage/limits - Get current plan limits and usage
// ============================================================================

/**
 * GET /v1/usage/limits
 * Get current plan limits and usage percentages
 */
router.get("/limits", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: {
        message: "Unauthorized",
        type: "authentication_error",
      },
    });
  }

  try {
    const userId = req.user.userId;
    const userPlan = req.user.plan || "free";
    const limits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.free;

    // Get current usage counts
    const [checkpointCount] = await db
      .select({ count: count() })
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.userId, userId));

    const [userRecord] = await db
      .select({ storageUsedBytes: schema.users.storageUsedBytes })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const [repositoryCount] = await db
      .select({ count: count() })
      .from(schema.repositories)
      .where(eq(schema.repositories.userId, userId));

    const [indexedFilesCount] = await db
      .select({ count: count() })
      .from(schema.indexedFiles)
      .innerJoin(
        schema.repositories,
        eq(schema.indexedFiles.repositoryId, schema.repositories.id)
      )
      .where(eq(schema.repositories.userId, userId));

    const [contextsCount] = await db
      .select({ count: count() })
      .from(schema.savedContexts)
      .where(eq(schema.savedContexts.userId, userId));

    // Get today's API calls
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [apiCallsToday] = await db
      .select({ count: count() })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.userId, userId),
          gte(schema.auditLogs.createdAt, today),
          lte(schema.auditLogs.createdAt, tomorrow)
        )
      );

    const current = {
      checkpoints: checkpointCount?.count || 0,
      storage_bytes: userRecord?.storageUsedBytes || 0,
      repositories: repositoryCount?.count || 0,
      indexed_files: indexedFilesCount?.count || 0,
      contexts: contextsCount?.count || 0,
      api_calls_today: apiCallsToday?.count || 0,
    };

    const percentage = {
      checkpoints: calculatePercentage(current.checkpoints, limits.checkpoints),
      storage: calculatePercentage(current.storage_bytes, limits.storage_bytes),
      repositories: calculatePercentage(current.repositories, limits.repositories),
      indexed_files: calculatePercentage(current.indexed_files, limits.indexed_files),
      contexts: calculatePercentage(current.contexts, limits.contexts),
      api_calls: calculatePercentage(current.api_calls_today, limits.api_calls_per_day),
    };

    return res.json({
      plan: userPlan,
      limits: {
        checkpoints: limits.checkpoints === -1 ? "unlimited" : limits.checkpoints,
        storage_bytes: limits.storage_bytes === -1 ? "unlimited" : limits.storage_bytes,
        storage_formatted: limits.storage_bytes === -1 ? "Unlimited" : formatBytes(limits.storage_bytes),
        repositories: limits.repositories === -1 ? "unlimited" : limits.repositories,
        indexed_files: limits.indexed_files === -1 ? "unlimited" : limits.indexed_files,
        contexts: limits.contexts === -1 ? "unlimited" : limits.contexts,
        api_calls_per_day: limits.api_calls_per_day === -1 ? "unlimited" : limits.api_calls_per_day,
      },
      current: {
        checkpoints: current.checkpoints,
        storage_bytes: current.storage_bytes,
        storage_formatted: formatBytes(current.storage_bytes),
        repositories: current.repositories,
        indexed_files: current.indexed_files,
        contexts: current.contexts,
        api_calls_today: current.api_calls_today,
      },
      percentage: {
        checkpoints: percentage.checkpoints,
        storage: percentage.storage,
        repositories: percentage.repositories,
        indexed_files: percentage.indexed_files,
        contexts: percentage.contexts,
        api_calls: percentage.api_calls,
      },
    });
  } catch (error) {
    logger.error("Error fetching usage limits", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(500).json({
      error: {
        message: "Failed to fetch usage limits",
        type: "internal_error",
      },
    });
  }
});

export default router;
