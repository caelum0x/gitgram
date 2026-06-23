'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import {
  AdvancedSearchModal,
  DEFAULT_FILTERS,
  type SearchFilters,
  type ContentType,
} from '@/components/AdvancedSearchModal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SavedSearch {
  id: string
  name: string
  filters: SearchFilters
  notify: boolean
  createdAt: string
}

interface RecentSearch {
  query: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAVED_KEY = 'gitgram_saved_searches'
const RECENT_KEY = 'gitgram_recent_searches'

const TYPE_LABELS: Record<ContentType, string> = {
  users: 'People',
  repos: 'Repos',
  posts: 'Posts',
  snippets: 'Snippets',
  hashtags: 'Hashtags',
}

// ---------------------------------------------------------------------------
// localStorage fallback
// ---------------------------------------------------------------------------

function readLocalSaved(): SavedSearch[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    return raw ? (JSON.parse(raw) as SavedSearch[]) : []
  } catch {
    return []
  }
}

function writeLocalSaved(items: SavedSearch[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SAVED_KEY, JSON.stringify(items))
}

function readRecent(): RecentSearch[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as string[]) : []
    return parsed.map((query) => ({ query }))
  } catch {
    return []
  }
}

function newId(): string {
  return `ss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------
// Build a /search URL from filters
// ---------------------------------------------------------------------------

function filtersToSearchUrl(filters: SearchFilters): string {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  const primaryType = filters.contentTypes[0]
  if (primaryType && primaryType !== 'repos') {
    const map: Record<ContentType, string> = {
      users: 'people',
      repos: 'repos',
      posts: 'posts',
      snippets: 'snippets',
      hashtags: 'hashtags',
    }
    params.set('type', map[primaryType])
  }
  if (filters.sort !== 'relevance') params.set('sort', filters.sort)
  return `/search?${params.toString()}`
}

function filterChips(filters: SearchFilters): string[] {
  const chips: string[] = []
  filters.contentTypes.forEach((t) => chips.push(TYPE_LABELS[t]))
  filters.languages.forEach((l) => chips.push(l))
  if (filters.minStars > 0) chips.push(`★ ${filters.minStars.toLocaleString()}+`)
  if (filters.minLikes > 0) chips.push(`♥ ${filters.minLikes.toLocaleString()}+`)
  if (filters.dateFrom || filters.dateTo) {
    chips.push(`${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`)
  }
  return chips
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SavedSearchesPage() {
  const router = useRouter()
  const [saved, setSaved] = useState<SavedSearch[]>([])
  const [recent, setRecent] = useState<RecentSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SavedSearch | null>(null)

  // -------------------------------------------------------------------------
  // Load saved searches — API first, localStorage fallback
  // -------------------------------------------------------------------------

  const loadSaved = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/search/saved')
      const list = Array.isArray(data) ? data : (data?.searches ?? [])
      setSaved(list as SavedSearch[])
    } catch {
      setSaved(readLocalSaved())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSaved()
    setRecent(readRecent())
  }, [loadSaved])

  // -------------------------------------------------------------------------
  // Mutations — each writes through to the API, falling back to localStorage
  // -------------------------------------------------------------------------

  const persistLocal = (next: SavedSearch[]) => {
    setSaved(next)
    writeLocalSaved(next)
  }

  const handleSave = async (filters: SearchFilters) => {
    const name = window.prompt('Name this saved search', editing?.name ?? filters.query)?.trim()
    if (!name) return

    const entry: SavedSearch = {
      id: editing?.id ?? newId(),
      name,
      filters,
      notify: editing?.notify ?? false,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }

    const next = editing
      ? saved.map((s) => (s.id === editing.id ? entry : s))
      : [entry, ...saved]

    try {
      if (editing) {
        await api.post(`/search/saved`, entry)
      } else {
        await api.post('/search/saved', entry)
      }
      setSaved(next)
    } catch {
      persistLocal(next)
    }

    setModalOpen(false)
    setEditing(null)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this saved search?')) return
    const next = saved.filter((s) => s.id !== id)
    try {
      await api.delete(`/search/saved/${id}`)
      setSaved(next)
    } catch {
      persistLocal(next)
    }
  }

  const handleToggleNotify = async (id: string) => {
    const next = saved.map((s) => (s.id === id ? { ...s, notify: !s.notify } : s))
    const target = next.find((s) => s.id === id)
    try {
      if (target) await api.post('/search/saved', target)
      setSaved(next)
    } catch {
      persistLocal(next)
    }
  }

  const handleRun = (s: SavedSearch) => {
    router.push(filtersToSearchUrl(s.filters))
  }

  const handleEdit = (s: SavedSearch) => {
    setEditing(s)
    setModalOpen(true)
  }

  const handleCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const handleSaveRecent = (query: string) => {
    setEditing({
      id: newId(),
      name: query,
      filters: { ...DEFAULT_FILTERS, query },
      notify: false,
      createdAt: new Date().toISOString(),
    })
    setModalOpen(true)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Saved Searches</h1>
            <p className="text-sm text-[var(--foreground-secondary)]">
              Save advanced searches and get notified of new results.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="shrink-0 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--primary)' }}
          >
            + New search
          </button>
        </div>

        {/* Saved list */}
        <section className="mb-10">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl animate-pulse"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                />
              ))}
            </div>
          ) : saved.length === 0 ? (
            <div
              className="text-center py-14 rounded-xl"
              style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}
            >
              <p className="text-sm font-medium text-[var(--foreground)] mb-1">No saved searches yet</p>
              <p className="text-xs text-[var(--foreground-secondary)]">
                Create one to track new repos, posts, or people automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {saved.map((s) => (
                <article
                  key={s.id}
                  className="p-4 rounded-xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-[var(--foreground)] truncate">{s.name}</h2>
                      {s.filters.query && (
                        <p className="text-xs text-[var(--foreground-secondary)] truncate">
                          &ldquo;{s.filters.query}&rdquo;
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRun(s)}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: 'var(--accent)' }}
                    >
                      Run
                    </button>
                  </div>

                  {/* Filter chips */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {filterChips(s.filters).map((chip, i) => (
                      <span
                        key={`${chip}-${i}`}
                        className="px-2 py-0.5 rounded-md text-xs"
                        style={{
                          background: 'var(--surface-secondary)',
                          color: 'var(--foreground-secondary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Notifications toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={s.notify}
                        onChange={() => handleToggleNotify(s.id)}
                        className="accent-[var(--primary)]"
                      />
                      <span className="text-xs text-[var(--foreground-secondary)]">
                        Notify me of new results
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(s)}
                        className="text-xs font-medium text-[var(--primary)] hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        className="text-xs font-medium text-[var(--error)] hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Recent searches — savable in one click */}
        {recent.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-secondary)] mb-3">
              Recent searches
            </h2>
            <div className="space-y-2">
              {recent.slice(0, 8).map((r, i) => (
                <div
                  key={`${r.query}-${i}`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/search?q=${encodeURIComponent(r.query)}`)}
                    className="flex-1 min-w-0 text-left text-sm text-[var(--foreground)] truncate"
                  >
                    {r.query}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveRecent(r.query)}
                    className="shrink-0 text-xs font-medium text-[var(--primary)] hover:underline"
                  >
                    Save this search
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Builder modal — handles both create and edit */}
      <AdvancedSearchModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        initialFilters={editing?.filters}
        onSearch={(filters) => router.push(filtersToSearchUrl(filters))}
        onSaveSearch={handleSave}
      />
    </div>
  )
}
