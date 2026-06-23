'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { RepoCardSkeleton } from '@/components/ui/skeleton'
import api from '@/services/api'
import Link from 'next/link'
import { buildRepoPath } from '@/utils/repositoryRouting'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExploreRepo {
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
  avatar_url?: string
  trendingRank?: number
  trendingScore?: number
}

interface ExploreCreator {
  id: string
  username: string
  avatar?: string
  bio?: string
  verified?: boolean
  _count?: { followers: number; posts: number }
}

interface RecommendedPost {
  id: string
  content?: string
  mediaUrl?: string
  likesCount?: number
  commentsCount?: number
  user?: { id: string; username: string; avatar?: string }
  repository?: { id: string; fullName: string; language?: string }
  reason?: string
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { name: 'All', language: null, icon: 'M4 6h16M4 12h16M4 18h16' },
  { name: 'TypeScript', language: 'typescript', color: '#3178c6' },
  { name: 'JavaScript', language: 'javascript', color: '#f1e05a' },
  { name: 'Python', language: 'python', color: '#3572A5' },
  { name: 'Rust', language: 'rust', color: '#dea584' },
  { name: 'Go', language: 'go', color: '#00ADD8' },
  { name: 'Java', language: 'java', color: '#b07219' },
  { name: 'C++', language: 'c++', color: '#f34b7d' },
  { name: 'Swift', language: 'swift', color: '#F05138' },
]

const BROWSE_CATEGORIES = [
  { name: 'Web Development', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9', topic: 'web' },
  { name: 'Machine Learning', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', topic: 'machine-learning' },
  { name: 'DevOps & Cloud', icon: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z', topic: 'devops' },
  { name: 'Mobile Apps', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z', topic: 'mobile' },
  { name: 'Security', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', topic: 'security' },
  { name: 'Game Dev', icon: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z', topic: 'gamedev' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExplorePage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()

  const [activeCategory, setActiveCategory] = useState('All')
  const [trendingRepos, setTrendingRepos] = useState<ExploreRepo[]>([])
  const [featuredRepos, setFeaturedRepos] = useState<ExploreRepo[]>([])
  const [suggestedCreators, setSuggestedCreators] = useState<ExploreCreator[]>([])
  const [recommendedPosts, setRecommendedPosts] = useState<RecommendedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)

  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadTrending = useCallback(
    async (reset = false) => {
      if (reset) setLoading(true)
      else setLoadingMore(true)

      try {
        const category = CATEGORIES.find((c) => c.name === activeCategory)
        const languageParam = category?.language || undefined
        const offset = reset ? 0 : page * 20

        const url = languageParam
          ? `/repositories/trending?language=${languageParam}&limit=20&offset=${offset}`
          : `/repositories/trending?limit=20&offset=${offset}`

        const res = await api.get(url)
        const items = res.data.repositories || res.data || []

        if (reset) {
          setTrendingRepos(items)
        } else {
          setTrendingRepos((prev) => [...prev, ...items])
        }
        setHasMore(items.length === 20)
      } catch {
        // Try v1 trending endpoint
        try {
          const { data } = await api.get('/v1/trending/repos', {
            params: {
              tier: 'TRENDING_TODAY',
              language: CATEGORIES.find((c) => c.name === activeCategory)?.language,
              limit: 20,
              offset: reset ? 0 : page * 20,
            },
          })
          const items = data.repos || data.entries || []
          if (reset) {
            setTrendingRepos(items)
          } else {
            setTrendingRepos((prev) => [...prev, ...items])
          }
          setHasMore(data.hasMore ?? items.length === 20)
        } catch {
          if (reset) setTrendingRepos([])
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [activeCategory, page]
  )

  // Load featured repos (once)
  useEffect(() => {
    loadFeaturedAndSuggested()
  }, [])

  const loadFeaturedAndSuggested = async () => {
    // Featured repos
    try {
      const { data } = await api.get('/repositories/trending?limit=4')
      setFeaturedRepos(data.repositories || data || [])
    } catch {
      // silent
    }

    // Suggested creators
    try {
      const { data } = await api.get('/v1/trending/creators', {
        params: { tier: 'TRENDING_TODAY', limit: 10 },
      })
      setSuggestedCreators(data.creators || data.entries || [])
    } catch {
      try {
        const { data } = await api.get('/users/suggested?limit=10')
        setSuggestedCreators(data.users || data || [])
      } catch {
        // silent
      }
    }

    // Recommended posts
    try {
      const { data } = await api.get('/search/recommended', { params: { limit: 6 } })
      setRecommendedPosts(data.posts || data || [])
    } catch {
      try {
        const { data } = await api.get('/posts/explore', { params: { limit: 6 } })
        setRecommendedPosts(data.posts || data || [])
      } catch {
        // silent
      }
    }
  }

  // Reset on category change
  useEffect(() => {
    setPage(0)
    loadTrending(true)
  }, [activeCategory])

  // Load more
  useEffect(() => {
    if (page > 0) loadTrending(false)
  }, [page])

  // Infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setPage((p) => p + 1)
        }
      },
      { rootMargin: '200px' }
    )
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current)
    return () => observerRef.current?.disconnect()
  }, [hasMore, loading, loadingMore])

  // ---------------------------------------------------------------------------
  // Helper: normalize repo data
  // ---------------------------------------------------------------------------

  const getRepoOwner = (repo: ExploreRepo) =>
    typeof repo.owner === 'string' ? repo.owner : repo.owner?.login || ''
  const getRepoFullName = (repo: ExploreRepo) =>
    repo.fullName || repo.full_name || `${getRepoOwner(repo)}/${repo.name}`
  const getRepoStars = (repo: ExploreRepo) => repo.stars ?? repo.stargazers_count ?? 0
  const getRepoForks = (repo: ExploreRepo) => repo.forks ?? repo.forks_count ?? 0
  const getRepoAvatar = (repo: ExploreRepo) =>
    repo.avatar_url || (typeof repo.owner !== 'string' ? repo.owner?.avatar_url : undefined)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">Explore</h1>
          <Link
            href="/search"
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground-secondary hover:text-foreground hover:border-primary/30 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
          </Link>
        </div>

        {/* Featured Repositories Section */}
        {featuredRepos.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
              Featured Repositories
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {featuredRepos.slice(0, 4).map((repo) => {
                const ownerLogin = getRepoOwner(repo)
                const fullName = getRepoFullName(repo)
                const avatarUrl = getRepoAvatar(repo)
                return (
                <Link
                  key={repo.id || fullName}
                  href={buildRepoPath(ownerLogin, repo.name)}
                  className="relative bg-surface border border-border rounded-xl p-5 hover:border-primary/30 transition group overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/5 to-transparent rounded-bl-full" />
                    <div className="flex items-start gap-3">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={ownerLogin} className="w-12 h-12 rounded-xl" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                          <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground group-hover:text-primary transition truncate">
                          {fullName}
                        </h3>
                        <p className="text-sm text-foreground-secondary line-clamp-2 mt-1">
                          {repo.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-foreground-secondary">
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            {getRepoStars(repo).toLocaleString()}
                          </span>
                          {repo.language && (
                            <span className="flex items-center gap-1">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{
                                  backgroundColor:
                                    CATEGORIES.find((c) => c.language === repo.language?.toLowerCase())?.color ||
                                    '#6b7280',
                                }}
                              />
                              {repo.language}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* "Because you follow" / Suggested creators */}
        {suggestedCreators.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider">
                {user ? 'Suggested for You' : 'Popular Creators'}
              </h2>
              <Link href="/trending" className="text-xs text-primary hover:underline">
                See all
              </Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-none">
              {suggestedCreators.map((creator) => (
                <div
                  key={creator.id}
                  onClick={() => router.push(`/profile/${creator.username}`)}
                  className="flex-shrink-0 w-[150px] p-4 bg-surface border border-border rounded-xl hover:border-primary/30 cursor-pointer transition group text-center"
                >
                  {creator.avatar ? (
                    <img
                      src={creator.avatar}
                      alt={creator.username}
                      className="w-14 h-14 rounded-full object-cover mx-auto mb-2 ring-2 ring-primary/20 group-hover:ring-primary/50 transition"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2 text-lg font-bold text-primary">
                      {creator.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-semibold text-foreground truncate">{creator.username}</p>
                  <p className="text-xs text-foreground-secondary mt-0.5">
                    {creator._count?.followers ?? 0} followers
                  </p>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 w-full py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition"
                  >
                    Follow
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended posts */}
        {recommendedPosts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
              {user ? 'Recommended for You' : 'Popular Posts'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendedPosts.slice(0, 6).map((post) => (
                <div
                  key={post.id}
                  onClick={() => router.push(`/post/${post.id}`)}
                  className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 cursor-pointer transition"
                >
                  {post.reason && (
                    <p className="text-[11px] text-primary font-medium mb-2 truncate">
                      {post.reason}
                    </p>
                  )}
                  {post.user && (
                    <div className="flex items-center gap-2 mb-2">
                      {post.user.avatar ? (
                        <img src={post.user.avatar} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                          {post.user.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm font-medium text-foreground">{post.user.username}</span>
                    </div>
                  )}
                  {post.content && (
                    <p className="text-sm text-foreground-secondary line-clamp-2 mb-2">{post.content}</p>
                  )}
                  {post.mediaUrl && (
                    <div className="rounded-lg overflow-hidden mb-2 bg-surface-secondary aspect-video">
                      <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex gap-3 text-xs text-foreground-secondary">
                    <span>{post.likesCount ?? 0} likes</span>
                    <span>{post.commentsCount ?? 0} comments</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Browse by Category */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            Browse by Category
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {BROWSE_CATEGORIES.map((cat) => (
              <Link
                key={cat.topic}
                href={`/discover/trending?topic=${cat.topic}`}
                className="flex flex-col items-center gap-2 p-4 bg-surface border border-border rounded-xl hover:border-primary/30 transition group"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={cat.icon} />
                  </svg>
                </div>
                <span className="text-xs font-medium text-foreground text-center">{cat.name}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Language filter pills */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-3">
            Trending Repositories
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(cat.name)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition border',
                  activeCategory === cat.name
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface border-border text-foreground-secondary hover:border-primary/30'
                )}
              >
                {cat.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: cat.color }}
                  />
                )}
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Trending repos grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <RepoCardSkeleton key={i} />
            ))}
          </div>
        ) : trendingRepos.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">&#x1F50D;</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No repositories found</h3>
            <p className="text-sm text-foreground-secondary">
              Try a different category or check back later
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {trendingRepos.map((repo) => {
              const ownerLogin = getRepoOwner(repo)
              const fullName = getRepoFullName(repo)
              const avatarUrl = getRepoAvatar(repo)
              return (
                <Link
                  key={repo.id || fullName}
                  href={buildRepoPath(ownerLogin, repo.name)}
                  className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition group"
                >
                  <div className="flex items-start gap-3">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={ownerLogin} className="w-11 h-11 rounded-lg" />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground group-hover:text-primary transition truncate">
                        {fullName}
                      </h3>
                      <p className="text-sm text-foreground-secondary line-clamp-2 mt-0.5">
                        {repo.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-foreground-secondary">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {getRepoStars(repo).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                          {getRepoForks(repo).toLocaleString()}
                        </span>
                        {repo.language && (
                          <span className="flex items-center gap-1">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{
                                backgroundColor:
                                  CATEGORIES.find((c) => c.language === repo.language?.toLowerCase())?.color ||
                                  '#6b7280',
                              }}
                            />
                            {repo.language}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />

        {/* Loading more */}
        {loadingMore && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Quick links */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/trending"
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            View Trending
          </Link>
          <Link
            href="/search"
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg hover:border-primary/30 text-foreground-secondary hover:text-foreground transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search Repositories
          </Link>
          <Link
            href="/discover/suggested"
            className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg hover:border-primary/30 text-foreground-secondary hover:text-foreground transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Discover People
          </Link>
        </div>
      </div>
    </div>
  )
}
