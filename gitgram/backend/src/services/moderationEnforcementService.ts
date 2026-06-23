import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { ReportTargetType } from '@prisma/client';

// ============================================================================
// ENFORCEMENT ACTIONS
// ============================================================================

/**
 * Send a warning notification to a user
 */
export const warnUser = async (
  userId: string,
  reason: string,
  moderatorId: string
): Promise<{ success: boolean; warningCount: number }> => {
  try {
    // Increment warning count
    const user = await prisma.user.update({
      where: { id: userId },
      data: { warningCount: { increment: 1 } },
      select: { id: true, username: true, warningCount: true },
    });

    // Create a notification for the user
    await prisma.notification.create({
      data: {
        userId,
        type: 'MENTION',
        content: `Warning: ${reason}. You have received ${user.warningCount} warning(s). Continued violations may result in account suspension or ban.`,
      },
    });

    // Log the moderation action
    await prisma.moderationLog.create({
      data: {
        moderatorId,
        action: 'WARN_USER',
        targetType: 'USER',
        targetId: userId,
        reason,
        metadata: JSON.stringify({ warningCount: user.warningCount }),
        appealable: true,
      },
    });

    // Auto-escalate: if 3+ warnings, auto-suspend for 24 hours
    if (user.warningCount >= 3) {
      const suspendDuration = 24; // hours
      await suspendUser(userId, suspendDuration, 'Automatic suspension after 3 warnings', moderatorId, true);
      logger.info(`User ${userId} auto-suspended after ${user.warningCount} warnings`);
    }

    logger.info(`User ${userId} warned by moderator ${moderatorId}: ${reason}`);

    // Emit real-time notification via WebSocket if available
    try {
      if (global.io) {
        global.io.to(`user:${userId}`).emit('moderation:warning', {
          reason,
          warningCount: user.warningCount,
        });
      }
    } catch (wsError) {
      // WebSocket not critical, continue
    }

    return { success: true, warningCount: user.warningCount };
  } catch (error) {
    logger.error('Failed to warn user:', error);
    throw new Error('Failed to warn user');
  }
};

/**
 * Soft-delete content (archive/hide instead of hard delete)
 */
export const removeContent = async (
  targetType: string,
  targetId: string,
  reason: string,
  moderatorId: string
): Promise<{ success: boolean; targetUserId: string | null }> => {
  try {
    let targetUserId: string | null = null;

    switch (targetType.toUpperCase()) {
      case 'POST': {
        const post = await prisma.post.findUnique({
          where: { id: targetId },
          select: { userId: true },
        });
        targetUserId = post?.userId || null;

        // Soft-delete by archiving
        await prisma.post.update({
          where: { id: targetId },
          data: {
            isArchived: true,
            archivedAt: new Date(),
            content: '[Content removed by moderator]',
          },
        });
        break;
      }

      case 'COMMENT': {
        const comment = await prisma.comment.findUnique({
          where: { id: targetId },
          select: { userId: true },
        });
        targetUserId = comment?.userId || null;

        // Update content to show removal
        await prisma.comment.update({
          where: { id: targetId },
          data: {
            content: '[Comment removed by moderator]',
          },
        });
        break;
      }

      case 'REEL': {
        const reel = await prisma.reel.findUnique({
          where: { id: targetId },
          select: { userId: true },
        });
        targetUserId = reel?.userId || null;

        // Soft-delete by archiving
        await prisma.reel.update({
          where: { id: targetId },
          data: {
            isArchived: true,
            archivedAt: new Date(),
          },
        });
        break;
      }

      case 'STORY': {
        const story = await prisma.story.findUnique({
          where: { id: targetId },
          select: { userId: true },
        });
        targetUserId = story?.userId || null;

        // Expire the story immediately
        await prisma.story.update({
          where: { id: targetId },
          data: {
            expiresAt: new Date(), // Set expiry to now
          },
        });
        break;
      }

      case 'USER':
        throw new Error('Cannot remove user content directly. Use suspendUser or banUser.');

      default:
        throw new Error(`Unknown target type: ${targetType}`);
    }

    // Log the moderation action
    await prisma.moderationLog.create({
      data: {
        moderatorId,
        action: 'REMOVE_CONTENT',
        targetType: targetType.toUpperCase(),
        targetId,
        reason,
        metadata: JSON.stringify({ contentOwnerId: targetUserId }),
        appealable: true,
      },
    });

    // Notify the content owner
    if (targetUserId) {
      await prisma.notification.create({
        data: {
          userId: targetUserId,
          type: 'MENTION',
          content: `Your ${targetType.toLowerCase()} has been removed for violating community guidelines. Reason: ${reason}`,
        },
      });
    }

    logger.info(`Content removed: ${targetType} ${targetId} by moderator ${moderatorId}`);

    return { success: true, targetUserId };
  } catch (error) {
    logger.error('Failed to remove content:', error);
    throw error;
  }
};

/**
 * Temporarily suspend a user account
 */
export const suspendUser = async (
  userId: string,
  durationHours: number,
  reason: string,
  moderatorId: string,
  automated: boolean = false
): Promise<{ success: boolean; suspendedUntil: Date }> => {
  try {
    const suspendedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        isSuspended: true,
        suspendedUntil,
        suspendedReason: reason,
      },
    });

    // Invalidate active sessions
    const sessionResult = await prisma.session.deleteMany({
      where: { userId },
    }).catch(() => ({ count: 0 })); // Sessions table might not exist

    // Create notification
    await prisma.notification.create({
      data: {
        userId,
        type: 'MENTION',
        content: `Your account has been suspended until ${suspendedUntil.toISOString()}. Reason: ${reason}`,
      },
    });

    // Log the action
    await prisma.moderationLog.create({
      data: {
        moderatorId,
        action: 'SUSPEND_USER',
        targetType: 'USER',
        targetId: userId,
        reason,
        metadata: JSON.stringify({
          durationHours,
          suspendedUntil: suspendedUntil.toISOString(),
          sessionsInvalidated: sessionResult.count,
          automated,
        }),
        automated,
        appealable: true,
      },
    });

    logger.info(`User ${userId} suspended until ${suspendedUntil.toISOString()} by ${automated ? 'system' : `moderator ${moderatorId}`}: ${reason}`);

    // Emit real-time event
    try {
      if (global.io) {
        global.io.to(`user:${userId}`).emit('moderation:suspended', {
          reason,
          suspendedUntil: suspendedUntil.toISOString(),
        });
      }
    } catch (wsError) {
      // WebSocket not critical
    }

    return { success: true, suspendedUntil };
  } catch (error) {
    logger.error('Failed to suspend user:', error);
    throw new Error('Failed to suspend user');
  }
};

/**
 * Permanently ban a user with content removal
 */
export const banUser = async (
  userId: string,
  reason: string,
  moderatorId: string
): Promise<{ success: boolean; contentRemoved: number }> => {
  try {
    // Ban the user
    await prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: true,
        bannedAt: new Date(),
        bannedReason: reason,
        isSuspended: false,
        suspendedUntil: null,
        suspendedReason: null,
      },
    });

    // Invalidate all sessions
    const sessionResult = await prisma.session.deleteMany({
      where: { userId },
    }).catch(() => ({ count: 0 }));

    // Soft-delete all user content (archive posts and reels)
    let contentRemoved = 0;

    const postsArchived = await prisma.post.updateMany({
      where: { userId, isArchived: false },
      data: {
        isArchived: true,
        archivedAt: new Date(),
      },
    });
    contentRemoved += postsArchived.count;

    const reelsArchived = await prisma.reel.updateMany({
      where: { userId, isArchived: false },
      data: {
        isArchived: true,
        archivedAt: new Date(),
      },
    });
    contentRemoved += reelsArchived.count;

    // Expire all active stories
    const storiesExpired = await prisma.story.updateMany({
      where: { userId, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
    contentRemoved += storiesExpired.count;

    // Log the moderation action
    await prisma.moderationLog.create({
      data: {
        moderatorId,
        action: 'BAN_USER',
        targetType: 'USER',
        targetId: userId,
        reason,
        metadata: JSON.stringify({
          sessionsInvalidated: sessionResult.count,
          postsArchived: postsArchived.count,
          reelsArchived: reelsArchived.count,
          storiesExpired: storiesExpired.count,
          totalContentRemoved: contentRemoved,
        }),
        appealable: true,
      },
    });

    // Send final notification (they may not see it, but it's for the record)
    await prisma.notification.create({
      data: {
        userId,
        type: 'MENTION',
        content: `Your account has been permanently banned. Reason: ${reason}. You may submit an appeal if you believe this is a mistake.`,
      },
    });

    logger.info(`User ${userId} banned by moderator ${moderatorId}: ${reason}. ${contentRemoved} content items removed.`);

    return { success: true, contentRemoved };
  } catch (error) {
    logger.error('Failed to ban user:', error);
    throw new Error('Failed to ban user');
  }
};

/**
 * Allow a user to appeal a moderation action
 */
export const appealAction = async (
  userId: string,
  moderationLogId: string,
  appealText: string
): Promise<{ success: boolean; appealId: string }> => {
  try {
    // Verify the moderation log exists and is appealable
    const moderationLog = await prisma.moderationLog.findUnique({
      where: { id: moderationLogId },
    });

    if (!moderationLog) {
      throw new Error('Moderation action not found');
    }

    if (!moderationLog.appealable) {
      throw new Error('This action cannot be appealed');
    }

    // Check that the user is the target of this action
    if (moderationLog.targetType === 'USER' && moderationLog.targetId !== userId) {
      throw new Error('You can only appeal actions against your own account');
    }

    // Check for existing pending appeal
    const existingAppeal = await prisma.moderationAppeal.findFirst({
      where: {
        userId,
        moderationLogId,
        status: 'PENDING',
      },
    });

    if (existingAppeal) {
      throw new Error('You already have a pending appeal for this action');
    }

    // Create the appeal
    const appeal = await prisma.moderationAppeal.create({
      data: {
        userId,
        moderationLogId,
        appealText,
      },
    });

    // Log the appeal
    await prisma.moderationLog.create({
      data: {
        moderatorId: userId, // User themselves
        action: 'APPEAL_SUBMITTED',
        targetType: 'MODERATION_LOG',
        targetId: moderationLogId,
        reason: appealText.substring(0, 200),
        metadata: JSON.stringify({ appealId: appeal.id }),
        appealable: false,
      },
    });

    // Notify all admins about the appeal
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'MENTION',
            content: `New moderation appeal submitted for action: ${moderationLog.action}`,
          },
        })
      )
    );

    logger.info(`Appeal submitted by user ${userId} for moderation action ${moderationLogId}`);

    return { success: true, appealId: appeal.id };
  } catch (error: any) {
    logger.error('Failed to submit appeal:', error);
    throw error;
  }
};

/**
 * Review an appeal (admin action)
 */
export const reviewAppeal = async (
  appealId: string,
  decision: 'APPROVED' | 'DENIED',
  moderatorId: string,
  reviewNotes?: string
): Promise<{ success: boolean }> => {
  try {
    const appeal = await prisma.moderationAppeal.findUnique({
      where: { id: appealId },
    });

    if (!appeal) {
      throw new Error('Appeal not found');
    }

    if (appeal.status !== 'PENDING') {
      throw new Error('Appeal has already been reviewed');
    }

    // Update appeal status
    await prisma.moderationAppeal.update({
      where: { id: appealId },
      data: {
        status: decision,
        reviewedBy: moderatorId,
        reviewedAt: new Date(),
        reviewNotes,
      },
    });

    // If approved, reverse the original action
    if (decision === 'APPROVED') {
      const originalAction = await prisma.moderationLog.findUnique({
        where: { id: appeal.moderationLogId },
      });

      if (originalAction) {
        await reverseAction(originalAction, moderatorId);
      }
    }

    // Notify the user about the decision
    await prisma.notification.create({
      data: {
        userId: appeal.userId,
        type: 'MENTION',
        content: `Your moderation appeal has been ${decision.toLowerCase()}. ${reviewNotes ? `Notes: ${reviewNotes}` : ''}`,
      },
    });

    // Log the review
    await prisma.moderationLog.create({
      data: {
        moderatorId,
        action: `APPEAL_${decision}`,
        targetType: 'APPEAL',
        targetId: appealId,
        reason: reviewNotes || `Appeal ${decision.toLowerCase()}`,
        metadata: JSON.stringify({
          originalActionId: appeal.moderationLogId,
          userId: appeal.userId,
        }),
        appealable: false,
      },
    });

    logger.info(`Appeal ${appealId} ${decision} by moderator ${moderatorId}`);

    return { success: true };
  } catch (error) {
    logger.error('Failed to review appeal:', error);
    throw error;
  }
};

/**
 * Reverse a moderation action (used when appeal is approved)
 */
async function reverseAction(action: any, moderatorId: string): Promise<void> {
  switch (action.action) {
    case 'BAN_USER':
      await prisma.user.update({
        where: { id: action.targetId },
        data: {
          isBanned: false,
          bannedAt: null,
          bannedReason: null,
        },
      });
      // Unarchive content
      await prisma.post.updateMany({
        where: { userId: action.targetId, isArchived: true },
        data: { isArchived: false, archivedAt: null },
      });
      await prisma.reel.updateMany({
        where: { userId: action.targetId, isArchived: true },
        data: { isArchived: false, archivedAt: null },
      });
      break;

    case 'SUSPEND_USER':
      await prisma.user.update({
        where: { id: action.targetId },
        data: {
          isSuspended: false,
          suspendedUntil: null,
          suspendedReason: null,
        },
      });
      break;

    case 'REMOVE_CONTENT':
      if (action.targetType === 'POST') {
        await prisma.post.update({
          where: { id: action.targetId },
          data: { isArchived: false, archivedAt: null },
        }).catch(() => {}); // May have been deleted
      } else if (action.targetType === 'REEL') {
        await prisma.reel.update({
          where: { id: action.targetId },
          data: { isArchived: false, archivedAt: null },
        }).catch(() => {});
      }
      break;

    case 'WARN_USER':
      await prisma.user.update({
        where: { id: action.targetId },
        data: { warningCount: { decrement: 1 } },
      });
      break;

    default:
      logger.warn(`Cannot reverse action type: ${action.action}`);
  }

  logger.info(`Reversed moderation action ${action.id} (${action.action}) by moderator ${moderatorId}`);
}

/**
 * Check and lift expired suspensions
 * Should be called periodically (e.g., via cron job)
 */
export const liftExpiredSuspensions = async (): Promise<number> => {
  try {
    const result = await prisma.user.updateMany({
      where: {
        isSuspended: true,
        suspendedUntil: { lte: new Date() },
      },
      data: {
        isSuspended: false,
        suspendedUntil: null,
        suspendedReason: null,
      },
    });

    if (result.count > 0) {
      logger.info(`Lifted ${result.count} expired user suspensions`);
    }

    return result.count;
  } catch (error) {
    logger.error('Failed to lift expired suspensions:', error);
    return 0;
  }
};

/**
 * Auto-escalate reports when a target receives 3+ reports
 */
export const checkAndEscalateReports = async (
  targetType: string,
  targetId: string
): Promise<boolean> => {
  try {
    const reportCount = await prisma.report.count({
      where: {
        targetType: targetType as ReportTargetType,
        targetId,
        status: { in: ['PENDING', 'REVIEWING'] },
      },
    });

    if (reportCount >= 3) {
      // Mark all reports for this target as escalated
      await prisma.report.updateMany({
        where: {
          targetType: targetType as ReportTargetType,
          targetId,
          escalated: false,
        },
        data: {
          escalated: true,
          priority: reportCount, // Priority based on report count
        },
      });

      // Notify admins/moderators about the escalation
      const moderators = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'] } },
        select: { id: true },
      });

      await Promise.all(
        moderators.map((mod) =>
          prisma.notification.create({
            data: {
              userId: mod.id,
              type: 'MENTION',
              content: `Escalated: ${targetType} has received ${reportCount} reports and requires immediate review.`,
            },
          })
        )
      );

      logger.warn(`Auto-escalated: ${targetType} ${targetId} with ${reportCount} reports`);

      // Emit real-time event for moderation dashboard
      try {
        if (global.io) {
          global.io.emit('moderation:escalation', {
            targetType,
            targetId,
            reportCount,
          });
        }
      } catch (wsError) {
        // WebSocket not critical
      }

      return true;
    }

    return false;
  } catch (error) {
    logger.error('Failed to check/escalate reports:', error);
    return false;
  }
};
