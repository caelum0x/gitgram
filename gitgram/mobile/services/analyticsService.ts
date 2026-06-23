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
};
