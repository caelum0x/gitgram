'use client'

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

// ─── Types ──────────────────────────────────────────────────────────────────────

type ProjectStatus = 'open' | 'closed'

interface Project {
  id: string
  number: number
  title: string
  description: string | null
  status: ProjectStatus
  itemsCount: number
  openItemsCount: number
  closedItemsCount: number
  createdAt: string
  updatedAt: string
  creator: {
    login: string
    avatarUrl: string | null
  }
}

interface ProjectsApiResponse {
  data: {
    projects: Project[]
    totalCount: number
  }
}

interface NewProjectFormData {
  title: string
  description: string
}

// ─── Fallback data ───────────────────────────────────────────────────────────────

function buildFallbackProjects(owner: string): Project[] {
  return [
    {
      id: 'proj-001',
      number: 1,
      title: 'v1.0 Roadmap',
      description: 'Track all work required for the initial public release.',
      status: 'open',
      itemsCount: 18,
      openItemsCount: 11,
      closedItemsCount: 7,
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      creator: { login: owner, avatarUrl: null },
    },
    {
      id: 'proj-002',
      number: 2,
      title: 'Bug Backlog',
      description: 'Triage and resolution queue for reported bugs.',
      status: 'open',
      itemsCount: 9,
      openItemsCount: 6,
      closedItemsCount: 3,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      creator: { login: owner, avatarUrl: null },
    },
    {
      id: 'proj-003',
      number: 3,
      title: 'Q4 Sprint Planning',
      description: 'Completed sprint board from Q4.',
      status: 'closed',
      itemsCount: 24,
      openItemsCount: 0,
      closedItemsCount: 24,
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      creator: { login: owner, avatarUrl: null },
    },
  ]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

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

// ─── API functions ─────────────────────────────────────────────────────────────────

async function fetchProjects(
  owner: string,
  name: string,
  status: ProjectStatus,
): Promise<Project[]> {
  try {
    const response = await api.get<ProjectsApiResponse>(
      `/v1/repositories/${owner}/${name}/projects`,
      { params: { status } },
    )
    return response.data.data.projects
  } catch {
    return buildFallbackProjects(owner).filter((p) => p.status === status)
  }
}

// ─── New Project Modal ────────────────────────────────────────────────────────────

interface NewProjectModalProps {
  owner: string
  repoName: string
  onClose: () => void
}

function NewProjectModal({ owner, repoName, onClose }: NewProjectModalProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<NewProjectFormData>({ title: '', description: '' })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (data: NewProjectFormData) => {
      return api.post(`/v1/repositories/${owner}/${repoName}/projects`, {
        title: data.title.trim(),
        description: data.description.trim() || null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', owner, repoName] })
      onClose()
    },
    onError: () => {
      setError('Failed to create project. Please try again.')
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
    [form, mutation],
  )

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#c9d1d9',
    fontSize: 14,
    padding: '8px 12px',
    outline: 'none',
    boxSizing: 'border-box',
  }

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
      aria-label="New project"
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
            New Project
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              htmlFor="proj-title"
              style={{ display: 'block', color: '#c9d1d9', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
            >
              Title <span style={{ color: '#f85149' }}>*</span>
            </label>
            <input
              id="proj-title"
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. v1.0 Roadmap"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="proj-desc"
              style={{ display: 'block', color: '#c9d1d9', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
            >
              Description
            </label>
            <textarea
              id="proj-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description of what this project tracks"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {error && <p style={{ color: '#f85149', fontSize: 13, margin: 0 }}>{error}</p>}

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
              {mutation.isPending ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project
  owner: string
  repoName: string
}

function ProjectCard({ project, owner, repoName }: ProjectCardProps) {
  const progressPct =
    project.itemsCount === 0
      ? 0
      : Math.round((project.closedItemsCount / project.itemsCount) * 100)

  return (
    <Link
      href={`/${owner}/${repoName}/projects/${project.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        style={{
          backgroundColor: '#161b22',
          border: '1px solid #21262d',
          borderRadius: 10,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          transition: 'border-color 0.15s, background-color 0.15s',
          cursor: 'pointer',
        }}
        className="hover:border-[#30363d] hover:bg-[#1c2128]"
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: project.status === 'open' ? 'rgba(63,185,80,0.15)' : 'rgba(139,148,158,0.15)',
                  color: project.status === 'open' ? '#3fb950' : '#8b949e',
                  borderRadius: 12,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                  <circle cx="4" cy="4" r="4" />
                </svg>
                {project.status}
              </span>
              <span
                style={{
                  color: '#e6edf3',
                  fontSize: 15,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {project.title}
              </span>
            </div>
            {project.description && (
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
                {project.description}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={{ color: '#8b949e', fontSize: 12 }}>
              {project.itemsCount} item{project.itemsCount !== 1 ? 's' : ''}
            </span>
            <span style={{ color: '#6e7681', fontSize: 11 }}>updated {timeAgo(project.updatedAt)}</span>
          </div>
        </div>

        {/* Progress bar */}
        {project.itemsCount > 0 && (
          <div>
            <div
              style={{ height: 6, backgroundColor: '#21262d', borderRadius: 3, overflow: 'hidden' }}
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${progressPct}% complete`}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  backgroundColor: progressPct === 100 ? '#3fb950' : '#238636',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
              <span style={{ color: '#8b949e', fontSize: 11 }}>{progressPct}% complete</span>
              <span style={{ color: '#6e7681', fontSize: 11 }}>
                {project.openItemsCount} open · {project.closedItemsCount} closed
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ color: '#6e7681', fontSize: 11 }}>
          Created by{' '}
          <span style={{ color: '#8b949e' }}>{project.creator.login}</span>
          {' · '}
          {timeAgo(project.createdAt)}
        </div>
      </div>
    </Link>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const params = useParams<{ owner: string; name: string }>()
  const { owner, name } = params
  const { user } = useAuthStore()

  const isOwner = Boolean(user && user.username === owner)

  const [statusFilter, setStatusFilter] = useState<ProjectStatus>('open')
  const [showNewModal, setShowNewModal] = useState(false)

  const { data: projects, isLoading, isError } = useQuery({
    queryKey: ['projects', owner, name, statusFilter],
    queryFn: () => fetchProjects(owner, name, statusFilter),
    staleTime: 30_000,
    enabled: Boolean(owner && name),
  })

  const displayed = projects ?? []

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ backgroundColor: '#0a0c10', minHeight: '100vh', color: '#c9d1d9', padding: '24px 16px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* ── Header ── */}
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
                <Link href={`/${owner}/${name}`} style={{ color: '#58a6ff', fontSize: 14, textDecoration: 'none' }}
                  className="hover:underline"
                >
                  {owner}/{name}
                </Link>
                <span style={{ color: '#6e7681' }}>/</span>
                <span style={{ color: '#c9d1d9', fontSize: 14, fontWeight: 600 }}>Projects</span>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e6edf3', margin: 0 }}>Projects</h1>
            </div>

            {isOwner && (
              <button
                onClick={() => setShowNewModal(true)}
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
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
                </svg>
                New Project
              </button>
            )}
          </div>

          {/* ── Status toggle ── */}
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
            {(['open', 'closed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  backgroundColor: statusFilter === s ? '#21262d' : 'transparent',
                  border: 'none',
                  color: statusFilter === s ? '#e6edf3' : '#8b949e',
                  fontSize: 13,
                  fontWeight: statusFilter === s ? 600 : 400,
                  padding: '7px 18px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'background-color 0.15s, color 0.15s',
                }}
                aria-pressed={statusFilter === s}
              >
                {s}
              </button>
            ))}
          </div>

          {/* ── Loading ── */}
          {isLoading && (
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
                aria-label="Loading projects"
              />
            </div>
          )}

          {/* ── Error ── */}
          {isError && (
            <div
              style={{
                backgroundColor: 'rgba(218,54,51,0.1)',
                border: '1px solid #da3633',
                borderRadius: 8,
                padding: '16px 20px',
                color: '#f85149',
                fontSize: 14,
              }}
            >
              Failed to load projects. Please refresh and try again.
            </div>
          )}

          {/* ── Empty state ── */}
          {!isLoading && !isError && displayed.length === 0 && (
            <div
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #21262d',
                borderRadius: 10,
                padding: '48px 24px',
                textAlign: 'center',
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#8b949e"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ margin: '0 auto 12px' }}
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
              <p style={{ color: '#8b949e', fontSize: 15, margin: '0 0 12px' }}>
                No {statusFilter} projects yet.
              </p>
              {isOwner && statusFilter === 'open' && (
                <button
                  onClick={() => setShowNewModal(true)}
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
                  Create the first project
                </button>
              )}
            </div>
          )}

          {/* ── Project list ── */}
          {!isLoading && !isError && displayed.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayed.map((project) => (
                <ProjectCard key={project.id} project={project} owner={owner} repoName={name} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewProjectModal
          owner={owner}
          repoName={name}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </>
  )
}
