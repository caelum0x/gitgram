import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { Prisma, Report, ReportStatus, ReportTargetType, ReportReason } from '@prisma/client';
import * as enforcement from '../services/moderationEnforcementService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

interface UserSummary {
  id: string;
  username: string | null;
  avatar: string | null;
  displayName?: string | null;
}

interface TargetContent {
  id: string;
  userId?: string | null;
  user?: UserSummary | null;
  [key: string]: unknown;
}

// ============================================================================
// MODERATION QUEUE
// ============================================================================

/**
 * Get pending reports with pagination
 * Sorted by severity (reason) and date
 * GET /api/v1/admin/moderation/queue
 */
export const getModerationQueue = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const status = req.query.status as ReportStatus | undefined;
  const targetType = req.query.targetType as ReportTargetType | undefined;
  const reason = req.query.reason as ReportReason | undefined;

  // Build where clause
  const where: Prisma.ReportWhereInput = {};

  if (status) {
    where.status = status;
  } else {
    // Default to pending and reviewing reports
    where.status = { in: ['PENDING', 'REVIEWING'] };
  }

  if (targetType) {
    where.targetType = targetType;
  }

  if (reason) {
    where.reason = reason;
  }

  // Priority mapping for sorting (higher = more severe)
  const reasonPriority: Record<ReportReason, number> = {
    HARASSMENT: 5,
    INAPPROPRIATE: 4,
    MISINFORMATION: 3,
    SPAM: 2,
    OTHER: 1,
  };

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: [
        { escalated: 'desc' },   // Escalated reports first
        { priority: 'desc' },     // Then by priority (most reports + severity)
        { createdAt: 'asc' },     // Then oldest first (FIFO for same priority)
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.report.count({ where }),
  ]);

  const sortedReports = reports;

  // Enrich reports with related content
  const enrichedReports = await enrichReports(sortedReports);

  res.json({
    success: true,
    data: {
      reports: enrichedReports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        status: status || 'PENDING,REVIEWING',
        targetType: targetType || 'all',
        reason: reason || 'all',
      },
    },
  });
});

/**
 * Get specific report details
 * GET /api/v1/admin/moderation/queue/:id
 */
export const getReportDetails = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const report = await prisma.report.findUnique({
    where: { id },
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  // Enrich with full content details
  const enrichedReport = await enrichReportWithFullDetails(report);

  res.json({
    success: true,
    data: {
      report: enrichedReport,
    },
  });
});

/**
 * Resolve a report
 * PUT /api/v1/admin/moderation/queue/:id/resolve
 */
export const resolveReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, resolution } = req.body;
  const authReq = req as AuthRequest;
  const moderatorId = authReq.user?.id || authReq.userId;
  if (!moderatorId) {
    throw Errors.unauthorized('Authentication required');
  }

  // Valid actions
  const validActions = ['approve', 'dismiss', 'warn_user', 'remove_content', 'suspend_user', 'ban_user'];
  if (!validActions.includes(action)) {
    throw Errors.badRequest(`Invalid action. Valid actions: ${validActions.join(', ')}`);
  }

  const { duration } = req.body; // Duration in hours (for suspend_user)

  // Get the report
  const report = await prisma.report.findUnique({
    where: { id },
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
    throw Errors.badRequest('Report already resolved');
  }

  // Get the target content for actions
  const targetContent = await getTargetContent(report.targetType, report.targetId);

  if (!targetContent && action !== 'dismiss') {
    throw Errors.notFound('Target content');
  }

  // Execute the action using the enforcement service
  let actionResult = '';
  const targetUserId = getTargetUserId(targetContent, report.targetType);
  const reasonText = resolution || `Content violation: ${report.reason}`;

  switch (action) {
    case 'approve':
      actionResult = 'Content approved, report dismissed';
      break;

    case 'dismiss':
      actionResult = 'Report dismissed';
      break;

    case 'warn_user':
      if (targetUserId) {
        const warnResult = await enforcement.warnUser(
          targetUserId,
          `Your ${report.targetType.toLowerCase()} was reported for: ${report.reason}. ${resolution || 'Please follow community guidelines.'}`,
          moderatorId
        );
        actionResult = `User warned (${warnResult.warningCount} total warnings)`;
      } else {
        actionResult = 'Could not identify user to warn';
      }
      break;

    case 'remove_content':
      const removeResult = await enforcement.removeContent(
        report.targetType,
        report.targetId,
        reasonText,
        moderatorId
      );
      actionResult = `${report.targetType} removed`;
      break;

    case 'suspend_user':
      if (targetUserId) {
        const suspendDuration = duration || 48; // Default 48 hours
        const suspendResult = await enforcement.suspendUser(
          targetUserId,
          suspendDuration,
          reasonText,
          moderatorId
        );
        actionResult = `User suspended until ${suspendResult.suspendedUntil.toISOString()}`;
      } else {
        actionResult = 'Could not identify user to suspend';
      }
      break;

    case 'ban_user':
      if (targetUserId) {
        const banResult = await enforcement.banUser(
          targetUserId,
          reasonText,
          moderatorId
        );
        actionResult = `User banned (${banResult.contentRemoved} content items removed)`;
      } else {
        actionResult = 'Could not identify user to ban';
      }
      break;
  }

  // Update report status
  const newStatus: ReportStatus = action === 'dismiss' || action === 'approve' ? 'DISMISSED' : 'RESOLVED';

  const updatedReport = await prisma.report.update({
    where: { id },
    data: {
      status: newStatus,
      resolvedAt: new Date(),
      resolvedBy: moderatorId,
      resolution: resolution || actionResult,
    },
  });

  // Also resolve any other pending reports on the same target
  if (action !== 'dismiss' && action !== 'approve') {
    await prisma.report.updateMany({
      where: {
        targetType: report.targetType,
        targetId: report.targetId,
        status: { in: ['PENDING', 'REVIEWING'] },
        id: { not: id },
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: moderatorId,
        resolution: `Resolved along with report ${id}: ${actionResult}`,
      },
    });
  }

  // Create moderation log for the resolution itself
  await prisma.moderationLog.create({
    data: {
      moderatorId,
      action: `REPORT_${action.toUpperCase()}`,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: resolution || actionResult,
    },
  });

  logger.info(`Moderator ${moderatorId} resolved report ${id} with action: ${action}`);

  res.json({
    success: true,
    data: {
      message: 'Report resolved successfully',
      report: updatedReport,
      action,
      result: actionResult,
    },
  });
});

/**
 * Get moderation statistics
 * GET /api/v1/admin/moderation/stats
 */
export const getModerationStats = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get report counts by status
  const [
    totalReports,
    pendingReports,
    reviewingReports,
    resolvedReports,
    dismissedReports,
    reportsToday,
    reportsThisWeek,
    reportsThisMonth,
  ] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { status: 'PENDING' } }),
    prisma.report.count({ where: { status: 'REVIEWING' } }),
    prisma.report.count({ where: { status: 'RESOLVED' } }),
    prisma.report.count({ where: { status: 'DISMISSED' } }),
    prisma.report.count({ where: { createdAt: { gte: today } } }),
    prisma.report.count({ where: { createdAt: { gte: lastWeek } } }),
    prisma.report.count({ where: { createdAt: { gte: lastMonth } } }),
  ]);

  // Get reports by target type
  const reportsByType = await prisma.report.groupBy({
    by: ['targetType'],
    _count: true,
    orderBy: { _count: { targetType: 'desc' } },
  });

  // Get reports by reason
  const reportsByReason = await prisma.report.groupBy({
    by: ['reason'],
    _count: true,
    orderBy: { _count: { reason: 'desc' } },
  });

  // Get top reporters (users who report the most)
  const topReporters = await prisma.report.groupBy({
    by: ['reporterId'],
    _count: true,
    orderBy: { _count: { reporterId: 'desc' } },
    take: 10,
  });

  // Enrich top reporters with user info
  const reporterIds = topReporters.map(r => r.reporterId);
  const reporters = await prisma.user.findMany({
    where: { id: { in: reporterIds } },
    select: { id: true, username: true, avatar: true },
  });
  const reporterMap = new Map(reporters.map(r => [r.id, r]));

  const enrichedTopReporters = topReporters.map(r => ({
    user: reporterMap.get(r.reporterId) || { id: r.reporterId, username: 'Unknown' },
    reportCount: r._count,
  }));

  // Get average resolution time (for resolved reports)
  const resolvedWithTime = await prisma.report.findMany({
    where: {
      status: 'RESOLVED',
      resolvedAt: { not: null },
    },
    select: {
      createdAt: true,
      resolvedAt: true,
    },
    take: 100, // Sample size
    orderBy: { resolvedAt: 'desc' },
  });

  let avgResolutionTimeHours = 0;
  if (resolvedWithTime.length > 0) {
    const totalMs = resolvedWithTime.reduce((sum, r) => {
      if (r.resolvedAt) {
        return sum + (r.resolvedAt.getTime() - r.createdAt.getTime());
      }
      return sum;
    }, 0);
    avgResolutionTimeHours = Math.round(totalMs / resolvedWithTime.length / (1000 * 60 * 60) * 10) / 10;
  }

  // Get moderator activity
  const moderatorActivity = await prisma.moderationLog.groupBy({
    by: ['moderatorId'],
    _count: true,
    where: {
      createdAt: { gte: lastWeek },
    },
    orderBy: { _count: { moderatorId: 'desc' } },
    take: 10,
  });

  // Enrich moderator activity with user info
  const moderatorIds = moderatorActivity.map(m => m.moderatorId);
  const moderators = await prisma.user.findMany({
    where: { id: { in: moderatorIds } },
    select: { id: true, username: true, avatar: true },
  });
  const moderatorMap = new Map(moderators.map(m => [m.id, m]));

  const enrichedModeratorActivity = moderatorActivity.map(m => ({
    moderator: moderatorMap.get(m.moderatorId) || { id: m.moderatorId, username: 'Unknown' },
    actionCount: m._count,
  }));

  res.json({
    success: true,
    data: {
      overview: {
        total: totalReports,
        pending: pendingReports,
        reviewing: reviewingReports,
        resolved: resolvedReports,
        dismissed: dismissedReports,
        openRate: totalReports > 0 ? Math.round((pendingReports + reviewingReports) / totalReports * 100) : 0,
      },
      trends: {
        today: reportsToday,
        thisWeek: reportsThisWeek,
        thisMonth: reportsThisMonth,
        avgPerDay: Math.round(reportsThisMonth / 30 * 10) / 10,
      },
      breakdown: {
        byType: reportsByType.map(r => ({
          type: r.targetType,
          count: r._count,
        })),
        byReason: reportsByReason.map(r => ({
          reason: r.reason,
          count: r._count,
        })),
      },
      performance: {
        avgResolutionTimeHours,
        moderatorActivity: enrichedModeratorActivity,
      },
      topReporters: enrichedTopReporters,
    },
  });
});

/**
 * Get pending appeals
 * GET /api/v1/admin/moderation/appeals
 */
export const getAppeals = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const rawStatus = (req.query.status as string) || 'PENDING';
  const status = rawStatus.toUpperCase();
  const where = status === 'ALL' ? {} : { status };

  const [appeals, total] = await Promise.all([
    prisma.moderationAppeal.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.moderationAppeal.count({ where }),
  ]);

  // Enrich with user and moderation log info
  const enrichedAppeals = await Promise.all(
    appeals.map(async (appeal) => {
      const [user, moderationLog] = await Promise.all([
        prisma.user.findUnique({
          where: { id: appeal.userId },
          select: { id: true, username: true, avatar: true, displayName: true },
        }),
        prisma.moderationLog.findUnique({
          where: { id: appeal.moderationLogId },
        }),
      ]);

      return {
        ...appeal,
        user,
        originalAction: moderationLog,
      };
    })
  );

  res.json({
    success: true,
    data: {
      appeals: enrichedAppeals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Review an appeal
 * PUT /api/v1/admin/moderation/appeals/:id/review
 */
export const reviewAppealAction = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const decision = String(req.body?.decision || '').toUpperCase();
  const { reviewNotes } = req.body;
  const authReq = req as AuthRequest;
  const moderatorId = authReq.user?.id || authReq.userId;
  if (!moderatorId) {
    throw Errors.unauthorized('Authentication required');
  }

  if (!decision || !['APPROVED', 'DENIED'].includes(decision)) {
    throw Errors.badRequest('Invalid decision. Use: APPROVED or DENIED');
  }

  const result = await enforcement.reviewAppeal(
    id,
    decision as 'APPROVED' | 'DENIED',
    moderatorId,
    reviewNotes
  );

  res.json({
    success: true,
    data: {
      message: `Appeal ${decision.toLowerCase()}`,
      decision,
      ...result,
    },
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Enrich reports with related content and user info
 */
async function enrichReports(reports: Report[]) {
  if (reports.length === 0) return [];

  // Collect all IDs needed
  const reporterIds = [...new Set(reports.map(r => r.reporterId))];
  const postIds: string[] = [];
  const commentIds: string[] = [];
  const userIds: string[] = [];
  const reelIds: string[] = [];
  const storyIds: string[] = [];

  reports.forEach(r => {
    switch (r.targetType) {
      case 'POST':
        postIds.push(r.targetId);
        break;
      case 'COMMENT':
        commentIds.push(r.targetId);
        break;
      case 'USER':
        userIds.push(r.targetId);
        break;
      case 'REEL':
        reelIds.push(r.targetId);
        break;
      case 'STORY':
        storyIds.push(r.targetId);
        break;
    }
  });

  // Fetch all related data in parallel
  const [reporters, posts, comments, users, reels, stories] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: reporterIds } },
      select: { id: true, username: true, avatar: true, displayName: true },
    }),
    postIds.length > 0 ? prisma.post.findMany({
      where: { id: { in: postIds } },
      select: {
        id: true,
        content: true,
        mediaUrls: true,
        createdAt: true,
        user: { select: { id: true, username: true, avatar: true } },
      },
    }) : [],
    commentIds.length > 0 ? prisma.comment.findMany({
      where: { id: { in: commentIds } },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: { select: { id: true, username: true, avatar: true } },
        post: { select: { id: true, content: true } },
      },
    }) : [],
    userIds.length > 0 ? prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        createdAt: true,
        isBanned: true,
      },
    }) : [],
    reelIds.length > 0 ? prisma.reel.findMany({
      where: { id: { in: reelIds } },
      select: {
        id: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        createdAt: true,
        user: { select: { id: true, username: true, avatar: true } },
      },
    }) : [],
    storyIds.length > 0 ? prisma.story.findMany({
      where: { id: { in: storyIds } },
      select: {
        id: true,
        caption: true,
        mediaUrl: true,
        mediaType: true,
        createdAt: true,
        user: { select: { id: true, username: true, avatar: true } },
      },
    }) : [],
  ]);

  // Create lookup maps
  const reporterMap = new Map(reporters.map(r => [r.id, r]));
  const postMap = new Map(posts.map(p => [p.id, p]));
  const commentMap = new Map(comments.map(c => [c.id, c]));
  const userMap = new Map(users.map(u => [u.id, u]));
  const reelMap = new Map(reels.map(r => [r.id, r]));
  const storyMap = new Map(stories.map(s => [s.id, s]));

  // Enrich each report
  return reports.map(report => {
    let targetContent: typeof posts[number] | typeof comments[number] | typeof users[number] | typeof reels[number] | typeof stories[number] | null = null;

    switch (report.targetType) {
      case 'POST':
        targetContent = postMap.get(report.targetId) || null;
        break;
      case 'COMMENT':
        targetContent = commentMap.get(report.targetId) || null;
        break;
      case 'USER':
        targetContent = userMap.get(report.targetId) || null;
        break;
      case 'REEL':
        targetContent = reelMap.get(report.targetId) || null;
        break;
      case 'STORY':
        targetContent = storyMap.get(report.targetId) || null;
        break;
    }

    return {
      ...report,
      reporter: reporterMap.get(report.reporterId) || null,
      targetContent,
      targetContentDeleted: !targetContent,
    };
  });
}

/**
 * Enrich a single report with full details
 */
async function enrichReportWithFullDetails(report: Report) {
  // Get reporter info
  const reporter = await prisma.user.findUnique({
    where: { id: report.reporterId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      createdAt: true,
    },
  });

  // Get resolver info if resolved
  let resolver = null;
  if (report.resolvedBy) {
    resolver = await prisma.user.findUnique({
      where: { id: report.resolvedBy },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
      },
    });
  }

  // Get target content with full details
  const targetContent = await getTargetContent(report.targetType, report.targetId);

  // Get previous reports on the same target
  const previousReports = await prisma.report.findMany({
    where: {
      targetType: report.targetType,
      targetId: report.targetId,
      id: { not: report.id },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      reason: true,
      status: true,
      createdAt: true,
    },
  });

  // Get report history for the reported user (if applicable)
  let userReportHistory: { totalReports: number; totalBans: number } | null = null;
  const targetUserId = getTargetUserId(targetContent, report.targetType);

  if (targetUserId) {
    const userReports = await prisma.report.count({
      where: {
        OR: [
          { targetType: 'USER', targetId: targetUserId },
          // For posts, comments, etc., check if the user is the owner
        ],
      },
    });

    const userBans = await prisma.moderationLog.count({
      where: {
        targetId: targetUserId,
        action: { contains: 'BAN' },
      },
    });

    userReportHistory = {
      totalReports: userReports,
      totalBans: userBans,
    };
  }

  return {
    ...report,
    reporter,
    resolver,
    targetContent,
    targetContentDeleted: !targetContent,
    previousReports,
    userReportHistory,
  };
}

/**
 * Get target content based on type and ID
 */
async function getTargetContent(targetType: ReportTargetType, targetId: string) {
  switch (targetType) {
    case 'POST':
      return prisma.post.findUnique({
        where: { id: targetId },
        include: {
          user: {
            select: { id: true, username: true, avatar: true, displayName: true },
          },
          _count: { select: { likes: true, comments: true } },
        },
      });

    case 'COMMENT':
      return prisma.comment.findUnique({
        where: { id: targetId },
        include: {
          user: {
            select: { id: true, username: true, avatar: true, displayName: true },
          },
          post: {
            select: { id: true, content: true },
          },
        },
      });

    case 'USER':
      return prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          bio: true,
          createdAt: true,
          isBanned: true,
          bannedAt: true,
          bannedReason: true,
          _count: {
            select: { posts: true, followers: true, following: true },
          },
        },
      });

    case 'REEL':
      return prisma.reel.findUnique({
        where: { id: targetId },
        include: {
          user: {
            select: { id: true, username: true, avatar: true, displayName: true },
          },
        },
      });

    case 'STORY':
      return prisma.story.findUnique({
        where: { id: targetId },
        include: {
          user: {
            select: { id: true, username: true, avatar: true, displayName: true },
          },
        },
      });

    default:
      return null;
  }
}

/**
 * Get the user ID from target content
 */
function getTargetUserId(content: TargetContent | null, targetType: ReportTargetType): string | null {
  if (!content) return null;

  switch (targetType) {
    case 'USER':
      return content.id;
    case 'POST':
    case 'REEL':
    case 'STORY':
    case 'COMMENT':
      return content.userId || content.user?.id || null;
    default:
      return null;
  }
}

/**
 * Remove content based on type and ID
 */
async function removeContent(targetType: ReportTargetType, targetId: string) {
  switch (targetType) {
    case 'POST':
      await prisma.post.delete({ where: { id: targetId } });
      break;
    case 'COMMENT':
      await prisma.comment.delete({ where: { id: targetId } });
      break;
    case 'REEL':
      await prisma.reel.delete({ where: { id: targetId } });
      break;
    case 'STORY':
      await prisma.story.delete({ where: { id: targetId } });
      break;
    case 'USER':
      // For users, we don't delete - we ban instead
      // This case shouldn't be called, but just in case
      throw new Error('Cannot remove user content. Use ban_user action instead.');
  }
}
