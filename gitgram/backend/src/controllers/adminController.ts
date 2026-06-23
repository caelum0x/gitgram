import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { Prisma } from '@prisma/client';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * Get all users with pagination and filters
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const search = req.query.search as string;
  const status = req.query.status as string;
  const sortBy = (req.query.sortBy as string) || 'createdAt';
  const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';

  const where: Prisma.UserWhereInput = {};

  if (search) {
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { displayName: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status === 'verified') {
    where.verified = true;
  } else if (status === 'unverified') {
    where.verified = false;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatar: true,
        verified: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * Get single user details
 */
export const getUserDetails = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          posts: true,
          followers: true,
          following: true,
          comments: true,
          likes: true,
        },
      },
      sessions: {
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!user) {
    throw Errors.notFound('User');
  }

  // Get recent activity
  const recentPosts = await prisma.post.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      content: true,
      createdAt: true,
      likesCount: true,
      commentsCount: true,
    },
  });

  res.json({
    ...user,
    recentPosts,
  });
});

/**
 * Update user (verification status)
 */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { verified, isPrivate } = req.body;
  const adminId = (req as AuthRequest).user!.id;

  const updateData: Prisma.UserUpdateInput = {};

  if (verified !== undefined) updateData.verified = verified;
  if (isPrivate !== undefined) updateData.isPrivate = isPrivate;

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      username: true,
      verified: true,
      isPrivate: true,
    },
  });

  // Log admin action
  await logAdminAction(adminId, 'USER_UPDATE', userId, updateData);

  logger.info(`Admin ${adminId} updated user ${userId}`);
  res.json(user);
});

/**
 * Ban user (soft ban - invalidate sessions)
 */
export const banUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { reason } = req.body;
  const adminId = (req as AuthRequest).user!.id;

  // Invalidate all sessions for this user
  const result = await prisma.session.deleteMany({ where: { userId } });

  await logAdminAction(adminId, 'USER_BAN', userId, { reason, sessionsDeleted: result.count });

  logger.info(`Admin ${adminId} banned user ${userId} (${result.count} sessions invalidated)`);
  res.json({
    message: 'User sessions invalidated successfully',
    sessionsInvalidated: result.count,
    note: 'User will need to re-authenticate'
  });
});

/**
 * Unban user (no-op since we don't have ban flag, just a log action)
 */
export const unbanUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const adminId = (req as AuthRequest).user!.id;

  await logAdminAction(adminId, 'USER_UNBAN', userId, {});

  logger.info(`Admin ${adminId} unbanned user ${userId}`);
  res.json({ message: 'User unban noted' });
});

/**
 * Delete user account
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const adminId = (req as AuthRequest).user!.id;

  // Delete user (cascades to related data)
  await prisma.user.delete({ where: { id: userId } });

  await logAdminAction(adminId, 'USER_DELETE', userId, {});

  logger.info(`Admin ${adminId} deleted user ${userId}`);
  res.json({ message: 'User deleted successfully' });
});

// ============================================================================
// CONTENT MODERATION
// ============================================================================

/**
 * Get reports for moderation (with pagination)
 */
export const getReports = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const status = req.query.status as string || 'pending';

  const where: Prisma.PostReportWhereInput = {};
  if (status && status !== 'all') {
    where.status = status;
  }

  const [reports, total] = await Promise.all([
    prisma.postReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.postReport.count({ where }),
  ]);

  // Fetch related posts and reporters
  const postIds = [...new Set(reports.map(r => r.postId))];
  const reporterIds = [...new Set(reports.map(r => r.userId).filter(Boolean))] as string[];

  const [posts, reporters] = await Promise.all([
    prisma.post.findMany({
      where: { id: { in: postIds } },
      select: {
        id: true,
        content: true,
        mediaUrls: true,
        createdAt: true,
        user: {
          select: { id: true, username: true, avatar: true },
        },
      },
    }),
    prisma.user.findMany({
      where: { id: { in: reporterIds } },
      select: { id: true, username: true, avatar: true },
    }),
  ]);

  const postMap = new Map(posts.map(p => [p.id, p]));
  const reporterMap = new Map(reporters.map(r => [r.id, r]));

  const enrichedReports = reports.map(report => ({
    ...report,
    post: postMap.get(report.postId) || null,
    reporter: report.userId ? reporterMap.get(report.userId) || null : null,
  }));

  res.json({
    reports: enrichedReports,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * Resolve a content report
 */
export const resolveReport = asyncHandler(async (req: Request, res: Response) => {
  const { reportId } = req.params;
  const { action, note } = req.body;
  const adminId = (req as AuthRequest).user!.id;

  // Valid actions: dismiss, warn, remove_content, ban_user
  const validActions = ['dismiss', 'warn', 'remove_content', 'ban_user'];
  if (!validActions.includes(action)) {
    throw Errors.badRequest(`Invalid action. Valid actions: ${validActions.join(', ')}`);
  }

  // Get the report
  const report = await prisma.postReport.findUnique({
    where: { id: reportId },
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  if (report.status !== 'pending') {
    throw Errors.badRequest('Report already resolved');
  }

  // Get the reported post
  const post = await prisma.post.findUnique({
    where: { id: report.postId },
    select: { id: true, userId: true },
  });

  // Execute the action
  let actionResult = '';

  if (action === 'remove_content' && post) {
    // Delete the post
    await prisma.post.delete({ where: { id: post.id } });
    actionResult = 'Post removed';
  } else if (action === 'ban_user' && post?.userId) {
    // Invalidate all sessions for the post author
    const result = await prisma.session.deleteMany({
      where: { userId: post.userId }
    });
    actionResult = `User banned (${result.count} sessions invalidated)`;
  } else if (action === 'warn' && post?.userId) {
    // Create a notification warning the user
    await prisma.notification.create({
      data: {
        userId: post.userId,
        type: 'MENTION',
        content: `Your post has been flagged for review. Reason: ${report.reason}`,
      },
    });
    actionResult = 'User warned via notification';
  } else {
    actionResult = 'Report dismissed';
  }

  // Update report status
  await prisma.postReport.update({
    where: { id: reportId },
    data: { status: action === 'dismiss' ? 'dismissed' : 'resolved' },
  });

  // Log the action
  await logAdminAction(adminId, 'REPORT_RESOLVE', reportId, {
    action,
    note,
    postId: report.postId,
    result: actionResult,
  });

  res.json({
    message: 'Report resolved',
    action,
    result: actionResult,
  });
});

/**
 * Get posts for moderation
 */
export const getFlaggedContent = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      include: {
        user: {
          select: { id: true, username: true, avatar: true },
        },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count(),
  ]);

  res.json({
    posts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * Delete post (moderation action)
 */
export const moderatePost = asyncHandler(async (req: Request, res: Response) => {
  const { postId } = req.params;
  const { action, reason } = req.body;
  const adminId = (req as AuthRequest).user!.id;

  if (action === 'remove') {
    await prisma.post.delete({ where: { id: postId } });
  }

  await logAdminAction(adminId, 'POST_MODERATE', postId, { action, reason });

  logger.info(`Admin ${adminId} moderated post ${postId}: ${action}`);
  res.json({ message: `Post ${action === 'remove' ? 'removed' : 'action noted'}` });
});

// ============================================================================
// ANALYTICS DASHBOARD
// ============================================================================

/**
 * Get dashboard overview stats
 */
export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsersToday,
    newUsersThisWeek,
    totalPosts,
    postsToday,
    postsThisWeek,
    totalComments,
    totalLikes,
    totalStories,
    totalReels,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.user.count({ where: { createdAt: { gte: lastWeek } } }),
    prisma.post.count(),
    prisma.post.count({ where: { createdAt: { gte: today } } }),
    prisma.post.count({ where: { createdAt: { gte: lastWeek } } }),
    prisma.comment.count(),
    prisma.like.count(),
    prisma.story.count(),
    prisma.reel.count(),
  ]);

  res.json({
    users: {
      total: totalUsers,
      newToday: newUsersToday,
      newThisWeek: newUsersThisWeek,
    },
    content: {
      posts: totalPosts,
      postsToday,
      postsThisWeek,
      comments: totalComments,
      likes: totalLikes,
      stories: totalStories,
      reels: totalReels,
    },
    engagement: {
      avgLikesPerPost: totalPosts > 0 ? (totalLikes / totalPosts).toFixed(2) : 0,
      avgCommentsPerPost: totalPosts > 0 ? (totalComments / totalPosts).toFixed(2) : 0,
    },
  });
});

/**
 * Get detailed analytics
 */
export const getAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { timeframe = '30d' } = req.query;

  let startDate: Date;
  const now = new Date();

  switch (timeframe) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const [
    newUsers,
    newPosts,
    newComments,
    newLikes,
    topUsers,
    topPosts,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: startDate } } }),
    prisma.post.count({ where: { createdAt: { gte: startDate } } }),
    prisma.comment.count({ where: { createdAt: { gte: startDate } } }),
    prisma.like.count({ where: { createdAt: { gte: startDate } } }),
    prisma.user.findMany({
      orderBy: { followers: { _count: 'desc' } },
      take: 10,
      select: {
        id: true,
        username: true,
        avatar: true,
        _count: { select: { followers: true, posts: true } },
      },
    }),
    prisma.post.findMany({
      where: { createdAt: { gte: startDate } },
      orderBy: { likesCount: 'desc' },
      take: 10,
      select: {
        id: true,
        content: true,
        likesCount: true,
        commentsCount: true,
        user: { select: { username: true } },
      },
    }),
  ]);

  res.json({
    timeframe,
    metrics: {
      newUsers,
      newPosts,
      newComments,
      newLikes,
      engagementRate: newPosts > 0 ? ((newLikes + newComments) / newPosts).toFixed(2) : 0,
    },
    topUsers,
    topPosts,
  });
});

// ============================================================================
// AUDIT LOGS
// ============================================================================

interface AuditLogEntry {
  adminId: string;
  action: string;
  targetId: string;
  details: Record<string, unknown>;
  timestamp: Date;
  ipAddress?: string;
}

// In-memory audit log
const auditLog: AuditLogEntry[] = [];

async function logAdminAction(
  adminId: string,
  action: string,
  targetId: string,
  details: Record<string, unknown>,
  ipAddress?: string
) {
  const entry: AuditLogEntry = {
    adminId,
    action,
    targetId,
    details,
    timestamp: new Date(),
    ipAddress,
  };

  auditLog.unshift(entry);

  // Keep only last 1000 entries in memory
  if (auditLog.length > 1000) {
    auditLog.pop();
  }

  // Log to file
  logger.info(`ADMIN_AUDIT: ${action} by ${adminId} on ${targetId}`, details);
}

/**
 * Get audit logs
 */
export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const adminId = req.query.adminId as string;
  const action = req.query.action as string;

  let filteredLogs = [...auditLog];

  if (adminId) {
    filteredLogs = filteredLogs.filter(log => log.adminId === adminId);
  }

  if (action) {
    filteredLogs = filteredLogs.filter(log => log.action === action);
  }

  const start = (page - 1) * limit;
  const paginatedLogs = filteredLogs.slice(start, start + limit);

  // Enrich with admin usernames
  const adminIds = [...new Set(paginatedLogs.map(log => log.adminId))];
  const admins = await prisma.user.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, username: true },
  });

  const adminMap = new Map(admins.map(a => [a.id, a.username]));

  const enrichedLogs = paginatedLogs.map(log => ({
    ...log,
    adminUsername: adminMap.get(log.adminId) || 'Unknown',
  }));

  res.json({
    logs: enrichedLogs,
    pagination: {
      page,
      limit,
      total: filteredLogs.length,
      totalPages: Math.ceil(filteredLogs.length / limit),
    },
  });
});

// ============================================================================
// SYSTEM CONFIGURATION
// ============================================================================

/**
 * Get system configuration
 */
export const getSystemConfig = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    features: {
      registrationEnabled: process.env.REGISTRATION_ENABLED !== 'false',
      emailVerificationRequired: process.env.EMAIL_VERIFICATION_REQUIRED !== 'false',
      twoFactorEnabled: process.env.TWO_FACTOR_ENABLED !== 'false',
      maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
    },
    limits: {
      maxPostLength: parseInt(process.env.MAX_POST_LENGTH || '2000'),
      maxMediaPerPost: parseInt(process.env.MAX_MEDIA_PER_POST || '10'),
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
      rateLimit: parseInt(process.env.RATE_LIMIT || '100'),
    },
    integrations: {
      githubEnabled: !!process.env.GITHUB_CLIENT_ID,
      googleEnabled: !!process.env.GOOGLE_CLIENT_ID,
      sentryEnabled: !!process.env.SENTRY_DSN,
      resendEnabled: !!process.env.RESEND_API_KEY,
    },
  });
});

/**
 * Update system configuration (runtime only)
 */
export const updateSystemConfig = asyncHandler(async (req: Request, res: Response) => {
  const { key, value } = req.body;
  const adminId = (req as AuthRequest).user!.id;

  const allowedKeys = ['MAINTENANCE_MODE', 'REGISTRATION_ENABLED'];

  if (!allowedKeys.includes(key)) {
    throw Errors.badRequest('This configuration cannot be updated at runtime');
  }

  process.env[key] = value;

  await logAdminAction(adminId, 'CONFIG_UPDATE', key, { value });

  logger.info(`Admin ${adminId} updated config: ${key}=${value}`);
  res.json({ message: 'Configuration updated', key, value });
});

// ============================================================================
// BULK ACTIONS
// ============================================================================

/**
 * Send announcement to all users
 */
export const sendAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const { title, message } = req.body;
  const adminId = (req as AuthRequest).user!.id;

  const users = await prisma.user.findMany({
    select: { id: true },
  });

  // Create notifications for all users
  await prisma.notification.createMany({
    data: users.map(user => ({
      userId: user.id,
      type: 'MENTION' as const, // Using MENTION as closest type for announcements
      content: `[Announcement] ${title}: ${message}`,
    })),
  });

  await logAdminAction(adminId, 'ANNOUNCEMENT_SENT', 'all', { title, userCount: users.length });

  logger.info(`Admin ${adminId} sent announcement to ${users.length} users`);
  res.json({ message: `Announcement sent to ${users.length} users` });
});

/**
 * Bulk invalidate user sessions (soft ban)
 */
export const bulkBanUsers = asyncHandler(async (req: Request, res: Response) => {
  const { userIds, reason } = req.body;
  const adminId = (req as AuthRequest).user!.id;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw Errors.badRequest('userIds array is required');
  }

  // Invalidate sessions for all specified users
  const result = await prisma.session.deleteMany({
    where: { userId: { in: userIds } },
  });

  await logAdminAction(adminId, 'BULK_BAN', 'multiple', { userIds, reason, sessionsDeleted: result.count });

  logger.info(`Admin ${adminId} bulk banned ${userIds.length} users (${result.count} sessions invalidated)`);
  res.json({
    message: `${userIds.length} users' sessions invalidated`,
    sessionsDeleted: result.count,
  });
});

/**
 * Export data for reporting
 */
export const exportData = asyncHandler(async (req: Request, res: Response) => {
  const { type, format = 'json', startDate, endDate } = req.query;
  const adminId = (req as AuthRequest).user!.id;

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) dateFilter.gte = new Date(startDate as string);
  if (endDate) dateFilter.lte = new Date(endDate as string);
  const createdAtFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

  let data: Record<string, unknown>[];

  switch (type) {
    case 'users':
      data = await prisma.user.findMany({
        where: createdAtFilter,
        select: {
          id: true,
          username: true,
          email: true,
          createdAt: true,
          verified: true,
        },
      });
      break;
    case 'posts':
      data = await prisma.post.findMany({
        where: createdAtFilter,
        select: {
          id: true,
          userId: true,
          content: true,
          createdAt: true,
          likesCount: true,
          commentsCount: true,
        },
      });
      break;
    default:
      throw Errors.badRequest('Invalid export type. Use: users, posts');
  }

  await logAdminAction(adminId, 'DATA_EXPORT', type as string, { format, count: data.length });

  if (format === 'csv') {
    const csv = convertToCSV(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_export.csv`);
    return res.send(csv);
  }

  res.json(data);
});

function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(item =>
    headers.map(header => {
      const value = item[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value).includes(',') ? `"${value}"` : value;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

// ============================================================================
// ADMIN PANEL — SUSPEND / UNSUSPEND
// ============================================================================

/**
 * Suspend a user account (sets isSuspended = true)
 */
export const suspendUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { reason, suspendedUntil } = req.body as {
    reason?: string;
    suspendedUntil?: string;
  };
  const adminId = (req as AuthRequest).user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isSuspended: true },
  });

  if (!user) {
    throw Errors.notFound('User');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      isSuspended: true,
      suspendedReason: reason ?? null,
      suspendedUntil: suspendedUntil ? new Date(suspendedUntil) : null,
    },
    select: {
      id: true,
      username: true,
      isSuspended: true,
      suspendedReason: true,
      suspendedUntil: true,
    },
  });

  await logAdminAction(adminId, 'USER_SUSPEND', userId, {
    reason,
    suspendedUntil: suspendedUntil ?? null,
  });

  logger.info(`Admin ${adminId} suspended user ${userId}`);
  res.json({
    success: true,
    message: `User ${user.username} has been suspended`,
    user: updatedUser,
  });
});

/**
 * Unsuspend a user account (sets isSuspended = false)
 */
export const unsuspendUser = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const adminId = (req as AuthRequest).user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, isSuspended: true },
  });

  if (!user) {
    throw Errors.notFound('User');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      isSuspended: false,
      suspendedReason: null,
      suspendedUntil: null,
    },
    select: {
      id: true,
      username: true,
      isSuspended: true,
    },
  });

  await logAdminAction(adminId, 'USER_UNSUSPEND', userId, {});

  logger.info(`Admin ${adminId} unsuspended user ${userId}`);
  res.json({
    success: true,
    message: `User ${user.username} has been unsuspended`,
    user: updatedUser,
  });
});

// ============================================================================
// ADMIN PANEL — PENDING REPORTS
// ============================================================================

/**
 * Get pending (unresolved) content reports with reporter and target preview
 */
export const getPendingReports = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        description: true,
        status: true,
        priority: true,
        escalated: true,
        autoFlagged: true,
        createdAt: true,
        reporterId: true,
      },
    }),
    prisma.report.count({ where: { status: 'PENDING' } }),
  ]);

  // Collect unique reporter IDs
  const reporterIds = [...new Set(reports.map(r => r.reporterId).filter(Boolean))];

  const reporters = await prisma.user.findMany({
    where: { id: { in: reporterIds } },
    select: { id: true, username: true, avatar: true },
  });

  const reporterMap = new Map(reporters.map(r => [r.id, r]));

  const enriched = reports.map(report => ({
    ...report,
    reporter: reporterMap.get(report.reporterId) ?? null,
  }));

  res.json({
    success: true,
    data: enriched,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * Resolve a pending report with a specified action
 * Actions: 'dismiss' | 'remove_content' | 'suspend_user'
 */
export const resolveReportPanel = asyncHandler(async (req: Request, res: Response) => {
  const { reportId } = req.params;
  const { action, note } = req.body as {
    action: 'dismiss' | 'remove_content' | 'suspend_user';
    note?: string;
  };
  const adminId = (req as AuthRequest).user!.id;

  const validActions = ['dismiss', 'remove_content', 'suspend_user'] as const;
  if (!validActions.includes(action)) {
    throw Errors.badRequest(
      `Invalid action. Valid actions: ${validActions.join(', ')}`
    );
  }

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      status: true,
      targetType: true,
      targetId: true,
      reporterId: true,
    },
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  if (report.status !== 'PENDING') {
    throw Errors.badRequest('Report is already resolved');
  }

  let actionResult = 'Report dismissed';

  if (action === 'remove_content') {
    // Attempt to delete the target content based on type
    try {
      switch (report.targetType) {
        case 'POST':
          await prisma.post.delete({ where: { id: report.targetId } });
          break;
        case 'REEL':
          await prisma.reel.delete({ where: { id: report.targetId } });
          break;
        case 'COMMENT':
          await prisma.comment.delete({ where: { id: report.targetId } });
          break;
        default:
          break;
      }
      actionResult = `Content (${report.targetType}:${report.targetId}) removed`;
    } catch {
      actionResult = 'Content not found or already removed';
    }
  } else if (action === 'suspend_user') {
    // Find the owner of the reported content
    let ownerId: string | null = null;

    try {
      switch (report.targetType) {
        case 'POST': {
          const post = await prisma.post.findUnique({
            where: { id: report.targetId },
            select: { userId: true },
          });
          ownerId = post?.userId ?? null;
          break;
        }
        case 'REEL': {
          const reel = await prisma.reel.findUnique({
            where: { id: report.targetId },
            select: { userId: true },
          });
          ownerId = reel?.userId ?? null;
          break;
        }
        case 'COMMENT': {
          const comment = await prisma.comment.findUnique({
            where: { id: report.targetId },
            select: { userId: true },
          });
          ownerId = comment?.userId ?? null;
          break;
        }
        default:
          break;
      }
    } catch {
      // Content may not exist
    }

    if (ownerId) {
      await prisma.user.update({
        where: { id: ownerId },
        data: {
          isSuspended: true,
          suspendedReason: `Suspended via report resolution (reportId: ${reportId})`,
        },
      });
      actionResult = `User ${ownerId} suspended`;
    } else {
      actionResult = 'Target user not found — no suspension applied';
    }
  }

  // Mark report resolved
  await prisma.report.update({
    where: { id: reportId },
    data: {
      status: 'RESOLVED',
      resolvedBy: adminId,
      resolvedAt: new Date(),
      resolution: note ?? action,
    },
  });

  await logAdminAction(adminId, 'REPORT_RESOLVE_PANEL', reportId, {
    action,
    note,
    targetType: report.targetType,
    targetId: report.targetId,
    result: actionResult,
  });

  res.json({
    success: true,
    message: 'Report resolved',
    action,
    result: actionResult,
  });
});

/**
 * Get recent admin audit log entries (panel-facing, paginated)
 */
export const getAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const filterAdminId = req.query.adminId as string | undefined;
  const filterAction = req.query.action as string | undefined;

  let filteredLogs = [...auditLog];

  if (filterAdminId) {
    filteredLogs = filteredLogs.filter(entry => entry.adminId === filterAdminId);
  }

  if (filterAction) {
    filteredLogs = filteredLogs.filter(entry => entry.action === filterAction);
  }

  const start = (page - 1) * limit;
  const paginated = filteredLogs.slice(start, start + limit);

  const adminIds = [...new Set(paginated.map(entry => entry.adminId))];
  const admins = await prisma.user.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, username: true },
  });

  const adminMap = new Map(admins.map(a => [a.id, a.username]));

  const enriched = paginated.map(entry => ({
    ...entry,
    adminUsername: adminMap.get(entry.adminId) ?? 'Unknown',
  }));

  res.json({
    success: true,
    data: enriched,
    meta: {
      total: filteredLogs.length,
      page,
      limit,
      totalPages: Math.ceil(filteredLogs.length / limit),
    },
  });
});
