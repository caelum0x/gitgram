'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import api from '@/services/api'
import PostCard, { Post } from '@/components/PostCard'
import { getErrorMessage } from '@/utils/error'

type SortOption = 'trending' | 'latest' | 'top'

interface TagFeedResponse {
  posts: Post[]
  nextCursor: string | null
  total: number
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'trending', label: 'Trending' },
  { value: 'latest', label: 'Latest' },
  { value: 'top', label: 'Top' },
]

export default function HashtagPage() {
  const params = useParams()
  const tag =
    typeof params.tag === 'string'
      ? params.tag
      : Array.isArray(params.tag)
        ? params.tag[0]
        : ''

  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState<number | null>(null)
  const [sort, setSort] = useState<SortOption>('trending')
  const [following, setFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchPosts = useCallback(
    async (sortOption: SortOption, nextCursor?: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const queryParams: Record<string, string> = { tag, sort: sortOption }
      if (nextCursor) queryParams.cursor = nextCursor

      const { data } = await api.get<TagFeedResponse>('/posts', {
        params: queryParams,
        signal: controller.signal,
      })
      return data
    },
    [tag]
  )

  const loadInitial = useCallback(
    async (sortOption: SortOption) => {
      setLoading(true)
      setError(null)
      setPosts([])
      setCursor(null)
      setHasMore(true)
      try {
        const data = await fetchPosts(sortOption)
        setPosts(data.posts ?? [])
        setCursor(data.nextCursor ?? null)
        setHasMore(!!data.nextCursor)
        if (data.total != null) setTotal(data.total)
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [fetchPosts]
  )

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const data = await fetchPosts(sort, cursor)
      setPosts((prev) => [...prev, ...(data.posts ?? [])])
      setCursor(data.nextCursor ?? null)
      setHasMore(!!data.nextCursor)
      if (data.total != null) setTotal(data.total)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(getErrorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, hasMore, sort, fetchPosts])

  // Initial load and reload on sort or tag change
  useEffect(() => {
    if (!tag) return
    void loadInitial(sort)
  }, [tag, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          void loadMore()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loadMore])

  const handleSortChange = (newSort: SortOption) => {
    if (newSort === sort) return
    setSort(newSort)
  }

  const handleFollowTag = async () => {
    if (followLoading) return
    setFollowLoading(true)
    try {
      if (following) {
        await api.delete(`/tags/${tag}/follow`)
        setFollowing(false)
      } else {
        await api.post(`/tags/${tag}/follow`)
        setFollowing(true)
      }
    } catch {
      // toggle already guarded — leave state unchanged on error
    } finally {
      setFollowLoading(false)
    }
  }

  const formatCount = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0F0F1A',
        color: '#E2E8F0',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1A0A2E 0%, #0F0F1A 60%)',
          borderBottom: '1px solid #2D2D50',
          padding: '32px 16px 24px',
        }}
      >
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: '2.25rem',
                  fontWeight: 800,
                  color: '#E2E8F0',
                  margin: 0,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                }}
              >
                <span style={{ color: '#7C3AED' }}>#</span>
                {tag}
              </h1>
              {total != null && (
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '0.9rem',
                    color: '#94A3B8',
                  }}
                >
                  {formatCount(total)} {total === 1 ? 'post' : 'posts'}
                </p>
              )}
            </div>

            <button
              onClick={handleFollowTag}
              disabled={followLoading}
              style={{
                padding: '10px 24px',
                borderRadius: '9999px',
                border: following ? '2px solid #7C3AED' : 'none',
                background: following ? 'transparent' : '#7C3AED',
                color: following ? '#7C3AED' : '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: followLoading ? 'not-allowed' : 'pointer',
                opacity: followLoading ? 0.6 : 1,
                transition: 'all 0.15s ease',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {followLoading ? '...' : following ? 'Following' : 'Follow tag'}
            </button>
          </div>
        </div>
      </div>

      {/* Sort tabs */}
      <div
        style={{
          borderBottom: '1px solid #2D2D50',
          backgroundColor: '#0F0F1A',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: '680px',
            margin: '0 auto',
            display: 'flex',
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSortChange(option.value)}
              style={{
                padding: '14px 20px',
                background: 'none',
                border: 'none',
                borderBottom:
                  sort === option.value ? '2px solid #7C3AED' : '2px solid transparent',
                color: sort === option.value ? '#7C3AED' : '#94A3B8',
                fontWeight: sort === option.value ? 700 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                letterSpacing: '0.01em',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        {loading && (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <LoadingSpinner />
            <p style={{ color: '#94A3B8', marginTop: '12px', fontSize: '0.9rem' }}>
              Loading posts for #{tag}&hellip;
            </p>
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              margin: '24px 16px',
              padding: '16px',
              background: '#1A0A0A',
              border: '1px solid #4B1C1C',
              borderRadius: '12px',
              color: '#FC8181',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div
            style={{
              padding: '64px 16px',
              textAlign: 'center',
              color: '#64748B',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>
              <span style={{ color: '#7C3AED', opacity: 0.4 }}>#</span>
            </div>
            <p style={{ fontWeight: 600, fontSize: '1rem', color: '#94A3B8' }}>
              No posts yet for #{tag}
            </p>
            <p style={{ fontSize: '0.875rem', marginTop: '6px' }}>
              Be the first to post with this tag.
            </p>
          </div>
        )}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: '1px' }} />

        {loadingMore && (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <LoadingSpinner small />
          </div>
        )}

        {!hasMore && posts.length > 0 && (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: '#475569',
              fontSize: '0.85rem',
            }}
          >
            You&apos;ve reached the end of #{tag}
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingSpinner({ small = false }: { small?: boolean }) {
  const size = small ? 20 : 32
  const border = small ? 2 : 3
  return (
    <>
      <style>{`@keyframes gg-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          border: `${border}px solid #2D2D50`,
          borderTopColor: '#7C3AED',
          borderRadius: '50%',
          animation: 'gg-spin 0.7s linear infinite',
        }}
      />
    </>
  )
}
