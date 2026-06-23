import { detectNSFW } from './nsfwDetectionService';
import { detectHateSpeech } from './hateSpeechDetectionService';
import { detectSpam } from './spamDetectionService';
import { detectFakeAccount } from './fakeAccountDetectionService';
import { detectBot } from './botPreventionService';
import { classifyContent } from './contentClassificationService';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { ReportTargetType, ReportReason } from '@prisma/client';

export interface ModerationResult {
  approved: boolean;
  flags: string[];
  scores: {
    nsfw?: number;
    hateSpeech?: number;
    spam?: number;
    bot?: number;
    fake?: number;
  };
  category?: string;
  tags?: string[];
  action: 'approve' | 'review' | 'reject' | 'flag';
  autoRemoved?: boolean;
  autoFlagged?: boolean;
}

// Thresholds for auto-moderation
const AUTO_FLAG_THRESHOLD = 0.5;   // Flag content for review
const AUTO_REMOVE_THRESHOLD = 0.85; // Auto-remove content (high confidence)

export const moderateContent = async (
  content: string,
  userId: string,
  imageBuffer?: Buffer
): Promise<ModerationResult> => {
  const flags: string[] = [];
  const scores: any = {};

  // Text moderation
  const hateSpeech = detectHateSpeech(content);
  if (hateSpeech.isHateSpeech) {
    flags.push('hate_speech');
    scores.hateSpeech = hateSpeech.score;
  }

  const spam = await detectSpam(content, userId);
  if (spam.isSpam) {
    flags.push('spam');
    scores.spam = spam.score;
  }

  // Image moderation
  if (imageBuffer) {
    const nsfw = await detectNSFW(imageBuffer);
    if (nsfw.isNSFW) {
      flags.push('nsfw');
      scores.nsfw = nsfw.predictions.find((p: any) =>
        ['Porn', 'Hentai', 'Sexy'].includes(p.className)
      )?.probability || 0;
    }
  }

  // User behavior checks
  const bot = await detectBot(userId);
  if (bot.isBot) {
    flags.push('bot');
    scores.bot = bot.score;
  }

  const fake = await detectFakeAccount(userId);
  if (fake.isFake) {
    flags.push('fake_account');
    scores.fake = fake.score;
  }

  // Content classification
  const classification = classifyContent(content);

  // Determine action
  let action: 'approve' | 'review' | 'reject' | 'flag' = 'approve';

  if (flags.includes('nsfw') || flags.includes('hate_speech')) {
    action = 'reject';
  } else if (flags.includes('spam') || flags.includes('bot')) {
    action = 'review';
  } else if (flags.includes('fake_account')) {
    action = 'flag';
  }

  // Log moderation result
  await prisma.moderationLog.create({
    data: {
      moderatorId: userId,
      targetType: 'content',
      targetId: userId,
      action,
      reason: flags.join(','),
      automated: true,
      metadata: JSON.stringify({ scores, flags }),
    }
  }).catch(() => {}); // Ignore if table doesn't exist yet

  return {
    approved: action === 'approve',
    flags,
    scores,
    category: classification.category,
    tags: classification.tags,
    action
  };
};

export const moderateUser = async (userId: string): Promise<ModerationResult> => {
  const flags: string[] = [];
  const scores: any = {};

  const fake = await detectFakeAccount(userId);
  if (fake.isFake) {
    flags.push('fake_account');
    scores.fake = fake.score;
  }

  const bot = await detectBot(userId);
  if (bot.isBot) {
    flags.push('bot');
    scores.bot = bot.score;
  }

  let action: 'approve' | 'review' | 'reject' | 'flag' = 'approve';

  if (bot.score > 0.8 || fake.score > 0.8) {
    action = 'reject';
  } else if (flags.length > 0) {
    action = 'review';
  }

  return {
    approved: action === 'approve',
    flags,
    scores,
    action
  };
};

// ============================================================================
// AUTO-MODERATION PIPELINE
// ============================================================================

/**
 * Run the full auto-moderation pipeline on new content.
 * Called after post/comment/reel creation.
 *
 * - Scans text for hate speech and spam
 * - Scans images for NSFW content
 * - Auto-flags content above threshold
 * - Auto-removes content above high-confidence threshold
 * - Creates a Report if flagged/removed
 */
export const runAutoModerationPipeline = async (
  targetType: 'POST' | 'COMMENT' | 'REEL' | 'STORY',
  targetId: string,
  userId: string,
  textContent: string,
  imageBuffer?: Buffer
): Promise<ModerationResult> => {
  try {
    const flags: string[] = [];
    const scores: any = {};
    const reasons: string[] = [];

    // --- Text Analysis ---
    if (textContent && textContent.trim().length > 0) {
      // Hate speech detection
      const hateSpeechResult = detectHateSpeech(textContent);
      scores.hateSpeech = hateSpeechResult.score;
      if (hateSpeechResult.score >= AUTO_FLAG_THRESHOLD) {
        flags.push('hate_speech');
        reasons.push(...hateSpeechResult.reasons);
      }

      // Spam detection
      const spamResult = await detectSpam(textContent, userId);
      scores.spam = spamResult.score;
      if (spamResult.score >= AUTO_FLAG_THRESHOLD) {
        flags.push('spam');
        reasons.push(...spamResult.reasons);
      }
    }

    // --- Image Analysis ---
    if (imageBuffer) {
      try {
        const nsfwResult = await detectNSFW(imageBuffer);
        const nsfwScore = nsfwResult.predictions.find((p: any) =>
          ['Porn', 'Hentai', 'Sexy'].includes(p.className)
        )?.probability || 0;
        scores.nsfw = nsfwScore;
        if (nsfwScore >= AUTO_FLAG_THRESHOLD) {
          flags.push('nsfw');
          reasons.push(`NSFW content detected (score: ${nsfwScore.toFixed(2)})`);
        }
      } catch (nsfwError) {
        logger.warn('NSFW detection failed during auto-moderation, skipping:', nsfwError);
      }
    }

    // --- Content Classification ---
    let category: string | undefined;
    let tags: string[] | undefined;
    if (textContent) {
      const classification = classifyContent(textContent);
      category = classification.category;
      tags = classification.tags;
    }

    // --- Determine Action ---
    let action: 'approve' | 'review' | 'reject' | 'flag' = 'approve';
    let autoRemoved = false;
    let autoFlagged = false;

    // Check for high-confidence violations (auto-remove)
    const maxScore = Math.max(
      scores.hateSpeech || 0,
      scores.nsfw || 0,
      scores.spam || 0
    );

    if (maxScore >= AUTO_REMOVE_THRESHOLD) {
      action = 'reject';
      autoRemoved = true;
    } else if (flags.length > 0) {
      action = 'flag';
      autoFlagged = true;
    }

    // --- Execute Auto-Actions ---
    if (autoRemoved || autoFlagged) {
      // Determine the primary reason for the report
      let reportReason: ReportReason = 'OTHER';
      if (flags.includes('hate_speech')) reportReason = 'HARASSMENT';
      else if (flags.includes('nsfw')) reportReason = 'INAPPROPRIATE';
      else if (flags.includes('spam')) reportReason = 'SPAM';

      // Create an auto-generated report
      await prisma.report.create({
        data: {
          reporterId: userId, // Self-referential for auto-detection
          targetType: targetType as ReportTargetType,
          targetId,
          reason: reportReason,
          description: `Auto-moderation: ${reasons.join('; ')}`,
          status: autoRemoved ? 'RESOLVED' : 'PENDING',
          priority: autoRemoved ? 10 : Math.ceil(maxScore * 5),
          escalated: autoRemoved,
          autoFlagged: true,
          resolvedAt: autoRemoved ? new Date() : null,
          resolvedBy: autoRemoved ? 'SYSTEM' : null,
          resolution: autoRemoved ? `Auto-removed: ${reasons.join('; ')}` : null,
        },
      }).catch((err) => {
        logger.warn('Failed to create auto-moderation report:', err);
      });

      // Auto-remove high-confidence content
      if (autoRemoved) {
        await autoRemoveContent(targetType, targetId, reasons.join('; '));
      }

      // Log the moderation action
      await prisma.moderationLog.create({
        data: {
          moderatorId: 'SYSTEM',
          action: autoRemoved ? 'AUTO_REMOVE' : 'AUTO_FLAG',
          targetType,
          targetId,
          reason: reasons.join('; '),
          metadata: JSON.stringify({ scores, flags, maxScore }),
          automated: true,
          appealable: true,
        },
      }).catch((err) => {
        logger.warn('Failed to log auto-moderation action:', err);
      });

      // Notify moderators about flagged content
      if (autoFlagged) {
        notifyModeratorsOfFlag(targetType, targetId, flags, scores).catch((err) => {
          logger.warn('Failed to notify moderators:', err);
        });
      }

      logger.info(
        `Auto-moderation: ${targetType} ${targetId} ${autoRemoved ? 'REMOVED' : 'FLAGGED'} ` +
        `(scores: ${JSON.stringify(scores)}, flags: ${flags.join(',')})`
      );
    }

    return {
      approved: action === 'approve',
      flags,
      scores,
      category,
      tags,
      action,
      autoRemoved,
      autoFlagged,
    };
  } catch (error) {
    logger.error('Auto-moderation pipeline error:', error);
    // On error, approve content and log the failure
    // We don't want auto-moderation failures to block content creation
    return {
      approved: true,
      flags: [],
      scores: {},
      action: 'approve',
      autoRemoved: false,
      autoFlagged: false,
    };
  }
};

/**
 * Auto-remove content by archiving/soft-deleting
 */
async function autoRemoveContent(
  targetType: string,
  targetId: string,
  reason: string
): Promise<void> {
  try {
    switch (targetType) {
      case 'POST':
        await prisma.post.update({
          where: { id: targetId },
          data: {
            isArchived: true,
            archivedAt: new Date(),
            content: '[Content auto-removed by moderation system]',
          },
        });
        break;

      case 'COMMENT':
        await prisma.comment.update({
          where: { id: targetId },
          data: {
            content: '[Comment auto-removed by moderation system]',
          },
        });
        break;

      case 'REEL':
        await prisma.reel.update({
          where: { id: targetId },
          data: {
            isArchived: true,
            archivedAt: new Date(),
          },
        });
        break;

      case 'STORY':
        await prisma.story.update({
          where: { id: targetId },
          data: {
            expiresAt: new Date(),
          },
        });
        break;
    }

    // Notify the content owner
    const ownerId = await getContentOwnerId(targetType, targetId);
    if (ownerId) {
      await prisma.notification.create({
        data: {
          userId: ownerId,
          type: 'MENTION',
          content: `Your ${targetType.toLowerCase()} was automatically removed for violating community guidelines. Reason: ${reason}. You may appeal this decision.`,
        },
      }).catch(() => {});
    }
  } catch (error) {
    logger.error(`Failed to auto-remove ${targetType} ${targetId}:`, error);
  }
}

/**
 * Get the owner user ID of a piece of content
 */
async function getContentOwnerId(targetType: string, targetId: string): Promise<string | null> {
  try {
    switch (targetType) {
      case 'POST': {
        const post = await prisma.post.findUnique({
          where: { id: targetId },
          select: { userId: true },
        });
        return post?.userId || null;
      }
      case 'COMMENT': {
        const comment = await prisma.comment.findUnique({
          where: { id: targetId },
          select: { userId: true },
        });
        return comment?.userId || null;
      }
      case 'REEL': {
        const reel = await prisma.reel.findUnique({
          where: { id: targetId },
          select: { userId: true },
        });
        return reel?.userId || null;
      }
      case 'STORY': {
        const story = await prisma.story.findUnique({
          where: { id: targetId },
          select: { userId: true },
        });
        return story?.userId || null;
      }
      default:
        return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Notify moderators about flagged content via notifications and WebSocket
 */
async function notifyModeratorsOfFlag(
  targetType: string,
  targetId: string,
  flags: string[],
  scores: Record<string, number>
): Promise<void> {
  // Get all moderators and admins
  const moderators = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'] } },
    select: { id: true },
  });

  // Create notifications for each moderator
  await Promise.all(
    moderators.map((mod) =>
      prisma.notification.create({
        data: {
          userId: mod.id,
          type: 'MENTION',
          content: `Auto-flagged ${targetType.toLowerCase()}: ${flags.join(', ')}. Review required.`,
        },
      })
    )
  );

  // Emit real-time WebSocket event for moderation dashboard
  try {
    if (global.io) {
      global.io.emit('moderation:autoFlag', {
        targetType,
        targetId,
        flags,
        scores,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (wsError) {
    // WebSocket not critical
  }
}
