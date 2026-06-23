'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000/api'

const COLORS = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  primary: '#7C3AED',
  primaryHover: '#6D28D9',
  border: '#2D2D4E',
  textPrimary: '#F1F0FF',
  textSecondary: '#9994C4',
  muted: '#252540',
  error: '#F87171',
} as const

const PAGE_LIMIT = 20

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FollowingUser {
  id: string
  username: string
  displayName?: string
  avatar?: string
  bio?: string
  isFollowing: boolean
}

interface FollowingResponse {
  following: FollowingUser[]
  total: number
  page: number
  limit: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchFollowing(
  username: string,
  page: number
): Promise<FollowingResponse> {
  const res = await fetch(
    `${API_URL}/v1/users/${username}/following?page=${page}&limit=${PAGE_LIMIT}`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error('Failed to fetch following')
  const data = await res.json()
  return {
    following: data.following ?? data ?? [],
    total: data.total ?? 0,
    page: data.page ?? page,
    limit: data.limit ?? PAGE_LIMIT,
  }
}

async function followUser(targetUsername: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/users/${targetUsername}/follow`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to follow user')
}

async function unfollowUser(targetUsername: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/users/${targetUsername}/follow`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to unfollow user')
}

// ---------------------------------------------------------------------------
// UserCard component
// ---------------------------------------------------------------------------

interface UserCardProps {
  user: FollowingUser
  onFollowToggle: (userId: string, newState: boolean) => void
}

function UserCard({ user, onFollowToggle }: UserCardProps) {
  const [isFollowing, setIsFollowing] = useState(user.isFollowing)
  const [loading, setLoading] = useState(false)

  const handleFollowClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    const prev = isFollowing
    setIsFollowing(!prev)
    try {
      if (prev) {
        await unfollowUser(user.username)
      } else {
        await followUser(user.username)
      }
      onFollowToggle(user.id, !prev)
    } catch {
      setIsFollowing(prev)
    } finally {
      setLoading(false)
    }
  }

  const buttonStyle: React.CSSProperties = isFollowing
    ? {
        padding: '6px 16px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        background: COLORS.muted,
        color: COLORS.textPrimary,
        border: `1px solid ${COLORS.border}`,
        transition: 'background 0.15s',
        flexShrink: 0,
      }
    : {
        padding: '6px 16px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        background: COLORS.primary,
        color: '#fff',
        border: 'none',
        transition: 'background 0.15s',
        flexShrink: 0,
      }

  return (
    <Link
      href={`/${user.username}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Avatar */}
      {user.avatar ? (
        <img
          src={user.avatar}
          alt={user.username}
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: `${COLORS.primary}33`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: COLORS.primary,
            }}
          >
            {user.username[0]?.toUpperCase() ?? '?'}
          </span>
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 15,
            color: COLORS.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {user.displayName ?? user.username}
        </div>
        <div
          style={{
            fontSize: 13,
            color: COLORS.textSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          @{user.username}
        </div>
        {user.bio && (
          <div
            style={{
              fontSize: 12,
              color: COLORS.textSecondary,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {user.bio}
          </div>
        )}
      </div>

      {/* Follow / Unfollow */}
      <button
        onClick={handleFollowClick}
        disabled={loading}
        style={buttonStyle}
      >
        {loading ? '…' : isFollowing ? 'Following' : 'Follow'}
      </button>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FollowingPage() {
  const params = useParams()
  const username = typeof params.username === 'string' ? params.username : ''

  const [following, setFollowing] = useState<FollowingUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFollowing = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      try {
        const data = await fetchFollowing(username, pageNum)
        setFollowing(prev => (append ? [...prev, ...data.following] : data.following))
        setTotal(data.total)
        setPage(pageNum)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [username]
  )

  useEffect(() => {
    if (username) {
      loadFollowing(1, false)
    }
  }, [username, loadFollowing])

  const handleFollowToggle = useCallback((userId: string, newState: boolean) => {
    setFollowing(prev =>
      prev.map(u => (u.id === userId ? { ...u, isFollowing: newState } : u))
    )
  }, [])

  const hasMore = following.length < total

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: COLORS.bg,
    color: COLORS.textPrimary,
  }

  const innerStyle: React.CSSProperties = {
    maxWidth: 600,
    margin: '0 auto',
    padding: '32px 16px',
  }

  if (loading) {
    return (
      <div
        style={{
          ...containerStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: `3px solid ${COLORS.primary}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={innerStyle}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <Link
            href={`/${username}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: COLORS.textSecondary,
              textDecoration: 'none',
              fontSize: 14,
              marginBottom: 12,
            }}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            @{username}
          </Link>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: COLORS.textPrimary,
              margin: 0,
            }}
          >
            Following by @{username}
          </h1>
          {total > 0 && (
            <p style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 4 }}>
              {total.toLocaleString()} {total === 1 ? 'account' : 'accounts'} followed
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: '12px 16px',
              background: `${COLORS.error}22`,
              border: `1px solid ${COLORS.error}`,
              borderRadius: 8,
              color: COLORS.error,
              fontSize: 14,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Empty state */}
        {!error && following.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '64px 0',
              color: COLORS.textSecondary,
            }}
          >
            <svg
              width="56"
              height="56"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ margin: '0 auto 16px', opacity: 0.4 }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            <p style={{ fontSize: 16, fontWeight: 600, color: COLORS.textPrimary }}>
              Not following anyone yet
            </p>
            <p style={{ fontSize: 14, marginTop: 4 }}>
              When @{username} follows someone, they will appear here.
            </p>
          </div>
        )}

        {/* Following list */}
        {following.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {following.map(user => (
              <UserCard
                key={user.id}
                user={user}
                onFollowToggle={handleFollowToggle}
              />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={() => loadFollowing(page + 1, true)}
              disabled={loadingMore}
              style={{
                padding: '10px 32px',
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                color: COLORS.textPrimary,
                fontSize: 14,
                fontWeight: 600,
                cursor: loadingMore ? 'not-allowed' : 'pointer',
                opacity: loadingMore ? 0.6 : 1,
                transition: 'background 0.15s',
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
