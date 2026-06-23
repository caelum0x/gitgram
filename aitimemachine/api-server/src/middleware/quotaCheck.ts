import { Response, NextFunction } from "express";
import { db, schema } from "../db/index.js";
import { eq, sql } from "drizzle-orm";
import { AuthenticatedRequest } from "./auth.js";
import { logger } from "../lib/monitoring.js";

// ============================================
// STORAGE LIMITS BY PLAN (in bytes)
// ============================================

export const STORAGE_LIMITS = {
  free: 500 * 1024 * 1024, // 500 MB
  pro: 10 * 1024 * 1024 * 1024, // 10 GB
  team: 50 * 1024 * 1024 * 1024, // 50 GB per user
} as const;

export type PlanType = keyof typeof STORAGE_LIMITS;

// Warning thresholds
const WARNING_THRESHOLD_80 = 0.8;
const WARNING_THRESHOLD_90 = 0.9;
const HARD_LIMIT = 1.0;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get storage limit for a user's plan
 */
export function getStorageLimit(plan: string): number {
  const planKey = plan.toLowerCase() as PlanType;
  return STORAGE_LIMITS[planKey] ?? STORAGE_LIMITS.free;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get storage usage info for a user
 */
export async function getStorageUsage(userId: string): Promise<{
  used: number;
  limit: number;
  percentage: number;
  plan: string;
}> {
  const [user] = await db
    .select({
      storageUsedBytes: schema.users.storageUsedBytes,
      plan: schema.users.plan,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  const plan = user.plan || "free";
  const used = user.storageUsedBytes || 0;
  const limit = getStorageLimit(plan);
  const percentage = limit > 0 ? (used / limit) * 100 : 0;

  return { used, limit, percentage, plan };
}

/**
 * Check if user can upload given size
 */
export function canUpload(
  currentUsage: number,
  uploadSize: number,
  limit: number
): { allowed: boolean; warning?: string } {
  const newTotal = currentUsage + uploadSize;
  const usagePercentage = newTotal / limit;

  if (usagePercentage >= HARD_LIMIT) {
    return {
      allowed: false,
      warning: `Storage quota exceeded. You are using ${formatBytes(currentUsage)} of ${formatBytes(limit)}.`,
    };
  }

  if (usagePercentage >= WARNING_THRESHOLD_90) {
    return {
      allowed: true,
      warning: `Warning: You are at ${Math.round(usagePercentage * 100)}% of your storage quota (${formatBytes(currentUsage)} of ${formatBytes(limit)}). Please upgrade your plan or delete old checkpoints.`,
    };
  }

  if (usagePercentage >= WARNING_THRESHOLD_80) {
    return {
      allowed: true,
      warning: `Notice: You are at ${Math.round(usagePercentage * 100)}% of your storage quota (${formatBytes(currentUsage)} of ${formatBytes(limit)}).`,
    };
  }

  return { allowed: true };
}

// ============================================
// STORAGE UPDATE FUNCTIONS
// ============================================

/**
 * Update user's storage usage by adding bytes
 */
export async function addStorageUsage(
  userId: string,
  bytes: number
): Promise<void> {
  await db
    .update(schema.users)
    .set({
      storageUsedBytes: sql`COALESCE(${schema.users.storageUsedBytes}, 0) + ${bytes}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));
}

/**
 * Update user's storage usage by removing bytes
 */
export async function removeStorageUsage(
  userId: string,
  bytes: number
): Promise<void> {
  await db
    .update(schema.users)
    .set({
      storageUsedBytes: sql`GREATEST(COALESCE(${schema.users.storageUsedBytes}, 0) - ${bytes}, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));
}

/**
 * Recalculate user's total storage from blobs
 */
export async function recalculateStorageUsage(userId: string): Promise<number> {
  const [result] = await db
    .select({
      totalSize: sql<number>`COALESCE(SUM(${schema.blobs.size}), 0)`,
    })
    .from(schema.blobs)
    .where(eq(schema.blobs.userId, userId));

  const totalSize = Number(result?.totalSize) || 0;

  await db
    .update(schema.users)
    .set({
      storageUsedBytes: totalSize,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));

  return totalSize;
}

// ============================================
// MIDDLEWARE
// ============================================

export interface QuotaCheckRequest extends AuthenticatedRequest {
  quotaInfo?: {
    used: number;
    limit: number;
    percentage: number;
    plan: string;
    warning?: string;
  };
}

/**
 * Middleware to check storage quota before allowing uploads.
 * Extracts upload size from request body.
 */
export function quotaCheck(sizeExtractor?: (req: QuotaCheckRequest) => number) {
  return async (
    req: QuotaCheckRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const userId = req.user.userId;
      const usage = await getStorageUsage(userId);

      // Get upload size from extractor or default to 0
      const uploadSize = sizeExtractor ? sizeExtractor(req) : 0;

      const { allowed, warning } = canUpload(usage.used, uploadSize, usage.limit);

      // Attach quota info to request
      req.quotaInfo = {
        ...usage,
        warning,
      };

      if (!allowed) {
        return res.status(402).json({
          error: "Storage quota exceeded",
          message: warning,
          quota: {
            used: usage.used,
            usedFormatted: formatBytes(usage.used),
            limit: usage.limit,
            limitFormatted: formatBytes(usage.limit),
            percentage: Math.round(usage.percentage),
            plan: usage.plan,
          },
          upgrade: {
            message: "Upgrade your plan to increase storage",
            plans: {
              pro: {
                limit: formatBytes(STORAGE_LIMITS.pro),
                limitBytes: STORAGE_LIMITS.pro,
              },
              team: {
                limit: formatBytes(STORAGE_LIMITS.team),
                limitBytes: STORAGE_LIMITS.team,
              },
            },
          },
        });
      }

      next();
    } catch (error) {
      logger.error("Quota check error", error instanceof Error ? error : undefined, { details: String(error) });
      // Don't block on quota check errors, just log and continue
      next();
    }
  };
}

/**
 * Middleware factory for blob upload quota check.
 * Extracts size from req.body.size
 */
export const blobQuotaCheck = quotaCheck((req) => req.body?.size || 0);

/**
 * Simple quota check that doesn't calculate upload size.
 * Use for non-upload operations that need quota info.
 */
export const quotaInfo = quotaCheck();
