export default function Loading() {
  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Conversations sidebar */}
      <div className="w-80 border-r border-border overflow-y-auto">
        <div className="p-4 border-b border-border">
          <div className="h-7 w-28 bg-muted rounded animate-pulse" />
        </div>
        <div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-3 w-40 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Empty chat area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="h-5 w-64 bg-muted rounded animate-pulse" />
      </div>
    </div>
  )
}
