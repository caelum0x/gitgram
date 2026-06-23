'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Article {
  slug: string
  title: string
  excerpt: string
  readTime: string
  updatedAt: string
}

interface CategoryConfig {
  title: string
  description: string
  icon: React.ReactNode
  articles: Article[]
  relatedCategories: Array<{ slug: string; title: string }>
}

function ChevronRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function categoryIcon(slug: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    'getting-started': (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    'your-profile': (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    'following-and-discovery': (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    'posts-and-snippets': (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    repositories: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    reels: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    notifications: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    'settings-and-privacy': (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    premium: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    security: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    'api-and-integrations': (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    'community-guidelines': (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  }

  return (
    icons[slug] ?? (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  )
}

function formatSlugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const categoryData: Record<string, CategoryConfig> = {
  'getting-started': {
    title: 'Getting Started',
    description:
      'Everything you need to know to create your Gitgram account, set up your profile, and start connecting with the developer community.',
    icon: null,
    articles: [
      {
        slug: 'create-your-account',
        title: 'Creating your Gitgram account',
        excerpt: 'Sign up with email, GitHub OAuth, or Google. Verify your email and complete the onboarding wizard.',
        readTime: '2 min read',
        updatedAt: 'Jun 10, 2026',
      },
      {
        slug: 'how-to-link-github-account',
        title: 'How to link your GitHub account to Gitgram',
        excerpt: 'Connect your GitHub account to automatically import repositories, display contribution graphs, and verify your identity.',
        readTime: '3 min read',
        updatedAt: 'Jun 12, 2026',
      },
      {
        slug: 'complete-your-profile',
        title: 'Completing your developer profile',
        excerpt: 'Add a bio, profile photo, links to your social accounts, and skills to make your profile stand out.',
        readTime: '4 min read',
        updatedAt: 'Jun 8, 2026',
      },
      {
        slug: 'your-first-post',
        title: 'Writing your first post',
        excerpt: 'Learn how to compose a post with text, images, code snippets, or a linked repository.',
        readTime: '3 min read',
        updatedAt: 'Jun 15, 2026',
      },
      {
        slug: 'follow-developers',
        title: 'Finding and following developers',
        excerpt: 'Use Explore, search, and recommended accounts to build your developer network.',
        readTime: '2 min read',
        updatedAt: 'Jun 5, 2026',
      },
      {
        slug: 'understanding-your-feed',
        title: 'Understanding your home feed',
        excerpt: 'How the Gitgram feed algorithm works and how to customise what you see.',
        readTime: '3 min read',
        updatedAt: 'Jun 14, 2026',
      },
      {
        slug: 'mobile-app-setup',
        title: 'Setting up the Gitgram mobile app',
        excerpt: 'Download, install, and configure the Gitgram app on iOS and Android.',
        readTime: '3 min read',
        updatedAt: 'Jun 11, 2026',
      },
      {
        slug: 'keyboard-shortcuts',
        title: 'Keyboard shortcuts reference',
        excerpt: 'A full list of keyboard shortcuts to navigate Gitgram faster on desktop.',
        readTime: '2 min read',
        updatedAt: 'Jun 2, 2026',
      },
    ],
    relatedCategories: [
      { slug: 'your-profile', title: 'Your Profile' },
      { slug: 'following-and-discovery', title: 'Following & Discovery' },
      { slug: 'posts-and-snippets', title: 'Posts & Snippets' },
    ],
  },
  'posts-and-snippets': {
    title: 'Posts & Snippets',
    description:
      'Learn how to create posts, share syntax-highlighted code snippets, use hashtags, and engage with content from other developers.',
    icon: null,
    articles: [
      {
        slug: 'create-and-share-code-snippets',
        title: 'Creating and sharing syntax-highlighted code snippets',
        excerpt: 'Post code snippets with full syntax highlighting across 50+ languages and add descriptions.',
        readTime: '4 min read',
        updatedAt: 'Jun 16, 2026',
      },
      {
        slug: 'post-with-images',
        title: 'Attaching images to a post',
        excerpt: 'Upload up to 10 images per post, reorder them, add alt text, and apply filters.',
        readTime: '3 min read',
        updatedAt: 'Jun 9, 2026',
      },
      {
        slug: 'draft-and-schedule',
        title: 'Saving drafts and scheduling posts',
        excerpt: 'Save your work as a draft and schedule posts to publish at a specific date and time.',
        readTime: '3 min read',
        updatedAt: 'Jun 13, 2026',
      },
      {
        slug: 'hashtags-and-mentions',
        title: 'Using hashtags and @mentions',
        excerpt: 'Tag topics with hashtags and mention other users to increase reach and start conversations.',
        readTime: '2 min read',
        updatedAt: 'Jun 7, 2026',
      },
      {
        slug: 'embed-a-snippet',
        title: 'Embedding code snippets on external sites',
        excerpt: 'Generate an embed script to display a Gitgram snippet on your blog or documentation site.',
        readTime: '4 min read',
        updatedAt: 'Jun 11, 2026',
      },
      {
        slug: 'edit-and-delete-posts',
        title: 'Editing and deleting posts',
        excerpt: 'How to edit a published post, view the edit history, or permanently remove a post.',
        readTime: '2 min read',
        updatedAt: 'Jun 4, 2026',
      },
      {
        slug: 'post-visibility',
        title: 'Controlling post visibility',
        excerpt: 'Set a post to public, followers-only, or private and change visibility after publishing.',
        readTime: '3 min read',
        updatedAt: 'Jun 6, 2026',
      },
      {
        slug: 'saving-and-collections',
        title: 'Saving posts to collections',
        excerpt: 'Bookmark any post and organize your saved content into named collections.',
        readTime: '2 min read',
        updatedAt: 'Jun 10, 2026',
      },
      {
        slug: 'comment-threads',
        title: 'Commenting and replying to posts',
        excerpt: 'Start a threaded discussion on any post, react with emojis, and mute conversations.',
        readTime: '2 min read',
        updatedAt: 'Jun 12, 2026',
      },
      {
        slug: 'report-a-post',
        title: 'Reporting a post that violates guidelines',
        excerpt: 'How to report harmful or inappropriate content and what happens after you submit a report.',
        readTime: '2 min read',
        updatedAt: 'Jun 3, 2026',
      },
    ],
    relatedCategories: [
      { slug: 'repositories', title: 'Repositories' },
      { slug: 'reels', title: 'Reels' },
      { slug: 'community-guidelines', title: 'Community Guidelines' },
    ],
  },
  security: {
    title: 'Security',
    description:
      'Protect your Gitgram account with two-factor authentication, review connected apps, and respond to suspicious activity.',
    icon: null,
    articles: [
      {
        slug: 'two-factor-authentication',
        title: 'Setting up two-factor authentication (2FA)',
        excerpt: 'Enable 2FA with an authenticator app or SMS to add a second layer of login security.',
        readTime: '5 min read',
        updatedAt: 'Jun 17, 2026',
      },
      {
        slug: 'connected-apps',
        title: 'Reviewing connected apps and OAuth tokens',
        excerpt: 'See which third-party apps have access to your account and revoke permissions at any time.',
        readTime: '3 min read',
        updatedAt: 'Jun 14, 2026',
      },
      {
        slug: 'active-sessions',
        title: 'Viewing and ending active sessions',
        excerpt: 'Check all devices currently logged into your account and remotely sign out suspicious sessions.',
        readTime: '3 min read',
        updatedAt: 'Jun 12, 2026',
      },
      {
        slug: 'change-password',
        title: 'Changing your password',
        excerpt: 'Update your password from account settings and learn the requirements for a strong password.',
        readTime: '2 min read',
        updatedAt: 'Jun 8, 2026',
      },
      {
        slug: 'phishing-and-scams',
        title: 'Recognizing and reporting phishing attempts',
        excerpt: 'How to spot fake Gitgram emails and messages, and what to do if you suspect you have been targeted.',
        readTime: '4 min read',
        updatedAt: 'Jun 10, 2026',
      },
      {
        slug: 'account-recovery',
        title: 'Recovering a hacked or locked account',
        excerpt: 'Steps to regain access to your account if you have lost your password or been locked out.',
        readTime: '5 min read',
        updatedAt: 'Jun 15, 2026',
      },
      {
        slug: 'delete-account',
        title: 'Deleting your Gitgram account',
        excerpt: 'How to permanently delete your account and all associated data, including the 30-day grace period.',
        readTime: '3 min read',
        updatedAt: 'Jun 5, 2026',
      },
    ],
    relatedCategories: [
      { slug: 'settings-and-privacy', title: 'Settings & Privacy' },
      { slug: 'getting-started', title: 'Getting Started' },
    ],
  },
}

function getFallbackCategory(slug: string): CategoryConfig {
  return {
    title: formatSlugToTitle(slug),
    description: `Help articles for ${formatSlugToTitle(slug)}.`,
    icon: null,
    articles: [
      {
        slug: 'overview',
        title: `${formatSlugToTitle(slug)} overview`,
        excerpt: 'An introduction to this topic and how to get the most out of this feature.',
        readTime: '3 min read',
        updatedAt: 'Jun 2026',
      },
    ],
    relatedCategories: [
      { slug: 'getting-started', title: 'Getting Started' },
      { slug: 'settings-and-privacy', title: 'Settings & Privacy' },
    ],
  }
}

export default function HelpCategoryPage() {
  const params = useParams()
  const slug = typeof params.category === 'string' ? params.category : ''

  const config: CategoryConfig = categoryData[slug] ?? getFallbackCategory(slug)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm mb-8" style={{ color: 'var(--foreground-secondary)' }}>
          <Link
            href="/help"
            className="hover:underline transition-colors"
            style={{ color: 'var(--primary)' }}
          >
            Help
          </Link>
          <ChevronRightIcon />
          <span style={{ color: 'var(--foreground)' }}>{config.title}</span>
        </nav>

        {/* Category Header */}
        <div
          className="flex items-start gap-5 p-6 rounded-2xl mb-10"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--primary)' }}
          >
            {categoryIcon(slug)}
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--foreground)' }}>
              {config.title}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>
              {config.description}
            </p>
            <p className="text-xs mt-2" style={{ color: 'var(--foreground-secondary)' }}>
              {config.articles.length} {config.articles.length === 1 ? 'article' : 'articles'}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Article List */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
              Articles in this category
            </h2>

            <div className="space-y-3">
              {config.articles.map((article) => (
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
                    e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.backgroundColor = 'var(--surface)'
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-semibold text-sm mb-1 group-hover:text-[var(--primary)] transition-colors"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {article.title}
                    </h3>
                    <p
                      className="text-xs leading-relaxed mb-3 line-clamp-2"
                      style={{ color: 'var(--foreground-secondary)' }}
                    >
                      {article.excerpt}
                    </p>
                    <div className="flex items-center gap-3">
                      <span
                        className="flex items-center gap-1 text-xs"
                        style={{ color: 'var(--foreground-secondary)' }}
                      >
                        <ClockIcon />
                        {article.readTime}
                      </span>
                      <span
                        className="flex items-center gap-1 text-xs"
                        style={{ color: 'var(--foreground-secondary)' }}
                      >
                        <CalendarIcon />
                        Updated {article.updatedAt}
                      </span>
                    </div>
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
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Related Categories */}
            <div
              className="p-5 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3 className="font-semibold mb-4 text-sm" style={{ color: 'var(--foreground)' }}>
                Related categories
              </h3>
              <div className="space-y-2">
                {config.relatedCategories.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/help/${related.slug}`}
                    className="flex items-center justify-between p-3 rounded-lg text-sm transition-all"
                    style={{ color: 'var(--foreground-secondary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'
                      e.currentTarget.style.color = 'var(--primary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = 'var(--foreground-secondary)'
                    }}
                  >
                    <span>{related.title}</span>
                    <ChevronRightIcon />
                  </Link>
                ))}
              </div>
            </div>

            {/* All Topics */}
            <div
              className="p-5 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3 className="font-semibold mb-3 text-sm" style={{ color: 'var(--foreground)' }}>
                Browse all topics
              </h3>
              <Link
                href="/help"
                className="flex items-center gap-2 text-sm transition-colors"
                style={{ color: 'var(--primary)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Help Center
              </Link>
            </div>

            {/* Contact Support */}
            <div
              className="p-5 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3 className="font-semibold mb-2 text-sm" style={{ color: 'var(--foreground)' }}>
                Can&#39;t find what you need?
              </h3>
              <p className="text-xs mb-4" style={{ color: 'var(--foreground-secondary)' }}>
                Contact our support team for personalized help.
              </p>
              <a
                href="mailto:support@gitgram.dev"
                className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg font-semibold text-sm transition-opacity"
                style={{ backgroundColor: 'var(--primary)', color: '#ffffff' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
              >
                Contact Support
              </a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
