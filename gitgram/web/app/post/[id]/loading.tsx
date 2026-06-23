export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Post card skeleton */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Post header */}
        <div className="flex items-center gap-3 p-4">
          <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-28 bg-muted rounded animate-pulse" />
            <div className="h-3 w-20 bg-muted rounded animate-pulse" />
          </div>
        </div>

        {/* Post image area */}
        <div className="w-full aspect-square bg-muted animate-pulse" />

        {/* Post actions */}
        <div className="p-4 space-y-3">
          <div className="flex gap-4">
            <div className="h-6 w-6 bg-muted rounded animate-pulse" />
            <div className="h-6 w-6 bg-muted rounded animate-pulse" />
            <div className="h-6 w-6 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-muted rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
          </div>
        </div>

        {/* Comments skeleton */}
        <div className="border-t border-border p-4 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                <div className="h-3 w-full bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
