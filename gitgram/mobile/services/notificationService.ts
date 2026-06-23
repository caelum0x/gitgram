import api from './api';

export const notificationService = {
  getNotifications: async (page = 1, limit = 20, unreadOnly = false) => {
    const response = await api.get('/v1/notifications', {
      params: { page, limit, unreadOnly },
    });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get('/v1/notifications/unread/count');
    return response.data;
  },

  markAsRead: async (notificationIds?: string[]) => {
    const response = await api.put('/v1/notifications/read', {
      notificationIds,
    });
    return response.data;
  },

  deleteNotification: async (notificationId: string) => {
    const response = await api.delete(`/v1/notifications/${notificationId}`);
    return response.data;
  },

  getNotification: async (notificationId: string) => {
    const response = await api.get(`/v1/notifications/${notificationId}`);
    return response.data;
  },

  getPreferences: async () => {
    const response = await api.get('/v1/notifications/preferences');
    return response.data;
  },

  updatePreferences: async (preferences: any) => {
    const response = await api.put('/v1/notifications/preferences', preferences);
    return response.data;
  },
};

