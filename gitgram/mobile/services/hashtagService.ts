import api from './api';

export const hashtagService = {
  getTrendingHashtags: async (limit = 50) => {
    const response = await api.get('/tags/trending', {
      params: { limit },
    });
    return response.data;
  },

  searchHashtags: async (query: string, page = 1, limit = 20) => {
    const response = await api.get('/tags/search', {
      params: { q: query, page, limit },
    });
    return response.data;
  },

  getHashtagPosts: async (hashtag: string, page = 1, limit = 20) => {
    const response = await api.get(`/tags/${hashtag}/posts`, {
      params: { page, limit },
    });
    return response.data;
  },
};

