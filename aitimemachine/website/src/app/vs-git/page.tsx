'use client';

import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Check,
  Minus,
  GitBranch,
  Clock,
  Layers,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Support = 'yes' | 'no' | 'partial';

interface ComparisonRow {
  feature: string;
  detail: string;
  git: Support;
  aitm: Support;
}

interface UseCase {
  title: string;
  description: string;
  bullets: string[];
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const comparisonRows: ComparisonRow[] = [
  {
    feature: 'Atomic restore',
    detail:
      'Roll the entire working tree back to an exact moment — all files, all or nothing, with automatic rollback on failure.',
    git: 'partial',
    aitm: 'yes',
  },
  {
    feature: 'Agent checkpoints',
    detail:
      'Automatic save points created before every AI agent edit, with no commit ceremony or staging required.',
    git: 'no',
    aitm: 'yes',
  },
  {
    feature: 'Conflict tracking across agents',
    detail:
      'See when multiple AI agents touched the same files in overlapping windows, and untangle who changed what.',
    git: 'no',
    aitm: 'yes',
  },
  {
    feature: 'Time-travel by moment',
    detail:
      'Jump to "right before the tests broke" by time or natural-language description — not just by commit SHA.',
    git: 'partial',
    aitm: 'yes',
  },
  {
    feature: 'Branch-free history',
    detail:
      'A continuous, linear timeline of every change without managing branches, stashes, or detached HEADs.',
    git: 'no',
    aitm: 'yes',
  },
  {
    feature: 'AI context preservation',
    detail:
      'Capture the full Claude / Cursor / Windsurf conversation and tool calls alongside the file changes.',
    git: 'no',
    aitm: 'yes',
  },
  {
    feature: 'Environment snapshots',
    detail:
      'Record environment variables and terminal state with each checkpoint so a restore is truly reproducible.',
    git: 'no',
    aitm: 'yes',
  },
  {
    feature: 'Permanent shared history',
    detail:
      'Push reviewed, named history to a remote that the whole team and the open-source world can build on.',
    git: 'yes',
    aitm: 'partial',
  },
  {
    feature: 'Code review & PRs',
    detail:
      'Pull requests, line comments, and the collaboration workflow your team already runs on.',
    git: 'yes',
    aitm: 'no',
  },
  {
    feature: 'Distributed collaboration',
    detail:
      'Clone, fork, and merge across machines and contributors as the source of truth for shared code.',
    git: 'yes',
    aitm: 'no',
  },
];

const useGit: UseCase = {
  title: 'Reach for Git when…',
  description:
    'Git is the source of truth for code that other people and machines depend on.',
  bullets: [
    'You are ready to publish reviewed, intentional history',
    'You need pull requests, branches, and code review',
    'You are collaborating across a team or the open-source world',
    'You want a permanent, distributed record of releases',
  ],
};

const useAitm: UseCase = {
  title: 'Reach for AITM when…',
  description:
    'AITM is the safety net under the messy, fast-moving work in between commits.',
  bullets: [
    'AI agents are editing your code dozens of times an hour',
    'You need to undo "what just happened" in one step',
    'You want a checkpoint before every risky or automated change',
    'You need to time-travel without polluting your Git history',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SupportCell({ value }: { value: Support }) {
  if (value === 'yes') {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-500/15 text-green-400">
        <Check className="w-4 h-4" />
      </span>
    );
  }
  if (value === 'partial') {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow-500/15 text-yellow-400">
        <Minus className="w-4 h-4" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-700/40 text-gray-600">
      <Minus className="w-4 h-4" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UseCaseCard({
  useCase,
  variant,
}: {
  useCase: UseCase;
  variant: 'git' | 'aitm';
}) {
  const accent =
    variant === 'git'
      ? 'border-gray-700 bg-gray-900/40'
      : 'border-blue-500/40 bg-blue-950/10';
  const check = variant === 'git' ? 'text-gray-400' : 'text-blue-400';

  return (
    <div className={`rounded-2xl border p-6 sm:p-8 ${accent}`}>
      <div className="flex items-center gap-3 mb-2">
        {variant === 'git' ? (
          <GitBranch className="w-5 h-5 text-gray-400" />
        ) : (
          <Clock className="w-5 h-5 text-blue-400" />
        )}
        <h3 className="text-lg font-bold tracking-tight">{useCase.title}</h3>
      </div>
      <p className="text-sm text-gray-400 mb-5 leading-relaxed">
        {useCase.description}
      </p>
      <ul className="space-y-3">
        {useCase.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-3">
            <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${check}`} />
            <span className="text-sm text-gray-300 leading-relaxed">
              {bullet}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VsGitPage() {
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
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-14 text-center">
          <Badge className="mb-4 bg-blue-600/20 text-blue-400 border-blue-600/30">
            AITM vs Git
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5 leading-tight">
            AITM doesn&apos;t replace Git —{' '}
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              it remembers what Git forgets
            </span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Git is built for intentional, reviewed history. AITM captures the
            thousands of fast, automated, AI-driven changes that happen between
            your commits — so you can always get back.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-8 justify-center">
            <Button asChild>
              <Link href="/docs/quick-start">
                Get started in 2 minutes
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/docs">Read the docs</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
            Two tools, two jobs
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            A feature-by-feature look at where each tool shines.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-800">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_120px_120px] bg-gray-900/60 border-b border-gray-800">
            <div className="px-5 py-4 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Capability
            </div>
            <div className="px-4 py-4 text-center text-sm font-bold text-gray-300 flex items-center justify-center gap-2">
              <GitBranch className="w-4 h-4 text-gray-500" />
              Git
            </div>
            <div className="px-4 py-4 text-center text-sm font-bold text-blue-400 flex items-center justify-center gap-2 bg-blue-950/20">
              <Clock className="w-4 h-4" />
              AITM
            </div>
          </div>

          {/* Rows */}
          {comparisonRows.map((row, idx) => (
            <div
              key={row.feature}
              className={`grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_120px_120px] items-center ${
                idx % 2 === 0 ? 'bg-gray-950' : 'bg-gray-900/30'
              }`}
            >
              <div className="px-5 py-4">
                <p className="text-sm font-semibold text-white">{row.feature}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {row.detail}
                </p>
              </div>
              <div className="px-4 py-4 flex justify-center">
                <SupportCell value={row.git} />
              </div>
              <div className="px-4 py-4 flex justify-center bg-blue-950/10 h-full items-center">
                <SupportCell value={row.aitm} />
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-5 text-xs text-gray-500">
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/15 text-green-400">
              <Check className="w-3 h-3" />
            </span>
            First-class
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500/15 text-yellow-400">
              <Minus className="w-3 h-3" />
            </span>
            Possible with effort
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-700/40 text-gray-600">
              <Minus className="w-3 h-3" />
            </span>
            Not designed for it
          </span>
        </div>
      </section>

      {/* When to use which */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
            When to use which
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto">
            You don&apos;t pick one. You use Git for the history that matters and
            AITM for everything in between.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UseCaseCard useCase={useGit} variant="git" />
          <UseCaseCard useCase={useAitm} variant="aitm" />
        </div>
      </section>

      {/* They work together */}
      <section className="bg-gray-900/40 border-y border-gray-800 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              They work together
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              AITM wraps your existing Git workflow. Every checkpoint sits
              underneath your commits — invisible until you need it.
            </p>
          </div>

          {/* Diagram */}
          <div className="rounded-2xl border border-blue-500/30 bg-blue-950/10 p-6 sm:p-10">
            <div className="flex items-center gap-2 mb-6 text-blue-400">
              <Layers className="w-5 h-5" />
              <span className="text-sm font-semibold uppercase tracking-widest">
                AITM wraps Git
              </span>
            </div>

            {/* Outer layer: AITM */}
            <div className="rounded-xl border border-blue-500/40 bg-blue-600/5 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-bold text-blue-300">
                  AITM timeline — continuous, automatic checkpoints
                </span>
              </div>

              {/* Inner layer: Git */}
              <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <GitBranch className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-bold text-gray-300">
                    Git — your committed, reviewed history
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['commit', 'commit', 'commit'].map((label, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-md bg-gray-800 text-xs font-mono text-gray-300 border border-gray-700">
                        {label}
                      </span>
                      {i < 2 && (
                        <span className="text-gray-600 text-xs">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* AITM checkpoints between commits */}
              <div className="flex items-center gap-1 flex-wrap mt-4 pl-1">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-blue-500/60"
                    title="AITM checkpoint"
                  />
                ))}
                <span className="ml-2 text-xs text-blue-400/80">
                  dozens of agent checkpoints per commit
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-400 mt-6 leading-relaxed text-center">
              Commit to Git when work is ready to share. AITM has already saved
              every step it took to get there — so a bad agent run is a one-command
              undo, never a lost afternoon.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-3">
            Add the safety net to your Git workflow
          </h2>
          <p className="text-gray-400 mb-7 max-w-md mx-auto">
            Install AITM alongside Git and get an automatic checkpoint before
            every AI edit — no workflow changes required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild>
              <Link href="/docs/quick-start">
                Quick start
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/sign-up">Get started free</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
