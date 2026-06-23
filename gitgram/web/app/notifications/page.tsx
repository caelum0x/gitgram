'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'

// ─── Types ─────────────────────────────────────────────────────────────────────

type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'repo_star'

type FilterTab = 'all' | 'likes' | 'comments' | 'follows' | 'mentions'

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

interface NotificationsApiResponse {
  data: {
    notifications: Notification[]
    total: number
    unreadCount: number
  }
}

// Flat shape some endpoints return without the envelope
interface FlatNotificationsResponse {
  notifications: Notification[]
  total: number
  unreadCount: number
}

interface PageState {
  notifications: Notification[]
  total: number
  unreadCount: number
  page: number
  hasMore: boolean
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LIMIT = 20
const POLL_INTERVAL_MS = 15_000

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'follows', label: 'Follows' },
  { key: 'mentions', label: 'Mentions' },
]

const FILTER_TO_TYPE: Record<FilterTab, NotificationType | null> = {
  all: null,
  likes: 'like',
  comments: 'comment',
  follows: 'follow',
  mentions: 'mention',
}

const TYPE_ACTION: Record<NotificationType, string> = {
  like: 'liked your post',
  comment: 'commented on your post',
  follow: 'started following you',
  mention: 'mentioned you',
  repo_star: 'starred your repository',
}

const EMPTY_STATE_COPY: Record<FilterTab, string> = {
  all: 'No notifications yet',
  likes: 'No likes yet',
  comments: 'No comments yet',
  follows: 'No new followers yet',
  mentions: 'No mentions yet',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1_000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString()
}

function groupLabel(iso: string): 'Today' | 'This Week' | 'Earlier' {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffHr = diffMs / (1_000 * 60 * 60)
  if (diffHr < 24) return 'Today'
  if (diffHr < 24 * 7) return 'This Week'
  return 'Earlier'
}

function notificationHref(n: Notification): string {
  if (n.type === 'follow' && n.actor) return `/${n.actor.username}`
  if (n.post) return `/posts/${n.post.id}`
  if (n.repo && n.actor) return `/${n.actor.username}/${n.repo.name}`
  if (n.actor) return `/${n.actor.username}`
  return '/notifications'
}

function initials(username: string): string {
  return username.slice(0, 2).toUpperCase()
}

// ─── API functions ─────────────────────────────────────────────────────────────

async function fetchNotificationsPage(
  page: number,
  type: NotificationType | null
): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
  const params: Record<string, string | number> = { page, limit: LIMIT }
  if (type) params.type = type

  const response = await api.get<NotificationsApiResponse | FlatNotificationsResponse>(
    '/v1/notifications',
    { params }
  )

  const raw = response.data
  // Handle both envelope shapes
  const enveloped = raw as NotificationsApiResponse
  const flat = raw as FlatNotificationsResponse

  if (enveloped.data?.notifications !== undefined) {
    return {
      notifications: enveloped.data.notifications,
      total: enveloped.data.total,
      unreadCount: enveloped.data.unreadCount,
    }
  }

  return {
    notifications: flat.notifications ?? [],
    total: flat.total ?? 0,
    unreadCount: flat.unreadCount ?? 0,
  }
}

async function markAllReadApi(): Promise<void> {
  await api.patch('/v1/notifications/read-all')
}

async function markOneReadApi(id: string): Promise<void> {
  await api.patch(`/v1/notifications/${id}/read`)
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface AvatarProps {
  actor: NotificationActor | null
  size?: number
}

function Avatar({ actor, size = 40 }: AvatarProps) {
  const dim = `${size}px`

  if (actor?.avatar) {
    return (
      <img
        src={actor.avatar}
        alt={actor.username}
        width={size}
        height={size}
        style={{ width: dim, height: dim }}
        className="rounded-full object-cover flex-shrink-0"
      />
    )
  }

  return (
    <div
      style={{ width: dim, height: dim, backgroundColor: '#2D2D50', color: '#A78BFA' }}
      className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 select-none"
      aria-hidden="true"
    >
      {actor ? initials(actor.username) : '?'}
    </div>
  )
}

interface NotificationItemProps {
  notification: Notification
  onRead: (id: string) => void
}

function NotificationItem({ notification: n, onRead }: NotificationItemProps) {
  const router = useRouter()

  function handleClick() {
    if (!n.read) onRead(n.id)
    router.push(notificationHref(n))
  }

  const action = TYPE_ACTION[n.type] ?? 'interacted with you'
  const timestamp = relativeTime(n.createdAt)
  const postPreview = n.post?.content
    ? n.post.content.length > 60
      ? n.post.content.slice(0, 60) + '…'
      : n.post.content
    : null

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset"
        style={{
          borderLeft: n.read ? '3px solid transparent' : '3px solid #7C3AED',
          backgroundColor: n.read ? 'transparent' : 'rgba(124,58,237,0.07)',
        }}
        aria-label={`${n.actor?.username ?? 'Someone'} ${action}${postPreview ? `: ${postPreview}` : ''}`}
      >
        {/* Actor avatar */}
        <Avatar actor={n.actor} size={40} />

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug" style={{ color: '#C9D1D9' }}>
            <span className="font-semibold" style={{ color: '#FFFFFF' }}>
              {n.actor?.username ?? 'Someone'}
            </span>{' '}
            {action}
            {postPreview && (
              <>
                {': '}
                <span style={{ color: '#8B949E' }}>{postPreview}</span>
              </>
            )}
          </p>
          <p className="text-xs mt-1" style={{ color: '#6B7280' }}>
            {timestamp}
          </p>
        </div>

        {/* Post thumbnail */}
        {n.post?.mediaUrl && (
          <img
            src={n.post.mediaUrl}
            alt="Post"
            width={40}
            height={40}
            className="rounded object-cover flex-shrink-0"
            style={{ width: 40, height: 40 }}
          />
        )}

        {/* Unread dot */}
        {!n.read && (
          <span
            className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5"
            style={{ backgroundColor: '#7C3AED' }}
            aria-label="Unread"
          />
        )}
      </button>
    </li>
  )
}

interface GroupSectionProps {
  label: string
  notifications: Notification[]
  onRead: (id: string) => void
}

function GroupSection({ label, notifications, onRead }: GroupSectionProps) {
  if (notifications.length === 0) return null

  return (
    <section aria-labelledby={`group-${label}`}>
      <h2
        id={`group-${label}`}
        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider"
        style={{ color: '#6B7280' }}
      >
        {label}
      </h2>
      <ul className="divide-y" style={{ borderColor: '#2D2D50' }}>
        {notifications.map((n) => (
          <NotificationItem key={n.id} notification={n} onRead={onRead} />
        ))}
      </ul>
    </section>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized } = useAuthStore()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [pageState, setPageState] = useState<PageState>({
    notifications: [],
    total: 0,
    unreadCount: 0,
    page: 1,
    hasMore: true,
  })
  const [isFetchingMore, setIsFetchingMore] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Redirect unauthenticated users
  useEffect(() => {
    if (isInitialized && !isAuthenticated) router.push('/login')
  }, [isAuthenticated, isInitialized, router])

  // ── Initial fetch + polling ────────────────────────────────────────────────

  const typeFilter = FILTER_TO_TYPE[activeTab]

  const { data: initialData, isLoading } = useQuery({
    queryKey: ['notifications-page', activeTab],
    queryFn: () => fetchNotificationsPage(1, typeFilter),
    enabled: isAuthenticated,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 10_000,
  })

  // When tab changes, reset pagination state and sync with fresh query data
  useEffect(() => {
    setPageState({
      notifications: [],
      total: 0,
      unreadCount: 0,
      page: 1,
      hasMore: true,
    })
  }, [activeTab])

  useEffect(() => {
    if (!initialData) return
    const { notifications, total, unreadCount } = initialData

    setPageState((prev) => {
      // If we're on page 1 (tab just switched or polling refresh), replace list
      if (prev.page === 1) {
        return {
          notifications,
          total,
          unreadCount,
          page: 1,
          hasMore: notifications.length < total,
        }
      }
      // Otherwise preserve what we've loaded so far (infinite scroll pages)
      return prev
    })
  }, [initialData])

  // ── Infinite scroll ────────────────────────────────────────────────────────

  const loadNextPage = useCallback(async () => {
    if (isFetchingMore || !pageState.hasMore) return
    setIsFetchingMore(true)

    try {
      const nextPage = pageState.page + 1
      const result = await fetchNotificationsPage(nextPage, typeFilter)

      setPageState((prev) => {
        const existingIds = new Set(prev.notifications.map((n) => n.id))
        const fresh = result.notifications.filter((n) => !existingIds.has(n.id))
        const merged = [...prev.notifications, ...fresh]

        return {
          ...prev,
          notifications: merged,
          total: result.total,
          unreadCount: result.unreadCount,
          page: nextPage,
          hasMore: merged.length < result.total,
        }
      })
    } catch {
      // silently fail — user can scroll again
    } finally {
      setIsFetchingMore(false)
    }
  }, [isFetchingMore, pageState.hasMore, pageState.page, typeFilter])

  useEffect(() => {
    if (!sentinelRef.current) return

    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNextPage()
      },
      { rootMargin: '200px' }
    )
    observerRef.current.observe(sentinelRef.current)

    return () => observerRef.current?.disconnect()
  }, [loadNextPage])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const markAllReadMutation = useMutation({
    mutationFn: markAllReadApi,
    onSuccess: () => {
      setPageState((prev) => ({
        ...prev,
        unreadCount: 0,
        notifications: prev.notifications.map((n) => ({ ...n, read: true })),
      }))
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] })
    },
  })

  const markOneReadMutation = useMutation({
    mutationFn: markOneReadApi,
    onSuccess: (_res, id) => {
      setPageState((prev) => ({
        ...prev,
        unreadCount: Math.max(0, prev.unreadCount - 1),
        notifications: prev.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
      }))
      queryClient.invalidateQueries({ queryKey: ['notifications-bell'] })
    },
  })

  function handleMarkAllRead() {
    markAllReadMutation.mutate()
  }

  function handleMarkOneRead(id: string) {
    markOneReadMutation.mutate(id)
  }

  // ── Group notifications by recency ─────────────────────────────────────────

  const groups: Record<'Today' | 'This Week' | 'Earlier', Notification[]> = {
    Today: [],
    'This Week': [],
    Earlier: [],
  }

  for (const n of pageState.notifications) {
    groups[groupLabel(n.createdAt)].push(n)
  }

  // ── Render states ──────────────────────────────────────────────────────────

  if (!isInitialized || (isLoading && pageState.notifications.length === 0)) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#0F0F1A' }}
      >
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#7C3AED', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  if (!isAuthenticated) return null

  const hasNotifications = pageState.notifications.length > 0

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0F0F1A' }}>
      <div className="max-w-2xl mx-auto py-8 px-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ color: '#FFFFFF' }}>
              Notifications
            </h1>
            {pageState.unreadCount > 0 && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'rgba(124,58,237,0.2)', color: '#A78BFA' }}
              >
                {pageState.unreadCount} new
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markAllReadMutation.isPending || pageState.unreadCount === 0}
            className="text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: '#7C3AED' }}
            aria-label="Mark all notifications as read"
          >
            {markAllReadMutation.isPending ? 'Marking…' : 'Mark all as read'}
          </button>
        </div>

        {/* ── Filter Tabs ── */}
        <nav
          className="flex gap-1 mb-6 p-1 rounded-xl"
          style={{ backgroundColor: '#1A1A2E' }}
          aria-label="Notification filters"
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all"
              style={
                activeTab === tab.key
                  ? { backgroundColor: '#7C3AED', color: '#FFFFFF' }
                  : { backgroundColor: 'transparent', color: '#8B949E' }
              }
              aria-current={activeTab === tab.key ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ── Notification List ── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: '#1A1A2E', border: '1px solid #2D2D50' }}
        >
          {!hasNotifications ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <span className="text-5xl mb-4" aria-hidden="true">🔔</span>
              <p className="text-base font-medium" style={{ color: '#C9D1D9' }}>
                {EMPTY_STATE_COPY[activeTab]}
              </p>
              <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
                Check back later for updates.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#2D2D50' }}>
              <GroupSection
                label="Today"
                notifications={groups.Today}
                onRead={handleMarkOneRead}
              />
              <GroupSection
                label="This Week"
                notifications={groups['This Week']}
                onRead={handleMarkOneRead}
              />
              <GroupSection
                label="Earlier"
                notifications={groups.Earlier}
                onRead={handleMarkOneRead}
              />
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {hasNotifications && (
            <div ref={sentinelRef} className="h-px" aria-hidden="true" />
          )}

          {/* Loading more spinner */}
          {isFetchingMore && (
            <div className="flex justify-center py-4">
              <div
                className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: '#7C3AED', borderTopColor: 'transparent' }}
              />
            </div>
          )}

          {/* End-of-list message */}
          {hasNotifications && !pageState.hasMore && !isFetchingMore && (
            <p
              className="text-center text-xs py-4"
              style={{ color: '#6B7280' }}
            >
              You&apos;re all caught up
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
