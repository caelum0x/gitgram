import api from './api';

export const momentService = {
  getMoments: async (page = 1, limit = 20, userId?: string) => {
    const params: any = { page, limit };
    if (userId) {
      params.userId = userId;
    }
    const response = await api.get('/v1/moments', { params });
    return response.data;
  },

  getMoment: async (momentId: string) => {
    const response = await api.get(`/v1/moments/${momentId}`);
    return response.data;
  },

  createMoment: async (formData: FormData) => {
    const response = await api.post('/v1/moments', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  likeMoment: async (momentId: string) => {
    const response = await api.post(`/v1/moments/${momentId}/like`);
    return response.data;
  },

  deleteMoment: async (momentId: string) => {
    const response = await api.delete(`/v1/moments/${momentId}`);
    return response.data;
  },

  getMomentReactions: async (momentId: string) => {
    const response = await api.get(`/v1/moments/${momentId}/reactions`);
    return response.data;
  },
};

