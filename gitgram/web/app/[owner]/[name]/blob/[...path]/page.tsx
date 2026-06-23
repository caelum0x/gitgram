'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlobData {
  path: string;
  ref: string;
  name: string;
  size: number;
  lines: number;
  language: string | null;
  encoding: 'utf-8' | 'base64';
  content: string;
  isBinary: boolean;
  isImage: boolean;
  rawUrl: string;
}

interface BlobApiResponse {
  success?: boolean;
  data?: BlobData;
  blob?: BlobData;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function isMarkdownFile(name: string): boolean {
  const ext = fileExtension(name);
  return ext === 'md' || ext === 'markdown';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function joinPath(segments: readonly string[]): string {
  return segments.filter(Boolean).join('/');
}

function splitLines(content: string): string[] {
  const lines = content.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Lightweight markdown-to-HTML for the render toggle. Escapes HTML first so
// untrusted file content cannot inject markup.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(source: string): string {
  const escaped = escapeHtml(source);
  return escaped
    .replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RepoBlobPage() {
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

  const [data, setData] = useState<BlobData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [rendered, setRendered] = useState<boolean>(true);

  const fileName = pathSegments[pathSegments.length - 1] ?? '';

  const fetchBlob = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(
        `${API_BASE}/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob`
      );
      url.searchParams.set('path', currentPath);
      if (activeRef) url.searchParams.set('ref', activeRef);

      const res = await fetch(url.toString(), { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load file (${res.status})`);
      }
      const json: BlobApiResponse = await res.json();
      const blob = json.data ?? json.blob ?? null;
      if (!blob) {
        throw new Error(json.error ?? 'Empty response from server');
      }
      setData(blob);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [owner, name, currentPath, activeRef]);

  useEffect(() => {
    void fetchBlob();
  }, [fetchBlob]);

  const handleCopy = useCallback(async () => {
    if (!data || data.isBinary) return;
    try {
      await navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, [data]);

  const lines = useMemo(
    () => (data && !data.isBinary ? splitLines(data.content) : []),
    [data]
  );

  const isImage = useMemo(
    () => Boolean(data?.isImage) || IMAGE_EXTENSIONS.has(fileExtension(fileName)),
    [data, fileName]
  );
  const isMarkdown = isMarkdownFile(fileName);

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
      <div className="mx-auto max-w-5xl">
        {/* Breadcrumb + file name */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm mb-4">
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

        {/* Loading / error */}
        {loading && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl p-6 text-sm"
          >
            <span style={{ color: 'var(--foreground-secondary)' }}>Loading file…</span>
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
              onClick={() => void fetchBlob()}
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl overflow-hidden"
          >
            {/* Meta + action bar */}
            <div
              style={{ borderBottom: '1px solid var(--border)' }}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                <span>{formatBytes(data.size)}</span>
                {!data.isBinary && <span>{data.lines.toLocaleString()} lines</span>}
                {data.language && (
                  <span
                    style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
                    className="rounded-full px-2 py-0.5"
                  >
                    {data.language}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isMarkdown && !data.isBinary && (
                  <button
                    type="button"
                    onClick={() => setRendered((value) => !value)}
                    style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
                    className="rounded-md px-3 py-1.5 text-xs font-medium"
                  >
                    {rendered ? 'View source' : 'View rendered'}
                  </button>
                )}
                {!data.isBinary && (
                  <button
                    type="button"
                    onClick={() => void handleCopy()}
                    style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
                    className="rounded-md px-3 py-1.5 text-xs font-medium"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                )}
                <a
                  href={data.rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary)' }}
                  className="px-2 py-1.5 text-xs font-medium hover:underline"
                >
                  Raw
                </a>
                <Link
                  href={`/${owner}/${name}/blame/${currentPath}${refQuery}`}
                  style={{ color: 'var(--primary)' }}
                  className="px-2 py-1.5 text-xs font-medium hover:underline"
                >
                  Blame
                </Link>
                <Link
                  href={`/${owner}/${name}/commits/${currentPath}${refQuery}`}
                  style={{ color: 'var(--primary)' }}
                  className="px-2 py-1.5 text-xs font-medium hover:underline"
                >
                  History
                </Link>
                <Link
                  href={`/${owner}/${name}/edit/${currentPath}${refQuery}`}
                  style={{ color: 'var(--primary)' }}
                  className="px-2 py-1.5 text-xs font-medium hover:underline"
                >
                  Edit
                </Link>
              </div>
            </div>

            {/* Body */}
            {isImage ? (
              <div className="flex items-center justify-center p-8" style={{ backgroundColor: 'var(--surface-dark)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.rawUrl}
                  alt={data.name}
                  style={{ maxWidth: '100%', maxHeight: '70vh' }}
                  className="rounded-md"
                />
              </div>
            ) : data.isBinary ? (
              <div className="px-5 py-8 text-sm text-center" style={{ color: 'var(--foreground-secondary)' }}>
                Binary file not shown.{' '}
                <a href={data.rawUrl} style={{ color: 'var(--primary)' }} className="hover:underline">
                  View raw
                </a>
              </div>
            ) : isMarkdown && rendered ? (
              <div
                className="markdown-body px-6 py-5 text-sm leading-relaxed"
                style={{ color: 'var(--foreground)' }}
                dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(data.content)}</p>` }}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="border-collapse w-full font-mono text-[13px] leading-5">
                  <tbody>
                    {lines.map((line, index) => {
                      const lineNumber = index + 1;
                      return (
                        <tr key={lineNumber} className="hover:bg-[var(--surface-secondary)]">
                          <td
                            style={{
                              color: 'var(--foreground-secondary)',
                              borderRight: '1px solid var(--border)',
                              userSelect: 'none',
                            }}
                            className="select-none text-right pr-3 pl-4 align-top w-px whitespace-nowrap"
                          >
                            {lineNumber}
                          </td>
                          <td
                            style={{ color: 'var(--foreground)' }}
                            className={`pl-4 pr-6 whitespace-pre align-top language-${data.language ?? 'text'}`}
                          >
                            {line || ' '}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
