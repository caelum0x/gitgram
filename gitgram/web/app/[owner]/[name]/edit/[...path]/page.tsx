'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlobData {
  path: string;
  ref: string;
  name: string;
  content: string;
  encoding: 'utf-8' | 'base64';
  language: string | null;
  isBinary: boolean;
  defaultBranch: string;
}

interface BlobApiResponse {
  success?: boolean;
  data?: BlobData;
  blob?: BlobData;
  error?: string;
}

interface SaveApiResponse {
  success?: boolean;
  data?: { commitSha: string; branch: string; pullRequestNumber?: number };
  error?: string;
}

type CommitTarget = 'default' | 'new-branch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// Map common file extensions to a language label for the editor chip.
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  json: 'JSON',
  py: 'Python',
  rb: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  cs: 'C#',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  md: 'Markdown',
  css: 'CSS',
  scss: 'SCSS',
  html: 'HTML',
  yml: 'YAML',
  yaml: 'YAML',
  sh: 'Shell',
  sql: 'SQL',
};

function joinPath(segments: readonly string[]): string {
  return segments.filter(Boolean).join('/');
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function detectLanguage(name: string, fallback: string | null): string {
  return LANGUAGE_BY_EXTENSION[fileExtension(name)] ?? fallback ?? 'Plain text';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}

function countLines(text: string): number {
  if (text.length === 0) return 1;
  return text.split('\n').length;
}

function slugifyBranch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RepoEditPage() {
  const params = useParams<{ owner: string; name: string; path?: string[] }>();
  const searchParams = useSearchParams();
  const router = useRouter();

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

  const [content, setContent] = useState<string>('');
  const [original, setOriginal] = useState<string>('');
  const [defaultBranch, setDefaultBranch] = useState<string>('main');
  const [language, setLanguage] = useState<string>('Plain text');

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [commitMessage, setCommitMessage] = useState<string>('');
  const [commitDescription, setCommitDescription] = useState<string>('');
  const [target, setTarget] = useState<CommitTarget>('default');
  const [newBranch, setNewBranch] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const fetchBlob = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
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
      if (blob.isBinary) {
        throw new Error('Binary files cannot be edited in the browser.');
      }
      setContent(blob.content);
      setOriginal(blob.content);
      setDefaultBranch(blob.defaultBranch || 'main');
      setLanguage(detectLanguage(blob.name, blob.language));
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [owner, name, currentPath, activeRef]);

  useEffect(() => {
    void fetchBlob();
  }, [fetchBlob]);

  // Keep the line-number gutter scroll position in sync with the textarea.
  const handleScroll = useCallback(() => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const lineCount = useMemo(() => countLines(content), [content]);
  const isDirty = content !== original;

  const canCommit =
    isDirty &&
    !saving &&
    commitMessage.trim().length > 0 &&
    (target === 'default' || slugifyBranch(newBranch).length > 0);

  const handleSave = useCallback(async () => {
    if (!canCommit) return;
    setSaving(true);
    setSaveError(null);
    try {
      const branchSlug = target === 'new-branch' ? slugifyBranch(newBranch) : defaultBranch;
      const url = `${API_BASE}/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/blob`;
      const res = await fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: currentPath,
          ref: activeRef || defaultBranch,
          content,
          message: commitMessage.trim(),
          description: commitDescription.trim() || undefined,
          branch: branchSlug,
          createNewBranch: target === 'new-branch',
          openPullRequest: target === 'new-branch',
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to commit changes (${res.status})`);
      }
      const json: SaveApiResponse = await res.json();
      if (json.success === false) {
        throw new Error(json.error ?? 'Failed to commit changes');
      }
      const prNumber = json.data?.pullRequestNumber;
      if (target === 'new-branch' && prNumber) {
        router.push(`/${owner}/${name}/pull/${prNumber}`);
        return;
      }
      router.push(`/${owner}/${name}/blob/${currentPath}${refQuery}`);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [
    canCommit,
    target,
    newBranch,
    defaultBranch,
    owner,
    name,
    currentPath,
    activeRef,
    content,
    commitMessage,
    commitDescription,
    refQuery,
    router,
  ]);

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
        {/* Breadcrumb */}
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

        {/* Loading */}
        {loading && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
            className="rounded-xl p-6 text-sm"
          >
            <span style={{ color: 'var(--foreground-secondary)' }}>Loading file…</span>
          </div>
        )}

        {/* Load error */}
        {!loading && loadError && (
          <div
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--error)' }}
            className="rounded-xl p-6 text-sm flex items-center justify-between gap-3"
          >
            <span style={{ color: 'var(--error)' }}>{loadError}</span>
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

        {/* Editor */}
        {!loading && !loadError && (
          <>
            <div
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              className="rounded-xl overflow-hidden"
            >
              {/* Filename + language chip */}
              <div
                style={{ borderBottom: '1px solid var(--border)' }}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span className="font-mono text-sm" style={{ color: 'var(--foreground)' }}>
                  {fileName}
                </span>
                <span
                  style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--foreground)' }}
                  className="rounded-full px-2 py-0.5 text-xs"
                >
                  {language}
                </span>
              </div>

              {/* Code editor: line-number gutter + monospace textarea */}
              <div className="flex" style={{ maxHeight: '60vh' }}>
                <div
                  ref={gutterRef}
                  aria-hidden="true"
                  style={{
                    color: 'var(--foreground-secondary)',
                    borderRight: '1px solid var(--border)',
                    backgroundColor: 'var(--surface-dark)',
                    overflow: 'hidden',
                  }}
                  className="select-none text-right py-3 px-3 font-mono text-[13px] leading-5"
                >
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i + 1}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onScroll={handleScroll}
                  spellCheck={false}
                  wrap="off"
                  aria-label={`Edit ${fileName}`}
                  style={{
                    backgroundColor: 'var(--surface)',
                    color: 'var(--foreground)',
                    resize: 'none',
                    tabSize: 2,
                  }}
                  className="flex-1 py-3 px-4 font-mono text-[13px] leading-5 outline-none whitespace-pre overflow-auto"
                />
              </div>
            </div>

            {/* Commit changes panel */}
            <div
              style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              className="rounded-xl mt-4 p-4"
            >
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
                Commit changes
              </h2>

              <input
                type="text"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder={`Update ${fileName}`}
                style={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
                className="w-full rounded-md px-3 py-2 text-sm outline-none mb-3"
              />

              <textarea
                value={commitDescription}
                onChange={(event) => setCommitDescription(event.target.value)}
                placeholder="Add an optional extended description…"
                rows={3}
                style={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  resize: 'vertical',
                }}
                className="w-full rounded-md px-3 py-2 text-sm outline-none mb-4"
              />

              {/* Branch target radios */}
              <fieldset className="space-y-3 mb-4">
                <legend className="sr-only">Choose where to commit</legend>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="commit-target"
                    checked={target === 'default'}
                    onChange={() => setTarget('default')}
                    className="mt-1"
                  />
                  <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                    Commit directly to the{' '}
                    <span className="font-mono" style={{ color: 'var(--primary)' }}>
                      {defaultBranch}
                    </span>{' '}
                    branch
                  </span>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="commit-target"
                    checked={target === 'new-branch'}
                    onChange={() => setTarget('new-branch')}
                    className="mt-1"
                  />
                  <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                    Create a new branch and start a pull request
                  </span>
                </label>

                {target === 'new-branch' && (
                  <input
                    type="text"
                    value={newBranch}
                    onChange={(event) => setNewBranch(event.target.value)}
                    placeholder="patch-1"
                    style={{
                      backgroundColor: 'var(--background)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                    }}
                    className="ml-6 w-full max-w-xs rounded-md px-3 py-1.5 text-sm font-mono outline-none"
                  />
                )}
              </fieldset>

              {saveError && (
                <p className="text-sm mb-3" style={{ color: 'var(--error)' }}>
                  {saveError}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!canCommit}
                  style={{
                    backgroundColor: canCommit ? 'var(--accent)' : 'var(--surface-secondary)',
                    color: canCommit ? '#ffffff' : 'var(--foreground-secondary)',
                    cursor: canCommit ? 'pointer' : 'not-allowed',
                  }}
                  className="rounded-md px-4 py-2 text-sm font-medium"
                >
                  {saving ? 'Committing…' : 'Commit changes'}
                </button>
                <Link
                  href={`/${owner}/${name}/blob/${currentPath}${refQuery}`}
                  style={{ color: 'var(--foreground-secondary)' }}
                  className="text-sm hover:underline"
                >
                  Cancel
                </Link>
                {!isDirty && (
                  <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                    No changes to commit
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
