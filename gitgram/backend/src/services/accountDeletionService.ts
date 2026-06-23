import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { sendEmail } from './emailService';

const GRACE_PERIOD_DAYS = 30;

export interface DeletionScheduleResult {
  scheduledAt: Date;
  deletionDate: Date;
  message: string;
}

export interface AccountDeletionStatus {
  isScheduled: boolean;
  scheduledAt?: Date;
  deletionDate?: Date;
  canReactivate: boolean;
}

/**
 * Schedule account for deletion with 30-day grace period
 */
export async function scheduleAccountDeletion(
  userId: string,
  reason?: string
): Promise<DeletionScheduleResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const scheduledAt = new Date();
    const deletionDate = new Date(scheduledAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Store deletion schedule in metadata (we'll use a separate model or JSON field)
    // For now, we'll create a moderation log entry to track this
    await prisma.moderationLog.create({
      data: {
        moderatorId: userId, // Self-moderation
        action: 'ACCOUNT_DELETION_SCHEDULED',
        targetType: 'USER',
        targetId: userId,
        reason: reason || 'User requested account deletion',
      },
    });

    // Update user to mark as pending deletion
    // We'll add this to the user metadata in future schema update
    // For now, use a convention with bio field or separate tracking

    // Send confirmation email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Your Gitgram Account Deletion Request',
        html: `
          <h2>Account Deletion Scheduled</h2>
          <p>Hi ${user.username || 'there'},</p>
          <p>We've received your request to delete your Gitgram account.</p>
          <p><strong>Your account will be permanently deleted on ${deletionDate.toLocaleDateString()}.</strong></p>
          <p>During the next ${GRACE_PERIOD_DAYS} days:</p>
          <ul>
            <li>Your profile will be hidden from other users</li>
            <li>Your data will be preserved in case you change your mind</li>
            <li>You can cancel the deletion by logging in and visiting Settings > Account</li>
          </ul>
          <p>If you didn't request this, please <a href="${process.env.FRONTEND_URL}/login">log in to your account</a> immediately to cancel the deletion.</p>
          <p>Before deletion, you can <a href="${process.env.FRONTEND_URL}/settings/account/export">download your data</a>.</p>
          <p>We're sorry to see you go!</p>
          <p>- The Gitgram Team</p>
        `,
      });
    } catch (emailError) {
      logger.error('Failed to send deletion confirmation email:', emailError);
    }

    logger.info(`Account deletion scheduled for user ${userId}, deletion date: ${deletionDate}`);

    return {
      scheduledAt,
      deletionDate,
      message: `Your account is scheduled for deletion on ${deletionDate.toLocaleDateString()}. You can cancel this within ${GRACE_PERIOD_DAYS} days.`,
    };
  } catch (error) {
    logger.error('Schedule account deletion error:', error);
    throw error;
  }
}

/**
 * Cancel a scheduled account deletion
 */
export async function cancelAccountDeletion(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Find and delete the deletion schedule
    const deletionLog = await prisma.moderationLog.findFirst({
      where: {
        targetType: 'USER',
        targetId: userId,
        action: 'ACCOUNT_DELETION_SCHEDULED',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!deletionLog) {
      throw new Error('No scheduled deletion found for this account');
    }

    // Create cancellation log
    await prisma.moderationLog.create({
      data: {
        moderatorId: userId,
        action: 'ACCOUNT_DELETION_CANCELLED',
        targetType: 'USER',
        targetId: userId,
        reason: 'User cancelled account deletion',
      },
    });

    // Send confirmation email
    try {
      await sendEmail({
        to: user.email,
        subject: 'Gitgram Account Deletion Cancelled',
        html: `
          <h2>Account Deletion Cancelled</h2>
          <p>Hi ${user.username || 'there'},</p>
          <p>Your account deletion request has been successfully cancelled.</p>
          <p>Your Gitgram account is now fully active again.</p>
          <p>If you didn't cancel this request, please <a href="${process.env.FRONTEND_URL}/settings/security">review your security settings</a>.</p>
          <p>Welcome back!</p>
          <p>- The Gitgram Team</p>
        `,
      });
    } catch (emailError) {
      logger.error('Failed to send deletion cancelled email:', emailError);
    }

    logger.info(`Account deletion cancelled for user ${userId}`);

    return {
      success: true,
      message: 'Account deletion has been cancelled. Your account is now active.',
    };
  } catch (error) {
    logger.error('Cancel account deletion error:', error);
    throw error;
  }
}

/**
 * Get account deletion status
 */
export async function getAccountDeletionStatus(userId: string): Promise<AccountDeletionStatus> {
  try {
    // Check for scheduled deletion
    const deletionLog = await prisma.moderationLog.findFirst({
      where: {
        targetType: 'USER',
        targetId: userId,
        action: 'ACCOUNT_DELETION_SCHEDULED',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!deletionLog) {
      return {
        isScheduled: false,
        canReactivate: false,
      };
    }

    // Check if it was cancelled after being scheduled
    const cancellationLog = await prisma.moderationLog.findFirst({
      where: {
        targetType: 'USER',
        targetId: userId,
        action: 'ACCOUNT_DELETION_CANCELLED',
        createdAt: { gt: deletionLog.createdAt },
      },
    });

    if (cancellationLog) {
      return {
        isScheduled: false,
        canReactivate: false,
      };
    }

    const deletionDate = new Date(deletionLog.createdAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date();

    return {
      isScheduled: true,
      scheduledAt: deletionLog.createdAt,
      deletionDate,
      canReactivate: now < deletionDate,
    };
  } catch (error) {
    logger.error('Get account deletion status error:', error);
    throw error;
  }
}

/**
 * Permanently delete account and all associated data
 * This should be called by a scheduled job after grace period
 */
export async function permanentlyDeleteAccount(userId: string): Promise<{ success: boolean }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if deletion is still scheduled (not cancelled)
    const status = await getAccountDeletionStatus(userId);
    if (!status.isScheduled) {
      throw new Error('Account deletion was cancelled');
    }

    if (status.deletionDate && new Date() < status.deletionDate) {
      throw new Error('Grace period has not ended yet');
    }

    // Delete all user data in a transaction
    await prisma.$transaction([
      // Delete sessions
      prisma.session.deleteMany({ where: { userId } }),
      // Delete notifications
      prisma.notification.deleteMany({ where: { userId } }),
      // Delete linked accounts
      prisma.linkedAccount.deleteMany({ where: { userId } }),
      // Delete preferences
      prisma.notificationPreferences.deleteMany({ where: { userId } }),
      // Delete push devices
      prisma.pushDevice.deleteMany({ where: { userId } }),
      // Delete likes
      prisma.like.deleteMany({ where: { userId } }),
      // Delete comments
      prisma.comment.deleteMany({ where: { userId } }),
      // Delete posts
      prisma.post.deleteMany({ where: { userId } }),
      // Delete stories
      prisma.story.deleteMany({ where: { userId } }),
      // Delete reels
      prisma.reel.deleteMany({ where: { userId } }),
      // Delete follows
      prisma.follow.deleteMany({
        where: {
          OR: [{ followerUserId: userId }, { followingUserId: userId }],
        },
      }),
      // Delete account
      prisma.account.deleteMany({ where: { userId } }),
      // Finally delete user
      prisma.user.delete({ where: { id: userId } }),
    ]);

    logger.info(`Account permanently deleted for user ${userId}`);

    return { success: true };
  } catch (error) {
    logger.error('Permanently delete account error:', error);
    throw error;
  }
}

/**
 * Job to process scheduled deletions
 * This should be called by a cron job daily
 */
export async function processScheduledDeletions(): Promise<{ processed: number; deleted: number }> {
  try {
    // Find all accounts scheduled for deletion where grace period has passed
    const cutoffDate = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const scheduledDeletions = await prisma.moderationLog.findMany({
      where: {
        action: 'ACCOUNT_DELETION_SCHEDULED',
        createdAt: { lte: cutoffDate },
      },
    });

    let processed = 0;
    let deleted = 0;

    for (const log of scheduledDeletions) {
      processed++;

      try {
        // Check if not cancelled
        const status = await getAccountDeletionStatus(log.targetId);
        if (status.isScheduled && status.deletionDate && new Date() >= status.deletionDate) {
          await permanentlyDeleteAccount(log.targetId);
          deleted++;
        }
      } catch (err) {
        logger.error(`Failed to process deletion for user ${log.targetId}:`, err);
      }
    }

    logger.info(`Processed ${processed} scheduled deletions, ${deleted} accounts deleted`);

    return { processed, deleted };
  } catch (error) {
    logger.error('Process scheduled deletions error:', error);
    throw error;
  }
}

export default {
  scheduleAccountDeletion,
  cancelAccountDeletion,
  getAccountDeletionStatus,
  permanentlyDeleteAccount,
  processScheduledDeletions,
};
