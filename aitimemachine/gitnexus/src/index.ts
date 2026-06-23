/**
 * GitNexus library entry point.
 *
 * GitNexus historically shipped only a CLI (`bin: dist/cli/index.js`) and an
 * MCP/HTTP server. AITM (api-server + mcp) used to reach the analysis tools
 * over HTTP JSON-RPC (`GITNEXUS_URL/message`). To allow first-party,
 * in-process embedding, this module re-exports the same backend that the
 * HTTP/stdio MCP transports drive — so callers can invoke the analysis tools
 * directly, with zero network hop and identical semantics.
 *
 * The single source of truth for tool dispatch is
 * `LocalBackend.callTool(name, params)` (see `mcp/local/local-backend.ts`),
 * which is exactly what the MCP `tools/call` handler forwards to. Embedding
 * the backend therefore preserves the existing contract bit-for-bit.
 *
 * Usage:
 *   import { createGitNexusBackend } from 'gitnexus';
 *   const backend = await createGitNexusBackend();
 *   const result = await backend.callTool('impact', { target, direction });
 */

import { LocalBackend } from './mcp/local/local-backend.js';

export { LocalBackend } from './mcp/local/local-backend.js';
export type {
  RepoListing,
  ListReposPagination,
  CodebaseContext,
} from './mcp/local/local-backend.js';

export { GITNEXUS_TOOLS } from './mcp/tools.js';
export type { ToolDefinition } from './mcp/tools.js';

/**
 * Result of a single in-process GitNexus tool call.
 *
 * `callTool` returns either a pre-formatted string (Markdown / text) or a
 * structured object, mirroring what the MCP `tools/call` handler serialises.
 */
export type GitNexusToolResult = string | Record<string, unknown> | unknown;

/**
 * A minimal, in-process facade over GitNexus tool dispatch.
 *
 * Embedders depend only on this interface, not on the concrete
 * {@link LocalBackend}. This keeps the public surface stable even if the
 * backend's internal shape changes.
 */
export interface GitNexusBackend {
  /**
   * Invoke a GitNexus tool by name (e.g. `context`, `impact`, `route_map`,
   * `query`, `cypher`). Argument shapes match the published MCP tool schemas.
   */
  callTool(name: string, params: Record<string, unknown>): Promise<GitNexusToolResult>;
  /** List indexed repositories from the global registry. */
  listRepos(): Promise<unknown[]>;
  /** Release pooled database connections. Safe to call multiple times. */
  disconnect(): Promise<void>;
}

/**
 * Construct and initialise a GitNexus backend for in-process use.
 *
 * Mirrors the bootstrap performed by `cli/mcp.ts`: `new LocalBackend()` then
 * `await backend.init()`. The backend discovers repos lazily, so it is safe to
 * create even when no repo has been indexed yet.
 */
export async function createGitNexusBackend(): Promise<GitNexusBackend> {
  const backend = new LocalBackend();
  await backend.init();
  return backend;
}
