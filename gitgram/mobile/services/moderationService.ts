import api from './api';

export const moderationService = {
  getQueue: async (action: string = 'review') => {
    const { data } = await api.get(`/moderation/queue?action=${action}`);
    return data;
  },

  getStats: async () => {
    const { data } = await api.get('/moderation/stats');
    return data;
  },

  reviewContent: async (id: string, decision: 'approve' | 'reject') => {
    const { data } = await api.post(`/moderation/review/${id}`, { decision });
    return data;
  },

  checkUser: async (userId: string) => {
    const { data } = await api.get(`/moderation/check-user/${userId}`);
    return data;
  },
};
