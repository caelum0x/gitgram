'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Post Not Available
        </h2>
        <p className="text-muted mb-8 max-w-md mx-auto">
          We could not load this post. It may have been removed or you may not
          have permission to view it.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
