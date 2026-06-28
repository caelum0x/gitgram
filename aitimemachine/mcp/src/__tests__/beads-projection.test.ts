/**
 * beads-projection.test.ts
 *
 * Unit tests for the context-efficient output trimming applied to beads_* tool
 * responses: envelope unwrapping, brief/fields/maxDescriptionLength projection,
 * and large-list preview compaction. Also exercises the wiring through the
 * beads tools' run() handlers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  projectBeadsPayload,
  unwrapBeadsData,
  toBrief,
  toBriefDep,
  collapseDepEdges,
  truncateDescription,
  filterFields,
  type CompactedBeadsResult,
} from '../lib/beads-projection.js';
import { registerBeadsTools } from '../tools/register-beads-tools.js';
import {
  captureTools,
  stubRuntime,
  parseJsonResponse,
} from './helpers/capture-tools.js';

const ENVELOPE = (data: unknown) => ({ success: true, data });

function task(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Task ${id}`,
    status: 'open',
    priority: 1,
    description: 'x'.repeat(50),
    ...extra,
  };
}

describe('beads-projection helpers', () => {
  it('unwraps the { success, data } envelope', () => {
    expect(unwrapBeadsData(ENVELOPE([1, 2]))).toEqual([1, 2]);
    expect(unwrapBeadsData({ id: 'bd-1' })).toEqual({ id: 'bd-1' });
  });

  it('toBrief keeps only id/title/status/priority', () => {
    expect(toBrief(task('bd-1', { assignee: 'a', labels: ['x'] }))).toEqual({
      id: 'bd-1',
      title: 'Task bd-1',
      status: 'open',
      priority: 1,
    });
  });

  it('truncateDescription trims long descriptions and is immutable', () => {
    const original = task('bd-1', { description: 'abcdefghij' });
    const trimmed = truncateDescription(original, 4);
    expect(trimmed.description).toBe('abcd...');
    expect(original.description).toBe('abcdefghij');
  });

  it('truncateDescription leaves short/non-string descriptions untouched', () => {
    const short = task('bd-1', { description: 'abc' });
    expect(truncateDescription(short, 10)).toBe(short);
    const none = task('bd-1', { description: undefined });
    expect(truncateDescription(none, 10)).toBe(none);
  });

  it('filterFields projects only requested, present fields', () => {
    expect(filterFields(task('bd-1'), ['id', 'status', 'missing'])).toEqual({
      id: 'bd-1',
      status: 'open',
    });
  });

  it('toBriefDep collapses an edge to id/title/status/priority/dependencyType', () => {
    expect(
      toBriefDep({
        id: 'bd-2',
        title: 'Task bd-2',
        status: 'open',
        priority: 0,
        description: 'x'.repeat(50),
        dependency_type: 'blocks',
      })
    ).toEqual({
      id: 'bd-2',
      title: 'Task bd-2',
      status: 'open',
      priority: 0,
      dependencyType: 'blocks',
    });
  });

  it('toBriefDep reads either dependencyType or dependency_type', () => {
    expect(toBriefDep({ id: 'bd-3', dependencyType: 'related' }).dependencyType).toBe(
      'related'
    );
    expect(toBriefDep({ id: 'bd-4', dependency_type: 'parent-child' }).dependencyType).toBe(
      'parent-child'
    );
  });

  it('collapseDepEdges compacts edges while keeping the task body, immutably', () => {
    const original = task('bd-1', {
      dependencies: [task('bd-2', { dependency_type: 'blocks' })],
      dependents: [task('bd-3', { dependency_type: 'discovered-from' })],
    });
    const collapsed = collapseDepEdges(original);
    expect(collapsed.title).toBe('Task bd-1');
    expect(collapsed.dependencies).toEqual([
      { id: 'bd-2', title: 'Task bd-2', status: 'open', priority: 1, dependencyType: 'blocks' },
    ]);
    expect(collapsed.dependents).toEqual([
      { id: 'bd-3', title: 'Task bd-3', status: 'open', priority: 1, dependencyType: 'discovered-from' },
    ]);
    // input untouched: still the full nested task
    expect((original.dependencies as Array<Record<string, unknown>>)[0].description).toBe(
      'x'.repeat(50)
    );
  });

  it('collapseDepEdges leaves tasks without edge arrays untouched', () => {
    const plain = task('bd-1');
    expect(collapseDepEdges(plain)).toBe(plain);
  });
});

describe('projectBeadsPayload', () => {
  it('returns the payload unchanged when no projection is requested', () => {
    const payload = ENVELOPE([task('bd-1')]);
    expect(projectBeadsPayload(payload)).toBe(payload);
  });

  it('applies brief projection to a list and unwraps the envelope', () => {
    const result = projectBeadsPayload(ENVELOPE([task('bd-1'), task('bd-2')]), {
      brief: true,
    });
    expect(result).toEqual([
      { id: 'bd-1', title: 'Task bd-1', status: 'open', priority: 1 },
      { id: 'bd-2', title: 'Task bd-2', status: 'open', priority: 1 },
    ]);
  });

  it('applies fields projection to a single task', () => {
    const result = projectBeadsPayload(ENVELOPE(task('bd-9')), {
      fields: ['id', 'title'],
    });
    expect(result).toEqual({ id: 'bd-9', title: 'Task bd-9' });
  });

  it('truncates descriptions before shaping', () => {
    const result = projectBeadsPayload(ENVELOPE(task('bd-1')), {
      maxDescriptionLength: 5,
    }) as Record<string, unknown>;
    expect(result.description).toBe('xxxxx...');
  });

  it('compacts lists longer than the threshold to a preview + count', () => {
    const tasks = Array.from({ length: 30 }, (_, i) => task(`bd-${i}`));
    const result = projectBeadsPayload(ENVELOPE(tasks), {
      brief: true,
      compactionThreshold: 10,
      previewCount: 3,
      listLabel: 'ready tasks',
    }) as CompactedBeadsResult;
    expect(result.compacted).toBe(true);
    expect(result.totalCount).toBe(30);
    expect(result.previewCount).toBe(3);
    expect(result.preview).toHaveLength(3);
    expect(result.hint).toContain('ready tasks');
  });

  it('briefDeps keeps the full task but collapses its dependency edges', () => {
    const payload = ENVELOPE(
      task('bd-1', {
        dependencies: [task('bd-2', { dependency_type: 'blocks' })],
        dependents: [task('bd-3', { dependency_type: 'related' })],
      })
    );
    const result = projectBeadsPayload(payload, { briefDeps: true }) as Record<
      string,
      unknown
    >;
    // full task body retained
    expect(result.title).toBe('Task bd-1');
    expect(result.description).toBe('x'.repeat(50));
    // edges collapsed to the brief dep shape
    expect(result.dependencies).toEqual([
      { id: 'bd-2', title: 'Task bd-2', status: 'open', priority: 1, dependencyType: 'blocks' },
    ]);
    expect(result.dependents).toEqual([
      { id: 'bd-3', title: 'Task bd-3', status: 'open', priority: 1, dependencyType: 'related' },
    ]);
  });

  it('brief takes precedence over briefDeps (edges dropped entirely)', () => {
    const result = projectBeadsPayload(
      ENVELOPE(task('bd-1', { dependencies: [task('bd-2')] })),
      { brief: true, briefDeps: true }
    );
    expect(result).toEqual({
      id: 'bd-1',
      title: 'Task bd-1',
      status: 'open',
      priority: 1,
    });
  });

  it('passes stats-style payloads (non-list, non-record) through', () => {
    expect(projectBeadsPayload(ENVELOPE(42), { brief: true })).toBe(42);
  });
});

describe('beads tools wiring (projection args)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
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

  it('beads_list_tasks with brief returns trimmed tasks', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk(ENVELOPE([task('bd-1', { assignee: 'me' })]))
    );
    const { call } = captureTools(registerBeadsTools, stubRuntime);
    const result = parseJsonResponse<unknown[]>(
      await call('beads_list_tasks', { brief: true })
    );
    expect(result).toEqual([
      { id: 'bd-1', title: 'Task bd-1', status: 'open', priority: 1 },
    ]);
  });

  it('beads_claim issues a PUT to /beads/tasks/:id/claim', async () => {
    const claimed = task('bd-7', { assignee: 'aitm', status: 'in_progress' });
    fetchMock.mockResolvedValueOnce(jsonOk(ENVELOPE(claimed)));
    const { call } = captureTools(registerBeadsTools, stubRuntime);
    const result = parseJsonResponse<{ success: boolean; data: unknown }>(
      await call('beads_claim', { id: 'bd-7' })
    );
    // round-trips the claimed task envelope back to the caller
    expect(result).toEqual(ENVELOPE(claimed));
    // verify the request shape: PUT to the claim endpoint
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/beads/tasks/bd-7/claim');
    expect(init.method).toBe('PUT');
  });

  it('beads_claim with brief trims the claimed task', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk(ENVELOPE(task('bd-8', { assignee: 'aitm', status: 'in_progress' })))
    );
    const { call } = captureTools(registerBeadsTools, stubRuntime);
    const result = parseJsonResponse<unknown>(
      await call('beads_claim', { id: 'bd-8', brief: true })
    );
    expect(result).toEqual({
      id: 'bd-8',
      title: 'Task bd-8',
      status: 'in_progress',
      priority: 1,
    });
  });

  it('beads_list_tasks without args preserves the full envelope', async () => {
    const payload = ENVELOPE([task('bd-1')]);
    fetchMock.mockResolvedValueOnce(jsonOk(payload));
    const { call } = captureTools(registerBeadsTools, stubRuntime);
    const result = parseJsonResponse<typeof payload>(
      await call('beads_list_tasks')
    );
    expect(result).toEqual(payload);
  });
});
