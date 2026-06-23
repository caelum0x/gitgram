import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function DeliveriesLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Deliveries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Deliveries</CardTitle>
          <CardDescription>Loading delivery history...</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Table Header Skeleton */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2 mb-2 border-b border-gray-800">
            <div className="col-span-1">
              <Skeleton className="h-4 w-4" />
            </div>
            <div className="col-span-3">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="col-span-2">
              <Skeleton className="h-4 w-14" />
            </div>
            <div className="col-span-2">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="col-span-2">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="col-span-2">
              <Skeleton className="h-4 w-20" />
            </div>
          </div>

          {/* Table Rows Skeleton */}
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-12 gap-4 px-4 py-3 rounded-lg border border-gray-800"
              >
                <div className="col-span-1 flex items-center">
                  <Skeleton className="h-4 w-4" />
                </div>
                <div className="col-span-3 flex items-center">
                  <Skeleton className="h-5 w-32" />
                </div>
                <div className="col-span-2 flex items-center">
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <div className="col-span-2 flex items-center">
                  <Skeleton className="h-5 w-10" />
                </div>
                <div className="col-span-2 flex items-center">
                  <Skeleton className="h-5 w-14" />
                </div>
                <div className="col-span-2 flex items-center">
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="w-6 h-6 rounded flex-shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-4 w-full max-w-md" />
                <Skeleton className="h-4 w-3/4 mt-1" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
