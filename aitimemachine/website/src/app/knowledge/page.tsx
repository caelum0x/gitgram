'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  BookOpen,
  Download,
  Terminal,
  Code2,
  Puzzle,
  Wrench,
  Clock,
  Tag,
  ChevronRight,
  Command,
  Loader2,
  FileText,
  Zap,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { KB_DOCS, searchDocs, type DocCategory, type KBDoc } from './data';

const RECENT_DOCS = [...KB_DOCS]
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  .slice(0, 5);

// A single hit from the signed-in user's indexed workspace (code + embeddings).
interface WorkspaceHit {
  id: string;
  filePath: string;
  language: string | null;
  snippet: string | null;
}

interface KBSearchResponse {
  files?: Array<{ id: string; filePath: string; language: string | null; snippet: string | null }>;
  embeddings?: Array<{ id: string; filePath: string; language: string | null; snippet: string | null }>;
}

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

interface CategoryConfig {
  label: DocCategory;
  icon: React.FC<{ className?: string }>;
  color: string;
}

const CATEGORIES: CategoryConfig[] = [
  { label: 'Installation', icon: Download, color: 'text-emerald-400' },
  { label: 'Commands', icon: Terminal, color: 'text-blue-400' },
  { label: 'API', icon: Code2, color: 'text-purple-400' },
  { label: 'Integrations', icon: Puzzle, color: 'text-amber-400' },
  { label: 'Troubleshooting', icon: Wrench, color: 'text-rose-400' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryPill({
  config,
  active,
  onClick,
}: {
  config: CategoryConfig;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = config.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all',
        active
          ? 'border-white/20 bg-white/10 text-white'
          : 'border-white/5 bg-white/[0.03] text-white/50 hover:border-white/10 hover:bg-white/[0.06] hover:text-white/80',
      )}
    >
      <Icon className={cn('h-4 w-4', active ? config.color : 'text-current')} />
      {config.label}
    </button>
  );
}

function DocCard({ doc }: { doc: KBDoc }) {
  const categoryConfig = CATEGORIES.find((c) => c.label === doc.category);
  const Icon = categoryConfig?.icon ?? FileText;

  return (
    <Link
      href={`/knowledge/${doc.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-5 transition-all hover:border-white/15 hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5',
              categoryConfig?.color ?? 'text-white/50',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-medium text-white group-hover:text-white/90 leading-snug">
            {doc.title}
          </h3>
        </div>
        {doc.relevanceScore !== undefined && (
          <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-mono text-indigo-300">
            {Math.round(doc.relevanceScore * 10) / 10}
          </span>
        )}
      </div>

      <p className="text-sm text-white/50 leading-relaxed line-clamp-2">{doc.excerpt}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {doc.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-white/40"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0 text-[11px] text-white/25">
          <Clock className="h-3 w-3" />
          {doc.updatedAt}
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KnowledgePage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocCategory | null>(null);
  const [results, setResults] = useState<KBDoc[]>(KB_DOCS);
  const [isSearching, setIsSearching] = useState(false);
  const [workspaceHits, setWorkspaceHits] = useState<WorkspaceHit[]>([]);
  const [workspaceSearching, setWorkspaceSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced search over the curated knowledge base (always available).
  const runSearch = useCallback(
    (q: string, cat: DocCategory | null) => {
      setIsSearching(true);
      const id = setTimeout(() => {
        setResults(searchDocs(q, cat));
        setIsSearching(false);
      }, 120);
      return () => clearTimeout(id);
    },
    [],
  );

  useEffect(() => {
    const cleanup = runSearch(query, activeCategory);
    return cleanup;
  }, [query, activeCategory, runSearch]);

  // Augment with real results from the signed-in user's indexed workspace.
  // Anonymous visitors / outages degrade gracefully to docs-only results.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setWorkspaceHits([]);
      setWorkspaceSearching(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setWorkspaceSearching(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ query: trimmed, limit: '8' });
      fetch(`/api/knowledge-base/search?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? (res.json() as Promise<KBSearchResponse>) : null))
        .then((data) => {
          if (cancelled || !data) {
            if (!cancelled) setWorkspaceHits([]);
            return;
          }
          const hits = [...(data.files ?? []), ...(data.embeddings ?? [])]
            .filter((h) => h.filePath)
            .slice(0, 8)
            .map((h) => ({
              id: h.id,
              filePath: h.filePath,
              language: h.language ?? null,
              snippet: h.snippet ?? null,
            }));
          setWorkspaceHits(hits);
        })
        .catch(() => {
          if (!cancelled) setWorkspaceHits([]);
        })
        .finally(() => {
          if (!cancelled) setWorkspaceSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  // Cmd+K shortcut
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

  const toggleCategory = (cat: DocCategory) =>
    setActiveCategory((prev) => (prev === cat ? null : cat));

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <Navbar />

      {/* Hero search */}
      <section className="border-b border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent pb-12 pt-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
            <BookOpen className="h-3.5 w-3.5" />
            Knowledge Base
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            How can we help?
          </h1>
          <p className="mb-8 text-lg text-white/40">
            Search the AITM documentation, CLI reference, API guides, and
            troubleshooting articles.
          </p>

          {/* Search bar */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documentation…"
              className="h-14 rounded-xl border-white/10 bg-white/5 pl-12 pr-28 text-base text-white placeholder:text-white/25 focus-visible:border-white/20 focus-visible:ring-0"
            />
            <div className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1">
              <Command className="h-3 w-3 text-white/30" />
              <span className="text-xs text-white/30">K</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex gap-10 lg:gap-14">
          {/* Sidebar */}
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-8 space-y-8">
              {/* Categories */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/25">
                  Topics
                </p>
                <div className="flex flex-col gap-1.5">
                  {CATEGORIES.map((cat) => (
                    <CategoryPill
                      key={cat.label}
                      config={cat}
                      active={activeCategory === cat.label}
                      onClick={() => toggleCategory(cat.label)}
                    />
                  ))}
                </div>
              </div>

              {/* Recent docs */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/25">
                  Recently Updated
                </p>
                <ul className="space-y-2">
                  {RECENT_DOCS.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        href={`/knowledge/${doc.id}`}
                        className="flex items-start gap-2 text-sm text-white/40 transition-colors hover:text-white/70"
                      >
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="line-clamp-2 leading-snug">{doc.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          {/* Results */}
          <main className="min-w-0 flex-1">
            {/* Mobile category pills */}
            <div className="mb-6 flex flex-wrap gap-2 lg:hidden">
              {CATEGORIES.map((cat) => (
                <CategoryPill
                  key={cat.label}
                  config={cat}
                  active={activeCategory === cat.label}
                  onClick={() => toggleCategory(cat.label)}
                />
              ))}
            </div>

            {/* Result header */}
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm text-white/40">
                {isSearching ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Searching…
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-white/70">{results.length}</span>{' '}
                    {results.length === 1 ? 'article' : 'articles'}
                    {query && (
                      <>
                        {' '}
                        for{' '}
                        <span className="font-medium text-white/70">
                          &ldquo;{query}&rdquo;
                        </span>
                      </>
                    )}
                    {activeCategory && (
                      <>
                        {' '}
                        in{' '}
                        <span className="font-medium text-white/70">
                          {activeCategory}
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>
              {(query || activeCategory) && (
                <button
                  onClick={() => {
                    setQuery('');
                    setActiveCategory(null);
                  }}
                  className="text-xs text-white/30 underline-offset-2 hover:text-white/60 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Workspace results (signed-in users with indexed content) */}
            {(workspaceSearching || workspaceHits.length > 0) && (
              <div className="mb-8">
                <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/25">
                  <FileText className="h-3.5 w-3.5" />
                  From your workspace
                  {workspaceSearching && (
                    <Loader2 className="h-3 w-3 animate-spin text-white/30" />
                  )}
                </p>
                {workspaceHits.length > 0 && (
                  <ul className="space-y-2">
                    {workspaceHits.map((hit) => (
                      <li
                        key={hit.id}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <Code2 className="h-3.5 w-3.5 shrink-0 text-purple-400" />
                          <span className="truncate font-mono text-sm text-white/80">
                            {hit.filePath}
                          </span>
                          {hit.language && (
                            <Badge className="ml-auto shrink-0 bg-white/5 text-[10px] text-white/40">
                              {hit.language}
                            </Badge>
                          )}
                        </div>
                        {hit.snippet && (
                          <p className="mt-1.5 line-clamp-2 text-xs text-white/35">
                            {hit.snippet}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Doc grid */}
            {results.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <div className="rounded-full border border-white/10 bg-white/5 p-4">
                  <Zap className="h-6 w-6 text-white/20" />
                </div>
                <p className="text-sm text-white/40">
                  No articles found for{' '}
                  <span className="text-white/60">&ldquo;{query}&rdquo;</span>
                </p>
                <p className="text-xs text-white/25">
                  Try different keywords or browse by category
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {results.map((doc) => (
                  <DocCard key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
