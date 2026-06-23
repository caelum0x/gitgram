import prisma from '../utils/prisma';
import logger from '../utils/logger';

// Simple in-memory cache
const cache = new Map<string, { data: any; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any, ttlMs: number = 5 * 60 * 1000): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ============================================
// Types
// ============================================

export interface FollowerGrowthPoint {
  date: string;
  newFollowers: number;
  unfollows: number;
  netChange: number;
  cumulativeTotal: number;
}

export interface FollowerAnalytics {
  totalFollowers: number;
  totalFollowing: number;
  followerGrowthRate: number;
  periodNewFollowers: number;
  periodUnfollows: number;
  periodNetChange: number;
  retentionRate: number;
  dailyGrowth: FollowerGrowthPoint[];
  weeklyGrowth: FollowerGrowthPoint[];
  monthlyGrowth: FollowerGrowthPoint[];
  topFollowers: {
    userId: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    followerCount: number;
  }[];
}

export interface EngagementMetrics {
  engagementRate: number;
  avgLikesPerPost: number;
  avgCommentsPerPost: number;
  avgSavesPerPost: number;
  totalInteractions: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalShares: number;
  totalViews: number;
  interactionBreakdown: {
    type: string;
    count: number;
    percentage: number;
  }[];
  dailyEngagement: {
    date: string;
    likes: number;
    comments: number;
    saves: number;
    views: number;
    engagementRate: number;
  }[];
  periodComparison: {
    current: { likes: number; comments: number; views: number; engagementRate: number };
    previous: { likes: number; comments: number; views: number; engagementRate: number };
    likesChange: string;
    commentsChange: string;
    viewsChange: string;
    engagementRateChange: string;
  };
}

export interface ContentPerformance {
  totalPosts: number;
  avgEngagementPerPost: number;
  topPosts: {
    id: string;
    content: string;
    type: string;
    createdAt: Date;
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    views: number;
    engagementRate: number;
    engagementScore: number;
  }[];
  performanceByType: {
    type: string;
    count: number;
    avgLikes: number;
    avgComments: number;
    avgViews: number;
    avgEngagementRate: number;
  }[];
  postingFrequency: {
    date: string;
    count: number;
  }[];
  bestPerformingDay: string | null;
  bestPerformingHour: number | null;
}

// ============================================
// HELPER: Date key by granularity
// ============================================

function getDateKey(date: Date, granularity: 'daily' | 'weekly' | 'monthly'): string {
  if (granularity === 'daily') {
    return date.toISOString().split('T')[0];
  } else if (granularity === 'weekly') {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().split('T')[0];
  } else {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }
}

// ============================================
// HELPER: Percentage change calculation
// ============================================

export function calcPercentageChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const change = Math.round(((current - previous) / previous) * 100);
  return change >= 0 ? `+${change}%` : `${change}%`;
}

// ============================================
// HELPER: Build growth timeline
// ============================================

function buildGrowthTimeline(
  follows: { createdAt: Date }[],
  unfollowLogs: { unfollowedAt: Date }[],
  granularity: 'daily' | 'weekly' | 'monthly',
  currentTotal: number,
  days: number,
): FollowerGrowthPoint[] {
  const newFollowsByDate: Record<string, number> = {};
  const unfollowsByDate: Record<string, number> = {};

  follows.forEach(f => {
    const key = getDateKey(f.createdAt, granularity);
    newFollowsByDate[key] = (newFollowsByDate[key] || 0) + 1;
  });

  unfollowLogs.forEach(u => {
    const key = getDateKey(u.unfollowedAt, granularity);
    unfollowsByDate[key] = (unfollowsByDate[key] || 0) + 1;
  });

  // Fill in all dates in the range for daily granularity
  if (granularity === 'daily') {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    for (let d = new Date(startDate); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      if (!newFollowsByDate[key]) newFollowsByDate[key] = 0;
    }
  }

  const allDates = new Set([...Object.keys(newFollowsByDate), ...Object.keys(unfollowsByDate)]);
  const sorted = Array.from(allDates).sort();

  // Calculate cumulative totals backwards from current
  const totalNetInPeriod = follows.length - unfollowLogs.length;
  let runningTotal = currentTotal - totalNetInPeriod;

  return sorted.map(date => {
    const newFollowers = newFollowsByDate[date] || 0;
    const unfollowCount = unfollowsByDate[date] || 0;
    const netChange = newFollowers - unfollowCount;
    runningTotal += netChange;

    return {
      date,
      newFollowers,
      unfollows: unfollowCount,
      netChange,
      cumulativeTotal: runningTotal,
    };
  });
}

// ============================================
// FOLLOWER ANALYTICS
// ============================================

export const getFollowerAnalytics = async (userId: string, days = 30): Promise<FollowerAnalytics> => {
  const cacheKey = `user_follower_analytics:${userId}:${days}`;
  const cached = getCached<FollowerAnalytics>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [
    totalFollowers,
    totalFollowing,
    periodFollows,
    unfollowLogs,
    topFollowerData,
  ] = await Promise.all([
    prisma.follow.count({ where: { followingUserId: userId } }),
    prisma.follow.count({ where: { followerUserId: userId } }),
    prisma.follow.findMany({
      where: {
        followingUserId: userId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.unfollowLog.findMany({
      where: {
        unfollowedId: userId,
        unfollowedAt: { gte: startDate },
      },
      orderBy: { unfollowedAt: 'asc' },
    }),
    prisma.follow.findMany({
      where: { followingUserId: userId },
      include: {
        followerUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            _count: { select: { followers: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const periodNewFollowers = periodFollows.length;
  const periodUnfollows = unfollowLogs.length;
  const periodNetChange = periodNewFollowers - periodUnfollows;
  const retentionRate = periodNewFollowers > 0
    ? Math.round(((periodNewFollowers - periodUnfollows) / periodNewFollowers) * 10000) / 100
    : 100;

  // Growth rate: net change / starting count
  const startingFollowers = totalFollowers - periodNetChange;
  const followerGrowthRate = startingFollowers > 0
    ? Math.round((periodNetChange / startingFollowers) * 10000) / 100
    : periodNetChange > 0 ? 100 : 0;

  const dailyGrowth = buildGrowthTimeline(periodFollows, unfollowLogs, 'daily', totalFollowers, days);
  const weeklyGrowth = buildGrowthTimeline(periodFollows, unfollowLogs, 'weekly', totalFollowers, days);
  const monthlyGrowth = buildGrowthTimeline(periodFollows, unfollowLogs, 'monthly', totalFollowers, days);

  // Top followers sorted by their follower count
  const topFollowers = topFollowerData
    .filter(f => f.followerUser)
    .map(f => ({
      userId: f.followerUser!.id,
      username: f.followerUser!.username || '',
      displayName: f.followerUser!.displayName,
      avatar: f.followerUser!.avatar,
      followerCount: f.followerUser!._count?.followers || 0,
    }))
    .sort((a, b) => b.followerCount - a.followerCount)
    .slice(0, 10);

  const result: FollowerAnalytics = {
    totalFollowers,
    totalFollowing,
    followerGrowthRate,
    periodNewFollowers,
    periodUnfollows,
    periodNetChange,
    retentionRate,
    dailyGrowth,
    weeklyGrowth,
    monthlyGrowth,
    topFollowers,
  };

  setCache(cacheKey, result);
  return result;
};

// ============================================
// ENGAGEMENT ANALYTICS
// ============================================

export const getEngagementAnalytics = async (userId: string, days = 30): Promise<EngagementMetrics> => {
  const cacheKey = `user_engagement_analytics:${userId}:${days}`;
  const cached = getCached<EngagementMetrics>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const prevStartDate = new Date(startDate);
  prevStartDate.setDate(prevStartDate.getDate() - days);

  const [
    currentPosts,
    prevPosts,
    currentLikes,
    prevLikes,
    currentComments,
    prevComments,
    totalFollowers,
    currentSaves,
  ] = await Promise.all([
    prisma.post.findMany({
      where: { userId, createdAt: { gte: startDate } },
      include: {
        _count: { select: { likes: true, comments: true, savedBy: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.post.findMany({
      where: { userId, createdAt: { gte: prevStartDate, lt: startDate } },
      include: {
        _count: { select: { likes: true, comments: true, savedBy: true } },
      },
    }),
    prisma.like.count({ where: { post: { userId }, createdAt: { gte: startDate } } }),
    prisma.like.count({ where: { post: { userId }, createdAt: { gte: prevStartDate, lt: startDate } } }),
    prisma.comment.count({ where: { post: { userId }, createdAt: { gte: startDate } } }),
    prisma.comment.count({ where: { post: { userId }, createdAt: { gte: prevStartDate, lt: startDate } } }),
    prisma.follow.count({ where: { followingUserId: userId } }),
    prisma.savedPost.count({ where: { post: { userId }, createdAt: { gte: startDate } } }),
  ]);

  const totalLikes = currentLikes;
  const totalComments = currentComments;
  const totalSaves = currentSaves;
  const totalShares = currentPosts.reduce((sum, p) => sum + (p.sharesCount || 0), 0);
  const totalViews = currentPosts.reduce((sum, p) => sum + (p.viewsCount || 0), 0);
  const totalInteractions = totalLikes + totalComments + totalSaves + totalShares;
  const postCount = currentPosts.length;

  // Engagement rate: (total interactions) / (views or follower * posts)
  const engagementRate = totalViews > 0
    ? Math.round((totalInteractions / totalViews) * 10000) / 100
    : totalFollowers > 0 && postCount > 0
      ? Math.round((totalInteractions / (totalFollowers * postCount)) * 10000) / 100
      : 0;

  const avgLikesPerPost = postCount > 0 ? Math.round((totalLikes / postCount) * 100) / 100 : 0;
  const avgCommentsPerPost = postCount > 0 ? Math.round((totalComments / postCount) * 100) / 100 : 0;
  const avgSavesPerPost = postCount > 0 ? Math.round((totalSaves / postCount) * 100) / 100 : 0;

  // Interaction breakdown
  const interactionBreakdown = [
    { type: 'likes', count: totalLikes, percentage: totalInteractions > 0 ? Math.round((totalLikes / totalInteractions) * 10000) / 100 : 0 },
    { type: 'comments', count: totalComments, percentage: totalInteractions > 0 ? Math.round((totalComments / totalInteractions) * 10000) / 100 : 0 },
    { type: 'saves', count: totalSaves, percentage: totalInteractions > 0 ? Math.round((totalSaves / totalInteractions) * 10000) / 100 : 0 },
    { type: 'shares', count: totalShares, percentage: totalInteractions > 0 ? Math.round((totalShares / totalInteractions) * 10000) / 100 : 0 },
  ];

  // Daily engagement timeline
  const dailyMap: Record<string, { likes: number; comments: number; saves: number; views: number }> = {};

  // Initialize all dates in the range
  for (let d = new Date(startDate); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    dailyMap[key] = { likes: 0, comments: 0, saves: 0, views: 0 };
  }

  currentPosts.forEach(post => {
    const dateKey = post.createdAt.toISOString().split('T')[0];
    if (dailyMap[dateKey]) {
      dailyMap[dateKey].likes += post._count?.likes || 0;
      dailyMap[dateKey].comments += post._count?.comments || 0;
      dailyMap[dateKey].saves += post._count?.savedBy || 0;
      dailyMap[dateKey].views += post.viewsCount || 0;
    }
  });

  const dailyEngagement = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => ({
      date,
      likes: stats.likes,
      comments: stats.comments,
      saves: stats.saves,
      views: stats.views,
      engagementRate: stats.views > 0
        ? Math.round(((stats.likes + stats.comments + stats.saves) / stats.views) * 10000) / 100
        : 0,
    }));

  // Previous period comparison
  const prevViews = prevPosts.reduce((sum, p) => sum + (p.viewsCount || 0), 0);
  const prevTotalInteractions = prevLikes + prevComments;
  const prevEngagementRate = prevViews > 0
    ? Math.round((prevTotalInteractions / prevViews) * 10000) / 100
    : 0;

  const periodComparison = {
    current: {
      likes: currentLikes,
      comments: currentComments,
      views: totalViews,
      engagementRate,
    },
    previous: {
      likes: prevLikes,
      comments: prevComments,
      views: prevViews,
      engagementRate: prevEngagementRate,
    },
    likesChange: calcPercentageChange(currentLikes, prevLikes),
    commentsChange: calcPercentageChange(currentComments, prevComments),
    viewsChange: calcPercentageChange(totalViews, prevViews),
    engagementRateChange: calcPercentageChange(engagementRate, prevEngagementRate),
  };

  const result: EngagementMetrics = {
    engagementRate,
    avgLikesPerPost,
    avgCommentsPerPost,
    avgSavesPerPost,
    totalInteractions,
    totalLikes,
    totalComments,
    totalSaves,
    totalShares,
    totalViews,
    interactionBreakdown,
    dailyEngagement,
    periodComparison,
  };

  setCache(cacheKey, result);
  return result;
};

// ============================================
// CONTENT PERFORMANCE ANALYTICS
// ============================================

export const getContentPerformance = async (userId: string, days = 30, limit = 20): Promise<ContentPerformance> => {
  const cacheKey = `user_content_analytics:${userId}:${days}:${limit}`;
  const cached = getCached<ContentPerformance>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const posts = await prisma.post.findMany({
    where: {
      userId,
      createdAt: { gte: startDate },
    },
    include: {
      _count: { select: { likes: true, comments: true, savedBy: true, views: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalPosts = posts.length;

  // Calculate per-post metrics
  const postMetrics = posts.map(post => {
    const likes = post._count?.likes || 0;
    const comments = post._count?.comments || 0;
    const saves = post._count?.savedBy || 0;
    const shares = post.sharesCount || 0;
    const views = post.viewsCount || post._count?.views || 1;
    const interactions = likes + comments + saves + shares;
    const engagementRate = views > 0
      ? Math.round((interactions / views) * 10000) / 100
      : 0;
    const engagementScore = likes + comments * 2 + saves * 3 + shares * 2;

    return {
      id: post.id,
      content: (post.content || '').substring(0, 100) + ((post.content || '').length > 100 ? '...' : ''),
      type: post.type || 'POST',
      createdAt: post.createdAt,
      likes,
      comments,
      saves,
      shares,
      views,
      engagementRate,
      engagementScore,
    };
  });

  // Top posts by engagement score
  const topPosts = [...postMetrics]
    .sort((a, b) => b.engagementScore - a.engagementScore)
    .slice(0, limit);

  // Average engagement per post
  const totalEngagement = postMetrics.reduce((sum, p) => sum + p.likes + p.comments + p.saves, 0);
  const avgEngagementPerPost = totalPosts > 0
    ? Math.round((totalEngagement / totalPosts) * 100) / 100
    : 0;

  // Performance by content type
  const typeMap: Record<string, { count: number; likes: number; comments: number; views: number; totalEngagementRate: number }> = {};

  postMetrics.forEach(post => {
    const type = post.type;
    if (!typeMap[type]) {
      typeMap[type] = { count: 0, likes: 0, comments: 0, views: 0, totalEngagementRate: 0 };
    }
    typeMap[type].count++;
    typeMap[type].likes += post.likes;
    typeMap[type].comments += post.comments;
    typeMap[type].views += post.views;
    typeMap[type].totalEngagementRate += post.engagementRate;
  });

  const performanceByType = Object.entries(typeMap).map(([type, data]) => ({
    type,
    count: data.count,
    avgLikes: data.count > 0 ? Math.round((data.likes / data.count) * 100) / 100 : 0,
    avgComments: data.count > 0 ? Math.round((data.comments / data.count) * 100) / 100 : 0,
    avgViews: data.count > 0 ? Math.round(data.views / data.count) : 0,
    avgEngagementRate: data.count > 0 ? Math.round((data.totalEngagementRate / data.count) * 100) / 100 : 0,
  }));

  // Posting frequency by date
  const postingFreqMap: Record<string, number> = {};
  posts.forEach(post => {
    const dateKey = post.createdAt.toISOString().split('T')[0];
    postingFreqMap[dateKey] = (postingFreqMap[dateKey] || 0) + 1;
  });

  const postingFrequency = Object.entries(postingFreqMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Best performing day of week
  const dayOfWeekEngagement: Record<number, { count: number; engagement: number }> = {};
  const hourEngagement: Record<number, { count: number; engagement: number }> = {};

  postMetrics.forEach(post => {
    const dayOfWeek = post.createdAt.getDay();
    const hour = post.createdAt.getHours();
    const engagement = post.engagementScore;

    if (!dayOfWeekEngagement[dayOfWeek]) {
      dayOfWeekEngagement[dayOfWeek] = { count: 0, engagement: 0 };
    }
    dayOfWeekEngagement[dayOfWeek].count++;
    dayOfWeekEngagement[dayOfWeek].engagement += engagement;

    if (!hourEngagement[hour]) {
      hourEngagement[hour] = { count: 0, engagement: 0 };
    }
    hourEngagement[hour].count++;
    hourEngagement[hour].engagement += engagement;
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let bestPerformingDay: string | null = null;
  let bestDayAvg = 0;

  Object.entries(dayOfWeekEngagement).forEach(([day, data]) => {
    const avg = data.engagement / data.count;
    if (avg > bestDayAvg) {
      bestDayAvg = avg;
      bestPerformingDay = dayNames[parseInt(day)];
    }
  });

  let bestPerformingHour: number | null = null;
  let bestHourAvg = 0;

  Object.entries(hourEngagement).forEach(([hour, data]) => {
    const avg = data.engagement / data.count;
    if (avg > bestHourAvg) {
      bestHourAvg = avg;
      bestPerformingHour = parseInt(hour);
    }
  });

  const result: ContentPerformance = {
    totalPosts,
    avgEngagementPerPost,
    topPosts,
    performanceByType,
    postingFrequency,
    bestPerformingDay,
    bestPerformingHour,
  };

  setCache(cacheKey, result);
  return result;
};
