'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Tag,
  MessageSquare,
  ListChecks,
  BookText,
  GitCommitHorizontal,
  ExternalLink,
  Loader2,
  Brain,
  Wrench,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Config & types
// ---------------------------------------------------------------------------

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://timemachine-api.gitgram.app';

type MemorySource = 'conversation' | 'task' | 'library' | 'checkpoint';

interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

interface MemoryDetail {
  id: string;
  source: MemorySource;
  title: string;
  description: string;
  tags: string[];
  tool: string | null;
  createdAt: string | null;
  messages: ContextMessage[];
}

interface RelatedMemory {
  id: string;
  source: MemorySource;
  title: string;
  snippet: string;
  similarity?: number;
}

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
  messages?: ContextMessage[];
}

const SOURCE_META: Record<
  MemorySource,
  { label: string; icon: React.FC<{ className?: string }>; accent: string; badge: string }
> = {
  conversation: {
    label: 'Conversation',
    icon: MessageSquare,
    accent: 'text-sky-400',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  },
  task: {
    label: 'Task (beads)',
    icon: ListChecks,
    accent: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  },
  library: {
    label: 'Library Doc (context7)',
    icon: BookText,
    accent: 'text-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  },
  checkpoint: {
    label: 'Checkpoint',
    icon: GitCommitHorizontal,
    accent: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMemorySource(v: string | null | undefined): v is MemorySource {
  return v === 'conversation' || v === 'task' || v === 'library' || v === 'checkpoint';
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

function toDetail(raw: RawContext): MemoryDetail {
  return {
    id: raw.id,
    source: isMemorySource(raw.source) ? raw.source : 'conversation',
    title: raw.name?.trim() || 'Untitled memory',
    description: raw.description?.trim() || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    tool: raw.tool ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    messages: Array.isArray(raw.messages) ? raw.messages : [],
  };
}

/** Build the markdown body for a memory entry from its messages + description. */
function buildContent(detail: MemoryDetail): string {
  if (detail.messages.length > 0) {
    return detail.messages
      .map((m) => `### ${m.role}\n\n${m.content}`)
      .join('\n\n');
  }
  return detail.description || '_No content stored for this memory._';
}

// ---------------------------------------------------------------------------
// Lightweight markdown renderer (code fences + headings + paragraphs)
// ---------------------------------------------------------------------------

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      nodes.push(
        <pre
          key={key++}
          className="my-4 overflow-x-auto rounded-lg border border-white/8 bg-white/[0.04] p-4 text-sm font-mono leading-relaxed text-white/80"
        >
          {lang && <div className="mb-2 text-[11px] text-white/30">{lang}</div>}
          <code>{code.join('\n')}</code>
        </pre>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      nodes.push(
        <h3
          key={key++}
          className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-white/60"
        >
          {line.slice(4)}
        </h3>
      );
      i += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={key++} className="mb-3 mt-8 text-xl font-semibold text-white">
          {line.slice(3)}
        </h2>
      );
      i += 1;
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('#')
    ) {
      para.push(lines[i]);
      i += 1;
    }
    nodes.push(
      <p key={key++} className="my-3 leading-relaxed text-white/60">
        {para.join(' ')}
      </p>
    );
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchMemory(id: string, signal: AbortSignal): Promise<MemoryDetail> {
  const res = await fetch(`${API_BASE}/v1/contexts/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
    signal,
  });
  if (res.status === 404) throw new Error('not-found');
  if (!res.ok) throw new Error(`Failed to load memory (${res.status})`);
  const json = (await res.json()) as RawContext | { data?: RawContext };
  const raw = 'data' in json && json.data ? json.data : (json as RawContext);
  return toDetail(raw);
}

/** Related memories via semantic search seeded by this entry's title. */
async function fetchRelated(
  detail: MemoryDetail,
  signal: AbortSignal
): Promise<RelatedMemory[]> {
  const seed = `${detail.title} ${detail.description}`.trim().slice(0, 200);
  if (!seed) return [];
  const res = await fetch(
    `${API_BASE}/v1/contexts/search/semantic?q=${encodeURIComponent(seed)}&limit=6`,
    { headers: authHeaders(), signal }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: RawContext[] };
  return (json.results ?? [])
    .filter((r) => r.id !== detail.id)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      source: isMemorySource(r.source) ? r.source : 'conversation',
      title: r.name?.trim() || 'Untitled memory',
      snippet: r.description?.trim() || '',
      similarity: typeof r.similarity_score === 'number' ? r.similarity_score : undefined,
    }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MemoryDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] ?? '';

  const [detail, setDetail] = useState<MemoryDetail | null>(null);
  const [related, setRelated] = useState<RelatedMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setNotFound(false);

    fetchMemory(id, controller.signal)
      .then((d) => {
        setDetail(d);
        return fetchRelated(d, controller.signal);
      })
      .then((rel) => setRelated(rel ?? []))
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        if ((err as Error).message === 'not-found') {
          setNotFound(true);
        } else {
          setError((err as Error).message || 'Failed to load memory');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [id]);

  const meta = detail ? SOURCE_META[detail.source] : null;
  const Icon = meta?.icon ?? Brain;

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <Navbar />

      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/memory"
          className="mb-8 inline-flex items-center gap-2 text-sm text-white/40 transition-colors hover:text-white/70"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to memory
        </Link>

        {loading ? (
          <div className="flex items-center gap-2 py-20 text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading memory…
          </div>
        ) : notFound ? (
          <div className="py-20 text-center">
            <Brain className="mx-auto mb-4 h-8 w-8 text-white/20" />
            <p className="text-white/50">This memory does not exist.</p>
            <Link
              href="/memory"
              className="mt-3 inline-block text-sm text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
            >
              Browse all memories
            </Link>
          </div>
        ) : error || !detail || !meta ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
            {error || 'Failed to load this memory.'}
          </div>
        ) : (
          <article>
            {/* Header */}
            <div className="mb-6">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                    meta.badge
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
                {detail.tool && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-white/30">
                    <Wrench className="h-3 w-3" />
                    {detail.tool}
                  </span>
                )}
                {detail.createdAt && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-white/30">
                    <Clock className="h-3 w-3" />
                    {new Date(detail.createdAt).toLocaleString()}
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {detail.title}
              </h1>

              {detail.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-white/30" />
                  {detail.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-white/50"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Open in AITM */}
            <a
              href={`aitm://memory/${detail.id}`}
              className="mb-8 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition-colors hover:border-white/20 hover:bg-white/10"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in AITM
            </a>

            {/* Content */}
            <div className="border-t border-white/8 pt-6 text-sm">
              {renderMarkdown(buildContent(detail))}
            </div>

            {/* Related memories */}
            {related.length > 0 && (
              <section className="mt-12 border-t border-white/8 pt-8">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/40">
                  Related memories
                </h2>
                <ul className="space-y-2">
                  {related.map((rel) => {
                    const relMeta = SOURCE_META[rel.source];
                    const RelIcon = relMeta.icon;
                    return (
                      <li key={rel.id}>
                        <Link
                          href={`/memory/${rel.id}`}
                          className="group flex items-start gap-3 rounded-lg border border-white/8 bg-white/[0.03] p-3 transition-all hover:border-white/15 hover:bg-white/[0.06]"
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/5',
                              relMeta.accent
                            )}
                          >
                            <RelIcon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm text-white/80 group-hover:text-white">
                                {rel.title}
                              </p>
                              {rel.similarity !== undefined && (
                                <span className="shrink-0 font-mono text-[11px] text-indigo-300">
                                  {rel.similarity.toFixed(2)}
                                </span>
                              )}
                            </div>
                            {rel.snippet && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-white/40">
                                {rel.snippet}
                              </p>
                            )}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </article>
        )}
      </div>

      <Footer />
    </div>
  );
}
