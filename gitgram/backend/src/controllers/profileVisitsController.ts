import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { ProfileVisitSource } from '@prisma/client';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

// Deduplication window in milliseconds (1 hour)
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Record a profile visit
 * Called internally when a user views another user's profile
 */
export const recordProfileVisit = async (
  visitorId: string | null,
  visitedUserId: string,
  source: ProfileVisitSource = 'DIRECT'
): Promise<boolean> => {
  try {
    // Don't record self-visits
    if (visitorId && visitorId === visitedUserId) {
      return false;
    }

    // Check if the visited user has profile visit tracking enabled
    const privacySettings = await prisma.profilePrivacySettings.findUnique({
      where: { userId: visitedUserId },
    });

    // If settings exist and tracking is disabled, don't record
    if (privacySettings && !privacySettings.profileVisitsEnabled) {
      return false;
    }

    // Check for recent visit from same visitor (deduplication)
    if (visitorId) {
      const recentVisit = await prisma.profileVisit.findFirst({
        where: {
          visitorId,
          visitedUserId,
          visitedAt: {
            gte: new Date(Date.now() - DEDUP_WINDOW_MS),
          },
        },
      });

      if (recentVisit) {
        // Already visited recently, skip recording
        return false;
      }
    }

    // Record the visit
    await prisma.profileVisit.create({
      data: {
        visitorId,
        visitedUserId,
        source,
      },
    });

    return true;
  } catch (error) {
    logger.error('Failed to record profile visit:', error);
    return false;
  }
};

/**
 * Get recent profile visitors
 * GET /api/v1/users/profile-visits
 */
export const getProfileVisitors = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Check if user has enabled showing profile visitors
  const privacySettings = await prisma.profilePrivacySettings.findUnique({
    where: { userId },
  });

  // If settings exist and showing visitors is disabled, return empty
  if (privacySettings && !privacySettings.showProfileVisitors) {
    return res.json({
      visitors: [],
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: 0,
        pages: 0,
      },
      message: 'Profile visitor tracking is disabled for your account',
    });
  }

  // Get visits with visitor details
  const [visits, total] = await Promise.all([
    prisma.profileVisit.findMany({
      where: {
        visitedUserId: userId,
        visitorId: { not: null }, // Only show logged-in visitors
      },
      skip,
      take: Number(limit),
      orderBy: { visitedAt: 'desc' },
      select: {
        id: true,
        visitorId: true,
        visitedAt: true,
        source: true,
      },
    }),
    prisma.profileVisit.count({
      where: {
        visitedUserId: userId,
        visitorId: { not: null },
      },
    }),
  ]);

  // Get visitor user details
  const visitorIds = visits
    .map((v) => v.visitorId)
    .filter((id): id is string => id !== null);

  const visitors = await prisma.user.findMany({
    where: { id: { in: visitorIds } },
    select: {
      id: true,
      username: true,
      avatar: true,
      bio: true,
      verified: true,
    },
  });

  const visitorMap = new Map(visitors.map((v) => [v.id, v]));

  // Combine visits with visitor data
  const enrichedVisits = visits.map((visit) => ({
    id: visit.id,
    visitedAt: visit.visitedAt,
    source: visit.source,
    visitor: visit.visitorId ? visitorMap.get(visit.visitorId) || null : null,
  }));

  res.json({
    visitors: enrichedVisits,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

/**
 * Get profile visit statistics
 * GET /api/v1/users/profile-visits/stats
 */
export const getProfileVisitStats = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { days = 30 } = req.query;
  const daysNum = Math.min(Number(days), 365); // Max 1 year

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysNum);
  startDate.setHours(0, 0, 0, 0);

  // Check privacy settings
  const privacySettings = await prisma.profilePrivacySettings.findUnique({
    where: { userId },
  });

  if (privacySettings && !privacySettings.showProfileVisitors) {
    return res.json({
      stats: null,
      message: 'Profile visitor tracking is disabled for your account',
    });
  }

  // Get total visits in period
  const totalVisits = await prisma.profileVisit.count({
    where: {
      visitedUserId: userId,
      visitedAt: { gte: startDate },
    },
  });

  // Get unique visitors in period
  const uniqueVisitors = await prisma.profileVisit.groupBy({
    by: ['visitorId'],
    where: {
      visitedUserId: userId,
      visitedAt: { gte: startDate },
      visitorId: { not: null },
    },
  });

  // Get anonymous visit count
  const anonymousVisits = await prisma.profileVisit.count({
    where: {
      visitedUserId: userId,
      visitedAt: { gte: startDate },
      visitorId: null,
    },
  });

  // Get visits by source
  const visitsBySource = await prisma.profileVisit.groupBy({
    by: ['source'],
    where: {
      visitedUserId: userId,
      visitedAt: { gte: startDate },
    },
    _count: { source: true },
  });

  // Get visits by day (last N days)
  const visitsByDay = await prisma.$queryRaw<{ date: Date; count: bigint }[]>`
    SELECT DATE("visitedAt") as date, COUNT(*) as count
    FROM "ProfileVisit"
    WHERE "visitedUserId" = ${userId}
      AND "visitedAt" >= ${startDate}
    GROUP BY DATE("visitedAt")
    ORDER BY date DESC
  `;

  // Transform raw results
  const visitsByDayFormatted = visitsByDay.map((row) => ({
    date: row.date.toISOString().split('T')[0],
    count: Number(row.count),
  }));

  const visitsBySourceFormatted = visitsBySource.reduce(
    (acc, row) => {
      acc[row.source] = row._count.source;
      return acc;
    },
    {} as Record<string, number>
  );

  res.json({
    stats: {
      period: {
        days: daysNum,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      total: totalVisits,
      uniqueVisitors: uniqueVisitors.length,
      anonymousVisits,
      bySource: visitsBySourceFormatted,
      byDay: visitsByDayFormatted,
    },
  });
});

/**
 * Get profile privacy settings
 * GET /api/v1/users/profile-visits/settings
 */
export const getProfilePrivacySettings = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;

  let settings = await prisma.profilePrivacySettings.findUnique({
    where: { userId },
  });

  // Return defaults if no settings exist
  if (!settings) {
    settings = {
      id: '',
      userId,
      profileVisitsEnabled: true,
      showProfileVisitors: true,
    };
  }

  res.json({
    settings: {
      profileVisitsEnabled: settings.profileVisitsEnabled,
      showProfileVisitors: settings.showProfileVisitors,
    },
  });
});

/**
 * Update profile privacy settings
 * PUT /api/v1/users/profile-visits/settings
 */
export const updateProfilePrivacySettings = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const userId = authReq.userId!;
  const { profileVisitsEnabled, showProfileVisitors } = req.body;

  const settings = await prisma.profilePrivacySettings.upsert({
    where: { userId },
    update: {
      ...(typeof profileVisitsEnabled === 'boolean' && { profileVisitsEnabled }),
      ...(typeof showProfileVisitors === 'boolean' && { showProfileVisitors }),
    },
    create: {
      userId,
      profileVisitsEnabled: profileVisitsEnabled ?? true,
      showProfileVisitors: showProfileVisitors ?? true,
    },
  });

  res.json({
    message: 'Privacy settings updated',
    settings: {
      profileVisitsEnabled: settings.profileVisitsEnabled,
      showProfileVisitors: settings.showProfileVisitors,
    },
  });
});
