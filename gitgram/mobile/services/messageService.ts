import api from './api';

export const messageService = {
  getConversations: async () => {
    const response = await api.get('/messages/conversations');
    return response.data;
  },

  getMessages: async (userId: string, page = 1, limit = 50) => {
    const response = await api.get(`/messages/${userId}`, {
      params: { page, limit },
    });
    return response.data;
  },

  // The service owns recipientId/content so callers only build the media part.
  // Callers must NOT pre-append recipientId/content to the FormData.
  sendMessage: async (recipientId: string, content: string, media?: FormData) => {
    if (media) {
      media.append('recipientId', recipientId);
      if (content) {
        media.append('content', content);
      }
      const response = await api.post('/messages', media, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } else {
      const response = await api.post('/messages', {
        recipientId,
        content,
      });
      return response.data;
    }
  },

  markAsRead: async (messageId: string) => {
    const response = await api.put(`/messages/${messageId}/read`);
    return response.data;
  },

  getMessageRequests: async () => {
    const response = await api.get('/messages/requests');
    return response.data;
  },

  acceptMessageRequest: async (requestId: string) => {
    const response = await api.post(`/messages/requests/${requestId}/accept`);
    return response.data;
  },

  declineMessageRequest: async (requestId: string) => {
    const response = await api.post(`/messages/requests/${requestId}/decline`);
    return response.data;
  },

  searchMessages: async (query: string) => {
    const response = await api.get('/messages/search', {
      params: { q: query },
    });
    return response.data;
  },

  sharePost: async (conversationId: string, postId: string) => {
    const response = await api.post(`/messages/${conversationId}/share/post`, { postId });
    return response.data;
  },

  shareReel: async (conversationId: string, reelId: string) => {
    const response = await api.post(`/messages/${conversationId}/share/reel`, { reelId });
    return response.data;
  },

  shareProject: async (conversationId: string, projectId: string) => {
    const response = await api.post(`/messages/${conversationId}/share/project`, { projectId });
    return response.data;
  },

  getMessageSettings: async () => {
    const response = await api.get('/messages/settings');
    return response.data;
  },

  updateMessageSettings: async (settings: {
    readReceipts?: boolean;
    showTypingIndicator?: boolean;
    allowMessageRequests?: boolean;
    muteNotifications?: boolean;
  }) => {
    const response = await api.put('/messages/settings', settings);
    return response.data;
  },

  createGroupChat: async (data: { name: string; userIds: string[] }) => {
    const response = await api.post('/messages/groups', data);
    return response.data;
  },

  getGroupChat: async (groupId: string) => {
    const response = await api.get(`/messages/groups/${groupId}`);
    return response.data;
  },

  leaveGroup: async (groupId: string) => {
    const response = await api.post(`/messages/groups/${groupId}/leave`);
    return response.data;
  },

  getChatMedia: async (userId: string, page = 1, limit = 50) => {
    const response = await api.get(`/messages/${userId}/media`, {
      params: { page, limit },
    });
    return response.data;
  },
};

