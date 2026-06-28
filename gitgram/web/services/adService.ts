import api from './api'

const BASE = '/v1/advertisements'

export const adService = {
  getActiveAds: async (page = 1, limit = 10) => {
    const response = await api.get(`${BASE}/active`, {
      params: { page, limit },
    })
    return response.data
  },

  getAds: async (campaignId?: string, status?: string, page = 1, limit = 20) => {
    const response = await api.get(BASE, {
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
    const response = await api.get(`${BASE}/${adId}`)
    return response.data
  },

  createAd: async (formData: FormData) => {
    const response = await api.post(BASE, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  updateAd: async (adId: string, data: Record<string, unknown>) => {
    const response = await api.put(`${BASE}/${adId}`, data)
    return response.data
  },

  deleteAd: async (adId: string) => {
    const response = await api.delete(`${BASE}/${adId}`)
    return response.data
  },

  pauseAd: async (adId: string) => {
    const response = await api.post(`${BASE}/${adId}/pause`)
    return response.data
  },

  resumeAd: async (adId: string) => {
    const response = await api.post(`${BASE}/${adId}/resume`)
    return response.data
  },

  getMyAds: async () => {
    const response = await api.get(`${BASE}/my/ads`)
    return response.data
  },

  getAdAnalytics: async (adId: string) => {
    const response = await api.get(`${BASE}/${adId}/analytics`)
    return response.data
  },

  trackView: async (adId: string) => {
    const response = await api.post(`${BASE}/${adId}/view`)
    return response.data
  },

  trackClick: async (adId: string) => {
    const response = await api.post(`${BASE}/${adId}/click`)
    return response.data
  },

  trackConversion: async (adId: string, conversionData?: Record<string, unknown>) => {
    const response = await api.post(`${BASE}/${adId}/conversion`, conversionData)
    return response.data
  },

  reportAd: async (adId: string, reason: string) => {
    const response = await api.post(`${BASE}/${adId}/report`, { reason })
    return response.data
  },

  // Admin / moderator endpoints
  getPendingAds: async (page = 1, limit = 20) => {
    const response = await api.get(`${BASE}/admin/pending`, {
      params: { page, limit },
    })
    return response.data
  },

  approveAd: async (adId: string) => {
    const response = await api.post(`${BASE}/admin/${adId}/approve`)
    return response.data
  },

  rejectAd: async (adId: string, reason: string) => {
    const response = await api.post(`${BASE}/admin/${adId}/reject`, { reason })
    return response.data
  },

  getFeedAds: async (
    feedPosition: number,
    placement: 'feed' | 'reels' | 'stories' | 'explore' = 'feed',
    limit = 1,
  ) => {
    const response = await api.get(`${BASE}/feed`, {
      params: {
        position: feedPosition,
        placement,
        limit,
      },
    })
    return response.data
  },

  trackImpression: async (adId: string, metadata?: Record<string, unknown>) => {
    const response = await api.post(`${BASE}/${adId}/impression`, { metadata })
    return response.data
  },
}
