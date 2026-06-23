'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        <div className="mx-auto w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>

        <h1 className="text-3xl font-bold mb-2">Oops! Something went wrong</h1>
        <p className="text-gray-400 mb-8">
          We apologize for the inconvenience. An unexpected error has occurred.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg mb-8 text-left">
            <p className="text-xs text-gray-400 mb-1">Error details (dev only):</p>
            <p className="text-sm font-mono text-red-400">{error.message}</p>
            {error.digest && (
              <p className="text-xs text-gray-500 mt-2">Digest: {error.digest}</p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <Button onClick={reset} size="lg" className="w-full">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" asChild>
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="mailto:support@gitgram.app">
                <MessageSquare className="w-4 h-4 mr-2" />
                Contact Support
              </a>
            </Button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-8">
          Error ID: {error.digest || 'Unknown'}
        </p>
      </div>
    </div>
  );
}
