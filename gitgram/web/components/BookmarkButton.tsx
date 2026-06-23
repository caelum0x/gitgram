'use client'

import { useState } from 'react'
import api from '@/services/api'

interface BookmarkButtonProps {
  postId?: string
  snippetId?: string
  initialSaved: boolean
  onToggle?: (isSaved: boolean) => void
  className?: string
}

export default function BookmarkButton({
  postId,
  snippetId,
  initialSaved,
  onToggle,
  className = '',
}: BookmarkButtonProps) {
  const [isSaved, setIsSaved] = useState(initialSaved)
  const [isPending, setIsPending] = useState(false)

  const itemId = postId ?? snippetId
  const itemType = postId ? 'post' : 'snippet'

  const handleToggle = async () => {
    if (!itemId || isPending) return

    // Optimistic update
    const nextSaved = !isSaved
    setIsSaved(nextSaved)
    onToggle?.(nextSaved)
    setIsPending(true)

    try {
      if (nextSaved) {
        await api.post('/users/saved', { itemId, type: itemType })
      } else {
        await api.delete(`/users/saved/${itemId}`)
      }
    } catch (err) {
      // Rollback on failure
      setIsSaved(!nextSaved)
      onToggle?.(!nextSaved)
      console.error('Bookmark toggle failed:', err)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      aria-label={isSaved ? 'Remove bookmark' : 'Bookmark'}
      aria-pressed={isSaved}
      className={`inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] rounded disabled:opacity-50 ${className}`}
      style={{ color: isSaved ? '#7C3AED' : 'var(--foreground-secondary, #8b949e)' }}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5"
        fill={isSaved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    </button>
  )
}
