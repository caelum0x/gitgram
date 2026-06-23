'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'
import CodeSnippetCard from '@/components/CodeSnippetCard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SavedPostAuthor {
  username: string
  displayName: string
  avatarUrl?: string
}

interface SavedPost {
  id: string
  content: string
  author: SavedPostAuthor
  likes: number
  comments: number
  createdAt: string
}

interface SavedSnippet {
  id: string
  title: string
  language: string
  code: string
  author: {
    username: string
    avatarUrl?: string
  }
  likes: number
  comments: number
  createdAt: string
  isLiked?: boolean
}

type SortOption = 'recent' | 'liked' | 'author'

interface SavedPostsPage {
  items: SavedPost[]
  hasNextPage: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return `${diffMo}mo ago`
  return `${Math.floor(diffMo / 12)}y ago`
}

function sortPosts(posts: SavedPost[], sort: SortOption): SavedPost[] {
  return [...posts].sort((a, b) => {
    if (sort === 'liked') return b.likes - a.likes
    if (sort === 'author') return a.author.username.localeCompare(b.author.username)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

function sortSnippets(snippets: SavedSnippet[], sort: SortOption): SavedSnippet[] {
  return [...snippets].sort((a, b) => {
    if (sort === 'liked') return b.likes - a.likes
    if (sort === 'author') return a.author.username.localeCompare(b.author.username)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SavedPageSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading saved items">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl p-4 animate-pulse flex gap-3"
          style={{
            backgroundColor: 'var(--surface, #1A1A2E)',
            border: '1px solid var(--border, #2D2D50)',
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex-shrink-0"
            style={{ backgroundColor: 'var(--surface-secondary, #21262d)' }}
          />
          <div className="flex-1 space-y-2">
            <div className="h-4 rounded w-1/4" style={{ backgroundColor: 'var(--surface-secondary, #21262d)' }} />
            <div className="h-3 rounded w-3/4" style={{ backgroundColor: 'var(--surface-secondary, #21262d)' }} />
            <div className="h-3 rounded w-1/2" style={{ backgroundColor: 'var(--surface-secondary, #21262d)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function SavedEmptyState({ tab }: { tab: 'posts' | 'snippets' }) {
  const router = useRouter()
  const isPost = tab === 'posts'

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{ backgroundColor: 'rgba(124, 58, 237, 0.12)' }}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-8 h-8"
          fill="none"
          stroke="#7C3AED"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--foreground, #c9d1d9)' }}>
        No saved {isPost ? 'posts' : 'snippets'} yet
      </h3>
      <p className="text-sm mb-6 max-w-xs" style={{ color: 'var(--foreground-secondary, #8b949e)' }}>
        {isPost
          ? 'Bookmark posts from the feed to find them here later.'
          : 'Save code snippets you want to revisit anytime.'}
      </p>
      <button
        onClick={() => router.push(isPost ? '/feed' : '/explore')}
        className="px-5 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
        style={{ backgroundColor: '#7C3AED', color: '#fff' }}
      >
        {isPost ? 'Explore feed' : 'Discover snippets'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Author avatar
// ---------------------------------------------------------------------------

interface AuthorAvatarProps {
  username: string
  avatarUrl?: string
  size?: number
}

function AuthorAvatar({ username, avatarUrl, size = 40 }: AuthorAvatarProps) {
  const initial = username.charAt(0).toUpperCase()
  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
  }

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={`${username} avatar`}
        style={{ ...baseStyle, objectFit: 'cover', border: '1px solid var(--border, #2D2D50)' }}
      />
    )
  }

  return (
    <div
      style={{
        ...baseStyle,
        background: 'linear-gradient(135deg, #6366f1, #7C3AED)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.375,
        fontWeight: 700,
        color: '#fff',
        border: '1px solid var(--border, #2D2D50)',
      }}
      aria-label={`${username} avatar`}
    >
      {initial}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Saved post compact card
// ---------------------------------------------------------------------------

interface SavedPostCardProps {
  post: SavedPost
  onRemove: (id: string) => void
  removing: boolean
}

function SavedPostCard({ post, onRemove, removing }: SavedPostCardProps) {
  const contentPreview =
    post.content.length > 140 ? post.content.slice(0, 140) + '…' : post.content

  return (
    <article
      className="rounded-xl p-4 flex gap-3 transition-opacity"
      style={{
        backgroundColor: 'var(--surface, #1A1A2E)',
        border: '1px solid var(--border, #2D2D50)',
        opacity: removing ? 0.5 : 1,
      }}
    >
      <Link
        href={`/${post.author.username}`}
        className="flex-shrink-0"
        aria-label={`View ${post.author.username}'s profile`}
      >
        <AuthorAvatar username={post.author.username} avatarUrl={post.author.avatarUrl} size={40} />
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Link
            href={`/${post.author.username}`}
            className="text-sm font-semibold hover:underline truncate"
            style={{ color: 'var(--foreground, #c9d1d9)' }}
          >
            {post.author.displayName || post.author.username}
          </Link>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--foreground-secondary, #8b949e)' }}>
            @{post.author.username}
          </span>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--foreground-secondary, #8b949e)' }}>
            &middot; {formatRelativeTime(post.createdAt)}
          </span>
        </div>

        <Link href={`/post/${post.id}`}>
          <p className="text-sm leading-relaxed line-clamp-2" style={{ color: 'var(--foreground-secondary, #8b949e)' }}>
            {contentPreview}
          </p>
        </Link>

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--foreground-secondary, #8b949e)' }}
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              {post.likes.toLocaleString()}
            </span>
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--foreground-secondary, #8b949e)' }}
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {post.comments.toLocaleString()}
            </span>
          </div>

          <button
            onClick={() => onRemove(post.id)}
            disabled={removing}
            className="text-xs px-3 py-1 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
            style={{ color: 'var(--error, #da3633)', backgroundColor: 'rgba(218,54,51,0.08)' }}
            aria-label={`Remove ${post.author.username}'s post from saved`}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Search + Sort toolbar
// ---------------------------------------------------------------------------

interface ToolbarProps {
  search: string
  sort: SortOption
  onSearchChange: (value: string) => void
  onSortChange: (value: SortOption) => void
}

function Toolbar({ search, sort, onSearchChange, onSortChange }: ToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-4">
      <div className="relative flex-1">
        <svg
          viewBox="0 0 24 24"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
          style={{ color: 'var(--foreground-secondary, #8b949e)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search saved items…"
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
          style={{
            backgroundColor: 'var(--surface, #1A1A2E)',
            border: '1px solid var(--border, #2D2D50)',
            color: 'var(--foreground, #c9d1d9)',
          }}
        />
      </div>

      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortOption)}
        className="text-sm rounded-lg px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] cursor-pointer"
        style={{
          backgroundColor: 'var(--surface, #1A1A2E)',
          border: '1px solid var(--border, #2D2D50)',
          color: 'var(--foreground, #c9d1d9)',
        }}
        aria-label="Sort saved items"
      >
        <option value="recent">Most recent</option>
        <option value="liked">Most liked</option>
        <option value="author">By author</option>
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Posts tab
// ---------------------------------------------------------------------------

const POSTS_LIMIT = 20

function PostsTab() {
  const [pages, setPages] = useState<SavedPostsPage[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('recent')

  const sentinelRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const allPosts = useMemo(() => pages.flatMap((p) => p.items), [pages])

  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q
      ? allPosts.filter(
          (p) =>
            p.content.toLowerCase().includes(q) ||
            p.author.username.toLowerCase().includes(q) ||
            p.author.displayName.toLowerCase().includes(q)
        )
      : allPosts
    return sortPosts(base, sort)
  }, [allPosts, search, sort])

  const fetchPage = useCallback(async (page: number) => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const { data } = await api.get<{ items: SavedPost[]; total: number }>('/users/saved', {
        params: { type: 'post', page, limit: POSTS_LIMIT },
      })
      const items: SavedPost[] = data.items ?? []
      const hasNextPage = items.length === POSTS_LIMIT
      setPages((prev) => (page === 1 ? [{ items, hasNextPage }] : [...prev, { items, hasNextPage }]))
      setHasMore(hasNextPage)
      setCurrentPage(page)
    } catch (err) {
      setFetchError('Failed to load saved posts. Please try again.')
      console.error('Saved posts fetch error:', err)
    } finally {
      setIsLoading(false)
      setIsInitialLoad(false)
    }
  }, [])

  useEffect(() => {
    fetchPage(1)
  }, [fetchPage])

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && hasMore && !isLoading) {
          fetchPage(currentPage + 1)
        }
      },
      { rootMargin: '200px' }
    )

    const sentinel = sentinelRef.current
    if (sentinel) observerRef.current.observe(sentinel)

    return () => observerRef.current?.disconnect()
  }, [hasMore, isLoading, currentPage, fetchPage])

  const handleRemove = useCallback(async (postId: string) => {
    setRemovingIds((prev) => new Set(prev).add(postId))
    try {
      await api.delete(`/users/saved/${postId}`)
      setPages((prev) =>
        prev.map((pg) => ({ ...pg, items: pg.items.filter((p) => p.id !== postId) }))
      )
    } catch (err) {
      console.error('Remove saved post error:', err)
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(postId)
        return next
      })
    }
  }, [])

  if (isInitialLoad) return <SavedPageSkeleton />

  if (fetchError) {
    return (
      <div className="py-10 text-center text-sm" style={{ color: 'var(--error, #da3633)' }}>
        {fetchError}
        <button
          onClick={() => fetchPage(1)}
          className="ml-2 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
          style={{ color: '#7C3AED' }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <Toolbar search={search} sort={sort} onSearchChange={setSearch} onSortChange={setSort} />

      {filteredPosts.length === 0 && !isLoading ? (
        search.trim() ? (
          <p className="text-center text-sm py-10" style={{ color: 'var(--foreground-secondary, #8b949e)' }}>
            No results for &ldquo;{search}&rdquo;
          </p>
        ) : (
          <SavedEmptyState tab="posts" />
        )
      ) : (
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <SavedPostCard
              key={post.id}
              post={post}
              onRemove={handleRemove}
              removing={removingIds.has(post.id)}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} aria-hidden="true" />

      {isLoading && !isInitialLoad && (
        <div className="pt-4">
          <SavedPageSkeleton />
        </div>
      )}

      {!hasMore && filteredPosts.length > 0 && (
        <p className="text-center text-xs py-6" style={{ color: 'var(--foreground-secondary, #8b949e)' }}>
          You&apos;ve reached the end
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Snippets tab
// ---------------------------------------------------------------------------

function SnippetsTab() {
  const [snippets, setSnippets] = useState<SavedSnippet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOption>('recent')

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      setIsLoading(true)
      setFetchError(null)
      try {
        const { data } = await api.get<{ items: SavedSnippet[] }>('/users/saved', {
          params: { type: 'snippet' },
          signal: controller.signal,
        })
        setSnippets(data.items ?? [])
      } catch (err) {
        if ((err as { name?: string }).name !== 'CanceledError') {
          setFetchError('Failed to load saved snippets. Please try again.')
          console.error('Saved snippets fetch error:', err)
        }
      } finally {
        setIsLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [])

  const filteredSnippets = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q
      ? snippets.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            s.language.toLowerCase().includes(q) ||
            s.author.username.toLowerCase().includes(q)
        )
      : snippets
    return sortSnippets(base, sort)
  }, [snippets, search, sort])

  const handleLike = useCallback((id: string) => {
    setSnippets((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, isLiked: !s.isLiked, likes: s.isLiked ? s.likes - 1 : s.likes + 1 }
          : s
      )
    )
  }, [])

  if (isLoading) return <SavedPageSkeleton />

  if (fetchError) {
    return (
      <div className="py-10 text-center text-sm" style={{ color: 'var(--error, #da3633)' }}>
        {fetchError}
      </div>
    )
  }

  return (
    <>
      <Toolbar search={search} sort={sort} onSearchChange={setSearch} onSortChange={setSort} />

      {filteredSnippets.length === 0 ? (
        search.trim() ? (
          <p className="text-center text-sm py-10" style={{ color: 'var(--foreground-secondary, #8b949e)' }}>
            No results for &ldquo;{search}&rdquo;
          </p>
        ) : (
          <SavedEmptyState tab="snippets" />
        )
      ) : (
        <div className="space-y-4">
          {filteredSnippets.map((snippet) => (
            <CodeSnippetCard key={snippet.id} snippet={snippet} onLike={handleLike} />
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type TabId = 'posts' | 'snippets'

interface TabDef {
  id: TabId
  label: string
}

const TABS: TabDef[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'snippets', label: 'Snippets' },
]

export default function SavedPage() {
  const [activeTab, setActiveTab] = useState<TabId>('posts')

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'var(--background, #0F0F1A)' }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground, #c9d1d9)' }}>
            Saved
          </h1>
          <p className="text-sm" style={{ color: 'var(--foreground-secondary, #8b949e)' }}>
            Posts and snippets you&apos;ve bookmarked
          </p>
        </div>

        {/* Tab bar */}
        <div
          className="flex gap-1 p-1 rounded-xl mb-6"
          style={{
            backgroundColor: 'var(--surface, #1A1A2E)',
            border: '1px solid var(--border, #2D2D50)',
          }}
          role="tablist"
          aria-label="Saved content tabs"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                id={`saved-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`saved-tabpanel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]"
                style={{
                  backgroundColor: isActive ? '#7C3AED' : 'transparent',
                  color: isActive ? '#fff' : 'var(--foreground-secondary, #8b949e)',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab panels */}
        <div
          role="tabpanel"
          id="saved-tabpanel-posts"
          aria-labelledby="saved-tab-posts"
          hidden={activeTab !== 'posts'}
        >
          {activeTab === 'posts' && <PostsTab />}
        </div>

        <div
          role="tabpanel"
          id="saved-tabpanel-snippets"
          aria-labelledby="saved-tab-snippets"
          hidden={activeTab !== 'snippets'}
        >
          {activeTab === 'snippets' && <SnippetsTab />}
        </div>
      </div>
    </main>
  )
}
