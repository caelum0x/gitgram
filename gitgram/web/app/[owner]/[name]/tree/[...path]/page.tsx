'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LastCommit {
  message: string;
  date: string;
  authorName: string;
  sha: string;
}

interface TreeEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
  size: number | null;
  lastCommit: LastCommit | null;
}

interface TreeRef {
  name: string;
  type: 'branch' | 'tag';
}

interface TreeData {
  path: string;
  ref: string;
  entries: TreeEntry[];
  refs: TreeRef[];
  readme: string | null;
}

interface TreeApiResponse {
  success?: boolean;
  data?: TreeData;
  tree?: TreeData;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const units: Array<[number, string]> = [
    [31536000, 'year'],
    [2592000, 'month'],
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [unitSeconds, label] of units) {
    const value = Math.floor(seconds / unitSeconds);
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

function sortEntries(entries: readonly TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function joinPath(segments: readonly string[]): string {
  return segments.filter(Boolean).join('/');
}

function FolderIcon() {
  return <span aria-hidden="true">📁</span>;
}

function FileIcon() {
  return <span aria-hidden="true">📄</span>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RepoTreePage() {
  const params = useParams<{ owner: string; name: string; path?: string[] }>();
  const searchParams = useSearchParams();

  const owner = params.owner;
  const name = params.name;
  const pathSegments = useMemo<string[]>(
    () => (Array.isArray(params.path) ? params.path : []),
    [params.path]
  );
  const currentPath = joinPath(pathSegments);
  const refFromQuery = searchParams.get('ref') ?? '';

  const [data, setData] = useState<TreeData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRef, setActiveRef] = useState<string>(refFromQuery);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        `${API_BASE}/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tree`
      );
      if (currentPath) url.searchParams.set('path', currentPath);
      if (activeRef) url.searchParams.set('ref', activeRef);

      const res = await fetch(url.toString(), { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load tree (${res.status})`);
      }
      const json: TreeApiResponse = await res.json();
      const tree = json.data ?? json.tree ?? null;
      if (!tree) {
        throw new Error(json.error ?? 'Empty response from server');
      }
      setData(tree);
      if (!activeRef && tree.ref) setActiveRef(tree.ref);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [owner, name, currentPath, activeRef]);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree]);

  const entries = useMemo(() => (data ? sortEntries(data.entries) : []), [data]);

  const refQuery = activeRef ? `?ref=${encodeURIComponent(activeRef)}` : '';

  // Breadcrumb segments with cumulative hrefs.
  const crumbs = useMemo(() => {
    const acc: Array<{ label: string; href: string }> = [];
    pathSegments.forEach((segment, index) => {
      const sub = joinPath(pathSegments.slice(0, index + 1));
      acc.push({ label: segment, href: `/${owner}/${name}/tree/${sub}${refQuery}` });
    });
    return acc;
  }, [pathSegments, owner, name, refQuery]);

  return (
    <div
      style={{ backgroundColor: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)' }}
      className="px-4 py-6"
    >
      <div className="mx-auto max-w-5xl">
        {/* Header: breadcrumb + ref selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
            <Link
              href={`/${owner}/${name}/tree${refQuery}`}
              style={{ color: 'var(--primary)' }}
              className="font-semibold hover:underline"
            >
              {name}
            </Link>
            {crumbs.map((crumb, index) => (
              <span key={crumb.href} className="flex items-center gap-1">
                <span style={{ color: 'var(--foreground-secondary)' }}>/</span>
                {index === crumbs.length - 1 ? (
                  <span style={{ color: 'var(--foreground)' }} className="font-medium">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} style={{ color: 'var(--primary)' }} className="hover:underline">
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          {data && data.refs.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <span style={{ color: 'var(--foreground-secondary)' }}>Ref</span>
              <select
                value={activeRef}
                onChange={(event) => setActiveRef(event.target.value)}
                style={{
                  backgroundColor: 'var(--surface-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
                className="rounded-md px-3 py-1.5 text-sm outline-none"
              >
                {data.refs.map((entry) => (
                  <option key={`${entry.type}:${entry.name}`} value={entry.name}>
                    {entry.name}
                    {entry.type === 'tag' ? ' (tag)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Loading / error states */}
        {loading && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl p-6 text-sm"
          >
            <span style={{ color: 'var(--foreground-secondary)' }}>Loading files…</span>
          </div>
        )}

        {!loading && error && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--error)' }}
            className="rounded-xl p-6 text-sm flex items-center justify-between gap-3"
          >
            <span style={{ color: 'var(--error)' }}>{error}</span>
            <button
              type="button"
              onClick={() => void fetchTree()}
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* File / folder list */}
        {!loading && !error && data && (
          <>
            <div
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              className="rounded-xl overflow-hidden"
            >
              {currentPath && (
                <Link
                  href={`/${owner}/${name}/tree/${joinPath(pathSegments.slice(0, -1))}${refQuery}`}
                  style={{ borderBottom: '1px solid var(--border)', color: 'var(--foreground-secondary)' }}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-[var(--surface-secondary)]"
                >
                  <span aria-hidden="true">↩</span>
                  <span>..</span>
                </Link>
              )}

              {entries.length === 0 ? (
                <div className="px-4 py-6 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                  This directory is empty.
                </div>
              ) : (
                entries.map((entry) => {
                  const href =
                    entry.type === 'dir'
                      ? `/${owner}/${name}/tree/${entry.path}${refQuery}`
                      : `/${owner}/${name}/blob/${entry.path}${refQuery}`;
                  return (
                    <Link
                      key={entry.path}
                      href={href}
                      style={{ borderBottom: '1px solid var(--border)' }}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-2.5 text-sm hover:bg-[var(--surface-secondary)] transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {entry.type === 'dir' ? <FolderIcon /> : <FileIcon />}
                        <span
                          style={{ color: entry.type === 'dir' ? 'var(--primary)' : 'var(--foreground)' }}
                          className="truncate"
                        >
                          {entry.name}
                        </span>
                        {entry.lastCommit && (
                          <span
                            style={{ color: 'var(--foreground-secondary)' }}
                            className="truncate hidden sm:inline"
                          >
                            {entry.lastCommit.message}
                          </span>
                        )}
                      </span>
                      <span
                        style={{ color: 'var(--foreground-secondary)' }}
                        className="text-xs whitespace-nowrap"
                      >
                        {entry.lastCommit ? relativeTime(entry.lastCommit.date) : ''}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>

            {/* README */}
            {data.readme && (
              <div
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                className="rounded-xl mt-5 overflow-hidden"
              >
                <div
                  style={{ borderBottom: '1px solid var(--border)', color: 'var(--foreground)' }}
                  className="px-4 py-2.5 text-sm font-semibold flex items-center gap-2"
                >
                  <span aria-hidden="true">📖</span>
                  README
                </div>
                <pre
                  style={{
                    color: 'var(--foreground)',
                    fontFamily: 'inherit',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                  className="px-5 py-4 text-sm leading-relaxed"
                >
                  {data.readme}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
