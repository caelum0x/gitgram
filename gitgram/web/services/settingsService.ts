import api from './api'

export const settingsService = {
  getAccountSettings: async () => {
    const response = await api.get('/v1/settings/account')
    return response.data
  },

  updateAccountSettings: async (data: {
    isFrozen?: boolean
    privacySettings?: { isPrivate?: boolean; hideStories?: boolean; closeFriends?: string[] }
    appearanceSettings?: { theme?: string; fontSize?: string }
    languageSettings?: { language?: string; region?: string }
  }) => {
    const response = await api.put('/v1/settings/account', data)
    return response.data
  },

  freezeAccount: async () => {
    const response = await api.post('/v1/settings/account/freeze')
    return response.data
  },

  unfreezeAccount: async () => {
    const response = await api.post('/v1/settings/account/unfreeze')
    return response.data
  },

  getNotificationPreferences: async () => {
    const response = await api.get('/v1/settings/notifications')
    return response.data
  },

  updateNotificationPreferences: async (data: {
    likes?: boolean
    comments?: boolean
    follows?: boolean
    messages?: boolean
    mentions?: boolean
    repoStars?: boolean
    pushEnabled?: boolean
    emailWeeklyDigest?: boolean
    emailActivitySummary?: boolean
    emailSecurityAlerts?: boolean
    storyViews?: boolean
    storyReplies?: boolean
    quietHoursEnabled?: boolean
    quietHoursFrom?: string
    quietHoursTo?: string
  }) => {
    const response = await api.put('/v1/settings/notifications', data)
    return response.data
  },

  getPrivacySettings: async () => {
    const response = await api.get('/v1/settings/privacy')
    return response.data
  },

  updatePrivacySettings: async (data: Record<string, unknown>) => {
    const response = await api.put('/v1/settings/privacy', data)
    return response.data
  },

  getAppearanceSettings: async () => {
    const response = await api.get('/v1/settings/appearance')
    return response.data
  },

  updateAppearanceSettings: async (data: { theme?: string; fontSize?: string }) => {
    const response = await api.put('/v1/settings/appearance', data)
    return response.data
  },

  getLanguageSettings: async () => {
    const response = await api.get('/v1/settings/language')
    return response.data
  },

  updateLanguageSettings: async (data: { language: string; region?: string }) => {
    const response = await api.put('/v1/settings/language', data)
    return response.data
  },

  getDataSettings: async () => {
    const response = await api.get('/v1/settings/data')
    return response.data
  },

  updateDataSettings: async (data: {
    clearCache?: boolean
    downloadHistory?: boolean
  }) => {
    const response = await api.put('/v1/settings/data', data)
    return response.data
  },

  getActiveSessions: async () => {
    const response = await api.get('/v1/settings/sessions')
    return response.data
  },

  revokeSession: async (sessionId: string) => {
    const response = await api.delete(`/v1/settings/sessions/${sessionId}`)
    return response.data
  },

  getFeedSettings: async () => {
    const response = await api.get('/v1/users/feed-settings')
    return response.data
  },

  updateFeedSettings: async (data: Record<string, unknown>) => {
    const response = await api.patch('/v1/users/feed-settings', data)
    return response.data
  },
}

