'use client'

import { useState } from 'react'
import Link from 'next/link'
import { linkifyText } from '@/utils/linkify'

export interface Post {
  id: string
  content: string
  author: {
    username: string
    displayName: string
    avatarUrl?: string
  }
  likes: number
  comments: number
  reposts: number
  createdAt: string
  tags?: string[]
  repoOwner?: string
  repoName?: string
  isLiked?: boolean
}

export interface PostCardProps {
  post: Post
  onLike?: (id: string) => void
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return `${diffSec}s`
  if (diffMin < 60) return `${diffMin}m`
  if (diffHr < 24) return `${diffHr}h`
  if (diffDay < 7) return `${diffDay}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface ContentSegment {
  type: 'text' | 'code'
  value: string
  language?: string
}

function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  const fenceRegex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'code', language: match[1] || undefined, value: match[2] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) })
  }

  return segments
}

function RenderedContent({ content }: { content: string }) {
  const segments = parseContent(content)

  return (
    <div style={{ lineHeight: '1.6' }}>
      {segments.map((seg, i) => {
        if (seg.type === 'code') {
          return (
            <pre
              key={i}
              style={{
                background: '#0D0D1A',
                border: '1px solid #2D2D50',
                borderRadius: '6px',
                padding: '12px 14px',
                overflowX: 'auto',
                margin: '8px 0',
                fontSize: '13px',
                lineHeight: '1.5',
              }}
            >
              <code
                style={{
                  color: '#A78BFA',
                  fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                  whiteSpace: 'pre',
                }}
              >
                {seg.value.replace(/\n$/, '')}
              </code>
            </pre>
          )
        }
        return (
          <span key={i} style={{ color: '#E2E8F0', whiteSpace: 'pre-wrap' }}>
            {linkifyText(seg.value, { linkClassName: 'text-[#A78BFA] hover:underline' })}
          </span>
        )
      })}
    </div>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? '#EF4444' : 'none'}
      stroke={filled ? '#EF4444' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function CommentIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function RepostIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}

export default function PostCard({ post, onLike }: PostCardProps) {
  const [liked, setLiked] = useState(post.isLiked ?? false)
  const [likeCount, setLikeCount] = useState(post.likes)

  const handleLike = () => {
    const nextLiked = !liked
    setLiked(nextLiked)
    setLikeCount((prev) => (nextLiked ? prev + 1 : prev - 1))
    onLike?.(post.id)
  }

  const initials = post.author.displayName.trim().charAt(0).toUpperCase()

  return (
    <article
      style={{
        background: '#1A1A2E',
        border: '1px solid #2D2D50',
        borderRadius: '12px',
        padding: '16px',
        color: '#E2E8F0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
        {/* Avatar */}
        <Link href={`/${post.author.username}`} style={{ flexShrink: 0, textDecoration: 'none' }}>
          {post.author.avatarUrl ? (
            <img
              src={post.author.avatarUrl}
              alt={post.author.displayName}
              width={48}
              height={48}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid #2D2D50',
              }}
            />
          ) : (
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: '700',
                color: '#FFFFFF',
                flexShrink: 0,
                border: '2px solid #2D2D50',
              }}
            >
              {initials}
            </div>
          )}
        </Link>

        {/* Author info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <Link
              href={`/${post.author.username}`}
              style={{
                color: '#E2E8F0',
                fontWeight: '700',
                fontSize: '15px',
                textDecoration: 'none',
              }}
            >
              {post.author.displayName}
            </Link>
            <Link
              href={`/${post.author.username}`}
              style={{
                color: '#94A3B8',
                fontSize: '14px',
                textDecoration: 'none',
              }}
            >
              @{post.author.username}
            </Link>
            <span style={{ color: '#64748B', fontSize: '13px' }}>·</span>
            <span style={{ color: '#64748B', fontSize: '13px' }}>
              {formatRelativeTime(post.createdAt)}
            </span>
          </div>

          {/* Repo badge */}
          {post.repoOwner && post.repoName && (
            <Link
              href={`/${post.repoOwner}/${post.repoName}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '4px',
                background: 'rgba(124, 58, 237, 0.15)',
                border: '1px solid rgba(124, 58, 237, 0.4)',
                borderRadius: '20px',
                padding: '2px 10px',
                fontSize: '12px',
                color: '#A78BFA',
                fontWeight: '500',
                textDecoration: 'none',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              {post.repoOwner}/{post.repoName}
            </Link>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ marginBottom: '12px' }}>
        <RenderedContent content={post.content} />
      </div>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {post.tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: 'rgba(124, 58, 237, 0.1)',
                color: '#7C3AED',
                borderRadius: '20px',
                padding: '2px 10px',
                fontSize: '13px',
                fontWeight: '500',
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          paddingTop: '10px',
          borderTop: '1px solid #2D2D50',
        }}
      >
        {/* Like */}
        <button
          onClick={handleLike}
          aria-label={liked ? 'Unlike' : 'Like'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: liked ? '#EF4444' : '#94A3B8',
            fontSize: '14px',
            padding: '6px 10px',
            borderRadius: '8px',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
          }}
        >
          <HeartIcon filled={liked} />
          <span>{likeCount}</span>
        </button>

        {/* Comments */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#94A3B8',
            fontSize: '14px',
            padding: '6px 10px',
          }}
        >
          <CommentIcon />
          <span>{post.comments}</span>
        </div>

        {/* Reposts */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#94A3B8',
            fontSize: '14px',
            padding: '6px 10px',
          }}
        >
          <RepostIcon />
          <span>{post.reposts}</span>
        </div>

        {/* Share */}
        <button
          aria-label="Share"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#94A3B8',
            fontSize: '14px',
            padding: '6px 10px',
            borderRadius: '8px',
            marginLeft: 'auto',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement
            btn.style.background = 'rgba(124,58,237,0.1)'
            btn.style.color = '#7C3AED'
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement
            btn.style.background = 'none'
            btn.style.color = '#94A3B8'
          }}
        >
          <ShareIcon />
        </button>
      </div>
    </article>
  )
}
