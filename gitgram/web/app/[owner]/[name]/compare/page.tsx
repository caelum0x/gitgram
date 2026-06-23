'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed';

interface Branch {
  name: string;
  sha: string;
}

interface CompareCommit {
  sha: string;
  shortSha: string;
  message: string;
  author: {
    login: string;
    avatarUrl: string;
    date: string;
  };
}

interface ChangedFile {
  filename: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch: string;
  language: string;
}

interface CompareResult {
  totalCommits: number;
  totalFiles: number;
  additions: number;
  deletions: number;
  commits: CompareCommit[];
  files: ChangedFile[];
}

interface BranchesApiResponse {
  data: {
    branches: Branch[];
  };
}

interface CompareApiResponse {
  data: CompareResult;
}

interface DiffLine {
  lineNo: number | null;
  newLineNo: number | null;
  type: 'context' | 'add' | 'remove';
  content: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANG_COLOR: Record<string, string> = {
  ts:   '#3178c6',
  tsx:  '#3178c6',
  js:   '#f1e05a',
  jsx:  '#f1e05a',
  py:   '#3572a5',
  go:   '#00add8',
  rs:   '#dea584',
  java: '#b07219',
  rb:   '#701516',
  md:   '#083fa1',
  json: '#292929',
  yml:  '#cb171e',
  yaml: '#cb171e',
  sh:   '#89e051',
  css:  '#563d7c',
  html: '#e34c26',
};

const STATUS_STYLE: Record<FileStatus, { bg: string; text: string; label: string }> = {
  modified: { bg: 'bg-[#1c2a3a]', text: 'text-[var(--primary)]',   label: 'M' },
  added:    { bg: 'bg-[#1a2e1a]', text: 'text-[var(--accent)]',    label: 'A' },
  deleted:  { bg: 'bg-[#2e1a1a]', text: 'text-[var(--error)]',     label: 'D' },
  renamed:  { bg: 'bg-[#2a1a2e]', text: 'text-purple-400',         label: 'R' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLangColor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return LANG_COLOR[ext] ?? '#8b949e';
}

function getExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? 'txt';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

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

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchBranches(owner: string, repo: string): Promise<Branch[]> {
  const res = await api.get<BranchesApiResponse>(
    `/v1/repositories/${owner}/${repo}/branches`,
  );
  return res.data.data.branches;
}

async function fetchCompare(
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<CompareResult> {
  const encodedBase = encodeURIComponent(base);
  const encodedHead = encodeURIComponent(head);
  const res = await api.get<CompareApiResponse>(
    `/v1/repositories/${owner}/${repo}/compare/${encodedBase}...${encodedHead}`,
  );
  return res.data.data;
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

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

// ─── BranchSelector ──────────────────────────────────────────────────────────

interface BranchSelectorProps {
  label: string;
  value: string;
  branches: Branch[];
  onChange: (value: string) => void;
  placeholder?: string;
}

function BranchSelector({ label, value, branches, onChange, placeholder }: BranchSelectorProps) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState('');
  const ref                   = useRef<HTMLDivElement>(null);

  const filtered = branches.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback(
    (name: string) => {
      onChange(name);
      setOpen(false);
      setSearch('');
    },
    [onChange],
  );

  return (
    <div ref={ref} className="relative">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-secondary)] mb-1">
        {label}
      </p>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--surface-secondary)] transition-colors min-w-[180px] max-w-[260px]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--foreground-secondary)] flex-shrink-0">
          <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
        </svg>
        <span className="truncate flex-1 text-left">
          {value || <span className="text-[var(--foreground-secondary)]">{placeholder ?? 'Select branch'}</span>}
        </span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0 text-[var(--foreground-secondary)]">
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-30 overflow-hidden">
          <div className="p-2 border-b border-[var(--border)]">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--foreground-secondary)]"
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
              </svg>
              <input
                type="text"
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter branches / tags…"
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded text-[var(--foreground)] placeholder-[var(--foreground-secondary)] outline-none focus:border-[var(--primary)]"
              />
            </div>
            <p className="text-[10px] text-[var(--foreground-secondary)] mt-1.5 px-0.5">
              Tip: use <code className="font-mono">user:branch</code> for cross-fork comparison
            </p>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-center text-[var(--foreground-secondary)]">
                No branches match
              </p>
            ) : (
              filtered.map(b => (
                <button
                  key={b.name}
                  type="button"
                  onClick={() => handleSelect(b.name)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-[var(--surface-secondary)] transition-colors ${
                    b.name === value ? 'text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'
                  }`}
                >
                  {b.name === value && (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="flex-shrink-0">
                      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.72 2.72 6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                    </svg>
                  )}
                  <span className="truncate font-mono text-xs">{b.name}</span>
                  <span className="ml-auto text-[10px] text-[var(--foreground-secondary)] font-mono flex-shrink-0">
                    {b.sha.slice(0, 7)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FileDiff ─────────────────────────────────────────────────────────────────

interface FileDiffProps {
  file: ChangedFile;
}

function FileDiff({ file }: FileDiffProps) {
  const lines = parsePatch(file.patch);

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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <tbody>
          {lines.map((line, idx) => (
            <tr
              key={idx}
              className={`border-b border-[var(--border)]/20 ${lineClass(line.type)}`}
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── FileEntry ────────────────────────────────────────────────────────────────

interface FileEntryProps {
  file: ChangedFile;
  expanded: boolean;
  onToggle: () => void;
  fileRef: (el: HTMLDivElement | null) => void;
}

function FileEntry({ file, expanded, onToggle, fileRef }: FileEntryProps) {
  const parts    = file.filename.split('/');
  const basename = parts.pop() ?? file.filename;
  const dirPath  = parts.join('/');
  const langColor = getLangColor(file.filename);

  return (
    <div
      ref={fileRef}
      className="border border-[var(--border)] rounded-lg overflow-hidden"
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-secondary)] transition-colors border-b border-[var(--border)] text-left"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`flex-shrink-0 text-[var(--foreground-secondary)] transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
        <StatusBadge status={file.status} />
        <span className="text-sm font-mono flex-1 truncate text-[var(--foreground)]">
          {dirPath && (
            <span className="text-[var(--foreground-secondary)]">{dirPath}/</span>
          )}
          {basename}
        </span>
        <span
          className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase flex-shrink-0"
          style={{
            backgroundColor: `${langColor}22`,
            color: langColor,
          }}
        >
          {getExt(file.filename)}
        </span>
        <span className="text-xs text-[var(--accent)] flex-shrink-0">+{file.additions}</span>
        <span className="text-xs text-[var(--error)] flex-shrink-0">-{file.deletions}</span>
      </button>

      {/* Diff */}
      {expanded && (
        file.patch ? (
          <FileDiff file={file} />
        ) : (
          <div className="px-4 py-6 text-center text-sm text-[var(--foreground-secondary)]">
            {file.status === 'deleted'
              ? 'File deleted — no diff to show'
              : 'Binary file or diff unavailable'}
          </div>
        )
      )}
    </div>
  );
}

// ─── CommitRow ────────────────────────────────────────────────────────────────

interface CommitRowProps {
  commit: CompareCommit;
  owner: string;
  repo: string;
}

function CommitRow({ commit, owner, repo }: CommitRowProps) {
  const firstLine = commit.message.split('\n')[0];
  return (
    <li className="flex items-start gap-3 py-3 border-b border-[var(--border)] last:border-b-0 group">
      {/* Timeline dot */}
      <div className="flex flex-col items-center flex-shrink-0 pt-1">
        <div className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] ring-2 ring-[var(--background)] z-10" />
        <div className="w-px flex-1 bg-[var(--border)] mt-1 group-last:hidden" />
      </div>

      {/* Avatar */}
      <img
        src={commit.author.avatarUrl}
        alt={commit.author.login}
        className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--foreground)] font-medium truncate">
          {firstLine}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <Link
            href={`/${commit.author.login}`}
            className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--primary)] hover:underline"
          >
            {commit.author.login}
          </Link>
          <span className="text-[var(--border)]">·</span>
          <span className="text-xs text-[var(--foreground-secondary)]">
            {timeAgo(commit.author.date)}
          </span>
        </div>
      </div>

      {/* SHA */}
      <Link
        href={`/${owner}/${repo}/commit/${commit.sha}`}
        className="flex-shrink-0 px-2 py-0.5 text-xs font-mono bg-[var(--surface-secondary)] text-[var(--primary)] rounded hover:bg-[var(--surface)] transition-colors border border-[var(--border)]"
        title={commit.sha}
      >
        {commit.shortSha}
      </Link>
    </li>
  );
}

// ─── LoadingSpinner ───────────────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-[var(--foreground-secondary)]">
      <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Loading comparison…</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const params       = useParams<{ owner: string; name: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const owner = params.owner;
  const repo  = params.name;

  const [base,    setBase]    = useState(searchParams.get('base') ?? 'main');
  const [head,    setHead]    = useState(searchParams.get('head') ?? '');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Sync URL params when selectors change
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('base', base);
    if (head) url.searchParams.set('head', head);
    else url.searchParams.delete('head');
    window.history.replaceState(null, '', url.toString());
  }, [base, head]);

  // Branches query
  const branchesQuery = useQuery({
    queryKey: ['branches', owner, repo],
    queryFn:  () => fetchBranches(owner, repo),
    enabled:  Boolean(owner && repo),
    staleTime: 60_000,
  });

  const branches = branchesQuery.data ?? [];

  // Compare query — only fires when both base and head are set and differ
  const canCompare = Boolean(base && head && base !== head);

  const compareQuery = useQuery({
    queryKey: ['compare', owner, repo, base, head],
    queryFn:  () => fetchCompare(owner, repo, base, head),
    enabled:  canCompare,
    staleTime: 30_000,
  });

  const result = compareQuery.data;

  // Expand all files by default once result arrives
  useEffect(() => {
    if (result?.files) {
      setExpandedFiles(new Set(result.files.map(f => f.filename)));
    }
  }, [result]);

  const toggleFile = useCallback((filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  }, []);

  const jumpToFile = useCallback((filename: string) => {
    const el = fileRefs.current[filename];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setExpandedFiles(prev => new Set([...prev, filename]));
  }, []);

  const handleCreatePR = useCallback(() => {
    if (!base || !head) return;
    const params = new URLSearchParams({ base, head });
    router.push(`/${owner}/${repo}/pull/new?${params.toString()}`);
  }, [owner, repo, base, head, router]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[var(--background-light)] border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-screen-xl mx-auto">
          <nav className="text-sm text-[var(--foreground-secondary)] mb-1 flex items-center gap-1">
            <Link href={`/${owner}`} className="hover:text-[var(--primary)] transition-colors">
              {owner}
            </Link>
            <span>/</span>
            <Link href={`/${owner}/${repo}`} className="hover:text-[var(--primary)] transition-colors">
              {repo}
            </Link>
            <span>/</span>
            <span className="text-[var(--foreground)]">compare</span>
          </nav>
          <h1 className="text-xl font-semibold">Comparing changes</h1>
          <p className="text-sm text-[var(--foreground-secondary)] mt-0.5">
            Choose two branches or tags to see what changed or start a new pull request.
          </p>
        </div>
      </header>

      {/* ── Selector bar ────────────────────────────────────────────────────── */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-5">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex flex-wrap items-end gap-3">

            {/* Base selector */}
            <BranchSelector
              label="Base"
              value={base}
              branches={branches}
              onChange={setBase}
              placeholder="base branch"
            />

            {/* Arrow */}
            <div className="flex items-center pb-2 text-[var(--foreground-secondary)]">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l2.72-2.72H3.75a.75.75 0 0 1 0-1.5h7.19L8.22 4.03a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </div>

            {/* Head (compare) selector */}
            <BranchSelector
              label="Compare"
              value={head}
              branches={branches}
              onChange={setHead}
              placeholder="compare branch"
            />

            {/* Divider */}
            <div className="flex-1" />

            {/* Create PR button */}
            {canCompare && result && result.totalCommits > 0 && (
              <button
                type="button"
                onClick={handleCreatePR}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M7.177 3.073L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM6 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm7.25 1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
                  <path d="M3.75 1.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM2.5 3.75a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.872A2.25 2.25 0 0 1 2.5 3.75ZM6 13a.75.75 0 1 0 0-1.5A.75.75 0 0 0 6 13Z" />
                </svg>
                Create pull request
              </button>
            )}
          </div>

          {/* Hint when head not set */}
          {!head && (
            <p className="mt-3 text-sm text-[var(--foreground-secondary)]">
              Select a branch to compare with <code className="font-mono text-[var(--primary)]">{base}</code>.
            </p>
          )}
          {head && base === head && (
            <p className="mt-3 text-sm text-[var(--warning)]">
              Base and compare branches must be different.
            </p>
          )}
        </div>
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {compareQuery.isLoading && canCompare && (
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          <LoadingSpinner />
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {compareQuery.isError && (
        <div className="max-w-screen-xl mx-auto px-6 py-12 flex flex-col items-center gap-3 text-[var(--error)]">
          <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
          </svg>
          <p className="text-sm font-medium">Failed to load comparison. Please try again.</p>
        </div>
      )}

      {/* ── No changes ───────────────────────────────────────────────────────── */}
      {canCompare && !compareQuery.isLoading && !compareQuery.isError && result && result.totalCommits === 0 && (
        <div className="max-w-screen-xl mx-auto px-6 py-16 flex flex-col items-center gap-3 text-[var(--foreground-secondary)]">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="opacity-40">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.72 2.72 6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
          <p className="text-base font-semibold text-[var(--foreground)]">
            <code className="font-mono text-[var(--primary)]">{base}</code>
            {' '}and{' '}
            <code className="font-mono text-[var(--primary)]">{head}</code>
            {' '}are identical.
          </p>
          <p className="text-sm">There is nothing to compare.</p>
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────────── */}
      {result && result.totalCommits > 0 && (
        <div className="max-w-screen-xl mx-auto flex gap-0 relative">

          {/* ── Sidebar: file tree ──────────────────────────────────────────── */}
          <aside className="w-72 flex-shrink-0 sticky top-[73px] h-[calc(100vh-73px)] overflow-y-auto border-r border-[var(--border)] bg-[var(--background-light)] hidden lg:block">
            <div className="px-3 py-4 space-y-4">

              {/* Stats */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-secondary)] px-1">
                  Summary
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[var(--surface)] rounded-md px-3 py-2 text-center">
                    <p className="text-lg font-bold text-[var(--foreground)]">{result.totalCommits}</p>
                    <p className="text-[10px] text-[var(--foreground-secondary)] mt-0.5">commits</p>
                  </div>
                  <div className="bg-[var(--surface)] rounded-md px-3 py-2 text-center">
                    <p className="text-lg font-bold text-[var(--foreground)]">{result.totalFiles}</p>
                    <p className="text-[10px] text-[var(--foreground-secondary)] mt-0.5">files</p>
                  </div>
                  <div className="bg-[#1a2e1a] rounded-md px-3 py-2 text-center">
                    <p className="text-lg font-bold text-[var(--accent)]">+{result.additions}</p>
                    <p className="text-[10px] text-[var(--foreground-secondary)] mt-0.5">additions</p>
                  </div>
                  <div className="bg-[#2e1a1a] rounded-md px-3 py-2 text-center">
                    <p className="text-lg font-bold text-[var(--error)]">-{result.deletions}</p>
                    <p className="text-[10px] text-[var(--foreground-secondary)] mt-0.5">deletions</p>
                  </div>
                </div>
              </div>

              {/* File list */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-secondary)] mb-2 px-1">
                  Changed files ({result.files.length})
                </p>
                <ul className="space-y-0.5">
                  {result.files.map(file => {
                    const parts     = file.filename.split('/');
                    const basename  = parts.pop() ?? file.filename;
                    const dirPath   = parts.join('/');
                    const langColor = getLangColor(file.filename);
                    const isExpanded = expandedFiles.has(file.filename);

                    return (
                      <li key={file.filename}>
                        <button
                          type="button"
                          onClick={() => jumpToFile(file.filename)}
                          className="w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors hover:bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] group"
                          title={file.filename}
                        >
                          <StatusBadge status={file.status} />
                          <span className="truncate min-w-0 flex-1">
                            {dirPath && (
                              <span className="text-[var(--foreground-secondary)]">
                                {dirPath}/
                              </span>
                            )}
                            <span className="text-[var(--foreground)]">{basename}</span>
                          </span>
                          <span
                            className="flex-shrink-0 w-2 h-2 rounded-full"
                            style={{ backgroundColor: langColor }}
                          />
                          {!isExpanded && (
                            <span className="flex-shrink-0 text-[10px] text-[var(--foreground-secondary)] opacity-0 group-hover:opacity-100">
                              show
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </aside>

          {/* ── Main content ────────────────────────────────────────────────── */}
          <main className="flex-1 min-w-0 px-4 py-6 space-y-8">

            {/* ── Summary stats bar (mobile) ──────────────────────────────── */}
            <div className="flex flex-wrap gap-4 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 lg:hidden">
              <span className="text-[var(--foreground-secondary)]">
                <span className="font-semibold text-[var(--foreground)]">{result.totalCommits}</span> commits
              </span>
              <span className="text-[var(--foreground-secondary)]">
                <span className="font-semibold text-[var(--foreground)]">{result.totalFiles}</span> files changed
              </span>
              <span className="text-[var(--accent)]">
                <span className="font-semibold">+{result.additions}</span> additions
              </span>
              <span className="text-[var(--error)]">
                <span className="font-semibold">-{result.deletions}</span> deletions
              </span>
            </div>

            {/* ── Commits section ─────────────────────────────────────────── */}
            <section>
              <h2 className="text-base font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--foreground-secondary)]">
                  <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
                </svg>
                Commits
                <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-[var(--surface-secondary)] text-[var(--foreground-secondary)]">
                  {result.totalCommits}
                </span>
              </h2>

              <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface)]">
                <ul className="px-4 divide-y divide-[var(--border)]">
                  {result.commits.map(commit => (
                    <CommitRow key={commit.sha} commit={commit} owner={owner} repo={repo} />
                  ))}
                </ul>
              </div>
            </section>

            {/* ── Files changed section ────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--foreground-secondary)]">
                    <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
                  </svg>
                  Files changed
                  <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-[var(--surface-secondary)] text-[var(--foreground-secondary)]">
                    {result.totalFiles}
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedFiles(new Set(result.files.map(f => f.filename)))}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    Expand all
                  </button>
                  <span className="text-[var(--border)]">·</span>
                  <button
                    type="button"
                    onClick={() => setExpandedFiles(new Set())}
                    className="text-xs text-[var(--primary)] hover:underline"
                  >
                    Collapse all
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {result.files.map(file => (
                  <FileEntry
                    key={file.filename}
                    file={file}
                    expanded={expandedFiles.has(file.filename)}
                    onToggle={() => toggleFile(file.filename)}
                    fileRef={el => { fileRefs.current[file.filename] = el; }}
                  />
                ))}
              </div>
            </section>

            {/* ── Create PR CTA ────────────────────────────────────────────── */}
            <div className="flex items-center justify-between border border-[var(--border)] rounded-lg px-5 py-4 bg-[var(--surface)]">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Ready to merge these changes?
                </p>
                <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
                  Open a pull request to discuss and review before merging.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreatePR}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition-opacity flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M7.177 3.073L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM6 12a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm7.25 1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
                  <path d="M3.75 1.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM2.5 3.75a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.872A2.25 2.25 0 0 1 2.5 3.75ZM6 13a.75.75 0 1 0 0-1.5A.75.75 0 0 0 6 13Z" />
                </svg>
                Create pull request
              </button>
            </div>

          </main>
        </div>
      )}
    </div>
  );
}
