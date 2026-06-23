'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface TocEntry {
  id: string
  text: string
  level: 2 | 3
}

interface ArticleSection {
  id: string
  heading: string
  level: 2 | 3
  body: string[]
}

interface ArticleData {
  title: string
  category: string
  categorySlug: string
  lastUpdated: string
  readTime: string
  sections: ArticleSection[]
  relatedArticles: Array<{ slug: string; title: string; readTime: string }>
}

type FeedbackState = 'idle' | 'helpful' | 'not-helpful'

function ChevronRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />
    </svg>
  )
}

function ThumbUpIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 20h2a2 2 0 002-2V9a2 2 0 00-2-2H2v13zM21.172 9.172A4 4 0 0018 8h-4V5a3 3 0 00-3-3l-1 9H6v9h12.28a2 2 0 001.98-1.717l1-8A2 2 0 0021.172 9.172z" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905a3.61 3.61 0 01-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  )
}

function ThumbDownIcon({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 4h-2a2 2 0 00-2 2v11a2 2 0 002 2h2V4zM2.828 14.828A4 4 0 006 16h4v3a3 3 0 003 3l1-9h4V4H5.72a2 2 0 00-1.98 1.717l-1 8A2 2 0 002.828 14.828z" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905a3.61 3.61 0 01.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
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

const articleDatabase: Record<string, ArticleData> = {
  'how-to-link-github-account': {
    title: 'How to link your GitHub account to Gitgram',
    category: 'Getting Started',
    categorySlug: 'getting-started',
    lastUpdated: 'June 12, 2026',
    readTime: '3 min read',
    sections: [
      {
        id: 'overview',
        heading: 'Overview',
        level: 2,
        body: [
          'Linking your GitHub account to Gitgram lets you import your repositories automatically, display your GitHub contribution graph on your profile, and verify that you are the true owner of any repositories you claim.',
          'The connection uses GitHub OAuth, so Gitgram never stores your GitHub password.',
        ],
      },
      {
        id: 'before-you-begin',
        heading: 'Before you begin',
        level: 2,
        body: [
          'You must have an existing Gitgram account. If you do not have one yet, create an account first.',
          'You must have a GitHub account. The GitHub account must have at least one public repository for the import to populate your profile.',
        ],
      },
      {
        id: 'steps',
        heading: 'Linking your account step by step',
        level: 2,
        body: [
          '1. Open your Gitgram profile and click the Settings icon in the left sidebar, then choose Connected accounts.',
          '2. Under the GitHub section, click Connect GitHub Account.',
          '3. You will be redirected to GitHub. Review the permissions Gitgram is requesting — read-only access to your public profile and repositories — then click Authorize gitgram.',
          '4. GitHub redirects you back to Gitgram. Your username and avatar will appear in the Connected accounts panel.',
          '5. Gitgram begins importing your public repositories in the background. This usually takes less than 60 seconds for accounts with fewer than 500 repositories.',
        ],
      },
      {
        id: 'what-gets-imported',
        heading: 'What gets imported',
        level: 2,
        body: [
          'Public repositories: all public repos appear on your Gitgram profile with star count, fork count, and primary language.',
          'Contribution graph: your GitHub contribution heatmap is displayed on your profile page.',
          'Pinned repositories: repos you have pinned on GitHub are also pinned on your Gitgram profile by default.',
        ],
      },
      {
        id: 'revoking-access',
        heading: 'Revoking GitHub access',
        level: 2,
        body: [
          'To disconnect your GitHub account, go to Settings > Connected accounts and click Disconnect next to GitHub. Your imported repositories remain visible on your profile, but the contribution graph is removed and automatic sync stops.',
          'You can also revoke the OAuth grant from your GitHub account settings under Applications > Authorized OAuth Apps.',
        ],
      },
      {
        id: 'troubleshooting',
        heading: 'Troubleshooting',
        level: 2,
        body: [
          'Repositories not appearing: wait up to five minutes after connecting, then refresh your profile. If repositories still do not appear, go to Settings > Connected accounts and click Resync.',
          'Authorization error: make sure you are logged into the correct GitHub account in your browser before starting the linking process.',
          'Wrong account linked: disconnect the current GitHub account and repeat the steps above while logged into the correct GitHub account.',
        ],
      },
    ],
    relatedArticles: [
      { slug: 'claim-repository-ownership', title: 'Claiming ownership of your GitHub repositories', readTime: '3 min read' },
      { slug: 'complete-your-profile', title: 'Completing your developer profile', readTime: '4 min read' },
      { slug: 'create-your-account', title: 'Creating your Gitgram account', readTime: '2 min read' },
    ],
  },
  'two-factor-authentication': {
    title: 'Setting up two-factor authentication (2FA)',
    category: 'Security',
    categorySlug: 'security',
    lastUpdated: 'June 17, 2026',
    readTime: '5 min read',
    sections: [
      {
        id: 'overview',
        heading: 'What is two-factor authentication?',
        level: 2,
        body: [
          'Two-factor authentication (2FA) adds a second verification step when you log in to Gitgram. Even if someone learns your password, they cannot access your account without the second factor.',
          'Gitgram supports two methods: an authenticator app (recommended) or SMS text messages.',
        ],
      },
      {
        id: 'authenticator-app',
        heading: 'Setting up an authenticator app',
        level: 2,
        body: [
          '1. Install an authenticator app on your phone. Popular options include Google Authenticator, Authy, and 1Password.',
          '2. Go to Settings > Security > Two-factor authentication and click Enable.',
          '3. Scan the QR code displayed on screen with your authenticator app.',
          '4. Enter the 6-digit code shown in your app to confirm the setup.',
          '5. Save your recovery codes somewhere safe — you will need them if you lose access to your authenticator app.',
        ],
      },
      {
        id: 'sms',
        heading: 'Setting up SMS verification',
        level: 2,
        body: [
          '1. Go to Settings > Security > Two-factor authentication and click Enable.',
          '2. Choose SMS as your method and enter your phone number including the country code.',
          '3. Gitgram sends a verification code to your phone. Enter the code to confirm.',
          'Note: SMS 2FA is less secure than an authenticator app. We strongly recommend using an app if possible.',
        ],
      },
      {
        id: 'recovery-codes',
        heading: 'Recovery codes',
        level: 2,
        body: [
          'When you enable 2FA, Gitgram generates 10 single-use recovery codes. Each code can be used once to log in if you cannot access your authenticator app or phone.',
          'Store your recovery codes in a password manager or secure offline location. You can generate new codes at any time from Settings > Security > Two-factor authentication > View recovery codes.',
        ],
      },
      {
        id: 'disable-2fa',
        heading: 'Disabling 2FA',
        level: 2,
        body: [
          'Go to Settings > Security > Two-factor authentication and click Disable. You will be asked to confirm with your current 2FA code or a recovery code.',
          'Disabling 2FA reduces your account security. We recommend keeping it enabled at all times.',
        ],
      },
    ],
    relatedArticles: [
      { slug: 'active-sessions', title: 'Viewing and ending active sessions', readTime: '3 min read' },
      { slug: 'account-recovery', title: 'Recovering a hacked or locked account', readTime: '5 min read' },
      { slug: 'change-password', title: 'Changing your password', readTime: '2 min read' },
    ],
  },
  'create-and-share-code-snippets': {
    title: 'Creating and sharing syntax-highlighted code snippets',
    category: 'Posts & Snippets',
    categorySlug: 'posts-and-snippets',
    lastUpdated: 'June 16, 2026',
    readTime: '4 min read',
    sections: [
      {
        id: 'overview',
        heading: 'Overview',
        level: 2,
        body: [
          'Gitgram code snippets let you share syntax-highlighted code with your followers. Snippets support over 50 programming languages and can be embedded on external websites.',
        ],
      },
      {
        id: 'create-snippet',
        heading: 'Creating a snippet',
        level: 2,
        body: [
          '1. Click the Create button (plus icon) in the left sidebar and choose Code Snippet.',
          '2. Paste or type your code in the editor.',
          '3. Select the programming language from the dropdown. Gitgram will also attempt to auto-detect the language.',
          '4. Add an optional title and description to give context.',
          '5. Click Post to publish, or Save draft to finish later.',
        ],
      },
      {
        id: 'supported-languages',
        heading: 'Supported languages',
        level: 2,
        body: [
          'Gitgram supports syntax highlighting for TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, Swift, C, C++, C#, Ruby, PHP, HTML, CSS, SQL, Bash, YAML, JSON, Markdown, and many more.',
          'If your language is not listed, choose Plain Text and the code will still render in a monospaced font.',
        ],
      },
      {
        id: 'embed',
        heading: 'Embedding a snippet on an external site',
        level: 2,
        body: [
          '1. Open the snippet post and click the Share icon.',
          '2. Select Embed.',
          '3. Copy the generated script tag and paste it into your HTML.',
          'The embedded widget automatically updates if you edit the snippet later.',
        ],
      },
      {
        id: 'edit-delete',
        heading: 'Editing and deleting snippets',
        level: 2,
        body: [
          'To edit a snippet, open the post, click the three-dot menu, and choose Edit. Changes are reflected immediately on all embeds.',
          'To delete a snippet, open the post, click the three-dot menu, and choose Delete. Deletion is permanent and cannot be undone. Embeds on external sites will show a "Snippet not found" message after deletion.',
        ],
      },
    ],
    relatedArticles: [
      { slug: 'embed-a-snippet', title: 'Embedding code snippets on external sites', readTime: '4 min read' },
      { slug: 'post-with-images', title: 'Attaching images to a post', readTime: '3 min read' },
      { slug: 'draft-and-schedule', title: 'Saving drafts and scheduling posts', readTime: '3 min read' },
    ],
  },
}

function buildToc(sections: ArticleSection[]): TocEntry[] {
  return sections.map((s) => ({ id: s.id, text: s.heading, level: s.level }))
}

function getFallbackArticle(slug: string): ArticleData {
  const title = slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return {
    title,
    category: 'Help',
    categorySlug: 'getting-started',
    lastUpdated: 'June 2026',
    readTime: '2 min read',
    sections: [
      {
        id: 'overview',
        heading: 'Overview',
        level: 2,
        body: ['This article is coming soon. Check back later or contact support for immediate help.'],
      },
    ],
    relatedArticles: [
      { slug: 'create-your-account', title: 'Creating your Gitgram account', readTime: '2 min read' },
    ],
  }
}

export default function HelpArticlePage() {
  const params = useParams()
  const slug = typeof params.slug === 'string' ? params.slug : ''

  const article: ArticleData = articleDatabase[slug] ?? getFallbackArticle(slug)
  const toc: TocEntry[] = buildToc(article.sections)
  const [feedback, setFeedback] = useState<FeedbackState>('idle')
  const [activeSection, setActiveSection] = useState<string>(toc[0]?.id ?? '')

  function handleScrollToSection(id: string) {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSection(id)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-2 text-sm mb-8 flex-wrap"
          style={{ color: 'var(--foreground-secondary)' }}
        >
          <Link
            href="/help"
            className="hover:underline transition-colors"
            style={{ color: 'var(--primary)' }}
          >
            Help
          </Link>
          <ChevronRightIcon />
          <Link
            href={`/help/${article.categorySlug}`}
            className="hover:underline transition-colors"
            style={{ color: 'var(--primary)' }}
          >
            {article.category}
          </Link>
          <ChevronRightIcon />
          <span
            className="truncate max-w-xs"
            style={{ color: 'var(--foreground)' }}
          >
            {article.title}
          </span>
        </nav>

        <div className="grid lg:grid-cols-4 gap-10">
          {/* Table of Contents — sticky sidebar */}
          <aside className="hidden lg:block">
            <div
              className="sticky top-6 p-5 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                On this page
              </h3>
              <nav className="space-y-1">
                {toc.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => handleScrollToSection(entry.id)}
                    className="w-full text-left text-xs py-1.5 px-2 rounded-md transition-all"
                    style={{
                      paddingLeft: entry.level === 3 ? '1.25rem' : '0.5rem',
                      color: activeSection === entry.id ? 'var(--primary)' : 'var(--foreground-secondary)',
                      backgroundColor: activeSection === entry.id ? 'var(--surface-secondary)' : 'transparent',
                      fontWeight: activeSection === entry.id ? 600 : 400,
                    }}
                  >
                    {entry.text}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Article Body */}
          <main className="lg:col-span-2">
            {/* Article Header */}
            <header className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Link
                  href={`/help/${article.categorySlug}`}
                  className="text-xs font-medium px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: 'var(--surface-secondary)',
                    color: 'var(--primary)',
                  }}
                >
                  {article.category}
                </Link>
              </div>

              <h1
                className="text-2xl md:text-3xl font-bold mb-4 leading-snug"
                style={{ color: 'var(--foreground)' }}
              >
                {article.title}
              </h1>

              <div
                className="flex flex-wrap items-center gap-4 text-xs pb-6"
                style={{
                  color: 'var(--foreground-secondary)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span className="flex items-center gap-1">
                  <CalendarIcon />
                  Last updated {article.lastUpdated}
                </span>
                <span className="flex items-center gap-1">
                  <ClockIcon />
                  {article.readTime}
                </span>
              </div>
            </header>

            {/* Mobile Table of Contents */}
            <div
              className="lg:hidden p-4 rounded-xl mb-8"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                On this page
              </h3>
              <nav className="flex flex-col gap-1">
                {toc.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => handleScrollToSection(entry.id)}
                    className="text-left text-sm py-1 transition-colors"
                    style={{
                      paddingLeft: entry.level === 3 ? '1rem' : '0',
                      color: 'var(--primary)',
                    }}
                  >
                    {entry.text}
                  </button>
                ))}
              </nav>
            </div>

            {/* Article Sections */}
            <article className="space-y-8">
              {article.sections.map((section) => (
                <section key={section.id} id={section.id}>
                  {section.level === 2 ? (
                    <h2
                      className="text-lg font-bold mb-4"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {section.heading}
                    </h2>
                  ) : (
                    <h3
                      className="text-base font-semibold mb-3"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {section.heading}
                    </h3>
                  )}
                  <div className="space-y-3">
                    {section.body.map((paragraph, i) => (
                      <p
                        key={i}
                        className="text-sm leading-7"
                        style={{ color: 'var(--foreground-secondary)' }}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </article>

            {/* Feedback */}
            <div
              className="mt-12 p-6 rounded-xl text-center"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              {feedback === 'idle' ? (
                <>
                  <p
                    className="text-sm font-semibold mb-4"
                    style={{ color: 'var(--foreground)' }}
                  >
                    Was this article helpful?
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => setFeedback('helpful')}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{
                        border: '1px solid var(--border)',
                        color: 'var(--foreground-secondary)',
                        backgroundColor: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent)'
                        e.currentTarget.style.color = 'var(--accent)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.color = 'var(--foreground-secondary)'
                      }}
                    >
                      <ThumbUpIcon />
                      Yes
                    </button>
                    <button
                      onClick={() => setFeedback('not-helpful')}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
                      style={{
                        border: '1px solid var(--border)',
                        color: 'var(--foreground-secondary)',
                        backgroundColor: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--error)'
                        e.currentTarget.style.color = 'var(--error)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.color = 'var(--foreground-secondary)'
                      }}
                    >
                      <ThumbDownIcon />
                      No
                    </button>
                  </div>
                </>
              ) : feedback === 'helpful' ? (
                <div className="flex flex-col items-center gap-2">
                  <span style={{ color: 'var(--accent)' }}>
                    <ThumbUpIcon filled />
                  </span>
                  <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                    Thanks for the feedback!
                  </p>
                  <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                    Glad this article helped. Let us know if anything could be clearer.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span style={{ color: 'var(--error)' }}>
                    <ThumbDownIcon filled />
                  </span>
                  <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                    Sorry this did not help.
                  </p>
                  <p className="text-xs mb-3" style={{ color: 'var(--foreground-secondary)' }}>
                    Our team will review this article. You can also contact support for personalized help.
                  </p>
                  <a
                    href="mailto:support@gitgram.dev"
                    className="text-sm font-medium hover:underline transition-colors"
                    style={{ color: 'var(--primary)' }}
                  >
                    Contact Support
                  </a>
                </div>
              )}
            </div>

            {/* Back Link */}
            <div className="mt-8">
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
          </main>

          {/* Right Sidebar — Related Articles */}
          <aside className="space-y-6">
            <div
              className="p-5 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3
                className="text-sm font-semibold mb-4"
                style={{ color: 'var(--foreground)' }}
              >
                Related articles
              </h3>
              <div className="space-y-3">
                {article.relatedArticles.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/help/article/${related.slug}`}
                    className="block group"
                  >
                    <p
                      className="text-sm font-medium leading-snug mb-0.5 group-hover:text-[var(--primary)] transition-colors"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {related.title}
                    </p>
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: 'var(--foreground-secondary)' }}
                    >
                      <ClockIcon />
                      {related.readTime}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Category Link */}
            <div
              className="p-5 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3
                className="text-sm font-semibold mb-3"
                style={{ color: 'var(--foreground)' }}
              >
                More in {article.category}
              </h3>
              <Link
                href={`/help/${article.categorySlug}`}
                className="flex items-center gap-2 text-sm transition-colors"
                style={{ color: 'var(--primary)' }}
              >
                View all {article.category} articles
                <ChevronRightIcon />
              </Link>
            </div>

            {/* Support */}
            <div
              className="p-5 rounded-xl"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <h3
                className="text-sm font-semibold mb-2"
                style={{ color: 'var(--foreground)' }}
              >
                Still need help?
              </h3>
              <p
                className="text-xs mb-4"
                style={{ color: 'var(--foreground-secondary)' }}
              >
                Our support team is here to help you.
              </p>
              <a
                href="mailto:support@gitgram.dev"
                className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg text-sm font-semibold transition-opacity"
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
