import api from './api';

export const adService = {
  createAd: async (data: {
    campaignId: string;
    postId?: string;
    reelId?: string;
    storyId?: string;
    title?: string;
    content?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'carousel';
    callToAction?: string;
    destinationUrl?: string;
    placement?: string[];
    targetAudience?: any;
    priority?: number;
  }, mediaFile?: any) => {
    const formData = new FormData();
    
    Object.keys(data).forEach((key) => {
      const value = (data as any)[key];
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });

    if (mediaFile) {
      formData.append('media', {
        uri: mediaFile.uri,
        type: mediaFile.type || 'image/jpeg',
        name: mediaFile.fileName || 'media.jpg',
      } as any);
    }

    const response = await api.post('/v1/ads', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getAds: async (campaignId?: string, status?: string, page = 1, limit = 20) => {
    const response = await api.get('/v1/ads', {
      params: {
        campaignId,
        status,
        page,
        limit,
      },
    });
    return response.data;
  },

  getAd: async (adId: string) => {
    const response = await api.get(`/v1/ads/${adId}`);
    return response.data;
  },

  updateAd: async (adId: string, data: any) => {
    const response = await api.put(`/v1/ads/${adId}`, data);
    return response.data;
  },

  deleteAd: async (adId: string) => {
    const response = await api.delete(`/v1/ads/${adId}`);
    return response.data;
  },

  pauseAd: async (adId: string) => {
    const response = await api.post(`/v1/ads/${adId}/pause`);
    return response.data;
  },

  resumeAd: async (adId: string) => {
    const response = await api.post(`/v1/ads/${adId}/resume`);
    return response.data;
  },

  getAdAnalytics: async (adId: string) => {
    const response = await api.get(`/v1/ads/${adId}/analytics`);
    return response.data;
  },

  getFeedAds: async (feedPosition: number, placement: 'feed' | 'reels' | 'stories' | 'explore' = 'feed', limit = 1) => {
    const response = await api.get('/v1/ads/feed', {
      params: {
        position: feedPosition,
        placement,
        limit,
      },
    });
    return response.data;
  },

  trackImpression: async (adId: string, metadata?: any) => {
    const response = await api.post(`/v1/ads/${adId}/impression`, { metadata });
    return response.data;
  },

  trackClick: async (adId: string, metadata?: any) => {
    const response = await api.post(`/v1/ads/${adId}/click`, { metadata });
    return response.data;
  },

  trackConversion: async (adId: string, metadata?: any) => {
    const response = await api.post(`/v1/ads/${adId}/conversion`, { metadata });
    return response.data;
  },

  getMyAds: async (page = 1, limit = 20) => {
    const response = await api.get('/v1/ads/my', {
      params: { page, limit },
    });
    return response.data;
  },

  getPreferences: async () => {
    const response = await api.get('/v1/ads/preferences');
    return response.data;
  },

  updatePreferences: async (preferences: any) => {
    const response = await api.put('/v1/ads/preferences', preferences);
    return response.data;
  },

  reportAd: async (adId: string, data: { reason: string; details?: string }) => {
    const response = await api.post(`/v1/ads/${adId}/report`, data);
    return response.data;
  },

  trackView: async (adId: string, metadata?: any) => {
    const response = await api.post(`/v1/ads/${adId}/view`, { metadata });
    return response.data;
  },
};
