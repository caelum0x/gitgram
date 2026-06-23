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
  // Bare aliases (idempotent passthrough).
  context: "context",
  impact: "impact",
  route_map: "route_map",
  dep_graph: "cypher",
  symbol_search: "query",
  ping: "list_repos",
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
