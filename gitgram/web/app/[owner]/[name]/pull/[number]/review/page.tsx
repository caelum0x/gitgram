'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';
type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed';
type DiffView = 'unified' | 'split';

interface DiffLine {
  lineNo: number | null;
  newLineNo: number | null;
  type: 'context' | 'add' | 'remove';
  content: string;
}

interface InlineComment {
  id: string;
  path: string;
  line: number;
  body: string;
  author: {
    login: string;
    avatarUrl: string;
  };
  createdAt: string;
}

interface PendingInlineComment {
  path: string;
  line: number;
  body: string;
}

interface ChangedFile {
  filename: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch: string;
  language: string;
}

interface PullRequest {
  id: string;
  number: number;
  title: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: ChangedFile[];
}

interface Reviewer {
  id: string;
  login: string;
  avatarUrl: string;
  state: ReviewEvent;
  body: string;
  submittedAt: string;
}

interface ReviewsResponse {
  reviews: Reviewer[];
}

interface PullResponse {
  data: PullRequest;
}

interface SubmitReviewBody {
  body: string;
  event: ReviewEvent;
  comments: PendingInlineComment[];
}

// ─── Language badge map ───────────────────────────────────────────────────────

const LANG_COLOR: Record<string, string> = {
  ts: '#3178c6',
  tsx: '#3178c6',
  js: '#f1e05a',
  jsx: '#f1e05a',
  py: '#3572a5',
  go: '#00add8',
  rs: '#dea584',
  java: '#b07219',
  rb: '#701516',
  md: '#083fa1',
  json: '#292929',
  yml: '#cb171e',
  yaml: '#cb171e',
  sh: '#89e051',
  css: '#563d7c',
  html: '#e34c26',
};

function getLangColor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return LANG_COLOR[ext] ?? '#8b949e';
}

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? 'txt';
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<FileStatus, { bg: string; text: string; label: string }> = {
  modified: { bg: 'bg-[#1c2a3a]', text: 'text-[var(--primary)]', label: 'M' },
  added:    { bg: 'bg-[#1a2e1a]', text: 'text-[var(--accent)]',  label: 'A' },
  deleted:  { bg: 'bg-[#2e1a1a]', text: 'text-[var(--error)]',   label: 'D' },
  renamed:  { bg: 'bg-[#2a1a2e]', text: 'text-purple-400',       label: 'R' },
};

function StatusBadge({ status }: { status: FileStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.modified;
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${s.bg} ${s.text}`}
      title={status}
    >
      {s.label}
    </span>
  );
}

// ─── Decision badge ───────────────────────────────────────────────────────────

function DecisionBadge({ event }: { event: ReviewEvent }) {
  const map: Record<ReviewEvent, { label: string; cls: string }> = {
    APPROVE:         { label: 'Approved',          cls: 'bg-[#1a2e1a] text-[var(--accent)]' },
    REQUEST_CHANGES: { label: 'Changes Requested',  cls: 'bg-[#2e1a1a] text-[var(--error)]' },
    COMMENT:         { label: 'Commented',           cls: 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)]' },
  };
  const { label, cls } = map[event];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
  );
}

// ─── Parse unified diff into lines ───────────────────────────────────────────

function parsePatch(patch: string): DiffLine[] {
  if (!patch) return [];
  const lines = patch.split('\n');
  const result: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;

  for (const raw of lines) {
    if (raw.startsWith('@@')) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      if (m) {
        oldNo = parseInt(m[1], 10) - 1;
        newNo = parseInt(m[2], 10) - 1;
      }
      continue;
    }
    if (raw.startsWith('+')) {
      newNo++;
      result.push({ lineNo: null, newLineNo: newNo, type: 'add', content: raw.slice(1) });
    } else if (raw.startsWith('-')) {
      oldNo++;
      result.push({ lineNo: oldNo, newLineNo: null, type: 'remove', content: raw.slice(1) });
    } else {
      oldNo++;
      newNo++;
      result.push({ lineNo: oldNo, newLineNo: newNo, type: 'context', content: raw.slice(1) });
    }
  }
  return result;
}

// ─── Inline comment form ──────────────────────────────────────────────────────

interface InlineCommentFormProps {
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

function InlineCommentForm({ onSubmit, onCancel }: InlineCommentFormProps) {
  const [body, setBody] = useState('');
  return (
    <tr className="bg-[var(--surface)]">
      <td colSpan={3} className="px-4 py-3">
        <div className="border border-[var(--border)] rounded-md overflow-hidden">
          <textarea
            className="w-full bg-[var(--background)] text-[var(--foreground)] text-sm px-3 py-2 resize-none outline-none placeholder:text-[var(--foreground-secondary)]"
            rows={3}
            placeholder="Leave an inline comment..."
            value={body}
            onChange={e => setBody(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 px-3 py-2 bg-[var(--background-light)] border-t border-[var(--border)]">
            <button
              type="button"
              disabled={!body.trim()}
              onClick={() => { if (body.trim()) onSubmit(body.trim()); }}
              className="px-3 py-1 text-xs font-medium rounded bg-[var(--accent)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Add comment
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1 text-xs font-medium rounded bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Diff table for one file ──────────────────────────────────────────────────

interface FileDiffProps {
  file: ChangedFile;
  inlineComments: InlineComment[];
  pendingComments: PendingInlineComment[];
  onAddPending: (comment: PendingInlineComment) => void;
  view: DiffView;
}

function FileDiff({ file, inlineComments, pendingComments, onAddPending, view }: FileDiffProps) {
  const [activeLineKey, setActiveLineKey] = useState<string | null>(null);
  const lines = parsePatch(file.patch);

  const handleLineClick = useCallback((lineKey: string) => {
    setActiveLineKey(prev => (prev === lineKey ? null : lineKey));
  }, []);

  const handleSubmitInline = useCallback(
    (lineKey: string, lineNo: number, body: string) => {
      onAddPending({ path: file.filename, line: lineNo, body });
      setActiveLineKey(null);
    },
    [file.filename, onAddPending],
  );

  const getLineKey = (line: DiffLine, idx: number) =>
    `${file.filename}:${line.newLineNo ?? line.lineNo ?? idx}`;

  const lineClass = (type: DiffLine['type']) => {
    if (type === 'add')    return 'bg-[#0d2a1a] text-[#7ee787]';
    if (type === 'remove') return 'bg-[#2a0d0d] text-[#ff7b72]';
    return 'text-[var(--foreground)]';
  };

  const prefixChar = (type: DiffLine['type']) => {
    if (type === 'add')    return '+';
    if (type === 'remove') return '-';
    return ' ';
  };

  if (view === 'split') {
    const addLines    = lines.filter(l => l.type !== 'remove');
    const removeLines = lines.filter(l => l.type !== 'add');
    const maxLen      = Math.max(addLines.length, removeLines.length);

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono border-collapse min-w-[800px]">
          <tbody>
            {Array.from({ length: maxLen }).map((_, i) => {
              const left  = removeLines[i];
              const right = addLines[i];
              return (
                <tr key={i} className="border-b border-[var(--border)]/20">
                  {/* left */}
                  <td className="w-10 text-right text-[var(--foreground-secondary)] select-none px-2 py-0.5 border-r border-[var(--border)]/30 bg-[var(--background-light)]">
                    {left?.lineNo ?? ''}
                  </td>
                  <td className={`px-3 py-0.5 w-1/2 ${left ? lineClass(left.type) : ''} whitespace-pre`}>
                    {left ? `${prefixChar(left.type)} ${left.content}` : ''}
                  </td>
                  {/* right */}
                  <td className="w-10 text-right text-[var(--foreground-secondary)] select-none px-2 py-0.5 border-r border-l border-[var(--border)]/30 bg-[var(--background-light)]">
                    {right?.newLineNo ?? ''}
                  </td>
                  <td className={`px-3 py-0.5 w-1/2 ${right ? lineClass(right.type) : ''} whitespace-pre`}>
                    {right ? `${prefixChar(right.type)} ${right.content}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Unified view
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <tbody>
          {lines.map((line, idx) => {
            const lineKey  = getLineKey(line, idx);
            const lineNo   = line.newLineNo ?? line.lineNo ?? idx;
            const isActive = activeLineKey === lineKey;

            const existingForLine = inlineComments.filter(
              c => c.path === file.filename && c.line === lineNo,
            );
            const pendingForLine = pendingComments.filter(
              c => c.path === file.filename && c.line === lineNo,
            );

            return (
              <>
                <tr
                  key={lineKey}
                  className={`border-b border-[var(--border)]/20 group cursor-pointer hover:brightness-110 ${lineClass(line.type)}`}
                  onClick={() => handleLineClick(lineKey)}
                >
                  <td className="w-10 text-right text-[var(--foreground-secondary)] select-none px-2 py-0.5 bg-[var(--background-light)] border-r border-[var(--border)]/30">
                    {line.lineNo ?? ''}
                  </td>
                  <td className="w-10 text-right text-[var(--foreground-secondary)] select-none px-2 py-0.5 bg-[var(--background-light)] border-r border-[var(--border)]/30">
                    {line.newLineNo ?? ''}
                  </td>
                  <td className="px-3 py-0.5 whitespace-pre">
                    <span className="mr-2 opacity-60">{prefixChar(line.type)}</span>
                    {line.content}
                    <span className="ml-2 opacity-0 group-hover:opacity-60 text-[var(--primary)] text-[10px]">
                      + comment
                    </span>
                  </td>
                </tr>

                {isActive && (
                  <InlineCommentForm
                    key={`form-${lineKey}`}
                    onSubmit={body => handleSubmitInline(lineKey, lineNo, body)}
                    onCancel={() => setActiveLineKey(null)}
                  />
                )}

                {existingForLine.map(c => (
                  <tr key={c.id} className="bg-[var(--surface)]">
                    <td colSpan={3} className="px-6 py-2">
                      <div className="flex gap-3 items-start">
                        <img
                          src={c.author.avatarUrl}
                          alt={c.author.login}
                          className="w-6 h-6 rounded-full mt-0.5 flex-shrink-0"
                        />
                        <div>
                          <span className="text-[var(--primary)] text-xs font-medium mr-2">
                            {c.author.login}
                          </span>
                          <span className="text-[var(--foreground-secondary)] text-[10px]">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </span>
                          <p className="text-[var(--foreground)] text-xs mt-0.5">{c.body}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}

                {pendingForLine.map((c, pi) => (
                  <tr key={`pending-${pi}`} className="bg-[#1c2a1a]">
                    <td colSpan={3} className="px-6 py-2">
                      <div className="flex gap-2 items-center">
                        <span className="text-[10px] text-[var(--accent)] font-medium border border-[var(--accent)]/40 rounded px-1.5 py-0.5">
                          Pending
                        </span>
                        <p className="text-[var(--foreground)] text-xs">{c.body}</p>
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchPullRequest(owner: string, repo: string, number: string): Promise<PullRequest> {
  const { data } = await api.get<PullResponse>(
    `/v1/repositories/${owner}/${repo}/pulls/${number}`,
  );
  return data.data;
}

async function fetchReviews(owner: string, repo: string, number: string): Promise<Reviewer[]> {
  const { data } = await api.get<ReviewsResponse>(
    `/v1/repositories/${owner}/${repo}/pulls/${number}/reviews`,
  );
  return data.reviews;
}

async function fetchInlineComments(
  owner: string,
  repo: string,
  number: string,
): Promise<InlineComment[]> {
  const { data } = await api.get<{ comments: InlineComment[] }>(
    `/v1/repositories/${owner}/${repo}/pulls/${number}/comments`,
  );
  return data.comments;
}

async function submitReview(
  pullId: string,
  body: SubmitReviewBody,
): Promise<void> {
  await api.post(`/v1/pulls/${pullId}/reviews`, body);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PullReviewPage() {
  const params  = useParams<{ owner: string; name: string; number: string }>();
  const owner   = params.owner;
  const repo    = params.name;
  const prNum   = params.number;

  // Diff view toggle
  const [view, setView] = useState<DiffView>('unified');

  // Active file in sidebar
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // Review form state
  const [reviewBody,  setReviewBody]  = useState('');
  const [reviewEvent, setReviewEvent] = useState<ReviewEvent>('COMMENT');

  // Pending inline comments accumulated before final submit
  const [pendingComments, setPendingComments] = useState<PendingInlineComment[]>([]);

  // Refs for jump-to-file
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: pr,
    isLoading: prLoading,
    isError: prError,
  } = useQuery({
    queryKey: ['pull', owner, repo, prNum],
    queryFn:  () => fetchPullRequest(owner, repo, prNum),
    enabled:  Boolean(owner && repo && prNum),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['pull-reviews', owner, repo, prNum],
    queryFn:  () => fetchReviews(owner, repo, prNum),
    enabled:  Boolean(owner && repo && prNum),
  });

  const { data: inlineComments = [] } = useQuery({
    queryKey: ['pull-inline-comments', owner, repo, prNum],
    queryFn:  () => fetchInlineComments(owner, repo, prNum),
    enabled:  Boolean(owner && repo && prNum),
  });

  // ── Submit mutation ───────────────────────────────────────────────────────

  const { mutate: doSubmit, isPending: submitting, isSuccess, isError: submitError } = useMutation({
    mutationFn: (body: SubmitReviewBody) => submitReview(pr?.id ?? '', body),
    onSuccess: () => {
      setReviewBody('');
      setPendingComments([]);
    },
  });

  const handleSubmitReview = useCallback(() => {
    if (!pr) return;
    doSubmit({
      body: reviewBody,
      event: reviewEvent,
      comments: pendingComments,
    });
  }, [pr, reviewBody, reviewEvent, pendingComments, doSubmit]);

  // ── Inline comment accumulation ───────────────────────────────────────────

  const handleAddPending = useCallback((comment: PendingInlineComment) => {
    setPendingComments(prev => [...prev, comment]);
  }, []);

  const handleRemovePending = useCallback((idx: number) => {
    setPendingComments(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Jump to file ──────────────────────────────────────────────────────────

  const jumpToFile = useCallback((filename: string) => {
    setActiveFile(filename);
    const el = fileRefs.current[filename];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (prLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (prError || !pr) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--error)] text-lg font-medium mb-2">Failed to load pull request</p>
          <Link href={`/${owner}/${repo}`} className="text-[var(--primary)] text-sm hover:underline">
            Back to repository
          </Link>
        </div>
      </div>
    );
  }

  const files = pr.files ?? [];

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[var(--background-light)] border-b border-[var(--border)] px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-[var(--foreground-secondary)] mb-0.5">
              <Link href={`/${owner}/${repo}`} className="hover:text-[var(--primary)] transition-colors">
                {owner}/{repo}
              </Link>
              <span>/</span>
              <Link
                href={`/${owner}/${repo}/pull/${prNum}`}
                className="hover:text-[var(--primary)] transition-colors"
              >
                #{prNum}
              </Link>
            </div>
            <h1 className="text-lg font-semibold truncate">Review Changes</h1>
            <p className="text-sm text-[var(--foreground-secondary)] truncate mt-0.5">{pr.title}</p>
          </div>

          {/* Diff view toggle */}
          <div className="flex items-center gap-1 bg-[var(--surface-secondary)] rounded-md p-0.5 flex-shrink-0">
            {(['unified', 'split'] as DiffView[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${
                  view === v
                    ? 'bg-[var(--surface)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Review summary bar ─────────────────────────────────────────────── */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex flex-wrap gap-6 text-sm">
          <span className="text-[var(--foreground-secondary)]">
            <span className="font-semibold text-[var(--foreground)]">{pr.changedFiles}</span> files changed
          </span>
          <span className="text-[var(--accent)]">
            <span className="font-semibold">+{pr.additions}</span> insertions
          </span>
          <span className="text-[var(--error)]">
            <span className="font-semibold">-{pr.deletions}</span> deletions
          </span>
          {pendingComments.length > 0 && (
            <span className="text-[var(--warning)]">
              <span className="font-semibold">{pendingComments.length}</span> pending comment{pendingComments.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Body: sidebar + main ────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto flex gap-0 relative">

        {/* ── File tree sidebar ────────────────────────────────────────────── */}
        <aside className="w-72 flex-shrink-0 sticky top-[73px] h-[calc(100vh-73px)] overflow-y-auto border-r border-[var(--border)] bg-[var(--background-light)] hidden lg:block">
          <div className="px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-secondary)] mb-2 px-1">
              Changed files ({files.length})
            </p>
            <ul className="space-y-0.5">
              {files.map(file => {
                const parts     = file.filename.split('/');
                const basename  = parts.pop() ?? file.filename;
                const dirPath   = parts.join('/');
                const isActive  = activeFile === file.filename;
                const langColor = getLangColor(file.filename);
                const hasPending = pendingComments.some(c => c.path === file.filename);

                return (
                  <li key={file.filename}>
                    <button
                      type="button"
                      onClick={() => jumpToFile(file.filename)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors group ${
                        isActive
                          ? 'bg-[var(--surface-secondary)] text-[var(--foreground)]'
                          : 'hover:bg-[var(--surface-secondary)] text-[var(--foreground-secondary)]'
                      }`}
                      title={file.filename}
                    >
                      <StatusBadge status={file.status} />
                      <span className="truncate min-w-0 flex-1">
                        {dirPath && (
                          <span className="text-[var(--foreground-secondary)] group-hover:text-[var(--foreground-secondary)]">
                            {dirPath}/
                          </span>
                        )}
                        <span className={isActive ? 'text-[var(--foreground)]' : 'text-[var(--foreground)]'}>
                          {basename}
                        </span>
                      </span>
                      <span
                        className="flex-shrink-0 w-2 h-2 rounded-full"
                        style={{ backgroundColor: langColor }}
                      />
                      {hasPending && (
                        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--warning)]" title="Has pending comments" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* ── Main diff area ────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 px-4 py-6 space-y-6">

          {files.map(file => (
            <div
              key={file.filename}
              ref={el => { fileRefs.current[file.filename] = el; }}
              id={`file-${file.filename.replace(/\//g, '-')}`}
              className="border border-[var(--border)] rounded-lg overflow-hidden"
            >
              {/* File header */}
              <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
                <StatusBadge status={file.status} />
                <span className="text-sm font-mono font-medium text-[var(--foreground)] flex-1 truncate">
                  {file.filename}
                </span>
                {/* Language badge */}
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase"
                  style={{
                    backgroundColor: `${getLangColor(file.filename)}22`,
                    color: getLangColor(file.filename),
                  }}
                >
                  {getExt(file.filename)}
                </span>
                <span className="text-xs text-[var(--accent)]">+{file.additions}</span>
                <span className="text-xs text-[var(--error)]">-{file.deletions}</span>
              </div>

              {/* Diff content */}
              {file.patch ? (
                <FileDiff
                  file={file}
                  inlineComments={inlineComments}
                  pendingComments={pendingComments}
                  onAddPending={handleAddPending}
                  view={view}
                />
              ) : (
                <div className="px-4 py-6 text-center text-sm text-[var(--foreground-secondary)]">
                  {file.status === 'deleted'
                    ? 'File deleted — no diff to show'
                    : 'Binary file or diff unavailable'}
                </div>
              )}
            </div>
          ))}

          {/* ── Existing reviews ────────────────────────────────────────────── */}
          {reviews.length > 0 && (
            <section className="border border-[var(--border)] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
                <h2 className="text-sm font-semibold">Reviews ({reviews.length})</h2>
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {reviews.map(r => (
                  <li key={r.id} className="px-4 py-4 flex gap-3 items-start bg-[var(--background-light)]">
                    <img
                      src={r.avatarUrl}
                      alt={r.login}
                      className="w-8 h-8 rounded-full flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium text-[var(--foreground)]">{r.login}</span>
                        <DecisionBadge event={r.state} />
                        <span className="text-xs text-[var(--foreground-secondary)]">
                          {new Date(r.submittedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {r.body && (
                        <p className="text-sm text-[var(--foreground-secondary)] whitespace-pre-wrap">
                          {r.body}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Review submission panel ──────────────────────────────────────── */}
          <section className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-[var(--surface)] border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold">Submit Review</h2>
            </div>

            <div className="p-4 bg-[var(--background-light)] space-y-4">

              {/* Pending inline comments summary */}
              {pendingComments.length > 0 && (
                <div className="bg-[var(--surface)] rounded-md border border-[var(--border)] p-3">
                  <p className="text-xs font-medium text-[var(--foreground-secondary)] mb-2">
                    Pending inline comments
                  </p>
                  <ul className="space-y-1">
                    {pendingComments.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-[var(--foreground-secondary)] font-mono truncate flex-1">
                          {c.path}:{c.line}
                        </span>
                        <span className="text-[var(--foreground)] truncate max-w-[200px]">{c.body}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePending(i)}
                          className="flex-shrink-0 text-[var(--error)] hover:opacity-80 transition-opacity"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Review comment textarea */}
              <div className="border border-[var(--border)] rounded-md overflow-hidden">
                <textarea
                  className="w-full bg-[var(--background)] text-[var(--foreground)] text-sm px-3 py-2.5 resize-none outline-none placeholder:text-[var(--foreground-secondary)]"
                  rows={5}
                  placeholder="Leave a review comment..."
                  value={reviewBody}
                  onChange={e => setReviewBody(e.target.value)}
                />
              </div>

              {/* Review decision radio */}
              <fieldset>
                <legend className="text-xs font-medium text-[var(--foreground-secondary)] mb-2">
                  Review decision
                </legend>
                <div className="space-y-2">
                  {(
                    [
                      {
                        value: 'COMMENT',
                        label: 'Comment',
                        desc: 'Submit general feedback without approval.',
                      },
                      {
                        value: 'APPROVE',
                        label: 'Approve',
                        desc: 'Submit feedback and approve merging.',
                      },
                      {
                        value: 'REQUEST_CHANGES',
                        label: 'Request Changes',
                        desc: 'Block merge until changes are addressed.',
                      },
                    ] as { value: ReviewEvent; label: string; desc: string }[]
                  ).map(option => (
                    <label
                      key={option.value}
                      className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        reviewEvent === option.value
                          ? 'border-[var(--primary)] bg-[var(--surface-secondary)]'
                          : 'border-[var(--border)] hover:bg-[var(--surface-secondary)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="review-event"
                        value={option.value}
                        checked={reviewEvent === option.value}
                        onChange={() => setReviewEvent(option.value)}
                        className="mt-0.5 accent-[var(--primary)]"
                      />
                      <div>
                        <span className="text-sm font-medium">{option.label}</span>
                        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">{option.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Submit button + feedback */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitReview}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    reviewEvent === 'APPROVE'
                      ? 'bg-[var(--accent)] hover:opacity-90'
                      : reviewEvent === 'REQUEST_CHANGES'
                      ? 'bg-[var(--error)] hover:opacity-90'
                      : 'bg-[var(--primary)] hover:opacity-90'
                  } text-white disabled:opacity-50`}
                >
                  {submitting ? 'Submitting…' : 'Submit Review'}
                </button>

                {isSuccess && (
                  <span className="text-sm text-[var(--accent)]">Review submitted successfully.</span>
                )}
                {submitError && (
                  <span className="text-sm text-[var(--error)]">Failed to submit review. Please try again.</span>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
