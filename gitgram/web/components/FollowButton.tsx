'use client'

import { useState, useCallback } from 'react'
import { userService } from '@/services/userService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FollowButtonProps {
  userId: string
  username: string
  initialFollowing: boolean
  onFollowChange?: (isFollowing: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FollowButton({
  userId,
  username,
  initialFollowing,
  onFollowChange,
}: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialFollowing)
  const [isLoading, setIsLoading] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = useCallback(async () => {
    if (isLoading) return
    setError(null)

    // Optimistic update
    const nextFollowing = !isFollowing
    setIsFollowing(nextFollowing)
    setIsLoading(true)

    try {
      if (nextFollowing) {
        await userService.follow(userId)
      } else {
        await userService.unfollow(userId)
      }
      onFollowChange?.(nextFollowing)
    } catch (err: unknown) {
      // Revert on failure
      setIsFollowing(isFollowing)
      const msg = err instanceof Error ? err.message : 'Action failed. Please try again.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, isFollowing, userId, onFollowChange])

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function getLabel(): string {
    if (isLoading) return isFollowing ? 'Following…' : 'Following…'
    if (isFollowing && isHovering) return 'Unfollow'
    if (isFollowing) return 'Following'
    return 'Follow'
  }

  function getClasses(): string {
    const base =
      'inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60 min-w-[90px]'

    if (isFollowing) {
      return `${base} border border-[var(--border)] text-[var(--foreground)] ${
        isHovering
          ? 'bg-[var(--error)]/10 border-[var(--error)]/40 text-[var(--error)]'
          : 'bg-[var(--surface-secondary)] hover:bg-[var(--surface-secondary)]'
      }`
    }

    return `${base} bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--background)] border border-transparent`
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        aria-label={isFollowing ? `Unfollow ${username}` : `Follow ${username}`}
        aria-pressed={isFollowing}
        className={getClasses()}
      >
        {isLoading ? (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        ) : null}
        {getLabel()}
      </button>

      {error && (
        <p role="alert" className="text-xs text-[var(--error)]">
          {error}
        </p>
      )}
    </div>
  )
}

export default FollowButton
