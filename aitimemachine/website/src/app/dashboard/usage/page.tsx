'use client';

import { useState } from 'react';
import {
  Activity,
  Database,
  ArrowUpRight,
  TrendingUp,
  Calendar,
  Clock,
  Zap,
  Server,
  FileText,
  Download,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatBytes } from '@/lib/utils';
import { downloadCSV, generateCSVFilename, type ExportType } from '@/lib/csvExport';
import { useUsage } from '@/hooks/useDashboard';

function UsageSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-5 w-72" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="space-y-6">
        <Skeleton className="h-10 w-80" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-semibold text-white mb-2">Failed to load usage data</h2>
      <p className="text-gray-400 mb-4">There was an error loading your usage statistics.</p>
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="w-4 h-4 mr-2" />
        Try Again
      </Button>
    </div>
  );
}

export default function UsagePage() {
  const { usage, isLoading, isError, mutate } = useUsage();
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d');
  const [exportingType, setExportingType] = useState<ExportType | null>(null);

  const handleExport = async (type: ExportType) => {
    setExportingType(type);
    try {
      const response = await fetch(`/api/usage/export?type=${type}`);
      if (!response.ok) {
        throw new Error('Export failed');
      }
      const csvContent = await response.text();

      // Generate appropriate filename based on type
      let prefix: string;
      switch (type) {
        case 'api_usage':
          prefix = 'api-usage';
          break;
        case 'storage':
          prefix = 'storage-breakdown';
          break;
        case 'endpoints':
          prefix = 'endpoint-stats';
          break;
        default:
          prefix = 'usage-export';
      }

      const filename = generateCSVFilename(prefix);
      downloadCSV(csvContent, filename);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExportingType(null);
    }
  };

  if (isLoading) {
    return <UsageSkeleton />;
  }

  if (isError) {
    return <ErrorState onRetry={() => mutate()} />;
  }

  const apiPercentage = usage?.apiRequests.percentage || 0;
  const storagePercentage = usage?.storage.percentage || 0;

  // Get max value for chart scaling
  const chartData = usage?.chartData || [];
  const maxDailyRequests = chartData.length > 0
    ? Math.max(...chartData.map(d => d.requests), 1)
    : 1;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Usage Analytics</h1>
          <p className="text-gray-400 mt-1">
            Monitor your API usage, storage, and resource consumption
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm">
            <Calendar className="w-3 h-3 mr-1" />
            {usage?.plan || 'Free'} Plan
          </Badge>
          <Button variant="outline" asChild>
            <a href="/dashboard/billing">
              Upgrade Plan
              <ArrowUpRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              API Requests
            </CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(usage?.apiRequests.used || 0)}
            </div>
            <div className="flex items-center text-xs text-gray-500 mt-1">
              <span>of {formatNumber(usage?.apiRequests.limit || 0)} limit</span>
              <Badge
                variant={apiPercentage > 80 ? 'warning' : 'secondary'}
                className="ml-2 text-xs"
              >
                {apiPercentage}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Storage Used
            </CardTitle>
            <Database className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage?.storage.used || 0} {usage?.storage.unit || 'GB'}
            </div>
            <div className="flex items-center text-xs text-gray-500 mt-1">
              <span>of {usage?.storage.limit || 0} {usage?.storage.unit || 'GB'} limit</span>
              <Badge
                variant={storagePercentage > 80 ? 'warning' : 'secondary'}
                className="ml-2 text-xs"
              >
                {storagePercentage}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Total Checkpoints
            </CardTitle>
            <FileText className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(usage?.checkpoints.used || 0)}
            </div>
            <div className="flex items-center text-xs text-green-500 mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              {usage?.checkpoints.limit ? `of ${usage.checkpoints.limit} limit` : 'Unlimited'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Projects
            </CardTitle>
            <Zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage?.projects.used || 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {usage?.projects.limit ? `of ${usage.projects.limit} limit` : 'Unlimited projects'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Details */}
      <Tabs defaultValue="api" className="space-y-6">
        <TabsList>
          <TabsTrigger value="api">API Requests</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* API Requests Tab */}
        <TabsContent value="api" className="space-y-6">
          {/* Request Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>API Request Volume</CardTitle>
                  <CardDescription>Daily request count over time</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {(['7d', '30d', '90d'] as const).map((tf) => (
                      <Button
                        key={tf}
                        variant={timeframe === tf ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setTimeframe(tf)}
                      >
                        {tf}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport('api_usage')}
                    disabled={exportingType === 'api_usage'}
                  >
                    {exportingType === 'api_usage' ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <>
                  <div className="h-48 flex items-end gap-1">
                    {chartData.slice(-30).map((day, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-blue-600 rounded-t hover:bg-blue-500 transition-colors"
                        style={{ height: `${(day.requests / maxDailyRequests) * 100}%` }}
                        title={`${day.date}: ${formatNumber(day.requests)} requests`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>{chartData.length > 0 ? chartData[0].date : '30 days ago'}</span>
                    <span>{chartData.length > 0 ? chartData[chartData.length - 1].date : 'Today'}</span>
                  </div>
                </>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-500">
                  No request data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Endpoint Breakdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Requests by Endpoint</CardTitle>
                  <CardDescription>Breakdown of API usage by endpoint</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('endpoints')}
                  disabled={exportingType === 'endpoints'}
                >
                  {exportingType === 'endpoints' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {usage?.endpointBreakdown && usage.endpointBreakdown.length > 0 ? (
                usage.endpointBreakdown.map((endpoint) => (
                  <div key={endpoint.endpoint} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-gray-400" />
                        <code className="font-mono text-gray-300">{endpoint.endpoint}</code>
                      </div>
                      <span className="text-gray-400">
                        {formatNumber(endpoint.count)} ({endpoint.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={endpoint.percentage} />
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-gray-500">
                  No endpoint data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storage Tab */}
        <TabsContent value="storage" className="space-y-6">
          {/* Storage Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Storage Usage</CardTitle>
              <CardDescription>
                {usage?.storage.used || 0} {usage?.storage.unit || 'GB'} of {usage?.storage.limit || 0} {usage?.storage.unit || 'GB'} used
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress
                value={storagePercentage}
                indicatorClassName={storagePercentage > 80 ? 'bg-yellow-500' : ''}
              />
              <div className="flex justify-between text-sm text-gray-400">
                <span>{usage?.storage.used || 0} {usage?.storage.unit || 'GB'} used</span>
                <span>{(usage?.storage.limit || 0) - (usage?.storage.used || 0)} {usage?.storage.unit || 'GB'} available</span>
              </div>
            </CardContent>
          </Card>

          {/* Storage by Project */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Storage by Project</CardTitle>
                  <CardDescription>How your storage is distributed across projects</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('storage')}
                  disabled={exportingType === 'storage'}
                >
                  {exportingType === 'storage' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {usage?.storageByProject && usage.storageByProject.length > 0 ? (
                usage.storageByProject.map((project) => (
                  <div key={project.project} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-white">{project.project}</span>
                      </div>
                      <span className="text-gray-400">
                        {formatBytes(project.size)} ({project.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={project.percentage} />
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-gray-500">
                  No project storage data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Checkpoint Activity</CardTitle>
              <CardDescription>Overview of your checkpoint creation activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                  <div className="text-3xl font-bold text-white">
                    {usage?.checkpoints.used || 0}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">Total</div>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                  <div className="text-3xl font-bold text-white">
                    {usage?.projects.used || 0}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">Projects</div>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                  <div className="text-3xl font-bold text-white">
                    {formatNumber(usage?.apiRequests.used || 0)}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">API Calls</div>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                  <div className="text-3xl font-bold text-white">
                    {usage?.storage.used || 0} {usage?.storage.unit || 'GB'}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">Storage</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Usage Tips */}
          <Card className="border-blue-800 bg-blue-950/20">
            <CardHeader>
              <CardTitle>Usage Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-3 h-3 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-white">Optimize your checkpoint frequency</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Create checkpoints at meaningful milestones instead of every save to reduce storage usage.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                  <Database className="w-3 h-3 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-white">Clean up old checkpoints</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Archive or delete checkpoints from completed projects to free up storage space.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-3 h-3 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-white">Monitor your API usage</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Keep track of your API request count to avoid hitting limits during peak development.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
