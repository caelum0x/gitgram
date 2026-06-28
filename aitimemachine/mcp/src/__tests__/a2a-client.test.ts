/**
 * a2a-client.test.ts
 *
 * Regression + E2E test for the A2A client tools (a2a_send_task / a2a_get_task)
 * pointed at AITM's OWN A2A server (the http transport).
 *
 * This is the test the card-path bug evaded: the client must fetch the agent
 * card from the well-known path, read the JSON-RPC endpoint from the card, and
 * round-trip a task. Before the fix, `createClient` fetched the card from
 * `<url>/a2a` (a POST-only route) and failed with
 * "Failed to fetch Agent Card from .../a2a: 404 Not Found".
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { startHttpTransport } from '../http-transport.js';
import { registerA2ATools } from '../tools/register-a2a-tools.js';
import { captureTools, stubRuntime, parseJsonResponse, errorOrText } from './helpers/capture-tools.js';
import { createServer, type Server as HttpServer } from 'http';

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('could not acquire port')));
      }
    });
  });
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'test-aitm-mcp', version: '2.0.0' });
  // `tm_diff` backs the A2A skill "diff" so message/send completes a real task.
  server.tool(
    'tm_diff',
    'Diff two checkpoints (test stub).',
    { fromCheckpointId: z.string().optional(), toCheckpointId: z.string().optional() },
    { readOnlyHint: true },
    async () => ({ content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }] })
  );
  return server;
}

describe('A2A client tools against AITM A2A server', () => {
  let httpServer: HttpServer;
  let shutdown: () => Promise<void>;
  let agentUrl: string;
  const { call } = captureTools(registerA2ATools, stubRuntime);

  beforeAll(async () => {
    const port = await getFreePort();
    const result = await startHttpTransport({ port, mcpServer: buildMcpServer() });
    httpServer = result.httpServer;
    shutdown = result.shutdown;
    agentUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await shutdown();
  });

  it('a2a_send_task fetches the card from the well-known path and completes a task', async () => {
    // skillId is carried via metadata; the A2A server maps it to the MCP tool.
    const response = await call('a2a_send_task', {
      agentUrl,
      taskId: 'task-123',
      message: 'please diff',
      metadata: { skillId: 'diff' },
    });

    const envelope = parseJsonResponse<{
      jsonrpc?: string;
      result?: { kind?: string; status?: { state?: string } };
      error?: unknown;
    }>(response);
    // The SDK returns the full JSON-RPC envelope; the Task lives under `result`.
    expect(envelope.jsonrpc).toBe('2.0');
    expect(envelope.error).toBeUndefined();
    expect(envelope.result?.kind).toBe('task');
    expect(envelope.result?.status?.state).toBe('completed');
  });

  it('a2a_send_task surfaces a skill error (not a 404 card-fetch error) for unknown skills', async () => {
    const response = await call('a2a_send_task', {
      agentUrl,
      taskId: 'task-404',
      message: 'no such skill',
      metadata: { skillId: 'definitely-not-a-skill' },
    }).catch((err: unknown) => err);

    // Whether the SDK throws or returns an error result, the failure must be
    // about the unknown skill — NOT "Failed to fetch Agent Card ... 404".
    const text = errorOrText(response);
    expect(text).not.toMatch(/Failed to fetch Agent Card/i);
  });

  it('a2a_get_task does not fail with a card-fetch 404 (server scope returns an A2A error)', async () => {
    // The AITM A2A server does not implement tasks/get; the SDK should still
    // have fetched the card successfully and then surface a method-level error.
    const response = await call('a2a_get_task', {
      agentUrl,
      taskId: 'task-123',
    }).catch((err: unknown) => err);

    const text = errorOrText(response);
    expect(text).not.toMatch(/Failed to fetch Agent Card/i);
  });

  it('a2a_list_agents reports an actionable error when the registry endpoint is absent', async () => {
    // The http transport has no /a2a/agents route, so this 404s with a clear message.
    const response = await call('a2a_list_agents', { registryUrl: agentUrl }).catch(
      (err: unknown) => err
    );
    const text = errorOrText(response);
    expect(text).toMatch(/a2a\/agents/);
  });
});
