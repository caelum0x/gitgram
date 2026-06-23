import { Request } from 'express';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction =
  // auth
  | 'login'
  | 'logout'
  | 'register'
  | 'password_change'
  | '2fa_enable'
  | '2fa_disable'
  // profile
  | 'profile_update'
  | 'avatar_change'
  | 'username_change'
  // content
  | 'post_create'
  | 'post_delete'
  | 'snippet_create'
  | 'snippet_delete'
  // social
  | 'follow'
  | 'unfollow'
  | 'block'
  | 'unblock'
  // admin
  | 'user_suspend'
  | 'user_unsuspend'
  | 'report_resolve'
  // billing
  | 'subscription_upgrade'
  | 'subscription_downgrade'
  | 'payment_failed'
  // security
  | 'suspicious_login'
  | 'rate_limit_exceeded'
  | 'invalid_token';

export interface AuditEntry {
  id: string;
  userId: string;
  action: AuditAction;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditLogOptions {
  page?: number;
  limit?: number;
  action?: AuditAction;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRequestMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]).trim()
    : req.socket?.remoteAddress ?? null;
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
  return { ipAddress, userAgent };
}

// ---------------------------------------------------------------------------
// log
// ---------------------------------------------------------------------------

/**
 * Record an audit event. Fire-and-forget safe — swallows internal errors so
 * the caller's request is never blocked or failed by audit infrastructure.
 */
export async function log(
  userId: string,
  action: AuditAction,
  metadata: Record<string, unknown> = {},
  req?: Request,
): Promise<void> {
  const { ipAddress, userAgent } = req ? extractRequestMeta(req) : { ipAddress: null, userAgent: null };

  try {
    await (prisma as unknown as {
      auditLog: {
        create: (args: {
          data: {
            userId: string;
            action: string;
            metadata: Record<string, unknown>;
            ipAddress: string | null;
            userAgent: string | null;
          };
        }) => Promise<unknown>;
      };
    }).auditLog.create({
      data: {
        userId,
        action,
        metadata,
        ipAddress,
        userAgent,
      },
    });
  } catch (err: unknown) {
    // Audit failures must never surface to the caller
    logger.error('auditLogService.log failed', { userId, action, err });
  }
}

// ---------------------------------------------------------------------------
// getUserLogs
// ---------------------------------------------------------------------------

/**
 * Return paginated audit entries for a single user (used by the user or admin).
 */
export async function getUserLogs(
  userId: string,
  options: AuditLogOptions = {},
): Promise<PaginatedResponse<AuditEntry>> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(options.limit ?? 20, 100);
  const skip = (page - 1) * limit;

  const db = prisma as unknown as {
    auditLog: {
      findMany: (args: object) => Promise<AuditEntry[]>;
      count: (args: object) => Promise<number>;
    };
  };

  const where: Record<string, unknown> = { userId };
  if (options.action) where['action'] = options.action;
  if (options.startDate || options.endDate) {
    where['createdAt'] = {
      ...(options.startDate ? { gte: options.startDate } : {}),
      ...(options.endDate ? { lte: options.endDate } : {}),
    };
  }

  const [data, total] = await Promise.all([
    db.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    db.auditLog.count({ where }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// getAdminLogs
// ---------------------------------------------------------------------------

/**
 * Return paginated audit entries across all users (admin only). Supports
 * filtering by action, userId, and date range.
 */
export async function getAdminLogs(
  options: AuditLogOptions = {},
): Promise<PaginatedResponse<AuditEntry>> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(options.limit ?? 50, 100);
  const skip = (page - 1) * limit;

  const db = prisma as unknown as {
    auditLog: {
      findMany: (args: object) => Promise<AuditEntry[]>;
      count: (args: object) => Promise<number>;
    };
  };

  const where: Record<string, unknown> = {};
  if (options.userId) where['userId'] = options.userId;
  if (options.action) where['action'] = options.action;
  if (options.startDate || options.endDate) {
    where['createdAt'] = {
      ...(options.startDate ? { gte: options.startDate } : {}),
      ...(options.endDate ? { lte: options.endDate } : {}),
    };
  }

  const [data, total] = await Promise.all([
    db.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    db.auditLog.count({ where }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// deleteOldLogs
// ---------------------------------------------------------------------------

/**
 * Delete audit log entries older than `days` days. Returns the number of
 * deleted records. Intended for scheduled maintenance jobs.
 */
export async function deleteOldLogs(days: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const db = prisma as unknown as {
    auditLog: {
      deleteMany: (args: object) => Promise<{ count: number }>;
    };
  };

  const result = await db.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  logger.info(`auditLogService.deleteOldLogs: removed ${result.count} entries older than ${days} days`);
  return result.count;
}
