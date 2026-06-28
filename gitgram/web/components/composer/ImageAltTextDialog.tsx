'use client'

import { useEffect, useState } from 'react'
import { MAX_ALT_TEXT_LENGTH, normalizeAltText } from '@/utils/altText'

interface ImageAltTextDialogProps {
  /** Preview source of the image being described. */
  src: string
  /** Current alt text for the image. */
  initialAlt: string
  /** Save the new (normalized) alt text. */
  onSave: (alt: string) => void
  /** Close without saving. */
  onClose: () => void
}

/**
 * Per-image alt-text editor, ported from Bluesky's ImageAltTextDialog to the
 * product's stack (modal + Tailwind/CSS-variables instead of the RN Dialog).
 * Lets screen-reader users get a real description of post media.
 */
export default function ImageAltTextDialog({
  src,
  initialAlt,
  onSave,
  onClose,
}: ImageAltTextDialogProps) {
  const [value, setValue] = useState(initialAlt)

  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const remaining = MAX_ALT_TEXT_LENGTH - value.length

  const handleSave = () => {
    onSave(normalizeAltText(value))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit image description"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--foreground)]">Image description</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-[var(--foreground-secondary)] transition-colors hover:text-[var(--foreground)]"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={value || 'Image being described'}
          className="max-h-64 w-full rounded-lg object-contain bg-black/20"
        />

        <div>
          <label htmlFor="alt-text-input" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            Describe this image for people who can&apos;t see it
          </label>
          <textarea
            id="alt-text-input"
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_ALT_TEXT_LENGTH))}
            placeholder="e.g. A terminal showing green passing test output"
            rows={4}
            autoFocus
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
          <div className="mt-1 flex justify-end">
            <span
              className={`text-xs tabular-nums ${
                remaining < 0 ? 'text-[var(--error)]' : 'text-[var(--foreground-secondary)]'
              }`}
            >
              {remaining} characters left
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--surface-secondary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
