'use client'

import { useEffect, useRef, useState } from 'react'

interface PostFeedbackMenuProps {
  /** "Not interested" — hide and send a negative ranking signal. */
  onNotInterested: () => void
  /** "Show more like this" — positive ranking signal. */
  onShowMore: () => void
  className?: string
}

/**
 * Per-post overflow ("...") menu exposing negative/positive feed-feedback
 * actions ("Not interested" / "Show more like this"). Adapted from Bluesky's
 * requestLess/requestMore affordance into a self-contained dropdown matching
 * this product's ShareMenu pattern (outside-click + Escape to close).
 */
export function PostFeedbackMenu({
  onNotInterested,
  onShowMore,
  className = '',
}: PostFeedbackMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  const handleSelect = (action: () => void) => {
    setIsOpen(false)
    action()
  }

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        aria-label="Post options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Feed feedback"
          className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
        >
          <button
            role="menuitem"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleSelect(onNotInterested)
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M5.6 5.6l12.8 12.8" />
            </svg>
            Not interested
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleSelect(onShowMore)
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
            </svg>
            Show more like this
          </button>
        </div>
      )}
    </div>
  )
}

export default PostFeedbackMenu
