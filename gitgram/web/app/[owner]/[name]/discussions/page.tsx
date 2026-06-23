'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

type DiscussionState = 'open' | 'closed' | 'answered'

type DiscussionCategorySlug =
  | 'all'
  | 'announcements'
  | 'ideas'
  | 'q-and-a'
  | 'show-and-tell'
  | 'general'

type SortOption = 'latest' | 'top' | 'hot' | 'unanswered'

interface DiscussionCategory {
  slug: DiscussionCategorySlug
  label: string
}

interface DiscussionAuthor {
  login: string
  avatarUrl: string | null
}

interface Discussion {
  id: string
  number: number
  title: string
  state: DiscussionState
  category: DiscussionCategorySlug
  categoryLabel: string
  pinned: boolean
  replyCount: number
  upvotes: number
  createdAt: string
  updatedAt: string
  author: DiscussionAuthor
}

interface DiscussionsApiResponse {
  data: {
    discussions: Discussion[]
    totalCount: number
    page: number
    pageSize: number
    hasMore: boolean
    categoryCounts: Partial<Record<DiscussionCategorySlug, number>>
  }
}

interface FiltersState {
  category: DiscussionCategorySlug
  sort: SortOption
  page: number
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

const CATEGORIES: DiscussionCategory[] = [
  { slug: 'all', label: 'All' },
  { slug: 'announcements', label: 'Announcements' },
  { slug: 'ideas', label: 'Ideas' },
  { slug: 'q-and-a', label: 'Q&A' },
  { slug: 'show-and-tell', label: 'Show & Tell' },
  { slug: 'general', label: 'General' },
]

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'top', label: 'Top' },
  { value: 'hot', label: 'Hot' },
  { value: 'unanswered', label: 'Unanswered' },
]

const CATEGORY_ICON: Record<DiscussionCategorySlug, string> = {
  all: '💬',
  announcements: '📣',
  ideas: '💡',
  'q-and-a': '❓',
  'show-and-tell': '🎁',
  general: '🗨️',
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

// ─── Sub-components ────────────────────────────────────────────────────────────

interface StateBadgeProps {
  state: DiscussionState
}

function StateBadge({ state }: StateBadgeProps) {
  const config: Record<
    DiscussionState,
    { label: string; bg: string; text: string; ring: string }
  > = {
    open: {
      label: 'Open',
      bg: 'bg-green-950',
      text: 'text-green-400',
      ring: 'ring-green-700',
    },
    answered: {
      label: 'Answered',
      bg: 'bg-blue-950',
      text: 'text-blue-400',
      ring: 'ring-blue-700',
    },
    closed: {
      label: 'Closed',
      bg: 'bg-[var(--surface-secondary)]',
      text: 'text-[var(--foreground-secondary)]',
      ring: 'ring-[var(--border)]',
    },
  }
  const c = config[state]
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ${c.bg} ${c.text} ${c.ring}`}
    >
      {c.label}
    </span>
  )
}

interface CategoryBadgeProps {
  slug: DiscussionCategorySlug
  label: string
}

function CategoryBadge({ slug, label }: CategoryBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] ring-1 ring-[var(--border)]">
      <span aria-hidden>{CATEGORY_ICON[slug]}</span>
      {label}
    </span>
  )
}

function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label="Pinned"
      role="img"
      className="text-[var(--accent)]"
    >
      <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146Z" />
    </svg>
  )
}

function ReplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.457 1.457 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
    </svg>
  )
}

function UpvoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8.025 1.243a.75.75 0 0 1 .53.22l5.25 5.25a.75.75 0 0 1-1.06 1.06L9 4.03V14.25a.75.75 0 0 1-1.5 0V4.03L3.755 7.773a.75.75 0 1 1-1.06-1.06l5.25-5.25a.75.75 0 0 1 .08-.22Z" />
    </svg>
  )
}

interface DiscussionRowProps {
  discussion: Discussion
  owner: string
  name: string
}

function DiscussionRow({ discussion, owner, name }: DiscussionRowProps) {
  return (
    <li className="px-4 py-3 hover:bg-[var(--surface-secondary)] transition-colors border-b border-[var(--border)] last:border-b-0">
      <div className="flex items-start gap-3">
        {/* Author avatar */}
        <Link href={`/${discussion.author.login}`} className="flex-shrink-0 mt-0.5">
          <img
            src={
              discussion.author.avatarUrl ??
              `https://github.com/${discussion.author.login}.png?size=40`
            }
            alt={discussion.author.login}
            width={32}
            height={32}
            className="rounded-full"
          />
        </Link>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {discussion.pinned && <PinIcon />}
            <Link
              href={`/${owner}/${name}/discussions/${discussion.number}`}
              className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)] truncate"
            >
              {discussion.title}
            </Link>
            <StateBadge state={discussion.state} />
            <CategoryBadge slug={discussion.category} label={discussion.categoryLabel} />
          </div>

          <p className="mt-1 text-xs text-[var(--foreground-secondary)]">
            #{discussion.number} opened {timeAgo(discussion.createdAt)} by{' '}
            <Link
              href={`/${discussion.author.login}`}
              className="hover:text-[var(--primary)] hover:underline"
            >
              @{discussion.author.login}
            </Link>
          </p>
        </div>

        {/* Right side: votes + replies */}
        <div className="flex items-center gap-4 flex-shrink-0 text-xs text-[var(--foreground-secondary)]">
          <span className="flex items-center gap-1" title={`${discussion.upvotes} upvotes`}>
            <UpvoteIcon />
            {discussion.upvotes}
          </span>
          <Link
            href={`/${owner}/${name}/discussions/${discussion.number}`}
            className="flex items-center gap-1 hover:text-[var(--primary)]"
            title={`${discussion.replyCount} replies`}
          >
            <ReplyIcon />
            {discussion.replyCount}
          </Link>
        </div>
      </div>
    </li>
  )
}

interface DropdownProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

function SortDropdown({ label, value, options, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v)
      setOpen(false)
    },
    [onChange],
  )

  const selectedLabel = options.find((o) => o.value === value)?.label ?? label

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-secondary)] transition-colors"
      >
        <span className="text-[var(--foreground-secondary)]">Sort:</span>
        {selectedLabel}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-20 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-secondary)] transition-colors ${
                opt.value === value
                  ? 'text-[var(--primary)] font-medium'
                  : 'text-[var(--foreground)]'
              }`}
            >
              {opt.value === value && (
                <span className="mr-2 text-[var(--primary)]">&#10003;</span>
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface CategorySidebarProps {
  active: DiscussionCategorySlug
  counts: Partial<Record<DiscussionCategorySlug, number>>
  onSelect: (slug: DiscussionCategorySlug) => void
}

function CategorySidebar({ active, counts, onSelect }: CategorySidebarProps) {
  return (
    <aside className="w-56 flex-shrink-0">
      <div className="border border-[var(--border)] rounded-lg bg-[var(--surface)] overflow-hidden">
        <h2 className="px-4 py-3 text-xs font-semibold text-[var(--foreground-secondary)] uppercase tracking-wider border-b border-[var(--border)]">
          Categories
        </h2>
        <nav>
          {CATEGORIES.map((cat) => {
            const isActive = cat.slug === active
            const count = counts[cat.slug]
            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => onSelect(cat.slug)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-colors border-l-2 ${
                  isActive
                    ? 'border-[var(--primary)] bg-[var(--surface-secondary)] text-[var(--foreground)] font-medium'
                    : 'border-transparent text-[var(--foreground-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span aria-hidden>{CATEGORY_ICON[cat.slug]}</span>
                  <span className="truncate">{cat.label}</span>
                </span>
                {typeof count === 'number' && (
                  <span className="text-xs text-[var(--foreground-secondary)] flex-shrink-0">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}

// ─── Data fetching ──────────────────────────────────────────────────────────────

async function fetchDiscussions(
  owner: string,
  name: string,
  filters: FiltersState,
): Promise<DiscussionsApiResponse['data']> {
  const params = new URLSearchParams({
    sort: filters.sort,
    page: String(filters.page),
    pageSize: String(PAGE_SIZE),
  })
  if (filters.category !== 'all') params.set('category', filters.category)

  const res = await api.get<DiscussionsApiResponse>(
    `/api/v1/repositories/${owner}/${name}/discussions?${params.toString()}`,
  )
  return res.data.data
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function DiscussionsPage() {
  const params = useParams<{ owner: string; name: string }>()
  const { owner, name } = params

  const [filters, setFilters] = useState<FiltersState>({
    category: 'all',
    sort: 'latest',
    page: 1,
  })

  const updateCategory = useCallback((category: DiscussionCategorySlug) => {
    setFilters((prev) => ({ ...prev, category, page: 1 }))
  }, [])

  const updateSort = useCallback((sort: SortOption) => {
    setFilters((prev) => ({ ...prev, sort, page: 1 }))
  }, [])

  const discussionsQuery = useQuery({
    queryKey: ['discussions', owner, name, filters],
    queryFn: () => fetchDiscussions(owner, name, filters),
  })

  const discussions = discussionsQuery.data?.discussions ?? []
  const totalCount = discussionsQuery.data?.totalCount ?? 0
  const hasMore = discussionsQuery.data?.hasMore ?? false
  const categoryCounts = discussionsQuery.data?.categoryCounts ?? {}

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Pinned discussions surface at the top of the list.
  const pinned = discussions.filter((d) => d.pinned)
  const unpinned = discussions.filter((d) => !d.pinned)
  const orderedDiscussions = [...pinned, ...unpinned]

  return (
    <div
      style={{
        backgroundColor: 'var(--background)',
        minHeight: '100vh',
        color: 'var(--foreground)',
      }}
      className="px-4 py-8"
    >
      <div className="mx-auto max-w-5xl">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <nav className="text-sm text-[var(--foreground-secondary)] mb-1">
              <Link href={`/${owner}`} className="hover:text-[var(--primary)] hover:underline">
                {owner}
              </Link>
              {' / '}
              <Link
                href={`/${owner}/${name}`}
                className="hover:text-[var(--primary)] hover:underline"
              >
                {name}
              </Link>
              {' / '}
              <span className="text-[var(--foreground)]">Discussions</span>
            </nav>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Discussions</h1>
          </div>

          <Link
            href={`/${owner}/${name}/discussions/new`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--accent)] rounded-md hover:opacity-90 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
            </svg>
            New Discussion
          </Link>
        </div>

        <div className="flex gap-6 items-start">
          {/* ── Category sidebar ── */}
          <CategorySidebar
            active={filters.category}
            counts={categoryCounts}
            onSelect={updateCategory}
          />

          {/* ── List column ── */}
          <div className="flex-1 min-w-0">
            {/* Sort bar */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-[var(--foreground-secondary)]">
                {totalCount} discussion{totalCount !== 1 ? 's' : ''}
              </p>
              <SortDropdown
                label="Sort"
                value={filters.sort}
                options={SORT_OPTIONS}
                onChange={(v) => updateSort(v as SortOption)}
              />
            </div>

            {/* Discussion list */}
            <div
              className="border border-[var(--border)] rounded-lg overflow-hidden"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              {discussionsQuery.isLoading && (
                <div className="py-16 flex flex-col items-center gap-3 text-[var(--foreground-secondary)]">
                  <svg
                    className="animate-spin"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span className="text-sm">Loading discussions…</span>
                </div>
              )}

              {discussionsQuery.isError && (
                <div className="py-16 flex flex-col items-center gap-3 text-[var(--error)]">
                  <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
                  </svg>
                  <span className="text-sm">
                    Failed to load discussions. Please try again.
                  </span>
                </div>
              )}

              {!discussionsQuery.isLoading &&
                !discussionsQuery.isError &&
                orderedDiscussions.length === 0 && (
                  <div className="py-16 flex flex-col items-center gap-3 text-[var(--foreground-secondary)]">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="opacity-40"
                    >
                      <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.457 1.457 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Z" />
                    </svg>
                    <p className="text-sm font-medium">No discussions yet</p>
                    <p className="text-xs">Start the conversation with a new discussion.</p>
                  </div>
                )}

              {!discussionsQuery.isLoading && orderedDiscussions.length > 0 && (
                <ul>
                  {orderedDiscussions.map((discussion) => (
                    <DiscussionRow
                      key={discussion.id}
                      discussion={discussion}
                      owner={owner}
                      name={name}
                    />
                  ))}
                </ul>
              )}
            </div>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Page {filters.page} of {totalPages} &middot; {totalCount} discussions
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={filters.page <= 1}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, page: prev.page - 1 }))
                    }
                    className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!hasMore}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, page: prev.page + 1 }))
                    }
                    className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
