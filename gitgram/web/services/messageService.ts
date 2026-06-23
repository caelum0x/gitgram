import api from './api'

export interface ConversationUser {
  id: string
  username: string
  avatar?: string
  displayName?: string
}

export interface LastMessage {
  id: string
  content: string
  createdAt: string
  senderId: string
}

export interface Conversation {
  id: string
  otherUser: ConversationUser
  lastMessage?: LastMessage
  unreadCount: number
  updatedAt: string
}

export interface Message {
  id: string
  content: string
  senderId: string
  sender?: ConversationUser
  chatId?: string
  receiverId?: string
  createdAt: string
  isRead: boolean
  isOptimistic?: boolean
}

export interface MessagesResponse {
  messages: Message[]
  total?: number
  page?: number
  limit?: number
}

export interface ConversationsResponse {
  conversations: Conversation[]
}

export interface UnreadCountResponse {
  count: number
}

export const messageService = {
  getConversations: async (): Promise<ConversationsResponse> => {
    const { data } = await api.get<ConversationsResponse>('/messages/conversations')
    return data
  },

  getMessages: async (otherUserId: string, page = 1, limit = 50): Promise<MessagesResponse> => {
    const { data } = await api.get<MessagesResponse>(`/messages/${otherUserId}`, {
      params: { page, limit },
    })
    return data
  },

  sendMessage: async (receiverId: string, content: string): Promise<Message> => {
    const { data } = await api.post<Message>('/messages', { receiverId, content })
    return data
  },

  sendMessageToChat: async (chatId: string, content: string): Promise<Message> => {
    const { data } = await api.post<Message>('/messages', { chatId, content })
    return data
  },

  getUnreadCount: async (): Promise<UnreadCountResponse> => {
    const { data } = await api.get<UnreadCountResponse>('/messages/unread/count')
    return data
  },

  markConversationAsRead: async (conversationId: string): Promise<void> => {
    await api.post(`/messages/conversations/${conversationId}/read`)
  },

  markAsRead: async (otherUserId: string): Promise<void> => {
    await api.put(`/messages/${otherUserId}/read`)
  },

  deleteMessage: async (messageId: string): Promise<void> => {
    await api.delete(`/messages/${messageId}`)
  },

  editMessage: async (messageId: string, content: string): Promise<Message> => {
    const { data } = await api.put<Message>(`/messages/${messageId}`, { content })
    return data
  },

  searchConversations: (conversations: Conversation[], query: string): Conversation[] => {
    if (!query.trim()) return conversations
    const lower = query.toLowerCase()
    return conversations.filter(
      (c) =>
        c.otherUser.username.toLowerCase().includes(lower) ||
        c.otherUser.displayName?.toLowerCase().includes(lower) ||
        c.lastMessage?.content.toLowerCase().includes(lower),
    )
  },
}
