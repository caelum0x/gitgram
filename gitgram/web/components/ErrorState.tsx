interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-12 text-center"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--background)] ring-1 ring-[var(--border)]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7"
          aria-hidden="true"
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

      <h3 className="mb-1.5 text-lg font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-[var(--foreground-secondary)]">{message}</p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-5 py-2 font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-secondary)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Try again
        </button>
      )}
    </div>
  )
}

export default ErrorState
