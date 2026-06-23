import api from './api';

export const storyService = {
  getStories: async (page = 1, limit = 100) => {
    const response = await api.get('/v1/stories', {
      params: { page, limit },
    });
    return response.data;
  },

  getStory: async (storyId: string) => {
    const response = await api.get(`/v1/stories/${storyId}`);
    return response.data;
  },

  createStory: async (formData: FormData) => {
    const response = await api.post('/v1/stories', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  viewStory: async (storyId: string) => {
    const response = await api.post(`/v1/stories/${storyId}/view`);
    return response.data;
  },

  getStoryReplies: async (storyId: string) => {
    const response = await api.get(`/v1/stories/${storyId}/replies`);
    return response.data;
  },

  getStoryReactions: async (storyId: string) => {
    const response = await api.get(`/v1/stories/${storyId}/reactions`);
    return response.data;
  },

  getStoryInsights: async (storyId: string) => {
    const response = await api.get(`/v1/stories/${storyId}/insights`);
    return response.data;
  },

  getArchivedStories: async () => {
    const response = await api.get('/v1/stories/archived');
    return response.data;
  },

  getHighlights: async () => {
    const response = await api.get('/v1/stories/highlights');
    return response.data;
  },

  createHighlight: async (data: { name: string; storyIds: string[] }) => {
    const response = await api.post('/v1/stories/highlights', data);
    return response.data;
  },

  getStorySettings: async () => {
    const response = await api.get('/v1/stories/settings');
    return response.data;
  },

  updateStorySettings: async (settings: {
    allowReplies?: boolean;
    allowReactions?: boolean;
    saveToArchive?: boolean;
    hideStoryFrom?: string[];
  }) => {
    const response = await api.put('/v1/stories/settings', settings);
    return response.data;
  },

  deleteStory: async (storyId: string) => {
    const response = await api.delete(`/v1/stories/${storyId}`);
    return response.data;
  },
};

