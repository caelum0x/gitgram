'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { repoService, CodeSnippet } from '@/services/repoService';
import EmptyState from '@/components/EmptyState';

interface RepoSnippetsTabProps {
  owner: string;
  name: string;
}

/** Simple syntax highlighting using language-specific colors */
function languageBadge(lang: string) {
  const colors: Record<string, string> = {
    typescript: 'bg-blue-500/10 text-blue-500',
    javascript: 'bg-yellow-500/10 text-yellow-600',
    python: 'bg-green-500/10 text-green-500',
    rust: 'bg-orange-500/10 text-orange-500',
    go: 'bg-cyan-500/10 text-cyan-600',
    java: 'bg-red-500/10 text-red-500',
    ruby: 'bg-red-600/10 text-red-600',
    swift: 'bg-orange-400/10 text-orange-400',
    kotlin: 'bg-purple-500/10 text-purple-500',
    php: 'bg-indigo-400/10 text-indigo-400',
    shell: 'bg-emerald-500/10 text-emerald-500',
    html: 'bg-orange-400/10 text-orange-400',
    css: 'bg-purple-400/10 text-purple-400',
    sql: 'bg-blue-400/10 text-blue-400',
    c: 'bg-gray-500/10 text-gray-500',
    'c++': 'bg-pink-500/10 text-pink-500',
  };
  return colors[lang.toLowerCase()] || 'bg-gray-400/10 text-gray-400';
}

function fmt(num?: number) {
  return Number(num || 0).toLocaleString();
}

export default function RepoSnippetsTab({ owner, name }: RepoSnippetsTabProps) {
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSnippets();
  }, [owner, name]);

  const loadSnippets = async () => {
    setLoading(true);
    try {
      const res = await repoService.getSnippets(owner, name, { page: 1, limit: 20 });
      const data = res.data;
      setSnippets(data?.snippets || []);
      setHasMore(data?.pagination?.hasMore ?? false);
      setPage(1);
    } catch (error) {
      console.error('Failed to load snippets', error);
    } finally {
      setLoading(false);
    }
  };

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await repoService.getSnippets(owner, name, { page: nextPage, limit: 20 });
      const data = res.data;
      const newSnippets = data?.snippets || [];
      if (newSnippets.length === 0) {
        setHasMore(false);
      } else {
        setSnippets((prev) => [
          ...prev,
          ...newSnippets.filter((s: CodeSnippet) => !prev.find((e) => e.id === s.id)),
        ]);
        setHasMore(data?.pagination?.hasMore ?? false);
        setPage(nextPage);
      }
    } catch (error) {
      console.error('Failed to load more snippets', error);
    } finally {
      setLoadingMore(false);
    }
  }, [owner, name, page, loadingMore]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-border bg-card p-4">
            <div className="mb-2 h-5 w-48 rounded bg-hover" />
            <div className="mb-3 h-3 w-64 rounded bg-hover" />
            <div className="h-32 w-full rounded bg-hover" />
          </div>
        ))}
      </div>
    );
  }

  if (snippets.length === 0) {
    return (
      <EmptyState
        icon="<>"
        title="No code snippets yet"
        description={`Share interesting code from ${owner}/${name}. Code snippets help others learn from your repository.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      {snippets.map((snippet) => {
        const isExpanded = expandedId === snippet.id;
        const codePreview = snippet.code.length > 300 && !isExpanded
          ? snippet.code.slice(0, 300) + '...'
          : snippet.code;

        return (
          <div
            key={snippet.id}
            className="rounded-xl border border-border bg-card overflow-hidden transition hover:border-primary/20"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-foreground truncate">
                    {snippet.title}
                  </h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${languageBadge(snippet.language)}`}>
                    {snippet.language}
                  </span>
                </div>
                {snippet.description && (
                  <p className="text-xs text-foreground-secondary line-clamp-2">
                    {snippet.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground-secondary flex-shrink-0">
                {snippet.user?.username && (
                  <div className="flex items-center gap-1.5">
                    {snippet.user.avatar ? (
                      <img
                        src={snippet.user.avatar}
                        alt={snippet.user.username}
                        className="h-5 w-5 rounded-full"
                      />
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                        {snippet.user.username[0]?.toUpperCase()}
                      </div>
                    )}
                    <span>@{snippet.user.username}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Code block */}
            <div className="mx-4 mb-3 overflow-hidden rounded-lg border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border bg-hover/50 px-3 py-1.5">
                <span className="text-[10px] font-medium text-foreground-secondary uppercase tracking-wider">
                  {snippet.language}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(snippet.code);
                  }}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-foreground-secondary transition hover:bg-hover hover:text-foreground"
                  title="Copy code"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
              </div>
              <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-foreground font-mono">
                <code>{codePreview}</code>
              </pre>
              {snippet.code.length > 300 && (
                <button
                  onClick={() => setExpandedId(isExpanded ? null : snippet.id)}
                  className="w-full border-t border-border px-3 py-1.5 text-center text-xs font-medium text-primary transition hover:bg-hover"
                >
                  {isExpanded ? 'Show less' : 'Show full snippet'}
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-foreground-secondary">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span>{fmt(snippet.likesCount)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span>{fmt(snippet.viewsCount)}</span>
                </div>
              </div>
              <span>
                {snippet.createdAt
                  ? formatDistanceToNow(new Date(snippet.createdAt), { addSuffix: true })
                  : ''}
              </span>
            </div>
          </div>
        );
      })}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {!hasMore && snippets.length > 0 && (
        <p className="py-4 text-center text-sm text-foreground-secondary">No more snippets to load.</p>
      )}
    </div>
  );
}
