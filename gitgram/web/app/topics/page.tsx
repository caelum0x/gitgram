'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Topic {
  slug: string
  name: string
  emoji: string
  description: string
  postsThisWeek: number
  contributors: number
  category: string
  color: string
}

type FilterType = 'most-active' | 'trending' | 'new' | 'followed'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOPICS: Topic[] = [
  { slug: 'typescript', name: 'TypeScript', emoji: '🔷', description: 'Typed superset of JavaScript', postsThisWeek: 1240, contributors: 8930, category: 'Languages', color: '#3178c6' },
  { slug: 'javascript', name: 'JavaScript', emoji: '🟡', description: 'The language of the web', postsThisWeek: 2180, contributors: 14200, category: 'Languages', color: '#f1e05a' },
  { slug: 'python', name: 'Python', emoji: '🐍', description: 'Versatile scripting and data language', postsThisWeek: 1870, contributors: 12600, category: 'Languages', color: '#3572A5' },
  { slug: 'go', name: 'Go', emoji: '🐹', description: 'Fast, statically typed compiled language', postsThisWeek: 640, contributors: 4210, category: 'Languages', color: '#00ADD8' },
  { slug: 'rust', name: 'Rust', emoji: '🦀', description: 'Systems programming without memory bugs', postsThisWeek: 580, contributors: 3870, category: 'Languages', color: '#dea584' },
  { slug: 'react', name: 'React', emoji: '⚛️', description: 'A JavaScript library for building UIs', postsThisWeek: 1560, contributors: 9840, category: 'Frontend', color: '#61dafb' },
  { slug: 'vue', name: 'Vue', emoji: '💚', description: 'Progressive JavaScript framework', postsThisWeek: 740, contributors: 5120, category: 'Frontend', color: '#42b883' },
  { slug: 'nodejs', name: 'Node.js', emoji: '🟢', description: 'Server-side JavaScript runtime', postsThisWeek: 980, contributors: 6730, category: 'Backend', color: '#68a063' },
  { slug: 'docker', name: 'Docker', emoji: '🐳', description: 'Container platform for apps', postsThisWeek: 820, contributors: 5940, category: 'DevOps', color: '#2496ED' },
  { slug: 'kubernetes', name: 'Kubernetes', emoji: '⎈', description: 'Container orchestration at scale', postsThisWeek: 510, contributors: 3620, category: 'DevOps', color: '#326CE5' },
  { slug: 'graphql', name: 'GraphQL', emoji: '🔗', description: 'Query language for your API', postsThisWeek: 430, contributors: 2980, category: 'Backend', color: '#E10098' },
  { slug: 'postgresql', name: 'PostgreSQL', emoji: '🐘', description: 'Advanced open-source relational database', postsThisWeek: 490, contributors: 3340, category: 'Databases', color: '#336791' },
  { slug: 'redis', name: 'Redis', emoji: '🔴', description: 'In-memory data structure store', postsThisWeek: 310, contributors: 2180, category: 'Databases', color: '#DC382D' },
  { slug: 'machine-learning', name: 'Machine Learning', emoji: '🤖', description: 'AI and ML algorithms and models', postsThisWeek: 1640, contributors: 10200, category: 'AI/ML', color: '#ff6f00' },
  { slug: 'web3', name: 'Web3', emoji: '🔗', description: 'Decentralized web and blockchain', postsThisWeek: 280, contributors: 1940, category: 'Blockchain', color: '#F7931A' },
  { slug: 'devops', name: 'DevOps', emoji: '🔧', description: 'Development and operations practices', postsThisWeek: 620, contributors: 4450, category: 'DevOps', color: '#FF6C37' },
  { slug: 'nextjs', name: 'Next.js', emoji: '▲', description: 'The React Framework for the web', postsThisWeek: 890, contributors: 6120, category: 'Frontend', color: '#ffffff' },
  { slug: 'swift', name: 'Swift', emoji: '🍎', description: 'Apple\'s programming language', postsThisWeek: 380, contributors: 2760, category: 'Languages', color: '#F05138' },
  { slug: 'kotlin', name: 'Kotlin', emoji: '🟣', description: 'Modern language for Android and JVM', postsThisWeek: 360, contributors: 2540, category: 'Languages', color: '#7F52FF' },
  { slug: 'aws', name: 'AWS', emoji: '☁️', description: 'Amazon Web Services cloud platform', postsThisWeek: 760, contributors: 5380, category: 'Cloud', color: '#FF9900' },
  { slug: 'terraform', name: 'Terraform', emoji: '🏗️', description: 'Infrastructure as code tool', postsThisWeek: 290, contributors: 2020, category: 'DevOps', color: '#7B42BC' },
  { slug: 'git', name: 'Git', emoji: '📦', description: 'Distributed version control system', postsThisWeek: 450, contributors: 3180, category: 'Tools', color: '#F1502F' },
  { slug: 'linux', name: 'Linux', emoji: '🐧', description: 'Open-source operating system kernel', postsThisWeek: 530, contributors: 3760, category: 'Systems', color: '#FCC624' },
  { slug: 'security', name: 'Security', emoji: '🛡️', description: 'Application and infrastructure security', postsThisWeek: 410, contributors: 2890, category: 'Security', color: '#00C853' },
  { slug: 'llm', name: 'LLM', emoji: '🧠', description: 'Large language models and AI', postsThisWeek: 1920, contributors: 11400, category: 'AI/ML', color: '#9C27B0' },
]

const FILTER_TABS: { label: string; value: FilterType }[] = [
  { label: 'Most Active', value: 'most-active' },
  { label: 'Trending', value: 'trending' },
  { label: 'New', value: 'new' },
  { label: 'Followed', value: 'followed' },
]

const CATEGORIES = ['All', 'Languages', 'Frontend', 'Backend', 'DevOps', 'AI/ML', 'Databases', 'Cloud', 'Tools', 'Systems', 'Security', 'Blockchain']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TopicsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  const [activeFilter, setActiveFilter] = useState<FilterType>('most-active')
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [followedTopics, setFollowedTopics] = useState<Set<string>>(new Set())
  const [loadingFollow, setLoadingFollow] = useState<Set<string>>(new Set())

  // ---------------------------------------------------------------------------
  // Load persisted followed topics from localStorage
  // ---------------------------------------------------------------------------

  useEffect(() => {
    try {
      const stored = localStorage.getItem('gitgram:followed-topics')
      if (stored) {
        const parsed: string[] = JSON.parse(stored)
        setFollowedTopics(new Set(parsed))
      }
    } catch {
      // silently ignore parse errors
    }
  }, [])

  const persistFollowed = useCallback((updated: Set<string>) => {
    try {
      localStorage.setItem('gitgram:followed-topics', JSON.stringify([...updated]))
    } catch {
      // silently ignore storage errors
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Follow / unfollow
  // ---------------------------------------------------------------------------

  const handleFollow = useCallback(
    (e: React.MouseEvent, slug: string) => {
      e.preventDefault()
      e.stopPropagation()

      if (!isAuthenticated) {
        router.push('/login')
        return
      }

      setLoadingFollow((prev) => new Set(prev).add(slug))

      // Optimistic update
      setFollowedTopics((prev) => {
        const next = new Set(prev)
        if (next.has(slug)) {
          next.delete(slug)
        } else {
          next.add(slug)
        }
        persistFollowed(next)
        return next
      })

      // Simulate API call — replace with real endpoint when available
      setTimeout(() => {
        setLoadingFollow((prev) => {
          const next = new Set(prev)
          next.delete(slug)
          return next
        })
      }, 400)
    },
    [isAuthenticated, router, persistFollowed]
  )

  // ---------------------------------------------------------------------------
  // Filtered + sorted topics
  // ---------------------------------------------------------------------------

  const filteredTopics = useMemo(() => {
    let list = [...TOPICS]

    // Category filter
    if (activeCategory !== 'All') {
      list = list.filter((t) => t.category === activeCategory)
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      )
    }

    // Sort
    switch (activeFilter) {
      case 'most-active':
        list.sort((a, b) => b.postsThisWeek - a.postsThisWeek)
        break
      case 'trending':
        list.sort((a, b) => b.contributors - a.contributors)
        break
      case 'new':
        // Reverse alphabetical as a stand-in for "newest" until API supports it
        list.sort((a, b) => b.slug.localeCompare(a.slug))
        break
      case 'followed':
        list = list.filter((t) => followedTopics.has(t.slug))
        break
    }

    return list
  }, [activeFilter, activeCategory, searchQuery, followedTopics])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">

        {/* ------------------------------------------------------------------ */}
        {/* Header */}
        {/* ------------------------------------------------------------------ */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-[var(--foreground)]">Topics</h1>
            <span className="text-sm text-[var(--foreground-secondary)]">
              {filteredTopics.length} topic{filteredTopics.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-[var(--foreground-secondary)] text-sm max-w-xl">
            Discover communities around the technologies you love. Follow topics to personalise your feed.
          </p>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Search */}
        {/* ------------------------------------------------------------------ */}
        <div className="relative mb-6">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-secondary)] pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search topics…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)] text-sm transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Filter tabs */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={cn(
                'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition',
                activeFilter === tab.value
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-secondary)] hover:border-[var(--primary)]/40 hover:text-[var(--foreground)]'
              )}
            >
              {tab.label}
              {tab.value === 'followed' && followedTopics.size > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/20 text-xs">
                  {followedTopics.size}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Category pills */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition',
                activeCategory === cat
                  ? 'bg-[var(--surface-secondary)] border-[var(--primary)]/60 text-[var(--primary)]'
                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-secondary)] hover:border-[var(--border)] hover:text-[var(--foreground)]'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Topics grid */}
        {/* ------------------------------------------------------------------ */}
        {filteredTopics.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">No topics found</h3>
            <p className="text-sm text-[var(--foreground-secondary)]">
              {activeFilter === 'followed'
                ? "You haven't followed any topics yet. Explore and follow topics to see them here."
                : 'Try adjusting your search or filter.'}
            </p>
            {activeFilter === 'followed' && (
              <button
                onClick={() => setActiveFilter('most-active')}
                className="mt-4 px-4 py-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] text-sm hover:bg-[var(--primary)]/20 transition"
              >
                Browse all topics
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTopics.map((topic) => {
              const isFollowed = followedTopics.has(topic.slug)
              const isLoadingThis = loadingFollow.has(topic.slug)

              return (
                <Link
                  key={topic.slug}
                  href={`/topics/${topic.slug}`}
                  className="group relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--primary)]/40 transition-all hover:shadow-lg hover:shadow-[var(--primary)]/5 flex flex-col gap-3"
                >
                  {/* Color accent bar */}
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl opacity-60 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: topic.color }}
                  />

                  {/* Topic icon + name */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl leading-none" role="img" aria-label={topic.name}>
                        {topic.emoji}
                      </span>
                      <div>
                        <h3 className="font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition text-sm leading-tight">
                          {topic.name}
                        </h3>
                        <span className="text-xs text-[var(--foreground-secondary)] mt-0.5 block">
                          {topic.category}
                        </span>
                      </div>
                    </div>

                    {/* Follow button */}
                    <button
                      onClick={(e) => handleFollow(e, topic.slug)}
                      disabled={isLoadingThis}
                      className={cn(
                        'flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium border transition',
                        isFollowed
                          ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/30'
                          : 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] border-[var(--border)] hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] hover:border-[var(--primary)]/30'
                      )}
                    >
                      {isLoadingThis ? (
                        <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      ) : isFollowed ? (
                        'Following'
                      ) : (
                        '+ Follow'
                      )}
                    </button>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[var(--foreground-secondary)] line-clamp-2 leading-relaxed">
                    {topic.description}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 pt-1 border-t border-[var(--border)]">
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">
                        {formatCount(topic.postsThisWeek)}
                      </p>
                      <p className="text-[10px] text-[var(--foreground-secondary)] uppercase tracking-wide">
                        posts/week
                      </p>
                    </div>
                    <div className="w-px h-6 bg-[var(--border)]" />
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">
                        {formatCount(topic.contributors)}
                      </p>
                      <p className="text-[10px] text-[var(--foreground-secondary)] uppercase tracking-wide">
                        contributors
                      </p>
                    </div>
                    <div className="ml-auto">
                      <svg
                        className="w-4 h-4 text-[var(--foreground-secondary)] group-hover:text-[var(--primary)] transition"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Footer CTA */}
        {/* ------------------------------------------------------------------ */}
        <div className="mt-12 text-center">
          <p className="text-sm text-[var(--foreground-secondary)] mb-4">
            Can&apos;t find your topic? Use hashtags in your posts to help others discover your work.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/create"
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition"
            >
              Create a post
            </Link>
            <Link
              href="/explore"
              className="px-4 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-secondary)] text-sm hover:border-[var(--primary)]/40 hover:text-[var(--foreground)] transition"
            >
              Explore repos
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
