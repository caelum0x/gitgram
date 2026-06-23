'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlameCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: {
    login: string;
    name: string;
    avatarUrl: string;
    date: string;
  };
}

interface BlameLine {
  lineNumber: number;
  content: string;
  commitSha: string;
}

interface BlameData {
  path: string;
  ref: string;
  language: string | null;
  lines: BlameLine[];
  commits: Record<string, BlameCommit>;
}

interface BlameApiResponse {
  success?: boolean;
  data?: BlameData;
  blame?: BlameData;
  error?: string;
}

// A run of consecutive lines that share the same commit.
interface BlameGroup {
  commit: BlameCommit | null;
  lines: BlameLine[];
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

// Group consecutive lines that were last touched by the same commit so the
// gutter only renders the commit metadata once per run.
function groupByCommit(
  lines: readonly BlameLine[],
  commits: Record<string, BlameCommit>
): BlameGroup[] {
  const groups: BlameGroup[] = [];
  let current: BlameGroup | null = null;
  for (const line of lines) {
    if (!current || current.lines[current.lines.length - 1]?.commitSha !== line.commitSha) {
      current = { commit: commits[line.commitSha] ?? null, lines: [line] };
      groups.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RepoBlamePage() {
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

  const [data, setData] = useState<BlameData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBlame = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        `${API_BASE}/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blame`
      );
      url.searchParams.set('path', currentPath);
      if (activeRef) url.searchParams.set('ref', activeRef);

      const res = await fetch(url.toString(), { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load blame (${res.status})`);
      }
      const json: BlameApiResponse = await res.json();
      const blame = json.data ?? json.blame ?? null;
      if (!blame) {
        throw new Error(json.error ?? 'Empty response from server');
      }
      setData(blame);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [owner, name, currentPath, activeRef]);

  useEffect(() => {
    void fetchBlame();
  }, [fetchBlame]);

  const groups = useMemo<BlameGroup[]>(
    () => (data ? groupByCommit(data.lines, data.commits) : []),
    [data]
  );

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
      <div className="mx-auto max-w-6xl">
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

        {/* View switcher */}
        <div className="flex items-center gap-3 text-xs mb-4">
          <span style={{ color: 'var(--foreground-secondary)' }}>Blame</span>
          <Link
            href={`/${owner}/${name}/blob/${currentPath}${refQuery}`}
            style={{ color: 'var(--primary)' }}
            className="hover:underline"
          >
            Source
          </Link>
          <Link
            href={`/${owner}/${name}/commits/${currentPath}${refQuery}`}
            style={{ color: 'var(--primary)' }}
            className="hover:underline"
          >
            History
          </Link>
        </div>

        {/* Loading */}
        {loading && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl p-6 text-sm"
          >
            <span style={{ color: 'var(--foreground-secondary)' }}>Loading blame…</span>
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
              onClick={() => void fetchBlame()}
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Blame table */}
        {!loading && !error && data && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="border-collapse w-full font-mono text-[13px] leading-5">
                <tbody>
                  {groups.map((group) => {
                    const commit = group.commit;
                    const rowSpan = group.lines.length;
                    return group.lines.map((line, lineIndex) => (
                      <tr key={line.lineNumber} className="hover:bg-[var(--surface-secondary)]">
                        {/* Commit gutter — rendered once per group via rowSpan */}
                        {lineIndex === 0 && (
                          <td
                            rowSpan={rowSpan}
                            style={{
                              borderRight: '1px solid var(--border)',
                              borderBottom: '1px solid var(--border)',
                              backgroundColor: 'var(--surface-dark)',
                            }}
                            className="align-top px-3 py-1 w-72 min-w-72"
                            title={commit?.message ?? ''}
                          >
                            {commit ? (
                              <div className="flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={commit.author.avatarUrl}
                                  alt={commit.author.name || commit.author.login}
                                  width={20}
                                  height={20}
                                  className="rounded-full flex-shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="truncate text-xs font-sans"
                                    style={{ color: 'var(--foreground)' }}
                                  >
                                    {commit.message.split('\n')[0]}
                                  </div>
                                  <div
                                    className="flex items-center gap-1.5 text-[11px] font-sans"
                                    style={{ color: 'var(--foreground-secondary)' }}
                                  >
                                    <span>{commit.author.name || commit.author.login}</span>
                                    <span>·</span>
                                    <Link
                                      href={`/${owner}/${name}/commit/${commit.sha}`}
                                      style={{ color: 'var(--primary)' }}
                                      className="hover:underline"
                                    >
                                      {commit.shortSha}
                                    </Link>
                                    <span>·</span>
                                    <span>{relativeDate(commit.author.date)}</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span
                                className="text-[11px] font-sans"
                                style={{ color: 'var(--foreground-secondary)' }}
                              >
                                Uncommitted
                              </span>
                            )}
                          </td>
                        )}

                        {/* Line number */}
                        <td
                          style={{
                            color: 'var(--foreground-secondary)',
                            borderRight: '1px solid var(--border)',
                            userSelect: 'none',
                          }}
                          className="select-none text-right pr-3 pl-4 align-top w-px whitespace-nowrap"
                        >
                          {line.lineNumber}
                        </td>

                        {/* Code */}
                        <td
                          style={{ color: 'var(--foreground)' }}
                          className={`pl-4 pr-6 whitespace-pre align-top language-${data.language ?? 'text'}`}
                        >
                          {line.content || ' '}
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
