'use client'

import Link from 'next/link'
import { useEffect } from 'react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  const isDev = process.env.NODE_ENV === 'development'

  useEffect(() => {
    // Surface the error for local debugging and any attached error tracker.
    if (isDev) {
      // eslint-disable-next-line no-console
      console.error(error)
    }
  }, [error, isDev])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4 py-16">
      <div className="w-full max-w-lg text-center">
        {/* Illustration */}
        <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full bg-[var(--surface)] ring-1 ring-[var(--border)]">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-14 w-14"
            role="img"
            aria-label="Warning"
          >
            <path
              d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              stroke="var(--error)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M12 9v4" stroke="var(--error)" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1" fill="var(--error)" />
          </svg>
        </div>

        <p className="mb-2 font-mono text-sm tracking-widest text-[var(--error)]">RUNTIME ERROR</p>
        <h1 className="mb-3 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
          Something broke
        </h1>
        <p className="mx-auto mb-8 max-w-md text-[var(--foreground-secondary)]">
          We hit an unexpected error while rendering this page. You can retry, and if it keeps
          happening, head back home.
        </p>

        {/* Actions */}
        <div className="mb-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-lg bg-[var(--primary)] px-6 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
          >
            Try again
          </button>
          <Link
            href="/"
            className="w-full rounded-lg border border-[var(--border)] px-6 py-2.5 font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-secondary)] sm:w-auto"
          >
            Go Home
          </Link>
        </div>

        {/* Error digest — development only */}
        {isDev && (
          <details className="mx-auto max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] text-left">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--foreground-secondary)]">
              Error details
            </summary>
            <div className="border-t border-[var(--border)] px-4 py-3">
              {error.digest && (
                <p className="mb-2 font-mono text-xs text-[var(--foreground-secondary)]">
                  digest: <span className="text-[var(--foreground)]">{error.digest}</span>
                </p>
              )}
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-[var(--error)]">
                {error.message}
              </pre>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
