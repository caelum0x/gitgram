'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmbedUser {
  id: string
  username: string
  avatar?: string
  displayName?: string
}

interface EmbedPost {
  id: string
  content: string
  createdAt: string
  likesCount: number
  commentsCount?: number
  user?: EmbedUser
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user }: { user?: EmbedUser }) {
  const initial = user?.username?.[0]?.toUpperCase() ?? '?'
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        width={36}
        height={36}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmbedPostPage() {
  const params = useParams()
  const postId = params.id as string

  const [post, setPost] = useState<EmbedPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const fetchPost = async () => {
      try {
        const { data } = await api.get(`/posts/${postId}`)
        if (!cancelled) setPost(data?.data ?? data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPost()
    return () => { cancelled = true }
  }, [postId])

  const postUrl = `https://gitgram.dev/posts/${postId}`

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>
          <div style={{ ...styles.skeletonLine, width: '40%', marginBottom: 10 }} />
          <div style={{ ...styles.skeletonLine, width: '100%', marginBottom: 6 }} />
          <div style={{ ...styles.skeletonLine, width: '80%' }} />
        </div>
        <div style={styles.brandBar}>
          <BrandLogo />
        </div>
      </div>
    )
  }

  // ─── Error / not found ─────────────────────────────────────────────────────
  if (error || !post) {
    return (
      <div style={styles.shell}>
        <div style={{ ...styles.card, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <svg style={{ marginBottom: 8 }} width="24" height="24" fill="none" stroke="#475569" strokeWidth="1.5" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 8v4m0 4h.01" />
          </svg>
          <p style={{ color: '#64748B', fontSize: 13 }}>Post not found</p>
        </div>
        <div style={styles.brandBar}>
          <BrandLogo />
        </div>
      </div>
    )
  }

  // ─── Post card ─────────────────────────────────────────────────────────────
  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        {/* Author row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Avatar user={post.user} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {post.user?.displayName ?? post.user?.username ?? 'Unknown'}
            </div>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              @{post.user?.username ?? 'unknown'} &middot; {formatRelativeTime(post.createdAt)}
            </div>
          </div>
        </div>

        {/* Content */}
        <p style={{ fontSize: 14, color: '#CBD5E1', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
          {post.content}
        </p>

        {/* Likes row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748B', fontSize: 13 }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span>{post.likesCount}</span>
          </div>
          {post.commentsCount !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748B', fontSize: 13 }}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>{post.commentsCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Gitgram branding bar */}
      <div style={styles.brandBar}>
        <BrandLogo />
        <Link
          href={postUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: '#7C3AED', textDecoration: 'none', fontWeight: 500 }}
        >
          View on Gitgram
        </Link>
      </div>
    </div>
  )
}

// ─── Brand logo ───────────────────────────────────────────────────────────────

function BrandLogo() {
  return (
    <Link
      href="https://gitgram.dev"
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#7C3AED" />
        <path d="M7 17V9.5L12 7l5 2.5V17" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9.5 17v-4.5h5V17" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#A78BFA', letterSpacing: '-0.01em' }}>
        Gitgram
      </span>
    </Link>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    background: '#0F0F1A',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '18px 20px 14px',
    overflow: 'hidden',
  },
  brandBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderTop: '1px solid #1E1E38',
    background: '#0A0A14',
  },
  skeletonLine: {
    height: 12,
    background: '#1E1E38',
    borderRadius: 6,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
}
