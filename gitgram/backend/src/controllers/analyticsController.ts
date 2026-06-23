import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';
import {
  getFollowerDemographics,
  getFollowerQuality,
  getUnfollows as getUnfollowsService,
  getFollowerGrowthDetailed,
  getOverallEngagement,
  getEngagementByPost,
  getContentReach,
  getBestPostingTimes,
  getFollowRelationships,
} from '../services/engagementAnalyticsService';

/**
 * Get analytics overview (summary stats)
 * GET /api/v1/analytics/overview
 */
export const getAnalyticsOverview = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  // Get user's post counts and engagement
  const [user, posts, reels, followers, following] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    }),
    prisma.post.count({ where: { userId } }),
    prisma.reel.count({ where: { userId } }),
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);

  // Get total engagement using aggregate queries instead of N+1
  const [totalLikesResult, totalCommentsResult, viewsAggregate] = await Promise.all([
    prisma.like.count({ where: { post: { userId } } }),
    prisma.comment.count({ where: { post: { userId } } }),
    prisma.post.aggregate({ where: { userId }, _sum: { viewsCount: true } }),
  ]);

  const totalLikes = totalLikesResult;
  const totalComments = totalCommentsResult;
  const totalViews = viewsAggregate._sum.viewsCount || 0;

  // Calculate engagement rate
  const engagementRate = followers > 0 && posts > 0
    ? ((totalLikes + totalComments) / (followers * posts) * 100).toFixed(2)
    : '0.00';

  res.json({
    totalPosts: posts,
    totalReels: reels,
    totalFollowers: followers,
    totalFollowing: following,
    totalLikes,
    totalComments,
    totalViews,
    engagementRate: parseFloat(engagementRate),
  });
});

/**
 * Get detailed analytics with time series
 * GET /api/v1/analytics
 */
export const getAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { days = 30 } = req.query;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  const analytics = await prisma.analytics.findMany({
    where: { userId, date: { gte: startDate } },
    orderBy: { date: 'asc' },
  });

  // If no analytics data, generate from posts
  if (analytics.length === 0) {
    const posts = await prisma.post.findMany({
      where: { userId, createdAt: { gte: startDate } },
      include: { _count: { select: { likes: true, comments: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const dailyStats: Record<string, { views: number; likes: number; comments: number; shares: number }> = {};

    posts.forEach(post => {
      const dateKey = post.createdAt.toISOString().split('T')[0];
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { views: 0, likes: 0, comments: 0, shares: 0 };
      }
      dailyStats[dateKey].views += post.viewsCount || 0;
      dailyStats[dateKey].likes += post._count?.likes || 0;
      dailyStats[dateKey].comments += post._count?.comments || 0;
    });

    const generatedAnalytics = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      ...stats,
    }));

    const totals = generatedAnalytics.reduce((acc, day) => ({
      views: acc.views + day.views,
      likes: acc.likes + day.likes,
      comments: acc.comments + day.comments,
      shares: acc.shares + day.shares,
      followers: 0,
      reach: 0,
    }), { views: 0, likes: 0, comments: 0, shares: 0, followers: 0, reach: 0 });

    return res.json({ analytics: generatedAnalytics, totals });
  }

  const totals = analytics.reduce((acc, day) => ({
    views: acc.views + day.views,
    likes: acc.likes + day.likes,
    comments: acc.comments + day.comments,
    shares: acc.shares + day.shares,
    followers: day.followers,
    reach: acc.reach + day.reach,
  }), { views: 0, likes: 0, comments: 0, shares: 0, followers: 0, reach: 0 });

  res.json({ analytics, totals });
});

/**
 * Get analytics for a specific post
 * GET /api/v1/analytics/posts/:postId
 */
export const getPostAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { postId } = req.params;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      _count: { select: { likes: true, comments: true, savedBy: true } },
      user: { select: { id: true, username: true } },
    },
  });

  if (!post) {
    throw Errors.notFound('Post');
  }

  // Verify ownership
  if (post.userId !== userId) {
    throw Errors.forbidden('Access denied');
  }

  res.json({
    postId: post.id,
    content: post.content,
    mediaUrls: post.mediaUrls,
    createdAt: post.createdAt,
    viewsCount: post.viewsCount || 0,
    likesCount: post._count?.likes || 0,
    commentsCount: post._count?.comments || 0,
    savesCount: post._count?.savedBy || 0,
    sharesCount: post.sharesCount || 0,
    engagementRate: post.viewsCount && post.viewsCount > 0
      ? (((post._count?.likes || 0) + (post._count?.comments || 0)) / post.viewsCount * 100).toFixed(2)
      : '0.00',
  });
});

/**
 * Get follower growth data
 * GET /api/v1/analytics/followers
 */
export const getFollowerGrowth = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { days = 30 } = req.query;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  // Get follower events within the time period
  const follows = await prisma.follow.findMany({
    where: {
      followingId: userId,
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by date
  const dailyGrowth: Record<string, number> = {};
  follows.forEach(follow => {
    const dateKey = follow.createdAt.toISOString().split('T')[0];
    dailyGrowth[dateKey] = (dailyGrowth[dateKey] || 0) + 1;
  });

  // Get current total
  const totalFollowers = await prisma.follow.count({
    where: { followingId: userId },
  });

  const growth = Object.entries(dailyGrowth).map(([date, count]) => ({
    date,
    newFollowers: count,
  }));

  res.json({
    totalFollowers,
    growth,
    periodGain: follows.length,
  });
});

/**
 * Get engagement rate over time
 * GET /api/v1/analytics/engagement
 */
export const getEngagementRate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { days = 30 } = req.query;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  // Get posts with their engagement
  const posts = await prisma.post.findMany({
    where: {
      userId,
      createdAt: { gte: startDate },
    },
    include: {
      _count: { select: { likes: true, comments: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Calculate daily engagement rates
  const dailyEngagement: Record<string, { likes: number; comments: number; views: number }> = {};

  posts.forEach(post => {
    const dateKey = post.createdAt.toISOString().split('T')[0];
    if (!dailyEngagement[dateKey]) {
      dailyEngagement[dateKey] = { likes: 0, comments: 0, views: 0 };
    }
    dailyEngagement[dateKey].likes += post._count?.likes || 0;
    dailyEngagement[dateKey].comments += post._count?.comments || 0;
    dailyEngagement[dateKey].views += post.viewsCount || 0;
  });

  const engagementData = Object.entries(dailyEngagement).map(([date, stats]) => ({
    date,
    likes: stats.likes,
    comments: stats.comments,
    views: stats.views,
    engagementRate: stats.views > 0
      ? parseFloat(((stats.likes + stats.comments) / stats.views * 100).toFixed(2))
      : 0,
  }));

  // Calculate average engagement rate
  const avgEngagementRate = engagementData.length > 0
    ? engagementData.reduce((sum, day) => sum + day.engagementRate, 0) / engagementData.length
    : 0;

  res.json({
    engagementData,
    averageEngagementRate: parseFloat(avgEngagementRate.toFixed(2)),
  });
});

/**
 * Track a view for analytics
 */
export const trackView = async (userId: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.analytics.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, views: 1 },
    update: { views: { increment: 1 } },
  });
};

/**
 * Track engagement for analytics
 */
export const trackEngagement = async (userId: string, type: 'like' | 'comment' | 'share') => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.analytics.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, [type + 's']: 1 },
    update: { [type + 's']: { increment: 1 } },
  });
};

/**
 * Get detailed analytics for a specific post (for post owners)
 * GET /api/v1/posts/:id/analytics
 *
 * Returns comprehensive analytics including:
 * - Total impressions/views
 * - Unique viewers
 * - Likes over time (by day/hour)
 * - Comments over time
 * - Shares/reposts count
 * - Save count
 * - Profile visits from this post
 * - Engagement rate (interactions/impressions)
 * - Top locations of viewers
 * - Reach breakdown (followers vs non-followers)
 */
export const getDetailedPostAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { id: postId } = req.params;
  const { days = 30, granularity = 'day' } = req.query; // granularity: 'hour' or 'day'

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  // Fetch the post and verify ownership
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      _count: {
        select: {
          likes: true,
          comments: true,
          savedBy: true,
          views: true,
        },
      },
      user: {
        select: { id: true, username: true },
      },
    },
  });

  if (!post) {
    throw Errors.notFound('Post');
  }

  // Verify ownership - only the post owner can view detailed analytics
  if (post.userId !== userId) {
    throw Errors.forbidden('Access denied. Only the post owner can view detailed analytics.');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  // Run all analytics queries in parallel for performance
  const [
    postViews,
    likesOverTime,
    commentsOverTime,
    sharesCount,
    uniqueViewers,
    followerViews,
    nonFollowerViews,
    profileVisitsFromPost,
    topLocations,
    deviceBreakdown,
    sourceBreakdown,
    hourlyDistribution,
  ] = await Promise.all([
    // Total views from PostView table
    prisma.postView.findMany({
      where: {
        postId,
        viewedAt: { gte: startDate },
      },
      orderBy: { viewedAt: 'asc' },
    }),

    // Likes over time
    prisma.like.findMany({
      where: {
        postId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    }),

    // Comments over time
    prisma.comment.findMany({
      where: {
        postId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    }),

    // Shares count
    prisma.postShare.count({
      where: { postId },
    }),

    // Unique viewers (by viewerId or ipHash)
    prisma.postView.groupBy({
      by: ['viewerId', 'ipHash'],
      where: {
        postId,
        viewedAt: { gte: startDate },
      },
    }),

    // Follower views
    prisma.postView.count({
      where: {
        postId,
        isFollower: true,
        viewedAt: { gte: startDate },
      },
    }),

    // Non-follower views
    prisma.postView.count({
      where: {
        postId,
        isFollower: false,
        viewedAt: { gte: startDate },
      },
    }),

    // Profile visits that originated from this post
    prisma.postView.count({
      where: {
        postId,
        profileVisit: true,
        viewedAt: { gte: startDate },
      },
    }),

    // Top locations (countries)
    prisma.postView.groupBy({
      by: ['country'],
      where: {
        postId,
        country: { not: null },
        viewedAt: { gte: startDate },
      },
      _count: { country: true },
      orderBy: { _count: { country: 'desc' } },
      take: 10,
    }),

    // Device breakdown
    prisma.postView.groupBy({
      by: ['deviceType'],
      where: {
        postId,
        deviceType: { not: null },
        viewedAt: { gte: startDate },
      },
      _count: { deviceType: true },
    }),

    // Source breakdown (where viewers came from)
    prisma.postView.groupBy({
      by: ['source'],
      where: {
        postId,
        source: { not: null },
        viewedAt: { gte: startDate },
      },
      _count: { source: true },
    }),

    // Hourly distribution (for peak hours analysis)
    prisma.postView.findMany({
      where: {
        postId,
        viewedAt: { gte: startDate },
      },
      select: { viewedAt: true },
    }),
  ]);

  // Process likes over time by day/hour
  const likesTimeline = aggregateByTime(
    likesOverTime.map(l => l.createdAt),
    granularity as 'hour' | 'day'
  );

  // Process comments over time by day/hour
  const commentsTimeline = aggregateByTime(
    commentsOverTime.map(c => c.createdAt),
    granularity as 'hour' | 'day'
  );

  // Process views over time by day/hour
  const viewsTimeline = aggregateByTime(
    postViews.map(v => v.viewedAt),
    granularity as 'hour' | 'day'
  );

  // Calculate hourly distribution (0-23)
  const hourlyStats = new Array(24).fill(0);
  hourlyDistribution.forEach(view => {
    const hour = view.viewedAt.getHours();
    hourlyStats[hour]++;
  });

  // Calculate engagement metrics
  const totalImpressions = post.viewsCount || postViews.length;
  const totalInteractions = (post._count?.likes || 0) + (post._count?.comments || 0) + sharesCount + (post._count?.savedBy || 0);
  const engagementRate = totalImpressions > 0
    ? parseFloat(((totalInteractions / totalImpressions) * 100).toFixed(2))
    : 0;

  // Calculate average view duration
  const viewsWithDuration = postViews.filter(v => v.duration !== null);
  const averageViewDuration = viewsWithDuration.length > 0
    ? Math.round(viewsWithDuration.reduce((sum, v) => sum + (v.duration || 0), 0) / viewsWithDuration.length)
    : null;

  // Format top locations
  const formattedTopLocations = topLocations
    .filter(loc => loc.country)
    .map(loc => ({
      country: loc.country,
      views: loc._count.country,
      percentage: totalImpressions > 0
        ? parseFloat(((loc._count.country / totalImpressions) * 100).toFixed(1))
        : 0,
    }));

  // Format device breakdown
  const formattedDeviceBreakdown = deviceBreakdown
    .filter(d => d.deviceType)
    .map(d => ({
      device: d.deviceType,
      count: d._count.deviceType,
      percentage: totalImpressions > 0
        ? parseFloat(((d._count.deviceType / totalImpressions) * 100).toFixed(1))
        : 0,
    }));

  // Format source breakdown
  const formattedSourceBreakdown = sourceBreakdown
    .filter(s => s.source)
    .map(s => ({
      source: s.source,
      count: s._count.source,
      percentage: totalImpressions > 0
        ? parseFloat(((s._count.source / totalImpressions) * 100).toFixed(1))
        : 0,
    }));

  // Peak engagement hours
  const peakHours = hourlyStats
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  res.json({
    postId: post.id,
    content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
    createdAt: post.createdAt,
    periodDays: Number(days),

    // Core metrics
    impressions: {
      total: totalImpressions,
      unique: uniqueViewers.length,
      timeline: viewsTimeline,
    },

    engagement: {
      likes: {
        total: post._count?.likes || 0,
        timeline: likesTimeline,
      },
      comments: {
        total: post._count?.comments || 0,
        timeline: commentsTimeline,
      },
      shares: sharesCount,
      saves: post._count?.savedBy || 0,
      engagementRate,
      totalInteractions,
    },

    // Profile visits from this post
    profileVisits: profileVisitsFromPost,

    // Reach breakdown
    reach: {
      followers: followerViews,
      nonFollowers: nonFollowerViews,
      followerPercentage: totalImpressions > 0
        ? parseFloat(((followerViews / totalImpressions) * 100).toFixed(1))
        : 0,
      nonFollowerPercentage: totalImpressions > 0
        ? parseFloat(((nonFollowerViews / totalImpressions) * 100).toFixed(1))
        : 0,
    },

    // View duration analytics
    viewDuration: {
      averageMs: averageViewDuration,
      averageSeconds: averageViewDuration ? Math.round(averageViewDuration / 1000) : null,
    },

    // Demographics & sources
    demographics: {
      topLocations: formattedTopLocations,
      deviceBreakdown: formattedDeviceBreakdown,
      sourceBreakdown: formattedSourceBreakdown,
    },

    // Peak times
    peakTimes: {
      hourlyDistribution: hourlyStats,
      peakHours: peakHours.map(h => ({
        hour: h.hour,
        label: `${h.hour.toString().padStart(2, '0')}:00`,
        views: h.count,
      })),
    },
  });
});

/**
 * Helper function to aggregate timestamps by day or hour
 */
function aggregateByTime(
  timestamps: Date[],
  granularity: 'hour' | 'day'
): { period: string; count: number }[] {
  const grouped: Record<string, number> = {};

  timestamps.forEach(ts => {
    let key: string;
    if (granularity === 'hour') {
      // Format: YYYY-MM-DD HH:00
      key = `${ts.toISOString().split('T')[0]} ${ts.getHours().toString().padStart(2, '0')}:00`;
    } else {
      // Format: YYYY-MM-DD
      key = ts.toISOString().split('T')[0];
    }
    grouped[key] = (grouped[key] || 0) + 1;
  });

  return Object.entries(grouped)
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Record a post view with detailed tracking
 * This is a utility function to be called when a post is viewed
 */
export const recordPostView = async (
  postId: string,
  viewerData: {
    viewerId?: string;
    sessionId?: string;
    ipHash?: string;
    country?: string;
    city?: string;
    deviceType?: string;
    source?: string;
    referrer?: string;
    isFollower?: boolean;
  }
) => {
  try {
    await prisma.postView.create({
      data: {
        postId,
        viewerId: viewerData.viewerId,
        sessionId: viewerData.sessionId,
        ipHash: viewerData.ipHash,
        country: viewerData.country,
        city: viewerData.city,
        deviceType: viewerData.deviceType,
        source: viewerData.source,
        referrer: viewerData.referrer,
        isFollower: viewerData.isFollower || false,
      },
    });

    // Also increment the viewsCount on the post for quick access
    await prisma.post.update({
      where: { id: postId },
      data: { viewsCount: { increment: 1 } },
    });
  } catch (error) {
    logger.error('Error recording post view:', error);
    // Don't throw - view tracking should not break the user experience
  }
};

/**
 * Update a post view with profile visit information
 * Called when a viewer visits the post author's profile
 */
export const updatePostViewWithProfileVisit = async (
  postId: string,
  viewerId: string
) => {
  try {
    await prisma.postView.updateMany({
      where: {
        postId,
        viewerId,
        profileVisit: false,
      },
      data: {
        profileVisit: true,
      },
    });
  } catch (error) {
    logger.error('Error updating post view with profile visit:', error);
  }
};

/**
 * Update post view duration
 * Called when the viewer leaves the post or navigates away
 */
export const updatePostViewDuration = async (
  postId: string,
  viewerId: string,
  sessionId: string | undefined,
  duration: number
) => {
  try {
    // Find the most recent view by this viewer
    const whereClause: any = { postId };
    if (viewerId) {
      whereClause.viewerId = viewerId;
    } else if (sessionId) {
      whereClause.sessionId = sessionId;
    } else {
      return; // Can't update without identifier
    }

    const recentView = await prisma.postView.findFirst({
      where: whereClause,
      orderBy: { viewedAt: 'desc' },
    });

    if (recentView) {
      await prisma.postView.update({
        where: { id: recentView.id },
        data: { duration },
      });
    }
  } catch (error) {
    logger.error('Error updating post view duration:', error);
  }
};

// ============================================
// NEW: FOLLOWER ANALYTICS ENDPOINTS
// ============================================

/**
 * Get detailed follower growth with net change (daily/weekly/monthly)
 * GET /api/v1/analytics/followers/growth
 */
export const getFollowerGrowthDetailed_ = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { days = 30, granularity = 'daily' } = req.query;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const data = await getFollowerGrowthDetailed(
    userId,
    Number(days),
    granularity as 'daily' | 'weekly' | 'monthly'
  );
  res.json(data);
});

/**
 * Get follower demographics (interests, account types)
 * GET /api/v1/analytics/followers/demographics
 */
export const getFollowerDemographics_ = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const data = await getFollowerDemographics(userId);
  res.json(data);
});

/**
 * Get follower quality (engagement rate of followers)
 * GET /api/v1/analytics/followers/quality
 */
export const getFollowerQuality_ = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const data = await getFollowerQuality(userId);
  res.json(data);
});

/**
 * Get unfollow tracking data
 * GET /api/v1/analytics/unfollows
 */
export const getUnfollows = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { days = 30 } = req.query;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const data = await getUnfollowsService(userId, Number(days));
  res.json(data);
});

// ============================================
// NEW: ENGAGEMENT ANALYTICS ENDPOINTS
// ============================================

/**
 * Get overall engagement metrics with period comparison
 * GET /api/v1/analytics/engagement/overall
 */
export const getOverallEngagement_ = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { days = 30 } = req.query;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const data = await getOverallEngagement(userId, Number(days));
  res.json(data);
});

/**
 * Get per-post engagement breakdown
 * GET /api/v1/analytics/engagement/posts
 */
export const getEngagementByPost_ = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { days = 30, limit = 20 } = req.query;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const data = await getEngagementByPost(userId, Number(days), Number(limit));
  res.json(data);
});

/**
 * Get content reach metrics
 * GET /api/v1/analytics/engagement/reach
 */
export const getContentReach_ = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { days = 30 } = req.query;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const data = await getContentReach(userId, Number(days));
  res.json(data);
});

/**
 * Get best posting times analysis
 * GET /api/v1/analytics/engagement/best-times
 */
export const getBestPostingTimes_ = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const data = await getBestPostingTimes(userId);
  res.json(data);
});

/**
 * Get follow relationships (mutual, not following back, etc.)
 * GET /api/v1/analytics/followers/relationships
 */
export const getFollowRelationships_ = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const data = await getFollowRelationships(userId);
  res.json(data);
});

/**
 * Export analytics data as CSV
 * GET /api/v1/analytics/export
 */
export const exportAnalyticsCSV = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { days = 30, type = 'all' } = req.query;

  if (!userId) {
    throw Errors.unauthorized('Unauthorized');
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  let csvRows: string[] = [];

  if (type === 'followers' || type === 'all') {
    const follows = await prisma.follow.findMany({
      where: { followingUserId: userId, createdAt: { gte: startDate } },
      include: {
        followerUser: { select: { username: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    csvRows.push('Type,Date,Username');
    follows.forEach(f => {
      csvRows.push(`New Follower,${f.createdAt.toISOString()},${f.followerUser?.username || 'unknown'}`);
    });
  }

  if (type === 'engagement' || type === 'all') {
    const posts = await prisma.post.findMany({
      where: { userId, createdAt: { gte: startDate } },
      include: { _count: { select: { likes: true, comments: true, savedBy: true } } },
      orderBy: { createdAt: 'asc' },
    });

    if (csvRows.length === 0) {
      csvRows.push('Post ID,Date,Content,Likes,Comments,Saves,Shares,Views,Engagement Rate');
    } else {
      csvRows.push('');
      csvRows.push('Post ID,Date,Content,Likes,Comments,Saves,Shares,Views,Engagement Rate');
    }

    posts.forEach(post => {
      const likes = post._count?.likes || 0;
      const comments = post._count?.comments || 0;
      const saves = post._count?.savedBy || 0;
      const views = post.viewsCount || 0;
      const rate = views > 0 ? ((likes + comments + saves) / views * 100).toFixed(2) : '0.00';
      const content = (post.content || '').replace(/,/g, ';').replace(/\n/g, ' ').substring(0, 50);
      csvRows.push(`${post.id},${post.createdAt.toISOString()},${content},${likes},${comments},${saves},${post.sharesCount || 0},${views},${rate}%`);
    });
  }

  if (type === 'daily' || type === 'all') {
    const analytics = await prisma.analytics.findMany({
      where: { userId, date: { gte: startDate } },
      orderBy: { date: 'asc' },
    });

    if (csvRows.length > 0) csvRows.push('');
    csvRows.push('Date,Views,Likes,Comments,Shares,Followers,Reach');
    analytics.forEach(a => {
      csvRows.push(`${a.date.toISOString().split('T')[0]},${a.views},${a.likes},${a.comments},${a.shares},${a.followers},${a.reach}`);
    });
  }

  const csvContent = csvRows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=gitgram-analytics-${type}-${days}d.csv`);
  res.send(csvContent);
});
