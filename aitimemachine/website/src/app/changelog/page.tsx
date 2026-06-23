'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Rss } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChangeType = 'feature' | 'fix' | 'breaking';
type FilterType = 'all' | ChangeType;

interface Change {
  type: ChangeType;
  text: string;
}

interface Version {
  version: string;
  date: string;
  summary: string;
  changes: Change[];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const versions: Version[] = [
  {
    version: '2.0.0',
    date: 'June 2026',
    summary: 'Complete rewrite of the restore engine with GitHub integration and team support.',
    changes: [
      { type: 'feature', text: 'GitHub integration: auto-checkpoint before every AI-generated PR merge' },
      { type: 'feature', text: 'Team restore points: share named checkpoints across your entire org' },
      { type: 'feature', text: 'New web dashboard with visual timeline and diff viewer' },
      { type: 'feature', text: 'Shared checkpoint library: bookmark and annotate restore points for teammates' },
      { type: 'feature', text: 'Admin dashboard with usage analytics and per-member restore history' },
      { type: 'feature', text: 'SSO / SAML support for Team plan' },
      { type: 'feature', text: 'Audit log: full record of every restore, checkpoint, and delete action' },
      { type: 'fix', text: 'Fixed race condition when two AI agents checkpoint the same project simultaneously' },
      { type: 'fix', text: 'Fixed VS Code extension losing connection after host machine sleep' },
      { type: 'breaking', text: 'CLI flag --restore-id renamed to --point — update any scripts using the old flag' },
      { type: 'breaking', text: 'Local checkpoint format v1 is no longer readable; run `aitm migrate` to upgrade' },
    ],
  },
  {
    version: '1.9.0',
    date: 'April 2026',
    summary: 'Cloud sync goes GA, VS Code extension reaches stable, and MCP protocol upgraded to v2.',
    changes: [
      { type: 'feature', text: 'Cloud sync is now generally available for all Pro users' },
      { type: 'feature', text: 'VS Code extension 1.0 — stable release with one-click restore from the sidebar' },
      { type: 'feature', text: 'MCP protocol upgraded to v2 — smaller payload, bidirectional streaming' },
      { type: 'feature', text: 'Webhook integrations: POST to any URL when a checkpoint is created or restored' },
      { type: 'feature', text: '`aitm diff <point-a> <point-b>` — compare two restore points side by side' },
      { type: 'fix', text: 'Fixed checkpoint metadata missing terminal history on Windows WSL2' },
      { type: 'fix', text: 'Fixed CLI hanging when project directory contained a broken symlink' },
      { type: 'fix', text: 'Reduced cloud sync bandwidth by 40% with delta compression' },
    ],
  },
  {
    version: '1.8.0',
    date: 'February 2026',
    summary: 'AI context preservation overhaul and new bisect command for root-cause debugging.',
    changes: [
      { type: 'feature', text: '`aitm bisect "<command>"` — binary search your checkpoint history to find when a test started failing' },
      { type: 'feature', text: 'AI context preservation now captures full Claude / Cursor / Windsurf conversation history' },
      { type: 'feature', text: 'Environment variable snapshots included in every checkpoint automatically' },
      { type: 'feature', text: 'New `--dry-run` flag for restore: previews changed files before applying' },
      { type: 'feature', text: 'Configurable auto-checkpoint interval via `aitm config set auto-checkpoint-interval <minutes>`' },
      { type: 'fix', text: 'Fixed `aitm undo` not reverting .env files when dotfiles mode was disabled' },
      { type: 'fix', text: 'Fixed incorrect timestamp display in UTC±12 timezones' },
      { type: 'fix', text: 'Improved restore reliability for projects with >50k files' },
      { type: 'breaking', text: 'Config key `autoSave` renamed to `autoCheckpoint` in aitm.config.json' },
    ],
  },
  {
    version: '1.7.0',
    date: 'December 2025',
    summary: 'VS Code extension beta, Claude Code integration, and significant performance improvements.',
    changes: [
      { type: 'feature', text: 'VS Code extension beta — restore points visible in the Activity Bar' },
      { type: 'feature', text: 'Native Claude Code integration via MCP — Claude can checkpoint and restore without leaving the chat' },
      { type: 'feature', text: '`aitm before "<description>" --restore` — natural-language search over checkpoint messages' },
      { type: 'feature', text: 'Checkpoint compression: local storage footprint reduced by up to 60%' },
      { type: 'feature', text: 'Progress indicator for large restores with estimated time remaining' },
      { type: 'fix', text: 'Fixed MCP server crashing when checkpoint count exceeded 1000' },
      { type: 'fix', text: 'Fixed restore overwriting unrelated open files in VS Code' },
      { type: 'fix', text: 'Improved error messages when restore fails due to locked files' },
    ],
  },
  {
    version: '1.6.0',
    date: 'October 2025',
    summary: 'Initial MCP integration, Cursor support, and core performance foundation.',
    changes: [
      { type: 'feature', text: 'MCP protocol support — works with any MCP-compatible AI client' },
      { type: 'feature', text: 'Cursor IDE integration via MCP' },
      { type: 'feature', text: 'Windsurf integration via MCP' },
      { type: 'feature', text: '`aitm search "<query>"` — full-text search across all checkpoint messages and file diffs' },
      { type: 'feature', text: 'Initial cloud sync beta for Pro users' },
      { type: 'feature', text: 'Atomic restore: all-or-nothing with automatic rollback on failure' },
      { type: 'fix', text: 'Fixed checkpoint creation silently failing on read-only filesystems' },
      { type: 'fix', text: 'Fixed `aitm list` output truncating long checkpoint messages' },
      { type: 'breaking', text: 'Minimum Node.js version raised to 20 LTS' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const typeConfig: Record<
  ChangeType,
  { label: string; dot: string; badge: string; text: string }
> = {
  feature: {
    label: 'Feature',
    dot: 'bg-green-500',
    badge: 'bg-green-500/15 text-green-400 border-green-500/25',
    text: 'text-green-400',
  },
  fix: {
    label: 'Fix',
    dot: 'bg-yellow-500',
    badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
    text: 'text-yellow-400',
  },
  breaking: {
    label: 'Breaking',
    dot: 'bg-red-500',
    badge: 'bg-red-500/15 text-red-400 border-red-500/25',
    text: 'text-red-400',
  },
};

const filterOptions: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Features', value: 'feature' },
  { label: 'Fixes', value: 'fix' },
  { label: 'Breaking', value: 'breaking' },
];

function changeMatchesFilter(change: Change, filter: FilterType): boolean {
  return filter === 'all' || change.type === filter;
}

function versionHasVisibleChanges(version: Version, filter: FilterType): boolean {
  return filter === 'all' || version.changes.some((c) => c.type === filter);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChangeItem({ change }: { change: Change }) {
  const cfg = typeConfig[change.type];
  return (
    <li className="flex items-start gap-3">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide flex-shrink-0 mt-0.5 ${cfg.badge}`}
      >
        {cfg.label}
      </span>
      <span className="text-sm text-gray-300 leading-relaxed">{change.text}</span>
    </li>
  );
}

function VersionCard({
  version,
  filter,
  isLatest,
}: {
  version: Version;
  filter: FilterType;
  isLatest: boolean;
}) {
  const visibleChanges = version.changes.filter((c) => changeMatchesFilter(c, filter));

  if (!versionHasVisibleChanges(version, filter)) return null;

  const featureCount = visibleChanges.filter((c) => c.type === 'feature').length;
  const fixCount = visibleChanges.filter((c) => c.type === 'fix').length;
  const breakingCount = visibleChanges.filter((c) => c.type === 'breaking').length;

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-gray-950 z-10 ${
          isLatest ? 'bg-blue-500 shadow-lg shadow-blue-500/40' : 'bg-gray-700'
        }`}
      />

      <div className={`rounded-2xl border p-6 sm:p-8 ${isLatest ? 'border-blue-500/40 bg-blue-950/10' : 'border-gray-800 bg-gray-900/40'}`}>
        {/* Version header */}
        <div className="flex flex-wrap items-start gap-3 mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl font-bold tracking-tight">v{version.version}</span>
              {isLatest && (
                <Badge className="bg-blue-600 text-white text-xs px-2 py-0.5">Latest</Badge>
              )}
            </div>
            <span className="text-sm text-gray-500">{version.date}</span>
          </div>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {featureCount > 0 && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeConfig.feature.badge}`}>
                {featureCount} {featureCount === 1 ? 'feature' : 'features'}
              </span>
            )}
            {fixCount > 0 && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeConfig.fix.badge}`}>
                {fixCount} {fixCount === 1 ? 'fix' : 'fixes'}
              </span>
            )}
            {breakingCount > 0 && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeConfig.breaking.badge}`}>
                {breakingCount} breaking
              </span>
            )}
          </div>
        </div>

        <p className="text-gray-400 text-sm mb-6 leading-relaxed">{version.summary}</p>

        <ul className="space-y-3">
          {visibleChanges.map((change, idx) => (
            <ChangeItem key={idx} change={change} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChangelogPage() {
  const [filter, setFilter] = useState<FilterType>('all');

  const visibleVersions = versions.filter((v) => versionHasVisibleChanges(v, filter));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
        <Badge className="mb-4 bg-blue-600/20 text-blue-400 border-blue-600/30">Changelog</Badge>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
              What&apos;s new
            </h1>
            <p className="text-gray-400 text-lg max-w-xl">
              Every update to AITimeMachine — new features, bug fixes, and breaking changes.
            </p>
          </div>
          <a
            href="/changelog.rss"
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors flex-shrink-0"
          >
            <Rss className="w-4 h-4 text-orange-400" />
            RSS feed
          </a>
        </div>
      </section>

      {/* Filter bar */}
      <div className="sticky top-16 z-40 bg-gray-950/90 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest mr-2">
            Filter
          </span>
          {filterOptions.map((opt) => (
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

      {/* Timeline */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {visibleVersions.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No entries match this filter.</p>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-4 text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors text-sm"
            >
              Show all changes
            </button>
          </div>
        ) : (
          /* Vertical line container */
          <div className="relative">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-800" aria-hidden="true" />

            <div className="space-y-12">
              {visibleVersions.map((version, idx) => (
                <VersionCard
                  key={version.version}
                  version={version}
                  filter={filter}
                  isLatest={idx === 0 && filter === 'all'}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* CTA */}
      <section className="bg-gray-900/40 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Always up to date</h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Run{' '}
            <code className="bg-gray-800 text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono">
              npm install -g aitimemachine@latest
            </code>{' '}
            to upgrade to the latest version.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild>
              <Link href="/docs">
                Read the Docs
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/sign-up">Get Started Free</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
