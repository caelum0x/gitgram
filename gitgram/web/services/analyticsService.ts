import api from './api'

export interface AnalyticsOverview {
  totalPosts: number
  totalReels: number
  totalFollowers: number
  totalFollowing: number
  totalLikes: number
  totalComments: number
  totalViews: number
  engagementRate: number
}

export interface DailyAnalytics {
  date: string
  views: number
  likes: number
  comments: number
  shares: number
}

export interface AnalyticsData {
  analytics: DailyAnalytics[]
  totals: {
    views: number
    likes: number
    comments: number
    shares: number
    followers: number
    reach: number
  }
}

export interface PostAnalytics {
  postId: string
  content: string
  mediaUrls: string[]
  createdAt: string
  viewsCount: number
  likesCount: number
  commentsCount: number
  savesCount: number
  sharesCount: number
  engagementRate: string
}

export interface FollowerGrowth {
  totalFollowers: number
  growth: { date: string; newFollowers: number }[]
  periodGain: number
}

export interface EngagementData {
  engagementData: {
    date: string
    likes: number
    comments: number
    views: number
    engagementRate: number
  }[]
  averageEngagementRate: number
}

export interface InsightsOverview {
  topPosts: { id: string; content: string; likes: number; comments: number; shares: number }[]
  demographics: {
    newFollowers: number
    activeFollowers: number
    influencers: number
    avgFollowerCount: number
  }
  performance: {
    totalPosts: number
    withMedia: { count: number; avgEngagement: number }
    withoutMedia: { count: number; avgEngagement: number }
    topHashtags: { name: string; count: number }[]
  }
}

// --- New types for follower/engagement analytics ---

export interface FollowerGrowthDetailed {
  totalFollowers: number
  periodNewFollowers: number
  periodUnfollows: number
  periodNetChange: number
  retentionRate: number
  growth: {
    date: string
    newFollowers: number
    unfollows: number
    netChange: number
  }[]
}

export interface FollowerDemographics {
  totalFollowers: number
  topInterests: { name: string; count: number; percentage: number }[]
  accountTypes: { type: string; count: number; percentage: number }[]
  avgFollowerCount: number
}

export interface FollowerQuality {
  followers: {
    userId: string
    username: string
    displayName: string | null
    avatar: string | null
    followerCount: number
    postCount: number
    likesGiven: number
    commentsGiven: number
    engagementScore: number
  }[]
  totalFollowers: number
  engagedFollowers: number
  engagementQualityRate: number
}

export interface UnfollowData {
  total: number
  timeline: { date: string; count: number }[]
  unfollows: {
    id: string
    user: { id: string; username: string; displayName?: string; avatar?: string }
    unfollowedAt: string
    followedAt: string | null
    followDurationDays: number | null
  }[]
}

export interface OverallEngagement {
  likes: { current: number; previous: number; change: string }
  comments: { current: number; previous: number; change: string }
  impressions: { current: number; previous: number; change: string }
  saves: { current: number; previous: number; change: string }
  profileVisits: { current: number; previous: number; change: string }
  engagementRate: { current: number; previous: number; change: string }
  totalFollowers: number
  postsInPeriod: number
}

export interface PostEngagement {
  id: string
  content: string
  mediaUrls: string[]
  type: string
  createdAt: string
  likes: number
  comments: number
  saves: number
  shares: number
  impressions: number
  engagementRate: number
  engagementScore: number
}

export interface ContentReach {
  totalImpressions: number
  totalLikes: number
  totalComments: number
  totalSaves: number
  totalShares: number
  totalInteractions: number
  overallEngagementRate: number
  profileVisits: number
  totalFollowers: number
  postsCount: number
  avgImpressionsPerPost: number
  typeBreakdown: { type: string; count: number; impressions: number; engagement: number; avgEngagement: number }[]
}

export interface BestPostingTimes {
  bestHours: { hour: number; label: string; avgEngagement: number; postCount: number }[]
  bestDays: { day: number; dayName: string; avgEngagement: number; postCount: number }[]
}

export interface FollowRelationships {
  mutual: FollowUser[]
  notFollowingBack: FollowUser[]
  notFollowedBack: FollowUser[]
  counts: {
    mutual: number
    notFollowingBack: number
    notFollowedBack: number
  }
}

export interface FollowUser {
  id: string
  username: string
  displayName: string | null
  avatar: string | null
  followerCount: number
  postCount: number
}

// --- Types for user-specific analytics (follow/follower & engagement surfaces) ---

export interface FollowerGrowthPoint {
  date: string
  newFollowers: number
  unfollows: number
  netChange: number
  cumulativeTotal: number
}

export interface UserFollowerAnalytics {
  totalFollowers: number
  totalFollowing: number
  followerGrowthRate: number
  periodNewFollowers: number
  periodUnfollows: number
  periodNetChange: number
  retentionRate: number
  dailyGrowth: FollowerGrowthPoint[]
  weeklyGrowth: FollowerGrowthPoint[]
  monthlyGrowth: FollowerGrowthPoint[]
  topFollowers: {
    userId: string
    username: string
    displayName: string | null
    avatar: string | null
    followerCount: number
  }[]
}

export interface InteractionBreakdown {
  type: string
  count: number
  percentage: number
}

export interface UserEngagementAnalytics {
  engagementRate: number
  avgLikesPerPost: number
  avgCommentsPerPost: number
  avgSavesPerPost: number
  totalInteractions: number
  totalLikes: number
  totalComments: number
  totalSaves: number
  totalShares: number
  totalViews: number
  interactionBreakdown: InteractionBreakdown[]
  dailyEngagement: {
    date: string
    likes: number
    comments: number
    saves: number
    views: number
    engagementRate: number
  }[]
  periodComparison: {
    current: { likes: number; comments: number; views: number; engagementRate: number }
    previous: { likes: number; comments: number; views: number; engagementRate: number }
    likesChange: string
    commentsChange: string
    viewsChange: string
    engagementRateChange: string
  }
}

export interface ContentPerformancePost {
  id: string
  content: string
  type: string
  createdAt: string
  likes: number
  comments: number
  saves: number
  shares: number
  views: number
  engagementRate: number
  engagementScore: number
}

export interface UserContentAnalytics {
  totalPosts: number
  avgEngagementPerPost: number
  topPosts: ContentPerformancePost[]
  performanceByType: {
    type: string
    count: number
    avgLikes: number
    avgComments: number
    avgViews: number
    avgEngagementRate: number
  }[]
  postingFrequency: { date: string; count: number }[]
  bestPerformingDay: string | null
  bestPerformingHour: number | null
}

export const analyticsService = {
  // Get overview stats (totals)
  getAnalyticsOverview: async (): Promise<AnalyticsOverview> => {
    const response = await api.get('/v1/analytics/overview')
    return response.data
  },

  // Get detailed analytics with time series data
  getAnalytics: async (days: number = 30): Promise<AnalyticsData> => {
    const response = await api.get(`/v1/analytics?days=${days}`)
    return response.data
  },

  // Get analytics for a specific post
  getPostAnalytics: async (postId: string): Promise<PostAnalytics> => {
    const response = await api.get(`/v1/analytics/posts/${postId}`)
    return response.data
  },

  // Get follower growth data
  getFollowerGrowth: async (days: number = 30): Promise<FollowerGrowth> => {
    const response = await api.get(`/v1/analytics/followers?days=${days}`)
    return response.data
  },

  // Get engagement rate over time
  getEngagementRate: async (days: number = 30): Promise<EngagementData> => {
    const response = await api.get(`/v1/analytics/engagement?days=${days}`)
    return response.data
  },

  // Get content insights (from insights endpoint)
  getInsightsOverview: async (days: number = 30): Promise<InsightsOverview> => {
    const response = await api.get(`/v1/insights?days=${days}`)
    return response.data
  },

  // Get top performing posts
  getTopPosts: async (limit: number = 10) => {
    const response = await api.get(`/v1/insights/top-posts?limit=${limit}`)
    return response.data
  },

  // Get audience demographics
  getAudienceDemographics: async () => {
    const response = await api.get('/v1/insights/audience')
    return response.data
  },

  // Get content performance metrics
  getContentPerformance: async (days: number = 30) => {
    const response = await api.get(`/v1/insights/performance?days=${days}`)
    return response.data
  },

  // --- NEW: Follower Analytics ---

  // Get detailed follower growth with net change
  getFollowerGrowthDetailed: async (days: number = 30, granularity: string = 'daily'): Promise<FollowerGrowthDetailed> => {
    const response = await api.get(`/v1/analytics/followers/growth?days=${days}&granularity=${granularity}`)
    return response.data
  },

  // Get follower demographics
  getFollowerDemographics: async (): Promise<FollowerDemographics> => {
    const response = await api.get('/v1/analytics/followers/demographics')
    return response.data
  },

  // Get follower quality scores
  getFollowerQuality: async (): Promise<FollowerQuality> => {
    const response = await api.get('/v1/analytics/followers/quality')
    return response.data
  },

  // Get unfollow tracking
  getUnfollows: async (days: number = 30): Promise<UnfollowData> => {
    const response = await api.get(`/v1/analytics/unfollows?days=${days}`)
    return response.data
  },

  // Get follow relationships (mutual, not following back, etc.)
  getFollowRelationships: async (): Promise<FollowRelationships> => {
    const response = await api.get('/v1/analytics/followers/relationships')
    return response.data
  },

  // --- NEW: Engagement Analytics ---

  // Get overall engagement with period comparison
  getOverallEngagement: async (days: number = 30): Promise<OverallEngagement> => {
    const response = await api.get(`/v1/analytics/engagement/overall?days=${days}`)
    return response.data
  },

  // Get per-post engagement breakdown
  getEngagementByPost: async (days: number = 30, limit: number = 20): Promise<{ posts: PostEngagement[] }> => {
    const response = await api.get(`/v1/analytics/engagement/posts?days=${days}&limit=${limit}`)
    return response.data
  },

  // Get content reach metrics
  getContentReach: async (days: number = 30): Promise<ContentReach> => {
    const response = await api.get(`/v1/analytics/engagement/reach?days=${days}`)
    return response.data
  },

  // Get best posting times
  getBestPostingTimes: async (): Promise<BestPostingTimes> => {
    const response = await api.get('/v1/analytics/engagement/best-times')
    return response.data
  },

  // Export analytics as CSV
  exportAnalyticsCSV: async (days: number = 30, type: string = 'all'): Promise<Blob> => {
    const response = await api.get(`/v1/analytics/export?days=${days}&type=${type}`, {
      responseType: 'blob',
    })
    return response.data
  },

  // --- User-specific analytics (follow/follower & engagement surfaces) ---

  // Get engagement analytics for a specific user
  getUserEngagement: async (userId: string, days: number = 30): Promise<UserEngagementAnalytics> => {
    const response = await api.get(`/v1/analytics/engagement/${userId}?days=${days}`)
    return response.data
  },

  // Get follower analytics for a specific user
  getUserFollowers: async (userId: string, days: number = 30): Promise<UserFollowerAnalytics> => {
    const response = await api.get(`/v1/analytics/followers/${userId}?days=${days}`)
    return response.data
  },

  // Get content performance for a specific user
  getUserContent: async (userId: string, days: number = 30, limit: number = 20): Promise<UserContentAnalytics> => {
    const response = await api.get(`/v1/analytics/content/${userId}?days=${days}&limit=${limit}`)
    return response.data
  },
}
