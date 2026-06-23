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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocCategory = 'Installation' | 'Commands' | 'API' | 'Integrations' | 'Troubleshooting';

interface KBDoc {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  category: DocCategory;
  updatedAt: string;
  relevanceScore?: number;
}

// ---------------------------------------------------------------------------
// Static mock data — replace with API calls when the KB API is wired up
// ---------------------------------------------------------------------------

const MOCK_DOCS: KBDoc[] = [
  {
    id: 'install-cli',
    title: 'Installing the AITM CLI',
    excerpt:
      'Install the AITimeMachine CLI globally with npm or pnpm. The CLI requires Node.js 18+ and …',
    tags: ['cli', 'npm', 'installation'],
    category: 'Installation',
    updatedAt: '2026-06-18',
  },
  {
    id: 'install-vscode',
    title: 'VS Code Extension Setup',
    excerpt:
      'Install the AITM VS Code extension from the marketplace. After installation, sign in with …',
    tags: ['vscode', 'extension', 'installation'],
    category: 'Installation',
    updatedAt: '2026-06-15',
  },
  {
    id: 'cmd-checkpoint',
    title: 'aitm checkpoint',
    excerpt:
      'Create a named save point for the current working tree. Captures all tracked and untracked …',
    tags: ['cli', 'checkpoint', 'commands'],
    category: 'Commands',
    updatedAt: '2026-06-20',
  },
  {
    id: 'cmd-restore',
    title: 'aitm restore',
    excerpt:
      'Restore the working tree to a previous checkpoint or session. Supports partial restore …',
    tags: ['cli', 'restore', 'commands'],
    category: 'Commands',
    updatedAt: '2026-06-20',
  },
  {
    id: 'cmd-diff',
    title: 'aitm diff',
    excerpt:
      'Show the diff between the current working tree and a previous checkpoint. Outputs a git-style …',
    tags: ['cli', 'diff', 'commands'],
    category: 'Commands',
    updatedAt: '2026-06-19',
  },
  {
    id: 'api-rest-overview',
    title: 'REST API Overview',
    excerpt:
      'The AITM API follows REST conventions. All endpoints require a Bearer token obtained from …',
    tags: ['api', 'rest', 'auth'],
    category: 'API',
    updatedAt: '2026-06-17',
  },
  {
    id: 'api-sessions',
    title: 'Sessions API Reference',
    excerpt:
      'List, create, and delete sessions. A session is an ordered log of checkpoints for a single …',
    tags: ['api', 'sessions', 'reference'],
    category: 'API',
    updatedAt: '2026-06-17',
  },
  {
    id: 'integration-github',
    title: 'GitHub Actions Integration',
    excerpt:
      'Automatically create checkpoints on every push or pull request with the official AITM …',
    tags: ['github', 'ci', 'integrations'],
    category: 'Integrations',
    updatedAt: '2026-06-14',
  },
  {
    id: 'integration-claude',
    title: 'Claude / Anthropic Agent Integration',
    excerpt:
      'Wire AITM into Claude Code sessions so that every agentic run is backed up. Uses the MCP …',
    tags: ['claude', 'mcp', 'agent', 'integrations'],
    category: 'Integrations',
    updatedAt: '2026-06-13',
  },
  {
    id: 'trouble-restore-conflict',
    title: 'Restore fails with merge conflict',
    excerpt:
      'If aitm restore exits with a merge conflict error, the target checkpoint diverged from …',
    tags: ['troubleshooting', 'restore', 'conflict'],
    category: 'Troubleshooting',
    updatedAt: '2026-06-11',
  },
  {
    id: 'trouble-auth-token',
    title: 'Authentication token expired',
    excerpt:
      'When the CLI reports "token expired", run aitm login to refresh your credentials. Tokens …',
    tags: ['troubleshooting', 'auth', 'token'],
    category: 'Troubleshooting',
    updatedAt: '2026-06-10',
  },
];

const RECENT_DOCS = MOCK_DOCS.slice(0, 5);

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
// Naive client-side search with BM25-style scoring
// ---------------------------------------------------------------------------

function scoreDoc(doc: KBDoc, query: string): number {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;

  const haystack = `${doc.title} ${doc.excerpt} ${doc.tags.join(' ')}`.toLowerCase();
  let score = 0;

  for (const term of terms) {
    const titleHits = (doc.title.toLowerCase().match(new RegExp(term, 'g')) ?? []).length;
    const bodyHits = (haystack.match(new RegExp(term, 'g')) ?? []).length;
    score += titleHits * 3 + bodyHits;
  }
  return score;
}

function clientSearch(query: string, category: DocCategory | null): KBDoc[] {
  const q = query.trim();
  let results = category
    ? MOCK_DOCS.filter((d) => d.category === category)
    : MOCK_DOCS;

  if (q) {
    results = results
      .map((d) => ({ ...d, relevanceScore: scoreDoc(d, q) }))
      .filter((d) => (d.relevanceScore ?? 0) > 0)
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
  }

  return results;
}

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
  const [results, setResults] = useState<KBDoc[]>(MOCK_DOCS);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced search
  const runSearch = useCallback(
    (q: string, cat: DocCategory | null) => {
      setIsSearching(true);
      // Simulated async — swap for real fetch('/api/knowledge/search') when ready
      const id = setTimeout(() => {
        setResults(clientSearch(q, cat));
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
