'use client'

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

type RunStatus = 'passing' | 'failing' | 'running' | 'cancelled'

type JobStatus = 'passing' | 'failing' | 'running' | 'cancelled' | 'pending'

type TriggerKind = 'push' | 'pull_request' | 'schedule' | 'manual'

interface PipelineJob {
  id: string
  name: string
  status: JobStatus
  durationSeconds: number | null
  order: number
  parallel: boolean
}

interface PipelineRun {
  id: string
  status: RunStatus
  branch: string
  commitHash: string
  commitMessage: string
  trigger: TriggerKind
  durationSeconds: number | null
  startedAt: string
  finishedAt: string | null
  actor: {
    login: string
    avatarUrl: string | null
  }
}

interface BranchStatus {
  branch: string
  status: RunStatus
  lastRunAt: string
  runId: string
}

interface PipelinesApiResponse {
  data: {
    runs: PipelineRun[]
    branchStatuses: BranchStatus[]
    cursor: string | null
    hasMore: boolean
  }
}

interface JobsApiResponse {
  data: {
    jobs: PipelineJob[]
  }
}

type SortKey = 'startedAt' | 'duration' | 'branch' | 'status'
type SortDir = 'asc' | 'desc'

interface SortState {
  key: SortKey
  dir: SortDir
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const STATUS_CONFIG: Record<
  RunStatus,
  { icon: string; label: string; color: string; bg: string; pulse: boolean }
> = {
  passing: {
    icon: '✓',
    label: 'Passing',
    color: '#3fb950',
    bg: 'rgba(63,185,80,0.12)',
    pulse: false,
  },
  failing: {
    icon: '✗',
    label: 'Failing',
    color: '#f85149',
    bg: 'rgba(248,81,73,0.12)',
    pulse: false,
  },
  running: {
    icon: '⟳',
    label: 'Running',
    color: '#d29922',
    bg: 'rgba(210,153,34,0.12)',
    pulse: true,
  },
  cancelled: {
    icon: '⏸',
    label: 'Cancelled',
    color: '#8b949e',
    bg: 'rgba(139,148,158,0.12)',
    pulse: false,
  },
}

const JOB_STATUS_CONFIG: Record<
  JobStatus,
  { icon: string; color: string; bg: string }
> = {
  passing: { icon: '✓', color: '#3fb950', bg: 'rgba(63,185,80,0.15)' },
  failing: { icon: '✗', color: '#f85149', bg: 'rgba(248,81,73,0.15)' },
  running: { icon: '⟳', color: '#d29922', bg: 'rgba(210,153,34,0.15)' },
  cancelled: { icon: '⏸', color: '#8b949e', bg: 'rgba(139,148,158,0.15)' },
  pending: { icon: '◦', color: '#58a6ff', bg: 'rgba(88,166,255,0.15)' },
}

const TRIGGER_LABELS: Record<TriggerKind, string> = {
  push: 'Push',
  pull_request: 'Pull Request',
  schedule: 'Scheduled',
  manual: 'Manual',
}

interface JobLogsApiResponse {
  data: {
    lines: string[]
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1_000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

function sortRuns(runs: PipelineRun[], sort: SortState): PipelineRun[] {
  return [...runs].sort((a, b) => {
    let cmp = 0
    if (sort.key === 'startedAt') {
      cmp = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    } else if (sort.key === 'duration') {
      cmp = (a.durationSeconds ?? -1) - (b.durationSeconds ?? -1)
    } else if (sort.key === 'branch') {
      cmp = a.branch.localeCompare(b.branch)
    } else if (sort.key === 'status') {
      cmp = a.status.localeCompare(b.status)
    }
    return sort.dir === 'asc' ? cmp : -cmp
  })
}

// ─── API functions ─────────────────────────────────────────────────────────────
//
// These call the backend pipelines API.  On failure they throw so React Query
// surfaces a real error state — the page never fabricates pipeline data.

async function fetchPipelines(
  owner: string,
  name: string,
  cursor: string | null
): Promise<{ runs: PipelineRun[]; branchStatuses: BranchStatus[]; cursor: string | null; hasMore: boolean }> {
  const params: Record<string, string | number> = { limit: PAGE_SIZE }
  if (cursor) params.cursor = cursor

  const response = await api.get<PipelinesApiResponse>(
    `/v1/repositories/${owner}/${name}/pipelines`,
    { params }
  )

  return response.data.data
}

async function fetchJobs(
  owner: string,
  name: string,
  runId: string
): Promise<PipelineJob[]> {
  const response = await api.get<JobsApiResponse>(
    `/v1/repositories/${owner}/${name}/pipelines/${runId}/jobs`
  )
  return response.data.data.jobs
}

async function fetchJobLogs(
  owner: string,
  name: string,
  runId: string,
  jobId: string
): Promise<string[]> {
  const response = await api.get<JobLogsApiResponse>(
    `/v1/repositories/${owner}/${name}/pipelines/${runId}/jobs/${jobId}/logs`
  )
  return response.data.data.lines
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: RunStatus
  size?: 'sm' | 'md'
}

function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status]
  const padding = size === 'sm' ? '2px 8px' : '3px 10px'
  const fontSize = size === 'sm' ? '11px' : '12px'

  return (
    <span
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}33`,
        padding,
        fontSize,
        fontWeight: 600,
        borderRadius: 20,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
      }}
      aria-label={`Status: ${cfg.label}`}
    >
      <span
        style={{
          animation: cfg.pulse ? 'spin 1s linear infinite' : undefined,
          display: 'inline-block',
        }}
      >
        {cfg.icon}
      </span>
      {cfg.label}
    </span>
  )
}

interface JobBadgeProps {
  status: JobStatus
}

function JobBadge({ status }: JobBadgeProps) {
  const cfg = JOB_STATUS_CONFIG[status]
  return (
    <span
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 12,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      <span>{cfg.icon}</span>
      {status}
    </span>
  )
}

// ─── Log Modal ─────────────────────────────────────────────────────────────────

interface LogModalProps {
  jobName: string
  jobId: string
  owner: string
  repoName: string
  runId: string
  onClose: () => void
}

function LogModal({ jobName, jobId, owner, repoName, runId, onClose }: LogModalProps) {
  const {
    data: lines,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['pipeline-job-logs', owner, repoName, runId, jobId],
    queryFn: () => fetchJobLogs(owner, repoName, runId, jobId),
    staleTime: 30_000,
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Logs for ${jobName}`}
    >
      <div
        style={{
          backgroundColor: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 12,
          width: '100%',
          maxWidth: 720,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #21262d',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: '#c9d1d9', fontFamily: 'monospace' }}>
              logs:
            </span>
            <span style={{ fontSize: 14, color: '#58a6ff', fontFamily: 'monospace', fontWeight: 600 }}>
              {jobName}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: '0 4px',
            }}
            aria-label="Close log modal"
          >
            ✕
          </button>
        </div>

        {/* Log output */}
        <div
          style={{
            overflowY: 'auto',
            padding: 16,
            fontFamily: 'monospace',
            fontSize: 13,
            lineHeight: 1.6,
            color: '#c9d1d9',
            backgroundColor: '#0d1117',
          }}
        >
          {isLoading && (
            <p style={{ color: '#8b949e' }}>Loading logs…</p>
          )}
          {isError && (
            <p style={{ color: '#f85149' }}>
              Could not load logs for this job. The CI backend may be unavailable.
            </p>
          )}
          {!isLoading && !isError && (lines?.length ?? 0) === 0 && (
            <p style={{ color: '#8b949e' }}>No logs are available for this job.</p>
          )}
          {!isLoading && !isError && (lines ?? []).map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <span style={{ color: '#6e7681', userSelect: 'none', flexShrink: 0, width: 28, textAlign: 'right' }}>
                {i + 1}
              </span>
              <span style={{ color: line.includes('error') || line.includes('Error') ? '#f85149' : '#c9d1d9' }}>
                {line}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Job Breakdown Row ─────────────────────────────────────────────────────────

interface JobBreakdownProps {
  owner: string
  repoName: string
  runId: string
}

function JobBreakdown({ owner, repoName, runId }: JobBreakdownProps) {
  const [logModal, setLogModal] = useState<{ jobId: string; jobName: string } | null>(null)

  const { data: jobs, isLoading, isError } = useQuery({
    queryKey: ['pipeline-jobs', owner, repoName, runId],
    queryFn: () => fetchJobs(owner, repoName, runId),
    staleTime: 15_000,
  })

  if (isLoading) {
    return (
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 16,
            height: 16,
            border: '2px solid #58a6ff',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <span style={{ color: '#8b949e', fontSize: 13 }}>Loading jobs…</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ padding: '12px 16px', backgroundColor: '#0d1117', borderTop: '1px solid #21262d' }}>
        <span style={{ color: '#f85149', fontSize: 13 }}>
          Could not load jobs for this run.
        </span>
      </div>
    )
  }

  const sortedJobs = (jobs ?? []).slice().sort((a, b) => a.order - b.order)

  return (
    <>
      <div
        style={{
          backgroundColor: '#0d1117',
          borderTop: '1px solid #21262d',
          padding: '12px 16px',
        }}
      >
        <p style={{ color: '#8b949e', fontSize: 12, marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Jobs
        </p>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          {sortedJobs.map((job, idx) => (
            <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* Job card */}
              <div
                style={{
                  backgroundColor: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: 8,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minWidth: 140,
                }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#c9d1d9', fontSize: 13, fontWeight: 600, margin: 0 }}>
                    {job.name}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <JobBadge status={job.status} />
                    {job.durationSeconds !== null && (
                      <span style={{ color: '#6e7681', fontSize: 11 }}>
                        {formatDuration(job.durationSeconds)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setLogModal({ jobId: job.id, jobName: job.name })}
                  style={{
                    background: 'none',
                    border: '1px solid #30363d',
                    borderRadius: 6,
                    color: '#58a6ff',
                    fontSize: 11,
                    cursor: 'pointer',
                    padding: '3px 8px',
                    whiteSpace: 'nowrap',
                    transition: 'background-color 0.15s',
                  }}
                  aria-label={`View logs for ${job.name}`}
                >
                  View Logs
                </button>
              </div>

              {/* Arrow connector between sequential jobs */}
              {idx < sortedJobs.length - 1 && !sortedJobs[idx + 1]?.parallel && (
                <span style={{ color: '#6e7681', fontSize: 16, flexShrink: 0 }}>→</span>
              )}
              {idx < sortedJobs.length - 1 && sortedJobs[idx + 1]?.parallel && (
                <span style={{ color: '#58a6ff', fontSize: 16, flexShrink: 0 }} title="Parallel jobs">⇉</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {logModal && (
        <LogModal
          jobId={logModal.jobId}
          jobName={logModal.jobName}
          owner={owner}
          repoName={repoName}
          runId={runId}
          onClose={() => setLogModal(null)}
        />
      )}
    </>
  )
}

// ─── Active Run Row ─────────────────────────────────────────────────────────────

interface ActiveRunRowProps {
  run: PipelineRun
  owner: string
  repoName: string
  isExpanded: boolean
  onToggle: (id: string) => void
}

function ActiveRunRow({ run, owner, repoName, isExpanded, onToggle }: ActiveRunRowProps) {
  const cfg = STATUS_CONFIG[run.status]

  return (
    <div
      style={{
        border: `1px solid ${isExpanded ? cfg.color + '55' : '#21262d'}`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Run summary row */}
      <button
        type="button"
        onClick={() => onToggle(run.id)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          backgroundColor: isExpanded ? '#161b22' : '#0d1117',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background-color 0.15s',
        }}
        aria-expanded={isExpanded}
        aria-label={`Run ${shortHash(run.commitHash)} on ${run.branch}: ${run.status}`}
      >
        {/* Status icon */}
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            backgroundColor: cfg.bg,
            border: `2px solid ${cfg.color}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: cfg.color,
            fontSize: 14,
            fontWeight: 700,
            flexShrink: 0,
            animation: cfg.pulse ? 'pulse-ring 1.5s ease-in-out infinite' : undefined,
          }}
          aria-hidden="true"
        >
          {cfg.icon}
        </span>

        {/* Branch + commit */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                backgroundColor: '#21262d',
                color: '#58a6ff',
                fontFamily: 'monospace',
                fontSize: 12,
                padding: '1px 8px',
                borderRadius: 12,
                fontWeight: 600,
              }}
            >
              {run.branch}
            </span>
            <code style={{ color: '#8b949e', fontSize: 12 }}>{shortHash(run.commitHash)}</code>
            <span
              style={{
                color: '#c9d1d9',
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 260,
              }}
            >
              {run.commitMessage}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <span style={{ color: '#6e7681', fontSize: 12 }}>
              {TRIGGER_LABELS[run.trigger]}
            </span>
            <span style={{ color: '#6e7681', fontSize: 12 }}>·</span>
            <span style={{ color: '#6e7681', fontSize: 12 }}>
              {relativeTime(run.startedAt)}
            </span>
          </div>
        </div>

        {/* Duration + badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {run.durationSeconds !== null && (
            <span style={{ color: '#8b949e', fontSize: 12 }}>
              {formatDuration(run.durationSeconds)}
            </span>
          )}
          <StatusBadge status={run.status} size="sm" />
          <span
            style={{
              color: '#8b949e',
              fontSize: 14,
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              display: 'block',
            }}
            aria-hidden="true"
          >
            ▾
          </span>
        </div>
      </button>

      {/* Expanded job breakdown */}
      {isExpanded && (
        <JobBreakdown owner={owner} repoName={repoName} runId={run.id} />
      )}
    </div>
  )
}

// ─── Branch Status Sidebar ─────────────────────────────────────────────────────

interface BranchSidebarProps {
  statuses: BranchStatus[]
  owner: string
  repoName: string
}

function BranchSidebar({ statuses, owner, repoName }: BranchSidebarProps) {
  return (
    <aside
      style={{
        backgroundColor: '#161b22',
        border: '1px solid #21262d',
        borderRadius: 10,
        padding: 16,
        width: 220,
        flexShrink: 0,
      }}
      aria-label="Branch CI status"
    >
      <h2 style={{ color: '#c9d1d9', fontSize: 13, fontWeight: 700, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Branches
      </h2>

      {statuses.length === 0 && (
        <p style={{ color: '#6e7681', fontSize: 12, margin: 0 }}>
          No branch activity yet.
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {statuses.map((bs) => {
          const cfg = STATUS_CONFIG[bs.status]
          return (
            <li key={bs.branch}>
              <Link
                href={`/${owner}/${repoName}/pipelines?run=${bs.runId}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  textDecoration: 'none',
                  transition: 'background-color 0.15s',
                }}
                className="hover:bg-white/5"
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: cfg.color,
                    flexShrink: 0,
                    animation: cfg.pulse ? 'pulse-dot 1.5s ease-in-out infinite' : undefined,
                  }}
                  aria-hidden="true"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      color: '#c9d1d9',
                      fontSize: 12,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      margin: 0,
                    }}
                  >
                    {bs.branch}
                  </p>
                  <p style={{ color: '#6e7681', fontSize: 11, margin: 0 }}>
                    {relativeTime(bs.lastRunAt)}
                  </p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

// ─── Sortable Table Header Cell ────────────────────────────────────────────────

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  current: SortState
  onSort: (key: SortKey) => void
}

function SortHeader({ label, sortKey, current, onSort }: SortHeaderProps) {
  const active = current.key === sortKey
  return (
    <th
      style={{ color: active ? '#58a6ff' : '#8b949e', fontWeight: 600, fontSize: 12, textAlign: 'left', padding: '8px 12px', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}{' '}
      {active && (
        <span aria-hidden="true">{current.dir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  )
}

// ─── History Table ─────────────────────────────────────────────────────────────

interface HistoryTableProps {
  runs: PipelineRun[]
  sort: SortState
  onSort: (key: SortKey) => void
  cursor: string | null
  hasMore: boolean
  isFetchingMore: boolean
  onLoadMore: () => void
}

function HistoryTable({ runs, sort, onSort, hasMore, isFetchingMore, onLoadMore }: HistoryTableProps) {
  const sorted = sortRuns(runs, sort)

  return (
    <section aria-label="Pipeline history">
      <h2 style={{ color: '#c9d1d9', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
        History
      </h2>
      <div
        style={{
          backgroundColor: '#161b22',
          border: '1px solid #21262d',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }} role="table">
          <thead>
            <tr style={{ borderBottom: '1px solid #21262d' }}>
              <SortHeader label="Status" sortKey="status" current={sort} onSort={onSort} />
              <SortHeader label="Branch" sortKey="branch" current={sort} onSort={onSort} />
              <th style={{ color: '#8b949e', fontWeight: 600, fontSize: 12, textAlign: 'left', padding: '8px 12px' }}>
                Commit
              </th>
              <th style={{ color: '#8b949e', fontWeight: 600, fontSize: 12, textAlign: 'left', padding: '8px 12px' }}>
                Trigger
              </th>
              <SortHeader label="Duration" sortKey="duration" current={sort} onSort={onSort} />
              <SortHeader label="Started" sortKey="startedAt" current={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((run, i) => (
              <tr
                key={run.id}
                style={{
                  borderBottom: i < sorted.length - 1 ? '1px solid #21262d' : 'none',
                  transition: 'background-color 0.1s',
                }}
                className="hover:bg-white/5"
              >
                <td style={{ padding: '10px 12px' }}>
                  <StatusBadge status={run.status} size="sm" />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    style={{
                      backgroundColor: '#21262d',
                      color: '#58a6ff',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      padding: '1px 7px',
                      borderRadius: 12,
                    }}
                  >
                    {run.branch}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code style={{ color: '#8b949e', fontSize: 12 }}>{shortHash(run.commitHash)}</code>
                    <span style={{ color: '#c9d1d9', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {run.commitMessage}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', color: '#8b949e', fontSize: 12 }}>
                  {TRIGGER_LABELS[run.trigger]}
                </td>
                <td style={{ padding: '10px 12px', color: '#8b949e', fontSize: 12 }}>
                  {formatDuration(run.durationSeconds)}
                </td>
                <td style={{ padding: '10px 12px', color: '#8b949e', fontSize: 12 }}>
                  {relativeTime(run.startedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination controls */}
        {(hasMore || isFetchingMore) && (
          <div
            style={{
              borderTop: '1px solid #21262d',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={onLoadMore}
              disabled={isFetchingMore}
              style={{
                backgroundColor: '#21262d',
                color: '#c9d1d9',
                border: '1px solid #30363d',
                borderRadius: 6,
                padding: '6px 16px',
                fontSize: 13,
                cursor: isFetchingMore ? 'not-allowed' : 'pointer',
                opacity: isFetchingMore ? 0.6 : 1,
              }}
            >
              {isFetchingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}

        {runs.length === 0 && (
          <p style={{ color: '#6e7681', fontSize: 13, textAlign: 'center', padding: '24px 16px' }}>
            No pipeline runs yet.
          </p>
        )}
      </div>
    </section>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PipelinesPage() {
  const params = useParams<{ owner: string; name: string }>()
  const owner = params.owner
  const repoName = params.name

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [allRuns, setAllRuns] = useState<PipelineRun[]>([])
  const [isFetchingMore, setIsFetchingMore] = useState(false)
  const [sort, setSort] = useState<SortState>({ key: 'startedAt', dir: 'desc' })

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['pipelines', owner, repoName],
    queryFn: () => fetchPipelines(owner, repoName, null),
    staleTime: 15_000,
    enabled: Boolean(owner && repoName),
  })

  // Sync initial data into allRuns
  const isInitialSync = allRuns.length === 0 && data !== undefined
  if (isInitialSync) {
    setAllRuns(data.runs)
  }

  const handleToggleRun = useCallback((id: string) => {
    setExpandedRunId((prev) => (prev === id ? null : id))
  }, [])

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' }
    )
  }, [])

  const handleLoadMore = useCallback(async () => {
    if (isFetchingMore || !data?.hasMore) return
    setIsFetchingMore(true)
    try {
      const nextCursor = cursor ?? data?.cursor ?? null
      const result = await fetchPipelines(owner, repoName, nextCursor)
      const existingIds = new Set(allRuns.map((r) => r.id))
      const fresh = result.runs.filter((r) => !existingIds.has(r.id))
      setAllRuns((prev) => [...prev, ...fresh])
      setCursor(result.cursor)
    } catch {
      // silently fail
    } finally {
      setIsFetchingMore(false)
    }
  }, [isFetchingMore, cursor, data, owner, repoName, allRuns])

  // ── Active runs = running status first, then most recent ──────────────────

  const activeRuns = allRuns.filter(
    (r) => r.status === 'running' || r.status === 'failing'
  )
  const latestRuns = allRuns.slice(0, 5)
  const displayedActiveRuns = activeRuns.length > 0 ? activeRuns : latestRuns

  const branchStatuses = data?.branchStatuses ?? []

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading && allRuns.length === 0) {
    return (
      <div
        style={{ backgroundColor: '#0a0c10', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid #58a6ff',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
          aria-label="Loading pipelines"
        />
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────
  // The CI backend is unavailable.  Show a real error with retry instead of
  // fabricating pipeline runs.

  if (isError && allRuns.length === 0) {
    return (
      <div
        style={{ backgroundColor: '#0a0c10', minHeight: '100vh', color: '#c9d1d9', padding: '24px 16px' }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <Link
              href={`/${owner}/${repoName}`}
              style={{ color: '#58a6ff', fontSize: 14, textDecoration: 'none' }}
            >
              {owner}/{repoName}
            </Link>
            <span style={{ color: '#6e7681' }}>/</span>
            <span style={{ color: '#c9d1d9', fontSize: 14, fontWeight: 600 }}>Pipelines</span>
          </div>

          <div
            style={{
              backgroundColor: '#161b22',
              border: '1px solid #21262d',
              borderRadius: 12,
              padding: '40px 24px',
              textAlign: 'center',
            }}
            role="alert"
          >
            <p style={{ fontSize: 32, margin: '0 0 12px' }} aria-hidden="true">⚠️</p>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e6edf3', margin: '0 0 8px' }}>
              Pipelines are unavailable
            </h1>
            <p style={{ color: '#8b949e', fontSize: 14, margin: '0 0 20px', maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
              We couldn&apos;t load CI/CD pipeline data for this repository.
              The service may be offline or no pipelines have been configured.
            </p>
            <button
              onClick={() => { void refetch() }}
              disabled={isRefetching}
              style={{
                backgroundColor: '#238636',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: isRefetching ? 'not-allowed' : 'pointer',
                opacity: isRefetching ? 0.6 : 1,
              }}
            >
              {isRefetching ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Inline keyframes for animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring { 0%,100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; } 50% { box-shadow: 0 0 0 5px transparent; opacity: 0.8; } }
        @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <div
        style={{ backgroundColor: '#0a0c10', minHeight: '100vh', color: '#c9d1d9', padding: '24px 16px' }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* ── Page header ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Link
                  href={`/${owner}/${repoName}`}
                  style={{ color: '#58a6ff', fontSize: 14, textDecoration: 'none' }}
                >
                  {owner}/{repoName}
                </Link>
                <span style={{ color: '#6e7681' }}>/</span>
                <span style={{ color: '#c9d1d9', fontSize: 14, fontWeight: 600 }}>Pipelines</span>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', margin: 0 }}>
                CI/CD Pipelines
              </h1>
            </div>

            {/* Settings shortcut for admins */}
            <Link
              href={`/${owner}/${repoName}/settings/ci`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#21262d',
                color: '#c9d1d9',
                border: '1px solid #30363d',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 13,
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              <span aria-hidden="true">⚙</span>
              CI Settings
            </Link>
          </div>

          {/* ── Main content: sidebar + body ── */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Sidebar */}
            <BranchSidebar statuses={branchStatuses} owner={owner} repoName={repoName} />

            {/* Body */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── Active Runs section ── */}
              <section aria-label="Active pipeline runs">
                <h2 style={{ color: '#c9d1d9', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
                  {activeRuns.length > 0 ? 'Active Runs' : 'Recent Runs'}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {displayedActiveRuns.length === 0 ? (
                    <p style={{ color: '#6e7681', fontSize: 13, padding: '16px 0' }}>
                      No active runs.
                    </p>
                  ) : (
                    displayedActiveRuns.map((run) => (
                      <ActiveRunRow
                        key={run.id}
                        run={run}
                        owner={owner}
                        repoName={repoName}
                        isExpanded={expandedRunId === run.id}
                        onToggle={handleToggleRun}
                      />
                    ))
                  )}
                </div>
              </section>

              {/* ── History Table ── */}
              <HistoryTable
                runs={allRuns}
                sort={sort}
                onSort={handleSort}
                cursor={cursor}
                hasMore={data?.hasMore ?? false}
                isFetchingMore={isFetchingMore}
                onLoadMore={handleLoadMore}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
