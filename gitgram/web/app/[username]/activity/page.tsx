'use client'

/**
 * UserActivityPage — /[username]/activity
 *
 * Shows a full chronological activity timeline for a user, a GitHub-style
 * 52-week contribution heatmap, and per-type / date-range filters.
 *
 * API calls:
 *   GET /v1/users/:username/activity?type=:type&period=:period&cursor=:cursor
 *   GET /v1/users/:username/contributions?year=:year
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityType =
  | 'pushed_commit'
  | 'opened_pr'
  | 'merged_pr'
  | 'opened_issue'
  | 'closed_issue'
  | 'starred_repo'
  | 'followed_user'
  | 'created_post'
  | 'created_snippet'
  | 'forked_repo'

type FilterType = ActivityType | 'all'
type PeriodFilter = 'today' | 'week' | 'month' | 'all'

interface CommitPayload {
  count: number
  additions: number
  deletions: number
  repoFullName: string
  branch: string
}

interface PullRequestPayload {
  number: number
  title: string
  repoFullName: string
  state: 'open' | 'merged' | 'closed'
}

interface IssuePayload {
  number: number
  title: string
  repoFullName: string
  state: 'open' | 'closed'
}

interface StarPayload {
  repoFullName: string
  repoDescription?: string
}

interface FollowPayload {
  targetUsername: string
  targetAvatar?: string
}

interface PostPayload {
  postId: string
  preview: string
}

interface SnippetPayload {
  snippetId: string
  language: string
  title?: string
}

interface ForkPayload {
  sourceRepoFullName: string
  forkedRepoFullName: string
}

type ActivityPayload =
  | CommitPayload
  | PullRequestPayload
  | IssuePayload
  | StarPayload
  | FollowPayload
  | PostPayload
  | SnippetPayload
  | ForkPayload

interface ActivityEvent {
  id: string
  type: ActivityType
  payload: ActivityPayload
  createdAt: string
}

interface ActivityPage {
  events: ActivityEvent[]
  nextCursor: string | null
}

// Contribution heatmap types
interface DayContribution {
  date: string // ISO date string YYYY-MM-DD
  count: number
}

interface ContributionsData {
  year: number
  weeks: DayContribution[][]
  totalCount: number
}

// ---------------------------------------------------------------------------
// Payload type guards
// ---------------------------------------------------------------------------

function isCommitPayload(type: ActivityType, payload: ActivityPayload): payload is CommitPayload {
  return type === 'pushed_commit'
}

function isPRPayload(type: ActivityType, payload: ActivityPayload): payload is PullRequestPayload {
  return type === 'opened_pr' || type === 'merged_pr'
}

function isIssuePayload(type: ActivityType, payload: ActivityPayload): payload is IssuePayload {
  return type === 'opened_issue' || type === 'closed_issue'
}

function isStarPayload(type: ActivityType, payload: ActivityPayload): payload is StarPayload {
  return type === 'starred_repo'
}

function isFollowPayload(type: ActivityType, payload: ActivityPayload): payload is FollowPayload {
  return type === 'followed_user'
}

function isPostPayload(type: ActivityType, payload: ActivityPayload): payload is PostPayload {
  return type === 'created_post'
}

function isSnippetPayload(type: ActivityType, payload: ActivityPayload): payload is SnippetPayload {
  return type === 'created_snippet'
}

function isForkPayload(type: ActivityType, payload: ActivityPayload): payload is ForkPayload {
  return type === 'forked_repo'
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function fetchActivityPage(
  username: string,
  type: FilterType,
  period: PeriodFilter,
  cursor?: string
): Promise<ActivityPage> {
  try {
    const params = new URLSearchParams()
    if (type !== 'all') params.set('type', type)
    if (period !== 'all') params.set('period', period)
    if (cursor) params.set('cursor', cursor)
    const query = params.toString()
    const url = `${API_URL}/v1/users/${username}/activity${query ? `?${query}` : ''}`
    const res = await fetch(url)
    if (!res.ok) return { events: [], nextCursor: null }
    const data: unknown = await res.json()
    if (typeof data !== 'object' || data === null) return { events: [], nextCursor: null }
    const obj = data as Record<string, unknown>
    return {
      events: Array.isArray(obj.events) ? (obj.events as ActivityEvent[]) : [],
      nextCursor: typeof obj.nextCursor === 'string' ? obj.nextCursor : null,
    }
  } catch {
    return { events: [], nextCursor: null }
  }
}

async function fetchContributions(username: string, year: number): Promise<ContributionsData | null> {
  try {
    const res = await fetch(`${API_URL}/v1/users/${username}/contributions?year=${year}`)
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (typeof data !== 'object' || data === null) return null
    return data as ContributionsData
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Build 52-week grid from flat DayContribution array
function buildWeekGrid(data: ContributionsData): DayContribution[][] {
  if (data.weeks && data.weeks.length > 0) return data.weeks

  // Fallback: reconstruct weeks array from a flat list if the API returns one
  return []
}

// Map count to heat level 0–4
function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 10) return 3
  return 4
}

const HEAT_COLORS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: '#161b22',
  1: '#0e4429',
  2: '#006d32',
  3: '#26a641',
  4: '#39d353',
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ---------------------------------------------------------------------------
// Activity icon components
// ---------------------------------------------------------------------------

function IconCommit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
    </svg>
  )
}

function IconPR({ merged }: { merged?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={merged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  )
}

function IconIssue({ closed }: { closed?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      {closed ? (
        <path d="M9 12l2 2 4-4" />
      ) : (
        <>
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </>
      )}
    </svg>
  )
}

function IconStar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconFollow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  )
}

function IconPost() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconCode() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function IconFork() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
      <line x1="6" y1="9" x2="6" y2="12" />
      <path d="M6 12a9 9 0 0 0 6 8.485" />
    </svg>
  )
}

function activityIcon(type: ActivityType) {
  switch (type) {
    case 'pushed_commit': return { icon: <IconCommit />, color: 'var(--primary)', bg: 'rgba(88,166,255,0.12)' }
    case 'opened_pr':     return { icon: <IconPR />, color: '#a371f7', bg: 'rgba(163,113,247,0.12)' }
    case 'merged_pr':     return { icon: <IconPR merged />, color: 'var(--accent)', bg: 'rgba(35,134,54,0.12)' }
    case 'opened_issue':  return { icon: <IconIssue />, color: '#f78166', bg: 'rgba(247,129,102,0.12)' }
    case 'closed_issue':  return { icon: <IconIssue closed />, color: '#a371f7', bg: 'rgba(163,113,247,0.12)' }
    case 'starred_repo':  return { icon: <IconStar />, color: '#e3b341', bg: 'rgba(227,179,65,0.12)' }
    case 'followed_user': return { icon: <IconFollow />, color: 'var(--primary)', bg: 'rgba(88,166,255,0.12)' }
    case 'created_post':  return { icon: <IconPost />, color: 'var(--accent)', bg: 'rgba(35,134,54,0.12)' }
    case 'created_snippet': return { icon: <IconCode />, color: '#e3b341', bg: 'rgba(227,179,65,0.12)' }
    case 'forked_repo':   return { icon: <IconFork />, color: '#a371f7', bg: 'rgba(163,113,247,0.12)' }
  }
}

// ---------------------------------------------------------------------------
// ActivityEventCard
// ---------------------------------------------------------------------------

interface ActivityEventCardProps {
  event: ActivityEvent
}

function ActivityEventCard({ event }: ActivityEventCardProps) {
  const { icon, color, bg } = activityIcon(event.type)

  const renderDescription = (): React.ReactNode => {
    const { type, payload } = event

    if (isCommitPayload(type, payload)) {
      return (
        <span>
          pushed{' '}
          <strong style={{ color: 'var(--foreground)' }}>{payload.count} commit{payload.count !== 1 ? 's' : ''}</strong>{' '}
          to{' '}
          <Link href={`/${payload.repoFullName}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
            {payload.repoFullName}
          </Link>
        </span>
      )
    }

    if (isPRPayload(type, payload)) {
      const verb = type === 'merged_pr' ? 'merged' : 'opened'
      return (
        <span>
          {verb} PR{' '}
          <Link href={`/${payload.repoFullName}/pull/${payload.number}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
            #{payload.number}
          </Link>{' '}
          in{' '}
          <Link href={`/${payload.repoFullName}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
            {payload.repoFullName}
          </Link>
        </span>
      )
    }

    if (isIssuePayload(type, payload)) {
      const verb = type === 'closed_issue' ? 'closed' : 'opened'
      return (
        <span>
          {verb} issue{' '}
          <Link href={`/${payload.repoFullName}/issues/${payload.number}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
            #{payload.number}
          </Link>{' '}
          in{' '}
          <Link href={`/${payload.repoFullName}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
            {payload.repoFullName}
          </Link>
        </span>
      )
    }

    if (isStarPayload(type, payload)) {
      return (
        <span>
          starred{' '}
          <Link href={`/${payload.repoFullName}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
            {payload.repoFullName}
          </Link>
        </span>
      )
    }

    if (isFollowPayload(type, payload)) {
      return (
        <span>
          started following{' '}
          <Link href={`/${payload.targetUsername}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
            @{payload.targetUsername}
          </Link>
        </span>
      )
    }

    if (isPostPayload(type, payload)) {
      return <span>published a post</span>
    }

    if (isSnippetPayload(type, payload)) {
      return (
        <span>
          shared a{' '}
          <span style={{ color, fontWeight: 600 }}>{payload.language}</span>
          {' '}code snippet
        </span>
      )
    }

    if (isForkPayload(type, payload)) {
      return (
        <span>
          forked{' '}
          <Link href={`/${payload.sourceRepoFullName}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
            {payload.sourceRepoFullName}
          </Link>
        </span>
      )
    }

    return null
  }

  const renderPreview = (): React.ReactNode => {
    const { type, payload } = event

    if (isCommitPayload(type, payload)) {
      return (
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#3fb950', fontFamily: 'monospace' }}>
            +{payload.additions}
          </span>
          <span style={{ fontSize: 12, color: '#f85149', fontFamily: 'monospace' }}>
            -{payload.deletions}
          </span>
          <span style={{ fontSize: 12, color: 'var(--foreground-secondary)', fontFamily: 'monospace' }}>
            on {payload.branch}
          </span>
        </div>
      )
    }

    if (isPRPayload(type, payload)) {
      return (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--foreground-secondary)', fontStyle: 'italic' }}>
          &ldquo;{payload.title}&rdquo;
        </p>
      )
    }

    if (isIssuePayload(type, payload)) {
      return (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--foreground-secondary)', fontStyle: 'italic' }}>
          &ldquo;{payload.title}&rdquo;
        </p>
      )
    }

    if (isStarPayload(type, payload) && payload.repoDescription) {
      return (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--foreground-secondary)' }}>
          {payload.repoDescription}
        </p>
      )
    }

    if (isFollowPayload(type, payload) && payload.targetAvatar) {
      return (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', position: 'relative', background: 'var(--surface-secondary)' }}>
            <Image src={payload.targetAvatar} alt={payload.targetUsername} fill sizes="28px" style={{ objectFit: 'cover' }} />
          </div>
          <span style={{ fontSize: 13, color: 'var(--foreground-secondary)' }}>@{payload.targetUsername}</span>
        </div>
      )
    }

    if (isPostPayload(type, payload) && payload.preview) {
      return (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--foreground-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {payload.preview}
        </p>
      )
    }

    if (isSnippetPayload(type, payload) && payload.title) {
      return (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--foreground-secondary)', fontStyle: 'italic' }}>
          &ldquo;{payload.title}&rdquo;
        </p>
      )
    }

    if (isForkPayload(type, payload)) {
      return (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--foreground-secondary)', fontFamily: 'monospace' }}>
          → {payload.forkedRepoFullName}
        </p>
      )
    }

    return null
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: '14px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Timeline dot + connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 2 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: bg,
            color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 6, minHeight: 12 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--foreground-secondary)', lineHeight: 1.5 }}>
            {renderDescription()}
          </p>
          <time
            dateTime={event.createdAt}
            title={formatDate(event.createdAt)}
            style={{ fontSize: 12, color: 'var(--foreground-secondary)', flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            {formatRelativeTime(event.createdAt)}
          </time>
        </div>
        {renderPreview()}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ContributionHeatmap
// ---------------------------------------------------------------------------

interface TooltipState {
  visible: boolean
  x: number
  y: number
  text: string
}

interface ContributionHeatmapProps {
  username: string
}

function ContributionHeatmap({ username }: ContributionHeatmapProps) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [data, setData] = useState<ContributionsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, text: '' })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    fetchContributions(username, year).then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [username, year])

  const weeks = data ? buildWeekGrid(data) : []

  // Determine month label positions from the first day of each week
  const monthLabels: { month: string; weekIndex: number }[] = []
  weeks.forEach((week, wi) => {
    const firstDay = week[0]
    if (firstDay) {
      const d = new Date(firstDay.date)
      const dayOfMonth = d.getDate()
      if (dayOfMonth <= 7) {
        monthLabels.push({ month: MONTHS_SHORT[d.getMonth()], weekIndex: wi })
      }
    }
  })

  const cellSize = 11
  const cellGap = 3
  const step = cellSize + cellGap
  const svgWidth = weeks.length * step
  const svgHeight = 7 * step
  const paddingLeft = 28 // room for day labels

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
          Contribution activity
        </h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {[currentYear - 1, currentYear].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid var(--border)',
                background: year === y ? 'var(--primary)' : 'transparent',
                color: year === y ? '#fff' : 'var(--foreground-secondary)',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ height: 100, background: 'var(--surface-secondary)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      )}

      {!loading && weeks.length === 0 && (
        <p style={{ color: 'var(--foreground-secondary)', fontSize: 13, margin: 0 }}>No contribution data available for {year}.</p>
      )}

      {!loading && weeks.length > 0 && (
        <div ref={containerRef} style={{ position: 'relative', overflowX: 'auto' }}>
          {/* Tooltip */}
          {tooltip.visible && (
            <div
              style={{
                position: 'fixed',
                left: tooltip.x,
                top: tooltip.y - 36,
                background: '#1c2128',
                color: 'var(--foreground)',
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                zIndex: 100,
                transform: 'translateX(-50%)',
              }}
            >
              {tooltip.text}
            </div>
          )}

          {/* Month labels */}
          <div style={{ position: 'relative', height: 16, marginLeft: paddingLeft, marginBottom: 4 }}>
            <svg width={svgWidth} height={16} aria-hidden="true">
              {monthLabels.map(({ month, weekIndex }) => (
                <text
                  key={weekIndex}
                  x={weekIndex * step}
                  y={12}
                  fontSize={10}
                  fill="var(--foreground-secondary)"
                >
                  {month}
                </text>
              ))}
            </svg>
          </div>

          {/* Grid + day labels */}
          <div style={{ display: 'flex', gap: 0 }}>
            {/* Day-of-week labels */}
            <svg width={paddingLeft} height={svgHeight} aria-hidden="true" style={{ flexShrink: 0 }}>
              {[1, 3, 5].map((dayIndex) => (
                <text
                  key={dayIndex}
                  x={0}
                  y={dayIndex * step + cellSize}
                  fontSize={9}
                  fill="var(--foreground-secondary)"
                >
                  {DAYS_OF_WEEK[dayIndex]}
                </text>
              ))}
            </svg>

            {/* Heatmap SVG */}
            <svg
              width={svgWidth}
              height={svgHeight}
              role="img"
              aria-label={`${data?.totalCount ?? 0} contributions in ${year}`}
            >
              {weeks.map((week, wi) =>
                week.map((day, di) => {
                  const level = heatLevel(day.count)
                  const fill = HEAT_COLORS[level]
                  const x = wi * step
                  const y = di * step
                  return (
                    <rect
                      key={day.date}
                      x={x}
                      y={y}
                      width={cellSize}
                      height={cellSize}
                      rx={2}
                      fill={fill}
                      onMouseEnter={(e) => {
                        const rect = (e.target as SVGRectElement).getBoundingClientRect()
                        const label = day.count === 0
                          ? `No contributions on ${formatDate(day.date)}`
                          : `${day.count} contribution${day.count !== 1 ? 's' : ''} on ${formatDate(day.date)}`
                        setTooltip({ visible: true, x: rect.left + rect.width / 2, y: rect.top, text: label })
                      }}
                      onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
                      style={{ cursor: 'pointer' }}
                    />
                  )
                })
              )}
            </svg>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--foreground-secondary)' }}>Less</span>
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <div
                key={level}
                style={{
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 2,
                  background: HEAT_COLORS[level],
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              />
            ))}
            <span style={{ fontSize: 11, color: 'var(--foreground-secondary)' }}>More</span>
          </div>

          {/* Total count */}
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--foreground-secondary)' }}>
            {(data?.totalCount ?? 0).toLocaleString()} contributions in {year}
          </p>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  activeType: FilterType
  activePeriod: PeriodFilter
  onTypeChange: (t: FilterType) => void
  onPeriodChange: (p: PeriodFilter) => void
}

const TYPE_FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pushed_commit', label: 'Commits' },
  { value: 'opened_pr', label: 'PRs' },
  { value: 'opened_issue', label: 'Issues' },
  { value: 'starred_repo', label: 'Stars' },
  { value: 'created_post', label: 'Posts' },
]

const PERIOD_FILTERS: { value: PeriodFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
]

function FilterBar({ activeType, activePeriod, onTypeChange, onPeriodChange }: FilterBarProps) {
  const pillBase: React.CSSProperties = {
    padding: '5px 12px',
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 500,
    border: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    background: 'transparent',
    whiteSpace: 'nowrap',
  }

  const pillActive: React.CSSProperties = {
    background: 'var(--primary)',
    color: '#fff',
    borderColor: 'var(--primary)',
  }

  const pillInactive: React.CSSProperties = {
    color: 'var(--foreground-secondary)',
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Type filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {TYPE_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onTypeChange(value)}
            style={{ ...pillBase, ...(activeType === value ? pillActive : pillInactive) }}
            aria-pressed={activeType === value}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Period filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PERIOD_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onPeriodChange(value)}
            style={{
              ...pillBase,
              fontSize: 12,
              padding: '4px 10px',
              ...(activePeriod === value ? { ...pillActive, background: 'var(--surface-secondary)', borderColor: 'var(--primary)', color: 'var(--primary)' } : pillInactive),
            }}
            aria-pressed={activePeriod === value}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-navigation tabs (Posts | Activity | Repositories | Snippets)
// ---------------------------------------------------------------------------

interface SubNavProps {
  username: string
  activeTab: 'posts' | 'activity' | 'repositories' | 'snippets'
}

const SUB_NAV_TABS = [
  { id: 'posts' as const, label: 'Posts', href: (u: string) => `/${u}` },
  { id: 'activity' as const, label: 'Activity', href: (u: string) => `/${u}/activity` },
  { id: 'repositories' as const, label: 'Repositories', href: (u: string) => `/${u}?tab=repositories` },
  { id: 'snippets' as const, label: 'Snippets', href: (u: string) => `/${u}/snippets` },
]

function SubNav({ username, activeTab }: SubNavProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          paddingLeft: 16,
          paddingRight: 16,
          overflowX: 'auto',
        }}
      >
        {SUB_NAV_TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href(username)}
            style={{
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--foreground-secondary)',
              textDecoration: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton loader for timeline
// ---------------------------------------------------------------------------

function TimelineSkeleton() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-secondary)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 14, width: '60%', background: 'var(--surface-secondary)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ height: 12, width: '40%', background: 'var(--surface-secondary)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: { username: string }
}

export default function UserActivityPage({ params }: PageProps) {
  const { username } = params

  const [activeType, setActiveType] = useState<FilterType>('all')
  const [activePeriod, setActivePeriod] = useState<PeriodFilter>('all')

  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)

  // Initial / filter-change load
  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError(false)
    const page = await fetchActivityPage(username, activeType, activePeriod)
    setEvents(page.events)
    setNextCursor(page.nextCursor)
    setLoading(false)
  }, [username, activeType, activePeriod])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  // Infinite scroll — load more
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const page = await fetchActivityPage(username, activeType, activePeriod, nextCursor)
    setEvents((prev) => [...prev, ...page.events])
    setNextCursor(page.nextCursor)
    setLoadingMore(false)
  }, [username, activeType, activePeriod, nextCursor, loadingMore])

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore) {
          loadMore()
        }
      },
      { rootMargin: '400px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, nextCursor, loadingMore])

  const handleTypeChange = (t: FilterType) => setActiveType(t)
  const handlePeriodChange = (p: PeriodFilter) => setActivePeriod(p)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Sub-navigation */}
      <SubNav username={username} activeTab="activity" />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        {/* Contribution heatmap */}
        <ContributionHeatmap username={username} />

        {/* Section header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--foreground)' }}>
            Activity
          </h2>
          <Link
            href={`/${username}`}
            style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none' }}
          >
            ← Back to profile
          </Link>
        </div>

        {/* Filters */}
        <FilterBar
          activeType={activeType}
          activePeriod={activePeriod}
          onTypeChange={handleTypeChange}
          onPeriodChange={handlePeriodChange}
        />

        {/* Timeline */}
        {loading && <TimelineSkeleton />}

        {!loading && error && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ color: 'var(--error)', marginBottom: 12 }}>Failed to load activity.</p>
            <button
              onClick={loadInitial}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--foreground-secondary)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: 12, opacity: 0.4 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ margin: 0, fontSize: 15 }}>No activity found for the selected filters.</p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div>
            {events.map((event) => (
              <ActivityEventCard key={event.id} event={event} />
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} style={{ height: 1 }} />

            {loadingMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    border: '3px solid var(--border)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }}
                />
              </div>
            )}

            {!nextCursor && !loadingMore && (
              <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--foreground-secondary)', padding: '20px 0' }}>
                You&apos;ve reached the end of the activity timeline.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
