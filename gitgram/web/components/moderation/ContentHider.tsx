'use client'

import { useState, type ReactNode } from 'react'
import { SELF_LABEL_META, type SelfLabel } from '@/utils/moderation'

interface ContentHiderProps {
  /** The author-applied self-label, or null when the content is unrestricted. */
  label: SelfLabel | null
  children: ReactNode
}

/**
 * Soft content warning, ported from Bluesky's ContentHider to the product's
 * stack. When a post carries a self-label it is blurred behind a "Show anyway"
 * overlay instead of being hard-hidden, letting the viewer decide whether to
 * reveal it. Unlabelled content renders its children untouched.
 */
export default function ContentHider({ label, children }: ContentHiderProps) {
  const [revealed, setRevealed] = useState(false)

  if (!label) return <>{children}</>

  const meta = SELF_LABEL_META[label]

  if (revealed) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setRevealed(false)}
          className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-xs font-medium text-[var(--foreground-secondary)] transition-colors hover:text-[var(--foreground)]"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0L21 21" />
          </svg>
          Hide {meta.label.toLowerCase()}
        </button>
        {children}
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border)]">
      {/* Blurred preview of the underlying content. */}
      <div className="pointer-events-none select-none blur-xl saturate-50" aria-hidden="true">
        {children}
      </div>

      {/* Overlay prompt. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--background)]/80 p-4 text-center">
        <div className="flex items-center gap-2 text-[var(--foreground)]">
          <svg className="h-5 w-5 text-[var(--warning)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z" />
          </svg>
          <span className="text-sm font-semibold">{meta.label}</span>
        </div>
        <p className="max-w-xs text-xs text-[var(--foreground-secondary)]">{meta.description}</p>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="rounded-full bg-[var(--primary)] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
        >
          Show anyway
        </button>
      </div>
    </div>
  )
}
