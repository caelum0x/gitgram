import api from './api';

export const postService = {
  getFollowingFeed: async (page = 1, limit = 20) => {
    const response = await api.get('/v1/posts/feed', {
      params: { page, limit },
    });
    return response.data;
  },

  getPosts: async (page = 1, limit = 10, userId?: string) => {
    const params: any = { page, limit };
    if (userId) {
      params.userId = userId;
    }
    const response = await api.get('/v1/posts', { params });
    return response.data;
  },

  createPost: async (data: FormData) => {
    const response = await api.post('/v1/posts', data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  likePost: async (postId: string) => {
    const response = await api.post(`/v1/posts/${postId}/like`);
    return response.data;
  },

  getComments: async (postId: string, page = 1, limit = 20) => {
    const response = await api.get(`/v1/posts/${postId}/comments`, {
      params: { page, limit },
    });
    return response.data;
  },

  createComment: async (postId: string, content: string) => {
    const response = await api.post(`/v1/posts/${postId}/comments`, { content });
    return response.data;
  },

  deletePost: async (postId: string) => {
    const response = await api.delete(`/v1/posts/${postId}`);
    return response.data;
  },

  searchPosts: async (query: string, page = 1, limit = 20) => {
    const response = await api.get('/v1/posts/search', {
      params: { q: query, page, limit },
    });
    return response.data;
  },

  getPost: async (postId: string) => {
    const response = await api.get(`/v1/posts/${postId}`);
    return response.data;
  },

  updatePost: async (postId: string, data: { content?: string; hashtags?: string[] }) => {
    const response = await api.put(`/v1/posts/${postId}`, data);
    return response.data;
  },

  retweetPost: async (postId: string, comment?: string) => {
    const response = await api.post(`/v1/posts/${postId}/retweet`, { comment });
    return response.data;
  },

  savePost: async (postId: string) => {
    const response = await api.post(`/v1/posts/${postId}/save`);
    return response.data;
  },

  getSavedPosts: async (page = 1, limit = 20) => {
    const response = await api.get('/v1/posts/saved', {
      params: { page, limit },
    });
    return response.data;
  },

  getPostShares: async (postId: string, page = 1, limit = 20) => {
    const response = await api.get(`/v1/posts/${postId}/shares`, {
      params: { page, limit },
    });
    return response.data;
  },

  getPostLikes: async (postId: string, page = 1, limit = 20) => {
    const response = await api.get(`/v1/posts/${postId}/likes`, {
      params: { page, limit },
    });
    return response.data;
  },

  isPostSaved: async (postId: string) => {
    // Check if post is in saved posts
    const response = await api.get('/v1/posts/saved', {
      params: { postId },
    });
    return response.data;
  },

  getTrending: async (timeframe: 'today' | 'week' | 'month' = 'today', page = 1, limit = 20) => {
    const response = await api.get('/v1/posts/trending', {
      params: { timeframe, page, limit },
    });
    return response.data;
  },

  getArchivedPosts: async (page = 1, limit = 20) => {
    const response = await api.get('/v1/posts/archived', {
      params: { page, limit },
    });
    return response.data;
  },

  getTaggedPosts: async (userId: string, page = 1, limit = 20) => {
    const response = await api.get(`/v1/posts/tagged/${userId}`, {
      params: { page, limit },
    });
    return response.data;
  },

  reportPost: async (postId: string, data: { reason: string; details?: string }) => {
    const response = await api.post(`/v1/posts/${postId}/report`, data);
    return response.data;
  },

  // Comment actions
  likeComment: async (postId: string, commentId: string) => {
    const response = await api.post(`/v1/posts/${postId}/comments/${commentId}/like`);
    return response.data;
  },

  deleteComment: async (postId: string, commentId: string) => {
    const response = await api.delete(`/v1/posts/${postId}/comments/${commentId}`);
    return response.data;
  },

  updateComment: async (postId: string, commentId: string, content: string) => {
    const response = await api.put(`/v1/posts/${postId}/comments/${commentId}`, { content });
    return response.data;
  },

  getCommentLikes: async (postId: string, commentId: string, page = 1, limit = 20) => {
    const response = await api.get(`/v1/posts/${postId}/comments/${commentId}/likes`, {
      params: { page, limit },
    });
    return response.data;
  },
};

