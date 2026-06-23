'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Boxes,
  Search,
  GitBranch,
  Route as RouteIcon,
  Network,
  FileSearch,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://timemachine-api.gitgram.app';

// ---------------------------------------------------------------------------
// Types — mirror the gitNexusService return shapes wrapped in { success, data }
// ---------------------------------------------------------------------------

type EngineState = 'checking' | 'available' | 'unavailable';

interface CodeStructure {
  files: string[];
  modules: string[];
  imports: Record<string, string[]>;
  exports: Record<string, string[]>;
}

interface RouteInfo {
  method: string;
  path: string;
  handler: string;
  file: string;
}

interface DependencyNode {
  id: string;
  label: string;
  kind: 'module' | 'file' | 'package';
}

interface DependencyEdge {
  source: string;
  target: string;
  kind: 'import' | 'require' | 'dynamic';
}

interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

interface SymbolInfo {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum';
  file: string;
  line: number;
  exported: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { type?: string; code?: string; message?: string };
}

type TabId = 'structure' | 'impact' | 'routes' | 'dependencies' | 'symbols';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Boxes;
}

const TABS: TabDef[] = [
  { id: 'structure', label: 'Structure', icon: Boxes },
  { id: 'impact', label: 'Impact', icon: GitBranch },
  { id: 'routes', label: 'Routes', icon: RouteIcon },
  { id: 'dependencies', label: 'Dependencies', icon: Network },
  { id: 'symbols', label: 'Symbols', icon: FileSearch },
];

// ---------------------------------------------------------------------------
// Auth + fetch helpers
// ---------------------------------------------------------------------------

function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return (
      window.localStorage.getItem('aitm_api_key') ||
      window.localStorage.getItem('apiKey')
    );
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (key) headers['X-API-Key'] = key;
  return headers;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected error contacting the gitnexus engine.';
}

async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!res.ok || !envelope?.success) {
    const message = envelope?.error?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return envelope.data as T;
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

const ENGINE_BADGE: Record<EngineState, { label: string; dot: string; text: string }> = {
  checking: { label: 'Checking engine…', dot: 'bg-gray-500', text: 'text-gray-400' },
  available: { label: 'Engine online', dot: 'bg-green-500', text: 'text-green-400' },
  unavailable: { label: 'Engine offline', dot: 'bg-red-500', text: 'text-red-400' },
};

const METHOD_COLOR: Record<string, string> = {
  GET: 'text-green-400 border-green-500/30 bg-green-500/10',
  POST: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  PUT: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  PATCH: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  DELETE: 'text-red-400 border-red-500/30 bg-red-500/10',
};

function methodClass(method: string): string {
  return METHOD_COLOR[method.toUpperCase()] || 'text-gray-300 border-gray-600 bg-gray-800';
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/40 p-10 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/40 p-6 text-sm text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dependency graph — simple deterministic SVG node-link layout
// ---------------------------------------------------------------------------

function DependencyGraphView({ graph }: { graph: DependencyGraph }) {
  const layout = useMemo(() => {
    const width = 720;
    const height = 420;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2 - 60;
    const positions = new Map<string, { x: number; y: number }>();

    graph.nodes.forEach((node, i) => {
      const angle = (i / Math.max(graph.nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      positions.set(node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });

    return { width, height, positions };
  }, [graph]);

  const kindFill: Record<DependencyNode['kind'], string> = {
    module: 'fill-blue-500',
    file: 'fill-emerald-500',
    package: 'fill-purple-500',
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full"
        role="img"
        aria-label="Dependency graph"
      >
        {graph.edges.map((edge, i) => {
          const a = layout.positions.get(edge.source);
          const b = layout.positions.get(edge.target);
          if (!a || !b) return null;
          return (
            <line
              key={`edge-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="stroke-gray-700"
              strokeWidth={1}
            />
          );
        })}
        {graph.nodes.map((node) => {
          const pos = layout.positions.get(node.id);
          if (!pos) return null;
          return (
            <g key={node.id}>
              <circle cx={pos.x} cy={pos.y} r={7} className={kindFill[node.kind]} />
              <text
                x={pos.x}
                y={pos.y - 12}
                textAnchor="middle"
                className="fill-gray-300"
                fontSize={10}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> module
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> file
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> package
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CodeIntelligencePage() {
  const [engine, setEngine] = useState<EngineState>('checking');
  const [workspacePath, setWorkspacePath] = useState('');
  const [analyzed, setAnalyzed] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('structure');

  // Structure (from analyze)
  const [structure, setStructure] = useState<CodeStructure | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Impact
  const [changedFile, setChangedFile] = useState('');
  const [impacted, setImpacted] = useState<string[] | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  // Routes
  const [routes, setRoutes] = useState<RouteInfo[] | null>(null);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState<string | null>(null);

  // Dependencies
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  // Symbols
  const [symbolQuery, setSymbolQuery] = useState('');
  const [symbols, setSymbols] = useState<SymbolInfo[] | null>(null);
  const [symbolsLoading, setSymbolsLoading] = useState(false);
  const [symbolsError, setSymbolsError] = useState<string | null>(null);

  // Engine status -----------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const data = await apiRequest<{ available: boolean }>(
          '/v1/gitnexus/status',
          { method: 'GET' },
          controller.signal
        );
        setEngine(data.available ? 'available' : 'unavailable');
      } catch {
        setEngine('unavailable');
      }
    })();
    return () => controller.abort();
  }, []);

  // Analyze -----------------------------------------------------------------
  const handleAnalyze = useCallback(async () => {
    const path = workspacePath.trim();
    if (!path) return;

    setAnalyzing(true);
    setAnalyzeError(null);
    // Reset dependent tabs so stale results from a prior workspace don't leak.
    setImpacted(null);
    setImpactError(null);
    setRoutes(null);
    setRoutesError(null);
    setGraph(null);
    setGraphError(null);
    setSymbols(null);
    setSymbolsError(null);

    try {
      const data = await apiRequest<CodeStructure>('/v1/gitnexus/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspacePath: path }),
      });
      setStructure(data);
      setAnalyzed(path);
      setActiveTab('structure');
    } catch (error: unknown) {
      setAnalyzeError(getErrorMessage(error));
      setStructure(null);
      setAnalyzed(null);
    } finally {
      setAnalyzing(false);
    }
  }, [workspacePath]);

  // Impact ------------------------------------------------------------------
  const handleImpact = useCallback(async () => {
    if (!analyzed || !changedFile.trim()) return;
    setImpactLoading(true);
    setImpactError(null);
    try {
      const data = await apiRequest<string[]>('/v1/gitnexus/impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspacePath: analyzed, changedFile: changedFile.trim() }),
      });
      setImpacted(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
      setImpactError(getErrorMessage(error));
      setImpacted(null);
    } finally {
      setImpactLoading(false);
    }
  }, [analyzed, changedFile]);

  // Routes ------------------------------------------------------------------
  const loadRoutes = useCallback(async () => {
    if (!analyzed) return;
    setRoutesLoading(true);
    setRoutesError(null);
    try {
      const data = await apiRequest<RouteInfo[]>(
        `/v1/gitnexus/routes?workspacePath=${encodeURIComponent(analyzed)}`,
        { method: 'GET' }
      );
      setRoutes(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
      setRoutesError(getErrorMessage(error));
      setRoutes(null);
    } finally {
      setRoutesLoading(false);
    }
  }, [analyzed]);

  // Dependencies ------------------------------------------------------------
  const loadDependencies = useCallback(async () => {
    if (!analyzed) return;
    setGraphLoading(true);
    setGraphError(null);
    try {
      const data = await apiRequest<DependencyGraph>(
        `/v1/gitnexus/dependencies?workspacePath=${encodeURIComponent(analyzed)}`,
        { method: 'GET' }
      );
      setGraph({ nodes: data.nodes ?? [], edges: data.edges ?? [] });
    } catch (error: unknown) {
      setGraphError(getErrorMessage(error));
      setGraph(null);
    } finally {
      setGraphLoading(false);
    }
  }, [analyzed]);

  // Symbols -----------------------------------------------------------------
  const handleSymbolSearch = useCallback(async () => {
    if (!analyzed || !symbolQuery.trim()) return;
    setSymbolsLoading(true);
    setSymbolsError(null);
    try {
      const data = await apiRequest<SymbolInfo[]>(
        `/v1/gitnexus/symbols?workspacePath=${encodeURIComponent(analyzed)}&query=${encodeURIComponent(symbolQuery.trim())}`,
        { method: 'GET' }
      );
      setSymbols(Array.isArray(data) ? data : []);
    } catch (error: unknown) {
      setSymbolsError(getErrorMessage(error));
      setSymbols(null);
    } finally {
      setSymbolsLoading(false);
    }
  }, [analyzed, symbolQuery]);

  // Lazy-load routes/dependencies when their tab is first opened.
  useEffect(() => {
    if (!analyzed) return;
    if (activeTab === 'routes' && routes === null && !routesLoading && !routesError) {
      void loadRoutes();
    }
    if (activeTab === 'dependencies' && graph === null && !graphLoading && !graphError) {
      void loadDependencies();
    }
  }, [
    activeTab,
    analyzed,
    routes,
    routesLoading,
    routesError,
    loadRoutes,
    graph,
    graphLoading,
    graphError,
    loadDependencies,
  ]);

  const badge = ENGINE_BADGE[engine];
  const hasWorkspace = analyzed !== null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        {/* Hero */}
        <div className="mb-10 text-center">
          <Badge className="mb-4" variant="outline">
            Code Intelligence
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Understand any codebase instantly
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-gray-400">
            Structure, impact analysis, route maps, dependency graphs, and symbol search —
            powered by the in-process gitnexus engine.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-sm">
            <span className="relative flex h-2.5 w-2.5">
              {engine === 'available' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
              )}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${badge.dot}`} />
            </span>
            <span className={badge.text}>{badge.label}</span>
          </div>
        </div>

        {/* Engine-not-available notice */}
        {engine === 'unavailable' && (
          <div className="mb-8 flex items-start gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-sm text-yellow-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">The gitnexus engine is not available right now.</p>
              <p className="mt-1 text-yellow-200/80">
                Analysis requests will fail until the engine comes back online. You can still
                enter a workspace path — results will populate once the engine recovers. Make
                sure an API key is configured for this session.
              </p>
            </div>
          </div>
        )}

        {/* Workspace input */}
        <section className="mb-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
          <label htmlFor="workspace-path" className="mb-2 block text-sm font-medium text-gray-300">
            Workspace path
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="workspace-path"
              type="text"
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAnalyze();
              }}
              placeholder="/absolute/path/to/repository"
              spellCheck={false}
              className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-4 py-2.5 font-mono text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <Button
              onClick={handleAnalyze}
              disabled={analyzing || workspacePath.trim().length === 0}
              className="gap-2"
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {analyzing ? 'Analyzing…' : 'Analyze'}
            </Button>
          </div>
          {analyzeError && (
            <div className="mt-4">
              <ErrorState message={analyzeError} />
            </div>
          )}
          {analyzed && !analyzeError && (
            <p className="mt-3 flex items-center gap-2 text-sm text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Analyzed <span className="font-mono text-green-300">{analyzed}</span>
            </p>
          )}
        </section>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-gray-800">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {!hasWorkspace ? (
          <EmptyState message="Enter a workspace path above and run Analyze to explore its code intelligence." />
        ) : (
          <section className="space-y-6">
            {/* Structure ---------------------------------------------------- */}
            {activeTab === 'structure' && (
              <div className="space-y-6">
                {!structure ? (
                  <EmptyState message="No structure data yet." />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <StatCard label="Files" value={structure.files.length} />
                      <StatCard label="Modules" value={structure.modules.length} />
                      <StatCard
                        label="Import edges"
                        value={Object.values(structure.imports).reduce((a, b) => a + b.length, 0)}
                      />
                      <StatCard
                        label="Export edges"
                        value={Object.values(structure.exports).reduce((a, b) => a + b.length, 0)}
                      />
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <ListPanel title="Files" items={structure.files} />
                      <ListPanel title="Modules" items={structure.modules} />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Impact ------------------------------------------------------- */}
            {activeTab === 'impact' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
                  <label
                    htmlFor="changed-file"
                    className="mb-2 block text-sm font-medium text-gray-300"
                  >
                    What breaks if I change this file?
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      id="changed-file"
                      type="text"
                      value={changedFile}
                      onChange={(e) => setChangedFile(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleImpact();
                      }}
                      placeholder="src/services/auth.ts"
                      spellCheck={false}
                      className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-4 py-2.5 font-mono text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <Button
                      onClick={handleImpact}
                      disabled={impactLoading || changedFile.trim().length === 0}
                      className="gap-2"
                    >
                      {impactLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <GitBranch className="h-4 w-4" />
                      )}
                      Trace impact
                    </Button>
                  </div>
                </div>

                {impactLoading && <LoadingState label="Tracing impacted files…" />}
                {impactError && <ErrorState message={impactError} />}
                {!impactLoading && !impactError && impacted !== null && (
                  impacted.length === 0 ? (
                    <EmptyState message="No other files appear to depend on this file." />
                  ) : (
                    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
                      <p className="mb-3 text-sm text-gray-400">
                        {impacted.length} file{impacted.length === 1 ? '' : 's'} impacted by changes to{' '}
                        <span className="font-mono text-gray-200">{changedFile.trim()}</span>
                      </p>
                      <ul className="space-y-1.5">
                        {impacted.map((file) => (
                          <li
                            key={file}
                            className="flex items-center gap-2 rounded-lg bg-gray-950/60 px-3 py-2 font-mono text-sm text-gray-200"
                          >
                            <XCircle className="h-3.5 w-3.5 text-orange-400" />
                            {file}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Routes ------------------------------------------------------- */}
            {activeTab === 'routes' && (
              <div className="space-y-4">
                {routesLoading && <LoadingState label="Mapping API routes…" />}
                {routesError && <ErrorState message={routesError} />}
                {!routesLoading && !routesError && routes !== null && (
                  routes.length === 0 ? (
                    <EmptyState message="No API routes were discovered in this workspace." />
                  ) : (
                    <div className="overflow-hidden rounded-2xl border border-gray-800">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-900/80 text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-4 py-3">Method</th>
                            <th className="px-4 py-3">Path</th>
                            <th className="px-4 py-3">Handler</th>
                            <th className="px-4 py-3">File</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {routes.map((route, i) => (
                            <tr key={`${route.method}-${route.path}-${i}`} className="bg-gray-900/40">
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${methodClass(route.method)}`}
                                >
                                  {route.method.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-gray-200">{route.path}</td>
                              <td className="px-4 py-3 text-gray-400">{route.handler}</td>
                              <td className="px-4 py-3 font-mono text-xs text-gray-500">
                                {route.file}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Dependencies ------------------------------------------------- */}
            {activeTab === 'dependencies' && (
              <div className="space-y-4">
                {graphLoading && <LoadingState label="Building dependency graph…" />}
                {graphError && <ErrorState message={graphError} />}
                {!graphLoading && !graphError && graph !== null && (
                  graph.nodes.length === 0 ? (
                    <EmptyState message="No dependency relationships were found." />
                  ) : (
                    <>
                      <p className="text-sm text-gray-400">
                        {graph.nodes.length} nodes · {graph.edges.length} edges
                      </p>
                      <DependencyGraphView graph={graph} />
                    </>
                  )
                )}
              </div>
            )}

            {/* Symbols ------------------------------------------------------ */}
            {activeTab === 'symbols' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
                  <label
                    htmlFor="symbol-query"
                    className="mb-2 block text-sm font-medium text-gray-300"
                  >
                    Search symbols
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      id="symbol-query"
                      type="text"
                      value={symbolQuery}
                      onChange={(e) => setSymbolQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSymbolSearch();
                      }}
                      placeholder="createUser, AuthService, RouteInfo…"
                      spellCheck={false}
                      className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-4 py-2.5 font-mono text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <Button
                      onClick={handleSymbolSearch}
                      disabled={symbolsLoading || symbolQuery.trim().length === 0}
                      className="gap-2"
                    >
                      {symbolsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileSearch className="h-4 w-4" />
                      )}
                      Search
                    </Button>
                  </div>
                </div>

                {symbolsLoading && <LoadingState label="Searching symbols…" />}
                {symbolsError && <ErrorState message={symbolsError} />}
                {!symbolsLoading && !symbolsError && symbols !== null && (
                  symbols.length === 0 ? (
                    <EmptyState message="No symbols matched your query." />
                  ) : (
                    <div className="space-y-2">
                      {symbols.map((sym, i) => (
                        <div
                          key={`${sym.file}-${sym.name}-${sym.line}-${i}`}
                          className="flex items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="rounded border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-300">
                              {sym.kind}
                            </span>
                            <span className="truncate font-mono text-sm text-white">{sym.name}</span>
                            {sym.exported && (
                              <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-300">
                                export
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 font-mono text-xs text-gray-500">
                            {sym.file}:{sym.line}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gradient-to-b from-gray-900 to-gray-900/40 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-200">
        {title} <span className="text-gray-500">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">None found.</p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {items.map((item) => (
            <li
              key={item}
              className="truncate rounded px-2 py-1 font-mono text-xs text-gray-300 hover:bg-gray-800/60"
              title={item}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
