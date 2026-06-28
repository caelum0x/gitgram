/**
 * capture-tools.ts
 *
 * Test helper that captures tool registrations so their `run()` handlers can be
 * invoked directly — the registration-only tests never call handlers, which is
 * exactly the coverage gap these integration tests close.
 *
 * The registrars call `server.tool(name, description, schema, annotations, handler)`.
 * We provide a minimal fake server implementing only `tool()` (and `resource()`
 * as a no-op) so we can collect each tool's metadata and its handler function.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRuntimeContext } from '../../lib/tool-runtime.js';

export interface ToolResponse {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse> | ToolResponse;

export interface CapturedTool {
  name: string;
  description: string;
  schema: unknown;
  annotations: unknown;
  handler: ToolHandler;
}

export interface CaptureResult {
  tools: Map<string, CapturedTool>;
  /** Invoke a captured tool's handler by name. Throws if not registered. */
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResponse>;
}

/**
 * Build a fake McpServer that records `server.tool(...)` calls, run a registrar
 * against it, and return the captured tools plus a `call()` convenience.
 */
export function captureTools(
  register: (server: McpServer, runtime: ToolRuntimeContext) => void,
  runtime: ToolRuntimeContext
): CaptureResult {
  const tools = new Map<string, CapturedTool>();

  const fakeServer = {
    tool(
      name: string,
      description: string,
      schema: unknown,
      annotations: unknown,
      handler: ToolHandler
    ) {
      tools.set(name, { name, description, schema, annotations, handler });
      return undefined;
    },
    resource() {
      return undefined;
    },
  } as unknown as McpServer;

  register(fakeServer, runtime);

  const call = async (name: string, args: Record<string, unknown> = {}): Promise<ToolResponse> => {
    const tool = tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" was not registered`);
    }
    return tool.handler(args);
  };

  return { tools, call };
}

/** Parse the first text content block of a tool response as JSON. */
export function parseJsonResponse<T = unknown>(response: ToolResponse): T {
  const text = response.content.find((c) => c.type === 'text')?.text;
  if (typeof text !== 'string') {
    throw new Error('Tool response had no text content');
  }
  return JSON.parse(text) as T;
}

/** Return the concatenated text of a tool response. */
export function responseText(response: ToolResponse): string {
  return response.content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('\n');
}

/**
 * Normalise the result of `call(...).catch((e) => e)` — which may be either a
 * thrown Error or a returned ToolResponse — into a single string for matching.
 */
export function errorOrText(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (
    value &&
    typeof value === 'object' &&
    'content' in value &&
    Array.isArray((value as ToolResponse).content)
  ) {
    return responseText(value as ToolResponse);
  }
  return String(value);
}

/** A no-op runtime sufficient for handlers that do not touch the AITM core. */
export const stubRuntime: ToolRuntimeContext = {
  getLib: async () => ({}),
  getEngine: () => ({}),
  getSessionServer: () => ({}),
  getCurrentProjectPath: () => '/tmp/test-project',
  setCurrentProjectPath: () => undefined,
  resolveProjectPath: (p?: string) => p ?? '/tmp/test-project',
  resolveLibPath: async () => '/tmp/lib',
};
