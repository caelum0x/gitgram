'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { snippetService, type Snippet } from '@/services/snippetService';

// ── Language badge color map (matches CodeSnippetCard) ──────────────────────
const LANGUAGE_COLORS: Record<string, string> = {
  javascript: '#f7df1e',
  typescript: '#3178c6',
  python: '#3572a5',
  go: '#00acd7',
  rust: '#dea584',
  java: '#b07219',
  cpp: '#f34b7d',
  bash: '#89e051',
  json: '#292929',
  yaml: '#cb171e',
  sql: '#e38c00',
};

const LIGHT_BG_LANGS = new Set(['#f7df1e', '#89e051']);

// ── Utility ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.floor(diffMo / 12)}y ago`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LanguageBadge({ language }: { language: string }) {
  const key = language.toLowerCase();
  const bg = LANGUAGE_COLORS[key] ?? '#6e7681';
  const textColor = LIGHT_BG_LANGS.has(bg) ? '#1a1a2e' : '#e6edf3';

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold font-mono tracking-wide"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {language}
    </span>
  );
}

function AuthorAvatar({ username, avatarUrl }: { username: string; avatarUrl?: string }) {
  const initial = username.charAt(0).toUpperCase();

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={`${username} avatar`}
        className="w-12 h-12 rounded-full object-cover border border-[var(--border)]"
      />
    );
  }

  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center border border-[var(--border)] text-base font-bold select-none"
      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
      aria-label={`${username} avatar`}
    >
      {initial}
    </div>
  );
}

function SkeletonLine({ width = 'w-full', height = 'h-4' }: { width?: string; height?: string }) {
  return (
    <div
      className={`${width} ${height} rounded animate-pulse`}
      style={{ backgroundColor: 'var(--surface-secondary)' }}
    />
  );
}

function LoadingState() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6" aria-busy="true" aria-label="Loading snippet">
      <SkeletonLine width="w-32" height="h-4" />
      <div className="space-y-3">
        <SkeletonLine width="w-2/3" height="h-8" />
        <SkeletonLine width="w-1/3" height="h-4" />
      </div>
      <div
        className="rounded-xl border p-6 space-y-2"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonLine key={i} width={i % 3 === 0 ? 'w-1/2' : 'w-full'} height="h-4" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="max-w-4xl mx-auto py-16 px-4 text-center space-y-6">
      <div
        className="inline-flex items-center justify-center w-16 h-16 rounded-full"
        style={{ backgroundColor: 'rgba(218,54,51,0.12)' }}
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M10.293 4.293a1 1 0 011.414 0L12 4.586l.293-.293a1 1 0 011.414 1.414L13.414 6l.293.293a1 1 0 01-1.414 1.414L12 7.414l-.293.293a1 1 0 01-1.414-1.414L10.586 6l-.293-.293a1 1 0 010-1.414z" />
          <circle cx="12" cy="12" r="9" strokeWidth={2} />
        </svg>
      </div>
      <div>
        <p className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
          Failed to load snippet
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
          {message}
        </p>
      </div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Snippets
      </button>
    </div>
  );
}

interface RelatedSnippetCardProps {
  snippet: Snippet;
}

function RelatedSnippetCard({ snippet }: RelatedSnippetCardProps) {
  const previewLines = snippet.code.split('\n').slice(0, 4).join('\n');

  return (
    <Link
      href={`/snippets/${snippet.id}`}
      className="block rounded-lg border p-4 transition-colors hover:border-[var(--primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <span
          className="text-sm font-semibold truncate"
          style={{ color: 'var(--foreground)' }}
        >
          {snippet.title ?? 'Untitled Snippet'}
        </span>
        <LanguageBadge language={snippet.language} />
      </div>
      <pre
        className="text-xs font-mono overflow-hidden rounded mt-2 p-2 leading-relaxed"
        style={{
          backgroundColor: 'var(--background)',
          color: 'var(--foreground-secondary)',
          maxHeight: '80px',
          whiteSpace: 'pre',
          overflowX: 'hidden',
        }}
        aria-hidden="true"
      >
        {previewLines}
      </pre>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
          @{snippet.user.username}
        </span>
        <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
          {snippet.likesCount.toLocaleString()} likes
        </span>
      </div>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SnippetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const snippetId = params.id as string;

  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const [relatedSnippets, setRelatedSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load the snippet
  useEffect(() => {
    let cancelled = false;

    async function fetchSnippet() {
      try {
        setLoading(true);
        setError(null);
        const data = await snippetService.getSnippet(snippetId);
        if (cancelled) return;
        setSnippet(data);
        setLiked(data.isLiked ?? false);
        setLikeCount(data.likesCount);

        // Fetch related snippets by language
        try {
          const relatedData = await snippetService.getSnippets({
            language: data.language,
            limit: 3,
          });
          if (cancelled) return;
          // Exclude current snippet from related
          setRelatedSnippets(
            relatedData.snippets.filter((s) => s.id !== snippetId).slice(0, 3)
          );
        } catch {
          // Related snippets are non-critical; silence the error
        }
      } catch (err: unknown) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSnippet();
    return () => { cancelled = true; };
  }, [snippetId]);

  const handleLike = useCallback(async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (likeLoading) return;

    // Optimistic update
    const wasLiked = liked;
    const prevCount = likeCount;
    setLiked(!wasLiked);
    setLikeCount(wasLiked ? prevCount - 1 : prevCount + 1);
    setLikeLoading(true);

    try {
      const result = await snippetService.likeSnippet(snippetId);
      setLiked(result.liked);
      setLikeCount(result.liked ? prevCount + 1 : prevCount - 1);
    } catch {
      // Revert optimistic update on failure
      setLiked(wasLiked);
      setLikeCount(prevCount);
    } finally {
      setLikeLoading(false);
    }
  }, [isAuthenticated, liked, likeCount, likeLoading, snippetId, router]);

  const handleCopy = useCallback(async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: unknown) {
      console.error('Failed to copy snippet code:', err);
    }
  }, [snippet]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onBack={() => router.push('/snippets')} />;
  if (!snippet) return null;

  const authorInitial = snippet.user.username.charAt(0).toUpperCase();

  return (
    <main className="max-w-4xl mx-auto py-8 px-4 space-y-8">

      {/* ── Back button ── */}
      <nav aria-label="Breadcrumb">
        <Link
          href="/snippets"
          className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-[var(--primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded"
          style={{ color: 'var(--foreground-secondary)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Snippets
        </Link>
      </nav>

      {/* ── Header: title + meta ── */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ color: 'var(--foreground)' }}
          >
            {snippet.title ?? 'Untitled Snippet'}
          </h1>
          <LanguageBadge language={snippet.language} />
        </div>

        {snippet.description && (
          <p className="text-base leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>
            {snippet.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
          {snippet.repository && (
            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              {snippet.repository.fullName}
            </span>
          )}
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {/* views not in service type but shown if backend adds it */}
            Views
          </span>
          <time
            dateTime={snippet.createdAt}
            title={new Date(snippet.createdAt).toLocaleString()}
          >
            {formatRelativeTime(snippet.createdAt)}
          </time>
        </div>
      </header>

      {/* ── Code block + actions ── */}
      <section aria-label="Code">
        {/* Action bar above code */}
        <div className="flex items-center justify-between mb-2 gap-2">
          <span className="text-xs font-mono" style={{ color: 'var(--foreground-secondary)' }}>
            {snippet.language}
          </span>
          <div className="flex items-center gap-2">
            {/* Like button */}
            <button
              onClick={handleLike}
              disabled={likeLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-60"
              style={{
                backgroundColor: liked ? 'rgba(244,63,94,0.12)' : 'var(--surface-secondary)',
                color: liked ? '#f43f5e' : 'var(--foreground-secondary)',
              }}
              aria-label={liked ? 'Unlike snippet' : 'Like snippet'}
              aria-pressed={liked}
            >
              <span
                className="text-base leading-none transition-transform"
                style={{ transform: liked ? 'scale(1.2)' : 'scale(1)', display: 'inline-block' }}
                aria-hidden="true"
              >
                {liked ? '❤️' : '🤍'}
              </span>
              <span>{likeCount.toLocaleString()}</span>
            </button>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              style={{
                backgroundColor: copied ? 'rgba(74,222,128,0.08)' : 'var(--surface-secondary)',
                color: copied ? '#4ade80' : 'var(--foreground-secondary)',
              }}
              aria-label="Copy code to clipboard"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Code
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code block */}
        <div
          className="rounded-xl border overflow-auto"
          style={{ backgroundColor: '#0d1117', borderColor: 'var(--border)' }}
        >
          <pre
            className="p-5 text-sm font-mono leading-relaxed"
            style={{
              color: '#e6edf3',
              whiteSpace: 'pre',
              overflowX: 'auto',
              minHeight: '120px',
            }}
          >
            <code>{snippet.code}</code>
          </pre>
        </div>
      </section>

      {/* ── Author info card ── */}
      <section
        aria-label="Author"
        className="rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <Link
          href={`/profile/${snippet.user.username}`}
          className="flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded-full"
          aria-label={`View ${snippet.user.username}'s profile`}
        >
          {snippet.user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={snippet.user.avatar}
              alt={`${snippet.user.username} avatar`}
              className="w-12 h-12 rounded-full object-cover border border-[var(--border)]"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center border border-[var(--border)] text-base font-bold select-none"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
              aria-hidden="true"
            >
              {authorInitial}
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <Link
            href={`/profile/${snippet.user.username}`}
            className="text-sm font-semibold hover:text-[var(--primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded"
            style={{ color: 'var(--foreground)' }}
          >
            @{snippet.user.username}
          </Link>
          <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-secondary)' }}>
            Snippet author
          </p>
        </div>

        <Link
          href={`/profile/${snippet.user.username}`}
          className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
        >
          View Profile
        </Link>
      </section>

      {/* ── Related snippets ── */}
      {relatedSnippets.length > 0 && (
        <section aria-label="Related snippets" className="space-y-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
            More {snippet.language} snippets
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatedSnippets.map((related) => (
              <RelatedSnippetCard key={related.id} snippet={related} />
            ))}
          </div>
        </section>
      )}

    </main>
  );
}
