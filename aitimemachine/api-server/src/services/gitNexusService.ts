/**
 * GitNexus Bridge Service
 *
 * Bridges AITM to the GitNexus code-intelligence engine. Exposes higher-level
 * helpers for code structure analysis, impact tracking, route mapping,
 * dependency graphs, and symbol search.
 *
 * Transport: in-process. Previously this module spoke JSON-RPC 2.0 over HTTP to
 * a standalone GitNexus server (`GITNEXUS_URL/message`). It now embeds the
 * GitNexus backend directly via the `gitnexus` workspace library
 * (`createGitNexusBackend()` → `LocalBackend.callTool(...)`), which is the exact
 * dispatch path the MCP/HTTP transports drove. Same semantics, zero network hop.
 *
 * The public surface — function names, signatures, return shapes, and the
 * generic `callGitNexus(method, params)` escape hatch — is unchanged so that
 * `routes/gitnexus.ts` and any other caller keep working without edits.
 *
 * All functions return safe defaults (or `false` for {@link isAvailable}) when
 * the backend is unreachable or errors. Use {@link isAvailable} to guard
 * optional features at call sites.
 */

import { createGitNexusBackend, type GitNexusBackend } from "gitnexus";
import { logger } from "../lib/monitoring.js";

// ============================================================================
// In-process backend bootstrap (lazy singleton)
// ============================================================================

/**
 * Lazily-initialised GitNexus backend. The backend opens pooled database
 * handles and discovers indexed repos, so it is created once and reused.
 * Initialisation is memoised on the promise to avoid a thundering-herd of
 * concurrent `init()` calls.
 */
let _backendPromise: Promise<GitNexusBackend> | null = null;

async function getBackend(): Promise<GitNexusBackend> {
  if (_backendPromise === null) {
    _backendPromise = createGitNexusBackend().catch((error: unknown) => {
      // Reset so a later call can retry rather than caching a rejected promise.
      _backendPromise = null;
      throw error;
    });
  }
  return _backendPromise;
}

/**
 * Maps the legacy JSON-RPC method names this service historically used to the
 * real GitNexus tool names exposed by `LocalBackend.callTool`. Keeping the old
 * names in the public `callGitNexus(method, ...)` contract means callers that
 * passed `gn_*` (or bare) method strings continue to work after the swap.
 */
const METHOD_ALIASES: Readonly<Record<string, string>> = {
  gn_context: "context",
  gn_impact: "impact",
  gn_route_map: "route_map",
  gn_dep_graph: "cypher",
  gn_symbol_search: "query",
  gn_ping: "list_repos",
  gn_detect_changes: "detect_changes",
  gn_api_impact: "api_impact",
  gn_trace: "trace",
  gn_shape_check: "shape_check",
  gn_explain: "explain",
  // Bare aliases (idempotent passthrough).
  context: "context",
  impact: "impact",
  route_map: "route_map",
  dep_graph: "cypher",
  symbol_search: "query",
  ping: "list_repos",
  detect_changes: "detect_changes",
  api_impact: "api_impact",
  trace: "trace",
  shape_check: "shape_check",
  explain: "explain",
};

function resolveToolName(method: string): string {
  return METHOD_ALIASES[method] ?? method;
}

// ============================================================================
// Public domain types
// ============================================================================

export interface CodeStructure {
  files: string[];
  modules: string[];
  imports: Record<string, string[]>;
  exports: Record<string, string[]>;
}

export interface RouteInfo {
  method: string;
  path: string;
  handler: string;
  file: string;
}

export interface DependencyNode {
  id: string;
  label: string;
  kind: "module" | "file" | "package";
}

export interface DependencyEdge {
  source: string;
  target: string;
  kind: "import" | "require" | "dynamic";
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface Symbol {
  name: string;
  kind: "function" | "class" | "variable" | "type" | "interface" | "enum";
  file: string;
  line: number;
  exported: boolean;
}

/** Which set of git changes to analyse for {@link detectChanges}. */
export type ChangeScope = "unstaged" | "staged" | "all" | "compare";

export interface DetectChangesOptions {
  /** Which changes to analyse. Defaults to "unstaged". */
  scope?: ChangeScope;
  /** Base ref for the "compare" scope (e.g. "main"). */
  baseRef?: string;
  /** Absolute path to a linked git worktree when changes live there. */
  worktree?: string;
  /** Repository name/path; omit when a single repo is indexed. */
  repo?: string;
}

/**
 * Result of mapping a git diff to its blast radius. The GitNexus backend may
 * return additional fields; the structured ones below are normalised, and the
 * full payload is preserved under {@link ChangeAnalysis.raw}.
 */
export interface ChangeAnalysis {
  /** Symbols touched by the diff (free-form strings as reported by the engine). */
  changedSymbols: string[];
  /** Execution flows / processes affected by the changed symbols. */
  affectedProcesses: string[];
  /** Risk classification of the change set, when the engine provides one. */
  riskLevel: string | null;
  /** Human-readable risk/summary text, when provided. */
  summary: string | null;
  /** The unnormalised backend payload for callers that need full detail. */
  raw: unknown;
}

/** Risk classification returned by the GitNexus `api_impact` tool. */
export type ApiImpactRisk = "LOW" | "MEDIUM" | "HIGH";

/**
 * Pre-change blast-radius / risk report for an API route handler, combining the
 * `route_map`, `shape_check`, and `impact` signals into a single verdict. This
 * is the decision-useful signal AITM agents need at checkpoint / PR time.
 *
 * The structured fields below are normalised from the backend payload; the full
 * (possibly richer) response is preserved under {@link ApiImpactReport.raw}.
 */
export interface ApiImpactReport {
  /** Overall risk level, when the engine provides one (LOW | MEDIUM | HIGH). */
  riskLevel: ApiImpactRisk | null;
  /** Number of distinct route matches in the report. */
  total: number;
  /** Per-route entries (one when a single route matched). */
  routes: ApiImpactRoute[];
  /** The unnormalised backend payload. */
  raw: unknown;
}

/** A single route entry within an {@link ApiImpactReport}. */
export interface ApiImpactRoute {
  method: string;
  path: string;
  handler: string;
  file: string;
  /** Files/components that consume this route. */
  consumers: string[];
  /** Response fields consumers access. */
  accessedFields: string[];
  /** Middleware wrapper chain protecting the route (e.g. withAuth). */
  middleware: string[];
  /** Shape-drift mismatches between the route response and its consumers. */
  mismatches: unknown[];
  /** Per-route risk level when the engine attaches one. */
  riskLevel: ApiImpactRisk | null;
  /** Free-form raw entry for callers needing full detail. */
  raw: unknown;
}

/** A single hop in a {@link TraceResult} path. */
export interface TraceHop {
  symbol: string;
  file: string;
  line: number;
  /** Edge type linking this hop to the next (e.g. "CALLS", "HAS_METHOD"). */
  edge: string | null;
  /** Edge confidence, when provided. */
  confidence: number | null;
}

/** Result of tracing the shortest path between two symbols. */
export interface TraceResult {
  /** Whether a complete path from source to target was found. */
  found: boolean;
  /** Ordered hops from source to target (or to the furthest reachable node). */
  hops: TraceHop[];
  /** True when a traversal cap was hit before exhausting the search. */
  truncated: boolean;
  /** The unnormalised backend payload. */
  raw: unknown;
}

/** A consumer entry within a {@link ShapeCheckEntry}. */
export interface ShapeCheckConsumer {
  file: string;
  /** Response keys this consumer accesses. */
  accessedKeys: string[];
  /** Keys the consumer accesses that the route does not return. */
  missingKeys: string[];
  status: "OK" | "MISMATCH";
}

/** Per-route shape-drift entry from the `shape_check` tool. */
export interface ShapeCheckEntry {
  method: string;
  path: string;
  /** Top-level keys the route returns (e.g. data, pagination, error). */
  responseKeys: string[];
  consumers: ShapeCheckConsumer[];
  status: "OK" | "MISMATCH";
}

/** Result of a `shape_check` run across one or all routes. */
export interface ShapeCheckResult {
  entries: ShapeCheckEntry[];
  /** Count of routes reporting a MISMATCH. */
  mismatchCount: number;
  /** The unnormalised backend payload. */
  raw: unknown;
}

/** Sink category for a taint finding. */
export type TaintCategory =
  | "command-injection"
  | "code-injection"
  | "path-traversal"
  | "sql-injection"
  | "xss"
  | string;

/** A single source→sink taint finding from the `explain` tool. */
export interface TaintFinding {
  category: TaintCategory;
  /** Source location/symbol of the tainted flow. */
  source: string;
  /** Sink location/symbol of the tainted flow. */
  sink: string;
  /** True when the flow crosses function boundaries (TAINT_PATH). */
  interprocedural: boolean;
  /** Ordered hop descriptions of the flow. */
  hops: string[];
  /** The unnormalised finding for callers needing full detail. */
  raw: unknown;
}

/** Result of an `explain` (taint/security) query. */
export interface ExplainResult {
  findings: TaintFinding[];
  /** Total matched findings (may exceed findings.length when truncated). */
  totalFindings: number;
  /** True when the result page is smaller than the full matched set. */
  truncated: boolean;
  /**
   * True when the repo lacks the persisted taint layer (`gitnexus analyze
   * --pdg`). Callers should surface a "no taint layer" hint rather than an
   * empty-but-clean result.
   */
  noTaintLayer: boolean;
  /** The unnormalised backend payload. */
  raw: unknown;
}

// ============================================================================
// Core transport — in-process dispatch (drop-in replacement for the old
// JSON-RPC `callGitNexus`). Same signature and same error-prefix contract
// (`gitNexus: ...`) so the route-level 502 handler keeps working.
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parses a backend result into a plain JSON value. `callTool` may return a
 * pre-formatted string (Markdown/text) or a structured object. When it returns
 * a JSON-parseable string we decode it; otherwise the raw value is returned.
 */
function normalizeResult(result: unknown): unknown {
  if (typeof result !== "string") {
    return result;
  }
  const trimmed = result.trim();
  if (trimmed.length === 0) {
    return result;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return result;
    }
  }
  return result;
}

/**
 * Invokes a GitNexus tool in-process and returns the (normalised) result.
 *
 * Throws a descriptive Error prefixed with `gitNexus:` on backend failure or
 * tool error — preserving the contract that `routes/gitnexus.ts` maps such
 * errors to HTTP 502.
 */
export async function callGitNexus(
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const tool = resolveToolName(method);

  let backend: GitNexusBackend;
  try {
    backend = await getBackend();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`gitNexus: backend init failed calling ${method}: ${msg}`);
  }

  try {
    const result = await backend.callTool(tool, params ?? {});
    return normalizeResult(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`gitNexus: error calling ${method} (${tool}): ${msg}`);
  }
}

// ============================================================================
// Code intelligence helpers
// ============================================================================

/**
 * Analyses the code structure of a workspace.
 * Returns the set of files, modules, and their import/export maps.
 */
export async function analyzeCodeStructure(
  workspacePath: string
): Promise<CodeStructure> {
  const result = await callGitNexus("gn_context", { repo: workspacePath });

  // Validate and normalise the response rather than casting blindly.
  if (isRecord(result)) {
    return {
      files: Array.isArray(result["files"]) ? (result["files"] as string[]) : [],
      modules: Array.isArray(result["modules"])
        ? (result["modules"] as string[])
        : [],
      imports: isRecord(result["imports"])
        ? (result["imports"] as Record<string, string[]>)
        : {},
      exports: isRecord(result["exports"])
        ? (result["exports"] as Record<string, string[]>)
        : {},
    };
  }

  logger.error("gitNexus: unexpected shape from context", undefined, {
    result: String(result),
  });
  return { files: [], modules: [], imports: {}, exports: {} };
}

/**
 * Returns the list of files that transitively depend on `changedFile`.
 */
export async function findImpactedFiles(
  changedFile: string,
  workspacePath: string
): Promise<string[]> {
  const result = await callGitNexus("gn_impact", {
    target: changedFile,
    direction: "upstream",
    repo: workspacePath,
  });

  if (Array.isArray(result)) {
    return result as string[];
  }

  // The `impact` tool returns a structured report; surface its file list when
  // present, otherwise fall back to an empty list rather than throwing.
  if (isRecord(result) && Array.isArray(result["files"])) {
    return result["files"] as string[];
  }

  logger.error("gitNexus: unexpected shape from impact", undefined, {
    result: String(result),
  });
  return [];
}

/**
 * Returns all HTTP route definitions found in the workspace.
 */
export async function getApiRoutes(
  workspacePath: string
): Promise<RouteInfo[]> {
  const result = await callGitNexus("gn_route_map", { repo: workspacePath });

  const rows = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result["routes"])
      ? (result["routes"] as unknown[])
      : null;

  if (rows === null) {
    logger.error("gitNexus: unexpected shape from route_map", undefined, {
      result: String(result),
    });
    return [];
  }

  return rows.filter(isRecord).map((r) => ({
    method: typeof r["method"] === "string" ? r["method"] : "",
    path: typeof r["path"] === "string" ? r["path"] : "",
    handler: typeof r["handler"] === "string" ? r["handler"] : "",
    file: typeof r["file"] === "string" ? r["file"] : "",
  }));
}

/**
 * Builds a full module dependency graph for the workspace.
 */
export async function getDependencyGraph(
  workspacePath: string
): Promise<DependencyGraph> {
  const result = await callGitNexus("gn_dep_graph", {
    statement:
      "MATCH (a:File)-[:IMPORTS]->(b:File) RETURN a.path AS source, b.path AS target",
    repo: workspacePath,
  });

  if (isRecord(result)) {
    const nodes = Array.isArray(result["nodes"])
      ? (result["nodes"] as DependencyNode[])
      : [];
    const edges = Array.isArray(result["edges"])
      ? (result["edges"] as DependencyEdge[])
      : [];
    return { nodes, edges };
  }

  logger.error("gitNexus: unexpected shape from dep_graph", undefined, {
    result: String(result),
  });
  return { nodes: [], edges: [] };
}

/**
 * Searches for symbol definitions (functions, classes, variables, types, etc.)
 * matching `query` within the workspace.
 */
export async function searchSymbols(
  query: string,
  workspacePath: string
): Promise<Symbol[]> {
  const result = await callGitNexus("gn_symbol_search", {
    search_query: query,
    repo: workspacePath,
  });

  const rows = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result["symbols"])
      ? (result["symbols"] as unknown[])
      : isRecord(result) && Array.isArray(result["processes"])
        ? (result["processes"] as unknown[])
        : null;

  if (rows === null) {
    logger.error("gitNexus: unexpected shape from symbol_search", undefined, {
      result: String(result),
    });
    return [];
  }

  const allowedKinds: ReadonlySet<Symbol["kind"]> = new Set([
    "function",
    "class",
    "variable",
    "type",
    "interface",
    "enum",
  ]);

  return rows.filter(isRecord).map((r) => {
    const rawKind = typeof r["kind"] === "string" ? r["kind"] : "function";
    const kind = allowedKinds.has(rawKind as Symbol["kind"])
      ? (rawKind as Symbol["kind"])
      : "function";
    return {
      name: typeof r["name"] === "string" ? r["name"] : "",
      kind,
      file: typeof r["file"] === "string" ? r["file"] : "",
      line: typeof r["line"] === "number" ? r["line"] : 0,
      exported: typeof r["exported"] === "boolean" ? r["exported"] : false,
    };
  });
}

/**
 * Maps a git diff (uncommitted, staged, or compared against a base ref) to the
 * processes it affects and an overall risk summary — the "blast radius" signal
 * AITM needs when an agent checkpoints or opens a PR.
 *
 * Delegates to the GitNexus `detect_changes` tool and normalises its response
 * into {@link ChangeAnalysis}. Returns safe empty defaults (with the raw
 * payload preserved) when the backend returns an unexpected shape.
 */
export async function detectChanges(
  options: DetectChangesOptions = {}
): Promise<ChangeAnalysis> {
  const params: Record<string, unknown> = {
    scope: options.scope ?? "unstaged",
  };
  if (options.baseRef) {
    params["base_ref"] = options.baseRef;
  }
  if (options.worktree) {
    params["worktree"] = options.worktree;
  }
  if (options.repo) {
    params["repo"] = options.repo;
  }

  const result = await callGitNexus("gn_detect_changes", params);

  const empty: ChangeAnalysis = {
    changedSymbols: [],
    affectedProcesses: [],
    riskLevel: null,
    summary: null,
    raw: result,
  };

  if (!isRecord(result)) {
    logger.error("gitNexus: unexpected shape from detect_changes", undefined, {
      result: String(result),
    });
    return empty;
  }

  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.map((v) =>
          typeof v === "string"
            ? v
            : isRecord(v) && typeof v["name"] === "string"
              ? (v["name"] as string)
              : String(v)
        )
      : [];

  const changedSymbols = asStringArray(
    result["changedSymbols"] ?? result["changed_symbols"] ?? result["symbols"]
  );
  const affectedProcesses = asStringArray(
    result["affectedProcesses"] ?? result["affected_processes"] ?? result["processes"]
  );
  const riskLevel =
    typeof result["riskLevel"] === "string"
      ? (result["riskLevel"] as string)
      : typeof result["risk_level"] === "string"
        ? (result["risk_level"] as string)
        : typeof result["risk"] === "string"
          ? (result["risk"] as string)
          : null;
  const summary =
    typeof result["summary"] === "string" ? (result["summary"] as string) : null;

  return { changedSymbols, affectedProcesses, riskLevel, summary, raw: result };
}

// ============================================================================
// Normalisation helpers for the richer code-intelligence reports
// ============================================================================

/** Coerce a value to a string[], mapping objects via a `name`/`file` field. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((v) => {
    if (typeof v === "string") {
      return v;
    }
    if (isRecord(v)) {
      if (typeof v["name"] === "string") return v["name"];
      if (typeof v["file"] === "string") return v["file"];
      if (typeof v["path"] === "string") return v["path"];
    }
    return String(v);
  });
}

function toRisk(value: unknown): ApiImpactRisk | null {
  if (typeof value !== "string") {
    return null;
  }
  const upper = value.toUpperCase();
  return upper === "LOW" || upper === "MEDIUM" || upper === "HIGH"
    ? (upper as ApiImpactRisk)
    : null;
}

function normalizeApiImpactRoute(entry: unknown): ApiImpactRoute {
  if (!isRecord(entry)) {
    return {
      method: "",
      path: "",
      handler: "",
      file: "",
      consumers: [],
      accessedFields: [],
      middleware: [],
      mismatches: [],
      riskLevel: null,
      raw: entry,
    };
  }
  return {
    method: typeof entry["method"] === "string" ? entry["method"] : "",
    path: typeof entry["path"] === "string" ? entry["path"] : "",
    handler: typeof entry["handler"] === "string" ? entry["handler"] : "",
    file: typeof entry["file"] === "string" ? entry["file"] : "",
    consumers: toStringArray(entry["consumers"]),
    accessedFields: toStringArray(
      entry["accessedFields"] ?? entry["accessed_fields"] ?? entry["accessedKeys"]
    ),
    middleware: toStringArray(entry["middleware"]),
    mismatches: Array.isArray(entry["mismatches"]) ? entry["mismatches"] : [],
    riskLevel: toRisk(entry["riskLevel"] ?? entry["risk_level"] ?? entry["risk"]),
    raw: entry,
  };
}

// ============================================================================
// Pre-change blast-radius / risk report (api_impact)
// ============================================================================

/**
 * Produces a pre-change risk report for an API route handler by combining
 * route_map + shape_check + impact via the GitNexus `api_impact` tool. Pass
 * either `route` (path) or `file` (handler file); at least one is required by
 * the backend.
 *
 * The backend returns either a single route object or `{ routes: [...], total }`.
 * Both shapes are normalised into {@link ApiImpactReport}.
 */
export async function apiImpact(params: {
  route?: string;
  file?: string;
  repo?: string;
}): Promise<ApiImpactReport> {
  const toolParams: Record<string, unknown> = {};
  if (params.route) toolParams["route"] = params.route;
  if (params.file) toolParams["file"] = params.file;
  if (params.repo) toolParams["repo"] = params.repo;

  const result = await callGitNexus("gn_api_impact", toolParams);

  if (isRecord(result) && Array.isArray(result["routes"])) {
    const routes = (result["routes"] as unknown[]).map(normalizeApiImpactRoute);
    const total =
      typeof result["total"] === "number" ? result["total"] : routes.length;
    return {
      riskLevel: toRisk(result["riskLevel"] ?? result["risk_level"] ?? result["risk"]),
      total,
      routes,
      raw: result,
    };
  }

  if (isRecord(result)) {
    const route = normalizeApiImpactRoute(result);
    return { riskLevel: route.riskLevel, total: 1, routes: [route], raw: result };
  }

  logger.error("gitNexus: unexpected shape from api_impact", undefined, {
    result: String(result),
  });
  return { riskLevel: null, total: 0, routes: [], raw: result };
}

// ============================================================================
// Shortest call/member path between two symbols (trace)
// ============================================================================

/**
 * Finds the shortest directed path between two symbols over call and
 * class-member edges via the GitNexus `trace` tool. Either a symbol name or a
 * UID may be supplied for each endpoint (UIDs are zero-ambiguity).
 */
export async function traceSymbols(params: {
  from?: string;
  fromUid?: string;
  fromFile?: string;
  to?: string;
  toUid?: string;
  toFile?: string;
  maxDepth?: number;
  includeTests?: boolean;
  repo?: string;
}): Promise<TraceResult> {
  const toolParams: Record<string, unknown> = {};
  if (params.from) toolParams["from"] = params.from;
  if (params.fromUid) toolParams["from_uid"] = params.fromUid;
  if (params.fromFile) toolParams["from_file"] = params.fromFile;
  if (params.to) toolParams["to"] = params.to;
  if (params.toUid) toolParams["to_uid"] = params.toUid;
  if (params.toFile) toolParams["to_file"] = params.toFile;
  if (typeof params.maxDepth === "number") toolParams["maxDepth"] = params.maxDepth;
  if (typeof params.includeTests === "boolean") {
    toolParams["includeTests"] = params.includeTests;
  }
  if (params.repo) toolParams["repo"] = params.repo;

  const result = await callGitNexus("gn_trace", toolParams);

  const empty: TraceResult = { found: false, hops: [], truncated: false, raw: result };

  if (!isRecord(result)) {
    logger.error("gitNexus: unexpected shape from trace", undefined, {
      result: String(result),
    });
    return empty;
  }

  const rawHops = Array.isArray(result["hops"])
    ? (result["hops"] as unknown[])
    : Array.isArray(result["path"])
      ? (result["path"] as unknown[])
      : [];
  const rawEdges = Array.isArray(result["edges"])
    ? (result["edges"] as unknown[])
    : [];

  const hops: TraceHop[] = rawHops.map((hop, index) => {
    const node = isRecord(hop) ? hop : {};
    const edge = isRecord(rawEdges[index]) ? (rawEdges[index] as Record<string, unknown>) : null;
    return {
      symbol:
        typeof node["symbol"] === "string"
          ? node["symbol"]
          : typeof node["name"] === "string"
            ? node["name"]
            : "",
      file: typeof node["file"] === "string" ? node["file"] : "",
      line: typeof node["line"] === "number" ? node["line"] : 0,
      edge:
        edge && typeof edge["type"] === "string"
          ? edge["type"]
          : typeof node["edge"] === "string"
            ? node["edge"]
            : null,
      confidence:
        edge && typeof edge["confidence"] === "number" ? edge["confidence"] : null,
    };
  });

  const found =
    typeof result["found"] === "boolean" ? result["found"] : hops.length > 0;
  const truncated =
    typeof result["truncated"] === "boolean" ? result["truncated"] : false;

  return { found, hops, truncated, raw: result };
}

// ============================================================================
// API response-shape drift (shape_check)
// ============================================================================

function normalizeShapeCheckEntry(entry: unknown): ShapeCheckEntry {
  if (!isRecord(entry)) {
    return { method: "", path: "", responseKeys: [], consumers: [], status: "OK" };
  }
  const consumersRaw = Array.isArray(entry["consumers"])
    ? (entry["consumers"] as unknown[])
    : [];
  const consumers: ShapeCheckConsumer[] = consumersRaw.map((c) => {
    const rec = isRecord(c) ? c : {};
    const missingKeys = toStringArray(rec["missingKeys"] ?? rec["missing_keys"]);
    const status =
      rec["status"] === "MISMATCH" || missingKeys.length > 0 ? "MISMATCH" : "OK";
    return {
      file: typeof rec["file"] === "string" ? rec["file"] : "",
      accessedKeys: toStringArray(rec["accessedKeys"] ?? rec["accessed_keys"]),
      missingKeys,
      status,
    };
  });
  const status =
    entry["status"] === "MISMATCH" ||
    consumers.some((c) => c.status === "MISMATCH")
      ? "MISMATCH"
      : "OK";
  return {
    method: typeof entry["method"] === "string" ? entry["method"] : "",
    path: typeof entry["path"] === "string" ? entry["path"] : "",
    responseKeys: toStringArray(entry["responseKeys"] ?? entry["response_keys"]),
    consumers,
    status,
  };
}

/**
 * Checks API response-shape drift between routes and their consumers via the
 * GitNexus `shape_check` tool, reporting MISMATCH when a consumer accesses keys
 * the route does not return. Pass `route` to scope to one route, or omit to
 * check all routes.
 */
export async function shapeCheck(params: {
  route?: string;
  repo?: string;
}): Promise<ShapeCheckResult> {
  const toolParams: Record<string, unknown> = {};
  if (params.route) toolParams["route"] = params.route;
  if (params.repo) toolParams["repo"] = params.repo;

  const result = await callGitNexus("gn_shape_check", toolParams);

  const rows = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result["routes"])
      ? (result["routes"] as unknown[])
      : isRecord(result) && Array.isArray(result["results"])
        ? (result["results"] as unknown[])
        : null;

  if (rows === null) {
    logger.error("gitNexus: unexpected shape from shape_check", undefined, {
      result: String(result),
    });
    return { entries: [], mismatchCount: 0, raw: result };
  }

  const entries = rows.map(normalizeShapeCheckEntry);
  const mismatchCount = entries.filter((e) => e.status === "MISMATCH").length;
  return { entries, mismatchCount, raw: result };
}

// ============================================================================
// Persisted taint / security findings (explain)
// ============================================================================

function normalizeTaintFinding(entry: unknown): TaintFinding {
  if (!isRecord(entry)) {
    return {
      category: "",
      source: "",
      sink: "",
      interprocedural: false,
      hops: [],
      raw: entry,
    };
  }
  return {
    category: typeof entry["category"] === "string" ? entry["category"] : "",
    source:
      typeof entry["source"] === "string"
        ? entry["source"]
        : typeof entry["sourceFunction"] === "string"
          ? entry["sourceFunction"]
          : "",
    sink:
      typeof entry["sink"] === "string"
        ? entry["sink"]
        : typeof entry["sinkFunction"] === "string"
          ? entry["sinkFunction"]
          : "",
    interprocedural:
      typeof entry["interprocedural"] === "boolean" ? entry["interprocedural"] : false,
    hops: toStringArray(entry["hops"] ?? entry["path"] ?? entry["chain"]),
    raw: entry,
  };
}

/**
 * Returns persisted taint / security findings (source→sink data flows) from the
 * GitNexus `explain` tool. Pass `target` (file path or symbol) to anchor, or
 * omit to enumerate all findings for the repo.
 *
 * Requires the repo to be indexed with `gitnexus analyze --pdg`. When that
 * layer is absent the backend returns a "no taint layer" note rather than an
 * error; this is surfaced via {@link ExplainResult.noTaintLayer}.
 */
export async function explainTaint(params: {
  target?: string;
  limit?: number;
  repo?: string;
}): Promise<ExplainResult> {
  const toolParams: Record<string, unknown> = {};
  if (params.target) toolParams["target"] = params.target;
  if (typeof params.limit === "number") toolParams["limit"] = params.limit;
  if (params.repo) toolParams["repo"] = params.repo;

  const result = await callGitNexus("gn_explain", toolParams);

  // The backend may return a plain note string when the PDG/taint layer is
  // missing. Detect that and surface it explicitly rather than as an error.
  if (typeof result === "string") {
    const noLayer = /no taint layer|--pdg|no pdg layer/i.test(result);
    return {
      findings: [],
      totalFindings: 0,
      truncated: false,
      noTaintLayer: noLayer,
      raw: result,
    };
  }

  if (!isRecord(result)) {
    logger.error("gitNexus: unexpected shape from explain", undefined, {
      result: String(result),
    });
    return {
      findings: [],
      totalFindings: 0,
      truncated: false,
      noTaintLayer: false,
      raw: result,
    };
  }

  const rows = Array.isArray(result["findings"])
    ? (result["findings"] as unknown[])
    : Array.isArray(result["results"])
      ? (result["results"] as unknown[])
      : [];
  const findings = rows.map(normalizeTaintFinding);

  const noteText =
    typeof result["note"] === "string"
      ? result["note"]
      : typeof result["message"] === "string"
        ? result["message"]
        : "";
  const noTaintLayer =
    result["noTaintLayer"] === true ||
    /no taint layer|--pdg|no pdg layer/i.test(noteText);

  const totalFindings =
    typeof result["totalFindings"] === "number"
      ? result["totalFindings"]
      : typeof result["total"] === "number"
        ? result["total"]
        : findings.length;
  const truncated =
    typeof result["truncated"] === "boolean" ? result["truncated"] : false;

  return { findings, totalFindings, truncated, noTaintLayer, raw: result };
}

// ============================================================================
// Availability probe
// ============================================================================

/**
 * Probes the in-process GitNexus backend with a lightweight `list_repos` call.
 * Returns `true` when the backend initialises and responds, `false` in all
 * error cases.
 */
export async function isAvailable(): Promise<boolean> {
  try {
    await callGitNexus("gn_ping");
    return true;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.info("gitNexus: backend not available", { reason: msg });
    return false;
  }
}
