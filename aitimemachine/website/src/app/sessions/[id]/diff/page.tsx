'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  Keyboard,
  Minus,
  Plus,
  RefreshCw,
  GitCompare,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Checkpoint {
  id: string;
  name: string | null;
  createdAt: string;
  triggerType: string | null;
  description?: string | null;
}

type FileStatus = 'modified' | 'added' | 'deleted' | 'renamed';

interface DiffFileStat {
  filePath: string;
  status: FileStatus;
  added: number;
  removed: number;
  diffContent: string | null;
}

interface DiffResponse {
  success: boolean;
  fromCheckpointId: string;
  toCheckpointId: string;
  filesChanged: number;
  totalAdded: number;
  totalRemoved: number;
  files: DiffFileStat[];
}

interface CheckpointsResponse {
  success: boolean;
  checkpoints: Checkpoint[];
}

// ---------------------------------------------------------------------------
// Diff parsing helpers
// ---------------------------------------------------------------------------

type DiffLineType = 'add' | 'remove' | 'context' | 'header' | 'file-header';

interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
  collapsed: boolean;
  oldStart: number;
  newStart: number;
}

function parseUnifiedDiff(raw: string): DiffHunk[] {
  const lines = raw.split('\n');
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
        currentHunk = {
          header: line,
          lines: [],
          collapsed: false,
          oldStart: oldLine,
          newStart: newLine,
        };
        hunks.push(currentHunk);
      }
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.slice(1),
        oldLineNo: null,
        newLineNo: newLine++,
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.lines.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNo: oldLine++,
        newLineNo: null,
      });
    } else if (!line.startsWith('---') && !line.startsWith('+++') && !line.startsWith('\\')) {
      const content = line.startsWith(' ') ? line.slice(1) : line;
      currentHunk.lines.push({
        type: 'context',
        content,
        oldLineNo: oldLine++,
        newLineNo: newLine++,
      });
    }
  }

  return hunks;
}

// Collapse context lines, keeping CONTEXT_LINES around changes
const CONTEXT_LINES = 3;

function collapseHunkContext(hunk: DiffHunk): Array<DiffLine | { type: 'ellipsis'; count: number }> {
  const { lines } = hunk;
  const result: Array<DiffLine | { type: 'ellipsis'; count: number }> = [];

  // Track which lines are "near" a change
  const nearChange = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'context') {
      for (let j = Math.max(0, i - CONTEXT_LINES); j <= Math.min(lines.length - 1, i + CONTEXT_LINES); j++) {
        nearChange[j] = true;
      }
    }
  }

  let collapsedCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (nearChange[i]) {
      if (collapsedCount > 0) {
        result.push({ type: 'ellipsis', count: collapsedCount });
        collapsedCount = 0;
      }
      result.push(lines[i]);
    } else {
      collapsedCount++;
    }
  }
  if (collapsedCount > 0) {
    result.push({ type: 'ellipsis', count: collapsedCount });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FileStatusIcon({ status }: { status: FileStatus }) {
  switch (status) {
    case 'added':
      return <FilePlus className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />;
    case 'deleted':
      return <FileMinus className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
    case 'renamed':
      return <FileEdit className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
    default:
      return <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
  }
}

function FileStatusBadge({ status }: { status: FileStatus }) {
  const cls: Record<FileStatus, string> = {
    added: 'bg-green-600/20 text-green-400 border-green-600/30',
    deleted: 'bg-red-600/20 text-red-400 border-red-600/30',
    renamed: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
    modified: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  };
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase', cls[status])}>
      {status}
    </span>
  );
}

interface DiffFileViewProps {
  file: DiffFileStat;
  fileRef: (el: HTMLDivElement | null) => void;
}

function DiffFileView({ file, fileRef }: DiffFileViewProps) {
  const [collapsedHunks, setCollapsedHunks] = useState<Set<number>>(new Set());

  const hunks = file.diffContent ? parseUnifiedDiff(file.diffContent) : [];

  const toggleHunk = (idx: number) => {
    setCollapsedHunks(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const fileName = file.filePath.split('/').pop() ?? file.filePath;
  const dirPath = file.filePath.includes('/')
    ? file.filePath.slice(0, file.filePath.lastIndexOf('/') + 1)
    : '';

  return (
    <div
      ref={fileRef}
      className="border border-gray-700/60 rounded-lg overflow-hidden"
      data-file-path={file.filePath}
    >
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/80 border-b border-gray-700/60">
        <div className="flex items-center gap-2 min-w-0">
          <FileStatusIcon status={file.status} />
          <span className="text-xs text-gray-500 truncate">{dirPath}</span>
          <span className="text-sm font-medium text-gray-100 truncate">{fileName}</span>
          <FileStatusBadge status={file.status} />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4 text-xs font-mono">
          {file.added > 0 && (
            <span className="text-green-400">+{file.added}</span>
          )}
          {file.removed > 0 && (
            <span className="text-red-400">-{file.removed}</span>
          )}
        </div>
      </div>

      {/* Diff content */}
      {file.diffContent ? (
        <div className="overflow-auto">
          {hunks.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">
              Binary file or empty diff
            </div>
          ) : (
            hunks.map((hunk, hunkIdx) => {
              const isCollapsed = collapsedHunks.has(hunkIdx);
              const displayLines = isCollapsed ? [] : collapseHunkContext(hunk);

              return (
                <div key={hunkIdx}>
                  {/* Hunk header */}
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1 bg-gray-900/60 hover:bg-gray-800/60 border-b border-gray-700/40 text-left transition-colors"
                    onClick={() => toggleHunk(hunkIdx)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                    )}
                    <span className="font-mono text-xs text-cyan-500/80">{hunk.header}</span>
                  </button>

                  {/* Lines */}
                  {!isCollapsed && (
                    <div className="font-mono text-xs leading-5">
                      {displayLines.map((item, lineIdx) => {
                        if ('count' in item && item.type === 'ellipsis') {
                          return (
                            <div
                              key={lineIdx}
                              className="flex items-center gap-2 px-3 py-0.5 bg-gray-900/40 text-gray-600 border-b border-gray-800/40"
                            >
                              <span className="w-8 text-right select-none opacity-0">0</span>
                              <span className="w-8 text-right select-none opacity-0">0</span>
                              <span className="pl-2 italic text-gray-600">
                                ... {item.count} unchanged line{item.count !== 1 ? 's' : ''} ...
                              </span>
                            </div>
                          );
                        }

                        const diffLine = item as DiffLine;
                        const lineClass = {
                          add: 'bg-green-900/20 border-l-2 border-green-500/50',
                          remove: 'bg-red-900/20 border-l-2 border-red-500/50',
                          context: 'bg-transparent border-l-2 border-transparent',
                          header: 'bg-gray-900/60 border-l-2 border-transparent',
                          'file-header': 'bg-gray-900/60 border-l-2 border-transparent',
                        }[diffLine.type];

                        const textClass = {
                          add: 'text-green-300',
                          remove: 'text-red-300',
                          context: 'text-gray-300',
                          header: 'text-cyan-400',
                          'file-header': 'text-gray-400',
                        }[diffLine.type];

                        const prefix = { add: '+', remove: '-', context: ' ', header: ' ', 'file-header': ' ' }[diffLine.type];

                        return (
                          <div
                            key={lineIdx}
                            className={cn('flex items-start group hover:bg-white/3 border-b border-gray-800/20', lineClass)}
                          >
                            <span className="w-10 text-right pr-2 py-0.5 select-none text-gray-600 flex-shrink-0 border-r border-gray-800/40">
                              {diffLine.oldLineNo ?? ''}
                            </span>
                            <span className="w-10 text-right pr-2 py-0.5 select-none text-gray-600 flex-shrink-0 border-r border-gray-800/40">
                              {diffLine.newLineNo ?? ''}
                            </span>
                            <span className={cn('pl-2 py-0.5 w-5 flex-shrink-0 select-none', textClass)}>
                              {prefix}
                            </span>
                            <span className={cn('py-0.5 whitespace-pre flex-1 overflow-hidden', textClass)}>
                              {diffLine.content}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-gray-500 text-sm">
          {file.status === 'added' ? 'New file added' : file.status === 'deleted' ? 'File deleted' : 'No diff content available'}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CheckpointDiffPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.id;

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [checkpointsLoading, setCheckpointsLoading] = useState(true);
  const [checkpointsError, setCheckpointsError] = useState<string | null>(null);

  const [fromId, setFromId] = useState<string>(searchParams.get('from') ?? '');
  const [toId, setToId] = useState<string>(searchParams.get('to') ?? '');

  const [diffData, setDiffData] = useState<DiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const [showKeyboard, setShowKeyboard] = useState(false);

  const fileRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Fetch checkpoints for this session
  useEffect(() => {
    if (!sessionId) return;
    setCheckpointsLoading(true);
    setCheckpointsError(null);
    fetch(`/api/v1/sessions/${sessionId}/checkpoints?limit=50`)
      .then(async res => {
        if (!res.ok) throw new Error(`Failed to load checkpoints: ${res.status}`);
        return res.json() as Promise<CheckpointsResponse>;
      })
      .then(data => {
        const sorted = [...(data.checkpoints ?? [])].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setCheckpoints(sorted);
        // Auto-select first two if not set
        if (!fromId && sorted.length >= 2) setFromId(sorted[sorted.length - 2].id);
        if (!toId && sorted.length >= 1) setToId(sorted[sorted.length - 1].id);
      })
      .catch(err => {
        setCheckpointsError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => setCheckpointsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Fetch diff whenever from/to changes
  const fetchDiff = useCallback(() => {
    if (!sessionId || !fromId || !toId || fromId === toId) return;
    setDiffLoading(true);
    setDiffError(null);
    setActiveFileIdx(0);
    fetch(`/api/v1/sessions/${sessionId}/diff?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`)
      .then(async res => {
        if (!res.ok) throw new Error(`Failed to load diff: ${res.status}`);
        return res.json() as Promise<DiffResponse>;
      })
      .then(data => {
        setDiffData(data);
      })
      .catch(err => {
        setDiffError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => setDiffLoading(false));
  }, [sessionId, fromId, toId]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  // Keyboard navigation
  useEffect(() => {
    const files = diffData?.files ?? [];
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setActiveFileIdx(prev => {
          const next = Math.min(prev + 1, files.length - 1);
          fileRefs.current.get(next)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return next;
        });
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setActiveFileIdx(prev => {
          const next = Math.max(prev - 1, 0);
          fileRefs.current.get(next)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return next;
        });
      } else if (e.key === '?') {
        setShowKeyboard(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [diffData]);

  const scrollToFile = (idx: number) => {
    setActiveFileIdx(idx);
    fileRefs.current.get(idx)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fromCheckpoint = checkpoints.find(c => c.id === fromId);
  const toCheckpoint = checkpoints.find(c => c.id === toId);

  function formatCheckpointLabel(cp: Checkpoint): string {
    const name = cp.name ?? cp.triggerType ?? 'Checkpoint';
    const date = new Date(cp.createdAt);
    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${name} — ${time}`;
  }

  const files = diffData?.files ?? [];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-800/60">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white gap-1.5 pl-1"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="flex items-center gap-2 text-gray-400">
            <GitCompare className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-200">Checkpoint Diff</span>
          </div>

          {/* Range selector */}
          <div className="flex items-center gap-2 ml-2 flex-1 min-w-0">
            {checkpointsLoading ? (
              <Skeleton className="h-8 w-48 bg-gray-800" />
            ) : checkpointsError ? (
              <span className="text-xs text-red-400">{checkpointsError}</span>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">From</span>
                  <select
                    value={fromId}
                    onChange={e => setFromId(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 max-w-[220px]"
                  >
                    <option value="">Select checkpoint…</option>
                    {checkpoints.map(cp => (
                      <option key={cp.id} value={cp.id} disabled={cp.id === toId}>
                        {formatCheckpointLabel(cp)}
                      </option>
                    ))}
                  </select>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">To</span>
                  <select
                    value={toId}
                    onChange={e => setToId(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 max-w-[220px]"
                  >
                    <option value="">Select checkpoint…</option>
                    {checkpoints.map(cp => (
                      <option key={cp.id} value={cp.id} disabled={cp.id === fromId}>
                        {formatCheckpointLabel(cp)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {fromId && toId && fromId !== toId && (
              <Button
                variant="outline"
                size="sm"
                className="ml-1 border-gray-700 text-gray-300 hover:text-white"
                onClick={fetchDiff}
                disabled={diffLoading}
              >
                <RefreshCw className={cn('w-3.5 h-3.5', diffLoading && 'animate-spin')} />
              </Button>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-gray-300 ml-auto"
            onClick={() => setShowKeyboard(v => !v)}
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="w-4 h-4" />
          </Button>
        </div>

        {/* Keyboard shortcuts panel */}
        {showKeyboard && (
          <div className="border-t border-gray-800/60 bg-gray-900/80 px-4 py-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
            <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-200">N</kbd> Next file</span>
            <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-200">P</kbd> Prev file</span>
            <span><kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-200">?</kbd> Toggle shortcuts</span>
          </div>
        )}

        {/* Stats bar */}
        {diffData && !diffLoading && (
          <div className="border-t border-gray-800/40 bg-gray-900/60 px-4 py-2 flex items-center gap-5 text-xs flex-wrap">
            <span className="text-gray-300 font-medium">
              {diffData.filesChanged} file{diffData.filesChanged !== 1 ? 's' : ''} changed
            </span>
            {diffData.totalAdded > 0 && (
              <span className="flex items-center gap-1 text-green-400">
                <Plus className="w-3 h-3" />
                {diffData.totalAdded} insertion{diffData.totalAdded !== 1 ? 's' : ''}
              </span>
            )}
            {diffData.totalRemoved > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <Minus className="w-3 h-3" />
                {diffData.totalRemoved} deletion{diffData.totalRemoved !== 1 ? 's' : ''}
              </span>
            )}
            {fromCheckpoint && toCheckpoint && (
              <span className="text-gray-600 ml-auto hidden sm:block">
                {fromCheckpoint.name ?? fromCheckpoint.triggerType ?? 'Checkpoint'} → {toCheckpoint.name ?? toCheckpoint.triggerType ?? 'Checkpoint'}
              </span>
            )}
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Body: sidebar + main diff                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="max-w-screen-2xl mx-auto flex h-[calc(100vh-var(--header-h,110px))]" style={{ height: 'calc(100vh - 110px)' }}>
        {/* File tree sidebar */}
        <aside className="w-72 flex-shrink-0 border-r border-gray-800/60 overflow-y-auto bg-gray-900/40 hidden lg:block">
          <div className="sticky top-0 bg-gray-900/80 backdrop-blur px-3 py-2.5 border-b border-gray-800/40">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Changed Files</h2>
          </div>

          {diffLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-8 bg-gray-800/60 rounded" />
              ))}
            </div>
          ) : diffError ? (
            <div className="p-4 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {diffError}
            </div>
          ) : files.length === 0 ? (
            <div className="p-4 text-xs text-gray-500 text-center">
              {fromId && toId && fromId !== toId
                ? 'No changes between these checkpoints'
                : 'Select two checkpoints to compare'}
            </div>
          ) : (
            <div className="py-1">
              {files.map((file, idx) => {
                const fileName = file.filePath.split('/').pop() ?? file.filePath;
                const dirPath = file.filePath.includes('/')
                  ? file.filePath.slice(0, file.filePath.lastIndexOf('/') + 1)
                  : '';
                const isActive = idx === activeFileIdx;

                return (
                  <button
                    key={file.filePath}
                    className={cn(
                      'w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-gray-800/60 transition-colors border-l-2',
                      isActive
                        ? 'border-purple-500 bg-gray-800/60'
                        : 'border-transparent'
                    )}
                    onClick={() => scrollToFile(idx)}
                  >
                    <FileStatusIcon status={file.status} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-200 truncate font-medium">{fileName}</div>
                      {dirPath && (
                        <div className="text-[10px] text-gray-500 truncate">{dirPath}</div>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-[10px] font-mono flex gap-1.5 mt-0.5">
                      {file.added > 0 && <span className="text-green-400">+{file.added}</span>}
                      {file.removed > 0 && <span className="text-red-400">-{file.removed}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Main diff area */}
        <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {diffLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="border border-gray-700/60 rounded-lg overflow-hidden">
                  <div className="bg-gray-800/80 px-4 py-2.5">
                    <Skeleton className="h-4 w-64 bg-gray-700" />
                  </div>
                  <div className="p-4 space-y-1.5">
                    {[...Array(8)].map((_, j) => (
                      <Skeleton key={j} className="h-4 bg-gray-800/60 rounded" style={{ width: `${60 + Math.random() * 40}%` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : diffError ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                <p className="text-red-400 font-medium">Failed to load diff</p>
                <p className="text-gray-500 text-sm max-w-sm">{diffError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-700 text-gray-300 hover:text-white"
                  onClick={fetchDiff}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Retry
                </Button>
              </div>
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center space-y-3">
                <GitCompare className="w-10 h-10 text-gray-600 mx-auto" />
                <p className="text-gray-400 font-medium">
                  {fromId && toId && fromId !== toId
                    ? 'No changes between selected checkpoints'
                    : 'Select two checkpoints to compare'}
                </p>
                <p className="text-gray-600 text-sm max-w-sm">
                  Use the range selector above to choose the From and To checkpoints.
                </p>
              </div>
            </div>
          ) : (
            files.map((file, idx) => (
              <DiffFileView
                key={file.filePath}
                file={file}
                fileRef={el => {
                  if (el) fileRefs.current.set(idx, el);
                  else fileRefs.current.delete(idx);
                }}
              />
            ))
          )}

          {/* Navigation footer */}
          {files.length > 1 && !diffLoading && (
            <div className="flex items-center justify-between py-4 border-t border-gray-800/40">
              <Button
                variant="outline"
                size="sm"
                className="border-gray-700 text-gray-400 hover:text-white gap-1.5"
                disabled={activeFileIdx === 0}
                onClick={() => scrollToFile(activeFileIdx - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
                Prev file
                <kbd className="ml-1 text-[10px] bg-gray-700/60 px-1 py-0.5 rounded">P</kbd>
              </Button>

              <span className="text-xs text-gray-500">
                {activeFileIdx + 1} / {files.length} files
              </span>

              <Button
                variant="outline"
                size="sm"
                className="border-gray-700 text-gray-400 hover:text-white gap-1.5"
                disabled={activeFileIdx === files.length - 1}
                onClick={() => scrollToFile(activeFileIdx + 1)}
              >
                Next file
                <kbd className="ml-1 text-[10px] bg-gray-700/60 px-1 py-0.5 rounded">N</kbd>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
