'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { userService } from '@/services/userService'
import { Skeleton, RepoCardSkeleton, UserCardSkeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrendingPost {
  id: string
  content?: string
  likesCount: number
  commentsCount: number
  createdAt: string
  user?: {
    id: string
    username: string
    avatar?: string
  }
  repository?: {
    id: string
    fullName: string
    language?: string
  }
}

interface RisingDeveloper {
  id: string
  username: string
  name?: string
  avatar?: string
  bio?: string
  verified?: boolean
  isFollowing?: boolean
  _count?: {
    followers: number
    following: number
    posts: number
  }
}

interface TrendingRepo {
  id: string
  owner: string
  name: string
  fullName: string
  description?: string
  stars: number
  forks: number
  language?: string
  topics?: string[]
  trendingRank?: number
}

interface ActivePost {
  id: string
  content?: string
  commentsCount: number
  likesCount: number
  createdAt: string
  user?: {
    id: string
    username: string
    avatar?: string
  }
  repository?: {
    id: string
    fullName: string
  }
}

interface NewDeveloper {
  id: string
  username: string
  name?: string
  avatar?: string
  bio?: string
  isFollowing?: boolean
  createdAt: string
  _count?: {
    followers: number
    posts: number
  }
}

// ---------------------------------------------------------------------------
// Language color map
// ---------------------------------------------------------------------------

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  Swift: '#F05138',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Shell: '#89e051',
  CSS: '#563d7c',
  HTML: '#e34c26',
}

const LANGUAGE_GRID: string[] = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Go',
  'Rust',
  'Kotlin',
  'Swift',
  'Java',
]

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchTrendingPosts(limit: number): Promise<TrendingPost[]> {
  const { data } = await api.get<TrendingPost[] | { posts?: TrendingPost[]; items?: TrendingPost[] }>(
    `/v1/trending/posts?limit=${limit}`
  )
  if (Array.isArray(data)) return data
  return (data as { posts?: TrendingPost[]; items?: TrendingPost[] }).posts
    ?? (data as { posts?: TrendingPost[]; items?: TrendingPost[] }).items
    ?? []
}

async function fetchRisingDevelopers(limit: number): Promise<RisingDeveloper[]> {
  const { data } = await api.get<RisingDeveloper[] | { users?: RisingDeveloper[]; creators?: RisingDeveloper[] }>(
    `/v1/trending/developers?limit=${limit}`
  )
  if (Array.isArray(data)) return data
  const cast = data as { users?: RisingDeveloper[]; creators?: RisingDeveloper[] }
  return cast.users ?? cast.creators ?? []
}

async function fetchTrendingRepos(limit: number): Promise<TrendingRepo[]> {
  const { data } = await api.get<TrendingRepo[] | { items?: TrendingRepo[]; repositories?: TrendingRepo[] }>(
    `/v1/repositories/trending?limit=${limit}`
  )
  if (Array.isArray(data)) return data
  const cast = data as { items?: TrendingRepo[]; repositories?: TrendingRepo[] }
  return cast.items ?? cast.repositories ?? []
}

async function fetchActiveDiscussions(limit: number): Promise<ActivePost[]> {
  const { data } = await api.get<ActivePost[] | { posts?: ActivePost[] }>(
    `/v1/posts?sort=comments&period=day&limit=${limit}`
  )
  if (Array.isArray(data)) return data
  return (data as { posts?: ActivePost[] }).posts ?? []
}

async function fetchNewDevelopers(limit: number): Promise<NewDeveloper[]> {
  const { data } = await api.get<NewDeveloper[] | { users?: NewDeveloper[] }>(
    `/v1/users?sort=newest&limit=${limit}`
  )
  if (Array.isArray(data)) return data
  return (data as { users?: NewDeveloper[] }).users ?? []
}

// ---------------------------------------------------------------------------
// Section header component
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  title: string
  icon?: string
  href?: string
  linkLabel?: string
}

function SectionHeader({ title, icon, href, linkLabel = 'See all' }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
        {icon && <span aria-hidden="true">{icon}</span>}
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-xs font-medium text-[var(--primary)] hover:underline"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trending Now section
// ---------------------------------------------------------------------------

function TrendingNowSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['discover-trending-posts'],
    queryFn: () => fetchTrendingPosts(3),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <section aria-labelledby="trending-now-heading">
      <SectionHeader
        title="Trending Now"
        icon="🔥"
        href="/trending"
      />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton variant="circular" className="w-8 h-8" />
                <Skeleton variant="text" className="w-28 h-3.5" />
              </div>
              <Skeleton variant="text" className="w-full h-3.5" />
              <Skeleton variant="text" className="w-3/4 h-3" />
              <Skeleton variant="text" className="w-24 h-3" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-[var(--foreground-secondary)] py-4">
          Could not load trending posts.
        </p>
      )}

      {!isLoading && !isError && data && (
        <div className="space-y-3">
          {data.map((post) => (
            <Link
              key={post.id}
              href={`/post/${post.id}`}
              className="flex flex-col gap-2 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--primary)]/30 transition group"
            >
              {post.user && (
                <div className="flex items-center gap-2">
                  {post.user.avatar ? (
                    <img
                      src={post.user.avatar}
                      alt={post.user.username}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-xs font-bold text-[var(--primary)]">
                      {post.user.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-[var(--foreground)] group-hover:text-[var(--primary)] transition">
                    {post.user.username}
                  </span>
                  {post.repository && (
                    <span className="text-xs text-[var(--foreground-secondary)] truncate">
                      · {post.repository.fullName}
                    </span>
                  )}
                </div>
              )}

              {post.content && (
                <p className="text-sm text-[var(--foreground-secondary)] line-clamp-2">
                  {post.content}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-[var(--foreground-secondary)]">
                <span className="flex items-center gap-1">
                  <span aria-hidden="true">🔥</span>
                  {post.likesCount.toLocaleString()} likes
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {post.commentsCount.toLocaleString()} comments
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!isLoading && !isError && data?.length === 0 && (
        <p className="text-sm text-[var(--foreground-secondary)] py-4">No trending posts right now.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Rising Developers section
// ---------------------------------------------------------------------------

function RisingDevelopersSection() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['discover-rising-developers'],
    queryFn: () => fetchRisingDevelopers(4),
    staleTime: 5 * 60 * 1000,
  })

  const followMutation = useMutation({
    mutationFn: (userId: string) => userService.follow(userId),
    onSuccess: (_result, userId) => {
      queryClient.setQueryData<RisingDeveloper[]>(['discover-rising-developers'], (prev) =>
        prev?.map((dev) =>
          dev.id === userId ? { ...dev, isFollowing: true } : dev
        ) ?? []
      )
    },
  })

  return (
    <section aria-labelledby="rising-developers-heading">
      <SectionHeader
        title="Rising Developers"
        icon="🚀"
        href="/discover/suggested"
      />

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <UserCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-[var(--foreground-secondary)] py-4">
          Could not load rising developers.
        </p>
      )}

      {!isLoading && !isError && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.map((dev) => (
            <div
              key={dev.id}
              className="flex items-center gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--primary)]/30 transition"
            >
              <Link href={`/profile/${dev.username}`} className="flex-shrink-0">
                {dev.avatar ? (
                  <img
                    src={dev.avatar}
                    alt={dev.username}
                    className="w-11 h-11 rounded-full object-cover ring-2 ring-[var(--border)]"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-sm font-bold text-[var(--primary)]">
                    {dev.username[0]?.toUpperCase()}
                  </div>
                )}
              </Link>

              <div className="flex-1 min-w-0">
                <Link
                  href={`/profile/${dev.username}`}
                  className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)] transition truncate block"
                >
                  {dev.name ?? dev.username}
                </Link>
                <p className="text-xs text-[var(--foreground-secondary)] truncate">
                  @{dev.username}
                  {dev._count !== undefined && (
                    <span className="ml-1">· {dev._count.followers.toLocaleString()} followers</span>
                  )}
                </p>
                {dev.bio && (
                  <p className="text-xs text-[var(--foreground-secondary)] truncate mt-0.5 italic">
                    {dev.bio}
                  </p>
                )}
              </div>

              <button
                onClick={() => followMutation.mutate(dev.id)}
                disabled={dev.isFollowing === true || followMutation.isPending}
                className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  dev.isFollowing
                    ? 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] cursor-default'
                    : 'bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20'
                }`}
              >
                {dev.isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Popular This Week (repos) section
// ---------------------------------------------------------------------------

function PopularReposSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['discover-popular-repos'],
    queryFn: () => fetchTrendingRepos(3),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <section aria-labelledby="popular-repos-heading">
      <SectionHeader
        title="Popular Repos This Week"
        icon="⭐"
        href="/discover/trending"
      />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <RepoCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-[var(--foreground-secondary)] py-4">
          Could not load popular repositories.
        </p>
      )}

      {!isLoading && !isError && data && (
        <div className="space-y-3">
          {data.map((repo) => (
            <Link
              key={repo.id}
              href={`/${repo.owner}/${repo.name}`}
              className="flex items-start gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--primary)]/30 transition group"
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition truncate">
                  {repo.fullName}
                </h3>
                <p className="text-xs text-[var(--foreground-secondary)] line-clamp-2 mt-0.5">
                  {repo.description ?? 'No description provided'}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-[var(--foreground-secondary)]">
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {repo.stars.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h.01M12 7h.01M16 7h.01M8 12h.01M12 12h.01M8 17h.01M12 17h.01M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
                    </svg>
                    {repo.forks.toLocaleString()}
                  </span>
                  {repo.language && (
                    <span className="flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: LANGUAGE_COLORS[repo.language] ?? '#6b7280' }}
                        aria-hidden="true"
                      />
                      {repo.language}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Active Discussions section
// ---------------------------------------------------------------------------

function ActiveDiscussionsSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['discover-active-discussions'],
    queryFn: () => fetchActiveDiscussions(3),
    staleTime: 3 * 60 * 1000,
  })

  return (
    <section aria-labelledby="active-discussions-heading">
      <SectionHeader
        title="Active Discussions"
        icon="💬"
        href="/trending"
        linkLabel="More"
      />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton variant="circular" className="w-7 h-7" />
                <Skeleton variant="text" className="w-28 h-3" />
              </div>
              <Skeleton variant="text" className="w-full h-3.5" />
              <Skeleton variant="text" className="w-20 h-3" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-[var(--foreground-secondary)] py-4">
          Could not load active discussions.
        </p>
      )}

      {!isLoading && !isError && data && (
        <div className="space-y-3">
          {data.map((post) => (
            <Link
              key={post.id}
              href={`/post/${post.id}`}
              className="flex flex-col gap-2 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--primary)]/30 transition group"
            >
              {post.user && (
                <div className="flex items-center gap-2">
                  {post.user.avatar ? (
                    <img
                      src={post.user.avatar}
                      alt={post.user.username}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-xs font-bold text-[var(--primary)]">
                      {post.user.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-[var(--foreground)] group-hover:text-[var(--primary)] transition">
                    {post.user.username}
                  </span>
                </div>
              )}

              {post.content && (
                <p className="text-sm text-[var(--foreground-secondary)] line-clamp-2">
                  {post.content}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-[var(--foreground-secondary)]">
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {post.commentsCount.toLocaleString()} comments
                </span>
                <span>{post.likesCount.toLocaleString()} likes</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// New to Gitgram section
// ---------------------------------------------------------------------------

function NewDevelopersSection() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['discover-new-developers'],
    queryFn: () => fetchNewDevelopers(6),
    staleTime: 10 * 60 * 1000,
  })

  const followMutation = useMutation({
    mutationFn: (userId: string) => userService.follow(userId),
    onSuccess: (_result, userId) => {
      queryClient.setQueryData<NewDeveloper[]>(['discover-new-developers'], (prev) =>
        prev?.map((dev) =>
          dev.id === userId ? { ...dev, isFollowing: true } : dev
        ) ?? []
      )
    },
  })

  return (
    <section aria-labelledby="new-developers-heading">
      <SectionHeader
        title="New to Gitgram"
        icon="👋"
        href="/discover/suggested"
        linkLabel="See more"
      />

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-center space-y-2">
              <Skeleton variant="circular" className="w-14 h-14 mx-auto" />
              <Skeleton variant="text" className="w-24 h-3.5 mx-auto" />
              <Skeleton variant="text" className="w-16 h-3 mx-auto" />
              <Skeleton className="w-full h-7 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-[var(--foreground-secondary)] py-4">
          Could not load new developers.
        </p>
      )}

      {!isLoading && !isError && data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.map((dev) => (
            <div
              key={dev.id}
              className="flex flex-col items-center gap-2 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--primary)]/30 transition text-center"
            >
              <Link href={`/profile/${dev.username}`}>
                {dev.avatar ? (
                  <img
                    src={dev.avatar}
                    alt={dev.username}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-[var(--border)] hover:ring-[var(--primary)]/50 transition"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-lg font-bold text-[var(--primary)]">
                    {dev.username[0]?.toUpperCase()}
                  </div>
                )}
              </Link>

              <div className="min-w-0 w-full">
                <Link
                  href={`/profile/${dev.username}`}
                  className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)] transition truncate block"
                >
                  {dev.name ?? dev.username}
                </Link>
                <p className="text-xs text-[var(--foreground-secondary)] truncate">
                  @{dev.username}
                </p>
              </div>

              <button
                onClick={() => followMutation.mutate(dev.id)}
                disabled={dev.isFollowing === true || followMutation.isPending}
                className={`w-full py-1.5 text-xs font-medium rounded-lg transition ${
                  dev.isFollowing
                    ? 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] cursor-default'
                    : 'bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20'
                }`}
              >
                {dev.isFollowing ? 'Following' : 'Welcome + Follow'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// By Language grid
// ---------------------------------------------------------------------------

function ByLanguageSection() {
  return (
    <section aria-labelledby="by-language-heading">
      <SectionHeader title="By Language" icon="🏷️" />

      <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-8 gap-2">
        {LANGUAGE_GRID.map((lang) => (
          <Link
            key={lang}
            href={`/topics/${lang.toLowerCase()}`}
            className="flex flex-col items-center gap-2 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--primary)]/40 transition group"
          >
            <span
              className="w-3.5 h-3.5 rounded-full"
              style={{ backgroundColor: LANGUAGE_COLORS[lang] ?? '#6b7280' }}
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-[var(--foreground-secondary)] group-hover:text-[var(--foreground)] transition text-center leading-tight">
              {lang}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Weekly Digest signup card
// ---------------------------------------------------------------------------

function WeeklyDigestCard() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    try {
      await api.post('/v1/newsletter/subscribe', { email })
      setSubmitted(true)
    } catch {
      // Show submitted state optimistically even on error — newsletter
      // subscriptions are best-effort from the UI perspective.
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-xl text-center">
        <span className="text-3xl" aria-hidden="true">✅</span>
        <p className="text-sm font-semibold text-[var(--foreground)]">You're subscribed!</p>
        <p className="text-xs text-[var(--foreground-secondary)]">
          You'll receive the Gitgram weekly digest every Monday.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gradient-to-br from-[var(--primary)]/10 to-[var(--surface)] border border-[var(--primary)]/20 rounded-xl">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">Weekly Digest</h3>
          <p className="text-xs text-[var(--foreground-secondary)] mb-3">
            Get the top repos, trending developers, and open source highlights delivered every Monday.
          </p>
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)] transition"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold bg-[var(--primary)] text-[var(--background)] rounded-lg hover:opacity-90 transition disabled:opacity-60 whitespace-nowrap"
            >
              {submitting ? 'Subscribing…' : 'Subscribe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DiscoverPage() {
  const router = useRouter()

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const input = form.elements.namedItem('q') as HTMLInputElement
    const value = input.value.trim()
    if (value) {
      router.push(`/search?q=${encodeURIComponent(value)}`)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-10">

        {/* ------------------------------------------------------------------ */}
        {/* Header + search                                                      */}
        {/* ------------------------------------------------------------------ */}
        <header>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Explore</h1>
          <p className="text-sm text-[var(--foreground-secondary)] mb-4">
            Discover trending repos, rising developers, and active discussions.
          </p>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-secondary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                name="q"
                type="search"
                placeholder="Search repositories, developers, topics…"
                className="w-full pl-9 pr-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)] transition"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-medium rounded-xl hover:bg-[var(--primary)]/20 transition"
            >
              Search
            </button>
          </form>
        </header>

        {/* ------------------------------------------------------------------ */}
        {/* Trending Now                                                         */}
        {/* ------------------------------------------------------------------ */}
        <TrendingNowSection />

        {/* ------------------------------------------------------------------ */}
        {/* Rising Developers                                                    */}
        {/* ------------------------------------------------------------------ */}
        <RisingDevelopersSection />

        {/* ------------------------------------------------------------------ */}
        {/* Popular This Week                                                    */}
        {/* ------------------------------------------------------------------ */}
        <PopularReposSection />

        {/* ------------------------------------------------------------------ */}
        {/* Active Discussions                                                   */}
        {/* ------------------------------------------------------------------ */}
        <ActiveDiscussionsSection />

        {/* ------------------------------------------------------------------ */}
        {/* New to Gitgram                                                       */}
        {/* ------------------------------------------------------------------ */}
        <NewDevelopersSection />

        {/* ------------------------------------------------------------------ */}
        {/* By Language                                                          */}
        {/* ------------------------------------------------------------------ */}
        <ByLanguageSection />

        {/* ------------------------------------------------------------------ */}
        {/* Weekly Digest                                                        */}
        {/* ------------------------------------------------------------------ */}
        <section aria-labelledby="weekly-digest-heading">
          <SectionHeader title="Weekly Digest" icon="📬" />
          <WeeklyDigestCard />
        </section>

      </div>
    </div>
  )
}
