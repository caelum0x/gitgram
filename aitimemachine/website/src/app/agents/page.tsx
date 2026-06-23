'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

// API base — same pattern as status/memory pages. Beads + A2A routes are
// mounted at the root of the AITM API server (/beads, /a2a — NOT /v1/...).
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://timemachine-api.gitgram.app';
const POLL_INTERVAL_MS = 4000;

// ------- Beads task model (real GET /beads/tasks shape) -------
// The beads `bd list --json` CLI emits issues with these fields. Statuses are
// the beads built-ins: open | in_progress | blocked | deferred | closed |
// pinned | hooked. Edges are derived from dependency_count / a `dependencies`
// array of { depends_on_id }.

type BeadStatus = 'open' | 'in_progress' | 'blocked' | 'deferred' | 'closed' | 'pinned' | 'hooked';

interface BeadDependency {
  issue_id: string;
  depends_on_id: string;
  type?: string;
}

interface RawBead {
  id: string;
  title: string;
  status: BeadStatus;
  priority?: number;
  issue_type?: string;
  created_at?: string;
  updated_at?: string;
  dependencies?: BeadDependency[];
  dependency_count?: number;
  dependent_count?: number;
}

// Normalized task used throughout the UI.
interface Task {
  id: string;
  title: string;
  status: BeadStatus;
  priority: number;
  dependsOn: string[]; // upstream task ids this task is blocked by
  dependencyCount: number; // total upstream deps (may exceed dependsOn if some are outside the page)
  dependentCount: number; // downstream tasks depending on this one
  createdAt: string;
  updatedAt: string;
}

// A2A registered agent (real GET /a2a/agents shape: { agents: PublicAgentInfo[] }).
type AgentStatus = 'active' | 'inactive';

interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  status: AgentStatus;
  lastSeen: string;
}

interface CreateTaskPayload {
  title: string;
  deps: string[];
}

// ------- Normalization & validation (never trust external data) -------

const BEAD_STATUSES: readonly BeadStatus[] = [
  'open',
  'in_progress',
  'blocked',
  'deferred',
  'closed',
  'pinned',
  'hooked',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asBeadStatus(value: unknown): BeadStatus {
  return typeof value === 'string' && (BEAD_STATUSES as readonly string[]).includes(value)
    ? (value as BeadStatus)
    : 'open';
}

function normalizeBead(raw: unknown): Task | null {
  if (!isRecord(raw)) return null;
  const id = raw.id;
  if (typeof id !== 'string' || id.length === 0) return null;

  const dependsOn: string[] = Array.isArray(raw.dependencies)
    ? raw.dependencies
        .map((d) => (isRecord(d) && typeof d.depends_on_id === 'string' ? d.depends_on_id : null))
        .filter((d): d is string => d !== null)
    : [];

  return {
    id,
    title: typeof raw.title === 'string' ? raw.title : id,
    status: asBeadStatus(raw.status),
    priority: typeof raw.priority === 'number' ? raw.priority : 2,
    dependsOn,
    dependencyCount:
      typeof raw.dependency_count === 'number' ? raw.dependency_count : dependsOn.length,
    dependentCount: typeof raw.dependent_count === 'number' ? raw.dependent_count : 0,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : '',
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  };
}

function normalizeAgent(raw: unknown): Agent | null {
  if (!isRecord(raw)) return null;
  const id = raw.id;
  if (typeof id !== 'string' || id.length === 0) return null;
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.filter((c): c is string => typeof c === 'string')
    : [];
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : id,
    capabilities,
    status: raw.status === 'inactive' ? 'inactive' : 'active',
    lastSeen: typeof raw.lastSeen === 'string' ? raw.lastSeen : '',
  };
}

// ------- Ready-work detection -------
// A task is "ready" when it has no open upstream blockers: it is itself open
// and every dependency it lists points to a closed (done) task.

function isReady(task: Task, byId: Map<string, Task>): boolean {
  if (task.status !== 'open') return false;
  // If beads reports more deps than we can see on this page, be conservative.
  if (task.dependencyCount > task.dependsOn.length) return false;
  return task.dependsOn.every((depId) => {
    const dep = byId.get(depId);
    return dep ? dep.status === 'closed' : false;
  });
}

// ------- Status presentation -------

interface StatusStyle {
  label: string;
  pill: string;
  dot: string;
  nodeFill: string;
  nodeStroke: string;
  nodeDot: string;
}

const STATUS_STYLES: Record<BeadStatus, StatusStyle> = {
  open: {
    label: 'open',
    pill: 'bg-gray-700 text-gray-300',
    dot: 'bg-gray-400',
    nodeFill: '#1f2937',
    nodeStroke: '#374151',
    nodeDot: '#9ca3af',
  },
  in_progress: {
    label: 'in progress',
    pill: 'bg-blue-900/60 text-blue-300 border border-blue-700',
    dot: 'bg-blue-400',
    nodeFill: '#1e3a5f',
    nodeStroke: '#3b82f6',
    nodeDot: '#60a5fa',
  },
  blocked: {
    label: 'blocked',
    pill: 'bg-amber-900/60 text-amber-300 border border-amber-700',
    dot: 'bg-amber-400',
    nodeFill: '#451a03',
    nodeStroke: '#d97706',
    nodeDot: '#fbbf24',
  },
  deferred: {
    label: 'deferred',
    pill: 'bg-gray-800 text-gray-400 border border-gray-700',
    dot: 'bg-gray-500',
    nodeFill: '#111827',
    nodeStroke: '#4b5563',
    nodeDot: '#6b7280',
  },
  closed: {
    label: 'done',
    pill: 'bg-green-900/60 text-green-300 border border-green-700',
    dot: 'bg-green-400',
    nodeFill: '#14532d',
    nodeStroke: '#22c55e',
    nodeDot: '#4ade80',
  },
  pinned: {
    label: 'pinned',
    pill: 'bg-purple-900/60 text-purple-300 border border-purple-700',
    dot: 'bg-purple-400',
    nodeFill: '#3b0764',
    nodeStroke: '#a855f7',
    nodeDot: '#c084fc',
  },
  hooked: {
    label: 'hooked',
    pill: 'bg-cyan-900/60 text-cyan-300 border border-cyan-700',
    dot: 'bg-cyan-400',
    nodeFill: '#083344',
    nodeStroke: '#06b6d4',
    nodeDot: '#22d3ee',
  },
};

function priorityLabel(priority: number): string {
  switch (priority) {
    case 0:
      return 'P0';
    case 1:
      return 'P1';
    case 2:
      return 'P2';
    case 3:
      return 'P3';
    default:
      return `P${priority}`;
  }
}

function priorityClass(priority: number): string {
  switch (priority) {
    case 0:
      return 'bg-red-900/50 text-red-300 border border-red-800';
    case 1:
      return 'bg-orange-900/50 text-orange-300 border border-orange-800';
    case 2:
      return 'bg-gray-800 text-gray-400 border border-gray-700';
    default:
      return 'bg-gray-800/60 text-gray-500 border border-gray-800';
  }
}

// ------- Stats -------

interface Stats {
  total: number;
  open: number;
  inProgress: number;
  blocked: number;
  done: number;
  ready: number;
}

function computeStats(tasks: Task[], readyIds: Set<string>): Stats {
  return tasks.reduce<Stats>(
    (acc, t) => {
      acc.total += 1;
      if (t.status === 'open') acc.open += 1;
      else if (t.status === 'in_progress') acc.inProgress += 1;
      else if (t.status === 'blocked') acc.blocked += 1;
      else if (t.status === 'closed') acc.done += 1;
      if (readyIds.has(t.id)) acc.ready += 1;
      return acc;
    },
    { total: 0, open: 0, inProgress: 0, blocked: 0, done: 0, ready: 0 }
  );
}

// ------- DAG Visualization (Kahn topological layering preserved) -------

interface DagNode {
  id: string;
  label: string;
  status: BeadStatus;
  priority: number;
  ready: boolean;
  x: number;
  y: number;
}

interface DagEdge {
  from: string;
  to: string;
}

const NODE_W = 130;
const NODE_H = 44;
const H_GAP = 60;
const V_GAP = 56;

function buildDag(tasks: Task[], readyIds: Set<string>): { nodes: DagNode[]; edges: DagEdge[] } {
  // Assign topological layers using Kahn's algorithm. Edges flow from a
  // dependency (depends_on_id) -> the dependent task.
  const idSet = new Set(tasks.map((t) => t.id));
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const t of tasks) {
    if (!inDegree.has(t.id)) inDegree.set(t.id, 0);
    if (!adjList.has(t.id)) adjList.set(t.id, []);
    for (const dep of t.dependsOn) {
      if (idSet.has(dep)) {
        adjList.get(dep)!.push(t.id);
        inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
      }
    }
  }

  const layers: string[][] = [];
  let queue = tasks.filter((t) => (inDegree.get(t.id) ?? 0) === 0).map((t) => t.id);

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue: string[] = [];
    for (const id of queue) {
      for (const child of adjList.get(id) ?? []) {
        inDegree.set(child, (inDegree.get(child) ?? 1) - 1);
        if (inDegree.get(child) === 0) nextQueue.push(child);
      }
    }
    queue = nextQueue;
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const nodes: DagNode[] = [];

  for (let col = 0; col < layers.length; col++) {
    const layer = layers[col];
    for (let row = 0; row < layer.length; row++) {
      const id = layer[row];
      const t = taskMap.get(id);
      if (!t) continue;
      const x = col * (NODE_W + H_GAP) + 16;
      const y = row * (NODE_H + V_GAP) + 16;
      nodes.push({
        id,
        label: t.title,
        status: t.status,
        priority: t.priority,
        ready: readyIds.has(id),
        x,
        y,
      });
    }
  }

  const edges: DagEdge[] = [];
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (idSet.has(dep)) {
        edges.push({ from: dep, to: t.id });
      }
    }
  }

  return { nodes, edges };
}

function DagVisualization({ tasks, readyIds }: { tasks: Task[]; readyIds: Set<string> }) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
        No tasks yet — create one below to see the graph
      </div>
    );
  }

  const { nodes, edges } = buildDag(tasks, readyIds);
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W), 200);
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H), 80);
  const svgW = maxX + 32;
  const svgH = maxY + 32;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="min-w-full"
        aria-label="Task dependency graph"
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#4b5563" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const cx1 = x1 + (x2 - x1) * 0.5;
          const cx2 = x1 + (x2 - x1) * 0.5;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
              stroke="#4b5563"
              strokeWidth="1.5"
              fill="none"
              markerEnd="url(#arrowhead)"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const style = STATUS_STYLES[node.status];
          return (
            <g key={node.id}>
              {/* Ready-work highlight ring */}
              {node.ready && (
                <rect
                  x={node.x - 3}
                  y={node.y - 3}
                  width={NODE_W + 6}
                  height={NODE_H + 6}
                  rx={9}
                  ry={9}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                >
                  <animate
                    attributeName="opacity"
                    values="0.4;1;0.4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </rect>
              )}
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                ry={6}
                fill={style.nodeFill}
                stroke={style.nodeStroke}
                strokeWidth="1.5"
              />
              <text
                x={node.x + 10}
                y={node.y + NODE_H / 2}
                dominantBaseline="middle"
                textAnchor="start"
                fill="#e5e7eb"
                fontSize="11"
                fontFamily="ui-monospace, monospace"
              >
                {node.label.length > 15 ? node.label.slice(0, 14) + '…' : node.label}
              </text>
              {/* Priority badge */}
              <text
                x={node.x + 10}
                y={node.y + NODE_H - 7}
                fill="#9ca3af"
                fontSize="8"
                fontFamily="ui-monospace, monospace"
              >
                {priorityLabel(node.priority)}
              </text>
              {/* Status dot */}
              <circle cx={node.x + NODE_W - 10} cy={node.y + 10} r={4} fill={style.nodeDot} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ------- Create Task Form (POSTs real { title, deps } to /beads/tasks) -------

interface CreateFormProps {
  onCreated: () => void;
  existingTaskIds: string[];
}

function CreateTaskForm({ onCreated, existingTaskIds }: CreateFormProps) {
  const [title, setTitle] = useState('');
  const [depsRaw, setDepsRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    const deps = depsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const unknownDeps = deps.filter((d) => !existingTaskIds.includes(d));
    if (unknownDeps.length > 0) {
      setError(`Unknown dependency IDs: ${unknownDeps.join(', ')}`);
      return;
    }

    const payload: CreateTaskPayload = { title: title.trim(), deps };

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/beads/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        const msg = isRecord(body) && 'error' in body ? String(body.error) : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setTitle('');
      setDepsRaw('');
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1 font-medium">
            Task Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Run integration tests"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1 font-medium">
            Dependencies
            <span className="text-gray-600 font-normal ml-1">(comma-separated task IDs)</span>
          </label>
          <input
            type="text"
            value={depsRaw}
            onChange={(e) => setDepsRaw(e.target.value)}
            placeholder="bd-12, bd-37"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
      >
        {submitting ? 'Creating…' : 'Create Task'}
      </button>
    </form>
  );
}

// ------- Task Row -------

interface TaskRowProps {
  task: Task;
  ready: boolean;
}

function TaskRow({ task, ready }: TaskRowProps) {
  const style = STATUS_STYLES[task.status];
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
        ready
          ? 'bg-emerald-950/30 border-emerald-800/70 hover:border-emerald-700'
          : 'bg-gray-800/40 border-gray-800 hover:border-gray-700'
      }`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap ${style.pill}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-white truncate">{task.title}</p>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${priorityClass(task.priority)}`}
            >
              {priorityLabel(task.priority)}
            </span>
            {ready && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700">
                ready
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5 font-mono">{task.id}</p>
          {task.dependsOn.length > 0 && (
            <p className="text-xs text-gray-600 mt-0.5">
              deps: <span className="font-mono">{task.dependsOn.join(', ')}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500">
        <span title="Upstream dependencies">↑ {task.dependencyCount}</span>
        <span title="Downstream dependents">↓ {task.dependentCount}</span>
      </div>
    </div>
  );
}

// ------- Agents Panel (real GET /a2a/agents) -------

function relativeTime(iso: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function AgentsPanel({ agents }: { agents: Agent[] }) {
  if (agents.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <div className="text-3xl mb-2">🛰️</div>
        <p className="text-sm">No agents registered.</p>
        <p className="text-xs text-gray-700 mt-1">
          Agents appear here after registering via{' '}
          <code className="font-mono">POST /a2a/agents/register</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="bg-gray-800/40 border border-gray-800 rounded-lg px-4 py-3 hover:border-gray-700 transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-white truncate">{agent.name}</p>
            <span
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${
                agent.status === 'active'
                  ? 'bg-green-900/30 border-green-800 text-green-400'
                  : 'bg-gray-800 border-gray-700 text-gray-500'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  agent.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
                }`}
              />
              {agent.status}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5 font-mono truncate">{agent.id}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {agent.capabilities.length === 0 ? (
              <span className="text-xs text-gray-700">no capabilities</span>
            ) : (
              agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 border border-blue-800 text-blue-300 font-mono"
                >
                  {cap}
                </span>
              ))
            )}
          </div>
          <p className="text-xs text-gray-600 mt-2">last seen {relativeTime(agent.lastSeen)}</p>
        </div>
      ))}
    </div>
  );
}

// ------- Mock fallback (dev — used when the API is unreachable) -------

const MOCK_TASKS: Task[] = [
  {
    id: 'mock-1',
    title: 'Clone repository',
    status: 'closed',
    priority: 1,
    dependsOn: [],
    dependencyCount: 0,
    dependentCount: 2,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'mock-2',
    title: 'Install dependencies',
    status: 'open',
    priority: 2,
    dependsOn: ['mock-1'],
    dependencyCount: 1,
    dependentCount: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'mock-3',
    title: 'Run test suite',
    status: 'blocked',
    priority: 0,
    dependsOn: ['mock-2'],
    dependencyCount: 1,
    dependentCount: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'mock-4',
    title: 'Open pull request',
    status: 'open',
    priority: 2,
    dependsOn: ['mock-3'],
    dependencyCount: 1,
    dependentCount: 0,
    createdAt: '',
    updatedAt: '',
  },
];

const MOCK_AGENTS: Agent[] = [
  {
    id: 'agent-aitm',
    name: 'AITM Agent',
    capabilities: ['checkpoint', 'restore', 'timeline'],
    status: 'active',
    lastSeen: new Date().toISOString(),
  },
  {
    id: 'agent-pr-bot',
    name: 'PR Swarm Bot',
    capabilities: ['code-review', 'pull-request'],
    status: 'inactive',
    lastSeen: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
];

// ------- Main Page -------

type FilterStatus = 'all' | 'ready' | BeadStatus;

export default function AgentsDashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [apiReachable, setApiReachable] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, agentsRes] = await Promise.all([
        fetch(`${API_BASE}/beads/tasks`),
        fetch(`${API_BASE}/a2a/agents`),
      ]);

      if (!tasksRes.ok) throw new Error(`tasks HTTP ${tasksRes.status}`);
      if (!agentsRes.ok) throw new Error(`agents HTTP ${agentsRes.status}`);

      const tasksBody: unknown = await tasksRes.json();
      const agentsBody: unknown = await agentsRes.json();

      // Beads route wraps results: { success, data: RawBead[] }.
      const rawTasks: unknown =
        isRecord(tasksBody) && 'data' in tasksBody ? tasksBody.data : tasksBody;
      const taskList = Array.isArray(rawTasks)
        ? rawTasks.map(normalizeBead).filter((t): t is Task => t !== null)
        : [];

      // A2A route wraps results: { agents: PublicAgentInfo[] }.
      const rawAgents: unknown =
        isRecord(agentsBody) && 'agents' in agentsBody ? agentsBody.agents : agentsBody;
      const agentList = Array.isArray(rawAgents)
        ? rawAgents.map(normalizeAgent).filter((a): a is Agent => a !== null)
        : [];

      setTasks(taskList);
      setAgents(agentList);
      setFetchError(null);
      setApiReachable(true);
      setUsingMock(false);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      // Graceful fallback to mock data when endpoints are unreachable (dev).
      setApiReachable(false);
      setUsingMock(true);
      setTasks(MOCK_TASKS);
      setAgents(MOCK_AGENTS);
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch agent data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    pollingRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current !== null) clearInterval(pollingRef.current);
    };
  }, [fetchData]);

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const readyIds = new Set(tasks.filter((t) => isReady(t, byId)).map((t) => t.id));
  const stats = computeStats(tasks, readyIds);

  const filteredTasks =
    filter === 'all'
      ? tasks
      : filter === 'ready'
        ? tasks.filter((t) => readyIds.has(t.id))
        : tasks.filter((t) => t.status === filter);

  const filterOptions: { label: string; value: FilterStatus }[] = [
    { label: 'All', value: 'all' },
    { label: 'Ready', value: 'ready' },
    { label: 'Open', value: 'open' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Blocked', value: 'blocked' },
    { label: 'Done', value: 'closed' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-xl font-bold tracking-tight">
            🕐 Gitgram TimeMachine
          </Link>
          <div className="flex gap-4 items-center text-sm">
            <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors">
              Dashboard
            </Link>
            <Link href="/analytics" className="text-gray-400 hover:text-white transition-colors">
              Analytics
            </Link>
            <Link href="/agents" className="text-white font-medium">
              Agents
            </Link>
            <Link href="/settings" className="text-gray-400 hover:text-white transition-colors">
              Settings
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Agent Task Dashboard</h1>
            <p className="text-gray-400 mt-1 text-sm">
              Live view of the beads task DAG and registered A2A agents
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                apiReachable
                  ? 'bg-green-900/30 border-green-800 text-green-400'
                  : 'bg-red-900/30 border-red-800 text-red-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${apiReachable ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
              />
              {apiReachable ? 'Live' : 'Offline'}
            </span>
            {lastUpdated && (
              <span className="text-xs text-gray-600">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchData}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* API Offline / Mock Banner */}
        {usingMock && (
          <div className="flex items-center gap-3 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
            <span className="text-yellow-500 text-lg">⚠</span>
            <div>
              <p className="text-sm font-medium text-yellow-200">
                AITM API unreachable — showing mock data
              </p>
              <p className="text-xs text-yellow-300/70 mt-0.5">
                Ensure the API server is running at <code className="font-mono">{API_BASE}</code>{' '}
                (beads at <code className="font-mono">/beads</code>, agents at{' '}
                <code className="font-mono">/a2a</code>). Retrying every {POLL_INTERVAL_MS / 1000}s.
              </p>
            </div>
          </div>
        )}

        {fetchError && apiReachable && (
          <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
            {fetchError}
          </div>
        )}

        {/* Stats Bar */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: stats.total, accent: 'text-white' },
            { label: 'Ready', value: stats.ready, accent: 'text-emerald-400' },
            { label: 'Open', value: stats.open, accent: 'text-gray-300' },
            { label: 'In Progress', value: stats.inProgress, accent: 'text-blue-400' },
            { label: 'Blocked', value: stats.blocked, accent: 'text-amber-400' },
            { label: 'Done', value: stats.done, accent: 'text-green-400' },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-gray-800/40 border border-gray-800 rounded-xl px-4 py-3 text-center"
            >
              <div className={`text-2xl font-bold ${s.accent}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* DAG Section */}
        <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="text-blue-400">◈</span> Task Dependency Graph
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-3 h-3 rounded border border-dashed border-emerald-400" /> ready
              work (no open blockers)
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-24 text-gray-600 text-sm">
              Loading graph…
            </div>
          ) : (
            <DagVisualization tasks={tasks} readyIds={readyIds} />
          )}
        </section>

        {/* Agents Panel */}
        <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <span className="text-cyan-400">🛰️</span> Registered Agents
            <span className="text-sm font-normal text-gray-500">({agents.length})</span>
          </h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-800/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <AgentsPanel agents={agents} />
          )}
        </section>

        {/* Task List */}
        <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="text-green-400">≡</span> Tasks
              <span className="text-sm font-normal text-gray-500">
                ({filteredTasks.length}
                {filter !== 'all' ? ` ${filter}` : ''})
              </span>
            </h2>
            {/* Filter Pills */}
            <div className="flex gap-2 flex-wrap">
              {filterOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    filter === opt.value
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-800/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-10 text-gray-600">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm">
                {filter === 'all'
                  ? 'No tasks yet. Create your first task below.'
                  : `No ${filter} tasks.`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskRow key={task.id} task={task} ready={readyIds.has(task.id)} />
              ))}
            </div>
          )}
        </section>

        {/* Create Task */}
        <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <span className="text-purple-400">+</span> Create Task
          </h2>
          <CreateTaskForm onCreated={fetchData} existingTaskIds={tasks.map((t) => t.id)} />
        </section>
      </div>
    </div>
  );
}
