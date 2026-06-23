'use client'

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

type SortOption = 'newest' | 'most_stars' | 'most_active'

interface ForkOwner {
  login: string
  avatarUrl: string | null
}

interface Fork {
  id: string
  name: string
  fullName: string
  description: string | null
  owner: ForkOwner
  stargazersCount: number
  forksCount: number
  language: string | null
  pushedAt: string | null
  createdAt: string
  htmlUrl: string
}

interface ForksApiResponse {
  data: {
    forks: Fork[]
    totalCount: number
    page: number
    pageSize: number
    hasMore: boolean
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Most recently forked' },
  { value: 'most_stars', label: 'Most stars' },
  { value: 'most_active', label: 'Most active' },
]

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#4F5D95',
  'C#': '#178600',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Dart: '#00B4AB',
  Scala: '#c22d40',
  Elixir: '#6e4a7e',
  Haskell: '#5e5086',
}

function getLanguageColor(language: string): string {
  return LANGUAGE_COLORS[language] ?? '#8b949e'
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 11.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
    </svg>
  )
}

function ForkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z" />
    </svg>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ForkCardSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-[var(--surface-secondary)] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[var(--surface-secondary)] rounded w-1/3" />
          <div className="h-3 bg-[var(--surface-secondary)] rounded w-3/4" />
        </div>
      </div>
      <div className="flex gap-4 mt-3">
        <div className="h-3 bg-[var(--surface-secondary)] rounded w-12" />
        <div className="h-3 bg-[var(--surface-secondary)] rounded w-12" />
        <div className="h-3 bg-[var(--surface-secondary)] rounded w-20" />
      </div>
    </div>
  )
}

interface ForkCardProps {
  fork: Fork
}

function ForkCard({ fork }: ForkCardProps) {
  const lastActivity = fork.pushedAt ?? fork.createdAt

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--primary)] transition-colors duration-150">
      {/* Header: avatar + username */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/${fork.owner.login}`}
            className="shrink-0"
            aria-label={`${fork.owner.login}'s profile`}
          >
            {fork.owner.avatarUrl ? (
              <Image
                src={fork.owner.avatarUrl}
                alt={fork.owner.login}
                width={40}
                height={40}
                className="rounded-full border border-[var(--border)] hover:opacity-80 transition-opacity"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-secondary)] text-sm font-medium">
                {fork.owner.login.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
          <div className="min-w-0">
            <Link
              href={`/${fork.owner.login}/${fork.name}`}
              className="text-[var(--primary)] font-semibold text-sm hover:underline truncate block"
            >
              {fork.owner.login}
              <span className="text-[var(--foreground-secondary)] font-normal">/{fork.name}</span>
            </Link>
            {fork.description && (
              <p className="text-[var(--foreground-secondary)] text-xs mt-0.5 line-clamp-2 leading-relaxed">
                {fork.description}
              </p>
            )}
          </div>
        </div>

        {/* Visit Fork button */}
        <Link
          href={`/${fork.owner.login}/${fork.name}`}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--foreground)] hover:bg-[var(--border)] hover:border-[var(--primary)] transition-colors duration-150"
        >
          Visit Fork
        </Link>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--foreground-secondary)]">
        {/* Stars */}
        <span className="flex items-center gap-1">
          <StarIcon />
          {formatCount(fork.stargazersCount)}
        </span>

        {/* Forks */}
        <span className="flex items-center gap-1">
          <ForkIcon />
          {formatCount(fork.forksCount)}
        </span>

        {/* Language */}
        {fork.language && (
          <span className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: getLanguageColor(fork.language) }}
              aria-hidden="true"
            />
            {fork.language}
          </span>
        )}

        {/* Last push */}
        <span className="flex items-center gap-1 ml-auto">
          <ClockIcon />
          {timeAgo(lastActivity)}
        </span>
      </div>
    </div>
  )
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center mb-4">
        <ForkIcon />
      </div>
      <h3 className="text-[var(--foreground)] font-semibold text-lg mb-2">
        {search ? 'No forks match your search' : 'No forks yet'}
      </h3>
      <p className="text-[var(--foreground-secondary)] text-sm max-w-sm">
        {search
          ? `Try searching for a different username.`
          : 'This repository has not been forked yet. Be the first to fork it!'}
      </p>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function ForksPage() {
  const params = useParams<{ owner: string; name: string }>()
  const { owner, name } = params

  const [sort, setSort] = useState<SortOption>('newest')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)

  // Simple debounce for search input
  const searchTimeout = useCallback(() => {
    let timer: ReturnType<typeof setTimeout>
    return (value: string) => {
      clearTimeout(timer)
      timer = setTimeout(() => setDebouncedSearch(value), 300)
    }
  }, [])()

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
    searchTimeout(value)
  }

  const handleSortChange = (newSort: SortOption) => {
    setSort(newSort)
    setPage(1)
  }

  const { data, isLoading, isError } = useQuery<ForksApiResponse>({
    queryKey: ['forks', owner, name, sort, debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        sort,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await api.get(`/v1/repositories/${owner}/${name}/forks?${params.toString()}`)
      return res.data
    },
  })

  const forks = data?.data?.forks ?? []
  const totalCount = data?.data?.totalCount ?? 0
  const hasMore = data?.data?.hasMore ?? false

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
    >
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-[var(--foreground-secondary)] mb-6" aria-label="Breadcrumb">
          <Link href={`/${owner}`} className="hover:text-[var(--primary)] transition-colors">
            {owner}
          </Link>
          <span>/</span>
          <Link href={`/${owner}/${name}`} className="hover:text-[var(--primary)] transition-colors">
            {name}
          </Link>
          <span>/</span>
          <span className="text-[var(--foreground)]">forks</span>
        </nav>

        {/* Page Header */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Forks</h1>
            {!isLoading && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--foreground-secondary)]">
                {totalCount.toLocaleString()}
              </span>
            )}
          </div>

          {/* Sort options */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--surface)] p-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSortChange(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 ${
                  sort === opt.value
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <span className="absolute inset-y-0 left-3 flex items-center text-[var(--foreground-secondary)] pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search forks by username…"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-colors"
          />
        </div>

        {/* Error state */}
        {isError && (
          <div className="rounded-lg border border-[var(--error)] bg-[var(--surface)] p-4 text-[var(--error)] text-sm mb-4">
            Failed to load forks. Please try again.
          </div>
        )}

        {/* Fork grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <ForkCardSkeleton key={i} />
            ))}
          </div>
        ) : forks.length === 0 ? (
          <EmptyState search={debouncedSearch} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {forks.map((fork) => (
                <ForkCard key={fork.id} fork={fork} />
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t border-[var(--border)]">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm font-medium rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-[var(--foreground-secondary)]">
                Page {page}
                {totalCount > 0 && (
                  <> of {Math.ceil(totalCount / PAGE_SIZE)}</>
                )}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="px-4 py-2 text-sm font-medium rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
