'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentType = 'all' | 'posts' | 'snippets' | 'repos' | 'reels';
export type Language =
  | 'TypeScript'
  | 'JavaScript'
  | 'Python'
  | 'Go'
  | 'Rust'
  | 'Java'
  | 'Other';
export type TimePeriod = 'all' | 'today' | 'week' | 'month';
export type SortBy = 'latest' | 'most_liked' | 'most_viewed' | 'trending';

export interface FeedFilters {
  contentTypes: ContentType[];
  languages: Language[];
  timePeriod: TimePeriod;
  sortBy: SortBy;
  followingOnly: boolean;
}

interface FeedFiltersProps {
  onFiltersChange: (filters: FeedFilters) => void;
  currentFilters: FeedFilters;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'gitgram:feedFilters';

const DEFAULT_FILTERS: FeedFilters = {
  contentTypes: ['all'],
  languages: [],
  timePeriod: 'all',
  sortBy: 'latest',
  followingOnly: false,
};

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'posts', label: 'Posts' },
  { value: 'snippets', label: 'Snippets' },
  { value: 'repos', label: 'Repos' },
  { value: 'reels', label: 'Reels' },
];

const LANGUAGE_OPTIONS: Language[] = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Go',
  'Rust',
  'Java',
  'Other',
];

const TIME_PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const SORT_BY_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'most_liked', label: 'Most liked' },
  { value: 'most_viewed', label: 'Most viewed' },
  { value: 'trending', label: 'Trending' },
];

// ---------------------------------------------------------------------------
// localStorage helpers (immutable reads)
// ---------------------------------------------------------------------------

function loadFiltersFromStorage(): FeedFilters | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FeedFilters) : null;
  } catch {
    return null;
  }
}

function saveFiltersToStorage(filters: FeedFilters): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Storage may be unavailable in private mode
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDefaultFilters(filters: FeedFilters): boolean {
  return (
    filters.contentTypes.length === 1 &&
    filters.contentTypes[0] === 'all' &&
    filters.languages.length === 0 &&
    filters.timePeriod === 'all' &&
    filters.sortBy === 'latest' &&
    !filters.followingOnly
  );
}

function buildActiveChips(
  filters: FeedFilters
): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];

  if (!filters.contentTypes.includes('all')) {
    filters.contentTypes.forEach((ct) => {
      const opt = CONTENT_TYPE_OPTIONS.find((o) => o.value === ct);
      if (opt) chips.push({ key: `ct:${ct}`, label: opt.label });
    });
  }

  filters.languages.forEach((lang) => {
    chips.push({ key: `lang:${lang}`, label: lang });
  });

  if (filters.timePeriod !== 'all') {
    const opt = TIME_PERIOD_OPTIONS.find((o) => o.value === filters.timePeriod);
    if (opt) chips.push({ key: `time:${filters.timePeriod}`, label: opt.label });
  }

  if (filters.sortBy !== 'latest') {
    const opt = SORT_BY_OPTIONS.find((o) => o.value === filters.sortBy);
    if (opt) chips.push({ key: `sort:${filters.sortBy}`, label: opt.label });
  }

  if (filters.followingOnly) {
    chips.push({ key: 'following', label: 'Following only' });
  }

  return chips;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeedFilters({ onFiltersChange, currentFilters }: FeedFiltersProps) {
  const [filters, setFilters] = useState<FeedFilters>(() => {
    const stored = loadFiltersFromStorage();
    return stored ?? currentFilters;
  });
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Sync loaded/stored filters up to parent on mount
  useEffect(() => {
    onFiltersChange(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = useCallback(
    (next: FeedFilters) => {
      setFilters(next);
      saveFiltersToStorage(next);
      onFiltersChange(next);
    },
    [onFiltersChange]
  );

  function toggleContentType(value: ContentType) {
    let next: ContentType[];
    if (value === 'all') {
      next = ['all'];
    } else {
      const without = filters.contentTypes.filter((c) => c !== 'all' && c !== value);
      const alreadySelected = filters.contentTypes.includes(value);
      next = alreadySelected
        ? without.length === 0
          ? ['all']
          : without
        : [...without, value];
    }
    applyFilters({ ...filters, contentTypes: next });
  }

  function toggleLanguage(lang: Language) {
    const already = filters.languages.includes(lang);
    const next = already
      ? filters.languages.filter((l) => l !== lang)
      : [...filters.languages, lang];
    applyFilters({ ...filters, languages: next });
  }

  function setTimePeriod(value: TimePeriod) {
    applyFilters({ ...filters, timePeriod: value });
  }

  function setSortBy(value: SortBy) {
    applyFilters({ ...filters, sortBy: value });
  }

  function toggleFollowingOnly() {
    applyFilters({ ...filters, followingOnly: !filters.followingOnly });
  }

  function resetFilters() {
    applyFilters({ ...DEFAULT_FILTERS });
  }

  function dismissChip(key: string) {
    if (key.startsWith('ct:')) {
      const value = key.slice(3) as ContentType;
      toggleContentType(value);
    } else if (key.startsWith('lang:')) {
      const lang = key.slice(5) as Language;
      toggleLanguage(lang);
    } else if (key.startsWith('time:')) {
      applyFilters({ ...filters, timePeriod: 'all' });
    } else if (key.startsWith('sort:')) {
      applyFilters({ ...filters, sortBy: 'latest' });
    } else if (key === 'following') {
      applyFilters({ ...filters, followingOnly: false });
    }
  }

  const hasActiveFilters = !isDefaultFilters(filters);
  const activeChips = buildActiveChips(filters);

  return (
    <div className="w-full">
      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30"
            >
              {chip.label}
              <button
                type="button"
                onClick={() => dismissChip(chip.key)}
                aria-label={`Remove ${chip.label} filter`}
                className="ml-0.5 hover:text-white transition-colors"
              >
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </span>
          ))}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] underline transition-colors"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {/* Toggle button (mobile) */}
      <button
        type="button"
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="flex items-center gap-2 text-sm font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] mb-3 transition-colors md:hidden"
        aria-expanded={!isCollapsed}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        Filters
        {hasActiveFilters && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--primary)] text-white text-xs font-bold">
            {activeChips.length}
          </span>
        )}
        <svg
          className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Filter panel */}
      <div
        className={[
          'rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-5',
          'md:block',
          isCollapsed ? 'hidden' : 'block',
        ].join(' ')}
      >
        {/* Content type */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-secondary)] mb-2">
            Content type
          </p>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPE_OPTIONS.map((opt) => {
              const active =
                opt.value === 'all'
                  ? filters.contentTypes.includes('all')
                  : filters.contentTypes.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleContentType(opt.value)}
                  className={[
                    'px-3 py-1 rounded-full text-sm font-medium border transition-colors',
                    active
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'bg-transparent text-[var(--foreground-secondary)] border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--foreground)]',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Language */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-secondary)] mb-2">
            Language
          </p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((lang) => {
              const active = filters.languages.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={[
                    'px-3 py-1 rounded-full text-sm font-medium border transition-colors',
                    active
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-transparent text-[var(--foreground-secondary)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--foreground)]',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time period + Sort by (two columns on md+) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Time period */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-secondary)] mb-2">
              Time period
            </p>
            <div className="space-y-1.5">
              {TIME_PERIOD_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="radio"
                    name="timePeriod"
                    value={opt.value}
                    checked={filters.timePeriod === opt.value}
                    onChange={() => setTimePeriod(opt.value)}
                    className="accent-[var(--primary)] w-4 h-4"
                  />
                  <span className="text-sm text-[var(--foreground-secondary)] group-hover:text-[var(--foreground)] transition-colors">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Sort by */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground-secondary)] mb-2">
              Sort by
            </p>
            <div className="space-y-1.5">
              {SORT_BY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="radio"
                    name="sortBy"
                    value={opt.value}
                    checked={filters.sortBy === opt.value}
                    onChange={() => setSortBy(opt.value)}
                    className="accent-[var(--primary)] w-4 h-4"
                  />
                  <span className="text-sm text-[var(--foreground-secondary)] group-hover:text-[var(--foreground)] transition-colors">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Following only toggle */}
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Following only</p>
            <p className="text-xs text-[var(--foreground-secondary)]">
              Only show posts from people you follow
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={filters.followingOnly}
            onClick={toggleFollowingOnly}
            className={[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--surface)]',
              filters.followingOnly ? 'bg-[var(--primary)]' : 'bg-[var(--surface-secondary)]',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                filters.followingOnly ? 'translate-x-6' : 'translate-x-1',
              ].join(' ')}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

export default FeedFilters;
