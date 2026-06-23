'use client';

import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import {
  Activity,
  FolderGit2,
  Key,
  Database,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatBytes, formatRelativeTime } from '@/lib/utils';
import { useDashboardStats } from '@/hooks/useDashboard';

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-2 w-full" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-9 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-semibold text-white mb-2">Failed to load dashboard</h2>
      <p className="text-gray-400 mb-4">There was an error loading your dashboard data.</p>
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="w-4 h-4 mr-2" />
        Try Again
      </Button>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const { stats, isLoading, isError, mutate } = useDashboardStats();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError) {
    return <ErrorState onRetry={() => mutate()} />;
  }

  const storageValue = stats?.storage ? parseFloat(stats.storage) : 0;
  const storageLimit = 10; // 10 GB limit
  const storagePercentage = Math.round((storageValue / storageLimit) * 100);

  const apiRequestsThisMonth = stats?.apiCalls || 0;
  const apiRequestsLimit = 100000;
  const apiPercentage = Math.round((apiRequestsThisMonth / apiRequestsLimit) * 100);

  return (
    <div className="space-y-8">
      {/* Backend Offline Banner */}
      {stats && stats.backendConnected === false && (
        <div className="flex items-center gap-3 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
          <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-200">API server is unreachable</p>
            <p className="text-xs text-yellow-300/70 mt-0.5">
              Dashboard data may be incomplete. Check that the AITM API server is running.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()} className="text-yellow-200 border-yellow-800 hover:bg-yellow-900/40">
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
          </h1>
          <p className="text-gray-400 mt-1">
            Here's what's happening with your projects
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/docs">
              View Docs
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/keys">
              <Key className="w-4 h-4 mr-2" />
              Create API Key
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Total Checkpoints
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats?.checkpoints || 0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.checkpointsDelta !== undefined && stats.checkpointsDelta !== 0 && (
                <span className={stats.checkpointsDelta > 0 ? 'text-green-500' : 'text-red-500'}>
                  {stats.checkpointsDelta > 0 ? '+' : ''}{stats.checkpointsDelta} this week
                </span>
              )}
              {(!stats?.checkpointsDelta || stats.checkpointsDelta === 0) && 'Across all projects'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              Active Projects
            </CardTitle>
            <FolderGit2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.projects || 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.projectsDelta !== undefined && stats.projectsDelta !== 0 && (
                <span className={stats.projectsDelta > 0 ? 'text-green-500' : 'text-red-500'}>
                  {stats.projectsDelta > 0 ? '+' : ''}{stats.projectsDelta} this week
                </span>
              )}
              {(!stats?.projectsDelta || stats.projectsDelta === 0) && 'Projects being tracked'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">
              API Calls
            </CardTitle>
            <Activity className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats?.apiCalls || 0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.apiCallsDelta !== undefined && stats.apiCallsDelta !== 0 && (
                <span className={stats.apiCallsDelta > 0 ? 'text-green-500' : 'text-red-500'}>
                  {stats.apiCallsDelta > 0 ? '+' : ''}{stats.apiCallsDelta}% from last week
                </span>
              )}
              {(!stats?.apiCallsDelta || stats.apiCallsDelta === 0) && 'This month'}
            </p>
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
              {stats?.storage || '0 GB'}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.storageDelta !== undefined && stats.storageDelta !== 0 && (
                <span className={stats.storageDelta > 0 ? 'text-yellow-500' : 'text-green-500'}>
                  {stats.storageDelta > 0 ? '+' : ''}{stats.storageDelta}% from last week
                </span>
              )}
              {(!stats?.storageDelta || stats.storageDelta === 0) && `of ${storageLimit} GB`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Usage */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>API Usage</CardTitle>
              <Badge variant={apiPercentage > 80 ? 'warning' : 'secondary'}>
                {apiPercentage}%
              </Badge>
            </div>
            <CardDescription>
              Monthly API request usage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={apiPercentage} />
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">
                {formatNumber(apiRequestsThisMonth)} requests
              </span>
              <span className="text-gray-500">
                {formatNumber(apiRequestsLimit)} limit
              </span>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/usage">
                View Details
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Storage Usage */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Storage</CardTitle>
              <Badge variant={storagePercentage > 80 ? 'warning' : 'secondary'}>
                {storagePercentage}%
              </Badge>
            </div>
            <CardDescription>
              Cloud storage utilization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress
              value={storagePercentage}
              indicatorClassName={storagePercentage > 80 ? 'bg-yellow-500' : ''}
            />
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">
                {stats?.storage || '0 GB'} used
              </span>
              <span className="text-gray-500">
                {storageLimit} GB total
              </span>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/billing">
                Upgrade Storage
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks and shortcuts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="ghost" className="w-full justify-start" asChild>
              <Link href="/dashboard/keys">
                <Key className="w-4 h-4 mr-3" />
                Create API Key
              </Link>
            </Button>
            <Button variant="ghost" className="w-full justify-start" asChild>
              <Link href="/dashboard/webhooks">
                <Activity className="w-4 h-4 mr-3" />
                Configure Webhooks
              </Link>
            </Button>
            <Button variant="ghost" className="w-full justify-start" asChild>
              <Link href="/dashboard/timeline">
                <Clock className="w-4 h-4 mr-3" />
                View Timeline
              </Link>
            </Button>
            <Button variant="ghost" className="w-full justify-start" asChild>
              <Link href="/docs">
                <ArrowUpRight className="w-4 h-4 mr-3" />
                API Documentation
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Latest checkpoints and syncs
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/timeline">View All</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="space-y-4">
                {stats.recentActivity.slice(0, 5).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                        {activity.type === 'checkpoint' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : activity.type === 'sync' ? (
                          <Activity className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-yellow-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {activity.description || activity.type}
                        </p>
                        <p className="text-xs text-gray-500">
                          {activity.project}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(activity.time)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
                <p className="text-sm mt-1">
                  Start by creating a checkpoint in your project
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Getting Started (for new users) */}
      {stats && stats.checkpoints === 0 && (
        <Card className="border-blue-800 bg-blue-950/20">
          <CardHeader>
            <CardTitle>Get Started with Gitgram TimeMachine</CardTitle>
            <CardDescription>
              Follow these steps to start tracking your AI coding sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <h4 className="font-medium">Create an API Key</h4>
                <p className="text-sm text-gray-400">
                  Generate an API key to authenticate the CLI and SDK
                </p>
                <Button size="sm" asChild>
                  <Link href="/dashboard/keys">Create Key</Link>
                </Button>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <h4 className="font-medium">Install the CLI</h4>
                <p className="text-sm text-gray-400">
                  Install our CLI tool to start creating checkpoints
                </p>
                <code className="block text-xs bg-gray-800 px-3 py-2 rounded mt-2">
                  npm install -g aitimemachine
                </code>
              </div>
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <h4 className="font-medium">Initialize Your Project</h4>
                <p className="text-sm text-gray-400">
                  Run init in your project directory to start tracking
                </p>
                <code className="block text-xs bg-gray-800 px-3 py-2 rounded mt-2">
                  aitm init
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
