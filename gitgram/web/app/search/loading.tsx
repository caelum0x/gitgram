export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Search bar skeleton */}
      <div className="h-12 w-full bg-muted border border-border rounded-lg animate-pulse mb-6" />

      {/* Tab bar skeleton */}
      <div className="flex gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-muted rounded animate-pulse" />
        ))}
      </div>

      {/* Results grid skeleton */}
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-muted animate-pulse rounded"
          />
        ))}
      </div>
    </div>
  )
}
