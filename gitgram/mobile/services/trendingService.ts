import api from './api';

export interface TrendingPost {
  id: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
    verified: boolean;
  };
}

export interface TrendingHashtag {
  id: string;
  name: string;
  count?: number;
  _count?: {
    posts: number;
  };
}

export interface TrendingUser {
  id: string;
  username: string;
  avatar?: string;
  verified: boolean;
  bio?: string;
  _count: {
    followers: number;
    posts: number;
  };
}

export const trendingService = {
  /**
   * Get trending posts
   * Uses /api/v1/posts/trending endpoint
   * Backend may return array directly or { posts: [...] }
   */
  getTrendingPosts: async (
    timeframe: 'today' | 'week' | 'month' = 'week',
    page = 1,
    limit = 20
  ): Promise<{ posts: TrendingPost[]; hasMore: boolean }> => {
    const response = await api.get('/posts/trending', {
      params: { timeframe, page, limit },
    });
    // Normalize response - backend may return array directly or { posts: [...] }
    const data = response.data;
    if (Array.isArray(data)) {
      return { posts: data, hasMore: data.length >= limit };
    }
    return { posts: data.posts || [], hasMore: data.hasMore ?? false };
  },

  /**
   * Get trending hashtags
   * Uses /api/v1/tags/trending endpoint
   */
  getTrendingHashtags: async (
    limit = 50
  ): Promise<TrendingHashtag[]> => {
    const response = await api.get('/tags/trending', {
      params: { limit },
    });
    return response.data;
  },

  /**
   * Get trending/popular users
   * Uses /api/v1/popular/users endpoint
   */
  getTrendingUsers: async (
    limit = 20
  ): Promise<{ users: TrendingUser[] }> => {
    const response = await api.get('/popular/users', {
      params: { limit },
    });
    return response.data;
  },

  /**
   * Get popular posts (alternative trending)
   * Uses /api/v1/popular/posts endpoint
   */
  getPopularPosts: async (
    limit = 20,
    offset = 0
  ): Promise<{ posts: TrendingPost[]; hasMore: boolean }> => {
    const response = await api.get('/popular/posts', {
      params: { limit, offset },
    });
    return response.data;
  },

  /**
   * Get popular hashtags (alternative trending)
   * Uses /api/v1/popular/hashtags endpoint
   */
  getPopularHashtags: async (
    limit = 10
  ): Promise<{ hashtags: TrendingHashtag[] }> => {
    const response = await api.get('/popular/hashtags', {
      params: { limit },
    });
    return response.data;
  },
};
