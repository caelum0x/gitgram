'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/authStore'

function resolveSocketUrl() {
  // Prefer explicit WS URL (matches `.env.gitgram-web.example` and docker compose).
  const explicit =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_SOCKET_URL
  if (explicit) return explicit

  // Fallback: derive from API URL by stripping trailing "/api".
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
  return apiUrl.replace(/\/api\/?$/, '')
}

const SOCKET_URL = resolveSocketUrl()

interface SocketHook {
  socket: Socket | null
  isConnected: boolean
  onlineUsers: string[]

  // Post subscriptions
  subscribeToPost: (postId: string) => void
  unsubscribeFromPost: (postId: string) => void

  // Typing indicators
  sendTypingIndicator: (postId: string, isTyping: boolean) => void

  // Check online status
  checkOnlineStatus: (userIds: string[]) => void

  // Notifications
  subscribeToNotifications: () => void
  refreshNotificationBadge: () => void

  // Chat / messaging
  joinChat: (chatId: string) => void
  sendMessage: (chatId: string, content: string) => void
  sendTyping: (chatId: string) => void

  // Event listeners
  onNewComment: (callback: (data: { postId: string; comment: any }) => void) => () => void
  onCommentUpdate: (callback: (data: { postId: string; commentId: string; content: string }) => void) => () => void
  onCommentRemoved: (callback: (data: { postId: string; commentId: string }) => void) => () => void
  onCommentLikeUpdate: (callback: (data: { postId: string; commentId: string; liked: boolean; newCount: number; userId: string }) => void) => () => void
  onTypingUpdate: (callback: (data: { postId: string; userId: string; isTyping: boolean }) => void) => () => void
  onNotificationBadgeUpdate: (callback: (data: { count: number }) => void) => () => void
  onUserOnline: (callback: (data: { userId: string }) => void) => () => void
  onUserOffline: (callback: (data: { userId: string }) => void) => () => void
  onPostLiked: (callback: (data: { user: any; post: any }) => void) => () => void
  onNewFollower: (callback: (data: { user: any }) => void) => () => void
  onNewMessage: (callback: (data: any) => void) => () => void
  onUserTyping: (callback: (data: { chatId: string; username: string }) => void) => () => void
}

export function useSocket(): SocketHook {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
        setIsConnected(false)
      }
      return
    }

    // Create socket connection (httpOnly cookie is sent via withCredentials)
    socketRef.current = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    const socket = socketRef.current

    socket.on('connect', () => {
      console.log('Socket connected')
      setIsConnected(true)
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')
      setIsConnected(false)
    })

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      setIsConnected(false)
    })

    // Handle online users list
    socket.on('online_users', (data: { users: string[] }) => {
      setOnlineUsers(data.users)
    })

    socket.on('user_online', (data: { userId: string }) => {
      setOnlineUsers(prev => [...new Set([...prev, data.userId])])
    })

    socket.on('user_offline', (data: { userId: string }) => {
      setOnlineUsers(prev => prev.filter(id => id !== data.userId))
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [isAuthenticated])

  const subscribeToPost = useCallback((postId: string) => {
    socketRef.current?.emit('subscribe_post', postId)
  }, [])

  const unsubscribeFromPost = useCallback((postId: string) => {
    socketRef.current?.emit('unsubscribe_post', postId)
  }, [])

  const sendTypingIndicator = useCallback((postId: string, isTyping: boolean) => {
    socketRef.current?.emit('comment_typing', { postId, isTyping })
  }, [])

  const checkOnlineStatus = useCallback((userIds: string[]) => {
    socketRef.current?.emit('check_online_status', userIds)
  }, [])

  const subscribeToNotifications = useCallback(() => {
    socketRef.current?.emit('subscribe_notifications')
  }, [])

  const refreshNotificationBadge = useCallback(() => {
    socketRef.current?.emit('refresh_notification_badge')
  }, [])

  // Chat / messaging
  const joinChat = useCallback((chatId: string) => {
    socketRef.current?.emit('join_chat', chatId)
  }, [])

  const sendMessage = useCallback((chatId: string, content: string) => {
    socketRef.current?.emit('send_message', { chatId, content })
  }, [])

  const sendTyping = useCallback((chatId: string) => {
    socketRef.current?.emit('typing', chatId)
  }, [])

  // Event listener factories
  const createEventListener = useCallback(<T>(event: string) => {
    return (callback: (data: T) => void): (() => void) => {
      const socket = socketRef.current
      if (!socket) return () => {}

      socket.on(event, callback)
      return () => {
        socket.off(event, callback)
      }
    }
  }, [])

  const onNewComment = useCallback(
    (callback: (data: { postId: string; comment: any }) => void) =>
      createEventListener<{ postId: string; comment: any }>('new_comment')(callback),
    [createEventListener]
  )

  const onCommentUpdate = useCallback(
    (callback: (data: { postId: string; commentId: string; content: string }) => void) =>
      createEventListener<{ postId: string; commentId: string; content: string }>('comment_update')(callback),
    [createEventListener]
  )

  const onCommentRemoved = useCallback(
    (callback: (data: { postId: string; commentId: string }) => void) =>
      createEventListener<{ postId: string; commentId: string }>('comment_removed')(callback),
    [createEventListener]
  )

  const onCommentLikeUpdate = useCallback(
    (callback: (data: { postId: string; commentId: string; liked: boolean; newCount: number; userId: string }) => void) =>
      createEventListener<{ postId: string; commentId: string; liked: boolean; newCount: number; userId: string }>('comment_like_update')(callback),
    [createEventListener]
  )

  const onTypingUpdate = useCallback(
    (callback: (data: { postId: string; userId: string; isTyping: boolean }) => void) =>
      createEventListener<{ postId: string; userId: string; isTyping: boolean }>('comment_typing_update')(callback),
    [createEventListener]
  )

  const onNotificationBadgeUpdate = useCallback(
    (callback: (data: { count: number }) => void) =>
      createEventListener<{ count: number }>('notification_badge_update')(callback),
    [createEventListener]
  )

  const onUserOnline = useCallback(
    (callback: (data: { userId: string }) => void) =>
      createEventListener<{ userId: string }>('user_online')(callback),
    [createEventListener]
  )

  const onUserOffline = useCallback(
    (callback: (data: { userId: string }) => void) =>
      createEventListener<{ userId: string }>('user_offline')(callback),
    [createEventListener]
  )

  const onPostLiked = useCallback(
    (callback: (data: { user: any; post: any }) => void) =>
      createEventListener<{ user: any; post: any }>('post_liked')(callback),
    [createEventListener]
  )

  const onNewFollower = useCallback(
    (callback: (data: { user: any }) => void) =>
      createEventListener<{ user: any }>('new_follower')(callback),
    [createEventListener]
  )

  const onNewMessage = useCallback(
    (callback: (data: any) => void) =>
      createEventListener<any>('new_message')(callback),
    [createEventListener]
  )

  const onUserTyping = useCallback(
    (callback: (data: { chatId: string; username: string }) => void) =>
      createEventListener<{ chatId: string; username: string }>('user_typing')(callback),
    [createEventListener]
  )

  return {
    socket: socketRef.current,
    isConnected,
    onlineUsers,
    subscribeToPost,
    unsubscribeFromPost,
    sendTypingIndicator,
    checkOnlineStatus,
    subscribeToNotifications,
    refreshNotificationBadge,
    onNewComment,
    onCommentUpdate,
    onCommentRemoved,
    onCommentLikeUpdate,
    onTypingUpdate,
    onNotificationBadgeUpdate,
    onUserOnline,
    onUserOffline,
    onPostLiked,
    onNewFollower,
    onNewMessage,
    onUserTyping,
    joinChat,
    sendMessage,
    sendTyping,
  }
}

// Typing indicator hook for comment forms
export function useCommentTyping(postId: string) {
  const { sendTypingIndicator, onTypingUpdate } = useSocket()
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const unsubscribe = onTypingUpdate((data) => {
      if (data.postId !== postId) return

      setTypingUsers(prev => {
        const newSet = new Set(prev)
        if (data.isTyping) {
          newSet.add(data.userId)
        } else {
          newSet.delete(data.userId)
        }
        return newSet
      })
    })

    return unsubscribe
  }, [postId, onTypingUpdate])

  const handleTyping = useCallback(() => {
    sendTypingIndicator(postId, true)

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Auto-clear typing after 2 seconds of no activity
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingIndicator(postId, false)
    }, 2000)
  }, [postId, sendTypingIndicator])

  const stopTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    sendTypingIndicator(postId, false)
  }, [postId, sendTypingIndicator])

  return {
    typingUsers: Array.from(typingUsers),
    handleTyping,
    stopTyping,
    isAnyoneTyping: typingUsers.size > 0,
  }
}

// Online status indicator hook
export function useOnlineStatus(userIds: string[]) {
  const { onlineUsers, checkOnlineStatus } = useSocket()
  const [statuses, setStatuses] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    // Update statuses based on onlineUsers list
    const newStatuses = new Map<string, boolean>()
    userIds.forEach(id => {
      newStatuses.set(id, onlineUsers.includes(id))
    })
    setStatuses(newStatuses)
  }, [userIds, onlineUsers])

  useEffect(() => {
    // Request status check when userIds change
    if (userIds.length > 0) {
      checkOnlineStatus(userIds)
    }
  }, [userIds, checkOnlineStatus])

  return {
    isOnline: (userId: string) => statuses.get(userId) ?? false,
    statuses,
  }
}

// Notification badge hook
export function useNotificationBadge() {
  const { subscribeToNotifications, refreshNotificationBadge, onNotificationBadgeUpdate, isConnected } = useSocket()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isConnected) return

    subscribeToNotifications()
    refreshNotificationBadge()

    const unsubscribe = onNotificationBadgeUpdate((data) => {
      setCount(data.count)
    })

    return unsubscribe
  }, [isConnected, subscribeToNotifications, refreshNotificationBadge, onNotificationBadgeUpdate])

  return { count, refresh: refreshNotificationBadge }
}
