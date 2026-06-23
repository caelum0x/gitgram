'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  Clock,
  FileCode,
  FileMinus,
  FilePlus,
  FileText,
  Folder,
  Hand,
  Keyboard,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggerType = 'manual' | 'auto' | 'agent' | 'restore';

interface Session {
  id: string;
  projectName: string;
  projectPath: string;
  createdAt: string;
  filesChanged: number;
}

interface SessionsResponse {
  sessions: Session[];
  total: number;
}

interface CheckpointFile {
  path: string;
  status?: 'added' | 'modified' | 'deleted' | 'renamed';
}

interface Checkpoint {
  id: string;
  name: string | null;
  description?: string | null;
  createdAt: string;
  triggerType: string | null;
  filesChanged?: number;
  added?: number;
  removed?: number;
  files?: CheckpointFile[];
}

interface CheckpointsResponse {
  success: boolean;
  checkpoints: Checkpoint[];
}

// A checkpoint enriched with its owning session for the unified timeline.
interface TimelineNode extends Checkpoint {
  sessionId: string;
  sessionName: string;
  trigger: TriggerType;
  fileCount: number;
  timeMs: number;
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const API_LIMIT = 50;
const AUTO_SCRUB_INTERVAL_MS = 1400;

const TRIGGER_META: Record<
  TriggerType,
  { label: string; color: string; ring: string; icon: typeof Hand }
> = {
  manual: { label: 'Manual', color: '#60a5fa', ring: 'ring-blue-400/40', icon: Hand },
  auto: { label: 'Auto', color: '#34d399', ring: 'ring-emerald-400/40', icon: Zap },
  agent: { label: 'Agent', color: '#c084fc', ring: 'ring-purple-400/40', icon: Bot },
  restore: { label: 'Restore', color: '#fbbf24', ring: 'ring-amber-400/40', icon: RotateCcw },
};

function normalizeTrigger(raw: string | null | undefined): TriggerType {
  const value = (raw ?? '').toLowerCase();
  if (value.includes('agent')) return 'agent';
  if (value.includes('restore')) return 'restore';
  if (value.includes('auto')) return 'auto';
  return 'manual';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown time';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Map a file count to a dot radius (perceptually compressed).
function dotRadius(fileCount: number): number {
  const base = 5;
  const scaled = Math.sqrt(Math.max(0, fileCount)) * 2.4;
  return Math.min(base + scaled, 18);
}

// Build a hierarchical file tree from a flat list of paths.
interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
  status?: CheckpointFile['status'];
}

function buildFileTree(files: CheckpointFile[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    children: new Map(),
    isFile: false,
  };
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let cursor = root;
    parts.forEach((part, idx) => {
      const isLast = idx === parts.length - 1;
      const existing = cursor.children.get(part);
      if (existing) {
        cursor = existing;
      } else {
        const node: TreeNode = {
          name: part,
          path: parts.slice(0, idx + 1).join('/'),
          children: new Map(),
          isFile: isLast,
          status: isLast ? file.status : undefined,
        };
        cursor.children.set(part, node);
        cursor = node;
      }
    });
  }
  return root;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TriggerLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {(Object.keys(TRIGGER_META) as TriggerType[]).map((key) => {
        const meta = TRIGGER_META[key];
        return (
          <div key={key} className="flex items-center gap-2 text-xs text-zinc-400">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            {meta.label}
          </div>
        );
      })}
    </div>
  );
}

function FileTreeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const entries = Array.from(node.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <ul className={cn(depth > 0 && 'ml-3 border-l border-zinc-800 pl-2')}>
      {entries.map((child) => (
        <li key={child.path} className="py-0.5">
          <div className="flex items-center gap-1.5 text-sm">
            {child.isFile ? (
              <FileCode className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-blue-400/70 flex-shrink-0" />
            )}
            <span
              className={cn(
                'truncate',
                child.isFile ? 'text-zinc-300' : 'text-zinc-200 font-medium',
                child.status === 'added' && 'text-emerald-400',
                child.status === 'deleted' && 'text-red-400 line-through',
                child.status === 'modified' && 'text-amber-300',
              )}
            >
              {child.name}
            </span>
          </div>
          {!child.isFile && child.children.size > 0 && (
            <FileTreeView node={child} depth={depth + 1} />
          )}
        </li>
      ))}
    </ul>
  );
}

function ChangeStat({ node, prev }: { node: TimelineNode; prev: TimelineNode | null }) {
  const added = node.added ?? 0;
  const removed = node.removed ?? 0;
  const changedFiles = node.fileCount;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          icon={<FileText className="w-4 h-4 text-blue-400" />}
          value={changedFiles}
          label="files"
        />
        <StatCard
          icon={<FilePlus className="w-4 h-4 text-emerald-400" />}
          value={`+${added}`}
          label="added"
          valueClass="text-emerald-400"
        />
        <StatCard
          icon={<FileMinus className="w-4 h-4 text-red-400" />}
          value={`-${removed}`}
          label="removed"
          valueClass="text-red-400"
        />
      </div>

      {prev ? (
        <p className="text-xs text-zinc-500">
          Changes since{' '}
          <span className="text-zinc-300">
            {prev.name || formatDateTime(prev.createdAt)}
          </span>
          .
        </p>
      ) : (
        <p className="text-xs text-zinc-500">First checkpoint in this view.</p>
      )}

      {node.files && node.files.length > 0 ? (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {node.files.slice(0, 40).map((file) => (
            <div key={file.path} className="flex items-center gap-2 text-xs">
              {file.status === 'added' ? (
                <FilePlus className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              ) : file.status === 'deleted' ? (
                <FileMinus className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              ) : (
                <FileCode className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              )}
              <span className="truncate text-zinc-400 font-mono">{file.path}</span>
            </div>
          ))}
          {node.files.length > 40 && (
            <p className="text-xs text-zinc-600 pt-1">
              + {node.files.length - 40} more files
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-600">
          No per-file detail recorded for this checkpoint.
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  valueClass,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <div className={cn('text-lg font-semibold text-white', valueClass)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline (SVG scrubber)
// ---------------------------------------------------------------------------

interface TimelineProps {
  nodes: TimelineNode[];
  activeIndex: number;
  onScrub: (index: number) => void;
}

function Timeline({ nodes, activeIndex, onScrub }: TimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const width = 1000;
  const height = 140;
  const padX = 40;
  const axisY = height / 2;

  // x position for each node, evenly distributed along the axis.
  const xFor = useCallback(
    (index: number) => {
      if (nodes.length <= 1) return padX;
      const usable = width - padX * 2;
      return padX + (usable * index) / (nodes.length - 1);
    },
    [nodes.length],
  );

  const indexFromClientX = useCallback(
    (clientX: number): number => {
      const svg = svgRef.current;
      if (!svg || nodes.length === 0) return activeIndex;
      const rect = svg.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      const svgX = ratio * width;
      const usable = width - padX * 2;
      const raw = ((svgX - padX) / usable) * (nodes.length - 1);
      return Math.max(0, Math.min(nodes.length - 1, Math.round(raw)));
    },
    [nodes.length, activeIndex],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => onScrub(indexFromClientX(e.clientX));
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, indexFromClientX, onScrub]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-zinc-500">
        No checkpoints to display.
      </div>
    );
  }

  const playheadX = xFor(activeIndex);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full select-none cursor-pointer"
      role="slider"
      aria-label="Checkpoint timeline scrubber"
      aria-valuemin={0}
      aria-valuemax={nodes.length - 1}
      aria-valuenow={activeIndex}
      onMouseDown={(e) => {
        setDragging(true);
        onScrub(indexFromClientX(e.clientX));
      }}
    >
      {/* axis line */}
      <line
        x1={padX}
        y1={axisY}
        x2={width - padX}
        y2={axisY}
        stroke="#3f3f46"
        strokeWidth={2}
      />

      {/* progress line up to playhead */}
      <line
        x1={padX}
        y1={axisY}
        x2={playheadX}
        y2={axisY}
        stroke="#6366f1"
        strokeWidth={2}
      />

      {/* checkpoint dots */}
      {nodes.map((node, i) => {
        const x = xFor(i);
        const r = dotRadius(node.fileCount);
        const meta = TRIGGER_META[node.trigger];
        const isActive = i === activeIndex;
        return (
          <g key={node.id}>
            <circle
              cx={x}
              cy={axisY}
              r={r}
              fill={meta.color}
              fillOpacity={isActive ? 0.95 : 0.55}
              stroke={isActive ? '#ffffff' : meta.color}
              strokeWidth={isActive ? 2 : 1}
              className="transition-all"
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragging(true);
                onScrub(i);
              }}
            />
            {isActive && (
              <text
                x={x}
                y={axisY - r - 8}
                textAnchor="middle"
                className="fill-zinc-300 text-[11px]"
                fontSize={11}
              >
                {node.fileCount} files
              </text>
            )}
          </g>
        );
      })}

      {/* playhead */}
      <g>
        <line
          x1={playheadX}
          y1={axisY - 46}
          x2={playheadX}
          y2={axisY + 46}
          stroke="#ffffff"
          strokeWidth={2}
        />
        <polygon
          points={`${playheadX - 7},${axisY - 46} ${playheadX + 7},${axisY - 46} ${playheadX},${axisY - 36}`}
          fill="#ffffff"
        />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TimeTravelPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');
  const [checkpointsBySession, setCheckpointsBySession] = useState<
    Record<string, Checkpoint[]>
  >({});

  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);

  // ---- Data loading ------------------------------------------------------

  const loadCheckpoints = useCallback(async (sessionList: Session[]) => {
    setLoadingCheckpoints(true);
    try {
      const results = await Promise.all(
        sessionList.map(async (session) => {
          const res = await fetch(
            `/api/v1/sessions/${session.id}/checkpoints?limit=${API_LIMIT}`,
          );
          if (!res.ok) {
            return { id: session.id, checkpoints: [] as Checkpoint[] };
          }
          const data = (await res.json()) as CheckpointsResponse;
          return { id: session.id, checkpoints: data.checkpoints ?? [] };
        }),
      );
      const map: Record<string, Checkpoint[]> = {};
      for (const result of results) {
        map[result.id] = result.checkpoints;
      }
      setCheckpointsBySession(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checkpoints');
    } finally {
      setLoadingCheckpoints(false);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/sessions?limit=${API_LIMIT}`);
      if (!res.ok) throw new Error(`Failed to load sessions: ${res.status}`);
      const data = (await res.json()) as SessionsResponse;
      const list = data.sessions ?? [];
      setSessions(list);
      if (list.length > 0) {
        await loadCheckpoints(list);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoadingSessions(false);
    }
  }, [loadCheckpoints]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // ---- Build the unified, sorted timeline --------------------------------

  const timeline = useMemo<TimelineNode[]>(() => {
    const sessionName = (id: string) =>
      sessions.find((s) => s.id === id)?.projectName ?? 'Untitled session';

    const relevant =
      selectedSessionId === 'all'
        ? sessions
        : sessions.filter((s) => s.id === selectedSessionId);

    const nodes: TimelineNode[] = [];
    for (const session of relevant) {
      const checkpoints = checkpointsBySession[session.id] ?? [];
      for (const cp of checkpoints) {
        const fileCount = cp.filesChanged ?? cp.files?.length ?? 0;
        nodes.push({
          ...cp,
          sessionId: session.id,
          sessionName: sessionName(session.id),
          trigger: normalizeTrigger(cp.triggerType),
          fileCount,
          timeMs: new Date(cp.createdAt).getTime(),
        });
      }
    }
    nodes.sort((a, b) => a.timeMs - b.timeMs);
    return nodes;
  }, [sessions, checkpointsBySession, selectedSessionId]);

  // Clamp / reset playhead when the timeline changes.
  useEffect(() => {
    setActiveIndex((idx) => {
      if (timeline.length === 0) return 0;
      return Math.min(idx, timeline.length - 1);
    });
  }, [timeline.length]);

  const activeNode = timeline[activeIndex] ?? null;
  const prevNode =
    activeIndex > 0 ? timeline[activeIndex - 1] ?? null : null;

  // Accumulated file tree = union of all files up to (and including) the playhead.
  const snapshotTree = useMemo<TreeNode>(() => {
    const files = new Map<string, CheckpointFile>();
    for (let i = 0; i <= activeIndex && i < timeline.length; i++) {
      const node = timeline[i];
      if (node.sessionId !== activeNode?.sessionId && selectedSessionId === 'all') {
        // When showing all sessions, only build the snapshot for the active
        // session so the file tree stays coherent.
        continue;
      }
      for (const file of node.files ?? []) {
        if (file.status === 'deleted') {
          files.delete(file.path);
        } else {
          files.set(file.path, file);
        }
      }
    }
    return buildFileTree(Array.from(files.values()));
  }, [timeline, activeIndex, activeNode, selectedSessionId]);

  // ---- Keyboard + auto-scrub --------------------------------------------

  const step = useCallback(
    (delta: number) => {
      setActiveIndex((idx) => {
        if (timeline.length === 0) return 0;
        return Math.max(0, Math.min(timeline.length - 1, idx + delta));
      });
    },
    [timeline.length],
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPlaying(false);
        step(-1);
      } else if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [step]);

  useEffect(() => {
    if (!playing || timeline.length === 0) return;
    const timer = setInterval(() => {
      setActiveIndex((idx) => {
        if (idx >= timeline.length - 1) {
          setPlaying(false);
          return idx;
        }
        return idx + 1;
      });
    }, AUTO_SCRUB_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, timeline.length]);

  // ---- Render ------------------------------------------------------------

  const isLoading = loadingSessions || loadingCheckpoints;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowKeyboardHint((v) => !v)}
              className="text-zinc-400 hover:text-white"
            >
              <Keyboard className="w-4 h-4 mr-1.5" />
              Shortcuts
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadSessions()}
              disabled={isLoading}
              className="text-zinc-400 hover:text-white"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero */}
        <section className="mb-8">
          <div className="flex items-center gap-2 text-indigo-400 mb-3">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium uppercase tracking-wider">
              Time Machine
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-indigo-200 to-purple-300 bg-clip-text text-transparent">
            Travel through time
          </h1>
          <p className="mt-3 text-zinc-400 max-w-2xl">
            Scrub through every checkpoint across your projects. Drag the
            playhead, watch your project state rebuild itself, and restore to
            any moment in history.
          </p>
        </section>

        {/* Keyboard hint */}
        {showKeyboardHint && (
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 flex flex-wrap gap-6 text-sm text-zinc-300">
            <span className="flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded bg-zinc-800 text-xs">←</kbd>
              <kbd className="px-2 py-0.5 rounded bg-zinc-800 text-xs">→</kbd>
              step checkpoints
            </span>
            <span className="flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded bg-zinc-800 text-xs">Space</kbd>
              play / pause auto-scrub
            </span>
          </div>
        )}

        {/* Controls row */}
        <section className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Select
              value={selectedSessionId}
              onValueChange={(value) => {
                setSelectedSessionId(value);
                setActiveIndex(0);
                setPlaying(false);
              }}
            >
              <SelectTrigger className="w-64 bg-zinc-900 border-zinc-800 text-zinc-200">
                <SelectValue placeholder="All sessions" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                <SelectItem value="all">All sessions</SelectItem>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.projectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlaying((p) => !p)}
              disabled={timeline.length === 0}
              className="border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
            >
              {playing ? (
                <>
                  <Pause className="w-4 h-4 mr-1.5" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1.5" /> Play
                </>
              )}
            </Button>
          </div>

          <TriggerLegend />
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Timeline panel */}
        <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading timeline…
            </div>
          ) : (
            <>
              <Timeline
                nodes={timeline}
                activeIndex={activeIndex}
                onScrub={(idx) => {
                  setPlaying(false);
                  setActiveIndex(idx);
                }}
              />
              {activeNode && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="secondary"
                      className="bg-zinc-800 text-zinc-200 border-zinc-700"
                    >
                      Checkpoint {activeIndex + 1} / {timeline.length}
                    </Badge>
                    <span className="text-sm text-zinc-300">
                      {activeNode.name || 'Unnamed checkpoint'}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDateTime(activeNode.createdAt)} ·{' '}
                      {formatRelative(activeNode.createdAt)}
                    </span>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    <Link href={`/restore/${activeNode.sessionId}`}>
                      <RotateCcw className="w-4 h-4 mr-1.5" />
                      Restore to here
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Empty state */}
        {!isLoading && timeline.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
            <Clock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">
              No checkpoints found. Start a session and create checkpoints to
              travel through time.
            </p>
          </div>
        )}

        {/* Dual panels */}
        {!isLoading && activeNode && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: project state snapshot */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Folder className="w-4 h-4 text-blue-400" />
                  Project state
                </h2>
                <span className="text-xs text-zinc-500">{activeNode.sessionName}</span>
              </div>
              {snapshotTree.children.size > 0 ? (
                <div className="max-h-[28rem] overflow-y-auto pr-1">
                  <FileTreeView node={snapshotTree} />
                </div>
              ) : (
                <p className="text-sm text-zinc-600">
                  No file snapshot available at this checkpoint.
                </p>
              )}
            </div>

            {/* Right: change since previous */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  {(() => {
                    const Icon = TRIGGER_META[activeNode.trigger].icon;
                    return <Icon className="w-4 h-4 text-zinc-400" />;
                  })()}
                  What changed
                </h2>
                <Badge
                  variant="secondary"
                  className="bg-zinc-800 text-zinc-300 border-zinc-700"
                  style={{ color: TRIGGER_META[activeNode.trigger].color }}
                >
                  {TRIGGER_META[activeNode.trigger].label}
                </Badge>
              </div>
              <ChangeStat node={activeNode} prev={prevNode} />
              {activeNode.description && (
                <p className="mt-4 text-xs text-zinc-500 border-t border-zinc-800 pt-3">
                  {activeNode.description}
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
