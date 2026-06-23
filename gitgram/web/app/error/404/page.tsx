'use client'

import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-foreground mb-4">Page Not Found</h2>
        <p className="text-foreground/70 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          href="/feed"
          className="px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:opacity-90 inline-block"
        >
          Go to Feed
        </Link>
      </div>
    </div>
  )
}
