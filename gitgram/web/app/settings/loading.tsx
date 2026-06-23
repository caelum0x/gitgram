export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="h-9 w-40 bg-muted rounded animate-pulse mb-8" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-4 bg-card border border-border rounded-lg"
          >
            <div className="w-8 h-8 bg-muted rounded animate-pulse" />
            <div className="h-5 w-32 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="mt-8 pt-8 border-t border-border">
        <div className="h-12 w-full bg-muted rounded-lg animate-pulse" />
      </div>
    </div>
  )
}
