const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
const SSE_URL = `${BASE_URL}/v1/events`

export interface Notification {
  id: string
  type: string
  message: string
  read: boolean
  createdAt: string
  actorId?: string
  actorUsername?: string
  postId?: string
}

export interface Message {
  id: string
  content: string
  senderId: string
  chatId: string
  createdAt: string
}

export interface PostLikedData {
  postId: string
  userId: string
  likes: number
}

type NotificationCallback = (notification: Notification) => void
type MessageCallback = (message: Message) => void
type UserOnlineCallback = (userId: string) => void
type PostLikedCallback = (data: PostLikedData) => void

type Unsubscribe = () => void

interface CallbackSets {
  notification: Set<NotificationCallback>
  newMessage: Set<MessageCallback>
  userOnline: Set<UserOnlineCallback>
  postLiked: Set<PostLikedCallback>
}

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

function clampBackoff(attempt: number): number {
  const ms = MIN_BACKOFF_MS * Math.pow(2, attempt)
  return Math.min(ms, MAX_BACKOFF_MS)
}

function createRealtimeService() {
  let eventSource: EventSource | null = null
  let currentUserId: string | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0
  let intentionalClose = false

  const callbacks: CallbackSets = {
    notification: new Set(),
    newMessage: new Set(),
    userOnline: new Set(),
    postLiked: new Set(),
  }

  function parseEventData<T>(event: MessageEvent): T | null {
    try {
      return JSON.parse(event.data) as T
    } catch {
      return null
    }
  }

  function attachHandlers(es: EventSource): void {
    es.addEventListener('notification', (event: MessageEvent) => {
      const data = parseEventData<Notification>(event)
      if (data) callbacks.notification.forEach((cb) => cb(data))
    })

    es.addEventListener('newMessage', (event: MessageEvent) => {
      const data = parseEventData<Message>(event)
      if (data) callbacks.newMessage.forEach((cb) => cb(data))
    })

    es.addEventListener('userOnline', (event: MessageEvent) => {
      const data = parseEventData<{ userId: string }>(event)
      if (data?.userId) callbacks.userOnline.forEach((cb) => cb(data.userId))
    })

    es.addEventListener('postLiked', (event: MessageEvent) => {
      const data = parseEventData<PostLikedData>(event)
      if (data) callbacks.postLiked.forEach((cb) => cb(data))
    })

    es.onerror = () => {
      if (intentionalClose) return
      es.close()
      eventSource = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect(): void {
    if (intentionalClose || !currentUserId) return
    const delay = clampBackoff(reconnectAttempt)
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      if (currentUserId) openConnection(currentUserId)
    }, delay)
  }

  function openConnection(userId: string): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const url = `${SSE_URL}?userId=${encodeURIComponent(userId)}`
    const es = new EventSource(url, { withCredentials: true })
    eventSource = es
    attachHandlers(es)
    es.onopen = () => {
      reconnectAttempt = 0
    }
  }

  function connect(userId: string): void {
    if (eventSource) {
      if (currentUserId === userId) return
      disconnect()
    }
    intentionalClose = false
    currentUserId = userId
    openConnection(userId)
  }

  function disconnect(): void {
    intentionalClose = true
    currentUserId = null
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    reconnectAttempt = 0
  }

  function onNotification(callback: NotificationCallback): Unsubscribe {
    callbacks.notification.add(callback)
    return () => callbacks.notification.delete(callback)
  }

  function onNewMessage(callback: MessageCallback): Unsubscribe {
    callbacks.newMessage.add(callback)
    return () => callbacks.newMessage.delete(callback)
  }

  function onUserOnline(callback: UserOnlineCallback): Unsubscribe {
    callbacks.userOnline.add(callback)
    return () => callbacks.userOnline.delete(callback)
  }

  function onPostLiked(callback: PostLikedCallback): Unsubscribe {
    callbacks.postLiked.add(callback)
    return () => callbacks.postLiked.delete(callback)
  }

  return {
    connect,
    disconnect,
    onNotification,
    onNewMessage,
    onUserOnline,
    onPostLiked,
    get isConnected(): boolean {
      return eventSource !== null && eventSource.readyState === EventSource.OPEN
    },
  }
}

export const realtimeService = createRealtimeService()
