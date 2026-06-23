'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  GitCommit,
  Clock,
  AlertCircle,
  Layers,
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
  description: string | null;
  createdAt: string;
  triggerType: string | null;
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

type Speed = 0.5 | 1 | 2 | 4;

// ---------------------------------------------------------------------------
// Diff parsing helpers (shared with diff/page.tsx)
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

const CONTEXT_LINES = 3;

function collapseHunkContext(hunk: DiffHunk): Array<DiffLine | { type: 'ellipsis'; count: number }> {
  const { lines } = hunk;
  const result: Array<DiffLine | { type: 'ellipsis'; count: number }> = [];
  const nearChange = new Array(lines.length).fill(false);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'context') {
      for (
        let j = Math.max(0, i - CONTEXT_LINES);
        j <= Math.min(lines.length - 1, i + CONTEXT_LINES);
        j++
      ) {
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

interface DiffFileViewProps {
  file: DiffFileStat;
  firstChangeRef?: (el: HTMLDivElement | null) => void;
}

function DiffFileView({ file, firstChangeRef }: DiffFileViewProps) {
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

  const statusColors: Record<FileStatus, string> = {
    added: 'text-green-400',
    deleted: 'text-red-400',
    renamed: 'text-yellow-400',
    modified: 'text-blue-400',
  };

  return (
    <div
      className="border border-gray-700/60 rounded-lg overflow-hidden"
      data-file-path={file.filePath}
    >
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/80 border-b border-gray-700/60">
        <div className="flex items-center gap-2 min-w-0">
          <FileStatusIcon status={file.status} />
          <span className="text-xs text-gray-500 truncate">{dirPath}</span>
          <span className={cn('text-sm font-medium truncate', statusColors[file.status])}>
            {fileName}
          </span>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase',
              {
                added: 'bg-green-600/20 text-green-400 border-green-600/30',
                deleted: 'bg-red-600/20 text-red-400 border-red-600/30',
                renamed: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
                modified: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
              }[file.status]
            )}
          >
            {file.status}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4 text-xs font-mono">
          {file.added > 0 && <span className="text-green-400">+{file.added}</span>}
          {file.removed > 0 && <span className="text-red-400">-{file.removed}</span>}
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
              const isFirstHunk = hunkIdx === 0;

              return (
                <div key={hunkIdx} ref={isFirstHunk ? firstChangeRef : undefined}>
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

                        const prefix = {
                          add: '+',
                          remove: '-',
                          context: ' ',
                          header: ' ',
                          'file-header': ' ',
                        }[diffLine.type];

                        return (
                          <div
                            key={lineIdx}
                            className={cn(
                              'flex items-start group hover:bg-white/3 border-b border-gray-800/20',
                              lineClass
                            )}
                          >
                            <span className="w-10 text-right pr-2 py-0.5 select-none text-gray-600 flex-shrink-0 border-r border-gray-800/40">
                              {diffLine.oldLineNo ?? ''}
                            </span>
                            <span className="w-10 text-right pr-2 py-0.5 select-none text-gray-600 flex-shrink-0 border-r border-gray-800/40">
                              {diffLine.newLineNo ?? ''}
                            </span>
                            <span
                              className={cn(
                                'pl-2 py-0.5 w-5 flex-shrink-0 select-none',
                                textClass
                              )}
                            >
                              {prefix}
                            </span>
                            <span
                              className={cn(
                                'py-0.5 whitespace-pre flex-1 overflow-hidden',
                                textClass
                              )}
                            >
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
          {file.status === 'added'
            ? 'New file added'
            : file.status === 'deleted'
            ? 'File deleted'
            : 'No diff content available'}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline dot component
// ---------------------------------------------------------------------------

interface TimelineDotProps {
  index: number;
  total: number;
  isCurrent: boolean;
  isVisited: boolean;
  checkpoint: Checkpoint;
  onClick: () => void;
}

function TimelineDot({ index, total, isCurrent, isVisited, checkpoint, onClick }: TimelineDotProps) {
  const label = checkpoint.name ?? checkpoint.triggerType ?? `Step ${index + 1}`;

  return (
    <div className="relative flex flex-col items-center group" style={{ flex: '1 0 0' }}>
      {/* Connector line left */}
      {index > 0 && (
        <div
          className={cn(
            'absolute top-[9px] right-1/2 h-0.5 w-full',
            isVisited || isCurrent ? 'bg-purple-500/60' : 'bg-gray-700'
          )}
        />
      )}
      {/* Connector line right */}
      {index < total - 1 && (
        <div
          className={cn(
            'absolute top-[9px] left-1/2 h-0.5 w-full',
            isVisited ? 'bg-purple-500/60' : 'bg-gray-700'
          )}
        />
      )}

      {/* Dot */}
      <button
        onClick={onClick}
        className={cn(
          'relative z-10 rounded-full border-2 transition-all duration-200 flex-shrink-0',
          isCurrent
            ? 'w-5 h-5 bg-purple-500 border-purple-400 shadow-[0_0_0_3px_rgba(168,85,247,0.25)]'
            : isVisited
            ? 'w-3 h-3 bg-purple-700 border-purple-600 hover:bg-purple-500 hover:border-purple-400'
            : 'w-3 h-3 bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-gray-500'
        )}
        title={label}
      />

      {/* Tooltip on hover */}
      <div className="absolute top-6 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 whitespace-nowrap shadow-xl">
          {label}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SessionReplayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  // Checkpoint list
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [checkpointsLoading, setCheckpointsLoading] = useState(true);
  const [checkpointsError, setCheckpointsError] = useState<string | null>(null);

  // Playback state
  const [currentStep, setCurrentStep] = useState(0); // index into checkpoints (step 1 = checkpoints[1], diff vs [0])
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);

  // Diff state
  const [diffData, setDiffData] = useState<DiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Commit state
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(false);

  // Refs
  const firstChangeRef = useRef<HTMLDivElement | null>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);

  // Session name: derived from first checkpoint or session id
  const sessionName =
    checkpoints[0]?.name ??
    checkpoints[0]?.triggerType ??
    `Session ${sessionId.slice(0, 8)}`;

  // Fetch checkpoints
  useEffect(() => {
    if (!sessionId) return;
    setCheckpointsLoading(true);
    setCheckpointsError(null);

    fetch(`/api/v1/sessions/${sessionId}/checkpoints?limit=100`)
      .then(async res => {
        if (!res.ok) throw new Error(`Failed to load checkpoints: ${res.status}`);
        return res.json() as Promise<CheckpointsResponse>;
      })
      .then(data => {
        const sorted = [...(data.checkpoints ?? [])].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setCheckpoints(sorted);
        // Start at second checkpoint so we always have a "from" → "to" pair
        setCurrentStep(sorted.length > 1 ? 1 : 0);
      })
      .catch(err => {
        setCheckpointsError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => setCheckpointsLoading(false));
  }, [sessionId]);

  // Fetch diff whenever currentStep changes
  const fetchDiff = useCallback(
    (step: number) => {
      if (!sessionId || checkpoints.length < 2 || step < 1) {
        setDiffData(null);
        return;
      }
      const fromId = checkpoints[step - 1].id;
      const toId = checkpoints[step].id;

      setDiffLoading(true);
      setDiffError(null);

      fetch(
        `/api/v1/sessions/${sessionId}/diff?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`
      )
        .then(async res => {
          if (!res.ok) throw new Error(`Failed to load diff: ${res.status}`);
          return res.json() as Promise<DiffResponse>;
        })
        .then(data => {
          setDiffData(data);
          setCommitSuccess(false);
          // Scroll to first change after render
          requestAnimationFrame(() => {
            firstChangeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        })
        .catch(err => {
          setDiffError(err instanceof Error ? err.message : 'Unknown error');
        })
        .finally(() => setDiffLoading(false));
    },
    [sessionId, checkpoints]
  );

  useEffect(() => {
    if (checkpoints.length > 0) {
      fetchDiff(currentStep);
    }
  }, [currentStep, fetchDiff, checkpoints.length]);

  // Auto-play interval
  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      return;
    }

    const intervalMs = (1 / speed) * 3000; // base 3s per step at 1x

    playIntervalRef.current = setInterval(() => {
      setCurrentStep(prev => {
        const next = prev + 1;
        if (next >= checkpoints.length) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, speed, checkpoints.length]);

  // Stop playing when we reach last step
  useEffect(() => {
    if (currentStep >= checkpoints.length - 1 && isPlaying) {
      setIsPlaying(false);
    }
  }, [currentStep, checkpoints.length, isPlaying]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          setCurrentStep(prev => Math.min(prev + 1, checkpoints.length - 1));
          break;
        case 'ArrowLeft':
        case 'h':
          e.preventDefault();
          setCurrentStep(prev => Math.max(prev - 1, 1));
          break;
        case ' ':
          e.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'Home':
          e.preventDefault();
          setCurrentStep(checkpoints.length > 1 ? 1 : 0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentStep(checkpoints.length - 1);
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [checkpoints.length]);

  // Navigation helpers
  const goToFirst = () => setCurrentStep(checkpoints.length > 1 ? 1 : 0);
  const goToPrev = () => setCurrentStep(prev => Math.max(prev - 1, checkpoints.length > 1 ? 1 : 0));
  const goToNext = () => setCurrentStep(prev => Math.min(prev + 1, checkpoints.length - 1));
  const goToLast = () => setCurrentStep(checkpoints.length - 1);
  const togglePlay = () => setIsPlaying(prev => !prev);

  const currentCheckpoint = checkpoints[currentStep] ?? null;
  const prevCheckpoint = currentStep > 0 ? checkpoints[currentStep - 1] : null;
  const isFirst = currentStep <= (checkpoints.length > 1 ? 1 : 0);
  const isLast = currentStep >= checkpoints.length - 1;

  const handleCommit = async () => {
    if (!currentCheckpoint) return;
    setCommitLoading(true);
    try {
      const res = await fetch(
        `/api/v1/sessions/${sessionId}/checkpoints/${currentCheckpoint.id}/commit`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error(`Commit failed: ${res.status}`);
      setCommitSuccess(true);
    } catch {
      // Silently fail — show nothing extra, button just re-enables
    } finally {
      setCommitLoading(false);
    }
  };

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const speedOptions: Speed[] = [0.5, 1, 2, 4];
  const files = diffData?.files ?? [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* ------------------------------------------------------------------ */}
      {/* 1. Header                                                           */}
      {/* ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-30 bg-gray-900/95 backdrop-blur border-b border-gray-800/60">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white gap-1.5 pl-1 flex-shrink-0"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="h-4 w-px bg-gray-700 flex-shrink-0" />

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Layers className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-100 truncate">{sessionName}</span>
            <Badge className="bg-purple-600/20 text-purple-300 border-purple-600/40 text-xs flex-shrink-0">
              Replay
            </Badge>
          </div>

          {!checkpointsLoading && checkpoints.length > 0 && (
            <span className="text-xs text-gray-500 flex-shrink-0 hidden sm:block">
              {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Loading / Error state                                               */}
      {/* ------------------------------------------------------------------ */}
      {checkpointsLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-4 w-full max-w-2xl px-4">
            <Skeleton className="h-8 bg-gray-800 rounded" />
            <Skeleton className="h-4 bg-gray-800 rounded w-3/4" />
            <Skeleton className="h-64 bg-gray-800 rounded" />
          </div>
        </div>
      ) : checkpointsError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
            <p className="text-red-400 font-medium">Failed to load session</p>
            <p className="text-gray-500 text-sm">{checkpointsError}</p>
          </div>
        </div>
      ) : checkpoints.length < 2 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Layers className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-gray-400 font-medium">Not enough checkpoints to replay</p>
            <p className="text-gray-600 text-sm">
              At least 2 checkpoints are required to show diffs.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ---------------------------------------------------------------- */}
          {/* 2. Timeline bar                                                  */}
          {/* ---------------------------------------------------------------- */}
          <div className="bg-gray-900/80 border-b border-gray-800/60 px-4 py-4">
            <div className="max-w-screen-2xl mx-auto">
              {/* Dots track */}
              <div className="relative flex items-center px-2">
                {checkpoints.map((cp, idx) => (
                  <TimelineDot
                    key={cp.id}
                    index={idx}
                    total={checkpoints.length}
                    isCurrent={idx === currentStep}
                    isVisited={idx < currentStep}
                    checkpoint={cp}
                    onClick={() => {
                      if (idx >= 1) setCurrentStep(idx);
                    }}
                  />
                ))}
              </div>

              {/* Step label below track */}
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {checkpoints[0]?.name ??
                    checkpoints[0]?.triggerType ??
                    new Date(checkpoints[0]?.createdAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                </span>
                <span className="text-purple-400 font-medium">
                  Step {currentStep} of {checkpoints.length - 1}
                </span>
                <span>
                  {checkpoints[checkpoints.length - 1]?.name ??
                    checkpoints[checkpoints.length - 1]?.triggerType ??
                    new Date(
                      checkpoints[checkpoints.length - 1]?.createdAt
                    ).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* 3. Playback controls                                             */}
          {/* ---------------------------------------------------------------- */}
          <div className="bg-gray-900/60 border-b border-gray-800/40 px-4 py-2.5">
            <div className="max-w-screen-2xl mx-auto flex items-center gap-3 flex-wrap">
              {/* Transport buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                  onClick={goToFirst}
                  disabled={isFirst}
                  title="First checkpoint (Home)"
                >
                  <SkipBack className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                  onClick={goToPrev}
                  disabled={isFirst}
                  title="Previous checkpoint (← / H)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 w-8 p-0 transition-colors',
                    isPlaying
                      ? 'text-purple-400 hover:text-purple-300'
                      : 'text-gray-200 hover:text-white'
                  )}
                  onClick={togglePlay}
                  disabled={isLast}
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                  onClick={goToNext}
                  disabled={isLast}
                  title="Next checkpoint (→ / L)"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                  onClick={goToLast}
                  disabled={isLast}
                  title="Last checkpoint (End)"
                >
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>

              {/* Divider */}
              <div className="h-5 w-px bg-gray-700" />

              {/* Speed selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Speed</span>
                <div className="flex items-center gap-0.5">
                  {speedOptions.map(s => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                        speed === s
                          ? 'bg-purple-600/30 text-purple-300 border border-purple-600/50'
                          : 'text-gray-500 hover:text-gray-300 border border-transparent'
                      )}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-5 w-px bg-gray-700" />

              {/* Progress */}
              <span className="text-xs text-gray-400 font-medium tabular-nums">
                Step{' '}
                <span className="text-purple-400">{currentStep}</span>
                {' '}of{' '}
                <span className="text-gray-300">{checkpoints.length - 1}</span>
              </span>

              {/* Diff stats (right aligned) */}
              {diffData && !diffLoading && (
                <div className="ml-auto flex items-center gap-3 text-xs">
                  <span className="text-gray-500">
                    {diffData.filesChanged} file{diffData.filesChanged !== 1 ? 's' : ''} changed
                  </span>
                  {diffData.totalAdded > 0 && (
                    <span className="text-green-400">+{diffData.totalAdded}</span>
                  )}
                  {diffData.totalRemoved > 0 && (
                    <span className="text-red-400">-{diffData.totalRemoved}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Body: diff panel + sidebar                                       */}
          {/* ---------------------------------------------------------------- */}
          <div className="flex-1 flex overflow-hidden">
            {/* 4. Main diff panel */}
            <div
              ref={mainScrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
            >
              {diffLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="border border-gray-700/60 rounded-lg overflow-hidden"
                    >
                      <div className="bg-gray-800/80 px-4 py-2.5">
                        <Skeleton className="h-4 w-64 bg-gray-700" />
                      </div>
                      <div className="p-4 space-y-1.5">
                        {[...Array(8)].map((_, j) => (
                          <Skeleton
                            key={j}
                            className="h-4 bg-gray-800/60 rounded"
                            style={{ width: `${60 + Math.random() * 40}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : diffError ? (
                <div className="flex items-center justify-center h-48">
                  <div className="text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                    <p className="text-red-400 font-medium text-sm">Failed to load diff</p>
                    <p className="text-gray-500 text-xs max-w-xs">{diffError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-gray-700 text-gray-300 hover:text-white text-xs"
                      onClick={() => fetchDiff(currentStep)}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              ) : files.length === 0 ? (
                <div className="flex items-center justify-center h-48">
                  <div className="text-center space-y-2">
                    <GitCommit className="w-8 h-8 text-gray-600 mx-auto" />
                    <p className="text-gray-500 text-sm">No changes in this step</p>
                  </div>
                </div>
              ) : (
                files.map((file, idx) => (
                  <DiffFileView
                    key={file.filePath}
                    file={file}
                    firstChangeRef={
                      idx === 0
                        ? el => {
                            firstChangeRef.current = el;
                          }
                        : undefined
                    }
                  />
                ))
              )}
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* 5. Session info sidebar                                          */}
            {/* ---------------------------------------------------------------- */}
            <aside className="w-72 flex-shrink-0 border-l border-gray-800/60 bg-gray-900/40 overflow-y-auto hidden lg:flex lg:flex-col">
              {/* Current checkpoint info */}
              <div className="p-4 border-b border-gray-800/40">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Current Checkpoint
                </h2>

                {currentCheckpoint ? (
                  <div className="space-y-2.5">
                    <div>
                      <p className="text-sm font-semibold text-gray-100 leading-tight">
                        {currentCheckpoint.name ??
                          currentCheckpoint.triggerType ??
                          `Checkpoint ${currentStep + 1}`}
                      </p>
                      {currentCheckpoint.description && (
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          {currentCheckpoint.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{formatTimestamp(currentCheckpoint.createdAt)}</span>
                    </div>

                    {currentCheckpoint.triggerType && (
                      <div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-800 border-gray-700 text-gray-400 uppercase font-medium">
                          {currentCheckpoint.triggerType}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">No checkpoint selected</p>
                )}
              </div>

              {/* Previous checkpoint */}
              {prevCheckpoint && (
                <div className="px-4 py-3 border-b border-gray-800/40">
                  <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1">
                    Previous
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {prevCheckpoint.name ?? prevCheckpoint.triggerType ?? 'Checkpoint'}
                  </p>
                </div>
              )}

              {/* Files changed */}
              <div className="p-4 border-b border-gray-800/40 flex-1">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Files Changed
                </h2>

                {diffLoading ? (
                  <div className="space-y-1.5">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-6 bg-gray-800/60 rounded" />
                    ))}
                  </div>
                ) : files.length === 0 ? (
                  <p className="text-xs text-gray-600">No file changes</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 mb-2">
                      {files.length} file{files.length !== 1 ? 's' : ''} changed
                    </p>
                    {files.map(file => {
                      const fileName = file.filePath.split('/').pop() ?? file.filePath;
                      return (
                        <div
                          key={file.filePath}
                          className="flex items-center gap-2 py-1 text-xs group"
                          title={file.filePath}
                        >
                          <FileStatusIcon status={file.status} />
                          <span className="text-gray-300 truncate flex-1 min-w-0">
                            {fileName}
                          </span>
                          <div className="flex-shrink-0 font-mono flex gap-1 text-[10px]">
                            {file.added > 0 && (
                              <span className="text-green-400">+{file.added}</span>
                            )}
                            {file.removed > 0 && (
                              <span className="text-red-400">-{file.removed}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Commit button */}
              <div className="p-4">
                <Button
                  className={cn(
                    'w-full gap-2 text-sm transition-colors',
                    commitSuccess
                      ? 'bg-green-700/30 text-green-400 border border-green-700/40 hover:bg-green-700/40'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                  )}
                  onClick={handleCommit}
                  disabled={commitLoading || !currentCheckpoint || commitSuccess}
                >
                  <GitCommit className="w-4 h-4" />
                  {commitLoading
                    ? 'Committing…'
                    : commitSuccess
                    ? 'Committed!'
                    : 'Commit this checkpoint'}
                </Button>

                <p className="text-[10px] text-gray-600 mt-2 text-center leading-tight">
                  Creates a git commit from the current checkpoint snapshot
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
