import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function TeamSettingsLoading() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div>
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Basic information about your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 flex-1" />
            </div>
            <Skeleton className="h-3 w-80" />
          </div>
          <div className="flex items-center justify-end gap-4 pt-4">
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>

      {/* URL & Links */}
      <Card>
        <CardHeader>
          <CardTitle>Organization URL</CardTitle>
          <CardDescription>Your organization's unique URL and identifiers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-5 w-72" />
          </div>
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-gray-800">
        <CardHeader>
          <CardTitle className="text-gray-400">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions that affect your organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div>
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div>
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="h-9 w-20" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
