'use client'

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

interface UserResult {
  id: string
  username: string
  displayName?: string
  avatar?: string
}

interface ApiSearchResponse {
  users?: UserResult[]
}

interface MentionSuggestionsProps {
  value: string
  onInsert: (username: string) => void
  cursorPosition: number
}

const DEBOUNCE_MS = 200
const MAX_RESULTS = 6

function extractMentionQuery(value: string, cursorPosition: number): string | null {
  const textBeforeCursor = value.substring(0, cursorPosition)
  const match = textBeforeCursor.match(/@(\w*)$/)
  return match ? match[1] : null
}

async function searchUsers(query: string): Promise<UserResult[]> {
  const { data } = await api.get<ApiSearchResponse | UserResult[]>('/users/search', {
    params: { q: query, limit: MAX_RESULTS },
  })
  if (Array.isArray(data)) return data
  return (data as ApiSearchResponse).users ?? []
}

export default function MentionSuggestions({
  value,
  onInsert,
  cursorPosition,
}: MentionSuggestionsProps) {
  const [debouncedQuery, setDebouncedQuery] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const rawQuery = extractMentionQuery(value, cursorPosition)

  // Debounce the query update
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (rawQuery === null) {
      setDebouncedQuery(null)
      return
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(rawQuery)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [rawQuery])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [debouncedQuery])

  const isOpen = debouncedQuery !== null && debouncedQuery.length >= 1

  const { data: users = [], isFetching } = useQuery<UserResult[]>({
    queryKey: ['mention-search', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery!),
    enabled: isOpen,
    staleTime: 30_000,
  })

  const handleSelect = useCallback(
    (username: string) => {
      onInsert(username)
    },
    [onInsert]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!isOpen || users.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % users.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + users.length) % users.length)
          break
        case 'Enter':
          e.preventDefault()
          handleSelect(users[selectedIndex].username)
          break
        case 'Escape':
          e.preventDefault()
          setDebouncedQuery(null)
          break
      }
    },
    [isOpen, users, selectedIndex, handleSelect]
  )

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    // Capture keyboard events so parent can delegate to this component
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="absolute left-0 right-0 top-full mt-1 z-50"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden">
        {isFetching && users.length === 0 ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
            No users found for &ldquo;{debouncedQuery}&rdquo;
          </p>
        ) : (
          <ul ref={listRef} role="listbox" aria-label="User suggestions">
            {users.map((user, index) => (
              <li
                key={user.id}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => handleSelect(user.username)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors select-none ${
                  index === selectedIndex
                    ? 'bg-blue-50 dark:bg-blue-950'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }`}
              >
                {/* Avatar */}
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 dark:text-blue-400 text-sm font-semibold">
                      {user.username[0]?.toUpperCase() ?? '?'}
                    </span>
                  </div>
                )}

                {/* Text */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                    @{user.username}
                  </p>
                  {user.displayName && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {user.displayName}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
