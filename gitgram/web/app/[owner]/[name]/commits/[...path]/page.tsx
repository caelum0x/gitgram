'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommitAuthor {
  login: string;
  name: string;
  avatarUrl: string;
  date: string;
}

interface FileCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: CommitAuthor;
  additions: number;
  deletions: number;
}

interface CommitsData {
  path: string;
  ref: string;
  commits: FileCommit[];
  nextCursor: string | null;
}

interface CommitsApiResponse {
  success?: boolean;
  data?: CommitsData;
  commits?: FileCommit[];
  nextCursor?: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function joinPath(segments: readonly string[]): string {
  return segments.filter(Boolean).join('/');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RepoFileCommitsPage() {
  const params = useParams<{ owner: string; name: string; path?: string[] }>();
  const searchParams = useSearchParams();

  const owner = params.owner;
  const name = params.name;
  const pathSegments = useMemo<string[]>(
    () => (Array.isArray(params.path) ? params.path : []),
    [params.path]
  );
  const currentPath = joinPath(pathSegments);
  const activeRef = searchParams.get('ref') ?? '';
  const refQuery = activeRef ? `?ref=${encodeURIComponent(activeRef)}` : '';
  const fileName = pathSegments[pathSegments.length - 1] ?? '';

  const [commits, setCommits] = useState<FileCommit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCommits = useCallback(
    async (pageCursor: string | null) => {
      const append = pageCursor !== null;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const url = new URL(
          `${API_BASE}/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits`
        );
        url.searchParams.set('path', currentPath);
        if (activeRef) url.searchParams.set('ref', activeRef);
        if (pageCursor) url.searchParams.set('cursor', pageCursor);

        const res = await fetch(url.toString(), { credentials: 'include' });
        if (!res.ok) {
          throw new Error(`Failed to load history (${res.status})`);
        }
        const json: CommitsApiResponse = await res.json();
        const page = json.data?.commits ?? json.commits ?? null;
        if (!page) {
          throw new Error(json.error ?? 'Empty response from server');
        }
        const next = json.data?.nextCursor ?? json.nextCursor ?? null;
        setCommits((prev) => (append ? [...prev, ...page] : page));
        setNextCursor(next);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [owner, name, currentPath, activeRef]
  );

  // Reset and fetch the first page whenever the file or ref changes.
  useEffect(() => {
    setCursor(null);
    void fetchCommits(null);
  }, [fetchCommits]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor) return;
    setCursor(nextCursor);
    void fetchCommits(nextCursor);
  }, [nextCursor, fetchCommits]);

  // Breadcrumb segments (all but the last point to /tree, last is the file).
  const crumbs = useMemo(() => {
    const dirs = pathSegments.slice(0, -1);
    return dirs.map((segment, index) => ({
      label: segment,
      href: `/${owner}/${name}/tree/${joinPath(dirs.slice(0, index + 1))}${refQuery}`,
    }));
  }, [pathSegments, owner, name, refQuery]);

  return (
    <div
      style={{ backgroundColor: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)' }}
      className="px-4 py-6"
    >
      <div className="mx-auto max-w-4xl">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm mb-2">
          <Link
            href={`/${owner}/${name}/tree${refQuery}`}
            style={{ color: 'var(--primary)' }}
            className="font-semibold hover:underline"
          >
            {name}
          </Link>
          {crumbs.map((crumb) => (
            <span key={crumb.href} className="flex items-center gap-1">
              <span style={{ color: 'var(--foreground-secondary)' }}>/</span>
              <Link href={crumb.href} style={{ color: 'var(--primary)' }} className="hover:underline">
                {crumb.label}
              </Link>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span style={{ color: 'var(--foreground-secondary)' }}>/</span>
            <span style={{ color: 'var(--foreground)' }} className="font-medium">
              {fileName}
            </span>
          </span>
        </nav>

        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
            Commit history
          </h1>
          <Link
            href={`/${owner}/${name}/blob/${currentPath}${refQuery}`}
            style={{ color: 'var(--primary)' }}
            className="text-xs hover:underline"
          >
            View file
          </Link>
        </div>

        {/* Loading */}
        {loading && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl p-6 text-sm"
          >
            <span style={{ color: 'var(--foreground-secondary)' }}>Loading history…</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--error)' }}
            className="rounded-xl p-6 text-sm flex items-center justify-between gap-3"
          >
            <span style={{ color: 'var(--error)' }}>{error}</span>
            <button
              type="button"
              onClick={() => void fetchCommits(cursor)}
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && commits.length === 0 && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl p-8 text-sm text-center"
          >
            <span style={{ color: 'var(--foreground-secondary)' }}>
              No commits found for this file.
            </span>
          </div>
        )}

        {/* Timeline */}
        {!loading && !error && commits.length > 0 && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl overflow-hidden"
          >
            <ul>
              {commits.map((commit, index) => (
                <li
                  key={commit.sha}
                  style={{
                    borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                  }}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--surface-secondary)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={commit.author.avatarUrl}
                    alt={commit.author.name || commit.author.login}
                    width={32}
                    height={32}
                    className="rounded-full flex-shrink-0 mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${owner}/${name}/commit/${commit.sha}`}
                      className="block truncate text-sm font-medium hover:underline"
                      style={{ color: 'var(--foreground)' }}
                      title={commit.message}
                    >
                      {commit.message.split('\n')[0]}
                    </Link>
                    <div
                      className="flex flex-wrap items-center gap-1.5 text-xs mt-0.5"
                      style={{ color: 'var(--foreground-secondary)' }}
                    >
                      <span className="font-medium" style={{ color: 'var(--foreground)' }}>
                        {commit.author.name || commit.author.login}
                      </span>
                      <span>committed</span>
                      <span>{relativeDate(commit.author.date)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* +/- stats */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span style={{ color: 'var(--accent)' }}>+{commit.additions}</span>
                      <span style={{ color: 'var(--error)' }}>-{commit.deletions}</span>
                    </div>
                    <Link
                      href={`/${owner}/${name}/commit/${commit.sha}`}
                      style={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--foreground)',
                        border: '1px solid var(--border)',
                      }}
                      className="rounded-md px-2 py-1 text-xs font-mono hover:underline"
                    >
                      {commit.shortSha}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && nextCursor && (
          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                opacity: loadingMore ? 0.6 : 1,
              }}
              className="rounded-md px-4 py-2 text-sm font-medium hover:bg-[var(--surface-secondary)]"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
