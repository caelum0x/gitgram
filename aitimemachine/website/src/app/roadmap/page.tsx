'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, ChevronUp, Lightbulb, MessageSquare } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = 'CLI' | 'API' | 'Integrations' | 'AI';
type CategoryFilter = 'all' | Category;
type ColumnKey = 'now' | 'next' | 'later';

interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  category: Category;
  votes: number;
  target: string;
  column: ColumnKey;
}

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  description: string;
  accent: string;
  dot: string;
}

// ---------------------------------------------------------------------------
// Static configuration
// ---------------------------------------------------------------------------

const columns: ColumnConfig[] = [
  {
    key: 'now',
    label: 'Now',
    description: 'In active development',
    accent: 'border-blue-500/40 bg-blue-950/10',
    dot: 'bg-blue-500 shadow-lg shadow-blue-500/40',
  },
  {
    key: 'next',
    label: 'Next',
    description: 'Planned, up next',
    accent: 'border-purple-500/30 bg-purple-950/10',
    dot: 'bg-purple-500',
  },
  {
    key: 'later',
    label: 'Later',
    description: 'Exploring & researching',
    accent: 'border-gray-700 bg-gray-900/40',
    dot: 'bg-gray-600',
  },
];

const categoryConfig: Record<Category, { badge: string; ring: string }> = {
  CLI: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    ring: 'hover:border-emerald-500/40',
  },
  API: {
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    ring: 'hover:border-blue-500/40',
  },
  Integrations: {
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    ring: 'hover:border-amber-500/40',
  },
  AI: {
    badge: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/25',
    ring: 'hover:border-fuchsia-500/40',
  },
};

const categoryFilters: { label: string; value: CategoryFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'CLI', value: 'CLI' },
  { label: 'API', value: 'API' },
  { label: 'Integrations', value: 'Integrations' },
  { label: 'AI', value: 'AI' },
];

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const roadmapItems: RoadmapItem[] = [
  {
    id: 'multi-agent-conflict-map',
    title: 'Multi-agent conflict map',
    description:
      'Visualize when two or more AI agents touch the same files in overlapping checkpoints, so you can untangle who changed what before merging.',
    category: 'AI',
    votes: 412,
    target: 'Q3 2026',
    column: 'now',
  },
  {
    id: 'streaming-restore',
    title: 'Streaming restore for huge repos',
    description:
      'Restore the files you need first and stream the rest in the background. Cuts time-to-first-file from minutes to seconds on 100k+ file projects.',
    category: 'CLI',
    votes: 298,
    target: 'Q3 2026',
    column: 'now',
  },
  {
    id: 'public-rest-api',
    title: 'Public REST + GraphQL API',
    description:
      'A stable, documented API to create checkpoints, query history, and trigger restores from your own tooling and CI pipelines.',
    category: 'API',
    votes: 356,
    target: 'Q3 2026',
    column: 'now',
  },
  {
    id: 'jetbrains-plugin',
    title: 'JetBrains IDE plugin',
    description:
      'Native restore points in the IntelliJ, WebStorm, and PyCharm gutter — the same one-click experience as the VS Code extension.',
    category: 'Integrations',
    votes: 244,
    target: 'Q4 2026',
    column: 'next',
  },
  {
    id: 'semantic-checkpoint-search',
    title: 'Semantic checkpoint search',
    description:
      'Ask in plain language — "before the auth refactor broke login" — and jump straight to the right restore point using embeddings over your history.',
    category: 'AI',
    votes: 331,
    target: 'Q4 2026',
    column: 'next',
  },
  {
    id: 'github-actions-app',
    title: 'GitHub Actions checkpoint app',
    description:
      'Auto-checkpoint on every workflow run and post a restore link directly in the PR when an AI-generated change fails CI.',
    category: 'Integrations',
    votes: 187,
    target: 'Q4 2026',
    column: 'next',
  },
  {
    id: 'cli-watch-mode',
    title: 'CLI watch mode',
    description:
      'A long-running `aitm watch` that auto-checkpoints on meaningful file events and debounces noisy build output.',
    category: 'CLI',
    votes: 142,
    target: 'Q4 2026',
    column: 'next',
  },
  {
    id: 'webhooks-v2',
    title: 'Webhooks v2 with signed payloads',
    description:
      'HMAC-signed delivery, automatic retries, and per-event filtering so you can safely wire checkpoint events into external systems.',
    category: 'API',
    votes: 96,
    target: 'Q1 2027',
    column: 'later',
  },
  {
    id: 'agent-replay',
    title: 'Agent action replay',
    description:
      'Step through an agent’s tool calls and file edits frame by frame, then fork any frame into a new branch of work.',
    category: 'AI',
    votes: 268,
    target: 'Q1 2027',
    column: 'later',
  },
  {
    id: 'self-hosted',
    title: 'Self-hosted storage backend',
    description:
      'Point AITM at your own S3-compatible bucket or on-prem store for full data residency control.',
    category: 'API',
    votes: 173,
    target: 'Exploring',
    column: 'later',
  },
  {
    id: 'terminal-ui',
    title: 'Full-screen terminal UI',
    description:
      'A keyboard-driven TUI for browsing, diffing, and restoring checkpoints without leaving the terminal.',
    category: 'CLI',
    votes: 121,
    target: 'Exploring',
    column: 'later',
  },
  {
    id: 'slack-restore',
    title: 'Slack restore notifications',
    description:
      'Get a Slack message the moment a teammate restores shared state, with a one-click link to inspect the diff.',
    category: 'Integrations',
    votes: 88,
    target: 'Exploring',
    column: 'later',
  },
];

const SUGGEST_DISCUSSION_URL =
  'https://github.com/gitgram/aitimemachine/discussions/new?category=ideas';
const SUGGEST_MAILTO =
  'mailto:roadmap@aitimemachine.dev?subject=Feature%20suggestion';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RoadmapCardProps {
  item: RoadmapItem;
  voted: boolean;
  voteDelta: number;
  onUpvote: (id: string) => void;
}

function RoadmapCard({ item, voted, voteDelta, onUpvote }: RoadmapCardProps) {
  const cfg = categoryConfig[item.category];
  const total = item.votes + voteDelta;

  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-900/50 p-5 transition-colors ${cfg.ring}`}
    >
      <div className="flex items-start gap-3">
        {/* Upvote */}
        <button
          type="button"
          onClick={() => onUpvote(item.id)}
          aria-pressed={voted}
          aria-label={`Upvote ${item.title}`}
          className={`flex flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 flex-shrink-0 transition-colors ${
            voted
              ? 'border-blue-500/50 bg-blue-600/20 text-blue-400'
              : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-white'
          }`}
        >
          <ChevronUp className="w-4 h-4" />
          <span className="text-xs font-semibold tabular-nums">{total}</span>
        </button>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${cfg.badge}`}
            >
              {item.category}
            </span>
            <span className="text-[11px] text-gray-500 font-medium">
              {item.target}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-white leading-snug mb-1">
            {item.title}
          </h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            {item.description}
          </p>
        </div>
      </div>
    </div>
  );
}

interface RoadmapColumnProps {
  config: ColumnConfig;
  items: RoadmapItem[];
  votes: Record<string, boolean>;
  onUpvote: (id: string) => void;
}

function RoadmapColumn({ config, items, votes, onUpvote }: RoadmapColumnProps) {
  return (
    <div className="flex flex-col">
      <div
        className={`rounded-xl border px-4 py-3 mb-4 ${config.accent}`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
          <h2 className="text-base font-bold tracking-tight">{config.label}</h2>
          <span className="ml-auto text-xs text-gray-500 font-medium tabular-nums">
            {items.length}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1 pl-[18px]">
          {config.description}
        </p>
      </div>

      <div className="space-y-4">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-800 px-4 py-10 text-center text-xs text-gray-600">
            Nothing here for this filter.
          </div>
        ) : (
          items.map((item) => (
            <RoadmapCard
              key={item.id}
              item={item}
              voted={!!votes[item.id]}
              voteDelta={votes[item.id] ? 1 : 0}
              onUpvote={onUpvote}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RoadmapPage() {
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [votes, setVotes] = useState<Record<string, boolean>>({});

  function handleUpvote(id: string) {
    setVotes((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const filteredItems = useMemo(
    () =>
      filter === 'all'
        ? roadmapItems
        : roadmapItems.filter((item) => item.category === filter),
    [filter]
  );

  const itemsByColumn = useMemo(() => {
    const grouped: Record<ColumnKey, RoadmapItem[]> = {
      now: [],
      next: [],
      later: [],
    };
    for (const item of filteredItems) {
      grouped[item.column].push(item);
    }
    // Highest-voted first within each column.
    for (const key of Object.keys(grouped) as ColumnKey[]) {
      grouped[key] = [...grouped[key]].sort((a, b) => b.votes - a.votes);
    }
    return grouped;
  }, [filteredItems]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/30 via-gray-950 to-gray-950" />
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Badge className="mb-4 bg-blue-600/20 text-blue-400 border-blue-600/30">
            Public roadmap
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Where AITM is headed
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl">
            This is the same roadmap our team works from. Vote on what matters to
            you, suggest something new, and follow it from idea to shipped.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-7">
            <Button asChild>
              <a href={SUGGEST_DISCUSSION_URL} target="_blank" rel="noreferrer">
                <Lightbulb className="w-4 h-4 mr-2" />
                Suggest a feature
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/changelog">
                See what shipped
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <div className="sticky top-16 z-40 bg-gray-950/90 backdrop-blur-xl border-y border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest mr-2">
            Category
          </span>
          {categoryFilters.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
          {filter !== 'all' && (
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="ml-auto text-xs text-gray-500 hover:text-white transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columns.map((col) => (
            <RoadmapColumn
              key={col.key}
              config={col}
              items={itemsByColumn[col.key]}
              votes={votes}
              onUpvote={handleUpvote}
            />
          ))}
        </div>

        {/* Shipped column pointer */}
        <div className="mt-8 rounded-2xl border border-gray-800 bg-gradient-to-r from-green-950/20 to-gray-900/40 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-lg shadow-green-500/40" />
            <div>
              <h2 className="text-base font-bold tracking-tight">Shipped</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Everything that already made it out the door.
              </p>
            </div>
          </div>
          <Link
            href="/changelog"
            className="sm:ml-auto inline-flex items-center gap-2 text-sm font-medium text-green-400 hover:text-green-300 transition-colors"
          >
            Browse the changelog
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>

      {/* Suggest CTA */}
      <section className="bg-gray-900/40 border-t border-gray-800 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 mb-5">
            <Lightbulb className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-3">Missing something?</h2>
          <p className="text-gray-400 mb-7 max-w-md mx-auto">
            The best roadmap items come from people building with AITM every day.
            Open a discussion or drop us a note — we read every one.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild>
              <a href={SUGGEST_DISCUSSION_URL} target="_blank" rel="noreferrer">
                <MessageSquare className="w-4 h-4 mr-2" />
                Start a GitHub Discussion
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={SUGGEST_MAILTO}>Email the team</a>
            </Button>
          </div>
          <p className="text-xs text-gray-600 mt-6">
            Vote counts and statuses on this page are illustrative and refresh as
            we plan each cycle.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
