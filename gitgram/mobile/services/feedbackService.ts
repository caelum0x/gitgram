import api from './api';

export const feedbackService = {
  createFeedback: async (data: {
    type: 'bug' | 'feature' | 'other';
    title: string;
    content: string;
  }) => {
    const response = await api.post('/feedback', data);
    return response.data;
  },

  getFeedbacks: async (page = 1, limit = 20) => {
    const response = await api.get('/feedback', {
      params: { page, limit },
    });
    return response.data;
  },

  getFeedback: async (feedbackId: string) => {
    const response = await api.get(`/feedback/${feedbackId}`);
    return response.data;
  },
};

