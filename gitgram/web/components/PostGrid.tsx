'use client'

import { useEffect, useRef, useCallback } from 'react'

export interface GridPost {
  id: string
  content: string
  author: {
    username: string
    avatarUrl?: string
  }
  likes: number
  comments: number
  createdAt: string
  thumbnailUrl?: string
  /** Author-supplied alt text for the thumbnail (accessibility). */
  thumbnailAlt?: string
}

export interface PostGridProps {
  posts: GridPost[]
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
}

const CONTENT_PREVIEW_MAX = 80

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

function HeartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ width: 16, height: 16 }}
    >
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
    </svg>
  )
}

function CommentIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ width: 16, height: 16 }}
    >
      <path
        fillRule="evenodd"
        d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223 4.996 4.996 0 003-.621z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function SkeletonCell() {
  return (
    <div
      aria-hidden="true"
      style={{
        aspectRatio: '1 / 1',
        borderRadius: 8,
        background: '#1A1A2E',
        animation: 'postgrid-pulse 1.5s ease-in-out infinite',
      }}
    />
  )
}

function PostCell({ post }: { post: GridPost }) {
  const preview = truncate(post.content, CONTENT_PREVIEW_MAX)

  return (
    <article
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#1A1A2E',
        cursor: 'pointer',
      }}
    >
      {/* Background: thumbnail image or gradient fallback */}
      {post.thumbnailUrl ? (
        <img
          src={post.thumbnailUrl}
          alt={post.thumbnailAlt?.trim() || ''}
          aria-hidden={post.thumbnailAlt?.trim() ? undefined : 'true'}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
          }}
        />
      )}

      {/* Content preview bar (always visible at bottom) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '10px 12px',
          background:
            'linear-gradient(to top, rgba(15,15,26,0.85) 0%, transparent 60%)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.4,
            color: 'rgba(255,255,255,0.8)',
            wordBreak: 'break-word',
          }}
        >
          {preview}
        </p>
      </div>

      {/* Hover overlay with like/comment counts */}
      <div
        className="postgrid-hover-overlay"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          background: 'rgba(15,15,26,0.78)',
          opacity: 0,
          transition: 'opacity 0.2s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <HeartIcon />
            {post.likes.toLocaleString()}
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <CommentIcon />
            {post.comments.toLocaleString()}
          </span>
        </div>

        <span
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          @{post.author.username}
        </span>
      </div>
    </article>
  )
}

export default function PostGrid({
  posts,
  onLoadMore,
  hasMore,
  isLoading,
}: PostGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Stable ref so the IntersectionObserver callback never captures stale props
  const onLoadMoreRef = useRef(onLoadMore)
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  }, [onLoadMore])

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasMore && !isLoading) {
        onLoadMoreRef.current()
      }
    },
    [hasMore, isLoading],
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '120px',
      threshold: 0,
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [handleIntersect])

  return (
    <>
      <style>{`
        @keyframes postgrid-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .postgrid-cell:hover .postgrid-hover-overlay {
          opacity: 1 !important;
        }
        @media (max-width: 768px) {
          .postgrid-root {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 480px) {
          .postgrid-root {
            grid-template-columns: repeat(1, 1fr) !important;
          }
        }
      `}</style>

      <section
        aria-label="Posts grid"
        style={{
          background: '#0F0F1A',
          padding: '8px 0',
          minHeight: '100%',
        }}
      >
        <div
          className="postgrid-root"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 3,
          }}
        >
          {posts.map((post) => (
            <div key={post.id} className="postgrid-cell">
              <PostCell post={post} />
            </div>
          ))}

          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCell key={`skeleton-${i}`} />
            ))}
        </div>

        {/* Sentinel element watched by IntersectionObserver */}
        <div
          ref={sentinelRef}
          aria-hidden="true"
          style={{ height: 1, marginTop: 8 }}
        />

        {!hasMore && !isLoading && posts.length > 0 && (
          <p
            style={{
              textAlign: 'center',
              color: 'rgba(255,255,255,0.35)',
              fontSize: 13,
              padding: '24px 0 16px',
              margin: 0,
            }}
          >
            You&rsquo;ve reached the end
          </p>
        )}
      </section>
    </>
  )
}
