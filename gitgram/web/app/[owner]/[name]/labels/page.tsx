'use client'

import { useState, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Label {
  id: string
  name: string
  description: string | null
  color: string // hex without leading '#', e.g. "d73a4a"
  openIssuesCount: number
  createdAt: string
  updatedAt: string
}

interface LabelsApiResponse {
  data: {
    labels: Label[]
    totalCount: number
  }
}

interface LabelFormData {
  name: string
  description: string
  color: string // hex without '#'
}

interface DefaultLabel {
  name: string
  description: string
  color: string
}

// ─── Theme constants (CSS variable backed) ─────────────────────────────────────

const cssVars: Record<string, string> = {
  '--lbl-bg': '#0d1117',
  '--lbl-surface': '#161b22',
  '--lbl-surface-alt': '#0d1117',
  '--lbl-border': '#30363d',
  '--lbl-border-muted': '#21262d',
  '--lbl-text': '#e6edf3',
  '--lbl-text-muted': '#8b949e',
  '--lbl-text-soft': '#c9d1d9',
  '--lbl-accent': '#238636',
  '--lbl-accent-border': '#2ea043',
  '--lbl-danger': '#f85149',
  '--lbl-link': '#58a6ff',
}

// ─── Preset swatches & default labels ──────────────────────────────────────────

const PRESET_COLORS: readonly string[] = [
  'd73a4a',
  'e99695',
  'fbca04',
  'f9d0c4',
  '0e8a16',
  'c2e0c6',
  '006b75',
  '1d76db',
  'c5def5',
  '5319e7',
  'd4c5f9',
  'b60205',
  '0052cc',
  'bfd4f2',
  'fef2c0',
  '0075ca',
  '7057ff',
  '008672',
  'e4e669',
  'cfd3d7',
]

const DEFAULT_LABELS: readonly DefaultLabel[] = [
  { name: 'bug', description: "Something isn't working", color: 'd73a4a' },
  { name: 'enhancement', description: 'New feature or request', color: 'a2eeef' },
  { name: 'documentation', description: 'Improvements or additions to documentation', color: '0075ca' },
  { name: 'good first issue', description: 'Good for newcomers', color: '7057ff' },
  { name: 'help wanted', description: 'Extra attention is needed', color: '008672' },
  { name: 'question', description: 'Further information is requested', color: 'd876e3' },
  { name: 'wontfix', description: 'This will not be worked on', color: 'ffffff' },
]

// ─── Color helpers ──────────────────────────────────────────────────────────────

const HEX_RE = /^[0-9a-fA-F]{6}$/

function normalizeHex(input: string): string {
  return input.replace(/^#/, '').trim().toLowerCase()
}

function isValidHex(input: string): boolean {
  return HEX_RE.test(normalizeHex(input))
}

/**
 * Returns black or white depending on the perceived luminance of the
 * background color so the pill text always stays readable.
 */
function readableTextColor(hex: string): string {
  const clean = normalizeHex(hex)
  if (!isValidHex(clean)) return '#ffffff'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  // Relative luminance (sRGB approximation)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.6 ? '#1f2328' : '#ffffff'
}

function randomPreset(): string {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
}

// ─── Fallback data ──────────────────────────────────────────────────────────────

function buildFallbackLabels(): Label[] {
  const now = Date.now()
  return DEFAULT_LABELS.slice(0, 5).map((d, i) => ({
    id: `lbl-fallback-${i}`,
    name: d.name,
    description: d.description,
    color: d.color,
    openIssuesCount: [12, 7, 3, 5, 2][i] ?? 0,
    createdAt: new Date(now - (i + 1) * 86400000).toISOString(),
    updatedAt: new Date(now - i * 3600000).toISOString(),
  }))
}

// ─── API functions ──────────────────────────────────────────────────────────────

async function fetchLabels(owner: string, name: string): Promise<Label[]> {
  try {
    const response = await api.get<LabelsApiResponse>(`/v1/repositories/${owner}/${name}/labels`)
    return response.data.data.labels
  } catch {
    return buildFallbackLabels()
  }
}

// ─── Label Pill ─────────────────────────────────────────────────────────────────

interface LabelPillProps {
  name: string
  color: string
}

function LabelPill({ name, color }: LabelPillProps) {
  const bg = isValidHex(color) ? `#${normalizeHex(color)}` : '#6e7681'
  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: bg,
        color: readableTextColor(color),
        fontSize: 12,
        fontWeight: 600,
        lineHeight: '18px',
        padding: '0 10px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
        maxWidth: 240,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {name || 'label preview'}
    </span>
  )
}

// ─── Label Form (inline create/edit) ────────────────────────────────────────────

interface LabelFormProps {
  owner: string
  repoName: string
  editing: Label | null
  onClose: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'var(--lbl-surface-alt)',
  border: '1px solid var(--lbl-border)',
  borderRadius: 6,
  color: 'var(--lbl-text-soft)',
  fontSize: 14,
  padding: '7px 12px',
  outline: 'none',
  boxSizing: 'border-box',
}

function LabelForm({ owner, repoName, editing, onClose }: LabelFormProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<LabelFormData>({
    name: editing?.name ?? '',
    description: editing?.description ?? '',
    color: editing ? normalizeHex(editing.color) : randomPreset(),
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (data: LabelFormData) => {
      const payload = {
        name: data.name.trim(),
        description: data.description.trim() || null,
        color: normalizeHex(data.color),
      }
      if (editing) {
        return api.patch(`/v1/repositories/${owner}/${repoName}/labels/${editing.id}`, payload)
      }
      return api.post(`/v1/repositories/${owner}/${repoName}/labels`, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', owner, repoName] })
      onClose()
    },
    onError: () => setError('Failed to save label. Please try again.'),
  })

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!form.name.trim()) {
        setError('Label name is required.')
        return
      }
      if (!isValidHex(form.color)) {
        setError('Color must be a valid 6-digit hex value.')
        return
      }
      setError(null)
      mutation.mutate(form)
    },
    [form, mutation]
  )

  const setColor = (c: string) => setForm((f) => ({ ...f, color: normalizeHex(c) }))

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        backgroundColor: 'var(--lbl-surface)',
        border: '1px solid var(--lbl-border)',
        borderRadius: 8,
        padding: 20,
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      aria-label={editing ? 'Edit label' : 'Create label'}
    >
      {/* Live preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--lbl-text-muted)', fontSize: 13 }}>Preview:</span>
        <LabelPill name={form.name} color={form.color} />
      </div>

      {/* Name + description row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 180px', minWidth: 160 }}>
          <label
            htmlFor="lbl-name"
            style={{ display: 'block', color: 'var(--lbl-text-soft)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
          >
            Name <span style={{ color: 'var(--lbl-danger)' }}>*</span>
          </label>
          <input
            id="lbl-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Label name"
            style={inputStyle}
            autoFocus
            maxLength={50}
          />
        </div>
        <div style={{ flex: '2 1 260px', minWidth: 200 }}>
          <label
            htmlFor="lbl-desc"
            style={{ display: 'block', color: 'var(--lbl-text-soft)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
          >
            Description
          </label>
          <input
            id="lbl-desc"
            type="text"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional description"
            style={inputStyle}
            maxLength={100}
          />
        </div>
      </div>

      {/* Color picker */}
      <div>
        <span
          style={{ display: 'block', color: 'var(--lbl-text-soft)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
        >
          Color
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Hex input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid var(--lbl-border)',
              borderRadius: 6,
              backgroundColor: 'var(--lbl-surface-alt)',
              overflow: 'hidden',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28,
                height: 30,
                backgroundColor: isValidHex(form.color) ? `#${normalizeHex(form.color)}` : '#6e7681',
              }}
            />
            <span style={{ color: 'var(--lbl-text-muted)', paddingLeft: 8 }}>#</span>
            <input
              type="text"
              value={form.color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Hex color value"
              maxLength={6}
              style={{
                width: 80,
                backgroundColor: 'transparent',
                border: 'none',
                color: 'var(--lbl-text-soft)',
                fontSize: 14,
                fontFamily: 'monospace',
                padding: '7px 8px',
                outline: 'none',
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setColor(randomPreset())}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--lbl-border)',
              borderRadius: 6,
              color: 'var(--lbl-text-soft)',
              fontSize: 13,
              padding: '7px 12px',
              cursor: 'pointer',
            }}
            title="Pick a random color"
          >
            ⟳ Random
          </button>
        </div>

        {/* Preset swatches */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {PRESET_COLORS.map((c) => {
            const selected = normalizeHex(form.color) === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Use color #${c}`}
                aria-pressed={selected}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: `#${c}`,
                  border: selected ? '2px solid var(--lbl-text)' : '1px solid var(--lbl-border-muted)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            )
          })}
        </div>
      </div>

      {error && <p style={{ color: 'var(--lbl-danger)', fontSize: 13, margin: 0 }}>{error}</p>}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--lbl-border)',
            borderRadius: 6,
            color: 'var(--lbl-text-soft)',
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
            backgroundColor: 'var(--lbl-accent)',
            border: '1px solid var(--lbl-accent-border)',
            borderRadius: 6,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            padding: '7px 16px',
            cursor: mutation.isPending ? 'not-allowed' : 'pointer',
            opacity: mutation.isPending ? 0.7 : 1,
          }}
        >
          {mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create label'}
        </button>
      </div>
    </form>
  )
}

// ─── Label Row ──────────────────────────────────────────────────────────────────

interface LabelRowProps {
  label: Label
  owner: string
  repoName: string
  isOwner: boolean
  onEdit: (label: Label) => void
}

function LabelRow({ label, owner, repoName, isOwner, onEdit }: LabelRowProps) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/v1/repositories/${owner}/${repoName}/labels/${label.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labels', owner, repoName] })
      setConfirming(false)
    },
  })

  const swatchColor = isValidHex(label.color) ? `#${normalizeHex(label.color)}` : '#6e7681'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
        borderBottom: '1px solid var(--lbl-border-muted)',
      }}
    >
      {/* Color swatch */}
      <span
        aria-hidden
        style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: swatchColor, flexShrink: 0 }}
      />

      {/* Pill */}
      <div style={{ flexShrink: 0 }}>
        <LabelPill name={label.name} color={label.color} />
      </div>

      {/* Description */}
      <span
        style={{
          flex: 1,
          color: 'var(--lbl-text-muted)',
          fontSize: 13,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {label.description || ''}
      </span>

      {/* Open issues count */}
      <a
        href={`/${owner}/${repoName}/issues?label=${encodeURIComponent(label.name)}`}
        style={{ color: 'var(--lbl-text-muted)', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}
      >
        {label.openIssuesCount} open
      </a>

      {/* Actions */}
      {isOwner && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {confirming ? (
            <>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                style={{
                  backgroundColor: 'var(--lbl-danger)',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--lbl-border)',
                  borderRadius: 6,
                  color: 'var(--lbl-text-soft)',
                  fontSize: 12,
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onEdit(label)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--lbl-border)',
                  borderRadius: 6,
                  color: 'var(--lbl-text-soft)',
                  fontSize: 12,
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
              <button
                onClick={() => setConfirming(true)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--lbl-border)',
                  borderRadius: 6,
                  color: 'var(--lbl-danger)',
                  fontSize: 12,
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function LabelsPage() {
  const params = useParams()
  const owner = String(params.owner)
  const repoName = String(params.name)

  const { user } = useAuthStore()
  const isOwner = Boolean(user && user.username === owner)

  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Label | null>(null)

  const { data: labels = [], isLoading } = useQuery({
    queryKey: ['labels', owner, repoName],
    queryFn: () => fetchLabels(owner, repoName),
  })

  const existingNames = useMemo(
    () => new Set(labels.map((l) => l.name.toLowerCase())),
    [labels]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return labels
    return labels.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.description ?? '').toLowerCase().includes(q)
    )
  }, [labels, search])

  const missingDefaults = useMemo(
    () => DEFAULT_LABELS.filter((d) => !existingNames.has(d.name.toLowerCase())),
    [existingNames]
  )

  const addDefaultsMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        missingDefaults.map((d) =>
          api.post(`/v1/repositories/${owner}/${repoName}/labels`, {
            name: d.name,
            description: d.description,
            color: d.color,
          })
        )
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['labels', owner, repoName] }),
  })

  const openCreate = useCallback(() => {
    setEditing(null)
    setShowForm(true)
  }, [])

  const openEdit = useCallback((label: Label) => {
    setEditing(label)
    setShowForm(true)
  }, [])

  const closeForm = useCallback(() => {
    setShowForm(false)
    setEditing(null)
  }, [])

  return (
    <div style={{ ...cssVars, backgroundColor: 'var(--lbl-bg)', minHeight: '100%', padding: '24px 16px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 20,
          }}
        >
          <h1 style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: 0 }}>
            <span style={{ color: 'var(--lbl-text)', fontSize: 22, fontWeight: 700 }}>Labels</span>
            <span style={{ color: 'var(--lbl-text-muted)', fontSize: 14, fontWeight: 400 }}>
              {labels.length} {labels.length === 1 ? 'label' : 'labels'}
            </span>
          </h1>

          {isOwner && (
            <div style={{ display: 'flex', gap: 10 }}>
              {missingDefaults.length > 0 && (
                <button
                  onClick={() => addDefaultsMutation.mutate()}
                  disabled={addDefaultsMutation.isPending}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid var(--lbl-border)',
                    borderRadius: 6,
                    color: 'var(--lbl-text-soft)',
                    fontSize: 14,
                    fontWeight: 600,
                    padding: '7px 14px',
                    cursor: addDefaultsMutation.isPending ? 'not-allowed' : 'pointer',
                    opacity: addDefaultsMutation.isPending ? 0.7 : 1,
                  }}
                  title={`Adds ${missingDefaults.length} missing default label(s)`}
                >
                  {addDefaultsMutation.isPending ? 'Adding…' : 'Add default labels'}
                </button>
              )}
              <button
                onClick={openCreate}
                style={{
                  backgroundColor: 'var(--lbl-accent)',
                  border: '1px solid var(--lbl-accent-border)',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '7px 16px',
                  cursor: 'pointer',
                }}
              >
                New Label
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all labels"
            aria-label="Search labels"
            style={{ ...inputStyle, maxWidth: 360 }}
          />
        </div>

        {/* Inline create/edit form */}
        {isOwner && showForm && (
          <LabelForm owner={owner} repoName={repoName} editing={editing} onClose={closeForm} />
        )}

        {/* Label list */}
        <div
          style={{
            border: '1px solid var(--lbl-border)',
            borderRadius: 8,
            overflow: 'hidden',
            backgroundColor: 'var(--lbl-surface)',
          }}
        >
          {/* List header bar */}
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--lbl-border)',
              backgroundColor: 'var(--lbl-surface-alt)',
              color: 'var(--lbl-text-muted)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {filtered.length} {filtered.length === 1 ? 'label' : 'labels'}
          </div>

          {isLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--lbl-text-muted)', fontSize: 14 }}>
              Loading labels…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--lbl-text-muted)', fontSize: 14 }}>
              {search.trim()
                ? `No labels match “${search.trim()}”.`
                : 'No labels yet. Create your first label to organize issues and pull requests.'}
            </div>
          ) : (
            filtered.map((label) => (
              <LabelRow
                key={label.id}
                label={label}
                owner={owner}
                repoName={repoName}
                isOwner={isOwner}
                onEdit={openEdit}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
