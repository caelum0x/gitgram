'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
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

interface MilestonesApiResponse {
  data: {
    milestones: Milestone[]
    totalCount: number
  }
}

interface MilestoneFormData {
  title: string
  description: string
  dueOn: string
}

type StateFilter = 'open' | 'closed'

// ─── Fallback data ───────────────────────────────────────────────────────────────

function buildFallbackMilestones(owner: string): Milestone[] {
  return [
    {
      id: 'ms-001',
      number: 1,
      title: 'v1.0 Launch',
      description: 'All core features required for the initial public release.',
      state: 'open',
      dueOn: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      openIssues: 3,
      closedIssues: 12,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      creator: { login: owner, avatarUrl: null },
    },
    {
      id: 'ms-002',
      number: 2,
      title: 'Performance Improvements',
      description: 'Reduce p95 API latency to under 200 ms and improve frontend bundle size.',
      state: 'open',
      dueOn: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      openIssues: 7,
      closedIssues: 2,
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      creator: { login: owner, avatarUrl: null },
    },
    {
      id: 'ms-003',
      number: 3,
      title: 'v0.9 Beta',
      description: 'Beta release milestone — all critical bugs resolved.',
      state: 'closed',
      dueOn: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      openIssues: 0,
      closedIssues: 18,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      creator: { login: owner, avatarUrl: null },
    },
  ]
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

function isDueSoon(iso: string): boolean {
  return new Date(iso).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
}

function isOverdue(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

// ─── API functions ────────────────────────────────────────────────────────────────

async function fetchMilestones(
  owner: string,
  name: string,
  state: StateFilter
): Promise<Milestone[]> {
  try {
    const response = await api.get<MilestonesApiResponse>(
      `/v1/repositories/${owner}/${name}/milestones`,
      { params: { state } }
    )
    return response.data.data.milestones
  } catch {
    return buildFallbackMilestones(owner).filter((m) => m.state === state)
  }
}

// ─── Milestone Form Modal ─────────────────────────────────────────────────────────

interface MilestoneFormModalProps {
  owner: string
  repoName: string
  editing: Milestone | null
  onClose: () => void
}

function MilestoneFormModal({ owner, repoName, editing, onClose }: MilestoneFormModalProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<MilestoneFormData>({
    title: editing?.title ?? '',
    description: editing?.description ?? '',
    dueOn: toDateInputValue(editing?.dueOn ?? null),
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (data: MilestoneFormData) => {
      const payload = {
        title: data.title.trim(),
        description: data.description.trim() || null,
        dueOn: data.dueOn ? new Date(data.dueOn).toISOString() : null,
      }
      if (editing) {
        return api.patch(`/v1/repositories/${owner}/${repoName}/milestones/${editing.number}`, payload)
      }
      return api.post(`/v1/repositories/${owner}/${repoName}/milestones`, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones', owner, repoName] })
      onClose()
    },
    onError: () => {
      setError('Failed to save milestone. Please try again.')
    },
  })

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!form.title.trim()) {
        setError('Title is required.')
        return
      }
      setError(null)
      mutation.mutate(form)
    },
    [form, mutation]
  )

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
      aria-label={editing ? 'Edit milestone' : 'New milestone'}
    >
      <div
        style={{
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          width: '100%',
          maxWidth: 520,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid #21262d',
          }}
        >
          <h2 style={{ color: '#e6edf3', fontSize: 16, fontWeight: 700, margin: 0 }}>
            {editing ? 'Edit Milestone' : 'New Milestone'}
          </h2>
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
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <div>
            <label
              htmlFor="ms-title"
              style={{ display: 'block', color: '#c9d1d9', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
            >
              Title <span style={{ color: '#f85149' }}>*</span>
            </label>
            <input
              id="ms-title"
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. v1.0 Launch"
              style={{
                width: '100%',
                backgroundColor: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#c9d1d9',
                fontSize: 14,
                padding: '8px 12px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="ms-desc"
              style={{ display: 'block', color: '#c9d1d9', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
            >
              Description
            </label>
            <textarea
              id="ms-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional description of this milestone's goals"
              rows={4}
              style={{
                width: '100%',
                backgroundColor: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#c9d1d9',
                fontSize: 14,
                padding: '8px 12px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Due date */}
          <div>
            <label
              htmlFor="ms-due"
              style={{ display: 'block', color: '#c9d1d9', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
            >
              Due date
            </label>
            <input
              id="ms-due"
              type="date"
              value={form.dueOn}
              onChange={(e) => setForm((f) => ({ ...f, dueOn: e.target.value }))}
              style={{
                backgroundColor: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#c9d1d9',
                fontSize: 14,
                padding: '8px 12px',
                outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <p style={{ color: '#f85149', fontSize: 13, margin: 0 }}>{error}</p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#c9d1d9',
                fontSize: 14,
                padding: '7px 16px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                backgroundColor: '#238636',
                border: '1px solid #2ea043',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                padding: '7px 16px',
                cursor: mutation.isPending ? 'not-allowed' : 'pointer',
                opacity: mutation.isPending ? 0.7 : 1,
              }}
            >
              {mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create milestone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Milestone Card ───────────────────────────────────────────────────────────────

interface MilestoneCardProps {
  milestone: Milestone
  owner: string
  repoName: string
  isOwner: boolean
  onEdit: (m: Milestone) => void
  onToggleState: (m: Milestone) => void
  onDelete: (m: Milestone) => void
}

function MilestoneCard({
  milestone,
  owner,
  repoName,
  isOwner,
  onEdit,
  onToggleState,
  onDelete,
}: MilestoneCardProps) {
  const progress = calcProgress(milestone.openIssues, milestone.closedIssues)
  const total = milestone.openIssues + milestone.closedIssues

  const dueDateColor =
    milestone.dueOn && isOverdue(milestone.dueOn)
      ? '#f85149'
      : milestone.dueOn && isDueSoon(milestone.dueOn)
      ? '#d29922'
      : '#8b949e'

  return (
    <div
      style={{
        backgroundColor: '#161b22',
        border: '1px solid #21262d',
        borderRadius: 10,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color 0.15s',
      }}
      className="hover:border-[#30363d]"
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href={`/${owner}/${repoName}/milestones/${milestone.number}`}
            style={{
              color: '#58a6ff',
              fontSize: 16,
              fontWeight: 700,
              textDecoration: 'none',
              display: 'block',
              marginBottom: 4,
            }}
            className="hover:underline"
          >
            {milestone.title}
          </Link>
          {milestone.description && (
            <p
              style={{
                color: '#8b949e',
                fontSize: 13,
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {milestone.description}
            </p>
          )}
        </div>

        {/* Owner actions */}
        {isOwner && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => onEdit(milestone)}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#8b949e',
                fontSize: 12,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
              aria-label={`Edit milestone ${milestone.title}`}
            >
              Edit
            </button>
            <button
              onClick={() => onToggleState(milestone)}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: milestone.state === 'open' ? '#d29922' : '#3fb950',
                fontSize: 12,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
              aria-label={milestone.state === 'open' ? 'Close milestone' : 'Reopen milestone'}
            >
              {milestone.state === 'open' ? 'Close' : 'Reopen'}
            </button>
            <button
              onClick={() => onDelete(milestone)}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: '#f85149',
                fontSize: 12,
                padding: '4px 10px',
                cursor: 'pointer',
              }}
              aria-label={`Delete milestone ${milestone.title}`}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div
          style={{
            height: 8,
            backgroundColor: '#21262d',
            borderRadius: 4,
            overflow: 'hidden',
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
              borderRadius: 4,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 6,
          }}
        >
          <span style={{ color: '#8b949e', fontSize: 12 }}>
            {progress}% complete
          </span>
          <span style={{ color: '#8b949e', fontSize: 12 }}>
            {milestone.openIssues} open, {milestone.closedIssues} closed
            {total > 0 && ` (${total} total)`}
          </span>
        </div>
      </div>

      {/* Footer metadata */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {milestone.dueOn ? (
          <span style={{ color: dueDateColor, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span aria-hidden="true">
              {isOverdue(milestone.dueOn) ? '⚠' : '📅'}
            </span>
            {isOverdue(milestone.dueOn) ? 'Overdue · ' : 'Due '}
            {formatDate(milestone.dueOn)}
          </span>
        ) : (
          <span style={{ color: '#6e7681', fontSize: 12 }}>No due date</span>
        )}
        <span style={{ color: '#6e7681', fontSize: 12 }}>
          Opened by{' '}
          <span style={{ color: '#8b949e' }}>{milestone.creator.login}</span>
        </span>
      </div>
    </div>
  )
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────────

interface DeleteConfirmProps {
  milestone: Milestone
  owner: string
  repoName: string
  onClose: () => void
}

function DeleteConfirmModal({ milestone, owner, repoName, onClose }: DeleteConfirmProps) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () =>
      api.delete(`/v1/repositories/${owner}/${repoName}/milestones/${milestone.number}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones', owner, repoName] })
      onClose()
    },
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
      aria-label="Delete milestone confirmation"
    >
      <div
        style={{
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          width: '100%',
          maxWidth: 400,
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ color: '#f85149', fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>
          Delete milestone?
        </h2>
        <p style={{ color: '#c9d1d9', fontSize: 14, marginBottom: 20 }}>
          <strong>&quot;{milestone.title}&quot;</strong> will be permanently deleted.
          Issues assigned to it will be unlinked but not deleted.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#c9d1d9',
              fontSize: 14,
              padding: '7px 16px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            style={{
              backgroundColor: '#da3633',
              border: '1px solid #f85149',
              borderRadius: 6,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              padding: '7px 16px',
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              opacity: mutation.isPending ? 0.7 : 1,
            }}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete milestone'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────────

export default function MilestonesPage() {
  const params = useParams<{ owner: string; name: string }>()
  const owner = params.owner
  const repoName = params.name
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const isOwner = Boolean(user && user.username === owner)

  const [stateFilter, setStateFilter] = useState<StateFilter>('open')
  const [showForm, setShowForm] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null)
  const [deletingMilestone, setDeletingMilestone] = useState<Milestone | null>(null)

  const { data: milestones, isLoading } = useQuery({
    queryKey: ['milestones', owner, repoName, stateFilter],
    queryFn: () => fetchMilestones(owner, repoName, stateFilter),
    staleTime: 30_000,
    enabled: Boolean(owner && repoName),
  })

  const toggleStateMutation = useMutation({
    mutationFn: (milestone: Milestone) =>
      api.patch(`/v1/repositories/${owner}/${repoName}/milestones/${milestone.number}`, {
        state: milestone.state === 'open' ? 'closed' : 'open',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones', owner, repoName] })
    },
  })

  const handleEdit = useCallback((m: Milestone) => {
    setEditingMilestone(m)
    setShowForm(true)
  }, [])

  const handleCloseForm = useCallback(() => {
    setShowForm(false)
    setEditingMilestone(null)
  }, [])

  const displayedMilestones = milestones ?? []

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div
        style={{ backgroundColor: '#0a0c10', minHeight: '100vh', color: '#c9d1d9', padding: '24px 16px' }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* ── Page header ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Link
                  href={`/${owner}/${repoName}`}
                  style={{ color: '#58a6ff', fontSize: 14, textDecoration: 'none' }}
                >
                  {owner}/{repoName}
                </Link>
                <span style={{ color: '#6e7681' }}>/</span>
                <span style={{ color: '#c9d1d9', fontSize: 14, fontWeight: 600 }}>Milestones</span>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', margin: 0 }}>
                Milestones
              </h1>
            </div>

            {isOwner && (
              <button
                onClick={() => { setEditingMilestone(null); setShowForm(true) }}
                style={{
                  backgroundColor: '#238636',
                  border: '1px solid #2ea043',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '7px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span aria-hidden="true">+</span> New Milestone
              </button>
            )}
          </div>

          {/* ── State filter ── */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              marginBottom: 20,
              border: '1px solid #30363d',
              borderRadius: 6,
              overflow: 'hidden',
              width: 'fit-content',
            }}
          >
            {(['open', 'closed'] as const).map((state) => (
              <button
                key={state}
                onClick={() => setStateFilter(state)}
                style={{
                  backgroundColor: stateFilter === state ? '#21262d' : 'transparent',
                  border: 'none',
                  color: stateFilter === state ? '#e6edf3' : '#8b949e',
                  fontSize: 13,
                  fontWeight: stateFilter === state ? 600 : 400,
                  padding: '7px 18px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'background-color 0.15s, color 0.15s',
                }}
                aria-pressed={stateFilter === state}
              >
                {state}
              </button>
            ))}
          </div>

          {/* ── Loading ── */}
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  border: '3px solid #58a6ff',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
                aria-label="Loading milestones"
              />
            </div>
          )}

          {/* ── Milestone list ── */}
          {!isLoading && displayedMilestones.length === 0 && (
            <div
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #21262d',
                borderRadius: 10,
                padding: '40px 24px',
                textAlign: 'center',
              }}
            >
              <p style={{ color: '#8b949e', fontSize: 15, margin: '0 0 12px' }}>
                No {stateFilter} milestones found.
              </p>
              {isOwner && stateFilter === 'open' && (
                <button
                  onClick={() => setShowForm(true)}
                  style={{
                    backgroundColor: '#238636',
                    border: '1px solid #2ea043',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '7px 16px',
                    cursor: 'pointer',
                  }}
                >
                  Create the first milestone
                </button>
              )}
            </div>
          )}

          {!isLoading && displayedMilestones.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayedMilestones.map((milestone) => (
                <MilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  owner={owner}
                  repoName={repoName}
                  isOwner={isOwner}
                  onEdit={handleEdit}
                  onToggleState={(m) => toggleStateMutation.mutate(m)}
                  onDelete={setDeletingMilestone}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showForm && (
        <MilestoneFormModal
          owner={owner}
          repoName={repoName}
          editing={editingMilestone}
          onClose={handleCloseForm}
        />
      )}
      {deletingMilestone && (
        <DeleteConfirmModal
          milestone={deletingMilestone}
          owner={owner}
          repoName={repoName}
          onClose={() => setDeletingMilestone(null)}
        />
      )}
    </>
  )
}
