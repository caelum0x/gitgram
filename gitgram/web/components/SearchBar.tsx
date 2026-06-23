'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserSuggestion {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface RepoSuggestion {
  id: string;
  fullName: string;
  description: string | null;
  stars: number;
}

interface SuggestionsResponse {
  users: UserSuggestion[];
  repos: RepoSuggestion[];
}

type SuggestionItem =
  | { kind: 'recent'; query: string }
  | { kind: 'user'; user: UserSuggestion }
  | { kind: 'repo'; repo: RepoSuggestion }
  | { kind: 'search'; query: string };

interface SearchBarProps {
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_SEARCHES_KEY = 'gitgram:recentSearches';
const MAX_RECENT = 5;
const DEBOUNCE_MS = 200;

// ---------------------------------------------------------------------------
// Local-storage helpers (immutable read/write)
// ---------------------------------------------------------------------------

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = query.trim();
  if (!trimmed) return;
  const prev = getRecentSearches().filter((q) => q !== trimmed);
  const next = [trimmed, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchBar({ placeholder = 'Search...', className = '', autoFocus = false }: SearchBarProps) {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionsResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ---------------------------------------------------------------------------
  // Derived list of items shown in the dropdown
  // ---------------------------------------------------------------------------

  const buildItems = useCallback((): SuggestionItem[] => {
    const items: SuggestionItem[] = [];

    if (!query.trim()) {
      // Show recent searches when input is empty
      getRecentSearches().forEach((q) => items.push({ kind: 'recent', query: q }));
    } else {
      // Quick user results
      (suggestions?.users ?? []).slice(0, 3).forEach((user) =>
        items.push({ kind: 'user', user })
      );
      // Quick repo results
      (suggestions?.repos ?? []).slice(0, 3).forEach((repo) =>
        items.push({ kind: 'repo', repo })
      );
      // "Search for '…'" always last
      items.push({ kind: 'search', query: query.trim() });
    }

    return items;
  }, [query, suggestions]);

  const items = buildItems();

  // ---------------------------------------------------------------------------
  // Fetch suggestions (debounced)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();

    if (!query.trim()) {
      setSuggestions(null);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await api.get<SuggestionsResponse>('/search/suggestions', {
          params: { q: query.trim() },
          signal: controller.signal,
        });
        setSuggestions(response.data);
      } catch (err: unknown) {
        // Silently ignore aborted requests
        if (err instanceof Error && err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setSuggestions(null);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Reset active index whenever items change
  useEffect(() => {
    setActiveIndex(-1);
  }, [items.length, query]);

  // ---------------------------------------------------------------------------
  // Click-outside to close
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------

  function navigateToSearch(q: string) {
    if (!q.trim()) return;
    saveRecentSearch(q);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    setIsOpen(false);
    setQuery('');
  }

  function activateItem(item: SuggestionItem) {
    switch (item.kind) {
      case 'recent':
      case 'search':
        navigateToSearch(item.query);
        break;
      case 'user':
        saveRecentSearch(item.user.username);
        router.push(`/${item.user.username}`);
        setIsOpen(false);
        setQuery('');
        break;
      case 'repo':
        saveRecentSearch(item.repo.fullName);
        router.push(`/${item.repo.fullName}`);
        setIsOpen(false);
        setQuery('');
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < items.length) {
          activateItem(items[activeIndex]);
        } else {
          navigateToSearch(query);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setIsOpen(true);
  }

  function handleFocus() {
    setIsFocused(true);
    setIsOpen(true);
  }

  function handleBlur() {
    setIsFocused(false);
  }

  function handleClear() {
    setQuery('');
    setSuggestions(null);
    inputRef.current?.focus();
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function formatStars(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  const showDropdown = isOpen && (items.length > 0);

  return (
    <div
      ref={containerRef}
      className={[
        'relative',
        isFocused ? 'w-full' : 'w-full md:max-w-md',
        'transition-all duration-200',
        className,
      ].join(' ')}
    >
      {/* Input row */}
      <div className="relative flex items-center">
        {/* Search icon */}
        <span className="absolute left-3 text-gray-400 pointer-events-none" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </span>

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="search-suggestions"
          aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
          autoFocus={autoFocus}
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
        />

        {/* Clear button */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute top-full mt-1 left-0 right-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden"
        >
          {/* Section label: recent searches */}
          {!query.trim() && items.length > 0 && (
            <li className="px-3 pt-2 pb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recent searches</span>
            </li>
          )}

          {/* Section labels for query results */}
          {query.trim() && suggestions?.users && suggestions.users.length > 0 && (
            <li className="px-3 pt-2 pb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Users</span>
            </li>
          )}

          {items.map((item, idx) => {
            const isActive = idx === activeIndex;
            const baseClasses = `flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors ${
              isActive
                ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
            }`;

            // Insert repos section label before first repo item
            const prevItem = items[idx - 1];
            const isFirstRepo = item.kind === 'repo' && prevItem?.kind !== 'repo';
            const isFirstUser = item.kind === 'user' && prevItem?.kind !== 'user';

            return (
              <>
                {isFirstUser && query.trim() && (
                  null /* label already rendered above */
                )}
                {isFirstRepo && (
                  <li key={`label-repos-${idx}`} className="px-3 pt-2 pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Repositories</span>
                  </li>
                )}

                <li
                  key={`suggestion-${idx}`}
                  id={`suggestion-${idx}`}
                  role="option"
                  aria-selected={isActive}
                  className={baseClasses}
                  onPointerDown={(e) => {
                    // Use pointerdown so we fire before the input blur
                    e.preventDefault();
                    activateItem(item);
                  }}
                >
                  {item.kind === 'recent' && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="truncate">{item.query}</span>
                    </>
                  )}

                  {item.kind === 'user' && (
                    <>
                      {item.user.avatarUrl ? (
                        <Image
                          src={item.user.avatarUrl}
                          alt={item.user.username}
                          width={24}
                          height={24}
                          className="rounded-full shrink-0 object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 shrink-0 flex items-center justify-center text-white text-xs font-bold">
                          {item.user.username[0]?.toUpperCase() ?? '?'}
                        </span>
                      )}
                      <span className="font-medium truncate">{item.user.username}</span>
                      {item.user.displayName && item.user.displayName !== item.user.username && (
                        <span className="text-gray-400 truncate text-xs">{item.user.displayName}</span>
                      )}
                    </>
                  )}

                  {item.kind === 'repo' && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 11h8M8 15h5" />
                      </svg>
                      <span className="font-medium truncate flex-1">{item.repo.fullName}</span>
                      <span className="flex items-center gap-0.5 text-xs text-gray-400 shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {formatStars(item.repo.stars)}
                      </span>
                    </>
                  )}

                  {item.kind === 'search' && (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                      </svg>
                      <span>
                        Search for{' '}
                        <span className="font-semibold text-purple-600 dark:text-purple-400">
                          &ldquo;{item.query}&rdquo;
                        </span>
                      </span>
                    </>
                  )}
                </li>
              </>
            );
          })}
        </ul>
      )}
    </div>
  );
}
