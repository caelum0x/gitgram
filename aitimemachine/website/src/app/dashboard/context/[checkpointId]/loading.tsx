import { Skeleton } from '@/components/ui/skeleton';

export default function ContextLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="mb-2 h-9 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-48" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    </div>
  );
}
