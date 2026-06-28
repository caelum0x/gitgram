/**
 * Unit tests for transport-level tool-call argument aliasing.
 *
 * Verifies hallucinated arg names are rewritten to canonical schema keys on
 * incoming `tools/call` messages, that canonical keys always win, and that the
 * transport hook is installed in a non-destructive, first-in-chain way.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  applyAliases,
  normalizeToolCallArguments,
  installTransportArgAliasing,
  GLOBAL_ALIASES,
  TOOL_ALIASES,
} from '../lib/tool-arg-aliasing.js';

function toolsCall(name: string, args: Record<string, unknown>) {
  return { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } };
}

describe('applyAliases', () => {
  it('rewrites a hallucinated alias to its canonical key', () => {
    const args: Record<string, unknown> = { question: 'how do I X?' };
    const rewrites = applyAliases(args, GLOBAL_ALIASES);
    expect(args).toEqual({ query: 'how do I X?' });
    expect(rewrites).toEqual([{ from: 'question', to: 'query' }]);
  });

  it('does not clobber an existing canonical key', () => {
    const args: Record<string, unknown> = { query: 'real', question: 'echo' };
    applyAliases(args, GLOBAL_ALIASES);
    // canonical wins; alias is left as-is (not promoted, not deleted)
    expect(args.query).toBe('real');
    expect(args.question).toBe('echo');
  });

  it('applies only the first matching alias', () => {
    const args: Record<string, unknown> = { userQuery: 'a', question: 'b' };
    applyAliases(args, GLOBAL_ALIASES);
    expect(args.query).toBe('a');
    expect('userQuery' in args).toBe(false);
    // the second alias is untouched once the canonical key is set
    expect(args.question).toBe('b');
  });
});

describe('normalizeToolCallArguments', () => {
  it('applies global aliases on any tool', () => {
    const msg = toolsCall('beads_ready', { userQuery: 'next?' });
    normalizeToolCallArguments(msg);
    expect(msg.params.arguments).toEqual({ query: 'next?' });
  });

  it('applies tool-scoped aliases only for the named tool', () => {
    const msg = toolsCall('tm_docs_query', { libraryName: '/vercel/next.js' });
    normalizeToolCallArguments(msg);
    expect(msg.params.arguments).toEqual({ libraryId: '/vercel/next.js' });
    expect(Object.keys(TOOL_ALIASES)).toContain('tm_docs_query');
  });

  it('leaves libraryName untouched on tm_docs_resolve (canonical there)', () => {
    const msg = toolsCall('tm_docs_resolve', { libraryName: 'next.js' });
    normalizeToolCallArguments(msg);
    expect(msg.params.arguments).toEqual({ libraryName: 'next.js' });
  });

  it('ignores non tools/call messages', () => {
    const msg = { jsonrpc: '2.0', id: 2, method: 'initialize', params: { question: 'x' } };
    const rewrites = normalizeToolCallArguments(msg);
    expect(rewrites).toEqual([]);
    expect((msg.params as Record<string, unknown>).question).toBe('x');
  });

  it('is a no-op when arguments are missing or not an object', () => {
    expect(normalizeToolCallArguments(toolsCall('beads_ready', undefined as never))).toEqual([]);
    const arrMsg = { method: 'tools/call', params: { name: 'x', arguments: [1, 2] } };
    expect(normalizeToolCallArguments(arrMsg)).toEqual([]);
  });
});

describe('installTransportArgAliasing', () => {
  it('rewrites the message before the pre-existing onmessage handler sees it', () => {
    const seen: Array<Record<string, unknown>> = [];
    const transport = {
      onmessage: (m: unknown) => {
        seen.push((m as { params: { arguments: Record<string, unknown> } }).params.arguments);
      },
    } as unknown as Transport;

    installTransportArgAliasing(transport);

    const msg = toolsCall('beads_ready', { question: 'what next?' });
    transport.onmessage?.(msg as never);

    // the chained handler observed the already-normalised arguments
    expect(seen).toEqual([{ query: 'what next?' }]);
  });

  it('installs a handler even when none existed', () => {
    const transport = {} as Transport;
    installTransportArgAliasing(transport);
    expect(typeof transport.onmessage).toBe('function');

    const msg = toolsCall('beads_ready', { userQuery: 'go' });
    expect(() => transport.onmessage?.(msg as never)).not.toThrow();
    expect(msg.params.arguments).toEqual({ query: 'go' });
  });

  it('does not throw when the chained handler is absent and message is unrelated', () => {
    const transport = {} as Transport;
    installTransportArgAliasing(transport);
    const spy = vi.fn();
    transport.onmessage = ((m: unknown) => spy(m)) as Transport['onmessage'];
    // re-install to chain over the spy
    installTransportArgAliasing(transport);
    transport.onmessage?.({ method: 'ping' } as never);
    expect(spy).toHaveBeenCalledOnce();
  });
});
