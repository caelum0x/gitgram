/**
 * proxy-handlers.test.ts
 *
 * Handler-level integration tests for the HTTP-proxy tool groups (workspace,
 * beads, github). These invoke the real run() handlers with a mocked global
 * fetch so the request shaping, response parsing, and — critically — the
 * actionable "API server unreachable" error paths are all exercised.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerWorkspaceTools } from '../tools/register-workspace-tools.js';
import { registerBeadsTools } from '../tools/register-beads-tools.js';
import { registerGitHubTools } from '../tools/register-github-tools.js';
import { captureTools, stubRuntime, parseJsonResponse } from './helpers/capture-tools.js';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('Workspace tools (HTTP proxy)', () => {
  let fetchMock: FetchMock;
  const prevApiKey = process.env.AITM_API_KEY;

  beforeEach(() => {
    delete process.env.AITM_API_KEY;
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevApiKey === undefined) delete process.env.AITM_API_KEY;
    else process.env.AITM_API_KEY = prevApiKey;
  });

  it('ws_files GETs /workspace/files and returns the parsed list', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk(['src/a.ts', 'src/b.ts']));
    const { call } = captureTools(registerWorkspaceTools, stubRuntime);
    const result = parseJsonResponse<string[]>(await call('ws_files'));
    expect(result).toEqual(['src/a.ts', 'src/b.ts']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/workspace\/files$/);
  });

  it('ws_files sends the X-API-Key header when AITM_API_KEY is configured', async () => {
    process.env.AITM_API_KEY = 'aitm_test_key';
    fetchMock.mockResolvedValueOnce(jsonOk([]));
    const { call } = captureTools(registerWorkspaceTools, stubRuntime);
    await call('ws_files');
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe('aitm_test_key');
  });

  it('ws_files omits X-API-Key when no AITM_API_KEY is configured', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk([]));
    const { call } = captureTools(registerWorkspaceTools, stubRuntime);
    await call('ws_files');
    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-API-Key']).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('ws_files surfaces an actionable 401 message naming AITM_API_KEY', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({ error: 'Missing API key' }),
      text: async () => '{"error":"Missing API key"}',
    } as unknown as Response);
    const { call } = captureTools(registerWorkspaceTools, stubRuntime);
    const message = await call('ws_files').then(
      () => '',
      (e: unknown) => (e instanceof Error ? e.message : String(e))
    );
    expect(message).toMatch(/401/);
    expect(message).toMatch(/AITM_API_KEY/);
  });

  it('ws_search POSTs the query body to /workspace/search', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk(['hit.ts']));
    const { call } = captureTools(registerWorkspaceTools, stubRuntime);
    const result = parseJsonResponse<string[]>(await call('ws_search', { query: 'TODO' }));
    expect(result).toEqual(['hit.ts']);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ query: 'TODO' });
  });

  it('ws_files surfaces an actionable error when the API server is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const { call } = captureTools(registerWorkspaceTools, stubRuntime);
    const message = await call('ws_files').then(
      () => '',
      (e: unknown) => (e instanceof Error ? e.message : String(e))
    );
    expect(message).toMatch(/Could not reach the AITM API server/);
    expect(message).toMatch(/AITM_API_URL/);
  });
});

describe('Beads tools (HTTP proxy)', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('beads_create_task POSTs to /beads/tasks', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ id: 'bd-1', title: 'do it' }));
    const { call } = captureTools(registerBeadsTools, stubRuntime);
    const result = parseJsonResponse<{ id: string }>(
      await call('beads_create_task', { title: 'do it' })
    );
    expect(result.id).toBe('bd-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/beads\/tasks$/);
    expect((init as RequestInit).method).toBe('POST');
  });

  it('beads_create_task sends the X-API-Key header when configured', async () => {
    const prev = process.env.AITM_API_KEY;
    process.env.AITM_API_KEY = 'aitm_beads_key';
    try {
      fetchMock.mockResolvedValueOnce(jsonOk({ id: 'bd-2' }));
      const { call } = captureTools(registerBeadsTools, stubRuntime);
      await call('beads_create_task', { title: 'x' });
      const [, init] = fetchMock.mock.calls[0];
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['X-API-Key']).toBe('aitm_beads_key');
    } finally {
      if (prev === undefined) delete process.env.AITM_API_KEY;
      else process.env.AITM_API_KEY = prev;
    }
  });

  it('beads_mark_done PUTs /beads/tasks/:id/done', async () => {
    fetchMock.mockResolvedValueOnce(jsonOk({ id: 'bd-1', status: 'done' }));
    const { call } = captureTools(registerBeadsTools, stubRuntime);
    await call('beads_mark_done', { id: 'bd-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/beads\/tasks\/bd-1\/done$/);
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('beads_list_tasks surfaces an actionable error when the API server is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const { call } = captureTools(registerBeadsTools, stubRuntime);
    await expect(call('beads_list_tasks')).rejects.toThrow(
      /Could not reach the AITM API server/
    );
  });
});

describe('GitHub tools (HTTP proxy)', () => {
  let fetchMock: FetchMock;
  const prevToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = prevToken;
  });

  it('github_get_repo authenticates with the token and shapes the response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'X-RateLimit-Remaining': '4999' }),
      text: async () =>
        JSON.stringify({ full_name: 'octo/repo', stargazers_count: 10, language: 'TypeScript' }),
    } as unknown as Response);

    const { call } = captureTools(registerGitHubTools, stubRuntime);
    const result = parseJsonResponse<{ data: { fullName: string; stars: number } }>(
      await call('github_get_repo', { owner: 'octo', repo: 'repo' })
    );
    expect(result.data.fullName).toBe('octo/repo');
    expect(result.data.stars).toBe(10);

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
  });

  it('github_get_repo raises a descriptive error on HTTP failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      text: async () => JSON.stringify({ message: 'Not Found' }),
    } as unknown as Response);

    const { call } = captureTools(registerGitHubTools, stubRuntime);
    await expect(call('github_get_repo', { owner: 'octo', repo: 'nope' })).rejects.toThrow(
      /HTTP 404/
    );
  });
});
