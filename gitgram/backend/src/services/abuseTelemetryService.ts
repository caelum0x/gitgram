import prisma from '../utils/prisma';
import logger from '../utils/logger';

const SYSTEM_MODERATOR_ID = 'system:abuse';

export type AbuseEventType =
  | 'RATE_LIMIT_HIT'
  | 'SPAM_BLOCK'
  | 'SOFT_RESTRICT_APPLIED'
  | 'HARD_RESTRICT_APPLIED'
  | 'SOFT_RESTRICT_BLOCK'
  | 'HARD_RESTRICT_BLOCK'
  | 'VIOLATION_DUPLICATE_CONTENT'
  | 'VIOLATION_RAPID_FIRE_ACTION'
  | 'VIOLATION_SPAM_CONTENT'
  | 'VIOLATION_RATE_LIMIT_HIT'
  | 'VIOLATION_REPEATED_OFFENSE';

export async function logAbuseEvent(
  userId: string,
  eventType: AbuseEventType,
  reason?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.moderationLog.create({
      data: {
        moderatorId: SYSTEM_MODERATOR_ID,
        action: `ABUSE_${eventType}`,
        targetType: 'USER',
        targetId: userId,
        reason: reason || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        automated: true,
        appealable: false,
      },
    });
  } catch (error) {
    logger.error('Failed to persist abuse telemetry event:', error);
  }
}

export async function getAbuseStats(days: number = 7): Promise<{
  windowDays: number;
  totalEvents: number;
  uniqueUsers: number;
  byAction: Array<{ action: string; count: number }>;
  topUsers: Array<{ userId: string; username: string | null; count: number }>;
}> {
  const windowDays = Number.isFinite(days) ? Math.max(1, Math.min(90, Math.floor(days))) : 7;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [totalEvents, byActionRaw, topUsersRaw] = await Promise.all([
    prisma.moderationLog.count({
      where: {
        action: { startsWith: 'ABUSE_' },
        createdAt: { gte: since },
      },
    }),
    prisma.moderationLog.groupBy({
      by: ['action'],
      where: {
        action: { startsWith: 'ABUSE_' },
        createdAt: { gte: since },
      },
      _count: { _all: true },
      orderBy: { _count: { action: 'desc' } },
    }),
    prisma.moderationLog.groupBy({
      by: ['targetId'],
      where: {
        action: { startsWith: 'ABUSE_' },
        createdAt: { gte: since },
      },
      _count: { _all: true },
      orderBy: { _count: { targetId: 'desc' } },
      take: 10,
    }),
  ]);

  const userIds = topUsersRaw.map((u) => u.targetId);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.username || null]));

  return {
    windowDays,
    totalEvents,
    uniqueUsers: new Set(topUsersRaw.map((u) => u.targetId)).size,
    byAction: byActionRaw.map((a) => ({ action: a.action, count: a._count._all })),
    topUsers: topUsersRaw.map((u) => ({
      userId: u.targetId,
      username: userMap.get(u.targetId) ?? null,
      count: u._count._all,
    })),
  };
}

export async function getAbuseIncidents(params?: {
  days?: number;
  page?: number;
  limit?: number;
  action?: string;
  userId?: string;
}): Promise<{
  windowDays: number;
  page: number;
  limit: number;
  total: number;
  incidents: Array<{
    id: string;
    action: string;
    userId: string;
    username: string | null;
    reason: string | null;
    metadata: string | null;
    createdAt: Date;
  }>;
}> {
  const days = params?.days ?? 7;
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 50;
  const windowDays = Number.isFinite(days) ? Math.max(1, Math.min(90, Math.floor(days))) : 7;
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;
  const skip = (safePage - 1) * safeLimit;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const where: any = {
    action: { startsWith: 'ABUSE_' },
    createdAt: { gte: since },
  };
  if (params?.action) {
    where.action = String(params.action).toUpperCase().startsWith('ABUSE_')
      ? String(params.action).toUpperCase()
      : `ABUSE_${String(params.action).toUpperCase()}`;
  }
  if (params?.userId) {
    where.targetId = params.userId;
  }

  const [rows, total] = await Promise.all([
    prisma.moderationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
      select: {
        id: true,
        action: true,
        targetId: true,
        reason: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.moderationLog.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((r) => r.targetId))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.username || null]));

  return {
    windowDays,
    page: safePage,
    limit: safeLimit,
    total,
    incidents: rows.map((r) => ({
      id: r.id,
      action: r.action,
      userId: r.targetId,
      username: userMap.get(r.targetId) ?? null,
      reason: r.reason,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
  };
}
