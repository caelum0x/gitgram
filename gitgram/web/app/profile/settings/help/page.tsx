'use client'

import Link from 'next/link'

export default function HelpPage() {
  const helpTopics = [
    { title: 'Getting Started', href: '/help/getting-started' },
    { title: 'Account Settings', href: '/help/account' },
    { title: 'Privacy & Security', href: '/help/privacy' },
    { title: 'Posting Content', href: '/help/posting' },
    { title: 'Messaging', href: '/help/messaging' },
    { title: 'Troubleshooting', href: '/help/troubleshooting' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Help & Support</h1>
        <div className="space-y-2">
          {helpTopics.map((topic) => (
            <Link
              key={topic.href}
              href={topic.href}
              className="block p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              <p className="font-semibold text-foreground">{topic.title}</p>
            </Link>
          ))}
        </div>
        <div className="mt-8 p-6 bg-surface rounded-lg">
          <h2 className="text-lg font-semibold text-foreground mb-4">Contact Support</h2>
          <Link
            href="/feedback/create"
            className="block px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 text-center"
          >
            Send Feedback
          </Link>
        </div>
      </div>
    </div>
  )
}

