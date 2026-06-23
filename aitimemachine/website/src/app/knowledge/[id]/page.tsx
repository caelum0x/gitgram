'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Tag,
  ThumbsUp,
  ThumbsDown,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KBDocFull {
  id: string;
  title: string;
  tags: string[];
  category: string;
  updatedAt: string;
  content: string; // Markdown string
}

interface RelatedDoc {
  id: string;
  title: string;
  category: string;
  excerpt: string;
}

// ---------------------------------------------------------------------------
// Static mock data — swap for API fetch when the KB endpoint is live
// ---------------------------------------------------------------------------

const DOCS: Record<string, KBDocFull> = {
  'install-cli': {
    id: 'install-cli',
    title: 'Installing the AITM CLI',
    tags: ['cli', 'npm', 'installation'],
    category: 'Installation',
    updatedAt: 'June 18, 2026',
    content: `## Prerequisites

You need **Node.js 18 or later**. Check your version:

\`\`\`bash
node --version
\`\`\`

## Install globally

\`\`\`bash
npm install -g aitm
# or
pnpm add -g aitm
\`\`\`

## Verify installation

\`\`\`bash
aitm --version
\`\`\`

## Login

Authenticate with your AITM account:

\`\`\`bash
aitm login
\`\`\`

This opens a browser window for OAuth. Once authenticated, a token is stored in \`~/.aitm/credentials.json\`.

## First checkpoint

\`\`\`bash
cd your-project
aitm checkpoint "initial state"
\`\`\`

You're all set. Run \`aitm --help\` for a full command reference.`,
  },
  'cmd-checkpoint': {
    id: 'cmd-checkpoint',
    title: 'aitm checkpoint',
    tags: ['cli', 'checkpoint', 'commands'],
    category: 'Commands',
    updatedAt: 'June 20, 2026',
    content: `## Synopsis

\`\`\`
aitm checkpoint [label] [options]
\`\`\`

## Description

Creates a named save point for the current working tree. Both tracked and untracked files are captured. Binary files are stored with content-addressed hashing; text files are stored as diffs relative to the previous checkpoint.

## Options

| Flag | Description |
|------|-------------|
| \`--message, -m\` | Checkpoint label (required if not provided as argument) |
| \`--include-ignored\` | Also capture files matched by \`.gitignore\` |
| \`--quiet, -q\` | Suppress output |

## Examples

\`\`\`bash
aitm checkpoint "before refactor"
aitm checkpoint -m "fixed auth bug"
aitm checkpoint --include-ignored "full snapshot"
\`\`\`

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | No changes since last checkpoint |
| 2 | Authentication error |`,
  },
};

const RELATED: Record<string, RelatedDoc[]> = {
  'install-cli': [
    {
      id: 'install-vscode',
      title: 'VS Code Extension Setup',
      category: 'Installation',
      excerpt: 'Install the AITM VS Code extension from the marketplace…',
    },
    {
      id: 'cmd-checkpoint',
      title: 'aitm checkpoint',
      category: 'Commands',
      excerpt: 'Create a named save point for the current working tree…',
    },
    {
      id: 'trouble-auth-token',
      title: 'Authentication token expired',
      category: 'Troubleshooting',
      excerpt: 'When the CLI reports "token expired", run aitm login…',
    },
  ],
  'cmd-checkpoint': [
    {
      id: 'cmd-restore',
      title: 'aitm restore',
      category: 'Commands',
      excerpt: 'Restore the working tree to a previous checkpoint…',
    },
    {
      id: 'cmd-diff',
      title: 'aitm diff',
      category: 'Commands',
      excerpt: 'Show the diff between the current state and a checkpoint…',
    },
    {
      id: 'install-cli',
      title: 'Installing the AITM CLI',
      category: 'Installation',
      excerpt: 'Install the AITimeMachine CLI globally with npm or pnpm…',
    },
  ],
};

const DEFAULT_RELATED: RelatedDoc[] = [
  {
    id: 'install-cli',
    title: 'Installing the AITM CLI',
    category: 'Installation',
    excerpt: 'Install the AITimeMachine CLI globally with npm or pnpm…',
  },
  {
    id: 'api-rest-overview',
    title: 'REST API Overview',
    category: 'API',
    excerpt: 'The AITM API follows REST conventions. All endpoints require…',
  },
];

// ---------------------------------------------------------------------------
// Minimal Markdown renderer (headings, code blocks, paragraphs, tables)
// ---------------------------------------------------------------------------

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      nodes.push(
        <div key={key++} className="my-4 overflow-x-auto rounded-lg border border-white/8 bg-white/[0.04]">
          {lang && (
            <div className="border-b border-white/8 px-4 py-1.5 text-[11px] font-mono text-white/30">
              {lang}
            </div>
          )}
          <pre className="p-4 text-sm font-mono leading-relaxed text-white/80">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      );
      i += 1;
      continue;
    }

    // Table
    if (line.includes('|') && lines[i + 1]?.match(/^\|[-| ]+\|$/)) {
      const headers = line.split('|').filter(Boolean).map((h) => h.trim());
      i += 2; // skip separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(lines[i].split('|').filter(Boolean).map((c) => c.trim()));
        i += 1;
      }
      nodes.push(
        <div key={key++} className="my-4 overflow-x-auto rounded-lg border border-white/8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/[0.03]">
                {headers.map((h, hi) => (
                  <th key={hi} className="px-4 py-2.5 text-left font-medium text-white/60">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-white/5 last:border-0">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-2.5 text-white/50 font-mono text-xs">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Headings
    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={key++} className="mb-3 mt-8 text-xl font-semibold text-white first:mt-0">
          {line.slice(3)}
        </h2>,
      );
      i += 1;
      continue;
    }
    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={key++} className="mb-2 mt-6 text-base font-semibold text-white/80">
          {line.slice(4)}
        </h3>,
      );
      i += 1;
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Paragraph (with inline bold + code)
    const rendered = line
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="rounded bg-white/8 px-1.5 py-0.5 font-mono text-xs text-white/75">$1</code>');
    nodes.push(
      <p
        key={key++}
        className="mb-3 text-sm leading-7 text-white/55"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />,
    );
    i += 1;
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type FeedbackState = 'idle' | 'yes' | 'no';

export default function KnowledgeDocPage() {
  const { id } = useParams<{ id: string }>();
  const doc = DOCS[id] ?? null;
  const related = RELATED[id] ?? DEFAULT_RELATED;
  const [feedback, setFeedback] = useState<FeedbackState>('idle');

  // Scroll to top on doc change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setFeedback('idle');
  }, [id]);

  if (!doc) {
    return (
      <div className="min-h-screen bg-[#080808] text-white">
        <Navbar />
        <div className="flex flex-col items-center gap-4 py-40 text-center">
          <p className="text-white/40">Article not found.</p>
          <Link
            href="/knowledge"
            className="text-sm text-indigo-400 underline-offset-2 hover:underline"
          >
            Back to Knowledge Base
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <Navbar />

      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Breadcrumb */}
        <nav className="mb-8 flex items-center gap-2 text-xs text-white/30">
          <Link href="/knowledge" className="hover:text-white/60">
            Knowledge Base
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-white/50">{doc.category}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-white/70 line-clamp-1">{doc.title}</span>
        </nav>

        <div className="flex gap-12 lg:gap-16">
          {/* Article */}
          <article className="min-w-0 flex-1">
            {/* Header */}
            <header className="mb-8 border-b border-white/8 pb-8">
              <Link
                href="/knowledge"
                className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All articles
              </Link>
              <h1 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {doc.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4">
                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {doc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-md border border-white/8 bg-white/[0.03] px-2 py-0.5 text-xs text-white/40"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
                {/* Last updated */}
                <span className="flex items-center gap-1.5 text-xs text-white/25">
                  <Clock className="h-3 w-3" />
                  Updated {doc.updatedAt}
                </span>
              </div>
            </header>

            {/* Content */}
            <div className="prose-sm">{renderMarkdown(doc.content)}</div>

            {/* Feedback */}
            <div className="mt-12 rounded-xl border border-white/8 bg-white/[0.02] p-6">
              {feedback === 'idle' ? (
                <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
                  <p className="text-sm text-white/50">Was this article helpful?</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setFeedback('yes')}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-400"
                    >
                      <ThumbsUp className="h-4 w-4" />
                      Yes
                    </button>
                    <button
                      onClick={() => setFeedback('no')}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 transition-all hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <ThumbsDown className="h-4 w-4" />
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-center">
                  <p className="text-sm font-medium text-white/70">
                    {feedback === 'yes'
                      ? 'Great! Thanks for the feedback.'
                      : 'Sorry to hear that. We\'ll work on improving this article.'}
                  </p>
                  <button
                    onClick={() => setFeedback('idle')}
                    className="text-xs text-white/25 underline-offset-2 hover:text-white/50 hover:underline"
                  >
                    Change response
                  </button>
                </div>
              )}
            </div>
          </article>

          {/* Related sidebar */}
          <aside className="hidden w-64 shrink-0 xl:block">
            <div className="sticky top-8">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/25">
                Related Articles
              </p>
              <ul className="space-y-3">
                {related.map((rel) => (
                  <li key={rel.id}>
                    <Link
                      href={`/knowledge/${rel.id}`}
                      className="group flex flex-col gap-1 rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-all hover:border-white/12 hover:bg-white/[0.05]"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-white/25 group-hover:text-white/50" />
                        <span className="text-sm font-medium text-white/60 group-hover:text-white/80 leading-snug">
                          {rel.title}
                        </span>
                      </div>
                      <p className="line-clamp-2 pl-5 text-xs text-white/30 leading-relaxed">
                        {rel.excerpt}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <Link
                  href="/knowledge"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
                >
                  <ArrowLeft className="h-3 w-3" />
                  All articles
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
}
