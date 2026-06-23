'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import {
  realtimeService,
  type Notification,
  type Message,
} from '@/services/realtimeService'

/**
 * Shape returned by {@link useRealtime}.
 *
 * `lastNotification` / `lastMessage` hold the most recently received event so
 * consumers can react to changes via `useEffect`. They reset to `null` only on
 * an explicit disconnect, never while connected.
 */
export interface RealtimeState {
  /** True while the underlying SSE connection is open. */
  connected: boolean
  /** Most recent notification pushed over SSE, or `null` if none yet. */
  lastNotification: Notification | null
  /** Most recent direct message pushed over SSE, or `null` if none yet. */
  lastMessage: Message | null
  /** Set of user ids that have come online during this session. */
  onlineUsers: ReadonlySet<string>
}

/**
 * How often we re-sync the `connected` flag with the service. The service owns
 * reconnection (exponential backoff), so the hook only needs to poll its
 * `isConnected` getter to surface state to React.
 */
const CONNECTION_POLL_MS = 2_000

/**
 * Connects {@link realtimeService} for the authenticated user and exposes the
 * latest realtime events to React components.
 *
 * - Connects on mount when authenticated (and on login).
 * - Auto-disconnects on unmount or logout.
 * - Reconnection/backoff is handled inside the service, not here.
 *
 * @example
 * const { connected, lastNotification } = useRealtime()
 * useEffect(() => {
 *   if (lastNotification) showToast(lastNotification)
 * }, [lastNotification])
 */
export function useRealtime(): RealtimeState {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const userId = user?.id ?? null

  const [connected, setConnected] = useState(false)
  const [lastNotification, setLastNotification] = useState<Notification | null>(null)
  const [lastMessage, setLastMessage] = useState<Message | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<ReadonlySet<string>>(() => new Set())

  // Keep the live set in a ref so the userOnline handler can build the next
  // immutable Set without re-subscribing on every change.
  const onlineRef = useRef<Set<string>>(new Set())

  const handleNotification = useCallback((notification: Notification) => {
    setLastNotification(notification)
  }, [])

  const handleMessage = useCallback((message: Message) => {
    setLastMessage(message)
  }, [])

  const handleUserOnline = useCallback((id: string) => {
    if (onlineRef.current.has(id)) return
    const next = new Set(onlineRef.current)
    next.add(id)
    onlineRef.current = next
    setOnlineUsers(next)
  }, [])

  // Subscribe + connect when authenticated. The service de-duplicates connects
  // for the same userId, so re-running this effect is safe.
  useEffect(() => {
    if (!isAuthenticated || !userId) {
      realtimeService.disconnect()
      setConnected(false)
      return
    }

    const unsubscribers = [
      realtimeService.onNotification(handleNotification),
      realtimeService.onNewMessage(handleMessage),
      realtimeService.onUserOnline(handleUserOnline),
    ]

    realtimeService.connect(userId)
    setConnected(realtimeService.isConnected)

    // Poll the service for connection state — it owns reconnection internally,
    // so this is how React learns the socket dropped or recovered.
    const interval = setInterval(() => {
      setConnected(realtimeService.isConnected)
    }, CONNECTION_POLL_MS)

    return () => {
      clearInterval(interval)
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      realtimeService.disconnect()
      setConnected(false)
    }
  }, [
    isAuthenticated,
    userId,
    handleNotification,
    handleMessage,
    handleUserOnline,
  ])

  // Reset online set when the authenticated user changes / logs out.
  useEffect(() => {
    if (isAuthenticated && userId) return
    onlineRef.current = new Set()
    setOnlineUsers(new Set())
    setLastNotification(null)
    setLastMessage(null)
  }, [isAuthenticated, userId])

  return {
    connected,
    lastNotification,
    lastMessage,
    onlineUsers,
  }
}

export default useRealtime
