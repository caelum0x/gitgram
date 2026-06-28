'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { postService } from '@/services/postService'
import PostCard, { type Post } from '@/components/PostCard'
import StoriesRing from '@/components/StoriesRing'
import { useToast } from '@/components/ui/toast'
import PullToRefresh from '@/components/PullToRefresh'
import { getErrorMessage } from '@/utils/error'

// ---------------------------------------------------------------------------
// Compose widget — "What's happening" quick-post box
// ---------------------------------------------------------------------------

interface ComposeWidgetProps {
  userAvatarUrl?: string | null
  onNavigateToCreate: (mode?: 'photo' | 'code' | 'repo') => void
}

function ComposeWidget({ userAvatarUrl, onNavigateToCreate }: ComposeWidgetProps) {
  const [focused, setFocused] = useState(false)

  const avatarInitial = userAvatarUrl ? null : '?'

  return (
    <div
      style={{
        margin: '12px 16px 0',
        background: 'var(--surface, #161b22)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: 12,
        padding: '12px 14px',
        transition: 'border-color 0.15s',
        ...(focused ? { borderColor: '#7C3AED' } : {}),
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {/* Avatar */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: userAvatarUrl ? 'transparent' : '#7C3AED',
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          {userAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userAvatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            avatarInitial
          )}
        </div>

        {/* Fake text input — clicking opens the full create page */}
        <button
          onClick={() => onNavigateToCreate()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            background: 'var(--surface-secondary, #21262d)',
            border: 'none',
            borderRadius: 20,
            padding: '9px 16px',
            textAlign: 'left',
            color: 'var(--foreground-secondary, #8b949e)',
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          What are you building?
        </button>
      </div>

      {/* Quick action row */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--border, #30363d)',
        }}
      >
        <QuickActionButton
          label="Photo"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          }
          onClick={() => onNavigateToCreate('photo')}
        />
        <QuickActionButton
          label="Code"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          }
          onClick={() => onNavigateToCreate('code')}
        />
        <QuickActionButton
          label="Repository"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          }
          onClick={() => onNavigateToCreate('repo')}
        />
      </div>
    </div>
  )
}

interface QuickActionButtonProps {
  label: string
  icon: React.ReactNode
  onClick: () => void
}

function QuickActionButton({ label, icon, onClick }: QuickActionButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'transparent',
        border: '1px solid var(--border, #30363d)',
        borderRadius: 20,
        color: 'var(--foreground-secondary, #8b949e)',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'var(--surface-secondary, #21262d)'
        el.style.color = 'var(--foreground, #c9d1d9)'
        el.style.borderColor = '#7C3AED'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'transparent'
        el.style.color = 'var(--foreground-secondary, #8b949e)'
        el.style.borderColor = 'var(--border, #30363d)'
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Feed post normalization — maps the API payload into the shared `Post` shape
// consumed by PostCard, tolerating field-name variations from the backend.
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizePost(raw: unknown): Post {
  const r = (raw ?? {}) as Record<string, unknown>
  const authorRaw = (r.author ?? r.user ?? {}) as Record<string, unknown>
  const count = (r._count ?? {}) as Record<string, unknown>

  return {
    id: String(r.id ?? ''),
    content: String(r.content ?? ''),
    author: {
      username: String(authorRaw.username ?? ''),
      displayName: String(authorRaw.displayName ?? authorRaw.name ?? authorRaw.username ?? ''),
      avatarUrl: (authorRaw.avatarUrl as string) ?? (authorRaw.avatar as string) ?? undefined,
    },
    likes: toNumber(r.likes ?? r.likesCount ?? count.likes),
    comments: toNumber(r.comments ?? r.commentsCount ?? count.comments),
    reposts: toNumber(r.reposts ?? r.sharesCount ?? count.shares),
    createdAt: String(r.createdAt ?? new Date().toISOString()),
    tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : undefined,
    repoOwner: (r.repoOwner as string) ?? undefined,
    repoName: (r.repoName as string) ?? undefined,
    isLiked: Boolean(r.isLiked),
  }
}

interface FeedApiResponse {
  posts?: unknown[]
  nextCursor?: string | null
}

function extractPosts(data: FeedApiResponse | unknown[]): unknown[] {
  if (Array.isArray(data)) return data
  return data.posts ?? []
}

// ---------------------------------------------------------------------------
// FeedPage
// ---------------------------------------------------------------------------

export default function FeedPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized, user } = useAuthStore()
  const { showToast } = useToast()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const avatarUrl: string | null = user?.avatar ?? null

  const handleNavigateToCreate = (mode?: 'photo' | 'code' | 'repo') => {
    const params = mode ? `?mode=${mode}` : ''
    router.push(`/create${params}`)
  }

  useEffect(() => {
    if (!isInitialized) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    void loadFeed()
  }, [isAuthenticated, isInitialized])

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated || !user || posts.length > 0) return
    const interests = user.interests
    if (!interests?.length) {
      const redirected = sessionStorage.getItem('gitgram_onboarding_redirected')
      if (!redirected) {
        sessionStorage.setItem('gitgram_onboarding_redirected', '1')
        router.push('/onboarding/welcome')
      }
    }
  }, [loading, isAuthenticated, user, posts.length])

  // Infinite scroll sentinel
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          void loadMore()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, cursor])

  const loadFeed = async () => {
    setLoading(true)
    try {
      // Use the cursor-based endpoint for the first page too, so infinite
      // scroll continues consistently past page one regardless of whether the
      // page-based response happens to include a cursor.
      const data = (await postService.getFeedCursor()) as FeedApiResponse | unknown[]
      const nextCursor = Array.isArray(data) ? null : data.nextCursor ?? null
      const loaded = extractPosts(data).map(normalizePost)
      setPosts(loaded)
      setCursor(nextCursor)
      setHasMore(!!nextCursor)
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = (await postService.getFeedCursor(cursor)) as FeedApiResponse | unknown[]
      const nextCursor = Array.isArray(data) ? null : data.nextCursor ?? null
      const newPosts = extractPosts(data).map(normalizePost)
      setPosts(prev => [...prev, ...newPosts])
      setCursor(nextCursor)
      setHasMore(!!nextCursor)
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  const handleLike = async (postId: string) => {
    try {
      await postService.likePost(postId)
      setPosts(prev =>
        prev.map(p => (p.id === postId ? { ...p, isLiked: true, likes: p.likes + 1 } : p)),
      )
    } catch {
      showToast('Failed to like post', 'error')
    }
  }

  if (!isInitialized) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F0F1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94A3B8' }}>Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div style={{ minHeight: '100vh', background: '#0F0F1A' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 80 }}>
        {/* Stories ring */}
        <div style={{ padding: '16px 0 8px', borderBottom: '1px solid #2D2D50' }}>
          <StoriesRing onUserClick={(userId) => router.push(`/stories/${userId}`)} />
        </div>

        {/* Feed header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 8px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#E2E8F0', margin: 0 }}>For You</h1>
          <button
            onClick={() => router.push('/create')}
            style={{
              padding: '8px 16px',
              background: '#7C3AED',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            + Post
          </button>
        </div>

        {/* Compose widget — "What's happening" quick-post box */}
        <ComposeWidget
          userAvatarUrl={avatarUrl}
          onNavigateToCreate={handleNavigateToCreate}
        />

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border, #30363d)', margin: '12px 0 0' }} />

        {loading ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94A3B8' }}>
            Loading your feed...
          </div>
        ) : posts.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: '#94A3B8' }}>
            <p style={{ marginBottom: 16 }}>Your feed is empty. Follow some developers!</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => router.push('/discover')}
                style={{ padding: '10px 20px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                Discover People
              </button>
              <button
                onClick={() => router.push('/trending')}
                style={{ padding: '10px 20px', background: 'transparent', color: '#7C3AED', border: '1px solid #7C3AED', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                Trending
              </button>
            </div>
          </div>
        ) : (
          <PullToRefresh onRefresh={loadFeed}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLike={handleLike}
                />
              ))}
              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {loadingMore && <span style={{ color: '#94A3B8', fontSize: 13 }}>Loading more...</span>}
                {!hasMore && posts.length > 0 && <span style={{ color: '#64748B', fontSize: 13 }}>You're all caught up ✓</span>}
              </div>
            </div>
          </PullToRefresh>
        )}
      </div>
    </div>
  )
}
