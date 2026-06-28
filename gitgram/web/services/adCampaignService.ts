import api from './api'

const BASE = '/v1/advertisements/campaigns'

export const adCampaignService = {
  createCampaign: async (data: {
    name: string
    description?: string
    type: 'post' | 'reel' | 'story' | 'banner' | 'video'
    budget: number
    dailyBudget?: number
    startDate?: string
    endDate?: string
    billingType?: 'cpc' | 'cpm' | 'cpa'
    targetAudience?: { location?: string; interests?: string[]; ageRange?: { min: number; max: number } }
  }) => {
    const response = await api.post(BASE, data)
    return response.data
  },

  getCampaigns: async (status?: string) => {
    const response = await api.get(BASE, {
      params: status ? { status } : {},
    })
    return response.data
  },

  getCampaign: async (campaignId: string) => {
    const response = await api.get(`${BASE}/${campaignId}`)
    return response.data
  },

  updateCampaign: async (campaignId: string, data: Record<string, unknown>) => {
    const response = await api.put(`${BASE}/${campaignId}`, data)
    return response.data
  },

  deleteCampaign: async (campaignId: string) => {
    const response = await api.delete(`${BASE}/${campaignId}`)
    return response.data
  },

  pauseCampaign: async (campaignId: string) => {
    const response = await api.post(`${BASE}/${campaignId}/pause`)
    return response.data
  },

  resumeCampaign: async (campaignId: string) => {
    const response = await api.post(`${BASE}/${campaignId}/resume`)
    return response.data
  },

  fundCampaign: async (campaignId: string, amount: number, paymentMethodId?: string) => {
    const response = await api.post(`${BASE}/${campaignId}/fund`, {
      amount,
      paymentMethodId,
    })
    return response.data
  },

  getCampaignAnalytics: async (campaignId: string) => {
    const response = await api.get(`${BASE}/${campaignId}/analytics`)
    return response.data
  },
}
