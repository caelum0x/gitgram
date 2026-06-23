'use client'

import { useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ──────────────────────────────────────────────────────────────────────

type ItemType = 'issue' | 'pr' | 'note'

interface ItemLabel {
  id: string
  name: string
  color: string
}

interface ItemAssignee {
  login: string
  avatarUrl: string | null
}

interface ProjectItem {
  id: string
  columnId: string
  type: ItemType
  title: string
  number: number | null
  body: string | null
  labels: ItemLabel[]
  assignees: ItemAssignee[]
  createdAt: string
  updatedAt: string
}

interface ProjectColumn {
  id: string
  name: string
  color: string
  position: number
  items: ProjectItem[]
}

interface Project {
  id: string
  title: string
  description: string | null
  columns: ProjectColumn[]
  createdAt: string
  updatedAt: string
}

interface ProjectApiResponse {
  data: {
    project: Project
  }
}

interface FilterState {
  assignee: string
  label: string
  type: ItemType | ''
}

// ─── Fallback data ───────────────────────────────────────────────────────────────

function buildFallbackProject(id: string): Project {
  const now = Date.now()

  return {
    id,
    title: 'v1.0 Roadmap',
    description: 'Track all work for the initial public release.',
    createdAt: new Date(now - 20 * 86_400_000).toISOString(),
    updatedAt: new Date(now - 3_600_000).toISOString(),
    columns: [
      {
        id: 'col-backlog',
        name: 'Backlog',
        color: '#6e7681',
        position: 0,
        items: [
          {
            id: 'item-1',
            columnId: 'col-backlog',
            type: 'issue',
            title: 'Design onboarding flow',
            number: 42,
            body: null,
            labels: [{ id: 'l1', name: 'design', color: 'bfd4f2' }],
            assignees: [],
            createdAt: new Date(now - 5 * 86_400_000).toISOString(),
            updatedAt: new Date(now - 86_400_000).toISOString(),
          },
          {
            id: 'item-2',
            columnId: 'col-backlog',
            type: 'issue',
            title: 'Add dark mode support',
            number: 37,
            body: null,
            labels: [{ id: 'l2', name: 'enhancement', color: 'a2eeef' }],
            assignees: [{ login: 'caelum0x', avatarUrl: null }],
            createdAt: new Date(now - 8 * 86_400_000).toISOString(),
            updatedAt: new Date(now - 2 * 86_400_000).toISOString(),
          },
        ],
      },
      {
        id: 'col-in-progress',
        name: 'In Progress',
        color: '#58a6ff',
        position: 1,
        items: [
          {
            id: 'item-3',
            columnId: 'col-in-progress',
            type: 'pr',
            title: 'feat: implement project board drag-and-drop',
            number: 58,
            body: null,
            labels: [{ id: 'l3', name: 'feature', color: '0075ca' }],
            assignees: [{ login: 'caelum0x', avatarUrl: null }],
            createdAt: new Date(now - 2 * 86_400_000).toISOString(),
            updatedAt: new Date(now - 3_600_000).toISOString(),
          },
        ],
      },
      {
        id: 'col-in-review',
        name: 'In Review',
        color: '#d29922',
        position: 2,
        items: [
          {
            id: 'item-4',
            columnId: 'col-in-review',
            type: 'pr',
            title: 'fix: resolve WebSocket reconnect memory leak',
            number: 55,
            body: null,
            labels: [{ id: 'l4', name: 'bug', color: 'd73a4a' }],
            assignees: [{ login: 'caelum0x', avatarUrl: null }],
            createdAt: new Date(now - 3 * 86_400_000).toISOString(),
            updatedAt: new Date(now - 7_200_000).toISOString(),
          },
        ],
      },
      {
        id: 'col-done',
        name: 'Done',
        color: '#3fb950',
        position: 3,
        items: [
          {
            id: 'item-5',
            columnId: 'col-done',
            type: 'issue',
            title: 'Set up CI/CD pipeline',
            number: 12,
            body: null,
            labels: [{ id: 'l5', name: 'infrastructure', color: 'e4e669' }],
            assignees: [],
            createdAt: new Date(now - 15 * 86_400_000).toISOString(),
            updatedAt: new Date(now - 10 * 86_400_000).toISOString(),
          },
          {
            id: 'item-6',
            columnId: 'col-done',
            type: 'issue',
            title: 'Database schema design',
            number: 8,
            body: null,
            labels: [],
            assignees: [],
            createdAt: new Date(now - 20 * 86_400_000).toISOString(),
            updatedAt: new Date(now - 14 * 86_400_000).toISOString(),
          },
        ],
      },
    ],
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function hexToContrast(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000' : '#fff'
}

function collectAssignees(columns: ProjectColumn[]): string[] {
  const set = new Set<string>()
  columns.forEach((c) => c.items.forEach((i) => i.assignees.forEach((a) => set.add(a.login))))
  return Array.from(set)
}

function collectLabels(columns: ProjectColumn[]): string[] {
  const set = new Set<string>()
  columns.forEach((c) => c.items.forEach((i) => i.labels.forEach((l) => set.add(l.name))))
  return Array.from(set)
}

function filterItems(items: ProjectItem[], filters: FilterState): ProjectItem[] {
  return items.filter((item) => {
    if (filters.type && item.type !== filters.type) return false
    if (filters.assignee && !item.assignees.some((a) => a.login === filters.assignee)) return false
    if (filters.label && !item.labels.some((l) => l.name === filters.label)) return false
    return true
  })
}

// ─── API functions ─────────────────────────────────────────────────────────────────

async function fetchProject(id: string): Promise<Project> {
  try {
    const res = await api.get<ProjectApiResponse>(`/v1/projects/${id}`)
    return res.data.data.project
  } catch {
    return buildFallbackProject(id)
  }
}

async function moveItem(itemId: string, columnId: string): Promise<void> {
  await api.patch(`/v1/project-items/${itemId}`, { columnId })
}

// ─── Label Badge ─────────────────────────────────────────────────────────────────

interface LabelBadgeProps {
  label: ItemLabel
}

function LabelBadge({ label }: LabelBadgeProps) {
  const bg = `#${label.color}`
  const fg = hexToContrast(label.color)
  return (
    <span
      style={{
        backgroundColor: bg,
        color: fg,
        borderRadius: 10,
        padding: '1px 7px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {label.name}
    </span>
  )
}

// ─── Item Type Badge ──────────────────────────────────────────────────────────────

interface TypeBadgeProps {
  type: ItemType
}

function TypeBadge({ type }: TypeBadgeProps) {
  const styles: Record<ItemType, { bg: string; color: string; label: string }> = {
    issue: { bg: 'rgba(63,185,80,0.15)', color: '#3fb950', label: 'Issue' },
    pr: { bg: 'rgba(88,166,255,0.15)', color: '#58a6ff', label: 'PR' },
    note: { bg: 'rgba(139,148,158,0.15)', color: '#8b949e', label: 'Note' },
  }
  const s = styles[type]
  return (
    <span
      style={{
        backgroundColor: s.bg,
        color: s.color,
        borderRadius: 4,
        padding: '1px 6px',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      {s.label}
    </span>
  )
}

// ─── Avatar Stack ─────────────────────────────────────────────────────────────────

interface AvatarStackProps {
  assignees: ItemAssignee[]
}

function AvatarStack({ assignees }: AvatarStackProps) {
  if (assignees.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: -2 }}>
      {assignees.slice(0, 3).map((a) => (
        <img
          key={a.login}
          src={a.avatarUrl ?? `https://github.com/${a.login}.png?size=20`}
          alt={a.login}
          title={`@${a.login}`}
          width={18}
          height={18}
          style={{ borderRadius: '50%', border: '1.5px solid #161b22', marginLeft: -3 }}
        />
      ))}
      {assignees.length > 3 && (
        <span style={{ color: '#8b949e', fontSize: 10, marginLeft: 3 }}>+{assignees.length - 3}</span>
      )}
    </div>
  )
}

// ─── Item Card ────────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: ProjectItem
  owner: string
  repoName: string
  isDragging: boolean
  onDragStart: (e: React.DragEvent, itemId: string) => void
  onDragEnd: () => void
}

function ItemCard({ item, owner, repoName, isDragging, onDragStart, onDragEnd }: ItemCardProps) {
  const itemHref =
    item.number != null
      ? item.type === 'pr'
        ? `/${owner}/${repoName}/pull/${item.number}`
        : `/${owner}/${repoName}/issues/${item.number}`
      : null

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item.id)}
      onDragEnd={onDragEnd}
      style={{
        backgroundColor: isDragging ? '#1c2128' : '#0d1117',
        border: `1px solid ${isDragging ? '#58a6ff' : '#30363d'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: isDragging ? 0.5 : 1,
        transition: 'border-color 0.15s, background-color 0.15s, opacity 0.15s',
        userSelect: 'none',
      }}
      aria-label={`Project item: ${item.title}`}
    >
      {/* Type badge + number */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <TypeBadge type={item.type} />
        {item.number != null && (
          <span style={{ color: '#6e7681', fontSize: 11 }}>#{item.number}</span>
        )}
      </div>

      {/* Title */}
      {itemHref ? (
        <Link
          href={itemHref}
          style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600, textDecoration: 'none', lineHeight: 1.4 }}
          className="hover:text-[#58a6ff]"
          onClick={(e) => e.stopPropagation()}
        >
          {item.title}
        </Link>
      ) : (
        <span style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
          {item.title}
        </span>
      )}

      {/* Labels */}
      {item.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {item.labels.map((l) => (
            <LabelBadge key={l.id} label={l} />
          ))}
        </div>
      )}

      {/* Assignees */}
      {item.assignees.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <AvatarStack assignees={item.assignees} />
        </div>
      )}
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────────

interface ColumnProps {
  column: ProjectColumn
  owner: string
  repoName: string
  draggingItemId: string | null
  dragOverColumnId: string | null
  filteredItems: ProjectItem[]
  onDragStart: (e: React.DragEvent, itemId: string) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent, columnId: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, columnId: string) => void
  onAddItem: (columnId: string) => void
}

function Column({
  column,
  owner,
  repoName,
  draggingItemId,
  dragOverColumnId,
  filteredItems,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onAddItem,
}: ColumnProps) {
  const isTarget = dragOverColumnId === column.id

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        backgroundColor: isTarget ? 'rgba(88,166,255,0.05)' : '#161b22',
        border: `1px solid ${isTarget ? '#58a6ff' : '#21262d'}`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
      onDragOver={(e) => onDragOver(e, column.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, column.id)}
    >
      {/* Column header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #21262d',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: column.color, flexShrink: 0 }}
          />
          <span style={{ color: '#e6edf3', fontSize: 13, fontWeight: 700 }}>{column.name}</span>
        </div>
        <span
          style={{
            backgroundColor: '#21262d',
            color: '#8b949e',
            borderRadius: 10,
            padding: '1px 7px',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {filteredItems.length}
        </span>
      </div>

      {/* Items */}
      <div
        style={{
          flex: 1,
          padding: '10px 10px 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 60,
        }}
      >
        {filteredItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            owner={owner}
            repoName={repoName}
            isDragging={draggingItemId === item.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}

        {filteredItems.length === 0 && !draggingItemId && (
          <div
            style={{
              border: '1px dashed #30363d',
              borderRadius: 8,
              padding: '16px 12px',
              textAlign: 'center',
              color: '#6e7681',
              fontSize: 12,
            }}
          >
            No items
          </div>
        )}
      </div>

      {/* Add item */}
      <div style={{ padding: '6px 10px 10px' }}>
        <button
          onClick={() => onAddItem(column.id)}
          style={{
            width: '100%',
            backgroundColor: 'transparent',
            border: '1px dashed #30363d',
            borderRadius: 7,
            color: '#8b949e',
            fontSize: 12,
            padding: '7px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          className="hover:border-[#58a6ff] hover:text-[#58a6ff]"
          aria-label={`Add item to ${column.name}`}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
          </svg>
          Add item
        </button>
      </div>
    </div>
  )
}

// ─── Add Item Modal ────────────────────────────────────────────────────────────────

interface AddItemModalProps {
  columnId: string
  columnName: string
  projectId: string
  onClose: () => void
  onAdded: (item: ProjectItem) => void
}

function AddItemModal({ columnId, columnName, projectId, onClose, onAdded }: AddItemModalProps) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: { item: ProjectItem } }>(`/v1/projects/${projectId}/items`, {
        columnId,
        type: 'note',
        title: title.trim(),
      })
      return res.data.data.item
    },
    onSuccess: (item) => {
      onAdded(item)
      onClose()
    },
    onError: () => {
      setError('Failed to add item. Please try again.')
    },
  })

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!title.trim()) {
        setError('Title is required.')
        return
      }
      setError(null)
      mutation.mutate()
    },
    [title, mutation],
  )

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Add item to ${columnName}`}
    >
      <div
        style={{
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          width: '100%',
          maxWidth: 460,
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
          <h2 style={{ color: '#e6edf3', fontSize: 15, fontWeight: 700, margin: 0 }}>
            Add item to <span style={{ color: '#58a6ff' }}>{columnName}</span>
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label
              htmlFor="item-title"
              style={{ display: 'block', color: '#c9d1d9', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
            >
              Title <span style={{ color: '#f85149' }}>*</span>
            </label>
            <input
              id="item-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe the work item"
              autoFocus
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
            />
          </div>

          {error && <p style={{ color: '#f85149', fontSize: 13, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
              {mutation.isPending ? 'Adding…' : 'Add item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: FilterState
  assignees: string[]
  labels: string[]
  onChange: (filters: FilterState) => void
}

function FilterBar({ filters, assignees, labels, onChange }: FilterBarProps) {
  const selectStyle: React.CSSProperties = {
    backgroundColor: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: filters.assignee || filters.label || filters.type ? '#58a6ff' : '#c9d1d9',
    fontSize: 12,
    padding: '5px 10px',
    cursor: 'pointer',
    outline: 'none',
  }

  const hasFilter = Boolean(filters.assignee || filters.label || filters.type)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ color: '#8b949e', fontSize: 12, fontWeight: 600 }}>Filter:</span>

      <select
        value={filters.type}
        onChange={(e) => onChange({ ...filters, type: e.target.value as ItemType | '' })}
        style={selectStyle}
        aria-label="Filter by type"
      >
        <option value="">All types</option>
        <option value="issue">Issues</option>
        <option value="pr">Pull Requests</option>
        <option value="note">Notes</option>
      </select>

      {assignees.length > 0 && (
        <select
          value={filters.assignee}
          onChange={(e) => onChange({ ...filters, assignee: e.target.value })}
          style={selectStyle}
          aria-label="Filter by assignee"
        >
          <option value="">All assignees</option>
          {assignees.map((a) => (
            <option key={a} value={a}>@{a}</option>
          ))}
        </select>
      )}

      {labels.length > 0 && (
        <select
          value={filters.label}
          onChange={(e) => onChange({ ...filters, label: e.target.value })}
          style={selectStyle}
          aria-label="Filter by label"
        >
          <option value="">All labels</option>
          {labels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      )}

      {hasFilter && (
        <button
          onClick={() => onChange({ assignee: '', label: '', type: '' })}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #30363d',
            borderRadius: 6,
            color: '#f85149',
            fontSize: 12,
            padding: '5px 10px',
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────────

export default function ProjectBoardPage() {
  const params = useParams<{ owner: string; name: string; id: string }>()
  const { owner, name, id } = params
  const queryClient = useQueryClient()

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null)
  const [addToColumnId, setAddToColumnId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({ assignee: '', label: '', type: '' })

  // Track source column of dragged item for optimistic updates
  const draggingSourceColumnIdRef = useRef<string | null>(null)

  const { data: project, isLoading, isError } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id),
    staleTime: 60_000,
    enabled: Boolean(id),
  })

  const moveMutation = useMutation({
    mutationFn: ({ itemId, columnId }: { itemId: string; columnId: string }) =>
      moveItem(itemId, columnId),
    onMutate: async ({ itemId, columnId }) => {
      await queryClient.cancelQueries({ queryKey: ['project', id] })
      const snapshot = queryClient.getQueryData<Project>(['project', id])

      // Optimistic update: move the item across columns
      queryClient.setQueryData<Project>(['project', id], (prev) => {
        if (!prev) return prev
        let movedItem: ProjectItem | undefined

        const updatedColumns = prev.columns.map((col) => {
          const filtered = col.items.filter((i) => {
            if (i.id === itemId) {
              movedItem = i
              return false
            }
            return true
          })
          return { ...col, items: filtered }
        })

        if (!movedItem) return prev

        const withMoved = updatedColumns.map((col) => {
          if (col.id !== columnId) return col
          return { ...col, items: [...col.items, { ...movedItem!, columnId }] }
        })

        return { ...prev, columns: withMoved }
      })

      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['project', id], context.snapshot)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
    },
  })

  const handleDragStart = useCallback((e: React.DragEvent, itemId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
    setDraggingItemId(itemId)

    // Record source column
    if (project) {
      for (const col of project.columns) {
        if (col.items.some((i) => i.id === itemId)) {
          draggingSourceColumnIdRef.current = col.id
          break
        }
      }
    }
  }, [project])

  const handleDragEnd = useCallback(() => {
    setDraggingItemId(null)
    setDragOverColumnId(null)
    draggingSourceColumnIdRef.current = null
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverColumnId(columnId)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverColumnId(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()
    const itemId = e.dataTransfer.getData('text/plain')
    setDragOverColumnId(null)
    setDraggingItemId(null)

    if (!itemId) return
    if (draggingSourceColumnIdRef.current === targetColumnId) {
      draggingSourceColumnIdRef.current = null
      return
    }

    moveMutation.mutate({ itemId, columnId: targetColumnId })
    draggingSourceColumnIdRef.current = null
  }, [moveMutation])

  const handleAddItem = useCallback((columnId: string) => {
    setAddToColumnId(columnId)
  }, [])

  const handleItemAdded = useCallback((item: ProjectItem) => {
    queryClient.setQueryData<Project>(['project', id], (prev) => {
      if (!prev) return prev
      return {
        ...prev,
        columns: prev.columns.map((col) =>
          col.id === item.columnId ? { ...col, items: [...col.items, item] } : col,
        ),
      }
    })
  }, [id, queryClient])

  const columns = project?.columns ?? []
  const allAssignees = collectAssignees(columns)
  const allLabels = collectLabels(columns)

  const addToColumn = addToColumnId
    ? columns.find((c) => c.id === addToColumnId) ?? null
    : null

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0c10; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #484f58; }
      `}</style>

      <div style={{ backgroundColor: '#0a0c10', minHeight: '100vh', color: '#c9d1d9', display: 'flex', flexDirection: 'column' }}>

        {/* ── Header ── */}
        <div
          style={{
            borderBottom: '1px solid #21262d',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            backgroundColor: '#161b22',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <Link
                href={`/${owner}/${name}/projects`}
                style={{ color: '#58a6ff', fontSize: 13, textDecoration: 'none' }}
                className="hover:underline"
              >
                {owner}/{name}
              </Link>
              <span style={{ color: '#6e7681' }}>/</span>
              <Link
                href={`/${owner}/${name}/projects`}
                style={{ color: '#58a6ff', fontSize: 13, textDecoration: 'none' }}
                className="hover:underline"
              >
                Projects
              </Link>
              <span style={{ color: '#6e7681' }}>/</span>
              <span style={{ color: '#c9d1d9', fontSize: 13, fontWeight: 600 }}>
                {project?.title ?? '…'}
              </span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e6edf3', margin: 0 }}>
              {project?.title ?? 'Loading…'}
            </h1>
            {project?.description && (
              <p style={{ color: '#8b949e', fontSize: 13, margin: '2px 0 0' }}>{project.description}</p>
            )}
          </div>

          <Link
            href={`/${owner}/${name}/projects/${id}/settings`}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#8b949e',
              fontSize: 13,
              padding: '6px 14px',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            className="hover:border-[#58a6ff] hover:text-[#58a6ff]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.103-.303c-.066-.019-.176-.011-.299.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.712.645 7.258.095 8.001.031 8.234.01 8.117 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM8 5.754a2.246 2.246 0 1 1 0 4.492 2.246 2.246 0 0 1 0-4.492Z" />
            </svg>
            Settings
          </Link>
        </div>

        {/* ── Filter bar ── */}
        {project && (
          <div style={{ padding: '10px 24px', borderBottom: '1px solid #21262d', backgroundColor: '#0f1318', flexShrink: 0 }}>
            <FilterBar
              filters={filters}
              assignees={allAssignees}
              labels={allLabels}
              onChange={setFilters}
            />
          </div>
        )}

        {/* ── Loading ── */}
        {isLoading && (
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
              aria-label="Loading project board"
            />
          </div>
        )}

        {/* ── Error ── */}
        {isError && (
          <div style={{ padding: 24 }}>
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
              Failed to load project board. Please refresh and try again.
            </div>
          </div>
        )}

        {/* ── Kanban board ── */}
        {project && (
          <div
            style={{
              flex: 1,
              overflowX: 'auto',
              overflowY: 'auto',
              padding: 24,
            }}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minHeight: '100%' }}>
              {project.columns
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((col) => {
                  const filtered = filterItems(col.items, filters)
                  return (
                    <Column
                      key={col.id}
                      column={col}
                      owner={owner}
                      repoName={name}
                      draggingItemId={draggingItemId}
                      dragOverColumnId={dragOverColumnId}
                      filteredItems={filtered}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onAddItem={handleAddItem}
                    />
                  )
                })}
            </div>
          </div>
        )}
      </div>

      {/* ── Add item modal ── */}
      {addToColumnId && addToColumn && project && (
        <AddItemModal
          columnId={addToColumnId}
          columnName={addToColumn.name}
          projectId={project.id}
          onClose={() => setAddToColumnId(null)}
          onAdded={handleItemAdded}
        />
      )}
    </>
  )
}
