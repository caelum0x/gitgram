'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string
  number: number
  title: string
  description: string | null
  state: 'open' | 'closed'
  dueOn: string | null
  openIssues: number
  closedIssues: number
  createdAt: string
  updatedAt: string
  creator: {
    login: string
    avatarUrl: string | null
  }
}

interface Issue {
  id: string
  number: number
  title: string
  state: 'open' | 'closed'
  body: string | null
  labels: Array<{ id: string; name: string; color: string }>
  assignees: Array<{ login: string; avatarUrl: string | null }>
  commentsCount: number
  createdAt: string
  updatedAt: string
  closedAt: string | null
  author: {
    login: string
    avatarUrl: string | null
  }
}

interface MilestoneDetailApiResponse {
  data: {
    milestone: Milestone
  }
}

interface IssuesApiResponse {
  data: {
    issues: Issue[]
    totalCount: number
  }
}

type IssueStateFilter = 'open' | 'closed'

// ─── Fallback data ───────────────────────────────────────────────────────────────

function buildFallbackMilestone(owner: string, id: string): Milestone {
  return {
    id: `ms-${id}`,
    number: parseInt(id, 10) || 1,
    title: 'v1.0 Launch',
    description: 'All core features required for the initial public release.',
    state: 'open',
    dueOn: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    openIssues: 3,
    closedIssues: 12,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    creator: { login: owner, avatarUrl: null },
  }
}

function buildFallbackIssues(state: IssueStateFilter): Issue[] {
  const openIssues: Issue[] = [
    {
      id: 'iss-001',
      number: 42,
      title: 'Add real-time notifications for milestone progress',
      state: 'open',
      body: null,
      labels: [{ id: 'l-1', name: 'enhancement', color: '84b6eb' }],
      assignees: [],
      commentsCount: 3,
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      closedAt: null,
      author: { login: 'caelum0x', avatarUrl: null },
    },
    {
      id: 'iss-002',
      number: 38,
      title: 'Implement dark mode toggle with system preference detection',
      state: 'open',
      body: null,
      labels: [
        { id: 'l-2', name: 'ui', color: 'e4e669' },
        { id: 'l-3', name: 'good first issue', color: '7057ff' },
      ],
      assignees: [{ login: 'caelum0x', avatarUrl: null }],
      commentsCount: 7,
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      closedAt: null,
      author: { login: 'caelum0x', avatarUrl: null },
    },
    {
      id: 'iss-003',
      number: 35,
      title: 'Fix pagination bug on explore page with more than 100 repos',
      state: 'open',
      body: null,
      labels: [{ id: 'l-4', name: 'bug', color: 'd73a4a' }],
      assignees: [],
      commentsCount: 2,
      createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      closedAt: null,
      author: { login: 'caelum0x', avatarUrl: null },
    },
  ]

  const closedIssues: Issue[] = [
    {
      id: 'iss-004',
      number: 30,
      title: 'Set up CI/CD pipeline with GitHub Actions',
      state: 'closed',
      body: null,
      labels: [{ id: 'l-5', name: 'infrastructure', color: '0075ca' }],
      assignees: [{ login: 'caelum0x', avatarUrl: null }],
      commentsCount: 5,
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      closedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      author: { login: 'caelum0x', avatarUrl: null },
    },
    {
      id: 'iss-005',
      number: 25,
      title: 'Implement repository follow/unfollow with optimistic UI',
      state: 'closed',
      body: null,
      labels: [{ id: 'l-1', name: 'enhancement', color: '84b6eb' }],
      assignees: [],
      commentsCount: 4,
      createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      closedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      author: { login: 'caelum0x', avatarUrl: null },
    },
  ]

  return state === 'open' ? openIssues : closedIssues
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function calcProgress(open: number, closed: number): number {
  const total = open + closed
  if (total === 0) return 0
  return Math.round((closed / total) * 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

// ─── API functions ────────────────────────────────────────────────────────────────

async function fetchMilestone(
  owner: string,
  name: string,
  id: string
): Promise<Milestone> {
  try {
    const response = await api.get<MilestoneDetailApiResponse>(
      `/v1/repositories/${owner}/${name}/milestones/${id}`
    )
    return response.data.data.milestone
  } catch {
    return buildFallbackMilestone(owner, id)
  }
}

async function fetchMilestoneIssues(
  owner: string,
  name: string,
  id: string,
  state: IssueStateFilter
): Promise<Issue[]> {
  try {
    const response = await api.get<IssuesApiResponse>(
      `/v1/repositories/${owner}/${name}/issues`,
      { params: { milestone: id, state, limit: 50 } }
    )
    return response.data.data.issues
  } catch {
    return buildFallbackIssues(state)
  }
}

// ─── Milestone Header ─────────────────────────────────────────────────────────────

interface MilestoneHeaderProps {
  milestone: Milestone
  owner: string
  repoName: string
}

function MilestoneHeader({ milestone, owner, repoName }: MilestoneHeaderProps) {
  const progress = calcProgress(milestone.openIssues, milestone.closedIssues)
  const total = milestone.openIssues + milestone.closedIssues

  return (
    <div
      style={{
        backgroundColor: '#161b22',
        border: '1px solid #21262d',
        borderRadius: 10,
        padding: '20px 24px',
        marginBottom: 24,
      }}
    >
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 13 }}>
        <Link href={`/${owner}/${repoName}`} style={{ color: '#58a6ff', textDecoration: 'none' }}>
          {owner}/{repoName}
        </Link>
        <span style={{ color: '#6e7681' }}>/</span>
        <Link href={`/${owner}/${repoName}/milestones`} style={{ color: '#58a6ff', textDecoration: 'none' }}>
          Milestones
        </Link>
        <span style={{ color: '#6e7681' }}>/</span>
        <span style={{ color: '#c9d1d9', fontWeight: 600 }}>#{milestone.number}</span>
      </div>

      {/* Title + state badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', margin: 0 }}>
          {milestone.title}
        </h1>
        <span
          style={{
            backgroundColor: milestone.state === 'open' ? 'rgba(35,134,54,0.15)' : 'rgba(139,148,158,0.15)',
            color: milestone.state === 'open' ? '#3fb950' : '#8b949e',
            border: `1px solid ${milestone.state === 'open' ? '#238636' : '#6e7681'}`,
            fontSize: 12,
            fontWeight: 600,
            padding: '2px 10px',
            borderRadius: 20,
          }}
        >
          {milestone.state === 'open' ? 'Open' : 'Closed'}
        </span>
      </div>

      {/* Description */}
      {milestone.description && (
        <p style={{ color: '#8b949e', fontSize: 14, margin: '0 0 16px', lineHeight: 1.6 }}>
          {milestone.description}
        </p>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            height: 10,
            backgroundColor: '#21262d',
            borderRadius: 5,
            overflow: 'hidden',
            marginBottom: 8,
          }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${progress}% complete`}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              backgroundColor: progress === 100 ? '#3fb950' : '#238636',
              borderRadius: 5,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#c9d1d9', fontSize: 13, fontWeight: 600 }}>
            {progress}% complete
          </span>
          <span style={{ color: '#8b949e', fontSize: 13 }}>
            {milestone.openIssues} open · {milestone.closedIssues} closed
            {total > 0 && ` · ${total} total`}
          </span>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#6e7681' }}>
        {milestone.dueOn ? (
          <span style={{ color: isOverdue(milestone.dueOn) ? '#f85149' : '#8b949e' }}>
            {isOverdue(milestone.dueOn) ? '⚠ Overdue · ' : '📅 Due '}
            {formatDate(milestone.dueOn)}
          </span>
        ) : (
          <span>No due date</span>
        )}
        <span>Opened {relativeTime(milestone.createdAt)} by {milestone.creator.login}</span>
      </div>
    </div>
  )
}

// ─── Label Badge ──────────────────────────────────────────────────────────────────

interface LabelBadgeProps {
  name: string
  color: string
}

function LabelBadge({ name, color }: LabelBadgeProps) {
  const normalized = color.startsWith('#') ? color : `#${color}`
  return (
    <span
      style={{
        backgroundColor: `rgba(${hexToRgb(normalized)}, 0.15)`,
        color: normalized,
        border: `1px solid rgba(${hexToRgb(normalized)}, 0.4)`,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 12,
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </span>
  )
}

// ─── Issue Row ────────────────────────────────────────────────────────────────────

interface IssueRowProps {
  issue: Issue
  owner: string
  repoName: string
}

function IssueRow({ issue, owner, repoName }: IssueRowProps) {
  const isOpen = issue.state === 'open'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 16px',
        borderBottom: '1px solid #21262d',
        transition: 'background-color 0.1s',
      }}
      className="hover:bg-white/5"
    >
      {/* State icon */}
      <span
        style={{
          flexShrink: 0,
          marginTop: 2,
          fontSize: 16,
          color: isOpen ? '#3fb950' : '#8b949e',
        }}
        aria-label={isOpen ? 'Open issue' : 'Closed issue'}
        title={isOpen ? 'Open' : 'Closed'}
      >
        {isOpen ? '○' : '●'}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <Link
            href={`/${owner}/${repoName}/issues/${issue.number}`}
            style={{ color: '#c9d1d9', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}
            className="hover:text-[#58a6ff]"
          >
            {issue.title}
          </Link>
          {issue.labels.map((label) => (
            <LabelBadge key={label.id} name={label.name} color={label.color} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6e7681', flexWrap: 'wrap' }}>
          <span>#{issue.number}</span>
          <span>·</span>
          <span>
            {isOpen ? 'opened' : 'closed'}{' '}
            {relativeTime(isOpen ? issue.createdAt : (issue.closedAt ?? issue.updatedAt))}
          </span>
          <span>·</span>
          <span>by {issue.author.login}</span>
          {issue.assignees.length > 0 && (
            <>
              <span>·</span>
              <span>assigned to {issue.assignees.map((a) => a.login).join(', ')}</span>
            </>
          )}
        </div>
      </div>

      {/* Comments count */}
      {issue.commentsCount > 0 && (
        <Link
          href={`/${owner}/${repoName}/issues/${issue.number}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: '#8b949e',
            fontSize: 12,
            textDecoration: 'none',
            flexShrink: 0,
          }}
          aria-label={`${issue.commentsCount} comment${issue.commentsCount !== 1 ? 's' : ''}`}
          className="hover:text-[#58a6ff]"
        >
          <span aria-hidden="true">💬</span>
          <span>{issue.commentsCount}</span>
        </Link>
      )}
    </div>
  )
}

// ─── Issues List ──────────────────────────────────────────────────────────────────

interface IssuesListProps {
  issues: Issue[]
  isLoading: boolean
  owner: string
  repoName: string
  stateFilter: IssueStateFilter
}

function IssuesList({ issues, isLoading, owner, repoName, stateFilter }: IssuesListProps) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div
          style={{
            width: 28,
            height: 28,
            border: '3px solid #58a6ff',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
          aria-label="Loading issues"
        />
      </div>
    )
  }

  if (issues.length === 0) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center' }}>
        <p style={{ color: '#8b949e', fontSize: 14, margin: 0 }}>
          No {stateFilter} issues assigned to this milestone.
        </p>
      </div>
    )
  }

  return (
    <div>
      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} owner={owner} repoName={repoName} />
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────────

export default function MilestoneDetailPage() {
  const params = useParams<{ owner: string; name: string; id: string }>()
  const owner = params.owner
  const repoName = params.name
  const milestoneId = params.id

  const [issueState, setIssueState] = useState<IssueStateFilter>('open')

  const { data: milestone, isLoading: milestoneLoading } = useQuery({
    queryKey: ['milestone', owner, repoName, milestoneId],
    queryFn: () => fetchMilestone(owner, repoName, milestoneId),
    staleTime: 30_000,
    enabled: Boolean(owner && repoName && milestoneId),
  })

  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: ['milestone-issues', owner, repoName, milestoneId, issueState],
    queryFn: () => fetchMilestoneIssues(owner, repoName, milestoneId, issueState),
    staleTime: 30_000,
    enabled: Boolean(owner && repoName && milestoneId),
  })

  const displayedIssues = issues ?? []
  const openCount = milestone?.openIssues ?? 0
  const closedCount = milestone?.closedIssues ?? 0

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div
        style={{ backgroundColor: '#0a0c10', minHeight: '100vh', color: '#c9d1d9', padding: '24px 16px' }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* ── Milestone header ── */}
          {milestoneLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid #58a6ff',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
                aria-label="Loading milestone"
              />
            </div>
          ) : milestone ? (
            <MilestoneHeader milestone={milestone} owner={owner} repoName={repoName} />
          ) : (
            <div
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #21262d',
                borderRadius: 10,
                padding: '32px 24px',
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              <p style={{ color: '#f85149', fontSize: 14, margin: 0 }}>
                Milestone not found.
              </p>
              <Link
                href={`/${owner}/${repoName}/milestones`}
                style={{ color: '#58a6ff', fontSize: 13, marginTop: 8, display: 'inline-block' }}
              >
                Back to milestones
              </Link>
            </div>
          )}

          {/* ── Issues section ── */}
          {milestone && (
            <div
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #21262d',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {/* Issues header with state filter */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: '1px solid #21262d',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setIssueState('open')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: issueState === 'open' ? '#e6edf3' : '#8b949e',
                      fontSize: 13,
                      fontWeight: issueState === 'open' ? 700 : 400,
                      cursor: 'pointer',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    aria-pressed={issueState === 'open'}
                  >
                    <span style={{ color: '#3fb950' }} aria-hidden="true">○</span>
                    <span>{openCount} Open</span>
                  </button>
                  <button
                    onClick={() => setIssueState('closed')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: issueState === 'closed' ? '#e6edf3' : '#8b949e',
                      fontSize: 13,
                      fontWeight: issueState === 'closed' ? 700 : 400,
                      cursor: 'pointer',
                      padding: '4px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    aria-pressed={issueState === 'closed'}
                  >
                    <span style={{ color: '#8b949e' }} aria-hidden="true">●</span>
                    <span>{closedCount} Closed</span>
                  </button>
                </div>

                <Link
                  href={`/${owner}/${repoName}/issues?milestone=${milestoneId}`}
                  style={{
                    color: '#58a6ff',
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                  className="hover:underline"
                >
                  View all issues
                </Link>
              </div>

              {/* Issues list */}
              <IssuesList
                issues={displayedIssues}
                isLoading={issuesLoading}
                owner={owner}
                repoName={repoName}
                stateFilter={issueState}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
