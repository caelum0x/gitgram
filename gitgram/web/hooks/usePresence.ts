'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'

export interface OnlineUser {
  id: string
  username: string
  avatar?: string
}

interface PresenceState {
  onlineUsers: OnlineUser[]
  onlineCount: number
}

const HEARTBEAT_INTERVAL_MS = 60_000
const POLL_INTERVAL_MS = 30_000

async function sendHeartbeat(): Promise<void> {
  await api.patch('/users/presence')
}

async function fetchOnlineUsers(): Promise<OnlineUser[]> {
  const response = await api.get<{ users: OnlineUser[] }>('/users/online')
  return response.data.users
}

export function usePresence(): PresenceState {
  const { isAuthenticated } = useAuthStore()
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isVisibleRef = useRef<boolean>(true)

  const refreshOnlineUsers = useCallback(async () => {
    try {
      const users = await fetchOnlineUsers()
      setOnlineUsers(users)
    } catch {
      // Silently ignore — stale data is acceptable for presence
    }
  }, [])

  const heartbeat = useCallback(async () => {
    if (!isAuthenticated || !isVisibleRef.current) return
    try {
      await sendHeartbeat()
    } catch {
      // Silently ignore — missed heartbeat is non-critical
    }
  }, [isAuthenticated])

  // Start/stop polling and heartbeat based on auth state
  useEffect(() => {
    if (!isAuthenticated) {
      heartbeatRef.current && clearInterval(heartbeatRef.current)
      pollRef.current && clearInterval(pollRef.current)
      setOnlineUsers([])
      return
    }

    // Immediate bootstrap
    heartbeat()
    refreshOnlineUsers()

    heartbeatRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS)
    pollRef.current = setInterval(refreshOnlineUsers, POLL_INTERVAL_MS)

    return () => {
      heartbeatRef.current && clearInterval(heartbeatRef.current)
      pollRef.current && clearInterval(pollRef.current)
    }
  }, [isAuthenticated, heartbeat, refreshOnlineUsers])

  // Pause heartbeat when tab is hidden; send immediately on focus regain
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible'
      if (isVisibleRef.current && isAuthenticated) {
        heartbeat()
        refreshOnlineUsers()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, heartbeat, refreshOnlineUsers])

  return {
    onlineUsers,
    onlineCount: onlineUsers.length,
  }
}
