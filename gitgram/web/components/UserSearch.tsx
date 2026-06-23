'use client'

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

interface UserSearchResult {
  id: string
  username: string
  displayName?: string
  avatar?: string
}

interface UserSearchApiResponse {
  users: UserSearchResult[]
}

interface UserSearchProps {
  onSelect?: (user: { username: string; id: string }) => void
  placeholder?: string
  className?: string
}

const GRADIENT_PALETTES = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-rose-500',
  'from-pink-500 to-fuchsia-600',
  'from-amber-500 to-yellow-400',
  'from-sky-500 to-indigo-600',
  'from-lime-500 to-green-600',
]

function getGradientForUsername(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) | 0
  }
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length]
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const { data } = await api.get<UserSearchApiResponse>('/v1/users/search', {
    params: { q: query, limit: 8 },
  })
  return data.users ?? []
}

export default function UserSearch({ onSelect, placeholder = 'Search users…', className = '' }: UserSearchProps) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const debouncedQuery = useDebounce(inputValue.trim(), 300)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const { data: results = [], isFetching } = useQuery<UserSearchResult[]>({
    queryKey: ['user-search', debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  })

  // Open dropdown whenever there is a qualifying query
  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      setIsOpen(true)
      setActiveIndex(-1)
    } else {
      setIsOpen(false)
    }
  }, [debouncedQuery])

  // Click-outside closes the dropdown
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleSelect = useCallback(
    (user: UserSearchResult) => {
      setInputValue('')
      setIsOpen(false)
      setActiveIndex(-1)
      onSelect?.({ username: user.username, id: user.id })
    },
    [onSelect],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen) return

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault()
          setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
          break
        }
        case 'ArrowUp': {
          event.preventDefault()
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
          break
        }
        case 'Enter': {
          event.preventDefault()
          if (activeIndex >= 0 && results[activeIndex]) {
            handleSelect(results[activeIndex])
          }
          break
        }
        case 'Escape': {
          event.preventDefault()
          setIsOpen(false)
          setActiveIndex(-1)
          inputRef.current?.blur()
          break
        }
        default:
          break
      }
    },
    [isOpen, activeIndex, results, handleSelect],
  )

  const showDropdown = isOpen && debouncedQuery.length >= 2
  const showEmpty = showDropdown && !isFetching && results.length === 0

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search input */}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-foreground/50">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </span>

        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls="user-search-listbox"
          aria-activedescendant={activeIndex >= 0 ? `user-search-option-${activeIndex}` : undefined}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-foreground/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />

        {/* Loading spinner */}
        {isFetching && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg
              className="h-4 w-4 animate-spin text-accent"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-label="Loading"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </span>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {showEmpty ? (
            <p className="px-4 py-3 text-center text-sm text-foreground/60">No users found</p>
          ) : (
            <ul
              ref={listRef}
              id="user-search-listbox"
              role="listbox"
              aria-label="User search results"
              className="max-h-72 overflow-y-auto"
            >
              {results.map((user, index) => {
                const isActive = index === activeIndex
                const gradient = getGradientForUsername(user.username)
                const initial = user.username[0]?.toUpperCase() ?? '?'

                return (
                  <li
                    key={user.id}
                    id={`user-search-option-${index}`}
                    role="option"
                    aria-selected={isActive}
                    className={`flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 ${
                      isActive ? 'bg-hover' : 'hover:bg-hover'
                    }`}
                  >
                    <Link
                      href={`/@${user.username}`}
                      className="flex flex-1 items-center gap-3 min-w-0"
                      onClick={() => handleSelect(user)}
                      tabIndex={-1}
                    >
                      {/* Avatar */}
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                        {user.avatar ? (
                          <Image
                            src={user.avatar}
                            alt={user.username}
                            fill
                            sizes="36px"
                            className="object-cover"
                          />
                        ) : (
                          <div
                            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}
                            aria-hidden="true"
                          >
                            <span className="text-sm font-semibold text-white">{initial}</span>
                          </div>
                        )}
                      </div>

                      {/* Text */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">@{user.username}</p>
                        {user.displayName && (
                          <p className="truncate text-xs text-foreground/60">{user.displayName}</p>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
