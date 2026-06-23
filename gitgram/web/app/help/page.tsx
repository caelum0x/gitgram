'use client'

import { useState } from 'react'
import Link from 'next/link'

interface HelpTopic {
  slug: string
  title: string
  description: string
  icon: React.ReactNode
  articleCount: number
}

interface RecentArticle {
  slug: string
  category: string
  categorySlug: string
  title: string
  excerpt: string
  readTime: string
}

function SearchIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5H20M20 5V11M20 5L10 15M9 5H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function DiscordIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

function StatusIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

const helpTopics: HelpTopic[] = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    description: 'Create your account, set up your profile, and learn the basics.',
    articleCount: 8,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    slug: 'your-profile',
    title: 'Your Profile',
    description: 'Customize your profile, bio, avatar, and developer links.',
    articleCount: 6,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    slug: 'following-and-discovery',
    title: 'Following & Discovery',
    description: 'Find developers, follow projects, and grow your network.',
    articleCount: 5,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    slug: 'posts-and-snippets',
    title: 'Posts & Snippets',
    description: 'Share code snippets, updates, and developer content.',
    articleCount: 10,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    slug: 'repositories',
    title: 'Repositories',
    description: 'Link GitHub repos, claim ownership, and share your projects.',
    articleCount: 7,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    slug: 'reels',
    title: 'Reels',
    description: 'Create and watch short-form developer video content.',
    articleCount: 4,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    slug: 'notifications',
    title: 'Notifications',
    description: 'Manage alerts, mentions, and activity notifications.',
    articleCount: 5,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    slug: 'settings-and-privacy',
    title: 'Settings & Privacy',
    description: 'Control your account settings, data, and privacy options.',
    articleCount: 9,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    slug: 'premium',
    title: 'Premium',
    description: 'Learn about paid plans, billing, and premium features.',
    articleCount: 6,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
  {
    slug: 'security',
    title: 'Security',
    description: 'Two-factor authentication, connected apps, and account security.',
    articleCount: 7,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    slug: 'api-and-integrations',
    title: 'API & Integrations',
    description: 'Gitgram API reference, webhooks, and third-party integrations.',
    articleCount: 12,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    slug: 'community-guidelines',
    title: 'Community Guidelines',
    description: 'Acceptable use policy, content standards, and reporting abuse.',
    articleCount: 5,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
]

const recentArticles: RecentArticle[] = [
  {
    slug: 'how-to-link-github-account',
    category: 'Getting Started',
    categorySlug: 'getting-started',
    title: 'How to link your GitHub account to Gitgram',
    excerpt: 'Connect your GitHub account to automatically import your repositories, display your contribution graph, and verify your developer identity.',
    readTime: '3 min read',
  },
  {
    slug: 'create-and-share-code-snippets',
    category: 'Posts & Snippets',
    categorySlug: 'posts-and-snippets',
    title: 'Creating and sharing syntax-highlighted code snippets',
    excerpt: 'Learn how to post code snippets with full syntax highlighting across 50+ languages, add descriptions, and embed them anywhere.',
    readTime: '4 min read',
  },
  {
    slug: 'two-factor-authentication',
    category: 'Security',
    categorySlug: 'security',
    title: 'Setting up two-factor authentication (2FA)',
    excerpt: 'Protect your account with an authenticator app or SMS codes. This guide walks you through enabling 2FA step by step.',
    readTime: '5 min read',
  },
  {
    slug: 'claim-repository-ownership',
    category: 'Repositories',
    categorySlug: 'repositories',
    title: 'Claiming ownership of your GitHub repositories',
    excerpt: 'Verify that a public GitHub repository belongs to you so it appears on your Gitgram profile with full social stats.',
    readTime: '3 min read',
  },
  {
    slug: 'premium-plan-features',
    category: 'Premium',
    categorySlug: 'premium',
    title: 'What is included in Gitgram Premium?',
    excerpt: 'A complete breakdown of every feature unlocked by Premium: verified badge, advanced analytics, custom themes, ad-free browsing, and more.',
    readTime: '6 min read',
  },
]

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredTopics = searchQuery.trim()
    ? helpTopics.filter(
        (topic) =>
          topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          topic.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : helpTopics

  const filteredArticles = searchQuery.trim()
    ? recentArticles.filter(
        (article) =>
          article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          article.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
          article.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : recentArticles

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      {/* Hero / Search */}
      <div
        className="py-16 px-4 text-center"
        style={{
          background: 'linear-gradient(180deg, var(--surface) 0%, var(--background) 100%)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h1 className="text-4xl md:text-5xl font-bold mb-3" style={{ color: 'var(--foreground)' }}>
          How can we help?
        </h1>
        <p className="text-lg mb-8" style={{ color: 'var(--foreground-secondary)' }}>
          Search our documentation or browse by topic below.
        </p>

        <div className="max-w-xl mx-auto relative">
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            <SearchIcon />
          </div>
          <input
            type="text"
            placeholder="Search help articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 rounded-xl text-base outline-none transition-colors"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Topics Grid */}
        <section className="mb-14">
          <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--foreground)' }}>
            {searchQuery.trim() ? `Topics matching "${searchQuery}"` : 'Popular topics'}
          </h2>

          {filteredTopics.length === 0 ? (
            <p style={{ color: 'var(--foreground-secondary)' }}>
              No topics matched your search. Try a different term or{' '}
              <a
                href="mailto:support@gitgram.dev"
                style={{ color: 'var(--primary)' }}
                className="hover:underline"
              >
                contact support
              </a>
              .
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredTopics.map((topic) => (
                <Link
                  key={topic.slug}
                  href={`/help/${topic.slug}`}
                  className="group p-5 rounded-xl transition-all"
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--primary)'
                    e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.backgroundColor = 'var(--surface)'
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-colors"
                    style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--primary)' }}
                  >
                    {topic.icon}
                  </div>
                  <h3
                    className="font-semibold mb-1 text-sm leading-snug"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {topic.title}
                  </h3>
                  <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--foreground-secondary)' }}>
                    {topic.description}
                  </p>
                  <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                    {topic.articleCount} articles
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="grid lg:grid-cols-3 gap-10">
          {/* Recent Articles */}
          <section className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--foreground)' }}>
              {searchQuery.trim() ? `Articles matching "${searchQuery}"` : 'Recent help articles'}
            </h2>

            {filteredArticles.length === 0 ? (
              <p style={{ color: 'var(--foreground-secondary)' }}>
                No articles matched your search.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredArticles.map((article) => (
                  <Link
                    key={article.slug}
                    href={`/help/article/${article.slug}`}
                    className="flex items-start gap-4 p-5 rounded-xl transition-all group"
                    style={{
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: 'var(--surface-secondary)',
                            color: 'var(--primary)',
                          }}
                        >
                          {article.category}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                          {article.readTime}
                        </span>
                      </div>
                      <h3
                        className="font-semibold mb-1 text-sm group-hover:text-[var(--primary)] transition-colors"
                        style={{ color: 'var(--foreground)' }}
                      >
                        {article.title}
                      </h3>
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--foreground-secondary)' }}>
                        {article.excerpt}
                      </p>
                    </div>
                    <div
                      className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--primary)' }}
                    >
                      <ChevronRightIcon />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Contact Support */}
            <div
              className="p-6 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3 className="font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                Still need help?
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--foreground-secondary)' }}>
                Our support team typically responds within 24 hours on business days.
              </p>
              <a
                href="mailto:support@gitgram.dev"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-colors"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
              >
                <MailIcon />
                Contact Support
              </a>
            </div>

            {/* Quick Links */}
            <div
              className="p-6 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
                Quick links
              </h3>
              <div className="space-y-2">
                <a
                  href="https://discord.gg/gitgram"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg text-sm transition-colors"
                  style={{ color: 'var(--foreground-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
                    e.currentTarget.style.color = 'var(--foreground)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--foreground-secondary)'
                  }}
                >
                  <span style={{ color: '#5865F2' }}>
                    <DiscordIcon />
                  </span>
                  <span>Join our Discord</span>
                  <span className="ml-auto">
                    <ExternalLinkIcon />
                  </span>
                </a>

                <a
                  href="https://github.com/gitgram-dev/gitgram/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg text-sm transition-colors"
                  style={{ color: 'var(--foreground-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
                    e.currentTarget.style.color = 'var(--foreground)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--foreground-secondary)'
                  }}
                >
                  <GitHubIcon />
                  <span>GitHub Issues</span>
                  <span className="ml-auto">
                    <ExternalLinkIcon />
                  </span>
                </a>

                <a
                  href="https://status.gitgram.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg text-sm transition-colors"
                  style={{ color: 'var(--foreground-secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
                    e.currentTarget.style.color = 'var(--foreground)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--foreground-secondary)'
                  }}
                >
                  <span style={{ color: 'var(--accent)' }}>
                    <StatusIcon />
                  </span>
                  <span>Status Page</span>
                  <span className="ml-auto">
                    <ExternalLinkIcon />
                  </span>
                </a>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
