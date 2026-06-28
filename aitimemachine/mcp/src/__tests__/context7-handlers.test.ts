/**
 * context7-handlers.test.ts
 *
 * Handler-level tests for the Context7 docs tools with the SDK mocked. These
 * verify the run() handlers invoke the SDK correctly, that the removed (no-op)
 * `tokens` parameter is gone from every schema, and that the import-scanning
 * tool resolves + queries each detected package.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the SDK before importing the registrar so getClient() picks up the mock.
const getContext = vi.fn();
const searchLibrary = vi.fn();

vi.mock('@upstash/context7-sdk', () => {
  class Context7 {
    getContext = getContext;
    searchLibrary = searchLibrary;
  }
  return { Context7 };
});

import { registerContext7Tools } from '../tools/register-context7-tools.js';
import { captureTools, stubRuntime, parseJsonResponse } from './helpers/capture-tools.js';

const prevKey = process.env.CONTEXT7_API_KEY;

beforeEach(() => {
  process.env.CONTEXT7_API_KEY = 'test-key';
  getContext.mockReset();
  searchLibrary.mockReset();
});
afterEach(() => {
  if (prevKey === undefined) delete process.env.CONTEXT7_API_KEY;
  else process.env.CONTEXT7_API_KEY = prevKey;
});

describe('Context7 docs tools', () => {
  it('tm_docs_resolve calls searchLibrary and returns the libraries', async () => {
    searchLibrary.mockResolvedValueOnce([{ id: '/facebook/react', name: 'React' }]);
    const { call } = captureTools(registerContext7Tools, stubRuntime);
    const result = parseJsonResponse<Array<{ id: string }>>(
      await call('tm_docs_resolve', { libraryName: 'react' })
    );
    expect(result[0].id).toBe('/facebook/react');
    expect(searchLibrary).toHaveBeenCalledWith('react', 'react', { type: 'json' });
  });

  it('tm_docs_query calls getContext with query + libraryId only (no tokens)', async () => {
    getContext.mockResolvedValueOnce([{ title: 'Docs', content: '...', source: 's' }]);
    const { call } = captureTools(registerContext7Tools, stubRuntime);
    await call('tm_docs_query', { libraryId: '/facebook/react', query: 'hooks' });
    expect(getContext).toHaveBeenCalledWith('hooks', '/facebook/react', { type: 'json' });
    // The SDK signature has no token argument; ensure none was smuggled in.
    expect(getContext.mock.calls[0]).toHaveLength(3);
  });

  it('every docs tool schema omits the removed no-op "tokens" field', () => {
    const { tools } = captureTools(registerContext7Tools, stubRuntime);
    for (const [name, tool] of tools) {
      const shape = tool.schema as Record<string, unknown>;
      expect(Object.keys(shape), `${name} should not expose tokens`).not.toContain('tokens');
    }
  });

  it('tm_docs_compare_versions issues a scoped retrieval query', async () => {
    getContext.mockResolvedValueOnce([]);
    const { call } = captureTools(registerContext7Tools, stubRuntime);
    await call('tm_docs_compare_versions', {
      libraryId: '/facebook/react',
      fromVersion: '18.0.0',
      toVersion: '19.0.0',
    });
    const [query, libId] = getContext.mock.calls[0];
    expect(libId).toBe('/facebook/react');
    expect(String(query)).toMatch(/18\.0\.0/);
    expect(String(query)).toMatch(/19\.0\.0/);
  });

  it('tm_docs_for_imports resolves and queries each detected package', async () => {
    searchLibrary.mockResolvedValue([{ id: '/lib/id', name: 'lib' }]);
    getContext.mockResolvedValue([{ title: 'D', content: 'c', source: 's' }]);
    const { call } = captureTools(registerContext7Tools, stubRuntime);

    const result = parseJsonResponse<Record<string, unknown>>(
      await call('tm_docs_for_imports', {
        source: `import React from 'react';\nimport { z } from 'zod';\nimport local from './local';`,
      })
    );
    // Relative import skipped; react + zod resolved.
    expect(Object.keys(result).sort()).toEqual(['react', 'zod']);
    expect(searchLibrary).toHaveBeenCalledTimes(2);
  });
});
