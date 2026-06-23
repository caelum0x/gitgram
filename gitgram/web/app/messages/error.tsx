'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center px-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Messages Unavailable
        </h2>
        <p className="text-muted mb-8 max-w-md mx-auto">
          We could not load your messages. Please try again.
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
