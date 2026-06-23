'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import PostCard, { type Post } from '@/components/PostCard'
import { buildRepoPath } from '@/utils/repositoryRouting'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopicMeta {
  slug: string
  name: string
  emoji: string
  description: string
  postsThisWeek: number
  contributors: number
  category: string
  color: string
  followerCount: number
}

interface TopicRepo {
  id: string
  owner: string | { login: string; avatar_url?: string }
  name: string
  fullName?: string
  full_name?: string
  description?: string
  stars?: number
  stargazers_count?: number
  forks?: number
  forks_count?: number
  language?: string
  topics?: string[]
}

interface TopicSnippet {
  id: string
  title: string
  language: string
  code: string
  description?: string
  likesCount?: number
  user?: { username: string; avatar?: string }
  createdAt: string
}

type TabType = 'top' | 'latest' | 'snippets' | 'repos'

// ---------------------------------------------------------------------------
// Static topic catalogue — same set as topics/page.tsx
// ---------------------------------------------------------------------------

const TOPIC_CATALOGUE: TopicMeta[] = [
  { slug: 'typescript', name: 'TypeScript', emoji: '🔷', description: 'Typed superset of JavaScript that compiles to plain JS. The go-to choice for large-scale frontend and backend projects.', postsThisWeek: 1240, contributors: 8930, category: 'Languages', color: '#3178c6', followerCount: 42600 },
  { slug: 'javascript', name: 'JavaScript', emoji: '🟡', description: 'The language of the web. Powers everything from interactive UIs to server-side APIs and serverless functions.', postsThisWeek: 2180, contributors: 14200, category: 'Languages', color: '#f1e05a', followerCount: 98400 },
  { slug: 'python', name: 'Python', emoji: '🐍', description: 'Versatile language for web dev, data science, automation, and ML. Batteries included.', postsThisWeek: 1870, contributors: 12600, category: 'Languages', color: '#3572A5', followerCount: 74200 },
  { slug: 'go', name: 'Go', emoji: '🐹', description: 'Fast, statically typed language from Google. Ideal for microservices, CLIs, and high-throughput systems.', postsThisWeek: 640, contributors: 4210, category: 'Languages', color: '#00ADD8', followerCount: 19800 },
  { slug: 'rust', name: 'Rust', emoji: '🦀', description: 'Memory-safe systems language with zero-cost abstractions. The most loved language since 2016.', postsThisWeek: 580, contributors: 3870, category: 'Languages', color: '#dea584', followerCount: 17200 },
  { slug: 'react', name: 'React', emoji: '⚛️', description: 'Facebook\'s library for building declarative UIs. Powers millions of web and native apps worldwide.', postsThisWeek: 1560, contributors: 9840, category: 'Frontend', color: '#61dafb', followerCount: 58600 },
  { slug: 'vue', name: 'Vue', emoji: '💚', description: 'Progressive framework for building user interfaces. Easy to learn, highly approachable.', postsThisWeek: 740, contributors: 5120, category: 'Frontend', color: '#42b883', followerCount: 28400 },
  { slug: 'nodejs', name: 'Node.js', emoji: '🟢', description: 'Server-side JavaScript runtime built on V8. Enables full-stack JS development.', postsThisWeek: 980, contributors: 6730, category: 'Backend', color: '#68a063', followerCount: 38900 },
  { slug: 'docker', name: 'Docker', emoji: '🐳', description: 'Container platform that simplifies app deployment and ensures environment consistency.', postsThisWeek: 820, contributors: 5940, category: 'DevOps', color: '#2496ED', followerCount: 34500 },
  { slug: 'kubernetes', name: 'Kubernetes', emoji: '⎈', description: 'Open-source container orchestration system for automating deployment, scaling, and management.', postsThisWeek: 510, contributors: 3620, category: 'DevOps', color: '#326CE5', followerCount: 22100 },
  { slug: 'graphql', name: 'GraphQL', emoji: '🔗', description: 'Query language for APIs and a runtime for fulfilling those queries. Flexible, efficient, strongly typed.', postsThisWeek: 430, contributors: 2980, category: 'Backend', color: '#E10098', followerCount: 16800 },
  { slug: 'postgresql', name: 'PostgreSQL', emoji: '🐘', description: 'Advanced open-source relational database with a strong focus on reliability and extensibility.', postsThisWeek: 490, contributors: 3340, category: 'Databases', color: '#336791', followerCount: 18700 },
  { slug: 'redis', name: 'Redis', emoji: '🔴', description: 'In-memory data structure store used as a database, cache, message broker, and streaming engine.', postsThisWeek: 310, contributors: 2180, category: 'Databases', color: '#DC382D', followerCount: 13400 },
  { slug: 'machine-learning', name: 'Machine Learning', emoji: '🤖', description: 'Algorithms and models that enable computers to learn from data. The foundation of modern AI.', postsThisWeek: 1640, contributors: 10200, category: 'AI/ML', color: '#ff6f00', followerCount: 62800 },
  { slug: 'web3', name: 'Web3', emoji: '🔗', description: 'Decentralized web technologies including blockchains, smart contracts, and dApps.', postsThisWeek: 280, contributors: 1940, category: 'Blockchain', color: '#F7931A', followerCount: 11200 },
  { slug: 'devops', name: 'DevOps', emoji: '🔧', description: 'Culture and practices bridging software development and IT operations for faster delivery.', postsThisWeek: 620, contributors: 4450, category: 'DevOps', color: '#FF6C37', followerCount: 24600 },
  { slug: 'nextjs', name: 'Next.js', emoji: '▲', description: 'The React Framework providing hybrid SSR/SSG, file-based routing, and built-in optimisations.', postsThisWeek: 890, contributors: 6120, category: 'Frontend', color: '#ffffff', followerCount: 32400 },
  { slug: 'swift', name: 'Swift', emoji: '🍎', description: 'Apple\'s powerful, intuitive programming language for iOS, macOS, watchOS, and tvOS.', postsThisWeek: 380, contributors: 2760, category: 'Languages', color: '#F05138', followerCount: 14800 },
  { slug: 'kotlin', name: 'Kotlin', emoji: '🟣', description: 'Modern, concise, safe language for Android and JVM. 100% interoperable with Java.', postsThisWeek: 360, contributors: 2540, category: 'Languages', color: '#7F52FF', followerCount: 13600 },
  { slug: 'aws', name: 'AWS', emoji: '☁️', description: 'Amazon Web Services — the world\'s most comprehensive and broadly adopted cloud platform.', postsThisWeek: 760, contributors: 5380, category: 'Cloud', color: '#FF9900', followerCount: 41200 },
  { slug: 'llm', name: 'LLM', emoji: '🧠', description: 'Large language models: GPT, Claude, Gemini, and the techniques powering them.', postsThisWeek: 1920, contributors: 11400, category: 'AI/ML', color: '#9C27B0', followerCount: 71600 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function getRepoOwnerLogin(repo: TopicRepo): string {
  return typeof repo.owner === 'string' ? repo.owner : repo.owner?.login || ''
}

function getRepoFullName(repo: TopicRepo): string {
  return repo.fullName || repo.full_name || `${getRepoOwnerLogin(repo)}/${repo.name}`
}

function getRepoStars(repo: TopicRepo): number {
  return repo.stars ?? repo.stargazers_count ?? 0
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TopicSlugPage() {
  const params = useParams()
  const router = useRouter()
  const slug = typeof params.slug === 'string' ? params.slug : Array.isArray(params.slug) ? params.slug[0] : ''
  const { isAuthenticated } = useAuthStore()

  const topic = TOPIC_CATALOGUE.find((t) => t.slug === slug) ?? {
    slug,
    name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '),
    emoji: '#️⃣',
    description: `Posts and repositories tagged with #${slug}`,
    postsThisWeek: 0,
    contributors: 0,
    category: 'Topics',
    color: '#58a6ff',
    followerCount: 0,
  }

  const [activeTab, setActiveTab] = useState<TabType>('top')
  const [isFollowed, setIsFollowed] = useState(false)
  const [followerCount, setFollowerCount] = useState(topic.followerCount)
  const [followLoading, setFollowLoading] = useState(false)

  // Post feed state
  const [posts, setPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [postsPage, setPostsPage] = useState(0)
  const [hasMorePosts, setHasMorePosts] = useState(false)

  // Snippets state
  const [snippets, setSnippets] = useState<TopicSnippet[]>([])
  const [snippetsLoading, setSnippetsLoading] = useState(false)

  // Repos state
  const [repos, setRepos] = useState<TopicRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // ---------------------------------------------------------------------------
  // Persist follow state
  // ---------------------------------------------------------------------------

  useEffect(() => {
    try {
      const stored = localStorage.getItem('gitgram:followed-topics')
      if (stored) {
        const parsed: string[] = JSON.parse(stored)
        setIsFollowed(parsed.includes(slug))
      }
    } catch {
      // ignore
    }
  }, [slug])

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadPosts = useCallback(
    async (reset = false) => {
      if (postsLoading) return
      setPostsLoading(true)
      const offset = reset ? 0 : postsPage * 20
      try {
        const { data } = await api.get(`/posts/topic/${slug}`, {
          params: { limit: 20, offset, sort: activeTab === 'top' ? 'top' : 'latest' },
        })
        const items: Post[] = data.posts || data || []
        setPosts((prev) => (reset ? items : [...prev, ...items]))
        setHasMorePosts(items.length === 20)
      } catch {
        try {
          const { data } = await api.get(`/posts`, {
            params: { topic: slug, limit: 20, offset, sort: activeTab === 'top' ? 'top' : 'latest' },
          })
          const items: Post[] = data.posts || data || []
          setPosts((prev) => (reset ? items : [...prev, ...items]))
          setHasMorePosts(items.length === 20)
        } catch {
          if (reset) setPosts([])
        }
      } finally {
        setPostsLoading(false)
      }
    },
    [slug, activeTab, postsPage, postsLoading]
  )

  const loadSnippets = useCallback(async () => {
    setSnippetsLoading(true)
    try {
      const { data } = await api.get(`/snippets`, { params: { topic: slug, limit: 20 } })
      setSnippets(data.snippets || data || [])
    } catch {
      setSnippets([])
    } finally {
      setSnippetsLoading(false)
    }
  }, [slug])

  const loadRepos = useCallback(async () => {
    setReposLoading(true)
    try {
      const { data } = await api.get(`/repositories/trending`, {
        params: { topic: slug, limit: 20 },
      })
      setRepos(data.repositories || data || [])
    } catch {
      try {
        const { data } = await api.get(`/repositories`, { params: { topic: slug, limit: 20 } })
        setRepos(data.repositories || data || [])
      } catch {
        setRepos([])
      }
    } finally {
      setReposLoading(false)
    }
  }, [slug])

  // Initial + tab-change load
  useEffect(() => {
    setPosts([])
    setPostsPage(0)
    setHasMorePosts(false)
    if (activeTab === 'top' || activeTab === 'latest') {
      loadPosts(true)
    } else if (activeTab === 'snippets') {
      loadSnippets()
    } else if (activeTab === 'repos') {
      loadRepos()
    }
  }, [activeTab, slug])

  // Load more posts when page increments
  useEffect(() => {
    if (postsPage > 0) loadPosts(false)
  }, [postsPage])

  // Infinite scroll sentinel
  useEffect(() => {
    if (activeTab !== 'top' && activeTab !== 'latest') return
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMorePosts && !postsLoading) {
          setPostsPage((p) => p + 1)
        }
      },
      { rootMargin: '200px' }
    )
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current)
    return () => observerRef.current?.disconnect()
  }, [activeTab, hasMorePosts, postsLoading])

  // ---------------------------------------------------------------------------
  // Follow / unfollow
  // ---------------------------------------------------------------------------

  const handleFollow = useCallback(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    setFollowLoading(true)
    setIsFollowed((prev) => {
      const next = !prev
      setFollowerCount((c) => c + (next ? 1 : -1))
      try {
        const stored = localStorage.getItem('gitgram:followed-topics')
        const list: string[] = stored ? JSON.parse(stored) : []
        const updated = next ? [...list, slug] : list.filter((s) => s !== slug)
        localStorage.setItem('gitgram:followed-topics', JSON.stringify(updated))
      } catch {
        // ignore
      }
      return next
    })
    setTimeout(() => setFollowLoading(false), 400)
  }, [isAuthenticated, router, slug])

  // ---------------------------------------------------------------------------
  // Tabs definition
  // ---------------------------------------------------------------------------

  const TABS: { label: string; value: TabType }[] = [
    { label: 'Top Posts', value: 'top' },
    { label: 'Latest', value: 'latest' },
    { label: 'Snippets', value: 'snippets' },
    { label: 'Repos', value: 'repos' },
  ]

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderPostsFeed = () => {
    if (postsLoading && posts.length === 0) {
      return (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 animate-pulse">
              <div className="flex gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-[var(--surface-secondary)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[var(--surface-secondary)] rounded w-32" />
                  <div className="h-2.5 bg-[var(--surface-secondary)] rounded w-20" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-[var(--surface-secondary)] rounded w-full" />
                <div className="h-3 bg-[var(--surface-secondary)] rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (!postsLoading && posts.length === 0) {
      return (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">{topic.emoji}</div>
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">No posts yet</h3>
          <p className="text-sm text-[var(--foreground-secondary)]">
            Be the first to post about {topic.name}.
          </p>
          <Link
            href={`/create?topic=${slug}`}
            className="mt-4 inline-block px-4 py-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] text-sm hover:bg-[var(--primary)]/20 transition"
          >
            Create a post
          </Link>
        </div>
      )
    }

    return (
      <>
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
        <div ref={sentinelRef} className="h-4" />
        {postsLoading && posts.length > 0 && (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </>
    )
  }

  const renderSnippetsTab = () => {
    if (snippetsLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 animate-pulse">
              <div className="h-3 bg-[var(--surface-secondary)] rounded w-40 mb-3" />
              <div className="h-24 bg-[var(--surface-secondary)] rounded" />
            </div>
          ))}
        </div>
      )
    }

    if (snippets.length === 0) {
      return (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📝</div>
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">No snippets yet</h3>
          <p className="text-sm text-[var(--foreground-secondary)]">Share a code snippet tagged with {topic.name}.</p>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {snippets.map((snippet) => (
          <Link
            key={snippet.id}
            href={`/snippets/${snippet.id}`}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--primary)]/40 transition group"
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--surface-secondary)] border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                {snippet.user && (
                  <span className="text-xs text-[var(--foreground-secondary)]">{snippet.user.username}</span>
                )}
                <span className="text-xs text-[var(--foreground-secondary)]">/</span>
                <span className="text-xs font-medium text-[var(--foreground)] truncate max-w-[120px]">{snippet.title}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)]">
                {snippet.language}
              </span>
            </div>
            <pre className="p-4 text-xs text-[var(--foreground-secondary)] overflow-x-auto max-h-32 leading-relaxed font-mono">
              <code>{snippet.code}</code>
            </pre>
            <div className="px-4 py-2.5 border-t border-[var(--border)] flex items-center gap-3 text-xs text-[var(--foreground-secondary)]">
              <span>{snippet.likesCount ?? 0} likes</span>
            </div>
          </Link>
        ))}
      </div>
    )
  }

  const renderReposTab = () => {
    if (reposLoading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--surface-secondary)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[var(--surface-secondary)] rounded w-40" />
                  <div className="h-2.5 bg-[var(--surface-secondary)] rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (repos.length === 0) {
      return (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📦</div>
          <h3 className="text-base font-semibold text-[var(--foreground)] mb-1">No repositories found</h3>
          <p className="text-sm text-[var(--foreground-secondary)]">Repositories using {topic.name} will appear here.</p>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {repos.map((repo) => {
          const ownerLogin = getRepoOwnerLogin(repo)
          const fullName = getRepoFullName(repo)
          return (
            <Link
              key={repo.id || fullName}
              href={buildRepoPath(ownerLogin, repo.name)}
              className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--primary)]/40 transition group"
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex-shrink-0 flex items-center justify-center">
                <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition truncate text-sm">
                  {fullName}
                </h3>
                <p className="text-xs text-[var(--foreground-secondary)] line-clamp-1 mt-0.5">
                  {repo.description || 'No description'}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--foreground-secondary)]">
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {getRepoStars(repo).toLocaleString()}
                  </span>
                  {repo.language && (
                    <span>{repo.language}</span>
                  )}
                </div>
              </div>
              <svg className="w-4 h-4 text-[var(--foreground-secondary)] group-hover:text-[var(--primary)] transition flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )
        })}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6">

        {/* Back link */}
        <Link
          href="/topics"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] mb-6 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Topics
        </Link>

        {/* ------------------------------------------------------------------ */}
        {/* Topic header */}
        {/* ------------------------------------------------------------------ */}
        <div
          className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 mb-6 overflow-hidden"
        >
          {/* Color glow */}
          <div
            className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-10 pointer-events-none blur-2xl"
            style={{ backgroundColor: topic.color }}
          />

          <div className="flex items-start gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 border border-[var(--border)]"
              style={{ backgroundColor: `${topic.color}15` }}
            >
              {topic.emoji}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-[var(--foreground)]">{topic.name}</h1>
                  <span className="text-xs text-[var(--foreground-secondary)]">{topic.category}</span>
                </div>
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={cn(
                    'flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition',
                    isFollowed
                      ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-400/30'
                      : 'bg-[var(--primary)] text-white border-[var(--primary)] hover:opacity-90'
                  )}
                >
                  {followLoading ? (
                    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : isFollowed ? (
                    'Following'
                  ) : (
                    'Follow'
                  )}
                </button>
              </div>

              <p className="text-sm text-[var(--foreground-secondary)] mt-2 leading-relaxed">
                {topic.description}
              </p>

              <div className="flex items-center gap-5 mt-4 text-sm">
                <div>
                  <span className="font-bold text-[var(--foreground)]">{formatCount(followerCount)}</span>
                  <span className="text-[var(--foreground-secondary)] ml-1">followers</span>
                </div>
                <div>
                  <span className="font-bold text-[var(--foreground)]">{formatCount(topic.postsThisWeek)}</span>
                  <span className="text-[var(--foreground-secondary)] ml-1">posts this week</span>
                </div>
                <div>
                  <span className="font-bold text-[var(--foreground)]">{formatCount(topic.contributors)}</span>
                  <span className="text-[var(--foreground-secondary)] ml-1">contributors</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Tabs */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex gap-0.5 mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition',
                activeTab === tab.value
                  ? 'bg-[var(--surface-secondary)] text-[var(--foreground)] shadow-sm'
                  : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Tab content */}
        {/* ------------------------------------------------------------------ */}
        {(activeTab === 'top' || activeTab === 'latest') && renderPostsFeed()}
        {activeTab === 'snippets' && renderSnippetsTab()}
        {activeTab === 'repos' && renderReposTab()}
      </div>
    </div>
  )
}
