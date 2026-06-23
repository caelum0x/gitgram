'use client'

import { useEffect, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Shared types — exported so the saved-searches page can reuse the shape
// ---------------------------------------------------------------------------

export type ContentType = 'users' | 'repos' | 'posts' | 'snippets' | 'hashtags'

export type SortOption = 'relevance' | 'recent' | 'popular' | 'stars'

export interface SearchFilters {
  query: string
  contentTypes: ContentType[]
  languages: string[]
  dateFrom: string
  dateTo: string
  sort: SortOption
  minStars: number
  minLikes: number
}

interface AdvancedSearchModalProps {
  isOpen: boolean
  onClose: () => void
  /** Pre-populate the builder (e.g. when editing a saved search) */
  initialFilters?: Partial<SearchFilters>
  /** Fired when the user clicks "Search" */
  onSearch: (filters: SearchFilters) => void
  /** Fired when the user clicks "Save search" */
  onSaveSearch?: (filters: SearchFilters) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTENT_TYPES: { key: ContentType; label: string }[] = [
  { key: 'users', label: 'People' },
  { key: 'repos', label: 'Repositories' },
  { key: 'posts', label: 'Posts' },
  { key: 'snippets', label: 'Snippets' },
  { key: 'hashtags', label: 'Hashtags' },
]

const LANGUAGES: string[] = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Go',
  'Rust',
  'Java',
  'C++',
  'C#',
  'Ruby',
  'PHP',
  'Swift',
  'Kotlin',
]

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'relevance', label: 'Most relevant' },
  { key: 'recent', label: 'Most recent' },
  { key: 'popular', label: 'Most popular' },
  { key: 'stars', label: 'Most stars' },
]

const MAX_STARS = 50000
const MAX_LIKES = 10000

export const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  contentTypes: ['repos'],
  languages: [],
  dateFrom: '',
  dateTo: '',
  sort: 'relevance',
  minStars: 0,
  minLikes: 0,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeFilters(partial?: Partial<SearchFilters>): SearchFilters {
  return { ...DEFAULT_FILTERS, ...partial }
}

function toggleInArray<T>(arr: readonly T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdvancedSearchModal({
  isOpen,
  onClose,
  initialFilters,
  onSearch,
  onSaveSearch,
}: AdvancedSearchModalProps) {
  const [filters, setFilters] = useState<SearchFilters>(mergeFilters(initialFilters))
  const backdropRef = useRef<HTMLDivElement>(null)

  // Reset filters whenever the modal (re)opens
  useEffect(() => {
    if (isOpen) setFilters(mergeFilters(initialFilters))
  }, [isOpen, initialFilters])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const update = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) onClose()
  }

  const canSearch = filters.query.trim().length > 0 && filters.contentTypes.length > 0

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="advanced-search-title"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        >
          <h2 id="advanced-search-title" className="text-sm font-semibold text-[var(--foreground)]">
            Advanced search
          </h2>
          <button
            onClick={onClose}
            aria-label="Close advanced search"
            className="p-1 rounded-lg text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Query */}
          <div>
            <label htmlFor="adv-query" className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">
              Search query
            </label>
            <input
              id="adv-query"
              type="text"
              value={filters.query}
              onChange={(e) => update('query', e.target.value)}
              placeholder="Keywords, name, topic…"
              autoComplete="off"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
            />
          </div>

          {/* Content type checkboxes */}
          <fieldset>
            <legend className="block text-xs font-medium text-[var(--foreground-secondary)] mb-2">Content type</legend>
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPES.map((ct) => {
                const active = filters.contentTypes.includes(ct.key)
                return (
                  <button
                    key={ct.key}
                    type="button"
                    onClick={() => update('contentTypes', toggleInArray(filters.contentTypes, ct.key))}
                    aria-pressed={active}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    style={{
                      background: active ? 'var(--primary)' : 'var(--background)',
                      color: active ? '#fff' : 'var(--foreground-secondary)',
                      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    {ct.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Language multi-select */}
          <fieldset>
            <legend className="block text-xs font-medium text-[var(--foreground-secondary)] mb-2">Languages</legend>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => {
                const active = filters.languages.includes(lang)
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => update('languages', toggleInArray(filters.languages, lang))}
                    aria-pressed={active}
                    className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: active ? 'rgba(88,166,255,0.15)' : 'var(--background)',
                      color: active ? 'var(--primary)' : 'var(--foreground-secondary)',
                      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    {lang}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Date range */}
          <div>
            <span className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">Date range</span>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                aria-label="From date"
                value={filters.dateFrom}
                onChange={(e) => update('dateFrom', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', colorScheme: 'dark' }}
              />
              <input
                type="date"
                aria-label="To date"
                value={filters.dateTo}
                onChange={(e) => update('dateTo', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', colorScheme: 'dark' }}
              />
            </div>
          </div>

          {/* Sort */}
          <div>
            <label htmlFor="adv-sort" className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">
              Sort by
            </label>
            <select
              id="adv-sort"
              value={filters.sort}
              onChange={(e) => update('sort', e.target.value as SortOption)}
              className="w-full px-3 py-2.5 rounded-lg text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Engagement sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="adv-stars" className="text-xs font-medium text-[var(--foreground-secondary)]">
                  Minimum stars
                </label>
                <span className="text-xs font-semibold text-[var(--primary)]">
                  {filters.minStars.toLocaleString()}+
                </span>
              </div>
              <input
                id="adv-stars"
                type="range"
                min={0}
                max={MAX_STARS}
                step={100}
                value={filters.minStars}
                onChange={(e) => update('minStars', Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="adv-likes" className="text-xs font-medium text-[var(--foreground-secondary)]">
                  Minimum likes
                </label>
                <span className="text-xs font-semibold text-[var(--primary)]">
                  {filters.minLikes.toLocaleString()}+
                </span>
              </div>
              <input
                id="adv-likes"
                type="range"
                min={0}
                max={MAX_LIKES}
                step={50}
                value={filters.minLikes}
                onChange={(e) => update('minLikes', Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          className="sticky bottom-0 flex items-center justify-end gap-2.5 px-5 py-4"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
        >
          {onSaveSearch && (
            <button
              type="button"
              onClick={() => onSaveSearch(filters)}
              disabled={!canSearch}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--foreground)] transition-colors disabled:opacity-40"
              style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}
            >
              Save search
            </button>
          )}
          <button
            type="button"
            onClick={() => onSearch(filters)}
            disabled={!canSearch}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ background: 'var(--primary)' }}
          >
            Search
          </button>
        </div>
      </div>
    </div>
  )
}

export default AdvancedSearchModal
