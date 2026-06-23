'use client';

import { useUser } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function CliAuthPage() {
  const { user, isLoaded } = useUser();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    const port = searchParams.get('port');
    const state = searchParams.get('state');

    if (!port || !state) {
      setError('Missing port or state parameter');
      setStatus('error');
      return;
    }

    if (!user) {
      // Redirect to sign-in with return URL
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`;
      return;
    }

    // Generate API key server-side via the /api/keys route
    const generateAndSend = async () => {
      try {
        const res = await fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `CLI (${new Date().toLocaleDateString()})` }),
        });
        if (!res.ok) {
          throw new Error('Failed to generate API key');
        }
        const keyData = await res.json();

        // Send credentials to CLI local server
        const callbackUrl = `http://localhost:${port}/callback?api_key=${keyData.key}&user_id=${user.id}&email=${encodeURIComponent(user.emailAddresses[0]?.emailAddress || '')}&state=${state}`;
        await fetch(callbackUrl);
        setStatus('success');
      } catch (err: any) {
        setError(`Failed to authenticate CLI: ${err.message}`);
        setStatus('error');
      }
    };

    generateAndSend();
  }, [isLoaded, user, searchParams]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Authenticating CLI...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center bg-gray-800 p-8 rounded-lg">
          <div className="text-red-500 text-4xl mb-4">✗</div>
          <h1 className="text-xl font-bold mb-2">Authentication Failed</h1>
          <p className="text-gray-400">{error}</p>
          <a href="/dashboard" className="mt-4 inline-block px-4 py-2 bg-blue-600 rounded">
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center bg-gray-800 p-8 rounded-lg">
        <div className="text-green-500 text-4xl mb-4">✓</div>
        <h1 className="text-xl font-bold mb-2">CLI Authenticated!</h1>
        <p className="text-gray-400">You can close this window and return to your terminal.</p>
      </div>
    </div>
  );
}
