/**
 * http-transport.test.ts
 *
 * True E2E tests for the Streamable-HTTP transport. A real Express server is
 * started on an ephemeral port and exercised over the wire with supertest:
 *
 *   - GET  /health                          -> health payload
 *   - GET  /.well-known/agent-card.json     -> A2A agent card
 *   - GET  /a2a                             -> agent card (defensive alias)
 *   - POST /a2a (agent/card)                -> card via JSON-RPC
 *   - POST /a2a (message/send)              -> completed task round-trip that
 *                                              actually invokes a registered MCP
 *                                              tool through /mcp (regression test
 *                                              for the A2A skill dispatch path)
 *   - POST /mcp (tools/list, tools/call)    -> MCP protocol round-trip
 *   - GET  /does-not-exist                  -> 404 envelope
 *
 * This is the http-transport supertest coverage the registration-only suite
 * lacked, and it round-trips a real tool handler end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { startHttpTransport } from '../http-transport.js';
import { createServer, type Server as HttpServer } from 'http';

/**
 * Reserve a free TCP port by briefly binding to port 0, then releasing it.
 * The transport derives its self-call URL (`http://127.0.0.1:<port>/mcp`) from
 * the port it is given, so we must pass a concrete port — not 0.
 */
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

/** Build an McpServer with a real, lib-free tool whose name is an A2A skill. */
function buildTestMcpServer(): McpServer {
  const server = new McpServer({ name: 'test-aitm-mcp', version: '2.0.0' });

  // `tm_diff` maps to the A2A skill id "diff". A lib-free handler lets us
  // round-trip message/send -> /mcp -> tool -> completed task without the
  // AITM core engine.
  server.tool(
    'tm_diff',
    'Diff two checkpoints (test stub).',
    {
      fromCheckpointId: z.string().optional(),
      toCheckpointId: z.string().optional(),
    },
    { readOnlyHint: true },
    async (args: { fromCheckpointId?: string; toCheckpointId?: string }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ diffed: true, from: args.fromCheckpointId, to: args.toCheckpointId }),
        },
      ],
    })
  );

  return server;
}

describe('HTTP transport (E2E over the wire)', () => {
  let httpServer: HttpServer;
  let shutdown: () => Promise<void>;
  let baseUrl: string;

  beforeAll(async () => {
    const port = await getFreePort();
    const result = await startHttpTransport({ port, mcpServer: buildTestMcpServer() });
    httpServer = result.httpServer;
    shutdown = result.shutdown;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await shutdown();
  });

  it('GET /health returns an ok status payload', async () => {
    const res = await request(baseUrl).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.transport).toBe('streamable-http');
  });

  it('GET /.well-known/agent-card.json returns a valid agent card', async () => {
    const res = await request(baseUrl).get('/.well-known/agent-card.json');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('AITimeMachine');
    expect(res.body.protocolVersion).toBe('0.3.0');
    expect(Array.isArray(res.body.skills)).toBe(true);
    // The card's `url` is the JSON-RPC endpoint, ending in /a2a.
    expect(res.body.url).toMatch(/\/a2a$/);
  });

  it('GET /a2a serves the agent card (defensive alias, regression for card-fetch bug)', async () => {
    const res = await request(baseUrl).get('/a2a');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('AITimeMachine');
    expect(res.body.url).toMatch(/\/a2a$/);
  });

  it('POST /a2a agent/card returns the card via JSON-RPC', async () => {
    const res = await request(baseUrl)
      .post('/a2a')
      .send({ jsonrpc: '2.0', id: 1, method: 'agent/card' });
    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe('2.0');
    expect(res.body.id).toBe(1);
    expect(res.body.result.name).toBe('AITimeMachine');
  });

  it('POST /a2a message/send round-trips a real MCP tool into a completed task', async () => {
    const res = await request(baseUrl)
      .post('/a2a')
      .send({
        jsonrpc: '2.0',
        id: 42,
        method: 'message/send',
        params: {
          message: {
            kind: 'message',
            messageId: 'msg-1',
            role: 'user',
            parts: [{ kind: 'text', text: 'diff please' }],
          },
          metadata: { skillId: 'diff', fromCheckpointId: 'a', toCheckpointId: 'b' },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe('2.0');
    expect(res.body.id).toBe(42);
    const task = res.body.result;
    expect(task.kind).toBe('task');
    expect(task.status.state).toBe('completed');
    // The tool's output flows into the task artifact.
    const artifactText = task.artifacts?.[0]?.parts?.[0]?.text ?? '';
    expect(artifactText).toContain('"diffed":true');
    expect(artifactText).toContain('"from":"a"');
  });

  it('POST /a2a message/send without a skillId returns an actionable error', async () => {
    const res = await request(baseUrl)
      .post('/a2a')
      .send({
        jsonrpc: '2.0',
        id: 7,
        method: 'message/send',
        params: {
          message: {
            kind: 'message',
            messageId: 'msg-2',
            role: 'user',
            parts: [{ kind: 'text', text: 'no skill' }],
          },
        },
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(-32602);
    expect(res.body.error.data.availableSkills).toContain('diff');
  });

  it('POST /mcp lists registered tools', async () => {
    const res = await request(baseUrl)
      .post('/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set('content-type', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

    expect(res.status).toBe(200);
    const parsed = parseMcpBody(res.text);
    const names = parsed.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('tm_diff');
  });

  it('POST /mcp calls a tool and returns its content', async () => {
    const res = await request(baseUrl)
      .post('/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set('content-type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'tm_diff', arguments: { fromCheckpointId: 'x', toCheckpointId: 'y' } },
      });

    expect(res.status).toBe(200);
    const parsed = parseMcpBody(res.text);
    const text = parsed.result.content[0].text as string;
    expect(text).toContain('"diffed":true');
    expect(text).toContain('"from":"x"');
  });

  it('GET unknown route returns a 404 envelope', async () => {
    const res = await request(baseUrl).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

/**
 * The /mcp endpoint may answer as JSON or as an SSE stream depending on the
 * SDK. Normalise both into the parsed JSON-RPC response object.
 */
function parseMcpBody(raw: string): { result: { tools?: Array<{ name: string }>; content?: Array<{ text?: string }> } } {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  const dataLines = trimmed
    .split(/\n\n+/)
    .map((block) =>
      block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
    )
    .filter(Boolean);
  return JSON.parse(dataLines[dataLines.length - 1]);
}
