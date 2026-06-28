import api from './api';

export const storyService = {
  getStories: async (page = 1, limit = 100) => {
    const response = await api.get('/stories', {
      params: { page, limit },
    });
    return response.data;
  },

  getStory: async (storyId: string) => {
    const response = await api.get(`/stories/${storyId}`);
    return response.data;
  },

  createStory: async (formData: FormData) => {
    const response = await api.post('/stories', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  viewStory: async (storyId: string) => {
    const response = await api.post(`/stories/${storyId}/view`);
    return response.data;
  },

  getStoryReplies: async (storyId: string) => {
    const response = await api.get(`/stories/${storyId}/replies`);
    return response.data;
  },

  getStoryReactions: async (storyId: string) => {
    const response = await api.get(`/stories/${storyId}/reactions`);
    return response.data;
  },

  getStoryInsights: async (storyId: string) => {
    const response = await api.get(`/stories/${storyId}/insights`);
    return response.data;
  },

  getArchivedStories: async () => {
    const response = await api.get('/stories/archived');
    return response.data;
  },

  getHighlights: async () => {
    const response = await api.get('/stories/highlights');
    return response.data;
  },

  getHighlight: async (highlightId: string) => {
    const response = await api.get(`/stories/highlights/${highlightId}`);
    return response.data;
  },

  createHighlight: async (data: { name: string; storyIds: string[] }) => {
    const response = await api.post('/stories/highlights', data);
    return response.data;
  },

  getStorySettings: async () => {
    const response = await api.get('/stories/settings');
    return response.data;
  },

  updateStorySettings: async (settings: {
    allowReplies?: boolean;
    allowReactions?: boolean;
    saveToArchive?: boolean;
    hideStoryFrom?: string[];
  }) => {
    const response = await api.put('/stories/settings', settings);
    return response.data;
  },

  deleteStory: async (storyId: string) => {
    const response = await api.delete(`/stories/${storyId}`);
    return response.data;
  },
};

