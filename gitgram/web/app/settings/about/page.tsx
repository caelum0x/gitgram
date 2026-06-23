'use client'

import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">About Gitgram</h1>

        <div className="space-y-6">
          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Version</h2>
            <p className="text-foreground/70">1.0.0</p>
          </div>

          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Legal</h2>
            <div className="space-y-2">
              <Link href="/settings/privacy-policy" className="block text-accent hover:underline">
                Privacy Policy
              </Link>
              <Link href="/settings/terms" className="block text-accent hover:underline">
                Terms of Service
              </Link>
            </div>
          </div>

          <div className="bg-surface rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Support</h2>
            <Link href="/feedback/create" className="block text-accent hover:underline">
              Send Feedback
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

