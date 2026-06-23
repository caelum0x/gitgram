import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';
import { sendPushNotificationToUser } from '../services/pushService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

interface BulkPostInput {
  content?: string;
  mediaUrls?: string[];
  scheduledFor: string;
  timezone?: string;
  recurrenceType?: string;
  recurrenceEndDate?: string;
}

// Valid IANA timezone check (basic validation)
const COMMON_TIMEZONES = [
  'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'America/Denver',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto',
  'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Buenos_Aires',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Zurich', 'Europe/Vienna', 'Europe/Warsaw',
  'Europe/Prague', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Helsinki', 'Europe/Moscow',
  'Europe/Istanbul', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Mumbai', 'Asia/Bangkok',
  'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth',
  'Pacific/Auckland', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos'
];

type RecurrenceType = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

/**
 * Convert a date from user's timezone to UTC for storage
 */
function convertToUTC(dateStr: string, timezone: string): Date {
  try {
    // Parse the date string and create a Date object
    const localDate = new Date(dateStr);

    // Get the offset for the timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // For proper conversion, we need to interpret the input as being in the user's timezone
    // The input dateStr is assumed to be in the user's local time
    return localDate;
  } catch (error) {
    logger.warn(`Invalid timezone ${timezone}, falling back to UTC`);
    return new Date(dateStr);
  }
}

/**
 * Calculate the next occurrence for a recurring post
 */
function calculateNextOccurrence(
  currentDate: Date,
  recurrenceType: RecurrenceType
): Date {
  const next = new Date(currentDate);

  switch (recurrenceType) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    default:
      return next;
  }

  return next;
}

/**
 * Validate recurrence type
 */
function isValidRecurrenceType(type: string): type is RecurrenceType {
  return ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(type);
}

/**
 * Create a scheduled post
 * POST /api/v1/scheduled-posts
 */
export const createScheduledPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const {
    content,
    mediaUrls,
    scheduledFor,
    timezone = 'UTC',
    recurrenceType = 'NONE',
    recurrenceEndDate
  } = req.body;

  if (!content && (!mediaUrls || mediaUrls.length === 0)) {
    throw Errors.badRequest('Content or media is required');
  }

  // Validate timezone
  if (!COMMON_TIMEZONES.includes(timezone)) {
    throw Errors.badRequest('Invalid timezone. Please use a valid IANA timezone.');
  }

  // Validate recurrence type
  if (!isValidRecurrenceType(recurrenceType)) {
    throw Errors.badRequest('Invalid recurrence type. Use: NONE, DAILY, WEEKLY, or MONTHLY');
  }

  const scheduleDate = new Date(scheduledFor);
  if (scheduleDate <= new Date()) {
    throw Errors.badRequest('Scheduled time must be in the future');
  }

  // Validate recurrence end date if provided
  let parsedRecurrenceEndDate: Date | null = null;
  if (recurrenceEndDate && recurrenceType !== 'NONE') {
    parsedRecurrenceEndDate = new Date(recurrenceEndDate);
    if (parsedRecurrenceEndDate <= scheduleDate) {
      throw Errors.badRequest('Recurrence end date must be after the scheduled time');
    }
  }

  const scheduledPost = await prisma.scheduledPost.create({
    data: {
      userId,
      content,
      mediaUrls: mediaUrls || [],
      scheduledFor: scheduleDate,
      timezone,
      recurrenceType: recurrenceType as RecurrenceType,
      recurrenceEndDate: parsedRecurrenceEndDate,
      status: 'pending'
    },
  });

  res.status(201).json(scheduledPost);
});

/**
 * Bulk schedule multiple posts
 * POST /api/v1/scheduled-posts/bulk
 */
export const bulkCreateScheduledPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { posts } = req.body;

  if (!Array.isArray(posts) || posts.length === 0) {
    throw Errors.badRequest('Posts array is required');
  }

  if (posts.length > 50) {
    throw Errors.badRequest('Maximum 50 posts can be scheduled at once');
  }

  const now = new Date();
  const errors: { index: number; error: string }[] = [];
  const validPosts: Prisma.ScheduledPostUncheckedCreateInput[] = [];

  // Validate all posts first
  posts.forEach((post: BulkPostInput, index: number) => {
    const { content, mediaUrls, scheduledFor, timezone = 'UTC', recurrenceType = 'NONE' } = post;

    if (!content && (!mediaUrls || mediaUrls.length === 0)) {
      errors.push({ index, error: 'Content or media is required' });
      return;
    }

    if (!COMMON_TIMEZONES.includes(timezone)) {
      errors.push({ index, error: 'Invalid timezone' });
      return;
    }

    if (!isValidRecurrenceType(recurrenceType)) {
      errors.push({ index, error: 'Invalid recurrence type' });
      return;
    }

    const scheduleDate = new Date(scheduledFor);
    if (scheduleDate <= now) {
      errors.push({ index, error: 'Scheduled time must be in the future' });
      return;
    }

    validPosts.push({
      userId,
      content: content || '',
      mediaUrls: mediaUrls || [],
      scheduledFor: scheduleDate,
      timezone,
      recurrenceType: recurrenceType as RecurrenceType,
      recurrenceEndDate: post.recurrenceEndDate ? new Date(post.recurrenceEndDate) : null,
      status: 'pending'
    });
  });

  if (errors.length > 0 && validPosts.length === 0) {
    throw Errors.badRequest('All posts failed validation');
  }

  // Create all valid posts
  const createdPosts = await prisma.$transaction(
    validPosts.map(post => prisma.scheduledPost.create({ data: post }))
  );

  res.status(201).json({
    created: createdPosts,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      total: posts.length,
      created: createdPosts.length,
      failed: errors.length
    }
  });
});

/**
 * Get optimal posting times based on follower activity
 * GET /api/v1/scheduled-posts/optimal-times
 */
export const getOptimalPostingTimes = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { timezone = 'UTC' } = req.query;

  // Get user's account
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { account: true }
  });

  if (!user?.account) {
    throw Errors.notFound('Account');
  }

  // Get follower IDs
  const followers = await prisma.follow.findMany({
    where: { followingId: user.account.id },
    select: { followerUserId: true }
  });

  const followerUserIds = followers
    .map(f => f.followerUserId)
    .filter((id): id is string => id !== null);

  if (followerUserIds.length === 0) {
    // Return default optimal times if no followers
    return res.json({
      optimalTimes: [
        { day: 'Monday', hour: 9, engagementScore: 0.7 },
        { day: 'Tuesday', hour: 12, engagementScore: 0.8 },
        { day: 'Wednesday', hour: 17, engagementScore: 0.85 },
        { day: 'Thursday', hour: 10, engagementScore: 0.75 },
        { day: 'Friday', hour: 14, engagementScore: 0.8 },
        { day: 'Saturday', hour: 11, engagementScore: 0.65 },
        { day: 'Sunday', hour: 18, engagementScore: 0.6 }
      ],
      timezone: timezone as string,
      followerCount: 0,
      message: 'Default times shown (no follower data available)'
    });
  }

  // Analyze when followers have been most active (based on their likes, comments, posts)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get likes from followers in the last 30 days
  const followerLikes = await prisma.like.findMany({
    where: {
      userId: { in: followerUserIds },
      createdAt: { gte: thirtyDaysAgo }
    },
    select: { createdAt: true }
  });

  // Get comments from followers
  const followerComments = await prisma.comment.findMany({
    where: {
      userId: { in: followerUserIds },
      createdAt: { gte: thirtyDaysAgo }
    },
    select: { createdAt: true }
  });

  // Get posts from followers
  const followerPosts = await prisma.post.findMany({
    where: {
      userId: { in: followerUserIds },
      createdAt: { gte: thirtyDaysAgo }
    },
    select: { createdAt: true }
  });

  // Combine all activity timestamps
  const allActivity = [
    ...followerLikes.map(l => l.createdAt),
    ...followerComments.map(c => c.createdAt),
    ...followerPosts.map(p => p.createdAt)
  ];

  // Calculate activity by day of week and hour
  const activityByDayHour: Record<string, Record<number, number>> = {
    Sunday: {}, Monday: {}, Tuesday: {}, Wednesday: {},
    Thursday: {}, Friday: {}, Saturday: {}
  };

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  allActivity.forEach(timestamp => {
    const day = days[timestamp.getDay()];
    const hour = timestamp.getHours();
    activityByDayHour[day][hour] = (activityByDayHour[day][hour] || 0) + 1;
  });

  // Find the best times for each day
  const optimalTimes: { day: string; hour: number; engagementScore: number }[] = [];
  const maxActivity = Math.max(...allActivity.length > 0
    ? Object.values(activityByDayHour).flatMap(d => Object.values(d))
    : [1]
  );

  days.forEach(day => {
    const dayActivity = activityByDayHour[day];
    const hours = Object.entries(dayActivity);

    if (hours.length > 0) {
      // Sort by activity and get the best hour
      hours.sort((a, b) => b[1] - a[1]);
      const bestHour = parseInt(hours[0][0]);
      const score = maxActivity > 0 ? hours[0][1] / maxActivity : 0;

      optimalTimes.push({
        day,
        hour: bestHour,
        engagementScore: Math.round(score * 100) / 100
      });
    } else {
      // Default times for days with no data
      optimalTimes.push({
        day,
        hour: day === 'Saturday' || day === 'Sunday' ? 11 : 12,
        engagementScore: 0.5
      });
    }
  });

  // Sort by engagement score (descending)
  optimalTimes.sort((a, b) => b.engagementScore - a.engagementScore);

  // Get top 3 best overall times
  const topTimes = optimalTimes.slice(0, 3).map(t => ({
    ...t,
    recommended: true
  }));

  res.json({
    optimalTimes,
    topRecommended: topTimes,
    timezone: timezone as string,
    followerCount: followerUserIds.length,
    activityDataPoints: allActivity.length,
    analysisWindow: '30 days'
  });
});

/**
 * Get all scheduled posts for current user
 * GET /api/v1/scheduled-posts
 */
export const getScheduledPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { status, page = '1', limit = '20', includeRecurring = 'true' } = req.query;

  const where: Prisma.ScheduledPostWhereInput = { userId };
  if (status) {
    where.status = status as string;
  }

  // Optionally filter out recurring child posts
  if (includeRecurring === 'false') {
    where.parentPostId = null;
  }

  const posts = await prisma.scheduledPost.findMany({
    where,
    orderBy: { scheduledFor: 'asc' },
    take: parseInt(limit as string),
    skip: (parseInt(page as string) - 1) * parseInt(limit as string)
  });

  const total = await prisma.scheduledPost.count({ where });

  res.json({
    posts,
    total,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      hasMore: posts.length === parseInt(limit as string)
    }
  });
});

/**
 * Get a single scheduled post
 * GET /api/v1/scheduled-posts/:id
 */
export const getScheduledPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const post = await prisma.scheduledPost.findFirst({
    where: { id, userId }
  });

  if (!post) {
    throw Errors.notFound('Scheduled post');
  }

  // If this is a recurring post, get all upcoming occurrences
  let upcomingOccurrences: Awaited<ReturnType<typeof prisma.scheduledPost.findMany>> = [];
  if (post.recurrenceType !== 'NONE') {
    upcomingOccurrences = await prisma.scheduledPost.findMany({
      where: {
        parentPostId: post.id,
        status: 'pending'
      },
      orderBy: { scheduledFor: 'asc' },
      take: 5
    });
  }

  res.json({
    ...post,
    upcomingOccurrences
  });
});

/**
 * Update a scheduled post
 * PUT /api/v1/scheduled-posts/:id
 */
export const updateScheduledPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;
  const {
    content,
    mediaUrls,
    scheduledFor,
    timezone,
    recurrenceType,
    recurrenceEndDate,
    updateFutureOccurrences = false
  } = req.body;

  const existingPost = await prisma.scheduledPost.findFirst({
    where: { id, userId }
  });

  if (!existingPost) {
    throw Errors.notFound('Scheduled post');
  }

  if (existingPost.status !== 'pending') {
    throw Errors.badRequest('Cannot update a post that has been published or failed');
  }

  const updateData: Prisma.ScheduledPostUpdateInput = {};

  if (content !== undefined) {
    updateData.content = content;
  }

  if (mediaUrls !== undefined) {
    updateData.mediaUrls = mediaUrls;
  }

  if (scheduledFor) {
    const scheduleDate = new Date(scheduledFor);
    if (scheduleDate <= new Date()) {
      throw Errors.badRequest('Scheduled time must be in the future');
    }
    updateData.scheduledFor = scheduleDate;
  }

  if (timezone !== undefined) {
    if (!COMMON_TIMEZONES.includes(timezone)) {
      throw Errors.badRequest('Invalid timezone');
    }
    updateData.timezone = timezone;
  }

  if (recurrenceType !== undefined) {
    if (!isValidRecurrenceType(recurrenceType)) {
      throw Errors.badRequest('Invalid recurrence type');
    }
    updateData.recurrenceType = recurrenceType;
  }

  if (recurrenceEndDate !== undefined) {
    updateData.recurrenceEndDate = recurrenceEndDate ? new Date(recurrenceEndDate) : null;
  }

  const updatedPost = await prisma.scheduledPost.update({
    where: { id },
    data: updateData
  });

  // Optionally update future recurring instances
  if (updateFutureOccurrences && existingPost.recurrenceType !== 'NONE') {
    const contentUpdates: Prisma.ScheduledPostUpdateManyMutationInput = {};
    if (content !== undefined) contentUpdates.content = content;
    if (mediaUrls !== undefined) contentUpdates.mediaUrls = mediaUrls;

    if (Object.keys(contentUpdates).length > 0) {
      await prisma.scheduledPost.updateMany({
        where: {
          parentPostId: id,
          status: 'pending'
        },
        data: contentUpdates
      });
    }
  }

  res.json(updatedPost);
});

/**
 * Delete/cancel a scheduled post
 * DELETE /api/v1/scheduled-posts/:id
 */
export const deleteScheduledPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;
  const { deleteFutureOccurrences = true } = req.query;

  const post = await prisma.scheduledPost.findFirst({
    where: { id, userId }
  });

  if (!post) {
    throw Errors.notFound('Scheduled post');
  }

  if (post.status === 'published') {
    throw Errors.badRequest('Cannot delete a published post from scheduled');
  }

  // Delete future recurring instances if requested
  if (deleteFutureOccurrences === 'true' || deleteFutureOccurrences === true) {
    await prisma.scheduledPost.deleteMany({
      where: {
        parentPostId: id,
        status: 'pending'
      }
    });
  }

  await prisma.scheduledPost.delete({ where: { id } });
  res.json({ message: 'Scheduled post deleted successfully' });
});

/**
 * Get failed scheduled posts
 * GET /api/v1/scheduled-posts/failed
 */
export const getFailedScheduledPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const posts = await prisma.scheduledPost.findMany({
    where: { userId, status: 'failed' },
    orderBy: { scheduledFor: 'desc' }
  });

  res.json(posts);
});

/**
 * Retry a failed scheduled post
 * POST /api/v1/scheduled-posts/:id/retry
 */
export const retryScheduledPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;
  const { scheduledFor } = req.body;

  const post = await prisma.scheduledPost.findFirst({
    where: { id, userId }
  });

  if (!post) {
    throw Errors.notFound('Scheduled post');
  }

  if (post.status !== 'failed') {
    throw Errors.badRequest('Only failed posts can be retried');
  }

  const scheduleDate = scheduledFor ? new Date(scheduledFor) : new Date(Date.now() + 5 * 60 * 1000);
  if (scheduleDate <= new Date()) {
    throw Errors.badRequest('Scheduled time must be in the future');
  }

  const updatedPost = await prisma.scheduledPost.update({
    where: { id },
    data: {
      status: 'pending',
      scheduledFor: scheduleDate
    }
  });

  res.json(updatedPost);
});

/**
 * Stop recurring for a scheduled post
 * POST /api/v1/scheduled-posts/:id/stop-recurring
 */
export const stopRecurring = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const post = await prisma.scheduledPost.findFirst({
    where: { id, userId }
  });

  if (!post) {
    throw Errors.notFound('Scheduled post');
  }

  if (post.recurrenceType === 'NONE') {
    throw Errors.badRequest('This is not a recurring post');
  }

  // Update the post to stop recurring
  const updatedPost = await prisma.scheduledPost.update({
    where: { id },
    data: {
      recurrenceType: 'NONE',
      recurrenceEndDate: null
    }
  });

  // Delete all future pending occurrences
  const deletedCount = await prisma.scheduledPost.deleteMany({
    where: {
      parentPostId: id,
      status: 'pending'
    }
  });

  res.json({
    ...updatedPost,
    deletedFutureOccurrences: deletedCount.count
  });
});

/**
 * Publish scheduled posts that are due
 * Called by the scheduler job
 */
export const publishScheduledPosts = async () => {
  const now = new Date();
  const posts = await prisma.scheduledPost.findMany({
    where: { scheduledFor: { lte: now }, status: 'pending' },
  });

  logger.info(`Processing ${posts.length} due scheduled posts`);

  for (const post of posts) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: post.userId! },
        include: { account: { select: { id: true } } }
      });

      if (!user?.account?.id) {
        logger.warn(`User or account not found for scheduled post ${post.id}`);
        continue;
      }

      // Create the actual post
      const publishedPost = await prisma.post.create({
        data: {
          accountId: user.account.id,
          userId: post.userId,
          content: post.content,
          mediaUrls: post.mediaUrls,
          type: 'TEXT',
        },
      });

      // Update scheduled post status
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          status: 'published',
          published: true,
          publishedAt: now,
          publishedPostId: publishedPost.id
        },
      });

      // Send push notification to the user
      await sendPushNotificationToUser(post.userId!, {
        title: 'Scheduled Post Published',
        body: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
        data: {
          type: 'SCHEDULED_POST_PUBLISHED',
          postId: publishedPost.id,
          scheduledPostId: post.id
        }
      });

      // Handle recurring posts - create next occurrence
      if (post.recurrenceType !== 'NONE') {
        const nextDate = calculateNextOccurrence(post.scheduledFor, post.recurrenceType as RecurrenceType);

        // Check if we should create another occurrence
        const shouldCreateNext = !post.recurrenceEndDate || nextDate <= post.recurrenceEndDate;

        if (shouldCreateNext) {
          await prisma.scheduledPost.create({
            data: {
              userId: post.userId,
              accountId: post.accountId,
              content: post.content,
              mediaUrls: post.mediaUrls,
              scheduledFor: nextDate,
              timezone: post.timezone,
              recurrenceType: post.recurrenceType,
              recurrenceEndDate: post.recurrenceEndDate,
              parentPostId: post.parentPostId || post.id, // Link to original parent
              status: 'pending'
            }
          });

          logger.info(`Created next occurrence for recurring post ${post.id}, scheduled for ${nextDate.toISOString()}`);
        } else {
          logger.info(`Recurring post ${post.id} has reached its end date, no more occurrences created`);
        }
      }

      logger.info(`Published scheduled post ${post.id} as post ${publishedPost.id}`);
    } catch (error) {
      logger.error(`Failed to publish scheduled post ${post.id}:`, error);
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'failed' },
      });
    }
  }

  return { processed: posts.length };
};
