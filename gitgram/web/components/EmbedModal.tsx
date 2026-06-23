'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type EmbedType = 'post' | 'snippet' | 'user' | 'repo'
type EmbedTheme = 'dark' | 'light'
type EmbedSize = 'normal' | 'compact'

interface EmbedModalProps {
  isOpen: boolean
  onClose: () => void
  /** id / username / owner+name depending on embedType */
  id: string
  /** Additional identifier — only used for repo embeds (the repo name) */
  name?: string
  /** Defaults to 'post' for backwards compatibility */
  embedType?: EmbedType
}

const EMBED_WIDTH = 560
const BASE_URL = 'https://gitgram.dev'

const EMBED_HEIGHT_MAP: Record<EmbedType, Record<EmbedSize, number>> = {
  post:    { normal: 300, compact: 220 },
  snippet: { normal: 380, compact: 260 },
  user:    { normal: 300, compact: 300 },
  repo:    { normal: 280, compact: 280 },
}

const TYPE_META: Record<EmbedType, { label: string; icon: React.ReactNode }> = {
  post: {
    label: 'Post',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  snippet: {
    label: 'Snippet',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  user: {
    label: 'Profile',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  repo: {
    label: 'Repository',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9 6 9-6" />
      </svg>
    ),
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEmbedSrc(type: EmbedType, id: string, name: string | undefined, theme: EmbedTheme, size: EmbedSize): string {
  const params = new URLSearchParams()
  if (theme !== 'dark') params.set('theme', theme)
  if (size !== 'normal') params.set('size', size)
  const qs = params.toString() ? `?${params.toString()}` : ''

  switch (type) {
    case 'post':    return `${BASE_URL}/embed/posts/${id}${qs}`
    case 'snippet': return `${BASE_URL}/embed/snippets/${id}${qs}`
    case 'user':    return `${BASE_URL}/embed/users/${id}${qs}`
    case 'repo':    return `${BASE_URL}/embed/repos/${id}/${name ?? ''}${qs}`
  }
}

function buildEmbedCode(src: string, width: number, height: number): string {
  return `<iframe\n  src="${src}"\n  width="${width}"\n  height="${height}"\n  frameborder="0"\n  scrolling="no"\n  allowtransparency="true"\n  style="border:none;border-radius:12px;overflow:hidden;"\n></iframe>`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmbedModal({ isOpen, onClose, id, name, embedType = 'post' }: EmbedModalProps) {
  const [theme, setTheme] = useState<EmbedTheme>('dark')
  const [size, setSize] = useState<EmbedSize>('normal')
  const [copied, setCopied] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)

  const height = EMBED_HEIGHT_MAP[embedType][size]
  const embedSrc = buildEmbedSrc(embedType, id, name, theme, size)
  const embedCode = buildEmbedCode(embedSrc, EMBED_WIDTH, height)

  // Reset options when modal reopens
  useEffect(() => {
    if (isOpen) {
      setTheme('dark')
      setSize('normal')
      setCopied(false)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = embedCode
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose()
  }

  if (!isOpen) return null

  const meta = TYPE_META[embedType]
  const showSizeOption = embedType === 'snippet'

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="embed-modal-title"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <span className="text-[var(--primary)]">{meta.icon}</span>
            <h2 id="embed-modal-title" className="text-sm font-semibold text-[var(--foreground)]">
              Embed this {meta.label.toLowerCase()}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close embed modal"
            className="p-1 rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Options row: theme + size */}
        <div className="flex items-center gap-4 px-5 pt-4 pb-1">
          {/* Theme toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--foreground-secondary)]">Theme</span>
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={[
                    'px-3 py-1 text-xs font-medium transition-colors',
                    theme === t
                      ? 'bg-[var(--primary)] text-white'
                      : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]',
                  ].join(' ')}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Size toggle — only for snippet */}
          {showSizeOption && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--foreground-secondary)]">Size</span>
              <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
                {(['normal', 'compact'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={[
                      'px-3 py-1 text-xs font-medium transition-colors',
                      size === s
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]',
                    ].join(' ')}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Embed code */}
        <div className="px-5 pt-3 pb-3">
          <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-2">
            Embed code
          </label>
          <div className="relative">
            <pre className="rounded-lg bg-[#0d1117] border border-[var(--border)] px-4 py-3 text-xs text-[#c9d1d9] font-mono overflow-x-auto whitespace-pre leading-relaxed">
              {embedCode}
            </pre>
            <button
              onClick={handleCopyEmbed}
              className={[
                'absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all',
                copied
                  ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30'
                  : 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] border border-[var(--border)]',
              ].join(' ')}
            >
              {copied ? (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="px-5 pb-4">
          <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-2">
            Preview
          </label>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--background)]">
            <iframe
              src={embedSrc}
              width="100%"
              height={height}
              style={{ border: 'none', display: 'block' }}
              title={`Embedded ${meta.label.toLowerCase()} preview`}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
          <p className="mt-2 text-xs text-[var(--foreground-secondary)]">
            Embed dimensions: {EMBED_WIDTH}&times;{height}px. The widget adapts to the container width.
          </p>
        </div>
      </div>
    </div>
  )
}
