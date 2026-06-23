import api from './api';

export const adCampaignService = {
  createCampaign: async (data: {
    name: string;
    description?: string;
    type: 'post' | 'reel' | 'story' | 'banner' | 'video';
    budget: number;
    dailyBudget?: number;
    startDate?: string;
    endDate?: string;
    billingType?: 'cpc' | 'cpm' | 'cpa';
    targetAudience?: any;
  }) => {
    const response = await api.post('/v1/ads/campaigns', data);
    return response.data;
  },

  getCampaigns: async (status?: string) => {
    const response = await api.get('/v1/ads/campaigns', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  getCampaign: async (campaignId: string) => {
    const response = await api.get(`/v1/ads/campaigns/${campaignId}`);
    return response.data;
  },

  updateCampaign: async (campaignId: string, data: any) => {
    const response = await api.put(`/v1/ads/campaigns/${campaignId}`, data);
    return response.data;
  },

  deleteCampaign: async (campaignId: string) => {
    const response = await api.delete(`/v1/ads/campaigns/${campaignId}`);
    return response.data;
  },

  pauseCampaign: async (campaignId: string) => {
    const response = await api.post(`/v1/ads/campaigns/${campaignId}/pause`);
    return response.data;
  },

  resumeCampaign: async (campaignId: string) => {
    const response = await api.post(`/v1/ads/campaigns/${campaignId}/resume`);
    return response.data;
  },

  fundCampaign: async (campaignId: string, amount: number, paymentMethodId?: string) => {
    const response = await api.post(`/v1/ads/campaigns/${campaignId}/fund`, {
      amount,
      paymentMethodId,
    });
    return response.data;
  },

  getCampaignAnalytics: async (campaignId: string) => {
    const response = await api.get(`/v1/ads/campaigns/${campaignId}/analytics`);
    return response.data;
  },
};

