'use client'

import { useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

type IssueState = 'open' | 'closed'

type SortOption = 'newest' | 'oldest' | 'most_commented' | 'recently_updated'

interface IssueLabel {
  id: string
  name: string
  color: string
  description: string | null
}

interface IssueAssignee {
  login: string
  avatarUrl: string | null
}

interface IssueMilestone {
  id: string
  title: string
  number: number
}

interface Issue {
  id: string
  number: number
  title: string
  state: IssueState
  body: string | null
  commentCount: number
  labels: IssueLabel[]
  assignees: IssueAssignee[]
  milestone: IssueMilestone | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
  author: {
    login: string
    avatarUrl: string | null
  }
}

interface IssuesApiResponse {
  data: {
    issues: Issue[]
    totalCount: number
    openCount: number
    closedCount: number
    page: number
    pageSize: number
    hasMore: boolean
  }
}

interface LabelsApiResponse {
  data: {
    labels: IssueLabel[]
  }
}

interface MilestonesApiResponse {
  data: {
    milestones: IssueMilestone[]
  }
}

interface FiltersState {
  state: IssueState
  label: string
  assignee: string
  milestone: string
  sort: SortOption
  search: string
  page: number
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most_commented', label: 'Most commented' },
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

function hexToContrastText(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function OpenIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-label="Open issue"
      role="img"
    >
      <circle cx="8" cy="8" r="6.5" stroke="#3fb950" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" fill="#3fb950" />
    </svg>
  )
}

function ClosedIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-label="Closed issue"
      role="img"
    >
      <circle cx="8" cy="8" r="6.5" fill="#8b949e" stroke="#8b949e" strokeWidth="1.5" />
      <path
        d="M5 8l2 2 4-4"
        stroke="#0d1117"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface LabelBadgeProps {
  label: IssueLabel
}

function LabelBadge({ label }: LabelBadgeProps) {
  const bg = `#${label.color}`
  const fg = hexToContrastText(label.color)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: bg, color: fg }}
    >
      {label.name}
    </span>
  )
}

interface AvatarStackProps {
  assignees: IssueAssignee[]
}

function AvatarStack({ assignees }: AvatarStackProps) {
  if (assignees.length === 0) return null
  const visible = assignees.slice(0, 3)
  return (
    <div className="flex items-center -space-x-1">
      {visible.map((a) => (
        <img
          key={a.login}
          src={a.avatarUrl ?? `https://github.com/${a.login}.png?size=20`}
          alt={a.login}
          title={a.login}
          width={20}
          height={20}
          className="rounded-full ring-1 ring-[var(--background)]"
        />
      ))}
      {assignees.length > 3 && (
        <span className="text-xs text-[var(--foreground-secondary)] pl-1.5">
          +{assignees.length - 3}
        </span>
      )}
    </div>
  )
}

interface IssueRowProps {
  issue: Issue
  owner: string
  name: string
}

function IssueRow({ issue, owner, name }: IssueRowProps) {
  return (
    <li
      className="px-4 py-3 hover:bg-[var(--surface-secondary)] transition-colors border-b border-[var(--border)] last:border-b-0"
    >
      <div className="flex items-start gap-3">
        {/* State icon */}
        <div className="mt-0.5 flex-shrink-0">
          {issue.state === 'open' ? <OpenIcon /> : <ClosedIcon />}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/${owner}/${name}/issues/${issue.number}`}
              className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)] truncate"
            >
              {issue.title}
            </Link>
            {issue.labels.map((label) => (
              <LabelBadge key={label.id} label={label} />
            ))}
          </div>

          <p className="mt-1 text-xs text-[var(--foreground-secondary)]">
            #{issue.number} opened {timeAgo(issue.createdAt)} by{' '}
            <Link
              href={`/${issue.author.login}`}
              className="hover:text-[var(--primary)] hover:underline"
            >
              @{issue.author.login}
            </Link>
            {issue.milestone && (
              <>
                {' '}
                &middot;{' '}
                <span className="text-[var(--primary)]">{issue.milestone.title}</span>
              </>
            )}
          </p>
        </div>

        {/* Right side: assignees + comment count */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <AvatarStack assignees={issue.assignees} />
          {issue.commentCount > 0 && (
            <Link
              href={`/${owner}/${name}/issues/${issue.number}`}
              className="flex items-center gap-1 text-xs text-[var(--foreground-secondary)] hover:text-[var(--primary)]"
              title={`${issue.commentCount} comments`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.457 1.457 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
              </svg>
              {issue.commentCount}
            </Link>
          )}
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

function FilterDropdown({ label, value, options, onChange }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
        {selectedLabel}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-20 overflow-hidden">
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

// ─── Data fetching ──────────────────────────────────────────────────────────────

async function fetchIssues(
  owner: string,
  name: string,
  filters: FiltersState,
): Promise<IssuesApiResponse['data']> {
  const params = new URLSearchParams({
    state: filters.state,
    sort: filters.sort,
    page: String(filters.page),
    pageSize: String(PAGE_SIZE),
  })
  if (filters.label) params.set('label', filters.label)
  if (filters.assignee) params.set('assignee', filters.assignee)
  if (filters.milestone) params.set('milestone', filters.milestone)
  if (filters.search) params.set('q', filters.search)

  const res = await api.get<IssuesApiResponse>(
    `/api/v1/repositories/${owner}/${name}/issues?${params.toString()}`,
  )
  return res.data.data
}

async function fetchLabels(owner: string, name: string): Promise<IssueLabel[]> {
  const res = await api.get<LabelsApiResponse>(
    `/api/v1/repositories/${owner}/${name}/labels`,
  )
  return res.data.data.labels
}

async function fetchMilestones(owner: string, name: string): Promise<IssueMilestone[]> {
  const res = await api.get<MilestonesApiResponse>(
    `/api/v1/repositories/${owner}/${name}/milestones`,
  )
  return res.data.data.milestones
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function IssuesPage() {
  const params = useParams<{ owner: string; name: string }>()
  const router = useRouter()
  const { owner, name } = params

  const [filters, setFilters] = useState<FiltersState>({
    state: 'open',
    label: '',
    assignee: '',
    milestone: '',
    sort: 'newest',
    search: '',
    page: 1,
  })

  const [searchInput, setSearchInput] = useState('')

  const updateFilter = useCallback(
    <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value, page: 1 }))
    },
    [],
  )

  const issuesQuery = useQuery({
    queryKey: ['issues', owner, name, filters],
    queryFn: () => fetchIssues(owner, name, filters),
  })

  const labelsQuery = useQuery({
    queryKey: ['labels', owner, name],
    queryFn: () => fetchLabels(owner, name),
  })

  const milestonesQuery = useQuery({
    queryKey: ['milestones', owner, name],
    queryFn: () => fetchMilestones(owner, name),
  })

  const issues = issuesQuery.data?.issues ?? []
  const openCount = issuesQuery.data?.openCount ?? 0
  const closedCount = issuesQuery.data?.closedCount ?? 0
  const totalCount = issuesQuery.data?.totalCount ?? 0
  const hasMore = issuesQuery.data?.hasMore ?? false

  const labelOptions = [
    { value: '', label: 'Label' },
    ...(labelsQuery.data?.map((l) => ({ value: l.name, label: l.name })) ?? []),
  ]

  const milestoneOptions = [
    { value: '', label: 'Milestone' },
    ...(milestonesQuery.data?.map((m) => ({ value: String(m.number), label: m.title })) ?? []),
  ]

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      updateFilter('search', searchInput)
    },
    [searchInput, updateFilter],
  )

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div
      style={{ backgroundColor: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)' }}
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
              <Link href={`/${owner}/${name}`} className="hover:text-[var(--primary)] hover:underline">
                {name}
              </Link>
              {' / '}
              <span className="text-[var(--foreground)]">Issues</span>
            </nav>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Issues</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/${owner}/${name}/labels`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--foreground-secondary)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-secondary)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" />
              </svg>
              Labels
            </Link>
            <Link
              href={`/${owner}/${name}/issues/new`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[var(--accent)] rounded-md hover:opacity-90 transition-opacity"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
              </svg>
              New Issue
            </Link>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div
          className="rounded-t-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          style={{ borderBottom: 'none' }}
        >
          <div className="flex flex-wrap items-center gap-3">
            {/* State toggle */}
            <div className="flex items-center bg-[var(--background)] border border-[var(--border)] rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => updateFilter('state', 'open')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                  filters.state === 'open'
                    ? 'bg-[var(--surface-secondary)] text-[var(--foreground)] font-medium'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                <OpenIcon />
                <span>{openCount} Open</span>
              </button>
              <button
                type="button"
                onClick={() => updateFilter('state', 'closed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors border-l border-[var(--border)] ${
                  filters.state === 'closed'
                    ? 'bg-[var(--surface-secondary)] text-[var(--foreground)] font-medium'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                <ClosedIcon />
                <span>{closedCount} Closed</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {/* Label filter */}
              <FilterDropdown
                label="Label"
                value={filters.label}
                options={labelOptions}
                onChange={(v) => updateFilter('label', v)}
              />

              {/* Milestone filter */}
              <FilterDropdown
                label="Milestone"
                value={filters.milestone}
                options={milestoneOptions}
                onChange={(v) => updateFilter('milestone', v)}
              />

              {/* Sort */}
              <FilterDropdown
                label="Sort"
                value={filters.sort}
                options={SORT_OPTIONS}
                onChange={(v) => updateFilter('sort', v as SortOption)}
              />

              {/* Search */}
              <form onSubmit={handleSearch} className="relative">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search issues…"
                  className="w-56 px-3 py-1.5 pl-8 text-sm bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                />
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--foreground-secondary)]"
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
                </svg>
              </form>
            </div>
          </div>
        </div>

        {/* ── Issue list ── */}
        <div
          className="border border-[var(--border)] rounded-b-lg overflow-hidden"
          style={{ backgroundColor: 'var(--surface)' }}
        >
          {issuesQuery.isLoading && (
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
              <span className="text-sm">Loading issues…</span>
            </div>
          )}

          {issuesQuery.isError && (
            <div className="py-16 flex flex-col items-center gap-3 text-[var(--error)]">
              <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
              </svg>
              <span className="text-sm">Failed to load issues. Please try again.</span>
            </div>
          )}

          {!issuesQuery.isLoading && !issuesQuery.isError && issues.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-3 text-[var(--foreground-secondary)]">
              <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="opacity-40">
                <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
              </svg>
              <p className="text-sm font-medium">
                {filters.state === 'open' ? 'No open issues' : 'No closed issues'}
              </p>
              {(filters.search || filters.label || filters.assignee || filters.milestone) && (
                <p className="text-xs">Try clearing your filters</p>
              )}
            </div>
          )}

          {!issuesQuery.isLoading && issues.length > 0 && (
            <ul>
              {issues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} owner={owner} name={name} />
              ))}
            </ul>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-[var(--foreground-secondary)]">
              Page {filters.page} of {totalPages} &middot; {totalCount} issues
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={filters.page <= 1}
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!hasMore}
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
