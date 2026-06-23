import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function TimelineLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {/* Date Group */}
        {[...Array(3)].map((_, groupIndex) => (
          <div key={groupIndex}>
            <Skeleton className="h-4 w-32 mb-4" />
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                        <Skeleton className="h-4 w-full max-w-md" />
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-24 rounded-full" />
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Load More */}
      <div className="flex justify-center">
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}
