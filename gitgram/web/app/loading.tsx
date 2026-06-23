function FeedItemSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      {/* Author row */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-[var(--surface-secondary)]" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-32 rounded bg-[var(--surface-secondary)]" />
          <div className="h-3 w-20 rounded bg-[var(--surface-secondary)]" />
        </div>
      </div>

      {/* Body text */}
      <div className="mb-4 space-y-2">
        <div className="h-3.5 w-full rounded bg-[var(--surface-secondary)]" />
        <div className="h-3.5 w-11/12 rounded bg-[var(--surface-secondary)]" />
        <div className="h-3.5 w-3/4 rounded bg-[var(--surface-secondary)]" />
      </div>

      {/* Media block */}
      <div className="mb-4 aspect-video w-full rounded-lg bg-[var(--surface-secondary)]" />

      {/* Action row */}
      <div className="flex items-center gap-6">
        <div className="h-5 w-12 rounded bg-[var(--surface-secondary)]" />
        <div className="h-5 w-12 rounded bg-[var(--surface-secondary)]" />
        <div className="h-5 w-12 rounded bg-[var(--surface-secondary)]" />
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-6">
      <div
        className="mx-auto w-full max-w-2xl animate-pulse space-y-4"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">Loading content</span>
        {Array.from({ length: 4 }).map((_, index) => (
          <FeedItemSkeleton key={index} />
        ))}
      </div>
    </div>
  )
}
