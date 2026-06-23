'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { useRealtime } from '@/hooks/useRealtime'
import type { Notification as RealtimeNotification } from '@/services/realtimeService'

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'repo_star'

interface NotificationActor {
  id: string
  username: string
  avatar: string | null
}

interface NotificationPost {
  id: string
  content: string
  mediaUrl: string | null
}

interface NotificationRepo {
  id: string
  name: string
  fullName: string
}

interface Notification {
  id: string
  type: NotificationType
  read: boolean
  createdAt: string
  actor: NotificationActor | null
  post: NotificationPost | null
  repo: NotificationRepo | null
}

interface NotificationsResponse {
  data: {
    notifications: Notification[]
    total: number
    unreadCount: number
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<NotificationType, string> = {
  like: '❤️',
  comment: '💬',
  follow: '👤',
  mention: '@',
  repo_star: '⭐',
}

const TYPE_ACTION: Record<NotificationType, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  follow: 'started following you',
  mention: 'mentioned you',
  repo_star: 'starred your repository',
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return `${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d`
  return new Date(iso).toLocaleDateString()
}

function notificationTarget(n: Notification): string {
  if (n.type === 'follow') return ''
  if (n.repo) return n.repo.fullName || n.repo.name
  if (n.post) {
    const preview = n.post.content?.trim() ?? ''
    return preview.length > 40 ? `${preview.slice(0, 40)}…` : preview
  }
  return ''
}

function notificationHref(n: Notification): string {
  if (n.type === 'follow' && n.actor) return `/${n.actor.username}`
  if (n.post) return `/posts/${n.post.id}`
  if (n.actor) return `/${n.actor.username}`
  return '/'
}

const KNOWN_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'like',
  'comment',
  'follow',
  'mention',
  'repo_star',
])

function isKnownType(type: string): type is NotificationType {
  return KNOWN_TYPES.has(type as NotificationType)
}

/**
 * Adapts a notification pushed over SSE into the richer shape this dropdown
 * renders. The realtime payload is intentionally thin, so unknown/missing
 * fields fall back to `null` and the optimistic row is later reconciled by the
 * polling refetch.
 */
function fromRealtime(n: RealtimeNotification): Notification {
  return {
    id: n.id,
    type: isKnownType(n.type) ? n.type : 'mention',
    read: false,
    createdAt: n.createdAt ?? new Date().toISOString(),
    actor: n.actorUsername
      ? { id: n.actorId ?? '', username: n.actorUsername, avatar: null }
      : null,
    post: n.postId ? { id: n.postId, content: '', mediaUrl: null } : null,
    repo: null,
  }
}

// ─── Fetch / mutate ───────────────────────────────────────────────────────────

async function fetchNotifications(): Promise<NotificationsResponse> {
  const response = await api.get<NotificationsResponse>('/v1/notifications', {
    params: { limit: 10 },
  })
  return response.data
}

async function markAllRead(): Promise<void> {
  await api.post('/v1/notifications/read-all')
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const queryClient = useQueryClient()

  // SSE-pushed notifications prepended optimistically, newest first. These are
  // reconciled away (deduped by id) once the polling refetch returns them.
  const [optimistic, setOptimistic] = useState<Notification[]>([])
  // Drives a one-shot pulse animation on the bell when a live event lands.
  const [pulse, setPulse] = useState(false)

  const { lastNotification } = useRealtime()

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-bell'],
    queryFn: fetchNotifications,
    refetchInterval: 30_000, // polling fallback when SSE is unavailable
  })

  const markAllMutation = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      setOptimistic([])
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] })
    },
  })

  // Resolve nested shape — API may return { data: { notifications, unreadCount } }
  // or flat { notifications, unreadCount } depending on envelope.
  const payload = (data as unknown as { notifications?: Notification[]; unreadCount?: number }) ?? {}
  const nestedPayload = (data as unknown as NotificationsResponse)?.data ?? {}

  const fetched: Notification[] =
    nestedPayload.notifications ?? payload.notifications ?? []

  const fetchedUnread: number = nestedPayload.unreadCount ?? payload.unreadCount ?? 0

  // Merge optimistic SSE notifications ahead of fetched ones, dropping any that
  // the server has since returned (the fetched copy is authoritative).
  const fetchedIds = new Set(fetched.map((n) => n.id))
  const pendingOptimistic = optimistic.filter((n) => !fetchedIds.has(n.id))
  const notifications: Notification[] = [...pendingOptimistic, ...fetched]
  const unreadCount: number = fetchedUnread + pendingOptimistic.length

  // On each new SSE notification: prepend optimistically + fire the pulse.
  useEffect(() => {
    if (!lastNotification) return
    const mapped = fromRealtime(lastNotification)
    setOptimistic((prev) => {
      if (prev.some((n) => n.id === mapped.id)) return prev
      return [mapped, ...prev].slice(0, 10)
    })
    setPulse(true)
    const timer = setTimeout(() => setPulse(false), 600)
    return () => clearTimeout(timer)
  }, [lastNotification])

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  function handleNotificationClick(n: Notification) {
    setOpen(false)
    router.push(notificationHref(n))
  }

  function handleMarkAllRead() {
    markAllMutation.mutate()
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      {/* Subtle pulse keyframes for live notification arrival. */}
      <style>{`
        @keyframes bellPulse {
          0% { transform: scale(1); }
          30% { transform: scale(1.18) rotate(-8deg); }
          60% { transform: scale(1.08) rotate(6deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>

      {/* Bell button */}
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-1 hover:text-primary transition-colors"
        style={pulse ? { animation: 'bellPulse 0.6s ease-in-out' } : undefined}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Red badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-50 rounded-xl border shadow-2xl overflow-hidden"
          style={{
            width: '360px',
            backgroundColor: '#1A1A2E',
            borderColor: '#2D2D50',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: '#2D2D50' }}
          >
            <span className="text-sm font-semibold text-white">Notifications</span>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markAllMutation.isPending || unreadCount === 0}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Mark all read
            </button>
          </div>

          {/* List */}
          <ul className="overflow-y-auto max-h-[420px]">
            {isLoading && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">Loading…</li>
            )}

            {!isLoading && notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">
                No notifications yet
              </li>
            )}

            {notifications.map((n) => {
              const icon = TYPE_ICON[n.type] ?? '🔔'
              const action = TYPE_ACTION[n.type] ?? 'interacted with you'
              const target = notificationTarget(n)
              const timestamp = relativeTime(n.createdAt)

              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 focus:outline-none focus-visible:bg-white/5"
                    style={{
                      backgroundColor: n.read ? 'transparent' : 'rgba(99,102,241,0.08)',
                    }}
                  >
                    {/* Type icon */}
                    <span
                      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base"
                      style={{ backgroundColor: '#2D2D50' }}
                      aria-hidden="true"
                    >
                      {icon}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-100 leading-snug">
                        <span className="font-semibold text-white">
                          {n.actor?.username ?? 'Someone'}
                        </span>{' '}
                        {action}
                        {target && (
                          <>
                            {': '}
                            <span className="text-gray-300">{target}</span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{timestamp}</p>
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <span
                        className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5"
                        aria-label="Unread"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
