import api from './api';

export const scheduledPostsService = {
  getScheduledPosts: async (status?: 'pending' | 'published' | 'failed') => {
    const params: any = {};
    if (status) params.status = status;
    const { data } = await api.get('/scheduled-posts', { params });
    return data;
  },

  getScheduledPost: async (id: string) => {
    const { data } = await api.get(`/scheduled-posts/${id}`);
    return data;
  },

  createScheduledPost: async (postData: {
    content: string;
    mediaUrls?: string[];
    hashtags?: string[];
    location?: { name: string; lat: number; lng: number };
    scheduledAt?: string;
    scheduledFor?: string;
  }) => {
    const { data } = await api.post('/scheduled-posts', postData);
    return data;
  },

  updateScheduledPost: async (id: string, postData: {
    content?: string;
    mediaUrls?: string[];
    hashtags?: string[];
    scheduledAt?: string;
    scheduledFor?: string;
  }) => {
    const { data } = await api.put(`/scheduled-posts/${id}`, postData);
    return data;
  },

  deleteScheduledPost: async (id: string) => {
    const { data } = await api.delete(`/scheduled-posts/${id}`);
    return data;
  },

  retryScheduledPost: async (id: string) => {
    const { data } = await api.post(`/scheduled-posts/${id}/retry`);
    return data;
  },

  getFailedPosts: async () => {
    const { data } = await api.get('/scheduled-posts/failed');
    return data;
  },
};
