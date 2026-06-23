'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="min-h-[600px] flex items-center justify-center p-8">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <CardTitle className="text-2xl">Something went wrong</CardTitle>
          <CardDescription className="text-base">
            We encountered an error while loading this page. This could be a temporary issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {process.env.NODE_ENV === 'development' && (
            <div className="p-4 bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">Error details (dev only):</p>
              <p className="text-sm font-mono text-red-400">{error.message}</p>
              {error.digest && (
                <p className="text-xs text-gray-500 mt-2">Digest: {error.digest}</p>
              )}
            </div>
          )}

          <div className="grid gap-3">
            <Button onClick={reset} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" asChild>
                <Link href="/dashboard">
                  <Home className="w-4 h-4 mr-2" />
                  Dashboard
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <a href="mailto:support@gitgram.app">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Contact Support
                </a>
              </Button>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">
            If this problem persists, please contact support with the error details above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
