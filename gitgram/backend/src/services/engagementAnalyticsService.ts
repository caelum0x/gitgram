import prisma from '../utils/prisma';
import logger from '../utils/logger';

// ============================================
// CACHE RESULT TYPES
// ============================================

interface EngagementRateResult {
  posts: number;
  likes: number;
  comments: number;
  followers: number;
  engagementRate: number;
  avgLikesPerPost: number;
  avgCommentsPerPost: number;
}

interface BestPostingTimesResult {
  bestHours: Array<{ hour: number; label: string; avgEngagement: number; postCount: number }>;
  bestDays: Array<{ day: number; dayName: string; avgEngagement: number; postCount: number }>;
}

interface FollowerDemographicsResult {
  totalFollowers: number;
  topInterests: Array<{ name: string; count: number; percentage: number }>;
  accountTypes: Array<{ type: string; count: number; percentage: number }>;
  avgFollowerCount: number;
}

interface FollowerQualityResult {
  followers: Array<{
    userId: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    followerCount: number;
    postCount: number;
    likesGiven: number;
    commentsGiven: number;
    engagementScore: number;
  }>;
  totalFollowers: number;
  engagedFollowers: number;
  engagementQualityRate: number;
}

interface UnfollowsResult {
  total: number;
  timeline: Array<{ date: string; count: number }>;
  unfollows: Array<{
    id: string;
    user: { id: string; username: string | null; displayName?: string | null; avatar?: string | null };
    unfollowedAt: Date;
    followedAt: Date | null;
    followDurationDays: number | null;
  }>;
}

interface FollowerGrowthDetailedResult {
  totalFollowers: number;
  periodNewFollowers: number;
  periodUnfollows: number;
  periodNetChange: number;
  retentionRate: number;
  growth: Array<{ date: string; newFollowers: number; unfollows: number; netChange: number }>;
}

interface EngagementByPostResult {
  posts: Array<{
    id: string;
    content: string;
    mediaUrls: string[];
    type: string;
    createdAt: Date;
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    impressions: number;
    engagementRate: number;
    engagementScore: number;
  }>;
}

interface ContentReachResult {
  totalImpressions: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalShares: number;
  totalInteractions: number;
  overallEngagementRate: number;
  profileVisits: number;
  totalFollowers: number;
  postsCount: number;
  avgImpressionsPerPost: number;
  typeBreakdown: Array<{ type: string; count: number; impressions: number; engagement: number; avgEngagement: number }>;
}

interface OverallEngagementResult {
  likes: { current: number; previous: number; change: string };
  comments: { current: number; previous: number; change: string };
  impressions: { current: number; previous: number; change: string };
  saves: { current: number; previous: number; change: string };
  profileVisits: { current: number; previous: number; change: string };
  engagementRate: { current: number; previous: number; change: string };
  totalFollowers: number;
  postsInPeriod: number;
}

interface MappedUser {
  id: string;
  username: string | null;
  displayName: string | null;
  avatar: string | null;
  followerCount: number;
  postCount: number;
}

interface FollowRelationshipsResult {
  mutual: MappedUser[];
  notFollowingBack: MappedUser[];
  notFollowedBack: MappedUser[];
  counts: { mutual: number; notFollowingBack: number; notFollowedBack: number };
}

// Simple in-memory cache
const cache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown, ttlMs: number = 5 * 60 * 1000): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ============================================
// ENGAGEMENT RATE
// ============================================

export const getEngagementRate = async (userId: string, days = 30) => {
  const cacheKey = `engagement_rate:${userId}:${days}`;
  const cached = getCached<EngagementRateResult>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [posts, totalLikes, totalComments, followers] = await Promise.all([
    prisma.post.count({ where: { userId, createdAt: { gte: startDate } } }),
    prisma.like.count({ where: { post: { userId }, createdAt: { gte: startDate } } }),
    prisma.comment.count({ where: { post: { userId }, createdAt: { gte: startDate } } }),
    prisma.follow.count({ where: { followingId: userId } }),
  ]);

  const totalEngagement = totalLikes + totalComments;
  const engagementRate = followers > 0 && posts > 0
    ? (totalEngagement / (posts * followers)) * 100
    : 0;

  const result = {
    posts,
    likes: totalLikes,
    comments: totalComments,
    followers,
    engagementRate: Math.round(engagementRate * 100) / 100,
    avgLikesPerPost: posts > 0 ? Math.round(totalLikes / posts) : 0,
    avgCommentsPerPost: posts > 0 ? Math.round(totalComments / posts) : 0,
  };

  setCache(cacheKey, result);
  return result;
};

// ============================================
// BEST POSTING TIMES
// ============================================

export const getBestPostingTimes = async (userId: string) => {
  const cacheKey = `best_times:${userId}`;
  const cached = getCached<BestPostingTimesResult>(cacheKey);
  if (cached) return cached;

  const posts = await prisma.post.findMany({
    where: { userId },
    include: { _count: { select: { likes: true, comments: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const hourlyEngagement: Record<number, { count: number; engagement: number }> = {};
  const dayOfWeekEngagement: Record<number, { count: number; engagement: number }> = {};

  posts.forEach(post => {
    const hour = post.createdAt.getHours();
    const dayOfWeek = post.createdAt.getDay();
    const engagement = (post._count?.likes || 0) + (post._count?.comments || 0) * 2;

    if (!hourlyEngagement[hour]) {
      hourlyEngagement[hour] = { count: 0, engagement: 0 };
    }
    hourlyEngagement[hour].count++;
    hourlyEngagement[hour].engagement += engagement;

    if (!dayOfWeekEngagement[dayOfWeek]) {
      dayOfWeekEngagement[dayOfWeek] = { count: 0, engagement: 0 };
    }
    dayOfWeekEngagement[dayOfWeek].count++;
    dayOfWeekEngagement[dayOfWeek].engagement += engagement;
  });

  const bestHours = Object.entries(hourlyEngagement)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      label: `${parseInt(hour).toString().padStart(2, '0')}:00`,
      avgEngagement: Math.round((data.engagement / data.count) * 100) / 100,
      postCount: data.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 5);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const bestDays = Object.entries(dayOfWeekEngagement)
    .map(([day, data]) => ({
      day: parseInt(day),
      dayName: dayNames[parseInt(day)],
      avgEngagement: Math.round((data.engagement / data.count) * 100) / 100,
      postCount: data.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 3);

  const result = { bestHours, bestDays };
  setCache(cacheKey, result);
  return result;
};

// ============================================
// FOLLOWER ANALYTICS - Demographics
// ============================================

export const getFollowerDemographics = async (userId: string) => {
  const cacheKey = `follower_demo:${userId}`;
  const cached = getCached<FollowerDemographicsResult>(cacheKey);
  if (cached) return cached;

  const followers = await prisma.follow.findMany({
    where: { followingUserId: userId },
    include: {
      followerUser: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          bio: true,
          interests: true,
          createdAt: true,
          _count: {
            select: {
              posts: true,
              followers: true,
              following: true,
            },
          },
        },
      },
    },
  });

  // Language breakdown from interests/bio
  const languageMap: Record<string, number> = {};
  const accountTypeMap: Record<string, number> = { regular: 0, active: 0, influencer: 0, new: 0 };
  let totalFollowerCount = 0;

  const now = Date.now();

  followers.forEach(({ followerUser }) => {
    if (!followerUser) return;

    // Aggregate interests as proxy for language/topic distribution
    (followerUser.interests || []).forEach((interest: string) => {
      languageMap[interest] = (languageMap[interest] || 0) + 1;
    });

    // Categorize account types
    const followerCount = followerUser._count?.followers || 0;
    const postCount = followerUser._count?.posts || 0;
    const accountAge = (now - followerUser.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    if (accountAge < 30) {
      accountTypeMap.new++;
    } else if (followerCount > 1000) {
      accountTypeMap.influencer++;
    } else if (postCount > 10) {
      accountTypeMap.active++;
    } else {
      accountTypeMap.regular++;
    }

    totalFollowerCount += followerCount;
  });

  // Sort languages by count
  const topInterests = Object.entries(languageMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({
      name,
      count,
      percentage: followers.length > 0
        ? Math.round((count / followers.length) * 10000) / 100
        : 0,
    }));

  const accountTypes = Object.entries(accountTypeMap).map(([type, count]) => ({
    type,
    count,
    percentage: followers.length > 0
      ? Math.round((count / followers.length) * 10000) / 100
      : 0,
  }));

  const result = {
    totalFollowers: followers.length,
    topInterests,
    accountTypes,
    avgFollowerCount: followers.length > 0
      ? Math.round(totalFollowerCount / followers.length)
      : 0,
  };

  setCache(cacheKey, result);
  return result;
};

// ============================================
// FOLLOWER QUALITY - Engagement of followers
// ============================================

export const getFollowerQuality = async (userId: string) => {
  const cacheKey = `follower_quality:${userId}`;
  const cached = getCached<FollowerQualityResult>(cacheKey);
  if (cached) return cached;

  // Get followers with their engagement on user's posts
  const followers = await prisma.follow.findMany({
    where: { followingUserId: userId },
    include: {
      followerUser: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatar: true,
          _count: { select: { posts: true, followers: true } },
        },
      },
    },
  });

  // Get user's post IDs
  const userPosts = await prisma.post.findMany({
    where: { userId },
    select: { id: true },
  });
  const postIds = userPosts.map(p => p.id);

  // Get engagement by each follower on user's posts
  const followerEngagement: Array<{
    userId: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
    followerCount: number;
    postCount: number;
    likesGiven: number;
    commentsGiven: number;
    engagementScore: number;
  }> = [];

  for (const follow of followers) {
    if (!follow.followerUser) continue;

    const [likesGiven, commentsGiven] = await Promise.all([
      prisma.like.count({
        where: {
          userId: follow.followerUser.id,
          postId: { in: postIds },
        },
      }),
      prisma.comment.count({
        where: {
          userId: follow.followerUser.id,
          postId: { in: postIds },
        },
      }),
    ]);

    const engagementScore = likesGiven + commentsGiven * 2;

    followerEngagement.push({
      userId: follow.followerUser.id,
      username: follow.followerUser.username || '',
      displayName: follow.followerUser.displayName,
      avatar: follow.followerUser.avatar,
      followerCount: follow.followerUser._count?.followers || 0,
      postCount: follow.followerUser._count?.posts || 0,
      likesGiven,
      commentsGiven,
      engagementScore,
    });
  }

  // Sort by engagement score
  followerEngagement.sort((a, b) => b.engagementScore - a.engagementScore);

  const totalEngaged = followerEngagement.filter(f => f.engagementScore > 0).length;
  const engagementQualityRate = followers.length > 0
    ? Math.round((totalEngaged / followers.length) * 10000) / 100
    : 0;

  const result = {
    followers: followerEngagement,
    totalFollowers: followers.length,
    engagedFollowers: totalEngaged,
    engagementQualityRate,
  };

  setCache(cacheKey, result, 10 * 60 * 1000); // Cache for 10 minutes
  return result;
};

// ============================================
// UNFOLLOW TRACKING
// ============================================

export const getUnfollows = async (userId: string, days = 30) => {
  const cacheKey = `unfollows:${userId}:${days}`;
  const cached = getCached<UnfollowsResult>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const unfollows = await prisma.unfollowLog.findMany({
    where: {
      unfollowedId: userId,
      unfollowedAt: { gte: startDate },
    },
    orderBy: { unfollowedAt: 'desc' },
  });

  // Get user info for unfollowers
  const unfollowerIds = unfollows.map(u => u.unfollowerId);
  const unfollowerUsers = await prisma.user.findMany({
    where: { id: { in: unfollowerIds } },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
    },
  });

  const userMap = new Map(unfollowerUsers.map(u => [u.id, u]));

  // Group unfollows by day
  const dailyUnfollows: Record<string, number> = {};
  unfollows.forEach(u => {
    const dateKey = u.unfollowedAt.toISOString().split('T')[0];
    dailyUnfollows[dateKey] = (dailyUnfollows[dateKey] || 0) + 1;
  });

  const unfollowTimeline = Object.entries(dailyUnfollows)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const detailedUnfollows = unfollows.map(u => ({
    id: u.id,
    user: userMap.get(u.unfollowerId) || { id: u.unfollowerId, username: 'Unknown' },
    unfollowedAt: u.unfollowedAt,
    followedAt: u.followedAt,
    followDurationDays: u.followDuration
      ? Math.round(u.followDuration / (60 * 60 * 24))
      : null,
  }));

  const result = {
    total: unfollows.length,
    timeline: unfollowTimeline,
    unfollows: detailedUnfollows.slice(0, 50),
  };

  setCache(cacheKey, result);
  return result;
};

// ============================================
// LOG UNFOLLOW - Called when a user unfollows
// ============================================

export const logUnfollow = async (
  unfollowerId: string,
  unfollowedId: string,
  followCreatedAt?: Date
) => {
  try {
    const followDuration = followCreatedAt
      ? Math.round((Date.now() - followCreatedAt.getTime()) / 1000)
      : null;

    await prisma.unfollowLog.create({
      data: {
        unfollowerId,
        unfollowedId,
        followedAt: followCreatedAt || null,
        followDuration,
      },
    });
  } catch (error) {
    logger.error('Error logging unfollow:', error);
  }
};

// ============================================
// FOLLOWER GROWTH - Enhanced with net change
// ============================================

export const getFollowerGrowthDetailed = async (userId: string, days = 30, granularity: 'daily' | 'weekly' | 'monthly' = 'daily') => {
  const cacheKey = `follower_growth_detail:${userId}:${days}:${granularity}`;
  const cached = getCached<FollowerGrowthDetailedResult>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [follows, unfollowLogs, totalFollowers] = await Promise.all([
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
    prisma.follow.count({ where: { followingUserId: userId } }),
  ]);

  // Group by date
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

  // Merge all dates
  const allDates = new Set([...Object.keys(newFollowsByDate), ...Object.keys(unfollowsByDate)]);
  const growth = Array.from(allDates)
    .sort()
    .map(date => {
      const newFollowers = newFollowsByDate[date] || 0;
      const unfollowCount = unfollowsByDate[date] || 0;
      return {
        date,
        newFollowers,
        unfollows: unfollowCount,
        netChange: newFollowers - unfollowCount,
      };
    });

  // Calculate retention rate
  const totalNewFollowers = follows.length;
  const totalUnfollows = unfollowLogs.length;
  const retentionRate = totalNewFollowers > 0
    ? Math.round(((totalNewFollowers - totalUnfollows) / totalNewFollowers) * 10000) / 100
    : 100;

  const result = {
    totalFollowers,
    periodNewFollowers: totalNewFollowers,
    periodUnfollows: totalUnfollows,
    periodNetChange: totalNewFollowers - totalUnfollows,
    retentionRate,
    growth,
  };

  setCache(cacheKey, result);
  return result;
};

// ============================================
// ENGAGEMENT ANALYTICS - Per-post breakdown
// ============================================

export const getEngagementByPost = async (userId: string, days = 30, limit = 20) => {
  const cacheKey = `engagement_posts:${userId}:${days}:${limit}`;
  const cached = getCached<EngagementByPostResult>(cacheKey);
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
    take: limit,
  });

  const postEngagement = posts.map(post => {
    const impressions = post.viewsCount || post._count?.views || 1;
    const interactions = (post._count?.likes || 0) + (post._count?.comments || 0) + (post._count?.savedBy || 0);
    const engagementRate = impressions > 0
      ? Math.round((interactions / impressions) * 10000) / 100
      : 0;

    return {
      id: post.id,
      content: post.content?.substring(0, 100) + (post.content?.length > 100 ? '...' : ''),
      mediaUrls: post.mediaUrls,
      type: post.type,
      createdAt: post.createdAt,
      likes: post._count?.likes || 0,
      comments: post._count?.comments || 0,
      saves: post._count?.savedBy || 0,
      shares: post.sharesCount || 0,
      impressions,
      engagementRate,
      engagementScore: (post._count?.likes || 0) + (post._count?.comments || 0) * 2 + (post._count?.savedBy || 0) * 3,
    };
  });

  // Sort by engagement score
  postEngagement.sort((a, b) => b.engagementScore - a.engagementScore);

  const result = { posts: postEngagement };
  setCache(cacheKey, result);
  return result;
};

// ============================================
// CONTENT REACH METRICS
// ============================================

export const getContentReach = async (userId: string, days = 30) => {
  const cacheKey = `content_reach:${userId}:${days}`;
  const cached = getCached<ContentReachResult>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [posts, profileVisits, totalFollowers] = await Promise.all([
    prisma.post.findMany({
      where: { userId, createdAt: { gte: startDate } },
      include: {
        _count: { select: { likes: true, comments: true, savedBy: true, views: true } },
      },
    }),
    prisma.profileVisit.count({
      where: { visitedUserId: userId, visitedAt: { gte: startDate } },
    }),
    prisma.follow.count({ where: { followingUserId: userId } }),
  ]);

  const totalImpressions = posts.reduce((sum, p) => sum + (p.viewsCount || 0), 0);
  const totalLikes = posts.reduce((sum, p) => sum + (p._count?.likes || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p._count?.comments || 0), 0);
  const totalSaves = posts.reduce((sum, p) => sum + (p._count?.savedBy || 0), 0);
  const totalShares = posts.reduce((sum, p) => sum + (p.sharesCount || 0), 0);
  const totalInteractions = totalLikes + totalComments + totalSaves + totalShares;

  const overallEngagementRate = totalImpressions > 0
    ? Math.round((totalInteractions / totalImpressions) * 10000) / 100
    : 0;

  // Get reach by post type
  const reachByType: Record<string, { count: number; impressions: number; engagement: number }> = {};
  posts.forEach(post => {
    const type = post.type || 'POST';
    if (!reachByType[type]) {
      reachByType[type] = { count: 0, impressions: 0, engagement: 0 };
    }
    reachByType[type].count++;
    reachByType[type].impressions += post.viewsCount || 0;
    reachByType[type].engagement += (post._count?.likes || 0) + (post._count?.comments || 0);
  });

  const typeBreakdown = Object.entries(reachByType).map(([type, data]) => ({
    type,
    count: data.count,
    impressions: data.impressions,
    engagement: data.engagement,
    avgEngagement: data.count > 0 ? Math.round(data.engagement / data.count) : 0,
  }));

  const result = {
    totalImpressions,
    totalLikes,
    totalComments,
    totalSaves,
    totalShares,
    totalInteractions,
    overallEngagementRate,
    profileVisits,
    totalFollowers,
    postsCount: posts.length,
    avgImpressionsPerPost: posts.length > 0 ? Math.round(totalImpressions / posts.length) : 0,
    typeBreakdown,
  };

  setCache(cacheKey, result);
  return result;
};

// ============================================
// OVERALL ENGAGEMENT METRICS
// ============================================

export const getOverallEngagement = async (userId: string, days = 30) => {
  const cacheKey = `overall_engagement:${userId}:${days}`;
  const cached = getCached<OverallEngagementResult>(cacheKey);
  if (cached) return cached;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Previous period for comparison
  const prevStartDate = new Date(startDate);
  prevStartDate.setDate(prevStartDate.getDate() - days);

  const [
    currentPosts,
    prevPosts,
    currentLikes,
    prevLikes,
    currentComments,
    prevComments,
    profileVisits,
    prevProfileVisits,
    totalFollowers,
  ] = await Promise.all([
    prisma.post.findMany({
      where: { userId, createdAt: { gte: startDate } },
      include: { _count: { select: { likes: true, comments: true, savedBy: true } } },
    }),
    prisma.post.findMany({
      where: { userId, createdAt: { gte: prevStartDate, lt: startDate } },
      include: { _count: { select: { likes: true, comments: true, savedBy: true } } },
    }),
    prisma.like.count({ where: { post: { userId }, createdAt: { gte: startDate } } }),
    prisma.like.count({ where: { post: { userId }, createdAt: { gte: prevStartDate, lt: startDate } } }),
    prisma.comment.count({ where: { post: { userId }, createdAt: { gte: startDate } } }),
    prisma.comment.count({ where: { post: { userId }, createdAt: { gte: prevStartDate, lt: startDate } } }),
    prisma.profileVisit.count({ where: { visitedUserId: userId, visitedAt: { gte: startDate } } }),
    prisma.profileVisit.count({ where: { visitedUserId: userId, visitedAt: { gte: prevStartDate, lt: startDate } } }),
    prisma.follow.count({ where: { followingUserId: userId } }),
  ]);

  const currentImpressions = currentPosts.reduce((sum, p) => sum + (p.viewsCount || 0), 0);
  const prevImpressions = prevPosts.reduce((sum, p) => sum + (p.viewsCount || 0), 0);
  const currentSaves = currentPosts.reduce((sum, p) => sum + (p._count?.savedBy || 0), 0);

  const currentInteractions = currentLikes + currentComments + currentSaves;
  const currentEngagementRate = currentImpressions > 0
    ? Math.round((currentInteractions / currentImpressions) * 10000) / 100
    : 0;

  const prevInteractions = prevLikes + prevComments;
  const prevEngagementRate = prevImpressions > 0
    ? Math.round((prevInteractions / prevImpressions) * 10000) / 100
    : 0;

  // Calculate percentage changes
  const calcChange = (current: number, prev: number): string => {
    if (prev === 0) return current > 0 ? '+100%' : '0%';
    const change = Math.round(((current - prev) / prev) * 100);
    return change >= 0 ? `+${change}%` : `${change}%`;
  };

  const result = {
    likes: { current: currentLikes, previous: prevLikes, change: calcChange(currentLikes, prevLikes) },
    comments: { current: currentComments, previous: prevComments, change: calcChange(currentComments, prevComments) },
    impressions: { current: currentImpressions, previous: prevImpressions, change: calcChange(currentImpressions, prevImpressions) },
    saves: { current: currentSaves, previous: 0, change: '+0%' },
    profileVisits: { current: profileVisits, previous: prevProfileVisits, change: calcChange(profileVisits, prevProfileVisits) },
    engagementRate: { current: currentEngagementRate, previous: prevEngagementRate, change: calcChange(currentEngagementRate, prevEngagementRate) },
    totalFollowers,
    postsInPeriod: currentPosts.length,
  };

  setCache(cacheKey, result);
  return result;
};

// ============================================
// MUTUAL / NOT FOLLOWING BACK
// ============================================

export const getFollowRelationships = async (userId: string) => {
  const cacheKey = `follow_relationships:${userId}`;
  const cached = getCached<FollowRelationshipsResult>(cacheKey);
  if (cached) return cached;

  const [following, followers] = await Promise.all([
    prisma.follow.findMany({
      where: { followerUserId: userId },
      select: { followingUserId: true },
    }),
    prisma.follow.findMany({
      where: { followingUserId: userId },
      select: { followerUserId: true },
    }),
  ]);

  const followingSet = new Set(following.map(f => f.followingUserId).filter(Boolean));
  const followerSet = new Set(followers.map(f => f.followerUserId).filter(Boolean));

  const mutualIds: string[] = [];
  const notFollowingBackIds: string[] = [];
  const notFollowedBackIds: string[] = [];

  followerSet.forEach(id => {
    if (id && followingSet.has(id)) {
      mutualIds.push(id);
    } else if (id) {
      notFollowingBackIds.push(id); // They follow you, you don't follow them
    }
  });

  followingSet.forEach(id => {
    if (id && !followerSet.has(id)) {
      notFollowedBackIds.push(id); // You follow them, they don't follow you
    }
  });

  // Fetch user details
  const allIds = [...new Set([...mutualIds, ...notFollowingBackIds, ...notFollowedBackIds])];
  const users = await prisma.user.findMany({
    where: { id: { in: allIds } },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      _count: { select: { followers: true, posts: true } },
    },
  });

  const userMap = new Map(users.map(u => [u.id, u]));

  const mapUsers = (ids: string[]) => ids
    .map(id => userMap.get(id))
    .filter(Boolean)
    .map(u => ({
      id: u!.id,
      username: u!.username,
      displayName: u!.displayName,
      avatar: u!.avatar,
      followerCount: u!._count?.followers || 0,
      postCount: u!._count?.posts || 0,
    }));

  const result = {
    mutual: mapUsers(mutualIds),
    notFollowingBack: mapUsers(notFollowingBackIds),
    notFollowedBack: mapUsers(notFollowedBackIds),
    counts: {
      mutual: mutualIds.length,
      notFollowingBack: notFollowingBackIds.length,
      notFollowedBack: notFollowedBackIds.length,
    },
  };

  setCache(cacheKey, result);
  return result;
};

// ============================================
// TRACK IMPRESSIONS PER POST
// ============================================

export const trackPostImpression = async (postId: string, viewerData?: {
  viewerId?: string;
  source?: string;
  isFollower?: boolean;
}) => {
  try {
    await prisma.post.update({
      where: { id: postId },
      data: { viewsCount: { increment: 1 } },
    });

    if (viewerData?.viewerId || viewerData?.source) {
      await prisma.postView.create({
        data: {
          postId,
          viewerId: viewerData.viewerId,
          source: viewerData.source,
          isFollower: viewerData.isFollower || false,
        },
      });
    }
  } catch (error) {
    logger.error('Error tracking post impression:', error);
  }
};

// ============================================
// HELPER: Date key by granularity
// ============================================

function getDateKey(date: Date, granularity: 'daily' | 'weekly' | 'monthly'): string {
  if (granularity === 'daily') {
    return date.toISOString().split('T')[0];
  } else if (granularity === 'weekly') {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
    return d.toISOString().split('T')[0];
  } else {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  }
}
