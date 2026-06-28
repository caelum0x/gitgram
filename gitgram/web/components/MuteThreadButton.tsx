'use client'

import { useCallback } from 'react'
import { useModeration } from '@/hooks/useModeration'
import { muteThread, unmuteThread } from '@/utils/moderation'

interface MuteThreadButtonProps {
  postId: string
  className?: string
}

/**
 * Toggles a thread mute for a post. Muted threads are hidden from the feed by
 * Feed.tsx (via utils/moderation). State is shared through useModeration so the
 * label stays in sync everywhere.
 */
export default function MuteThreadButton({ postId, className = '' }: MuteThreadButtonProps) {
  const moderation = useModeration()
  const isMuted = moderation.mutedThreads.includes(postId)

  const handleToggle = useCallback(() => {
    if (isMuted) {
      unmuteThread(postId)
    } else {
      muteThread(postId)
    }
  }, [isMuted, postId])

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={isMuted}
      className={`inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)] ${className}`}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        {isMuted ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.536 8.464a5 5 0 010 7.072M12 6.5L7 10H4a1 1 0 00-1 1v2a1 1 0 001 1h3l5 3.5v-11z"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
          />
        )}
      </svg>
      {isMuted ? 'Unmute thread' : 'Mute thread'}
    </button>
  )
}
