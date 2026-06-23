'use client'

import Link from 'next/link'

export default function AppSettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">App Settings</h1>

        <div className="space-y-2">
          <Link
            href="/settings/appearance"
            className="block p-4 bg-surface rounded-lg hover:bg-surface/80"
          >
            <p className="font-semibold text-foreground">Appearance</p>
            <p className="text-sm text-foreground/70">Theme and display settings</p>
          </Link>

          <Link
            href="/settings/notifications"
            className="block p-4 bg-surface rounded-lg hover:bg-surface/80"
          >
            <p className="font-semibold text-foreground">Notifications</p>
            <p className="text-sm text-foreground/70">Notification preferences</p>
          </Link>

          <Link
            href="/settings/language"
            className="block p-4 bg-surface rounded-lg hover:bg-surface/80"
          >
            <p className="font-semibold text-foreground">Language</p>
            <p className="text-sm text-foreground/70">Language and region</p>
          </Link>

          <Link
            href="/settings/data"
            className="block p-4 bg-surface rounded-lg hover:bg-surface/80"
          >
            <p className="font-semibold text-foreground">Data</p>
            <p className="text-sm text-foreground/70">Data management and storage</p>
          </Link>
        </div>
      </div>
    </div>
  )
}

