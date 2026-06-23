import api from './api'

function normalizeReel(reel: any) {
  if (!reel) return reel

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
  }
}

export const reelService = {
  getReels: async (page = 1, limit = 10, userId?: string) => {
    const response = userId
      ? await api.get(`/v1/reels/user/${userId}`, {
          params: { page, limit },
        })
      : await api.get('/v1/reels/feed', {
          params: { page, limit },
        })
    return {
      ...response.data,
      reels: Array.isArray(response.data?.reels)
        ? response.data.reels.map(normalizeReel)
        : response.data?.reels,
    }
  },

  getReel: async (reelId: string) => {
    const response = await api.get(`/v1/reels/${reelId}`)
    const rawReel = response.data?.reel ?? response.data
    return {
      ...response.data,
      reel: normalizeReel(rawReel),
    }
  },

  createReel: async (formData: FormData) => {
    const response = await api.post('/v1/reels', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  likeReel: async (reelId: string) => {
    try {
      const response = await api.post(`/v1/reels/${reelId}/like`)
      return response.data
    } catch (error: any) {
      const message = error?.response?.data?.message || ''
      if (error?.response?.status === 400 && /already liked/i.test(message)) {
        const response = await api.delete(`/v1/reels/${reelId}/like`)
        return response.data
      }
      throw error
    }
  },

  getReelComments: async (reelId: string, page = 1, limit = 20) => {
    const response = await api.get(`/v1/reels/${reelId}/comments`, {
      params: { page, limit },
    })
    return response.data
  },

  createReelComment: async (reelId: string, content: string) => {
    const response = await api.post(`/v1/reels/${reelId}/comments`, {
      content,
    })
    return {
      ...response.data,
      comment: response.data?.comment ?? response.data,
    }
  },

  deleteReel: async (reelId: string) => {
    const response = await api.delete(`/v1/reels/${reelId}`)
    return response.data
  },

  updateReel: async (
    reelId: string,
    data: { caption?: string; hashtags?: string[]; title?: string; description?: string }
  ) => {
    const payload: Record<string, unknown> = {}
    if (data.title !== undefined) payload.title = data.title
    if (data.description !== undefined || data.caption !== undefined) {
      payload.description = data.description ?? data.caption
    }

    const response = await api.put(`/v1/reels/${reelId}`, payload)
    const rawReel = response.data?.reel ?? response.data
    return {
      ...response.data,
      reel: normalizeReel(rawReel),
    }
  },

  getReelLikes: async (reelId: string, page = 1, limit = 20) => {
    const response = await api.get(`/v1/reels/${reelId}/likes`, {
      params: { page, limit },
    })
    return response.data
  },

  shareReel: async (reelId: string, platform: 'copy_link' | 'native_share' = 'copy_link') => {
    const response = await api.post(`/v1/reels/${reelId}/share`, { platform })
    return response.data
  },

  searchMusic: async (query: string, limit = 20, offset = 0) => {
    const response = await api.get('/v1/music/search', {
      params: { q: query, limit, offset },
    })
    return response.data
  },

  getTrendingMusic: async (limit = 20, offset = 0) => {
    const response = await api.get('/v1/music/trending', {
      params: { limit, offset },
    })
    return response.data
  },

  getGenres: async () => {
    const response = await api.get('/v1/music/genres')
    return response.data
  },

  applyMusicToReel: async (reelId: string, musicId: string, startTime = 0) => {
    const response = await api.post(`/v1/reels/${reelId}/music`, {
      musicId,
      startTime,
    })
    const rawReel = response.data?.reel ?? response.data
    return {
      ...response.data,
      reel: normalizeReel(rawReel),
    }
  },

  removeMusicFromReel: async (reelId: string) => {
    const response = await api.delete(`/v1/reels/${reelId}/music`)
    const rawReel = response.data?.reel ?? response.data
    return {
      ...response.data,
      reel: normalizeReel(rawReel),
    }
  },
}
