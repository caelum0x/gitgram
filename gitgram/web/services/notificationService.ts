import api from './api'

export const notificationService = {
  getNotifications: async (page = 1, limit = 20, unreadOnly = false) => {
    const response = await api.get('/v1/notifications', {
      params: { page, limit, unreadOnly },
    })
    return response.data
  },

  getUnreadCount: async () => {
    const response = await api.get('/v1/notifications/unread/count')
    return response.data
  },

  markAsRead: async (notificationIds?: string[]) => {
    const response = await api.put('/v1/notifications/read', {
      notificationIds,
    })
    return response.data
  },

  deleteNotification: async (notificationId: string) => {
    const response = await api.delete(`/v1/notifications/${notificationId}`)
    return response.data
  },

  getNotification: async (notificationId: string) => {
    const response = await api.get(`/v1/notifications/${notificationId}`)
    return response.data
  },

  getPreferences: async () => {
    const response = await api.get('/v1/notifications/preferences')
    return response.data
  },

  updatePreferences: async (preferences: Record<string, unknown>) => {
    const response = await api.put('/v1/notifications/preferences', preferences)
    return response.data
  },

  getGroupedNotifications: async (limit = 40) => {
    const response = await api.get('/v1/notifications/grouped', { params: { limit } })
    return response.data as {
      notifications: GroupedNotification[]
      total: number
    }
  },
}

export interface GroupedNotification {
  id: string
  type: string
  groupedContent: string
  read: boolean
  createdAt: string
  actorCount: number
  primaryActor: { id: string; username: string; avatar: string | null } | null
  post: { id: string; mediaUrl: string | null; content: string } | null
  notificationIds: string[]
}

