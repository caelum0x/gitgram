import api from './api'

export const storyService = {
  getStories: async () => {
    const { data } = await api.get('/v1/stories')
    return data
  },

  getStory: async (id: string) => {
    const { data } = await api.get(`/v1/stories/${id}`)
    return {
      ...data,
      story: data?.story ?? data,
    }
  },

  createStory: async (formData: FormData) => {
    const { data } = await api.post('/v1/stories', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  viewStory: async (id: string, payload?: Record<string, unknown>) => {
    const { data } = await api.post(`/v1/stories/${id}/view`, payload ?? {})
    return data
  },

  deleteStory: async (id: string) => {
    const { data } = await api.delete(`/v1/stories/${id}`)
    return data
  },

  updateStory: async (id: string, caption: string) => {
    const { data } = await api.put(`/v1/stories/${id}`, { caption })
    return data
  },

  getArchivedStories: async (targetUserId?: string) => {
    const { data } = await api.get('/v1/stories/archives', {
      params: targetUserId ? { targetUserId } : undefined,
    })
    return data
  },

  getStoryReplies: async (id: string) => {
    const { data } = await api.get(`/v1/stories/${id}/replies`)
    return {
      ...data,
      replies: Array.isArray(data) ? data : data?.replies ?? [],
    }
  },

  getStoryReactionSummary: async (id: string) => {
    const { data } = await api.get(`/v1/stories/${id}/reactions`)
    return {
      reactions: data?.reactions ?? data ?? {},
    }
  },

  getStoryAnalytics: async (id: string, params?: { page?: number; limit?: number }) => {
    const { data } = await api.get(`/v1/stories/${id}/analytics`, { params })
    return data
  },
}
