import api from './api';

export const messageService = {
  getConversations: async () => {
    const response = await api.get('/v1/messages/conversations');
    return response.data;
  },

  getMessages: async (userId: string, page = 1, limit = 50) => {
    const response = await api.get(`/v1/messages/${userId}`, {
      params: { page, limit },
    });
    return response.data;
  },

  sendMessage: async (recipientId: string, content: string, media?: FormData) => {
    if (media) {
      const response = await api.post('/v1/messages', media, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } else {
      const response = await api.post('/v1/messages', {
        recipientId,
        content,
      });
      return response.data;
    }
  },

  markAsRead: async (messageId: string) => {
    const response = await api.put(`/v1/messages/${messageId}/read`);
    return response.data;
  },

  getMessageRequests: async () => {
    const response = await api.get('/v1/messages/requests');
    return response.data;
  },

  acceptMessageRequest: async (requestId: string) => {
    const response = await api.post(`/v1/messages/requests/${requestId}/accept`);
    return response.data;
  },

  declineMessageRequest: async (requestId: string) => {
    const response = await api.post(`/v1/messages/requests/${requestId}/decline`);
    return response.data;
  },

  searchMessages: async (query: string) => {
    const response = await api.get('/v1/messages/search', {
      params: { q: query },
    });
    return response.data;
  },

  sharePost: async (conversationId: string, postId: string) => {
    const response = await api.post(`/v1/messages/${conversationId}/share/post`, { postId });
    return response.data;
  },

  shareReel: async (conversationId: string, reelId: string) => {
    const response = await api.post(`/v1/messages/${conversationId}/share/reel`, { reelId });
    return response.data;
  },

  shareProject: async (conversationId: string, projectId: string) => {
    const response = await api.post(`/v1/messages/${conversationId}/share/project`, { projectId });
    return response.data;
  },

  getMessageSettings: async () => {
    const response = await api.get('/v1/messages/settings');
    return response.data;
  },

  updateMessageSettings: async (settings: {
    readReceipts?: boolean;
    showTypingIndicator?: boolean;
    allowMessageRequests?: boolean;
    muteNotifications?: boolean;
  }) => {
    const response = await api.put('/v1/messages/settings', settings);
    return response.data;
  },

  createGroupChat: async (data: { name: string; userIds: string[] }) => {
    const response = await api.post('/v1/messages/groups', data);
    return response.data;
  },

  getGroupChat: async (groupId: string) => {
    const response = await api.get(`/v1/messages/groups/${groupId}`);
    return response.data;
  },

  leaveGroup: async (groupId: string) => {
    const response = await api.post(`/v1/messages/groups/${groupId}/leave`);
    return response.data;
  },

  getChatMedia: async (userId: string, page = 1, limit = 50) => {
    const response = await api.get(`/v1/messages/${userId}/media`, {
      params: { page, limit },
    });
    return response.data;
  },
};

