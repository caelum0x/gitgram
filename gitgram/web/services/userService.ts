import api from './api'

export const userService = {
  getProfile: async (username: string) => {
    const { data } = await api.get(`/users/${username}`)
    return data
  },

  updateProfile: async (updates: { username?: string; bio?: string; website?: string; avatar?: string }) => {
    const { data } = await api.put('/users/profile', updates)
    return data
  },

  patchProfile: async (updates: {
    displayName?: string
    username?: string
    bio?: string
    website?: string
    githubUsername?: string
    twitterHandle?: string
    location?: string
    pronouns?: string
    jobTitle?: string
    company?: string
    isPrivate?: boolean
  }) => {
    const { data } = await api.patch('/v1/users/profile', updates)
    return data
  },

  uploadAvatarFile: async (file: File) => {
    const formData = new FormData()
    formData.append('avatar', file)
    const { data } = await api.post('/v1/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data as { avatarUrl: string }
  },

  uploadAvatar: async (formData: FormData) => {
    const { data } = await api.post('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  follow: async (userId: string) => {
    const { data } = await api.post(`/users/${userId}/follow`)
    return data
  },

  unfollow: async (userId: string) => {
    await api.delete(`/users/${userId}/follow`)
  },

  getFollowers: async (userId: string, page = 1, limit = 20) => {
    const { data } = await api.get(`/users/${userId}/followers`, { params: { page, limit } })
    return data
  },

  getFollowing: async (userId: string, page = 1, limit = 20) => {
    const { data } = await api.get(`/users/${userId}/following`, { params: { page, limit } })
    return data
  },

  searchUsers: async (query: string, page = 1, limit = 20) => {
    const { data } = await api.get('/search/users', { params: { q: query, page, limit } })
    return data
  },

  blockUser: async (userId: string) => {
    const { data } = await api.post(`/user-actions/block/${userId}`)
    return data
  },

  unblockUser: async (userId: string) => {
    await api.delete(`/user-actions/block/${userId}`)
  },

  // Account management
  deleteAccount: async (password: string) => {
    const { data } = await api.delete('/v1/auth/account', { data: { password } })
    return data
  },

  scheduleAccountDeletion: async (password: string, reason?: string) => {
    const { data } = await api.post('/v1/users/delete', { password, reason })
    return data
  },

  cancelAccountDeletion: async () => {
    const { data } = await api.delete('/v1/users/delete')
    return data
  },

  getDeletionStatus: async () => {
    const { data } = await api.get('/v1/users/deletion-status')
    return data
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await api.post('/v1/auth/change-password', {
      currentPassword,
      newPassword,
    })
    return data
  },

  // Follow requests (for private accounts)
  sendFollowRequest: async (targetId: string) => {
    const { data } = await api.post('/v1/follow-requests', { targetId })
    return data
  },

  getFollowRequests: async () => {
    const { data } = await api.get('/v1/follow-requests')
    return data
  },

  getFollowRequestStatus: async (targetId: string) => {
    const { data } = await api.get(`/v1/follow-requests/status/${targetId}`)
    return data
  },

  acceptFollowRequest: async (requestId: string) => {
    const { data } = await api.post(`/v1/follow-requests/${requestId}/accept`)
    return data
  },

  rejectFollowRequest: async (requestId: string) => {
    const { data } = await api.post(`/v1/follow-requests/${requestId}/reject`)
    return data
  },

  cancelFollowRequest: async (targetId: string) => {
    const { data } = await api.delete(`/v1/follow-requests/${targetId}`)
    return data
  },

  // Content insights
  getInsightsOverview: async (days: number = 30) => {
    const { data } = await api.get('/v1/insights', { params: { days } })
    return data
  },

  getTopPosts: async (limit: number = 10) => {
    const { data } = await api.get('/v1/insights/top-posts', { params: { limit } })
    return data
  },

  getAudienceDemographics: async () => {
    const { data } = await api.get('/v1/insights/audience')
    return data
  },

  getContentPerformance: async (days: number = 30) => {
    const { data } = await api.get('/v1/insights/performance', { params: { days } })
    return data
  },

  // Data export (GDPR). Backend flow is async: request -> poll status -> download
  // once ready. See backend/src/routes/dataExport.ts.
  requestDataExport: async (): Promise<{ success: boolean; data: { exportId: string; estimatedTime: string; createdAt: string } }> => {
    const { data } = await api.post('/v1/data-export/request')
    return data
  },

  getExportStatus: async (
    exportId: string
  ): Promise<{ success: boolean; data: { exportId: string; status: 'processing' | 'ready' | 'expired' | 'failed'; progress: number } }> => {
    const { data } = await api.get(`/v1/data-export/${exportId}/status`)
    return data
  },

  downloadDataExport: async (exportId: string): Promise<Blob> => {
    const { data } = await api.get(`/v1/data-export/${exportId}/download`, { responseType: 'blob' })
    return data
  },

  getBlockedUsers: async () => {
    const { data } = await api.get('/user-actions/blocked')
    return data
  },

  getLinkedAccounts: async () => {
    const { data } = await api.get('/v1/users/linked-accounts')
    return data
  },

  switchAccount: async (accountId: string) => {
    const { data } = await api.post(`/v1/users/switch-account/${accountId}`)
    return data
  },

  unlinkAccount: async (accountId: string) => {
    const { data } = await api.delete(`/v1/users/linked-accounts/${accountId}`)
    return data
  },

  linkAccount: async (userId: string) => {
    const { data } = await api.post('/v1/users/linked-accounts', { userId })
    return data
  },
}
