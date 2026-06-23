'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
} from 'react';
import Link from 'next/link';
import CodeSnippetCard from '@/components/CodeSnippetCard';
import { snippetService } from '@/services/snippetService';
import type { Snippet as ServiceSnippet } from '@/services/snippetService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape expected by <CodeSnippetCard> */
interface CardSnippet {
  id: string;
  title: string;
  language: string;
  code: string;
  author: {
    username: string;
    avatarUrl?: string;
  };
  likes: number;
  comments: number;
  createdAt: string;
  isLiked?: boolean;
}

type Tab = 'trending' | 'latest';

type Language =
  | 'All'
  | 'TypeScript'
  | 'JavaScript'
  | 'Python'
  | 'Go'
  | 'Rust'
  | 'Java'
  | 'C++'
  | 'Swift'
  | 'Kotlin'
  | 'Ruby'
  | 'PHP';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGES: Language[] = [
  'All',
  'TypeScript',
  'JavaScript',
  'Python',
  'Go',
  'Rust',
  'Java',
  'C++',
  'Swift',
  'Kotlin',
  'Ruby',
  'PHP',
];

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map the API Snippet shape to the shape expected by CodeSnippetCard */
function toCardSnippet(s: ServiceSnippet): CardSnippet {
  return {
    id: s.id,
    title: s.title ?? 'Untitled Snippet',
    language: s.language,
    code: s.code,
    author: {
      username: s.user.username,
      avatarUrl: s.user.avatar,
    },
    likes: s.likesCount,
    comments: 0,
    createdAt: s.createdAt,
    isLiked: s.isLiked,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div
      className="rounded-xl border animate-pulse overflow-hidden"
      style={{ backgroundColor: '#1A1A2E', borderColor: '#2D2D50' }}
    >
      {/* header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="w-8 h-8 rounded-full" style={{ backgroundColor: '#2D2D50' }} />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-3 w-24 rounded" style={{ backgroundColor: '#2D2D50' }} />
          <div className="h-2.5 w-16 rounded" style={{ backgroundColor: '#2D2D50' }} />
        </div>
        <div className="h-6 w-14 rounded" style={{ backgroundColor: '#2D2D50' }} />
      </div>
      {/* title */}
      <div className="px-4 pb-3">
        <div className="h-4 w-48 rounded" style={{ backgroundColor: '#2D2D50' }} />
      </div>
      {/* code block */}
      <div className="px-4 pb-4">
        <div className="rounded-lg h-36" style={{ backgroundColor: '#12122A' }} />
      </div>
      {/* footer */}
      <div
        className="flex items-center justify-between px-4 py-3 border-t"
        style={{ borderColor: '#2D2D50' }}
      >
        <div className="flex gap-4">
          <div className="h-3.5 w-10 rounded" style={{ backgroundColor: '#2D2D50' }} />
          <div className="h-3.5 w-10 rounded" style={{ backgroundColor: '#2D2D50' }} />
        </div>
        <div className="h-3.5 w-16 rounded" style={{ backgroundColor: '#2D2D50' }} />
      </div>
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4">
      <svg
        className="w-16 h-16 opacity-30"
        fill="none"
        stroke="#7C3AED"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.2}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
      <p className="text-lg font-semibold" style={{ color: '#E2E8F0' }}>
        No snippets found
      </p>
      <p className="text-sm text-center max-w-xs" style={{ color: '#94A3B8' }}>
        Try a different language filter or search term, or be the first to share
        a snippet with the community.
      </p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={onClear}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          style={{ backgroundColor: '#2D2D50', color: '#E2E8F0' }}
        >
          Clear filters
        </button>
        <Link
          href="/snippets/create"
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          style={{ backgroundColor: '#7C3AED', color: '#FFFFFF' }}
        >
          Create snippet
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SnippetsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('trending');
  const [activeLanguage, setActiveLanguage] = useState<Language>('All');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [snippets, setSnippets] = useState<CardSnippet[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounce search input ──────────────────────────────────────────────
  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 400);

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchInput]);

  // ── Reset list when filters change ────────────────────────────────────
  useEffect(() => {
    setSnippets([]);
    setPage(1);
    setTotalPages(1);
    setError(null);
  }, [activeTab, activeLanguage, debouncedSearch]);

  // ── Fetch snippets ─────────────────────────────────────────────────────
  const fetchSnippets = useCallback(
    async (pageNum: number, append: boolean) => {
      if (pageNum === 1) {
        setIsLoading(true);
      } else {
        setIsFetchingMore(true);
      }
      setError(null);

      try {
        if (activeTab === 'trending') {
          const raw = await snippetService.getTrendingSnippets({
            language: activeLanguage !== 'All' ? activeLanguage : undefined,
            limit: PAGE_SIZE,
          });
          const cards = raw.map(toCardSnippet);
          const filtered = debouncedSearch
            ? cards.filter(
                (c) =>
                  c.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                  (c.code && c.code.toLowerCase().includes(debouncedSearch.toLowerCase()))
              )
            : cards;
          setSnippets(filtered);
          setTotalPages(1);
        } else {
          const res = await snippetService.getSnippets({
            language: activeLanguage !== 'All' ? activeLanguage : undefined,
            page: pageNum,
            limit: PAGE_SIZE,
          });
          const cards = res.snippets.map(toCardSnippet);
          const filtered = debouncedSearch
            ? cards.filter(
                (c) =>
                  c.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                  (c.code && c.code.toLowerCase().includes(debouncedSearch.toLowerCase()))
              )
            : cards;
          setSnippets((prev) => (append ? [...prev, ...filtered] : filtered));
          setTotalPages(res.totalPages);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to load snippets';
        setError(message);
      } finally {
        setIsLoading(false);
        setIsFetchingMore(false);
      }
    },
    [activeTab, activeLanguage, debouncedSearch]
  );

  // Initial + filter-change fetch
  useEffect(() => {
    fetchSnippets(1, false);
  }, [fetchSnippets]);

  // Load-more fetch
  useEffect(() => {
    if (page > 1) {
      fetchSnippets(page, true);
    }
  }, [page, fetchSnippets]);

  // ── Infinite scroll ────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'latest') return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isFetchingMore && !isLoading && page < totalPages) {
          setPage((prev) => prev + 1);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, isFetchingMore, isLoading, page, totalPages]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
  }, []);

  const handleLanguageChange = useCallback((lang: Language) => {
    setActiveLanguage(lang);
  }, []);

  const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
  }, []);

  const handleLike = useCallback(async (id: string) => {
    try {
      const result = await snippetService.likeSnippet(id);
      setSnippets((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                isLiked: result.liked,
                likes: result.liked ? s.likes + 1 : s.likes - 1,
              }
            : s
        )
      );
    } catch {
      // silently ignore — optimistic rollback not needed for this interaction
    }
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveLanguage('All');
    setSearchInput('');
    setDebouncedSearch('');
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#0F0F1A', color: '#E2E8F0' }}
    >
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* ── Page header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#E2E8F0' }}>
              Code Snippets
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#94A3B8' }}>
              Discover, share, and reuse developer-crafted snippets
            </p>
          </div>
          <Link
            href="/snippets/create"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            style={{ backgroundColor: '#7C3AED', color: '#FFFFFF' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Snippet
          </Link>
        </div>

        {/* ── Search bar ── */}
        <div className="relative mb-5">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: '#64748B' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <input
            type="search"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Search snippets by title or content…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors focus:ring-2 focus:ring-purple-500"
            style={{
              backgroundColor: '#1A1A2E',
              border: '1px solid #2D2D50',
              color: '#E2E8F0',
            }}
            aria-label="Search snippets"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-purple-500"
              style={{ color: '#64748B' }}
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Tabs ── */}
        <div
          className="flex gap-1 p-1 rounded-xl mb-5 w-fit"
          style={{ backgroundColor: '#1A1A2E', border: '1px solid #2D2D50' }}
          role="tablist"
          aria-label="Snippet feed tabs"
        >
          {(['trending', 'latest'] as Tab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => handleTabChange(tab)}
              className="px-5 py-1.5 rounded-lg text-sm font-semibold capitalize transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              style={
                activeTab === tab
                  ? { backgroundColor: '#7C3AED', color: '#FFFFFF' }
                  : { color: '#94A3B8' }
              }
            >
              {tab === 'trending' ? '🔥 Trending' : '🕐 Latest'}
            </button>
          ))}
        </div>

        {/* ── Language filter pills ── */}
        <div
          className="flex flex-wrap gap-2 mb-7"
          role="group"
          aria-label="Filter by language"
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              onClick={() => handleLanguageChange(lang)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              style={
                activeLanguage === lang
                  ? {
                      backgroundColor: '#7C3AED',
                      color: '#FFFFFF',
                      border: '1px solid #7C3AED',
                    }
                  : {
                      backgroundColor: 'transparent',
                      color: '#94A3B8',
                      border: '1px solid #2D2D50',
                    }
              }
              aria-pressed={activeLanguage === lang}
            >
              {lang}
            </button>
          ))}
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6 text-sm"
            style={{
              backgroundColor: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#FCA5A5',
            }}
            role="alert"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
            <button
              onClick={() => fetchSnippets(page, false)}
              className="ml-auto underline underline-offset-2 hover:no-underline focus:outline-none"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Snippet grid ── */}
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 480px), 1fr))' }}
        >
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
            : snippets.length === 0
            ? <EmptyState onClear={handleClearFilters} />
            : snippets.map((snippet) => (
                <CodeSnippetCard
                  key={snippet.id}
                  snippet={snippet}
                  onLike={handleLike}
                />
              ))}

          {/* Skeleton rows while paginating */}
          {isFetchingMore &&
            Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={`more-${i}`} />)}
        </div>

        {/* ── Infinite scroll sentinel (latest tab only) ── */}
        {activeTab === 'latest' && (
          <div ref={sentinelRef} className="h-4 mt-4" aria-hidden="true" />
        )}

        {/* ── End-of-list indicator ── */}
        {!isLoading && !isFetchingMore && snippets.length > 0 && activeTab === 'latest' && page >= totalPages && (
          <p className="text-center text-sm mt-6 pb-4" style={{ color: '#4B5563' }}>
            You&apos;ve seen all snippets
          </p>
        )}
      </div>
    </div>
  );
}
