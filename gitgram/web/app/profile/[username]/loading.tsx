export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Profile header */}
        <div className="flex items-start gap-8 mb-8">
          <div className="w-32 h-32 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-7 w-36 bg-muted rounded animate-pulse" />
              <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
            </div>
            <div className="flex gap-8">
              <div className="h-5 w-16 bg-muted rounded animate-pulse" />
              <div className="h-5 w-20 bg-muted rounded animate-pulse" />
              <div className="h-5 w-20 bg-muted rounded animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </div>

        {/* Posts grid */}
        <div className="border-t border-border pt-8">
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-muted animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
