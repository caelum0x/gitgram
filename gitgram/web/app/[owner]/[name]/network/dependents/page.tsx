'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useInfiniteQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

type DependentType = 'repository' | 'package'
type SortOption = 'most_stars' | 'recently_updated'

interface DependentOwner {
  login: string
  avatarUrl: string | null
}

interface Dependent {
  id: string
  name: string
  fullName: string
  type: DependentType
  owner: DependentOwner
  stargazersCount: number
  versionRange: string | null
  pushedAt: string | null
}

interface DependentsPage {
  data: {
    dependents: Dependent[]
    totalRepositories: number
    totalPackages: number
    page: number
    pageSize: number
    hasMore: boolean
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30

const TYPE_TABS: { value: DependentType; label: string }[] = [
  { value: 'repository', label: 'Repositories' },
  { value: 'package', label: 'Packages' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'most_stars', label: 'Most stars' },
  { value: 'recently_updated', label: 'Recently updated' },
]

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
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 11.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
    </svg>
  )
}

function PackageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="m8.878.392 5.25 3.045c.54.314.872.89.872 1.514v6.098a1.75 1.75 0 0 1-.872 1.514l-5.25 3.045a1.75 1.75 0 0 1-1.756 0l-5.25-3.045A1.75 1.75 0 0 1 1 11.049V4.951c0-.624.332-1.201.872-1.514L7.122.392a1.75 1.75 0 0 1 1.756 0ZM7.875 1.69l-4.63 2.685L8 7.133l4.755-2.758-4.63-2.685a.248.248 0 0 0-.25 0ZM2.5 5.677v5.372c0 .09.047.171.125.216l4.625 2.683V8.432Zm6.25 8.271 4.625-2.683a.25.25 0 0 0 .125-.216V5.677L8.75 8.432Z" />
    </svg>
  )
}

function RepoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
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

// ─── Sub-components ────────────────────────────────────────────────────────────

function DependentRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] animate-pulse">
      <div className="w-7 h-7 rounded-full bg-[var(--surface-secondary)] shrink-0" />
      <div className="h-4 bg-[var(--surface-secondary)] rounded w-1/3" />
      <div className="ml-auto h-3 bg-[var(--surface-secondary)] rounded w-16" />
    </div>
  )
}

interface DependentRowProps {
  dependent: Dependent
}

function DependentRow({ dependent }: DependentRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--surface-secondary)] transition-colors duration-150">
      <Link href={`/${dependent.owner.login}`} className="shrink-0" aria-label={`${dependent.owner.login}'s profile`}>
        {dependent.owner.avatarUrl ? (
          <Image
            src={dependent.owner.avatarUrl}
            alt={dependent.owner.login}
            width={28}
            height={28}
            className="rounded-full border border-[var(--border)] hover:opacity-80 transition-opacity"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-secondary)] text-xs font-medium">
            {dependent.owner.login.charAt(0).toUpperCase()}
          </div>
        )}
      </Link>

      <span className="text-[var(--foreground-secondary)] shrink-0" aria-hidden="true">
        {dependent.type === 'package' ? <PackageIcon /> : <RepoIcon />}
      </span>

      <Link
        href={`/${dependent.owner.login}/${dependent.name}`}
        className="text-sm font-semibold truncate min-w-0"
      >
        <span className="text-[var(--foreground-secondary)] font-normal">{dependent.owner.login}/</span>
        <span className="text-[var(--primary)] hover:underline">{dependent.name}</span>
      </Link>

      {dependent.versionRange && (
        <code className="hidden sm:inline-block text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--foreground-secondary)] shrink-0">
          {dependent.versionRange}
        </code>
      )}

      <div className="flex items-center gap-3 ml-auto text-xs text-[var(--foreground-secondary)] shrink-0">
        <span className="flex items-center gap-1">
          <StarIcon />
          {formatCount(dependent.stargazersCount)}
        </span>
        {dependent.pushedAt && <span className="hidden md:inline">{timeAgo(dependent.pushedAt)}</span>}
      </div>
    </div>
  )
}

function EmptyState({ type, search }: { type: DependentType; search: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center mb-4 text-[var(--foreground-secondary)]">
        {type === 'package' ? <PackageIcon /> : <RepoIcon />}
      </div>
      <h3 className="text-[var(--foreground)] font-semibold text-lg mb-2">
        {search ? 'No dependents match your search' : `No ${type === 'package' ? 'packages' : 'repositories'} depend on this`}
      </h3>
      <p className="text-[var(--foreground-secondary)] text-sm max-w-sm">
        {search
          ? 'Try searching for a different name.'
          : `No public ${type === 'package' ? 'packages' : 'repositories'} have been found that depend on this repository yet.`}
      </p>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function DependentsPage() {
  const params = useParams<{ owner: string; name: string }>()
  const { owner, name } = params

  const [type, setType] = useState<DependentType>('repository')
  const [sort, setSort] = useState<SortOption>('most_stars')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<DependentsPage>({
    queryKey: ['dependents', owner, name, type, sort, debouncedSearch],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({
        type,
        sort,
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
      })
      if (debouncedSearch) qs.set('search', debouncedSearch)
      const res = await api.get(`/v1/repositories/${owner}/${name}/dependents?${qs.toString()}`)
      return res.data
    },
    getNextPageParam: (lastPage) =>
      lastPage.data.hasMore ? lastPage.data.page + 1 : undefined,
  })

  const dependents = data?.pages.flatMap((p) => p.data.dependents) ?? []
  const firstPage = data?.pages[0]?.data
  const totalRepositories = firstPage?.totalRepositories ?? 0
  const totalPackages = firstPage?.totalPackages ?? 0
  const totalForType = type === 'package' ? totalPackages : totalRepositories

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage && !isLoading) {
          fetchNextPage()
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage])

  const handleTypeChange = useCallback((next: DependentType) => setType(next), [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-[var(--foreground-secondary)] mb-6" aria-label="Breadcrumb">
          <Link href={`/${owner}`} className="hover:text-[var(--primary)] transition-colors">{owner}</Link>
          <span>/</span>
          <Link href={`/${owner}/${name}`} className="hover:text-[var(--primary)] transition-colors">{name}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)]">dependents</span>
        </nav>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Dependents</h1>
          {!isLoading && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--foreground-secondary)]">
              {(totalRepositories + totalPackages).toLocaleString()}
            </span>
          )}
        </div>

        {/* Summary */}
        <p className="text-[var(--foreground-secondary)] text-sm mb-6">
          <span className="font-semibold text-[var(--foreground)]">{totalRepositories.toLocaleString()}</span> repositories and{' '}
          <span className="font-semibold text-[var(--foreground)]">{totalPackages.toLocaleString()}</span> packages depend on this
        </p>

        {/* Toolbar: type toggle + sort */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleTypeChange(tab.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 ${
                  type === tab.value
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)]'
                }`}
              >
                {tab.value === 'package' ? <PackageIcon /> : <RepoIcon />}
                {tab.label}
                <span className="opacity-70">
                  {(tab.value === 'package' ? totalPackages : totalRepositories).toLocaleString()}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${type === 'package' ? 'packages' : 'repositories'}…`}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-colors"
          />
        </div>

        {/* Error */}
        {isError && (
          <div className="rounded-lg border border-[var(--error)] bg-[var(--surface)] p-4 text-[var(--error)] text-sm mb-4">
            Failed to load dependents. Please try again.
          </div>
        )}

        {/* List */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <DependentRowSkeleton key={i} />)
          ) : dependents.length === 0 ? (
            <EmptyState type={type} search={debouncedSearch} />
          ) : (
            <>
              <div className="px-4 py-2.5 text-xs font-medium text-[var(--foreground-secondary)] border-b border-[var(--border)] bg-[var(--surface-secondary)]">
                {totalForType.toLocaleString()} {type === 'package' ? 'packages' : 'repositories'}
              </div>
              {dependents.map((dependent) => (
                <DependentRow key={dependent.id} dependent={dependent} />
              ))}
            </>
          )}
        </div>

        {/* Infinite scroll sentinel + loading */}
        {!isLoading && dependents.length > 0 && (
          <div ref={sentinelRef} className="py-6 flex items-center justify-center">
            {isFetchingNextPage && (
              <span className="text-xs text-[var(--foreground-secondary)]">Loading more…</span>
            )}
            {!hasNextPage && (
              <span className="text-xs text-[var(--foreground-secondary)]">You&apos;ve reached the end</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
