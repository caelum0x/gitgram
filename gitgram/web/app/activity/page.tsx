'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { realtimeService } from '@/services/realtimeService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityFilter = 'all' | 'following' | 'mentions' | 'self'

type ActivityType =
  | 'starred_repo'
  | 'created_post'
  | 'opened_pr'
  | 'merged_pr'
  | 'created_snippet'
  | 'followed_user'
  | 'forked_repo'
  | 'new_release'

interface ActivityActor {
  id: string
  username: string
  displayName?: string
  avatar?: string
  verified?: boolean
}

interface ActivityTarget {
  /** Display label, e.g. "owner/repo", "@username", snippet title. */
  label: string
  /** Relative href within the app, e.g. "/owner/repo". */
  href?: string
  /** Optional secondary description / preview text. */
  preview?: string
}

interface ActivityItem {
  id: string
  type: ActivityType
  actor: ActivityActor
  target: ActivityTarget
  createdAt: string
}

interface ActivityApiResponse {
  items?: ActivityItem[]
  activities?: ActivityItem[]
  data?: ActivityItem[]
  hasMore?: boolean
  nextCursor?: string | null
}

interface TrendingRepo {
  id: string
  owner: string
  name: string
  stars: number
  language?: string
}

interface SuggestedUser {
  id: string
  username: string
  displayName?: string
  avatar?: string
  reason?: string
}

interface DayGroup {
  key: string
  label: string
  items: ActivityItem[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

const FILTER_TABS: { label: string; value: ActivityFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Following', value: 'following' },
  { label: 'Mentions', value: 'mentions' },
  { label: 'Your Activity', value: 'self' },
]

const ACTION_VERBS: Record<ActivityType, string> = {
  starred_repo: 'starred',
  created_post: 'posted',
  opened_pr: 'opened a pull request in',
  merged_pr: 'merged a pull request in',
  created_snippet: 'shared a snippet',
  followed_user: 'started following',
  forked_repo: 'forked',
  new_release: 'published a release for',
}

const ACTION_ICONS: Record<ActivityType, string> = {
  starred_repo: '⭐',
  created_post: '✍️',
  opened_pr: '🔀',
  merged_pr: '🟣',
  created_snippet: '✂️',
  followed_user: '👤',
  forked_repo: '🍴',
  new_release: '🚀',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractItems(data: ActivityApiResponse): ActivityItem[] {
  return data.items ?? data.activities ?? data.data ?? []
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function dayBucket(iso: string): { key: string; label: string; order: number } {
  const now = new Date()
  const todayStart = startOfDay(now)
  const dayMs = 24 * 60 * 60 * 1000
  const createdStart = startOfDay(new Date(iso))
  const diffDays = Math.round((todayStart - createdStart) / dayMs)

  if (diffDays <= 0) return { key: 'today', label: 'Today', order: 0 }
  if (diffDays === 1) return { key: 'yesterday', label: 'Yesterday', order: 1 }
  if (diffDays <= 7) return { key: 'this-week', label: 'This Week', order: 2 }
  return { key: 'earlier', label: 'Earlier', order: 3 }
}

function groupByDay(items: ActivityItem[]): DayGroup[] {
  const map = new Map<string, DayGroup & { order: number }>()
  for (const item of items) {
    const bucket = dayBucket(item.createdAt)
    const existing = map.get(bucket.key)
    if (existing) {
      existing.items.push(item)
    } else {
      map.set(bucket.key, {
        key: bucket.key,
        label: bucket.label,
        order: bucket.order,
        items: [item],
      })
    }
  }
  return Array.from(map.values())
    .sort((a, b) => a.order - b.order)
    .map(({ key, label, items: groupItems }) => ({ key, label, items: groupItems }))
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

function initials(actor: ActivityActor): string {
  const source = actor.displayName || actor.username || '?'
  return source.trim().charAt(0).toUpperCase()
}

// ---------------------------------------------------------------------------
// Presentational components
// ---------------------------------------------------------------------------

interface AvatarProps {
  actor: ActivityActor
  size?: number
}

function Avatar({ actor, size = 40 }: AvatarProps) {
  if (actor.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={actor.avatar}
        alt={actor.username}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size, border: '1px solid var(--border)' }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold"
      style={{
        width: size,
        height: size,
        background: 'var(--surface-secondary)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
      }}
      aria-hidden
    >
      {initials(actor)}
    </div>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const verb = ACTION_VERBS[item.type] ?? 'did something with'
  const icon = ACTION_ICONS[item.type] ?? '✨'
  const actorHref = `/${item.actor.username}`

  return (
    <li
      className="flex gap-3 px-4 py-3"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <Link href={actorHref} aria-label={item.actor.username}>
        <Avatar actor={item.actor} />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug" style={{ color: 'var(--foreground)' }}>
          <span aria-hidden className="mr-1">
            {icon}
          </span>
          <Link
            href={actorHref}
            className="font-semibold hover:underline"
            style={{ color: 'var(--foreground)' }}
          >
            {item.actor.displayName || item.actor.username}
          </Link>{' '}
          <span style={{ color: 'var(--foreground-secondary)' }}>{verb}</span>{' '}
          {item.target.href ? (
            <Link
              href={item.target.href}
              className="font-medium hover:underline"
              style={{ color: 'var(--primary)' }}
            >
              {item.target.label}
            </Link>
          ) : (
            <span className="font-medium" style={{ color: 'var(--primary)' }}>
              {item.target.label}
            </span>
          )}
        </p>

        {item.target.preview ? (
          <p
            className="mt-1 line-clamp-2 text-sm"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            {item.target.preview}
          </p>
        ) : null}

        <time
          className="mt-1 block text-xs"
          style={{ color: 'var(--foreground-secondary)' }}
          dateTime={item.createdAt}
        >
          {relativeTime(item.createdAt)}
        </time>
      </div>
    </li>
  )
}

interface FilterTabsProps {
  active: ActivityFilter
  onChange: (value: ActivityFilter) => void
}

function FilterTabs({ active, onChange }: FilterTabsProps) {
  return (
    <div
      className="flex gap-1 overflow-x-auto"
      role="tablist"
      aria-label="Activity filters"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {FILTER_TABS.map((tab) => {
        const selected = tab.value === active
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className="whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors"
            style={{
              color: selected ? 'var(--foreground)' : 'var(--foreground-secondary)',
              borderBottom: selected
                ? '2px solid var(--primary)'
                : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

interface NewActivityBannerProps {
  count: number
  onClick: () => void
}

function NewActivityBanner({ count, onClick }: NewActivityBannerProps) {
  if (count <= 0) return null
  return (
    <button
      onClick={onClick}
      className="sticky top-2 z-10 block w-full rounded-full px-4 py-2 text-sm font-semibold shadow-md transition-transform hover:scale-[1.01]"
      style={{ background: 'var(--primary)', color: 'var(--content-light)' }}
    >
      {count} new {count === 1 ? 'activity' : 'activities'} — click to load
    </button>
  )
}

interface SidebarCardProps {
  title: string
  children: React.ReactNode
}

function SidebarCard({ title, children }: SidebarCardProps) {
  return (
    <section
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function TrendingList({ repos }: { repos: TrendingRepo[] }) {
  if (repos.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
        Nothing trending yet.
      </p>
    )
  }
  return (
    <ul className="space-y-3">
      {repos.map((repo) => (
        <li key={repo.id}>
          <Link
            href={`/${repo.owner}/${repo.name}`}
            className="block text-sm font-medium hover:underline"
            style={{ color: 'var(--foreground)' }}
          >
            {repo.owner}/{repo.name}
          </Link>
          <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
            {repo.language ? `${repo.language} · ` : ''}
            {repo.stars.toLocaleString()} stars
          </p>
        </li>
      ))}
    </ul>
  )
}

interface SuggestedListProps {
  users: SuggestedUser[]
  onFollow: (username: string) => void
  followed: Set<string>
}

function SuggestedList({ users, onFollow, followed }: SuggestedListProps) {
  if (users.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
        No suggestions right now.
      </p>
    )
  }
  return (
    <ul className="space-y-3">
      {users.map((user) => {
        const isFollowing = followed.has(user.username)
        return (
          <li key={user.id} className="flex items-center gap-3">
            <Link href={`/${user.username}`}>
              <Avatar actor={user} size={36} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/${user.username}`}
                className="block truncate text-sm font-medium hover:underline"
                style={{ color: 'var(--foreground)' }}
              >
                {user.displayName || user.username}
              </Link>
              {user.reason ? (
                <p
                  className="truncate text-xs"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  {user.reason}
                </p>
              ) : null}
            </div>
            <button
              onClick={() => onFollow(user.username)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                background: isFollowing
                  ? 'var(--surface-secondary)'
                  : 'var(--primary)',
                color: isFollowing ? 'var(--foreground)' : 'var(--content-light)',
                border: '1px solid var(--border)',
              }}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ActivitySkeleton() {
  return (
    <ul className="mt-4 space-y-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex gap-3 rounded-lg p-3"
          style={{ background: 'var(--surface)' }}
        >
          <div
            className="h-10 w-10 flex-shrink-0 rounded-full"
            style={{ background: 'var(--surface-secondary)' }}
          />
          <div className="flex-1 space-y-2 py-1">
            <div
              className="h-3 w-3/4 rounded"
              style={{ background: 'var(--surface-secondary)' }}
            />
            <div
              className="h-3 w-1/3 rounded"
              style={{ background: 'var(--surface-secondary)' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ActivityPage() {
  const router = useRouter()
  const { user, isAuthenticated, isInitialized } = useAuthStore()

  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [items, setItems] = useState<ActivityItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pending, setPending] = useState<ActivityItem[]>([])
  const [trending, setTrending] = useState<TrendingRepo[]>([])
  const [suggested, setSuggested] = useState<SuggestedUser[]>([])
  const [followed, setFollowed] = useState<Set<string>>(new Set())

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const isFetchingRef = useRef(false)
  const seenIdsRef = useRef<Set<string>>(new Set())

  // -- Auth guard ----------------------------------------------------------
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push('/login')
    }
  }, [isInitialized, isAuthenticated, router])

  // -- Fetch one page ------------------------------------------------------
  const fetchPage = useCallback(
    async (activeFilter: ActivityFilter, nextCursor?: string, append = false) => {
      if (isFetchingRef.current) return
      isFetchingRef.current = true

      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
        setError(null)
      }

      try {
        const params: Record<string, string | number> = {
          filter: activeFilter,
          limit: PAGE_SIZE,
        }
        if (nextCursor) params.cursor = nextCursor

        const { data } = await api.get<ActivityApiResponse>('/v1/activity', { params })
        const fetched = extractItems(data)

        if (append) {
          const fresh = fetched.filter((item) => {
            if (seenIdsRef.current.has(item.id)) return false
            seenIdsRef.current.add(item.id)
            return true
          })
          setItems((prev) => [...prev, ...fresh])
        } else {
          seenIdsRef.current = new Set(fetched.map((i) => i.id))
          setItems(fetched)
        }

        setHasMore(data.hasMore ?? fetched.length === PAGE_SIZE)
        setCursor(data.nextCursor ?? undefined)
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to load activity.'
        setError(message)
        if (!append) setItems([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
        isFetchingRef.current = false
      }
    },
    [],
  )

  // -- Reset + fetch when filter changes -----------------------------------
  useEffect(() => {
    seenIdsRef.current = new Set()
    setCursor(undefined)
    setHasMore(true)
    setPending([])
    fetchPage(filter, undefined, false)
  }, [filter, fetchPage])

  // -- Infinite scroll observer --------------------------------------------
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && hasMore && !loading && !loadingMore) {
          fetchPage(filter, cursor, true)
        }
      },
      { rootMargin: '300px' },
    )

    const sentinel = sentinelRef.current
    if (sentinel) observerRef.current.observe(sentinel)

    return () => observerRef.current?.disconnect()
  }, [hasMore, loading, loadingMore, cursor, filter, fetchPage])

  // -- Sidebar data (non-critical) -----------------------------------------
  useEffect(() => {
    let cancelled = false

    api
      .get<{ repos?: TrendingRepo[]; data?: TrendingRepo[] }>('/v1/trending/repos', {
        params: { scope: 'network', limit: 5 },
      })
      .then(({ data }) => {
        if (!cancelled) setTrending(data.repos ?? data.data ?? [])
      })
      .catch(() => {
        /* sidebar is non-critical */
      })

    api
      .get<{ users?: SuggestedUser[]; data?: SuggestedUser[] }>('/v1/users/suggested', {
        params: { limit: 5 },
      })
      .then(({ data }) => {
        if (!cancelled) setSuggested(data.users ?? data.data ?? [])
      })
      .catch(() => {
        /* sidebar is non-critical */
      })

    return () => {
      cancelled = true
    }
  }, [])

  // -- Live new-activity banner via SSE ------------------------------------
  useEffect(() => {
    if (!user?.id) return
    realtimeService.connect(user.id)

    const unsubscribe = realtimeService.onNotification((notification) => {
      // Only surface activity-shaped events as new feed items.
      const type = notification.type as ActivityType
      if (!ACTION_VERBS[type]) return
      if (seenIdsRef.current.has(notification.id)) return

      const item: ActivityItem = {
        id: notification.id,
        type,
        actor: {
          id: notification.actorId ?? notification.id,
          username: notification.actorUsername ?? 'someone',
        },
        target: {
          label: notification.message || 'new activity',
          href: notification.postId ? `/post/${notification.postId}` : undefined,
        },
        createdAt: notification.createdAt,
      }
      setPending((prev) => [item, ...prev])
    })

    return () => {
      unsubscribe()
    }
  }, [user?.id])

  const loadPending = useCallback(() => {
    setPending((queued) => {
      if (queued.length === 0) return queued
      const fresh = queued.filter((item) => {
        if (seenIdsRef.current.has(item.id)) return false
        seenIdsRef.current.add(item.id)
        return true
      })
      setItems((prev) => [...fresh, ...prev])
      return []
    })
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const handleFollow = useCallback((username: string) => {
    setFollowed((prev) => {
      const next = new Set(prev)
      const wasFollowing = next.has(username)
      if (wasFollowing) next.delete(username)
      else next.add(username)

      const request = wasFollowing
        ? api.delete(`/v1/users/${username}/follow`)
        : api.post(`/v1/users/${username}/follow`)
      request.catch(() => {
        // Roll back optimistic update on failure.
        setFollowed((rollback) => {
          const reverted = new Set(rollback)
          if (wasFollowing) reverted.add(username)
          else reverted.delete(username)
          return reverted
        })
      })
      return next
    })
  }, [])

  const groups = useMemo(() => groupByDay(items), [items])

  if (!isInitialized) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <span style={{ color: 'var(--foreground-secondary)' }}>Loading…</span>
      </div>
    )
  }

  if (!isAuthenticated) return null

  const showEmpty = !loading && items.length === 0 && !error

  return (
    <div
      className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px]"
      style={{ color: 'var(--foreground)' }}
    >
      {/* Main column ----------------------------------------------------- */}
      <main>
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Activity</h1>
          <p
            className="mt-1 text-sm"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            What people you follow are building
          </p>
        </header>

        <FilterTabs active={filter} onChange={setFilter} />

        <div className="mt-4">
          <NewActivityBanner count={pending.length} onClick={loadPending} />
        </div>

        {error ? (
          <div
            className="mt-4 rounded-lg p-4 text-sm"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--error)',
              color: 'var(--error)',
            }}
          >
            {error}
            <button
              onClick={() => fetchPage(filter, undefined, false)}
              className="ml-3 font-semibold underline"
            >
              Retry
            </button>
          </div>
        ) : null}

        {loading && items.length === 0 ? (
          <ActivitySkeleton />
        ) : showEmpty ? (
          <div
            className="mt-8 rounded-xl p-8 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-base font-medium">No activity yet</p>
            <p
              className="mt-1 text-sm"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              {filter === 'following'
                ? 'Follow more people to see what they are up to.'
                : 'Activity will show up here as it happens.'}
            </p>
            <Link
              href="/explore/developers"
              className="mt-4 inline-block rounded-full px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--primary)', color: 'var(--content-light)' }}
            >
              Discover people
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <h2
                  className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  {group.label}
                </h2>
                <ul
                  className="overflow-hidden rounded-xl"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {group.items.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel + status */}
        <div ref={sentinelRef} className="h-px" />
        {loadingMore ? (
          <p
            className="py-4 text-center text-sm"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            Loading more…
          </p>
        ) : null}
        {!hasMore && items.length > 0 ? (
          <p
            className="py-6 text-center text-xs"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            You&rsquo;re all caught up
          </p>
        ) : null}
      </main>

      {/* Right sidebar --------------------------------------------------- */}
      <aside className="hidden space-y-4 lg:block">
        <SidebarCard title="Trending in your network">
          <TrendingList repos={trending} />
        </SidebarCard>

        <SidebarCard title="Suggested follows">
          <SuggestedList users={suggested} onFollow={handleFollow} followed={followed} />
        </SidebarCard>
      </aside>
    </div>
  )
}
