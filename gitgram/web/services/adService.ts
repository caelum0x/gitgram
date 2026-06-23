import api from './api'

export const adService = {
  getActiveAds: async (page = 1, limit = 10) => {
    const response = await api.get('/v1/ads', {
      params: { page, limit },
    })
    return response.data
  },

  getAds: async (campaignId?: string, status?: string, page = 1, limit = 20) => {
    const response = await api.get('/v1/ads', {
      params: {
        campaignId,
        status,
        page,
        limit,
      },
    })
    return response.data
  },

  getAd: async (adId: string) => {
    const response = await api.get(`/v1/ads/${adId}`)
    return response.data
  },

  createAd: async (formData: FormData) => {
    const response = await api.post('/v1/ads', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  updateAd: async (adId: string, data: Record<string, unknown>) => {
    const response = await api.put(`/v1/ads/${adId}`, data)
    return response.data
  },

  deleteAd: async (adId: string) => {
    const response = await api.delete(`/v1/ads/${adId}`)
    return response.data
  },

  pauseAd: async (adId: string) => {
    const response = await api.post(`/v1/ads/${adId}/pause`)
    return response.data
  },

  resumeAd: async (adId: string) => {
    const response = await api.post(`/v1/ads/${adId}/resume`)
    return response.data
  },

  getMyAds: async () => {
    const response = await api.get('/v1/ads/my/ads')
    return response.data
  },

  getAdAnalytics: async (adId: string) => {
    const response = await api.get(`/v1/ads/${adId}/analytics`)
    return response.data
  },

  trackView: async (adId: string) => {
    const response = await api.post(`/v1/ads/${adId}/view`)
    return response.data
  },

  trackClick: async (adId: string) => {
    const response = await api.post(`/v1/ads/${adId}/click`)
    return response.data
  },

  trackConversion: async (adId: string, conversionData?: Record<string, unknown>) => {
    const response = await api.post(`/v1/ads/${adId}/conversion`, conversionData)
    return response.data
  },

  reportAd: async (adId: string, reason: string) => {
    const response = await api.post(`/v1/ads/${adId}/report`, { reason })
    return response.data
  },

  // Admin endpoints
  approveAd: async (adId: string) => {
    const response = await api.post(`/v1/ads/${adId}/approve`)
    return response.data
  },

  rejectAd: async (adId: string, reason: string) => {
    const response = await api.post(`/v1/ads/${adId}/reject`, { reason })
    return response.data
  },

  getPendingAds: async (page = 1, limit = 20) => {
    const response = await api.get('/v1/ads', {
      params: { status: 'pending', page, limit },
    })
    return response.data
  },

  getFeedAds: async (feedPosition: number, placement: 'feed' | 'reels' | 'stories' | 'explore' = 'feed', limit = 1) => {
    const response = await api.get('/v1/ads/feed', {
      params: {
        position: feedPosition,
        placement,
        limit,
      },
    })
    return response.data
  },

  trackImpression: async (adId: string, metadata?: Record<string, unknown>) => {
    const response = await api.post(`/v1/ads/${adId}/impression`, { metadata })
    return response.data
  },
}

