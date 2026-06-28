'use client'

export const dynamic = 'force-dynamic'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  Suspense,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'
import { userService } from '@/services/userService'
import GitHubProfileCard from '@/components/GitHubProfileCard'
import RepositorySocialCard from '@/components/RepositorySocialCard'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SearchTab = 'all' | 'people' | 'repos' | 'posts' | 'snippets' | 'hashtags'

interface SearchUser {
  id: string
  login: string
  username?: string
  name?: string
  bio?: string
  avatarUrl?: string
  avatar?: string
  followers?: number
  following?: number
  publicRepos?: number
  company?: string
  location?: string
  websiteUrl?: string
  isFollowing?: boolean
}

interface SearchRepo {
  id: string
  owner: string
  name: string
  fullName: string
  description?: string
  stars: number
  forks: number
  language?: string
  topics?: string[]
  isFollowed?: boolean
  followersCount?: number
}

interface SearchPost {
  id: string
  content?: string
  mediaUrl?: string
  likesCount?: number
  commentsCount?: number
  _count?: { likes: number; comments: number }
  user?: { username: string; avatar?: string }
  createdAt?: string
}

interface SearchSnippet {
  id: string
  title: string
  language: string
  code: string
  author?: { username: string; avatar?: string }
  likesCount?: number
  createdAt?: string
}

interface SearchTag {
  id?: string
  name: string
  count?: number
  postCount?: number
}

interface SearchResults {
  users: SearchUser[]
  repos: SearchRepo[]
  posts: SearchPost[]
  snippets: SearchSnippet[]
  tags: SearchTag[]
}

interface TrendingItem {
  query: string
  count: number
}

interface PageState {
  users: number
  repos: number
  posts: number
  snippets: number
  tags: number
}

interface HasMoreState {
  users: boolean
  repos: boolean
  posts: boolean
  snippets: boolean
  tags: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_KEY = 'gitgram_recent_searches'
const MAX_RECENT = 10
const PAGE_SIZE = 20

const TABS: { key: SearchTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'people', label: 'People' },
  { key: 'repos', label: 'Repositories' },
  { key: 'posts', label: 'Posts' },
  { key: 'snippets', label: 'Snippets' },
  { key: 'hashtags', label: 'Hashtags' },
]

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f7df1e',
  python: '#3572a5',
  go: '#00acd7',
  rust: '#dea584',
  java: '#b07219',
  cpp: '#f34b7d',
  csharp: '#178600',
  ruby: '#701516',
  php: '#4f5d95',
  swift: '#f05138',
  kotlin: '#7f52ff',
  bash: '#89e051',
  css: '#563d7c',
  html: '#e34c26',
  sql: '#e38c00',
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(RECENT_KEY)
    return stored ? (JSON.parse(stored) as string[]) : []
  } catch {
    return []
  }
}

function addRecentSearch(query: string): void {
  if (typeof window === 'undefined' || !query.trim()) return
  const recent = getRecentSearches().filter((s) => s !== query)
  recent.unshift(query)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

function clearRecentSearches(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(RECENT_KEY)
}

// ---------------------------------------------------------------------------
// Normalise raw API data
// ---------------------------------------------------------------------------

function normaliseUsers(raw: unknown[]): SearchUser[] {
  return raw.map((u: unknown) => {
    const user = u as Record<string, unknown>
    return {
      id: String(user.id ?? user.login ?? user.username ?? ''),
      login: String(user.login ?? user.username ?? ''),
      username: user.username ? String(user.username) : undefined,
      name: user.name ? String(user.name) : undefined,
      bio: user.bio ? String(user.bio) : undefined,
      avatarUrl: (user.avatarUrl ?? user.avatar_url ?? user.avatar) as string | undefined,
      followers:
        typeof user.followers === 'number'
          ? user.followers
          : typeof user.followersCount === 'number'
            ? user.followersCount
            : 0,
      following:
        typeof user.following === 'number'
          ? user.following
          : typeof user.followingCount === 'number'
            ? user.followingCount
            : 0,
      publicRepos:
        typeof user.publicRepos === 'number'
          ? user.publicRepos
          : typeof user.public_repos === 'number'
            ? user.public_repos
            : 0,
      company: user.company ? String(user.company) : undefined,
      location: user.location ? String(user.location) : undefined,
      websiteUrl: (user.websiteUrl ?? user.website_url ?? user.blog) as string | undefined,
      isFollowing: Boolean(user.isFollowing ?? user.is_following),
    }
  })
}

function normaliseRepos(raw: unknown[]): SearchRepo[] {
  return raw.map((r: unknown) => {
    const repo = r as Record<string, unknown>
    const ownerObj = repo.owner as Record<string, unknown> | undefined
    const owner = ownerObj
      ? String(ownerObj.login ?? ownerObj.name ?? '')
      : String(repo.owner ?? '')
    const name = String(repo.name ?? '')
    return {
      id: String(repo.id ?? `${owner}/${name}`),
      owner,
      name,
      fullName: String(repo.fullName ?? repo.full_name ?? `${owner}/${name}`),
      description: repo.description ? String(repo.description) : undefined,
      stars:
        typeof repo.stars === 'number'
          ? repo.stars
          : typeof repo.stargazers_count === 'number'
            ? repo.stargazers_count
            : 0,
      forks:
        typeof repo.forks === 'number'
          ? repo.forks
          : typeof repo.forks_count === 'number'
            ? repo.forks_count
            : 0,
      language: repo.language ? String(repo.language) : undefined,
      topics: Array.isArray(repo.topics) ? (repo.topics as string[]) : [],
      isFollowed: Boolean(repo.isFollowed ?? repo.is_followed),
      followersCount:
        typeof repo.followersCount === 'number'
          ? repo.followersCount
          : typeof repo.followers_count === 'number'
            ? repo.followers_count
            : 0,
    }
  })
}

function normaliseTags(raw: unknown[]): SearchTag[] {
  return raw.map((t: unknown) => {
    const tag = t as Record<string, unknown>
    return {
      id: tag.id ? String(tag.id) : undefined,
      name: String(tag.name ?? tag.tag ?? ''),
      count: typeof tag.count === 'number' ? tag.count : undefined,
      postCount: typeof tag.postCount === 'number' ? tag.postCount : undefined,
    }
  })
}

function normaliseSnippets(raw: unknown[]): SearchSnippet[] {
  return raw.map((s: unknown) => {
    const snippet = s as Record<string, unknown>
    const authorRaw = snippet.author as Record<string, unknown> | undefined
    const userRaw = snippet.user as Record<string, unknown> | undefined
    const author = authorRaw ?? userRaw
    return {
      id: String(snippet.id ?? ''),
      title: String(snippet.title ?? snippet.description ?? 'Untitled'),
      language: String(snippet.language ?? 'text'),
      code: String(snippet.code ?? snippet.content ?? ''),
      author: author
        ? {
            username: String(author.username ?? author.login ?? ''),
            avatar: (author.avatar ?? author.avatarUrl) as string | undefined,
          }
        : undefined,
      likesCount: typeof snippet.likesCount === 'number' ? snippet.likesCount : 0,
      createdAt: snippet.createdAt ? String(snippet.createdAt) : undefined,
    }
  })
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function LanguageBadge({ language }: { language: string }) {
  const color = LANGUAGE_COLORS[language.toLowerCase()] ?? '#6e7681'
  const lightBgs = new Set(['#f7df1e', '#89e051'])
  const textColor = lightBgs.has(color) ? '#0F0F1A' : '#e6edf3'
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono"
      style={{ backgroundColor: color, color: textColor }}
    >
      {language}
    </span>
  )
}

function Avatar({
  src,
  username,
  size = 8,
}: {
  src?: string
  username: string
  size?: number
}) {
  const sizeClass = `w-${size} h-${size}`
  if (src) {
    return (
      <img
        src={src}
        alt={username}
        className={`${sizeClass} rounded-full object-cover`}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center text-xs font-bold`}
      style={{ background: 'linear-gradient(135deg,#7C3AED,#a855f7)', color: '#fff' }}
    >
      {username[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

// ---------------------------------------------------------------------------
// People card — compact, with follow button
// ---------------------------------------------------------------------------

function PeopleCard({ user }: { user: SearchUser }) {
  const [following, setFollowing] = useState(user.isFollowing ?? false)
  const [pending, setPending] = useState(false)
  const displayName = user.name ?? user.username ?? user.login
  const handle = user.username ?? user.login

  const toggleFollow = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (pending) return
    setPending(true)
    try {
      if (following) {
        await userService.unfollow(user.id)
      } else {
        await userService.follow(user.id)
      }
      setFollowing((prev) => !prev)
    } catch {
      // revert on error — state unchanged
    } finally {
      setPending(false)
    }
  }

  return (
    <Link
      href={`/${handle}`}
      className="flex items-center gap-3 p-4 rounded-xl border transition-colors"
      style={{
        background: '#1A1A2E',
        borderColor: 'rgba(124,58,237,0.15)',
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.45)')
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.15)')
      }
    >
      <Avatar src={user.avatarUrl ?? user.avatar} username={handle} size={10} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
        <p className="text-xs text-foreground-secondary truncate">@{handle}</p>
        {user.bio && (
          <p className="text-xs text-foreground-secondary line-clamp-1 mt-0.5">{user.bio}</p>
        )}
        {(user.followers ?? 0) > 0 && (
          <p className="text-xs mt-0.5" style={{ color: 'rgba(124,58,237,0.85)' }}>
            {(user.followers ?? 0).toLocaleString()} followers
          </p>
        )}
      </div>
      <button
        onClick={toggleFollow}
        disabled={pending}
        className={cn(
          'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
          following
            ? 'border border-[rgba(124,58,237,0.5)] text-foreground-secondary hover:border-red-400 hover:text-red-400'
            : 'text-white',
        )}
        style={
          following
            ? {}
            : { background: 'linear-gradient(135deg,#7C3AED,#a855f7)' }
        }
        aria-label={following ? `Unfollow ${handle}` : `Follow ${handle}`}
      >
        {pending ? '...' : following ? 'Following' : 'Follow'}
      </button>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Post card
// ---------------------------------------------------------------------------

function PostCard({ post }: { post: SearchPost }) {
  const router = useRouter()
  return (
    <article
      onClick={() => router.push(`/post/${post.id}`)}
      className="p-4 rounded-xl border cursor-pointer transition-colors"
      style={{ background: '#1A1A2E', borderColor: 'rgba(124,58,237,0.15)' }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)')
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.15)')
      }
    >
      {post.user && (
        <div className="flex items-center gap-2 mb-2">
          <Avatar
            src={post.user.avatar}
            username={post.user.username}
            size={6}
          />
          <span className="text-sm font-medium text-foreground">
            @{post.user.username}
          </span>
          {post.createdAt && (
            <span className="text-xs text-foreground-secondary ml-auto">
              {new Date(post.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
      {post.content && (
        <p className="text-sm text-foreground-secondary line-clamp-3 mb-2">{post.content}</p>
      )}
      {post.mediaUrl && (
        <div className="rounded-lg overflow-hidden mb-2">
          <img src={post.mediaUrl} alt="" className="w-full max-h-48 object-cover" />
        </div>
      )}
      <div className="flex gap-4 text-xs text-foreground-secondary">
        <span>{(post.likesCount ?? post._count?.likes ?? 0).toLocaleString()} likes</span>
        <span>
          {(post.commentsCount ?? post._count?.comments ?? 0).toLocaleString()} comments
        </span>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Snippet card — shows first 3 lines of code
// ---------------------------------------------------------------------------

function SnippetCard({ snippet }: { snippet: SearchSnippet }) {
  const router = useRouter()
  const previewLines = snippet.code.split('\n').slice(0, 3).join('\n')

  return (
    <article
      onClick={() => router.push(`/snippets/${snippet.id}`)}
      className="rounded-xl border overflow-hidden cursor-pointer transition-colors"
      style={{ background: '#1A1A2E', borderColor: 'rgba(124,58,237,0.15)' }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)')
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.15)')
      }
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(124,58,237,0.12)]">
        <span className="text-sm font-semibold text-foreground truncate max-w-[60%]">
          {snippet.title}
        </span>
        <LanguageBadge language={snippet.language} />
      </div>
      <pre
        className="px-4 py-3 text-xs font-mono overflow-hidden leading-5 select-none"
        style={{ color: '#8b949e', background: 'rgba(0,0,0,0.25)' }}
      >
        {previewLines}
        {snippet.code.split('\n').length > 3 && (
          <span style={{ color: 'rgba(124,58,237,0.6)' }}>{'\n...'}</span>
        )}
      </pre>
      {snippet.author && (
        <div className="flex items-center gap-2 px-4 py-2">
          <Avatar
            src={snippet.author.avatar}
            username={snippet.author.username}
            size={5}
          />
          <span className="text-xs text-foreground-secondary">
            @{snippet.author.username}
          </span>
          {(snippet.likesCount ?? 0) > 0 && (
            <span className="ml-auto text-xs text-foreground-secondary">
              {snippet.likesCount} likes
            </span>
          )}
        </div>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Hashtag chips
// ---------------------------------------------------------------------------

function HashtagChips({ tags }: { tags: SearchTag[] }) {
  const router = useRouter()
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <button
          key={tag.id ?? tag.name}
          onClick={() => router.push(`/hashtag/${tag.name}`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all"
          style={{
            background: 'rgba(124,58,237,0.12)',
            color: '#a78bfa',
            border: '1px solid rgba(124,58,237,0.3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(124,58,237,0.25)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(124,58,237,0.12)'
          }}
        >
          <span className="font-bold">#</span>
          {tag.name}
          {(tag.count ?? tag.postCount ?? 0) > 0 && (
            <span className="text-xs opacity-70">
              {(tag.count ?? tag.postCount ?? 0).toLocaleString()}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function PeopleSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border animate-pulse"
      style={{ background: '#1A1A2E', borderColor: 'rgba(124,58,237,0.1)' }}>
      <div className="w-10 h-10 rounded-full" style={{ background: '#2A2A3E' }} />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 rounded w-28" style={{ background: '#2A2A3E' }} />
        <div className="h-2.5 rounded w-20" style={{ background: '#2A2A3E' }} />
      </div>
      <div className="h-7 w-16 rounded-full" style={{ background: '#2A2A3E' }} />
    </div>
  )
}

function RepoSkeleton() {
  return (
    <div className="p-4 rounded-xl border animate-pulse"
      style={{ background: '#1A1A2E', borderColor: 'rgba(124,58,237,0.1)' }}>
      <div className="flex justify-between mb-2">
        <div className="h-3.5 rounded w-40" style={{ background: '#2A2A3E' }} />
        <div className="h-6 w-20 rounded-full" style={{ background: '#2A2A3E' }} />
      </div>
      <div className="h-2.5 rounded w-64 mb-3" style={{ background: '#2A2A3E' }} />
      <div className="flex gap-3">
        <div className="h-2.5 w-16 rounded" style={{ background: '#2A2A3E' }} />
        <div className="h-2.5 w-16 rounded" style={{ background: '#2A2A3E' }} />
      </div>
    </div>
  )
}

function PostSkeleton() {
  return (
    <div className="p-4 rounded-xl border animate-pulse"
      style={{ background: '#1A1A2E', borderColor: 'rgba(124,58,237,0.1)' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full" style={{ background: '#2A2A3E' }} />
        <div className="h-2.5 rounded w-24" style={{ background: '#2A2A3E' }} />
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 rounded w-full" style={{ background: '#2A2A3E' }} />
        <div className="h-2.5 rounded w-5/6" style={{ background: '#2A2A3E' }} />
        <div className="h-2.5 rounded w-3/4" style={{ background: '#2A2A3E' }} />
      </div>
    </div>
  )
}

function SnippetSkeleton() {
  return (
    <div className="rounded-xl border overflow-hidden animate-pulse"
      style={{ background: '#1A1A2E', borderColor: 'rgba(124,58,237,0.1)' }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(124,58,237,0.1)]">
        <div className="h-3 rounded w-36" style={{ background: '#2A2A3E' }} />
        <div className="h-5 w-20 rounded" style={{ background: '#2A2A3E' }} />
      </div>
      <div className="px-4 py-3 space-y-1.5" style={{ background: 'rgba(0,0,0,0.25)' }}>
        <div className="h-2.5 rounded w-full" style={{ background: '#2A2A3E' }} />
        <div className="h-2.5 rounded w-3/4" style={{ background: '#2A2A3E' }} />
        <div className="h-2.5 rounded w-1/2" style={{ background: '#2A2A3E' }} />
      </div>
    </div>
  )
}

function LoadingSkeletons({ tab }: { tab: SearchTab }) {
  if (tab === 'people') {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <PeopleSkeleton key={i} />)}
      </div>
    )
  }
  if (tab === 'repos') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <RepoSkeleton key={i} />)}
      </div>
    )
  }
  if (tab === 'posts') {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <PostSkeleton key={i} />)}
      </div>
    )
  }
  if (tab === 'snippets') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SnippetSkeleton key={i} />)}
      </div>
    )
  }
  if (tab === 'hashtags') {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-8 rounded-full animate-pulse"
            style={{ width: `${60 + (i * 17) % 60}px`, background: '#2A2A3E' }} />
        ))}
      </div>
    )
  }
  // all
  return (
    <div className="space-y-10">
      <div>
        <div className="h-4 rounded w-16 mb-3 animate-pulse" style={{ background: '#2A2A3E' }} />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <PeopleSkeleton key={i} />)}
        </div>
      </div>
      <div>
        <div className="h-4 rounded w-24 mb-3 animate-pulse" style={{ background: '#2A2A3E' }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <RepoSkeleton key={i} />)}
        </div>
      </div>
      <div>
        <div className="h-4 rounded w-16 mb-3 animate-pulse" style={{ background: '#2A2A3E' }} />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <PostSkeleton key={i} />)}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ type, query }: { type: string; query: string }) {
  return (
    <div className="text-center py-16">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ background: 'rgba(124,58,237,0.12)' }}
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#7C3AED">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No {type} found</h3>
      <p className="text-sm text-foreground-secondary">
        No results for &ldquo;{query}&rdquo;. Try a different term.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  count,
  showAllTab,
  onShowAll,
}: {
  title: string
  count: number
  showAllTab: SearchTab
  onShowAll: (tab: SearchTab) => void
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
        {title}
        {count > 0 && (
          <span className="ml-2 text-xs font-normal text-foreground-secondary normal-case">
            ({count})
          </span>
        )}
      </h2>
      {count > 0 && (
        <button
          onClick={() => onShowAll(showAllTab)}
          className="text-xs font-medium transition-colors"
          style={{ color: '#7C3AED' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#a855f7')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#7C3AED')}
        >
          Show all
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main inner component (needs useSearchParams — must be in Suspense)
// ---------------------------------------------------------------------------

function SearchPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const urlQuery = searchParams.get('q') ?? ''
  const urlTab = (searchParams.get('type') ?? 'all') as SearchTab

  const [inputValue, setInputValue] = useState(urlQuery)
  const [activeTab, setActiveTab] = useState<SearchTab>(urlTab)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasSearched, setHasSearched] = useState(Boolean(urlQuery))

  const [results, setResults] = useState<SearchResults>({
    users: [],
    repos: [],
    posts: [],
    snippets: [],
    tags: [],
  })

  const [pages, setPages] = useState<PageState>({
    users: 1, repos: 1, posts: 1, snippets: 1, tags: 1,
  })
  const [hasMore, setHasMore] = useState<HasMoreState>({
    users: false, repos: false, posts: false, snippets: false, tags: false,
  })

  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [trendingSearches, setTrendingSearches] = useState<TrendingItem[]>([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------------------------------
  // Auto-focus + Cmd/Ctrl+K global shortcut
  // ---------------------------------------------------------------------------

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape') {
        setShowDropdown(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // ---------------------------------------------------------------------------
  // Outside click closes dropdown
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ---------------------------------------------------------------------------
  // Load recent searches + trending on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setRecentSearches(getRecentSearches())
    loadTrending()
  }, [])

  const loadTrending = async () => {
    setTrendingLoading(true)
    try {
      const { data } = await api.get('/search/trending')
      const list: unknown[] = data.trending ?? data.searches ?? data ?? []
      const items = list
        .slice(0, 8)
        .map((item: unknown) => {
          const i = item as Record<string, unknown>
          return {
            query: String(i.query ?? i.name ?? i.term ?? item),
            count:
              typeof i.count === 'number'
                ? i.count
                : typeof i.searchCount === 'number'
                  ? i.searchCount
                  : 0,
          }
        })
        .filter((t) => t.query.trim().length > 0)
      // Only ever show real platform data — never fabricated terms.
      setTrendingSearches(items)
    } catch {
      setTrendingSearches([])
    } finally {
      setTrendingLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Sync URL -> state
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setInputValue(urlQuery)
    setActiveTab(urlTab)
    if (urlQuery) {
      setHasSearched(true)
      performSearch(urlQuery, urlTab, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery, urlTab])

  // ---------------------------------------------------------------------------
  // Suggestion fetch (debounced)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!inputValue.trim() || inputValue.length < 2) {
      setSuggestions([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/search', { params: { q: inputValue, limit: 5 } })
        const items: string[] = []
        if (Array.isArray(data.users)) {
          ;(data.users as Record<string, unknown>[])
            .slice(0, 2)
            .forEach((u) => items.push(`@${String(u.username ?? u.login ?? '')}`))
        }
        if (Array.isArray(data.repositories)) {
          ;(data.repositories as Record<string, unknown>[])
            .slice(0, 2)
            .forEach((r) =>
              items.push(String(r.fullName ?? r.full_name ?? r.name ?? '')),
            )
        }
        if (Array.isArray(data.hashtags)) {
          ;(data.hashtags as Record<string, unknown>[])
            .slice(0, 2)
            .forEach((h) => items.push(`#${String(h.name ?? '')}`))
        }
        setSuggestions(items.filter(Boolean).slice(0, 6))
      } catch {
        setSuggestions([])
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [inputValue])

  // ---------------------------------------------------------------------------
  // Debounced URL update as user types (300ms)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!inputValue.trim()) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      pushUrl(inputValue, activeTab)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue])

  // ---------------------------------------------------------------------------
  // IntersectionObserver for infinite scroll sentinel
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && !loading) {
          loadNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loadingMore, loading, hasMore, pages])

  // ---------------------------------------------------------------------------
  // URL helpers
  // ---------------------------------------------------------------------------

  const pushUrl = (q: string, tab: SearchTab) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (tab !== 'all') params.set('type', tab)
    router.replace(`/search?${params.toString()}`, { scroll: false })
  }

  // ---------------------------------------------------------------------------
  // Search execution
  // ---------------------------------------------------------------------------

  const performSearch = useCallback(
    async (q: string, tab: SearchTab, reset = true) => {
      if (!q.trim()) return
      if (reset) {
        setLoading(true)
        setHasSearched(true)
        setPages({ users: 1, repos: 1, posts: 1, snippets: 1, tags: 1 })
      } else {
        setLoadingMore(true)
      }

      try {
        const pageNum = reset ? 1 : (pages[tab === 'all' ? 'users' : (tab as keyof PageState)] ?? 1)
        const params: Record<string, string | number> = {
          q,
          limit: PAGE_SIZE,
          page: pageNum,
        }
        if (tab !== 'all') {
          const typeMap: Partial<Record<SearchTab, string>> = {
            people: 'users',
            repos: 'repositories',
            posts: 'posts',
            snippets: 'snippets',
            hashtags: 'tags',
          }
          params.type = typeMap[tab] ?? tab
        }

        let data: Record<string, unknown> = {}

        try {
          const res = await api.get('/search', { params })
          data = res.data
        } catch {
          // fallback: parallel targeted calls
          const [uRes, rRes, pRes, sRes, hRes] = await Promise.allSettled([
            api.get('/search/users', { params: { q, limit: PAGE_SIZE, page: pageNum } }).catch(() => ({ data: {} })),
            api.get('/search/repositories', { params: { q, limit: PAGE_SIZE, page: pageNum } }).catch(() => ({ data: {} })),
            api.get('/search/posts', { params: { q, limit: PAGE_SIZE, page: pageNum } }).catch(() => ({ data: {} })),
            api.get('/search/snippets', { params: { q, limit: PAGE_SIZE, page: pageNum } }).catch(() => ({ data: {} })),
            api.get('/search/hashtags', { params: { q, limit: PAGE_SIZE, page: pageNum } }).catch(() => ({ data: {} })),
          ])
          const pluck = (res: PromiseSettledResult<{ data: Record<string, unknown> }>, ...keys: string[]): unknown[] => {
            if (res.status !== 'fulfilled') return []
            const d = res.value.data
            for (const k of keys) if (Array.isArray(d[k])) return d[k] as unknown[]
            return Array.isArray(d) ? (d as unknown[]) : []
          }
          data = {
            users: pluck(uRes as PromiseSettledResult<{ data: Record<string, unknown> }>, 'users', 'people'),
            repositories: pluck(rRes as PromiseSettledResult<{ data: Record<string, unknown> }>, 'repositories', 'repos'),
            posts: pluck(pRes as PromiseSettledResult<{ data: Record<string, unknown> }>, 'posts'),
            snippets: pluck(sRes as PromiseSettledResult<{ data: Record<string, unknown> }>, 'snippets'),
            hashtags: pluck(hRes as PromiseSettledResult<{ data: Record<string, unknown> }>, 'hashtags', 'tags'),
          }
        }

        const rawUsers = normaliseUsers(
          Array.isArray(data.users) ? (data.users as unknown[]) : Array.isArray(data.people) ? (data.people as unknown[]) : [],
        )
        const rawRepos = normaliseRepos(
          Array.isArray(data.repos) ? (data.repos as unknown[]) : Array.isArray(data.repositories) ? (data.repositories as unknown[]) : [],
        )
        const rawPosts = Array.isArray(data.posts) ? (data.posts as SearchPost[]) : []
        const rawSnippets = normaliseSnippets(Array.isArray(data.snippets) ? (data.snippets as unknown[]) : [])
        const rawTags = normaliseTags(
          Array.isArray(data.tags) ? (data.tags as unknown[]) : Array.isArray(data.hashtags) ? (data.hashtags as unknown[]) : [],
        )

        if (reset) {
          setResults({ users: rawUsers, repos: rawRepos, posts: rawPosts, snippets: rawSnippets, tags: rawTags })
          setHasMore({
            users: rawUsers.length === PAGE_SIZE,
            repos: rawRepos.length === PAGE_SIZE,
            posts: rawPosts.length === PAGE_SIZE,
            snippets: rawSnippets.length === PAGE_SIZE,
            tags: rawTags.length === PAGE_SIZE,
          })
        } else {
          setResults((prev) => ({
            users: [...prev.users, ...rawUsers],
            repos: [...prev.repos, ...rawRepos],
            posts: [...prev.posts, ...rawPosts],
            snippets: [...prev.snippets, ...rawSnippets],
            tags: [...prev.tags, ...rawTags],
          }))
          setHasMore((prev) => ({
            ...prev,
            users: rawUsers.length === PAGE_SIZE,
            repos: rawRepos.length === PAGE_SIZE,
            posts: rawPosts.length === PAGE_SIZE,
            snippets: rawSnippets.length === PAGE_SIZE,
            tags: rawTags.length === PAGE_SIZE,
          }))
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages],
  )

  const loadNextPage = useCallback(() => {
    const tabKey = activeTab === 'all' ? 'users' : (activeTab as keyof HasMoreState)
    if (!hasMore[tabKey] || loadingMore || loading || !inputValue.trim()) return
    setPages((prev) => {
      const next = { ...prev, [tabKey]: prev[tabKey] + 1 }
      performSearch(inputValue, activeTab, false)
      return next
    })
  }, [activeTab, hasMore, loadingMore, loading, inputValue, performSearch])

  // ---------------------------------------------------------------------------
  // User interactions
  // ---------------------------------------------------------------------------

  const handleSearch = (q: string, tab?: SearchTab) => {
    const resolvedTab = tab ?? activeTab
    if (!q.trim()) return
    addRecentSearch(q)
    setRecentSearches(getRecentSearches())
    setInputValue(q)
    setShowDropdown(false)
    pushUrl(q, resolvedTab)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch(inputValue)
  }

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab)
    if (inputValue.trim()) pushUrl(inputValue, tab)
  }

  const removeRecent = (s: string) => {
    const updated = recentSearches.filter((r) => r !== s)
    setRecentSearches(updated)
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
  }

  const showAllTab = (tab: SearchTab) => {
    setActiveTab(tab)
    if (inputValue.trim()) pushUrl(inputValue, tab)
  }

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const totalCount =
    results.users.length +
    results.repos.length +
    results.posts.length +
    results.snippets.length +
    results.tags.length

  const tabHasMore =
    activeTab === 'all'
      ? false
      : hasMore[activeTab === 'people' ? 'users' : activeTab === 'hashtags' ? 'tags' : (activeTab as keyof HasMoreState)]

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen" style={{ background: '#0F0F1A' }}>
      <div className="max-w-4xl mx-auto py-8 px-4">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-1">Search</h1>
          <p className="text-sm text-foreground-secondary">
            Find people, repos, posts, snippets, and hashtags
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSubmit} className="relative mb-8">
          <div className="relative flex gap-2 items-center">
            <div className="relative flex-1">
              {/* Search icon */}
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 pointer-events-none"
                style={{ color: '#7C3AED' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                width={18}
                height={18}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>

              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value)
                  setShowDropdown(true)
                  if (!e.target.value.trim()) setHasSearched(false)
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search everything... (⌘K)"
                autoComplete="off"
                className="w-full pl-11 pr-20 py-3.5 rounded-xl text-sm text-foreground placeholder:text-foreground-secondary focus:outline-none transition-all"
                style={{
                  background: '#1A1A2E',
                  border: '1px solid rgba(124,58,237,0.3)',
                  boxShadow: '0 0 0 0 rgba(124,58,237,0)',
                }}
                onFocusCapture={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(124,58,237,0.7)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)'
                }}
                onBlurCapture={(e) => {
                  e.currentTarget.style.border = '1px solid rgba(124,58,237,0.3)'
                  e.currentTarget.style.boxShadow = '0 0 0 0 rgba(124,58,237,0)'
                }}
              />

              {/* Kbd hint */}
              {!inputValue && (
                <kbd
                  className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs"
                  style={{
                    background: 'rgba(124,58,237,0.1)',
                    color: '#7C3AED',
                    border: '1px solid rgba(124,58,237,0.25)',
                    fontFamily: 'inherit',
                  }}
                >
                  ⌘K
                </kbd>
              )}

              {/* Clear button */}
              {inputValue && (
                <button
                  type="button"
                  onClick={() => {
                    setInputValue('')
                    setHasSearched(false)
                    setSuggestions([])
                    inputRef.current?.focus()
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center transition"
                  style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa' }}
                  aria-label="Clear"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="shrink-0 px-5 py-3.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#a855f7)' }}
            >
              Search
            </button>
          </div>

          {/* Dropdown: recent + suggestions */}
          {showDropdown &&
            (suggestions.length > 0 || (!inputValue && recentSearches.length > 0)) && (
              <div
                ref={dropdownRef}
                className="absolute z-40 left-0 right-20 mt-1.5 rounded-xl overflow-hidden shadow-2xl"
                style={{ background: '#1A1A2E', border: '1px solid rgba(124,58,237,0.3)' }}
              >
                {!inputValue && recentSearches.length > 0 && (
                  <>
                    <div
                      className="flex items-center justify-between px-4 py-2"
                      style={{ background: 'rgba(0,0,0,0.25)' }}
                    >
                      <span className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider">
                        Recent
                      </span>
                      <button
                        type="button"
                        onClick={() => { clearRecentSearches(); setRecentSearches([]) }}
                        className="text-xs transition-colors"
                        style={{ color: '#7C3AED' }}
                      >
                        Clear all
                      </button>
                    </div>
                    {recentSearches.slice(0, 6).map((s) => (
                      <div
                        key={s}
                        className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer group transition-colors"
                        style={{ borderBottom: '1px solid rgba(124,58,237,0.08)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(124,58,237,0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <svg className="w-3.5 h-3.5 text-foreground-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span
                          onClick={() => handleSearch(s)}
                          className="flex-1 text-sm text-foreground"
                        >
                          {s}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeRecent(s) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-foreground-secondary hover:text-foreground"
                          aria-label={`Remove ${s}`}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </>
                )}
                {suggestions.length > 0 && (
                  <>
                    {inputValue && (
                      <div
                        className="px-4 py-2"
                        style={{ background: 'rgba(0,0,0,0.25)' }}
                      >
                        <span className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider">
                          Suggestions
                        </span>
                      </div>
                    )}
                    {suggestions.map((s) => (
                      <div
                        key={s}
                        onClick={() => handleSearch(s)}
                        className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors"
                        style={{ borderBottom: '1px solid rgba(124,58,237,0.08)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(124,58,237,0.08)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#7C3AED">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span className="text-sm text-foreground">{s}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
        </form>

        {/* Pre-search: trending + recent + quick links */}
        {!hasSearched && !loading && (
          <div className="space-y-10">
            {trendingLoading ? (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#7C3AED">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider">
                    Trending Searches
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3.5 rounded-xl animate-pulse"
                      style={{ background: '#1A1A2E', border: '1px solid rgba(124,58,237,0.15)' }}
                    >
                      <div className="w-8 h-8 rounded-lg" style={{ background: '#2A2A3E' }} />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 rounded w-32" style={{ background: '#2A2A3E' }} />
                        <div className="h-2.5 rounded w-20" style={{ background: '#2A2A3E' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : trendingSearches.length > 0 ? (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#7C3AED">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider">
                    Trending Searches
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {trendingSearches.map((ts, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSearch(ts.query)}
                      className="flex items-center gap-3 p-3.5 rounded-xl text-left group transition-all"
                      style={{ background: '#1A1A2E', border: '1px solid rgba(124,58,237,0.15)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.45)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.15)')}
                    >
                      <span
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                        style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {ts.query}
                        </p>
                        {ts.count > 0 && (
                          <p className="text-xs text-foreground-secondary">
                            {ts.count.toLocaleString()} searches
                          </p>
                        )}
                      </div>
                      <svg
                        className="w-4 h-4 text-foreground-secondary shrink-0 transition-colors group-hover:text-purple-400"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {recentSearches.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider">
                    Recent Searches
                  </h2>
                  <button
                    type="button"
                    onClick={() => { clearRecentSearches(); setRecentSearches([]) }}
                    className="text-xs transition-colors"
                    style={{ color: '#7C3AED' }}
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSearch(s)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-foreground transition-all group"
                      style={{ background: '#1A1A2E', border: '1px solid rgba(124,58,237,0.2)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.2)')}
                    >
                      <svg className="w-3.5 h-3.5 text-foreground-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {s}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); removeRecent(s) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); removeRecent(s) } }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-foreground-secondary hover:text-red-400"
                        aria-label={`Remove ${s}`}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-sm font-semibold text-foreground-secondary uppercase tracking-wider mb-4">
                Discover
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Trending', href: '/trending', d: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
                  { label: 'Explore', href: '/explore', d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
                  { label: 'Discover', href: '/discover/suggested', d: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
                  { label: 'Topics', href: '/discover/hashtags', d: 'M7 20l4-16m2 16l4-16M6 9h14M4 15h14' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl transition-all group"
                    style={{ background: '#1A1A2E', border: '1px solid rgba(124,58,237,0.15)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.45)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.15)')}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                      style={{ background: 'rgba(124,58,237,0.15)' }}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#7C3AED">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={link.d} />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-foreground">{link.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Search results */}
        {hasSearched && (
          <>
            {/* Tab bar */}
            <div
              className="flex gap-1 p-1 rounded-xl mb-6 overflow-x-auto"
              style={{ background: '#1A1A2E' }}
            >
              {TABS.map((tab) => {
                const countMap: Record<SearchTab, number> = {
                  all: totalCount,
                  people: results.users.length,
                  repos: results.repos.length,
                  posts: results.posts.length,
                  snippets: results.snippets.length,
                  hashtags: results.tags.length,
                }
                const count = countMap[tab.key]
                const isActive = activeTab === tab.key

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
                    style={
                      isActive
                        ? { background: 'linear-gradient(135deg,#7C3AED,#a855f7)', color: '#fff' }
                        : { color: '#8b949e' }
                    }
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.color = '#e6edf3'
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.color = '#8b949e'
                    }}
                  >
                    {tab.label}
                    {!loading && count > 0 && (
                      <span className="ml-1 opacity-70">({count})</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Loading */}
            {loading && <LoadingSkeletons tab={activeTab} />}

            {/* ALL tab */}
            {!loading && activeTab === 'all' && (
              <div className="space-y-10">
                {/* People */}
                <section>
                  <SectionHeader
                    title="People"
                    count={results.users.length}
                    showAllTab="people"
                    onShowAll={showAllTab}
                  />
                  {results.users.length === 0 ? (
                    <p className="text-sm text-foreground-secondary">No people found.</p>
                  ) : (
                    <div className="space-y-3">
                      {results.users.slice(0, 5).map((u) => (
                        <PeopleCard key={u.id} user={u} />
                      ))}
                    </div>
                  )}
                </section>

                {/* Repos */}
                <section>
                  <SectionHeader
                    title="Repositories"
                    count={results.repos.length}
                    showAllTab="repos"
                    onShowAll={showAllTab}
                  />
                  {results.repos.length === 0 ? (
                    <p className="text-sm text-foreground-secondary">No repositories found.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {results.repos.slice(0, 4).map((repo) => (
                        <RepositorySocialCard
                          key={repo.id}
                          id={repo.id}
                          owner={repo.owner}
                          name={repo.name}
                          fullName={repo.fullName}
                          description={repo.description}
                          stars={repo.stars}
                          forks={repo.forks}
                          language={repo.language}
                          topics={repo.topics}
                          isFollowed={repo.isFollowed}
                          followersCount={repo.followersCount}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* Posts */}
                <section>
                  <SectionHeader
                    title="Posts"
                    count={results.posts.length}
                    showAllTab="posts"
                    onShowAll={showAllTab}
                  />
                  {results.posts.length === 0 ? (
                    <p className="text-sm text-foreground-secondary">No posts found.</p>
                  ) : (
                    <div className="space-y-3">
                      {results.posts.slice(0, 3).map((post) => (
                        <PostCard key={post.id} post={post} />
                      ))}
                    </div>
                  )}
                </section>

                {/* Snippets */}
                {results.snippets.length > 0 && (
                  <section>
                    <SectionHeader
                      title="Snippets"
                      count={results.snippets.length}
                      showAllTab="snippets"
                      onShowAll={showAllTab}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {results.snippets.slice(0, 2).map((s) => (
                        <SnippetCard key={s.id} snippet={s} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Hashtags */}
                <section>
                  <SectionHeader
                    title="Hashtags"
                    count={results.tags.length}
                    showAllTab="hashtags"
                    onShowAll={showAllTab}
                  />
                  {results.tags.length === 0 ? (
                    <p className="text-sm text-foreground-secondary">No hashtags found.</p>
                  ) : (
                    <HashtagChips tags={results.tags} />
                  )}
                </section>

                {totalCount === 0 && <EmptyState type="results" query={inputValue} />}
              </div>
            )}

            {/* PEOPLE tab */}
            {!loading && activeTab === 'people' && (
              <div>
                {results.users.length === 0 ? (
                  <EmptyState type="people" query={inputValue} />
                ) : (
                  <div className="space-y-3">
                    {results.users.map((u) => (
                      <PeopleCard key={u.id} user={u} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* REPOS tab */}
            {!loading && activeTab === 'repos' && (
              <div>
                {results.repos.length === 0 ? (
                  <EmptyState type="repositories" query={inputValue} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {results.repos.map((repo) => (
                      <RepositorySocialCard
                        key={repo.id}
                        id={repo.id}
                        owner={repo.owner}
                        name={repo.name}
                        fullName={repo.fullName}
                        description={repo.description}
                        stars={repo.stars}
                        forks={repo.forks}
                        language={repo.language}
                        topics={repo.topics}
                        isFollowed={repo.isFollowed}
                        followersCount={repo.followersCount}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* POSTS tab */}
            {!loading && activeTab === 'posts' && (
              <div>
                {results.posts.length === 0 ? (
                  <EmptyState type="posts" query={inputValue} />
                ) : (
                  <div className="space-y-3">
                    {results.posts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SNIPPETS tab */}
            {!loading && activeTab === 'snippets' && (
              <div>
                {results.snippets.length === 0 ? (
                  <EmptyState type="snippets" query={inputValue} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {results.snippets.map((s) => (
                      <SnippetCard key={s.id} snippet={s} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* HASHTAGS tab */}
            {!loading && activeTab === 'hashtags' && (
              <div>
                {results.tags.length === 0 ? (
                  <EmptyState type="hashtags" query={inputValue} />
                ) : (
                  <HashtagChips tags={results.tags} />
                )}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {tabHasMore && (
              <div ref={sentinelRef} className="h-px mt-8" aria-hidden />
            )}

            {/* Loading more indicator */}
            {loadingMore && (
              <div className="flex justify-center py-6">
                <div
                  className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: 'rgba(124,58,237,0.4)', borderTopColor: '#7C3AED' }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page export — Suspense boundary required for useSearchParams
// ---------------------------------------------------------------------------

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen" style={{ background: '#0F0F1A' }}>
          <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="h-8 w-24 rounded mb-8 animate-pulse" style={{ background: '#1A1A2E' }} />
            <div className="h-14 rounded-xl animate-pulse mb-8" style={{ background: '#1A1A2E' }} />
            <LoadingSkeletons tab="all" />
          </div>
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  )
}
