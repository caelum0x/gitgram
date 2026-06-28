import api from './api';
import { logger } from '../utils/logger';

function normalizeReel(reel: any) {
  if (!reel) return reel;

  return {
    ...reel,
    caption: reel.caption ?? reel.description ?? '',
    hashtags: Array.isArray(reel.hashtags) ? reel.hashtags : [],
    effectId: reel.effectId ?? 'none',
    trimStart: typeof reel.trimStart === 'number' ? reel.trimStart : 0,
    trimEnd: typeof reel.trimEnd === 'number' ? reel.trimEnd : null,
    thumbnailTime: typeof reel.thumbnailTime === 'number' ? reel.thumbnailTime : null,
    music: reel.musicTrackId
      ? {
          id: reel.musicTrackId,
          title: reel.musicTitle ?? '',
          artist: reel.musicArtist ?? '',
          previewUrl: reel.musicPreviewUrl ?? null,
          artworkUrl: reel.musicArtworkUrl ?? null,
          startTime: reel.musicStartTime ?? 0,
        }
      : null,
  };
}

export const reelService = {
  getReels: async (page = 1, limit = 10, userId?: string) => {
    const response = userId
      ? await api.get(`/reels/user/${userId}`, {
          params: { page, limit },
        })
      : await api.get('/reels/feed', {
          params: { page, limit },
        });
    return {
      ...response.data,
      reels: Array.isArray(response.data?.reels)
        ? response.data.reels.map(normalizeReel)
        : response.data?.reels,
    };
  },

  getReel: async (reelId: string) => {
    const response = await api.get(`/reels/${reelId}`);
    const rawReel = response.data?.reel ?? response.data;
    return {
      ...response.data,
      reel: normalizeReel(rawReel),
    };
  },

  createReel: async (formData: FormData) => {
    const response = await api.post('/reels', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  likeReel: async (reelId: string) => {
    try {
      const response = await api.post(`/reels/${reelId}/like`);
      return response.data;
    } catch (error: any) {
      const message = error?.response?.data?.message || '';
      if (error?.response?.status === 400 && /already liked/i.test(message)) {
        const response = await api.delete(`/reels/${reelId}/like`);
        return response.data;
      }
      throw error;
    }
  },

  getReelComments: async (reelId: string, page = 1, limit = 20) => {
    const response = await api.get(`/reels/${reelId}/comments`, {
      params: { page, limit },
    });
    return response.data;
  },

  createReelComment: async (reelId: string, content: string) => {
    const response = await api.post(`/reels/${reelId}/comments`, {
      content,
    });
    return {
      ...response.data,
      comment: response.data?.comment ?? response.data,
    };
  },

  deleteReel: async (reelId: string) => {
    const response = await api.delete(`/reels/${reelId}`);
    return response.data;
  },

  updateReel: async (
    reelId: string,
    data: { caption?: string; hashtags?: string[]; title?: string; description?: string }
  ) => {
    const payload: Record<string, unknown> = {};
    if (data.title !== undefined) payload.title = data.title;
    if (data.description !== undefined || data.caption !== undefined) {
      payload.description = data.description ?? data.caption;
    }

    const response = await api.put(`/reels/${reelId}`, payload);
    const rawReel = response.data?.reel ?? response.data;
    return {
      ...response.data,
      reel: normalizeReel(rawReel),
    };
  },

  getReelLikes: async (reelId: string, page = 1, limit = 20) => {
    const response = await api.get(`/reels/${reelId}/likes`, {
      params: { page, limit },
    });
    return response.data;
  },

  saveReel: async (reelId: string) => {
    const response = await api.post(`/reels/${reelId}/save`);
    return response.data;
  },

  unsaveReel: async (reelId: string) => {
    const response = await api.delete(`/reels/${reelId}/save`);
    return response.data;
  },

  reportReel: async (reelId: string, reason: string) => {
    const response = await api.post(`/reels/${reelId}/report`, { reason });
    return response.data;
  },

  getReelAnalytics: async (reelId: string) => {
    const response = await api.get(`/reels/${reelId}/analytics`);
    return response.data;
  },

  searchReels: async (query: string, page = 1, limit = 20) => {
    const response = await api.get('/reels/search', {
      params: { q: query, page, limit },
    });
    return response.data;
  },

  getReelReactions: async (reelId: string) => {
    const response = await api.get(`/reels/${reelId}/likes`);
    return {
      ...response.data,
      reactions: response.data?.likes ?? [],
    };
  },

  // Music-related methods - backed by the real /music endpoints
  // (mounted at /api/v1/music). On failure we return a structured empty result
  // carrying an `error` field so the music picker can render a real error/empty
  // state with a retry, rather than silently showing nothing.
  searchMusic: async (query: string, page = 1, limit = 20) => {
    try {
      const response = await api.get('/music/search', {
        params: { q: query, limit, offset: Math.max(0, page - 1) * limit },
      });
      return response.data;
    } catch (error: unknown) {
      logger.error('Music search API error:', error);
      return { tracks: [], total: 0, error: 'Music service unavailable' };
    }
  },

  getTrendingMusic: async (limit = 20) => {
    try {
      const response = await api.get('/music/trending', {
        params: { limit },
      });
      return response.data;
    } catch (error: unknown) {
      logger.error('Trending music API error:', error);
      return { tracks: [], total: 0, error: 'Music service unavailable' };
    }
  },

  getGenres: async () => {
    try {
      const response = await api.get('/music/genres');
      return response.data;
    } catch (error: unknown) {
      logger.error('Music genres API error:', error);
      return { genres: [], error: 'Music service unavailable' };
    }
  },

  applyMusicToReel: async (reelId: string, musicId: string, startTime = 0) => {
    const response = await api.post(`/reels/${reelId}/music`, {
      musicId,
      startTime,
    });
    const rawReel = response.data?.reel ?? response.data;
    return {
      ...response.data,
      reel: normalizeReel(rawReel),
    };
  },

  removeMusicFromReel: async (reelId: string) => {
    const response = await api.delete(`/reels/${reelId}/music`);
    const rawReel = response.data?.reel ?? response.data;
    return {
      ...response.data,
      reel: normalizeReel(rawReel),
    };
  },
};
