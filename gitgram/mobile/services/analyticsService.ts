import api from './api';

export const analyticsService = {
  getAnalytics: async (days: number = 30) => {
    const { data } = await api.get(`/analytics?days=${days}`);
    return data;
  },

  getOverview: async (days: number = 30) => {
    const { data } = await api.get(`/analytics/overview?days=${days}`);
    return data;
  },

  getPostAnalytics: async (postId?: string, days: number = 30) => {
    const path = postId ? `/analytics/posts/${postId}` : '/analytics/posts';
    const { data } = await api.get(`${path}?days=${days}`);
    return data;
  },

  /**
   * Records that a batch of posts was actually seen in a feed. Impression
   * tracking is best-effort: a failed beacon must never disrupt scrolling, so
   * callers fire-and-forget and errors are swallowed here.
   */
  trackPostViews: async (
    postIds: string[],
    logContext: string,
  ): Promise<void> => {
    if (postIds.length === 0) {
      return;
    }
    try {
      await api.post('/analytics/post-views', {
        postIds,
        logContext,
      });
    } catch {
      // Impressions are non-critical; never surface this to the user.
    }
  },
};
