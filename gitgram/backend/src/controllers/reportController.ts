import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { ReportTargetType, ReportReason, ReportStatus } from '@prisma/client';
import logger from '../utils/logger';
import { checkAndEscalateReports } from '../services/moderationEnforcementService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

// Valid report reasons
const VALID_REASONS = ['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'MISINFORMATION', 'OTHER'];
const VALID_TARGET_TYPES = ['POST', 'COMMENT', 'USER', 'REEL', 'STORY'];

// Reason severity for priority calculation
const REASON_SEVERITY: Record<string, number> = {
  HARASSMENT: 5,
  INAPPROPRIATE: 4,
  MISINFORMATION: 3,
  SPAM: 2,
  OTHER: 1,
};

// Create a new report
export const createReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const reporterId = req.userId!;
  const { targetType, targetId, reason, description } = req.body;

  // Validate required fields
  if (!targetType || !targetId || !reason) {
    throw Errors.badRequest('Missing required fields: targetType, targetId, and reason are required');
  }

  // Validate target type
  if (!VALID_TARGET_TYPES.includes(targetType.toUpperCase())) {
    throw Errors.badRequest(`Invalid target type. Valid types are: ${VALID_TARGET_TYPES.join(', ')}`);
  }

  // Validate reason
  if (!VALID_REASONS.includes(reason.toUpperCase())) {
    throw Errors.badRequest(`Invalid reason. Valid reasons are: ${VALID_REASONS.join(', ')}`);
  }

  // Check if user has already reported this content
  const existingReport = await prisma.report.findFirst({
    where: {
      reporterId,
      targetType: targetType.toUpperCase() as ReportTargetType,
      targetId,
      status: { in: ['PENDING', 'REVIEWING'] }
    }
  });

  if (existingReport) {
    throw Errors.conflict('You have already reported this content');
  }

  // Verify the target exists
  const targetExists = await verifyTargetExists(targetType.toUpperCase(), targetId);
  if (!targetExists) {
    throw Errors.notFound('Target');
  }

  // Prevent self-reporting for USER type
  if (targetType.toUpperCase() === 'USER' && targetId === reporterId) {
    throw Errors.badRequest('You cannot report yourself');
  }

  // Count existing reports on this target for priority calculation
  const existingReportCount = await prisma.report.count({
    where: {
      targetType: targetType.toUpperCase() as ReportTargetType,
      targetId,
      status: { in: ['PENDING', 'REVIEWING'] },
    },
  });

  // Calculate priority: severity + existing report count
  const normalizedReason = reason.toUpperCase();
  const priority = (REASON_SEVERITY[normalizedReason] || 1) + existingReportCount;

  // Create the report
  const report = await prisma.report.create({
    data: {
      reporterId,
      targetType: targetType.toUpperCase() as ReportTargetType,
      targetId,
      reason: normalizedReason as ReportReason,
      description: description || null,
      priority,
    }
  });

  // Auto-escalate if target receives 3+ reports
  const escalated = await checkAndEscalateReports(
    targetType.toUpperCase(),
    targetId
  );

  logger.info(`Report ${report.id} created by user ${reporterId} for ${targetType} ${targetId} (reason: ${reason}, priority: ${priority}, escalated: ${escalated})`);

  res.status(201).json({
    message: 'Report submitted successfully',
    reportId: report.id,
    escalated,
  });
});

// Get user's submitted reports
export const getMyReports = asyncHandler(async (req: AuthRequest, res: Response) => {
  const reporterId = req.userId!;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where: { reporterId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      select: {
        id: true,
        targetType: true,
        targetId: true,
        reason: true,
        status: true,
        createdAt: true
      }
    }),
    prisma.report.count({ where: { reporterId } })
  ]);

  res.json({
    reports,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  });
});

// Get report by ID (for user who submitted it)
export const getReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const reporterId = req.userId!;
  const { id } = req.params;

  const report = await prisma.report.findFirst({
    where: { id, reporterId },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      reason: true,
      description: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      resolution: true
    }
  });

  if (!report) {
    throw Errors.notFound('Report');
  }

  res.json(report);
});

// Admin: Get all reports (with filtering)
export const getAllReports = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, targetType, reason, page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {};
  if (status) where.status = status.toString().toUpperCase();
  if (targetType) where.targetType = targetType.toString().toUpperCase();
  if (reason) where.reason = reason.toString().toUpperCase();

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    }),
    prisma.report.count({ where })
  ]);

  res.json({
    reports,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  });
});

// Admin: Update report status
export const updateReportStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, resolution } = req.body;
  const moderatorId = req.userId!;

  if (!status || !['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'].includes(status.toUpperCase())) {
    throw Errors.badRequest('Invalid status. Valid statuses are: PENDING, REVIEWING, RESOLVED, DISMISSED');
  }

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) {
    throw Errors.notFound('Report');
  }

  const updatedReport = await prisma.report.update({
    where: { id },
    data: {
      status: status.toUpperCase() as ReportStatus,
      resolvedBy: ['RESOLVED', 'DISMISSED'].includes(status.toUpperCase()) ? moderatorId : null,
      resolvedAt: ['RESOLVED', 'DISMISSED'].includes(status.toUpperCase()) ? new Date() : null,
      resolution: resolution || null
    }
  });

  // Log the moderation action
  await prisma.moderationLog.create({
    data: {
      moderatorId,
      action: `report_${status.toLowerCase()}`,
      targetType: 'REPORT',
      targetId: id,
      reason: resolution || null
    }
  });

  res.json({
    message: 'Report updated successfully',
    report: updatedReport
  });
});

// Admin: Get report statistics
export const getReportStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [
    totalReports,
    pendingReports,
    reviewingReports,
    resolvedReports,
    dismissedReports,
    reportsByType,
    reportsByReason,
    recentReports
  ] = await Promise.all([
    prisma.report.count(),
    prisma.report.count({ where: { status: 'PENDING' } }),
    prisma.report.count({ where: { status: 'REVIEWING' } }),
    prisma.report.count({ where: { status: 'RESOLVED' } }),
    prisma.report.count({ where: { status: 'DISMISSED' } }),
    prisma.report.groupBy({
      by: ['targetType'],
      _count: true
    }),
    prisma.report.groupBy({
      by: ['reason'],
      _count: true
    }),
    prisma.report.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    })
  ]);

  res.json({
    total: totalReports,
    byStatus: {
      pending: pendingReports,
      reviewing: reviewingReports,
      resolved: resolvedReports,
      dismissed: dismissedReports
    },
    byType: reportsByType.reduce((acc: any, item) => {
      acc[item.targetType] = item._count;
      return acc;
    }, {}),
    byReason: reportsByReason.reduce((acc: any, item) => {
      acc[item.reason] = item._count;
      return acc;
    }, {}),
    last24Hours: recentReports
  });
});

// Submit an appeal for a moderation action
export const submitAppeal = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { moderationLogId, appealText } = req.body;

  if (!moderationLogId || !appealText) {
    throw Errors.badRequest('Missing required fields: moderationLogId and appealText are required');
  }

  if (appealText.length > 2000) {
    throw Errors.badRequest('Appeal text must be 2000 characters or less');
  }

  const { appealAction } = require('../services/moderationEnforcementService');
  const result = await appealAction(userId, moderationLogId, appealText);

  res.status(201).json({
    message: 'Appeal submitted successfully',
    appealId: result.appealId,
  });
});

// Get user's moderation history (warnings, suspensions, etc.)
export const getMyModerationHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [logs, total] = await Promise.all([
    prisma.moderationLog.findMany({
      where: {
        targetId: userId,
        targetType: 'USER',
        action: { in: ['WARN_USER', 'SUSPEND_USER', 'BAN_USER', 'REMOVE_CONTENT'] },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit),
      select: {
        id: true,
        action: true,
        reason: true,
        appealable: true,
        createdAt: true,
      },
    }),
    prisma.moderationLog.count({
      where: {
        targetId: userId,
        targetType: 'USER',
        action: { in: ['WARN_USER', 'SUSPEND_USER', 'BAN_USER', 'REMOVE_CONTENT'] },
      },
    }),
  ]);

  // Check which actions have pending appeals
  const logIds = logs.map((l) => l.id);
  const appeals = await prisma.moderationAppeal.findMany({
    where: {
      moderationLogId: { in: logIds },
      userId,
    },
    select: {
      moderationLogId: true,
      status: true,
    },
  });
  const appealMap = new Map(appeals.map((a) => [a.moderationLogId, a.status]));

  const enrichedLogs = logs.map((log) => ({
    ...log,
    appealStatus: appealMap.get(log.id) || null,
  }));

  res.json({
    moderationHistory: enrichedLogs,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

// Helper function to verify target exists
async function verifyTargetExists(targetType: string, targetId: string): Promise<boolean> {
  try {
    switch (targetType) {
      case 'POST':
        const post = await prisma.post.findUnique({ where: { id: targetId } });
        return !!post;
      case 'COMMENT':
        const comment = await prisma.comment.findUnique({ where: { id: targetId } });
        return !!comment;
      case 'USER':
        const user = await prisma.user.findUnique({ where: { id: targetId } });
        return !!user;
      case 'REEL':
        const reel = await prisma.reel.findUnique({ where: { id: targetId } });
        return !!reel;
      case 'STORY':
        const story = await prisma.story.findUnique({ where: { id: targetId } });
        return !!story;
      default:
        return false;
    }
  } catch (error) {
    return false;
  }
}
