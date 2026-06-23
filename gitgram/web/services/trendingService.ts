import api from './api'

export type TrendingTier = 'HOT_NOW' | 'TRENDING_TODAY' | 'THIS_WEEK' | 'RISING_STARS'

interface TrendingParams {
  tier?: TrendingTier
  language?: string
  topic?: string
  limit?: number
  offset?: number
}

export const trendingService = {
  getPosts: async (params?: TrendingParams) => {
    const { data } = await api.get('/v1/trending/posts', { params })
    return data?.data ?? data
  },

  getRepos: async (params?: TrendingParams) => {
    const { data } = await api.get('/v1/trending/repos', { params })
    return data?.data ?? data
  },

  getCreators: async (params?: TrendingParams) => {
    const { data } = await api.get('/v1/trending/creators', { params })
    return data?.data ?? data
  },
}
