'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Brain,
  MessageSquare,
  ListChecks,
  BookText,
  GitCommitHorizontal,
  Layers,
  Clock,
  Loader2,
  Sparkles,
  Database,
  ArrowRight,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://timemachine-api.gitgram.app';

// ---------------------------------------------------------------------------
// Types — mirror saved_contexts.source and the /v1/contexts/* responses
// ---------------------------------------------------------------------------

type MemorySource = 'conversation' | 'task' | 'library' | 'checkpoint';
type SourceFilter = 'all' | MemorySource;

interface MemoryEntry {
  id: string;
  source: MemorySource;
  title: string;
  snippet: string;
  tags: string[];
  tool: string | null;
  createdAt: string | null;
  /** Present only when results come from a search endpoint. */
  relevanceScore?: number;
}

/** Raw shape returned by GET /v1/contexts (list) and the search endpoints. */
interface RawContext {
  id: string;
  name?: string;
  description?: string | null;
  source?: string | null;
  tool?: string | null;
  tags?: string[] | null;
  created_at?: string | null;
  createdAt?: string | null;
  similarity_score?: number;
  matches?: Array<{ content: string; timestamp: string }>;
}

interface SearchResponse {
  query: string;
  results?: RawContext[];
  total?: number;
  search_type?: string;
}

interface ListResponse {
  data?: RawContext[];
}

// ---------------------------------------------------------------------------
// Source presentation config (color-coded per source)
// ---------------------------------------------------------------------------

interface SourceConfig {
  source: MemorySource;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
  /** Text color for the icon. */
  accent: string;
  /** Badge classes. */
  badge: string;
  /** Dot color for the stats panel. */
  dot: string;
}

const SOURCE_CONFIG: Record<MemorySource, SourceConfig> = {
  conversation: {
    source: 'conversation',
    label: 'Conversations',
    shortLabel: 'Chat',
    icon: MessageSquare,
    accent: 'text-sky-400',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
    dot: 'bg-sky-400',
  },
  task: {
    source: 'task',
    label: 'Tasks (beads)',
    shortLabel: 'Task',
    icon: ListChecks,
    accent: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    dot: 'bg-emerald-400',
  },
  library: {
    source: 'library',
    label: 'Library Docs (context7)',
    shortLabel: 'Docs',
    icon: BookText,
    accent: 'text-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
    dot: 'bg-violet-400',
  },
  checkpoint: {
    source: 'checkpoint',
    label: 'Checkpoints',
    shortLabel: 'Point',
    icon: GitCommitHorizontal,
    accent: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    dot: 'bg-amber-400',
  },
};

const FILTER_TABS: { label: string; value: SourceFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Conversations', value: 'conversation' },
  { label: 'Tasks (beads)', value: 'task' },
  { label: 'Library Docs (context7)', value: 'library' },
  { label: 'Checkpoints', value: 'checkpoint' },
];

// ---------------------------------------------------------------------------
// Normalisation — map raw API rows into MemoryEntry
// ---------------------------------------------------------------------------

function isMemorySource(value: string | null | undefined): value is MemorySource {
  return (
    value === 'conversation' ||
    value === 'task' ||
    value === 'library' ||
    value === 'checkpoint'
  );
}

function deriveSnippet(raw: RawContext): string {
  // Search/text results carry message-level matches; prefer those.
  if (raw.matches && raw.matches.length > 0) {
    return raw.matches[0].content;
  }
  if (raw.description && raw.description.trim().length > 0) {
    return raw.description;
  }
  return 'No description available.';
}

function normaliseEntry(raw: RawContext): MemoryEntry {
  const source = isMemorySource(raw.source) ? raw.source : 'conversation';
  return {
    id: raw.id,
    source,
    title: raw.name?.trim() || 'Untitled memory',
    snippet: deriveSnippet(raw),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    tool: raw.tool ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    relevanceScore:
      typeof raw.similarity_score === 'number' ? raw.similarity_score : undefined,
  };
}

function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return (
      window.localStorage.getItem('aitm_api_key') ||
      window.localStorage.getItem('apiKey')
    );
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchAllMemories(signal: AbortSignal): Promise<MemoryEntry[]> {
  const res = await fetch(`${API_BASE}/v1/contexts?limit=100`, {
    headers: authHeaders(),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Failed to load memories (${res.status})`);
  }
  const json = (await res.json()) as ListResponse;
  return (json.data ?? []).map(normaliseEntry);
}

/**
 * Semantic search with a graceful text-search fallback. The semantic endpoint
 * already falls back server-side, but if it errors entirely we try /search/text.
 */
async function searchMemories(
  query: string,
  signal: AbortSignal
): Promise<MemoryEntry[]> {
  const q = encodeURIComponent(query);

  try {
    const res = await fetch(
      `${API_BASE}/v1/contexts/search/semantic?q=${q}&limit=50`,
      { headers: authHeaders(), signal }
    );
    if (res.ok) {
      const json = (await res.json()) as SearchResponse;
      return (json.results ?? []).map(normaliseEntry);
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    // fall through to text search
  }

  const res = await fetch(
    `${API_BASE}/v1/contexts/search/text?q=${q}&limit=50`,
    { headers: authHeaders(), signal }
  );
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`);
  }
  const json = (await res.json()) as SearchResponse;
  return (json.results ?? []).map(normaliseEntry);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceBadge({ source }: { source: MemorySource }) {
  const cfg = SOURCE_CONFIG[source];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        cfg.badge
      )}
    >
      <Icon className="h-3 w-3" />
      {cfg.shortLabel}
    </span>
  );
}

function MemoryCard({ entry }: { entry: MemoryEntry }) {
  const cfg = SOURCE_CONFIG[entry.source];
  const Icon = cfg.icon;

  return (
    <Link
      href={`/memory/${entry.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-5 transition-all hover:border-white/15 hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5',
              cfg.accent
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="truncate text-sm font-medium text-white group-hover:text-white/90">
            {entry.title}
          </h3>
        </div>
        {entry.relevanceScore !== undefined && (
          <span
            className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-mono text-indigo-300"
            title="Relevance score"
          >
            {entry.relevanceScore.toFixed(2)}
          </span>
        )}
      </div>

      <p className="line-clamp-2 text-sm leading-relaxed text-white/50">
        {entry.snippet}
      </p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <SourceBadge source={entry.source} />
          {entry.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-white/40"
            >
              {tag}
            </span>
          ))}
        </div>
        {entry.createdAt && (
          <div className="flex shrink-0 items-center gap-1 text-[11px] text-white/25">
            <Clock className="h-3 w-3" />
            {new Date(entry.createdAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </Link>
  );
}

function StatsPanel({
  counts,
  total,
}: {
  counts: Record<MemorySource, number>;
  total: number;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Database className="h-4 w-4 text-white/40" />
        <h2 className="text-sm font-semibold text-white">Memory stats</h2>
      </div>

      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-white">{total}</span>
        <span className="text-xs text-white/40">entries remembered</span>
      </div>

      <ul className="space-y-2.5">
        {(Object.keys(SOURCE_CONFIG) as MemorySource[]).map((source) => {
          const cfg = SOURCE_CONFIG[source];
          return (
            <li
              key={source}
              className="flex items-center justify-between text-sm"
            >
              <span className="flex items-center gap-2 text-white/60">
                <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
                {cfg.label}
              </span>
              <span className="font-mono text-white/80">{counts[source]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HowItWorksPanel() {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-white/40" />
        <h2 className="text-sm font-semibold text-white">How memory works</h2>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-white/50">
        AITM unifies every memory engine into one searchable store. Conversations,
        Beads task DAGs, and Context7 library docs are all ingested into{' '}
        <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-white/70">
          saved_contexts
        </code>{' '}
        with embeddings — so a single semantic query spans all of them.
      </p>
      <ul className="space-y-2 text-sm text-white/50">
        <li className="flex items-start gap-2">
          <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span>
            <span className="text-white/70">beads</span> — task/issue DAG memory,
            ingested as{' '}
            <code className="font-mono text-[11px] text-white/60">source=task</code>.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <BookText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
          <span>
            <span className="text-white/70">context7</span> — up-to-date library
            docs, ingested as{' '}
            <code className="font-mono text-[11px] text-white/60">source=library</code>.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
          <span>
            Both reuse the existing embedding + semantic-search pipeline behind{' '}
            <code className="font-mono text-[11px] text-white/60">
              /v1/contexts/search/*
            </code>
            .
          </span>
        </li>
      </ul>
      <Link
        href="/docs"
        className="mt-4 inline-flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/70"
      >
        Read about the engines
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
        />
      ))}
    </div>
  );
}

function EmptyState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="rounded-full border border-white/10 bg-white/5 p-4">
        <Brain className="h-6 w-6 text-white/20" />
      </div>
      {query ? (
        <>
          <p className="text-sm text-white/40">
            Nothing remembered for{' '}
            <span className="text-white/60">&ldquo;{query}&rdquo;</span>
          </p>
          <button
            onClick={onClear}
            className="text-xs text-white/30 underline-offset-2 hover:text-white/60 hover:underline"
          >
            Clear search
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-white/40">No memories here yet</p>
          <p className="text-xs text-white/25">
            Conversations, tasks, and docs will appear as AITM works.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemoryPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Initial load of all memories.
  const loadAll = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchAllMemories(controller.signal)
      .then((data) => setEntries(data))
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'Failed to load memory');
        setEntries([]);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => loadAll(), [loadAll]);

  // Debounced semantic search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      // Empty query → fall back to the full list.
      return loadAll();
    }

    const controller = new AbortController();
    setSearching(true);
    setError(null);

    const timer = setTimeout(() => {
      searchMemories(q, controller.signal)
        .then((data) => setEntries(data))
        .catch((err: unknown) => {
          if ((err as Error).name === 'AbortError') return;
          setError((err as Error).message || 'Search failed');
          setEntries([]);
        })
        .finally(() => setSearching(false));
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, loadAll]);

  // Cmd+K focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Per-source counts are computed over the full (unfiltered) result set.
  const counts: Record<MemorySource, number> = {
    conversation: 0,
    task: 0,
    library: 0,
    checkpoint: 0,
  };
  for (const entry of entries) {
    counts[entry.source] += 1;
  }

  const visible =
    filter === 'all' ? entries : entries.filter((e) => e.source === filter);

  const isBusy = loading || searching;

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <Navbar />

      {/* Hero */}
      <section className="border-b border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent pb-12 pt-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
            <Brain className="h-3.5 w-3.5" />
            Unified Memory
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Everything AITM remembers, in one place
          </h1>
          <p className="mb-8 text-lg text-white/40">
            Conversations, Beads tasks, and Context7 library docs — unified into a
            single semantic memory you can search.
          </p>

          {/* Search bar */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory semantically…"
              className="h-14 rounded-xl border-white/10 bg-white/5 pl-12 pr-12 text-base text-white placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0"
            />
            {searching && (
              <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" />
            )}
          </div>
        </div>
      </section>

      {/* Source filter tabs */}
      <div className="sticky top-16 z-40 border-b border-white/5 bg-[#080808]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-6 py-3">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                filter === tab.value
                  ? 'bg-white/15 text-white'
                  : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/80'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:gap-14">
          {/* Results */}
          <main className="min-w-0 flex-1">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm text-white/40">
                {isBusy ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {searching ? 'Searching memory…' : 'Loading memory…'}
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-white/70">
                      {visible.length}
                    </span>{' '}
                    {visible.length === 1 ? 'memory' : 'memories'}
                    {query && (
                      <>
                        {' '}
                        for{' '}
                        <span className="font-medium text-white/70">
                          &ldquo;{query}&rdquo;
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>
              {(query || filter !== 'all') && (
                <button
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                  className="text-xs text-white/30 underline-offset-2 hover:text-white/60 hover:underline"
                >
                  Reset
                </button>
              )}
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
                {error}
              </div>
            )}

            {isBusy ? (
              <LoadingState />
            ) : visible.length === 0 ? (
              <EmptyState
                query={query}
                onClear={() => {
                  setQuery('');
                  setFilter('all');
                }}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {visible.map((entry) => (
                  <MemoryCard key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </main>

          {/* Sidebar */}
          <aside className="w-full shrink-0 lg:w-72">
            <div className="sticky top-32 space-y-6">
              <StatsPanel counts={counts} total={entries.length} />
              <HowItWorksPanel />
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
}
