import api from './api';

export const settingsService = {
  getAccountSettings: async () => {
    const response = await api.get('/settings/account');
    return response.data;
  },

  updateAccountSettings: async (data: {
    isFrozen?: boolean;
    privacySettings?: any;
    appearanceSettings?: any;
    languageSettings?: any;
  }) => {
    const response = await api.put('/settings/account', data);
    return response.data;
  },

  freezeAccount: async () => {
    const response = await api.post('/settings/account/freeze');
    return response.data;
  },

  unfreezeAccount: async () => {
    const response = await api.post('/settings/account/unfreeze');
    return response.data;
  },

  getNotificationPreferences: async () => {
    const response = await api.get('/settings/notifications');
    return response.data;
  },

  updateNotificationPreferences: async (data: {
    likes?: boolean;
    comments?: boolean;
    follows?: boolean;
    messages?: boolean;
    mentions?: boolean;
    pushEnabled?: boolean;
    emailEnabled?: boolean;
  }) => {
    const response = await api.put('/settings/notifications', data);
    return response.data;
  },

  getPrivacySettings: async () => {
    const response = await api.get('/settings/privacy');
    return response.data;
  },

  updatePrivacySettings: async (data: any) => {
    const response = await api.put('/settings/privacy', data);
    return response.data;
  },

  getAppearanceSettings: async () => {
    const response = await api.get('/settings/appearance');
    return response.data;
  },

  updateAppearanceSettings: async (data: any) => {
    const response = await api.put('/settings/appearance', data);
    return response.data;
  },

  getLanguageSettings: async () => {
    const response = await api.get('/settings/language');
    return response.data;
  },

  updateLanguageSettings: async (data: { language: string; region?: string }) => {
    const response = await api.put('/settings/language', data);
    return response.data;
  },

  getDataSettings: async () => {
    const response = await api.get('/settings/data');
    return response.data;
  },

  updateDataSettings: async (data: {
    clearCache?: boolean;
    downloadHistory?: boolean;
  }) => {
    const response = await api.put('/settings/data', data);
    return response.data;
  },

  getActiveSessions: async () => {
    const response = await api.get('/settings/sessions');
    return response.data;
  },

  revokeSession: async (sessionId: string) => {
    const response = await api.delete(`/settings/sessions/${sessionId}`);
    return response.data;
  },

  getPushNotificationSettings: async () => {
    const response = await api.get('/settings/push-notifications');
    return response.data;
  },

  updatePushNotificationSettings: async (settings: any) => {
    const response = await api.put('/settings/push-notifications', settings);
    return response.data;
  },
};

