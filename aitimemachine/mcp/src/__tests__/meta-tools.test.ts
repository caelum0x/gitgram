/**
 * meta-tools.test.ts
 *
 * Tests the callable discovery catalog (tm_discover_tools / tm_get_tool_info)
 * and the underlying tool-catalog projection of zod schemas into parameter
 * descriptions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  recordTool,
  resetCatalog,
  getCatalogSummary,
  getToolInfo,
  getCatalogToolNames,
} from '../lib/tool-catalog.js';
import { readOnlyAnnotations, mutatingAnnotations } from '../lib/tool-annotations.js';
import { registerMetaTools } from '../tools/register-meta-tools.js';
import {
  captureTools,
  stubRuntime,
  parseJsonResponse,
} from './helpers/capture-tools.js';

beforeEach(() => {
  resetCatalog();
});

describe('tool-catalog', () => {
  it('records tools and exposes a name->description summary', () => {
    recordTool({
      name: 'demo_tool',
      description: 'A demo tool',
      schema: { foo: z.string() },
      annotations: readOnlyAnnotations(),
    });
    expect(getCatalogSummary()).toEqual({ demo_tool: 'A demo tool' });
  });

  it('derives parameter type, required flag, and description from the zod schema', () => {
    recordTool({
      name: 'demo_tool',
      description: 'A demo tool',
      schema: {
        id: z.string().describe('The id'),
        limit: z.number().int().optional().describe('Max results'),
        mode: z.enum(['a', 'b']).optional(),
        tags: z.array(z.string()).optional(),
      },
      annotations: mutatingAnnotations(),
    });

    const info = getToolInfo('demo_tool');
    expect(info).not.toBeNull();
    const params = info!.parameters;
    const byName = Object.fromEntries(params.map((p) => [p.name, p]));

    expect(byName.id).toMatchObject({ type: 'string', required: true, description: 'The id' });
    expect(byName.limit).toMatchObject({ required: false, description: 'Max results' });
    expect(byName.mode.type).toContain('enum(a|b)');
    expect(byName.tags.type).toContain('array');
    expect(info!.readOnly).toBe(false);
    expect(info!.destructive).toBe(false);
  });

  it('returns null for an unknown tool', () => {
    expect(getToolInfo('does_not_exist')).toBeNull();
  });
});

describe('meta-tools handlers', () => {
  it('tm_discover_tools returns the catalog summary and count', async () => {
    recordTool({
      name: 'demo_tool',
      description: 'A demo tool',
      schema: {},
      annotations: readOnlyAnnotations(),
    });
    const { call } = captureTools(registerMetaTools, stubRuntime);
    const result = parseJsonResponse<{
      tools: Record<string, string>;
      count: number;
      hint: string;
    }>(await call('tm_discover_tools'));
    expect(result.tools.demo_tool).toBe('A demo tool');
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.hint).toContain('tm_get_tool_info');
  });

  it('tm_get_tool_info returns full detail plus a curated example', async () => {
    recordTool({
      name: 'beads_ready',
      description: 'Query ready work',
      schema: { limit: z.number().int().optional() },
      annotations: readOnlyAnnotations(),
    });
    const { call } = captureTools(registerMetaTools, stubRuntime);
    const result = parseJsonResponse<{
      name: string;
      parameters: unknown[];
      example?: string;
    }>(await call('tm_get_tool_info', { name: 'beads_ready' }));
    expect(result.name).toBe('beads_ready');
    expect(result.parameters).toHaveLength(1);
    expect(result.example).toContain('beads_ready(');
  });

  it('tm_get_tool_info reports unknown tools with the available list', async () => {
    recordTool({
      name: 'known_tool',
      description: 'Known',
      schema: {},
      annotations: readOnlyAnnotations(),
    });
    const { call } = captureTools(registerMetaTools, stubRuntime);
    const result = parseJsonResponse<{
      error: string;
      availableTools: string[];
    }>(await call('tm_get_tool_info', { name: 'ghost' }));
    expect(result.error).toContain('ghost');
    expect(result.availableTools).toEqual(getCatalogToolNames());
  });
});
