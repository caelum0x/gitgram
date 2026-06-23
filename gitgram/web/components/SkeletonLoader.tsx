export function PostSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-full" />
        <div className="flex-1">
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-24 mb-2" />
          <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-16" />
        </div>
      </div>
      <div className="aspect-square bg-gray-300 dark:bg-gray-700 rounded mb-4" />
      <div className="space-y-2">
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-full" />
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4" />
      </div>
    </div>
  );
}

export function UserSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 animate-pulse">
      <div className="w-12 h-12 bg-gray-300 dark:bg-gray-700 rounded-full" />
      <div className="flex-1">
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-32 mb-2" />
        <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-24" />
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-square bg-gray-300 dark:bg-gray-700 animate-pulse" />
      ))}
    </div>
  );
}
