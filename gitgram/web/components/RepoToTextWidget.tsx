'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import api from '@/services/api'

interface RepoToTextWidgetProps {
  repoFullName?: string
  compact?: boolean
}

interface ConvertResponse {
  success: boolean
  data?: {
    text: string
  }
  error?: string
}

function parseRepoFullName(input: string): string {
  const trimmed = input.trim()
  // Accept full GitHub URL: https://github.com/owner/repo
  const urlMatch = trimmed.match(/github\.com\/([^/]+\/[^/?\s]+)/)
  if (urlMatch) return urlMatch[1]
  // Accept owner/repo directly
  if (/^[^/]+\/[^/]+$/.test(trimmed)) return trimmed
  return trimmed
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}

// ---------------------------------------------------------------------------
// Core widget body — shared between full and modal modes
// ---------------------------------------------------------------------------

interface WidgetBodyProps {
  initialRepo: string
  onClose?: () => void
}

function WidgetBody({ initialRepo, onClose }: WidgetBodyProps) {
  const { showToast } = useToast()
  const [repoInput, setRepoInput] = useState(initialRepo)
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleConvert = useCallback(async () => {
    const repoFullName = parseRepoFullName(repoInput)
    if (!repoFullName) {
      setError('Enter a GitHub repo URL or owner/repo.')
      return
    }

    setLoading(true)
    setError('')
    setResult('')

    try {
      const response = await api.post<ConvertResponse>('/tools/repo-to-text', {
        repoFullName,
      })

      if (!response.data.success || !response.data.data?.text) {
        throw new Error(response.data.error ?? 'No text returned from server.')
      }

      setResult(response.data.data.text)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [repoInput])

  const handleCopy = useCallback(async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      showToast('Copied to clipboard', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Failed to copy', 'error')
    }
  }, [result, showToast])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleConvert()
    },
    [handleConvert],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Repo to Text</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-foreground-secondary transition hover:bg-surface hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* URL input + button */}
      <div className="flex gap-2">
        <input
          type="text"
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="github.com/owner/repo"
          aria-label="GitHub repository URL or owner/repo"
          className={cn(
            'min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground',
            'placeholder:text-foreground-secondary',
            'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
            'transition-all duration-200',
            error && !result && 'border-error focus:border-error focus:ring-error/20',
          )}
        />
        <button
          type="button"
          onClick={handleConvert}
          disabled={loading}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-hover',
            'px-5 py-2.5 text-sm font-semibold text-white shadow',
            'transition-all duration-200 hover:shadow-lg hover:shadow-accent/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus:outline-none focus:ring-2 focus:ring-primary/20',
          )}
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Converting…</span>
            </>
          ) : (
            'Convert'
          )}
        </button>
      </div>

      {/* Error state */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-1.5 text-xs text-error"
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Result area */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-secondary">
                {result.length.toLocaleString()} characters
              </span>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy to clipboard"
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20',
                  copied
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-border bg-surface text-foreground-secondary hover:border-primary/40 hover:text-foreground',
                )}
              >
                {copied ? (
                  <>
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <textarea
              ref={textareaRef}
              readOnly
              value={result}
              aria-label="Converted repository text"
              rows={12}
              className={cn(
                'w-full resize-y rounded-xl border border-border bg-background p-4 font-mono text-xs text-foreground',
                'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
                'transition-all duration-200',
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Full widget (compact=false, default)
// ---------------------------------------------------------------------------

function FullWidget({ repoFullName }: { repoFullName?: string }) {
  const initialRepo = repoFullName ? repoFullName : ''

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <WidgetBody initialRepo={initialRepo} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compact trigger + modal (compact=true)
// ---------------------------------------------------------------------------

function CompactWidget({ repoFullName }: { repoFullName?: string }) {
  const [open, setOpen] = useState(false)
  const initialRepo = repoFullName ? repoFullName : ''

  // Close modal on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
      {/* Compact trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Convert repository to text"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface',
          'px-3 py-1.5 text-xs font-semibold text-foreground-secondary',
          'transition-all duration-200 hover:border-primary/40 hover:text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary/20',
        )}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        Text
      </button>

      {/* Modal overlay */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            />

            {/* Modal panel */}
            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className={cn(
                'fixed inset-x-4 top-1/2 z-50 mx-auto -translate-y-1/2',
                'max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl',
              )}
              role="dialog"
              aria-modal="true"
              aria-label="Convert repository to text"
            >
              <WidgetBody initialRepo={initialRepo} onClose={() => setOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export default function RepoToTextWidget({ repoFullName, compact = false }: RepoToTextWidgetProps) {
  if (compact) {
    return <CompactWidget repoFullName={repoFullName} />
  }
  return <FullWidget repoFullName={repoFullName} />
}
