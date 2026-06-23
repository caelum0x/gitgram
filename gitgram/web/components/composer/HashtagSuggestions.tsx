'use client'

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TagSuggestion {
  name: string
  postCount: number
}

interface TagSuggestionsApiResponse {
  tags?: TagSuggestion[]
  data?: TagSuggestion[]
}

interface HashtagSuggestionsProps {
  value: string
  onInsert: (hashtag: string) => void
  cursorPosition: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the hashtag query that the cursor is currently sitting inside.
 * Returns null when the cursor is not inside a hashtag token.
 */
function getActiveHashtagQuery(value: string, cursorPosition: number): string | null {
  const textUpToCursor = value.slice(0, cursorPosition)
  // Match the last # that is either at the start or preceded by whitespace
  const match = textUpToCursor.match(/(^|\s)#(\w*)$/)
  if (!match) return null
  // Return the word portion after #; empty string means bare #
  return match[2]
}

async function fetchTagSuggestions(query: string, limit: number): Promise<TagSuggestion[]> {
  try {
    const { data } = await api.get<TagSuggestionsApiResponse | TagSuggestion[]>(
      '/v1/tags/suggestions',
      { params: { q: query, limit } },
    )
    // Normalise response envelope
    if (Array.isArray(data)) return data
    const envelope = data as TagSuggestionsApiResponse
    return envelope.tags ?? envelope.data ?? []
  } catch {
    // Fallback: try the search endpoint
    const { data } = await api.get<TagSuggestionsApiResponse | TagSuggestion[]>(
      '/v1/search',
      { params: { type: 'tags', q: query, limit } },
    )
    if (Array.isArray(data)) return data
    const envelope = data as TagSuggestionsApiResponse
    return envelope.tags ?? envelope.data ?? []
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HashtagSuggestions({
  value,
  onInsert,
  cursorPosition,
}: HashtagSuggestionsProps) {
  const [activeQuery, setActiveQuery] = useState<string | null>(null)
  const [debouncedQuery, setDebouncedQuery] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Detect whether the cursor is inside a hashtag token
  useEffect(() => {
    const raw = getActiveHashtagQuery(value, cursorPosition)
    setActiveQuery(raw)

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(raw)
      setSelectedIndex(0)
    }, 200)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [value, cursorPosition])

  const isOpen = activeQuery !== null
  // When query is empty (bare #) fetch trending top 5; otherwise fetch up to 8 matches
  const limit = debouncedQuery === '' ? 5 : 8
  const queryKey = debouncedQuery === '' ? 'trending' : debouncedQuery ?? ''

  const { data: suggestions = [] } = useQuery<TagSuggestion[]>({
    queryKey: ['hashtag-suggestions', queryKey, limit],
    queryFn: () => fetchTagSuggestions(queryKey, limit),
    enabled: isOpen && debouncedQuery !== null,
    staleTime: 30 * 1000,
  })

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0)
  }, [suggestions])

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleInsert = useCallback(
    (tag: TagSuggestion) => {
      onInsert(tag.name)
    },
    [onInsert],
  )

  // Keyboard navigation — called by the parent via onKeyDown forwarding or
  // directly if this component renders an invisible listener.
  // We attach a document-level keydown while the dropdown is open so the
  // parent does not need to wire anything up.
  useEffect(() => {
    if (!isOpen || suggestions.length === 0) return

    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (!['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) return
      e.preventDefault()

      if (e.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % suggestions.length)
      } else if (e.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
      } else if (e.key === 'Enter') {
        handleInsert(suggestions[selectedIndex])
      } else if (e.key === 'Escape') {
        setActiveQuery(null)
        setDebouncedQuery(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, suggestions, selectedIndex, handleInsert])

  if (!isOpen || suggestions.length === 0) return null

  return (
    <div
      role="listbox"
      aria-label="Hashtag suggestions"
      className="absolute z-50 mt-1 w-64 bg-card border border-border rounded-xl shadow-lg overflow-hidden"
    >
      {debouncedQuery === '' && (
        <div className="px-3 pt-2 pb-1">
          <span className="text-xs font-semibold text-foreground-secondary uppercase tracking-wide">
            Trending
          </span>
        </div>
      )}

      <ul ref={listRef} className="max-h-56 overflow-y-auto py-1">
        {suggestions.map((tag, index) => (
          <li
            key={tag.name}
            role="option"
            aria-selected={index === selectedIndex}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => handleInsert(tag)}
            className={`flex items-center justify-between px-3 py-2 cursor-pointer select-none transition-colors ${
              index === selectedIndex
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-surface-secondary'
            }`}
          >
            <span className="font-medium text-sm">
              <span className={index === selectedIndex ? 'text-primary' : 'text-foreground-secondary'}>
                #
              </span>
              {tag.name}
            </span>
            <span className="text-xs text-foreground-secondary tabular-nums ml-3 flex-shrink-0">
              {formatPostCount(tag.postCount)}
            </span>
          </li>
        ))}
      </ul>

      <div className="px-3 py-1.5 border-t border-border bg-surface">
        <p className="text-[10px] text-foreground-secondary">
          <kbd className="font-mono">↑↓</kbd> navigate &middot;{' '}
          <kbd className="font-mono">↵</kbd> insert &middot;{' '}
          <kbd className="font-mono">Esc</kbd> close
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function formatPostCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M posts`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K posts`
  return `${count} post${count !== 1 ? 's' : ''}`
}
