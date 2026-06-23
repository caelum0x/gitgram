'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  collectionsService,
  type Collection,
  type CollectionSort,
  type CollectionTab,
} from '@/services/collectionsService'
import { useToast } from '@/components/ui/toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CollectionCardSkeleton() {
  return (
    <div
      className="rounded-xl overflow-hidden animate-pulse"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="aspect-video w-full" style={{ background: 'var(--surface-secondary)' }} />
      <div className="p-4">
        <div className="h-4 w-3/4 rounded mb-2" style={{ background: 'var(--surface-secondary)' }} />
        <div className="h-3 w-1/2 rounded mb-3" style={{ background: 'var(--surface-secondary)' }} />
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full" style={{ background: 'var(--surface-secondary)' }} />
          <div className="h-3 w-20 rounded" style={{ background: 'var(--surface-secondary)' }} />
        </div>
      </div>
    </div>
  )
}

interface PrivacyBadgeProps {
  isPrivate: boolean
}

function PrivacyBadge({ isPrivate }: PrivacyBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{
        background: isPrivate ? 'rgba(210,153,34,0.15)' : 'rgba(35,134,54,0.15)',
        color: isPrivate ? 'var(--warning)' : 'var(--accent)',
        border: `1px solid ${isPrivate ? 'var(--warning)' : 'var(--accent)'}`,
      }}
    >
      {isPrivate ? (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          Private
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
          </svg>
          Public
        </>
      )}
    </span>
  )
}

interface CollectionCardProps {
  collection: Collection
}

function CollectionCard({ collection }: CollectionCardProps) {
  const router = useRouter()
  const initial = collection.user.username[0]?.toUpperCase() ?? '?'

  return (
    <div
      className="group rounded-xl overflow-hidden cursor-pointer transition-shadow hover:shadow-lg"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      onClick={() => router.push(`/collections/${collection.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') router.push(`/collections/${collection.id}`)
      }}
    >
      {/* Cover image */}
      <div
        className="aspect-video w-full relative overflow-hidden"
        style={{ background: 'var(--surface-secondary)' }}
      >
        {collection.coverUrl ? (
          <img
            src={collection.coverUrl}
            alt={collection.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="opacity-20"
              style={{ color: 'var(--foreground)' }}
            >
              <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
        )}

        {/* Privacy badge overlay */}
        <div className="absolute top-2 right-2">
          <PrivacyBadge isPrivate={collection.isPrivate} />
        </div>
      </div>

      {/* Card body */}
      <div className="p-4">
        {/* Name */}
        <h3
          className="font-semibold text-sm leading-snug mb-1 truncate"
          style={{ color: 'var(--foreground)' }}
        >
          {collection.name}
        </h3>

        {/* Description */}
        {collection.description && (
          <p
            className="text-xs leading-relaxed mb-2 line-clamp-2"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            {collection.description}
          </p>
        )}

        {/* Meta row: item count + last updated */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
            {collection.itemCount} {collection.itemCount === 1 ? 'item' : 'items'}
          </span>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
            {formatRelativeTime(collection.updatedAt)}
          </span>
        </div>

        {/* Owner row */}
        <Link
          href={`/${collection.user.username}`}
          className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {collection.user.avatar ? (
            <img
              src={collection.user.avatar}
              alt={collection.user.username}
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <div
              className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              {initial}
            </div>
          )}
          <span className="text-xs font-medium" style={{ color: 'var(--foreground-secondary)' }}>
            {collection.user.username}
          </span>
        </Link>
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS: { value: CollectionTab; label: string }[] = [
  { value: 'mine', label: 'My Collections' },
  { value: 'following', label: 'Following' },
  { value: 'discover', label: 'Discover' },
]

// ── Sort options ───────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: CollectionSort; label: string }[] = [
  { value: 'updatedAt', label: 'Recently updated' },
  { value: 'itemCount', label: 'Most items' },
  { value: 'name', label: 'Alphabetical' },
]

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ tab, hasSearch }: { tab: CollectionTab; hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="col-span-full text-center py-16">
        <svg
          className="mx-auto mb-4 opacity-30"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ color: 'var(--foreground-secondary)' }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>
          No collections found
        </p>
        <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
          Try a different search term
        </p>
      </div>
    )
  }

  const messages: Record<CollectionTab, { title: string; subtitle: string }> = {
    mine: {
      title: 'No collections yet',
      subtitle: 'Create your first collection to organise posts you love.',
    },
    following: {
      title: 'Nothing here yet',
      subtitle: 'Collections from people you follow will appear here.',
    },
    discover: {
      title: 'Check back later',
      subtitle: 'Public collections from the community will appear here.',
    },
  }

  const { title, subtitle } = messages[tab]

  return (
    <div className="col-span-full text-center py-16">
      <svg
        className="mx-auto mb-4 opacity-30"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        style={{ color: 'var(--foreground-secondary)' }}
      >
        <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <p className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>
        {title}
      </p>
      <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
        {subtitle}
      </p>
      {tab === 'mine' && (
        <Link
          href="/collections/create"
          className="inline-block mt-4 px-5 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Create Collection
        </Link>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollectionsPage() {
  const { showToast } = useToast()

  const [tab, setTab] = useState<CollectionTab>('mine')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<CollectionSort>('updatedAt')
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  const debouncedSearch = useDebounce(search, 350)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (pageNum === 1) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }
      try {
        const result = await collectionsService.list({
          tab,
          search: debouncedSearch || undefined,
          sort,
          page: pageNum,
          limit: 18,
        })
        setCollections((prev) =>
          replace ? result.collections : [...prev, ...result.collections]
        )
        setTotalPages(result.totalPages)
        setPage(result.page)
      } catch {
        showToast('Failed to load collections', 'error')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [tab, debouncedSearch, sort, showToast]
  )

  // Re-fetch from page 1 whenever tab / search / sort changes
  useEffect(() => {
    fetchPage(1, true)
  }, [fetchPage])

  // ── Infinite scroll ────────────────────────────────────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    observerRef.current?.disconnect()
    if (page >= totalPages || loadingMore) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchPage(page + 1, false)
        }
      },
      { threshold: 0.1 }
    )
    observerRef.current.observe(sentinel)

    return () => observerRef.current?.disconnect()
  }, [page, totalPages, loadingMore, fetchPage])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>
              Collections
            </h1>
            <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              Curated lists of posts organised by topic or theme.
            </p>
          </div>
          <Link
            href="/collections/create"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Collection
          </Link>
        </div>

        {/* Tabs */}
        <div
          className="flex items-center gap-1 mb-5 rounded-xl p-1 w-fit"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: tab === value ? 'var(--surface-secondary)' : 'transparent',
                color: tab === value ? 'var(--foreground)' : 'var(--foreground-secondary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search + Sort toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search collections…"
              className="w-full pl-9 pr-4 py-2 rounded-lg text-sm transition-colors focus:outline-none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
            />
          </div>

          {/* Sort */}
          <div className="relative shrink-0">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as CollectionSort)}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm cursor-pointer focus:outline-none"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
            >
              {SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading &&
            Array.from({ length: 6 }).map((_, i) => <CollectionCardSkeleton key={i} />)}

          {!loading && collections.length === 0 && (
            <EmptyState tab={tab} hasSearch={debouncedSearch.length > 0} />
          )}

          {!loading &&
            collections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}

          {/* Infinite-scroll loading row */}
          {loadingMore &&
            Array.from({ length: 3 }).map((_, i) => <CollectionCardSkeleton key={`more-${i}`} />)}
        </div>

        {/* Sentinel */}
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      </div>
    </div>
  )
}
