/**
 * integration.test.ts
 *
 * Integration tests for the AITM MCP server tool registrations.
 *
 * These tests build a real McpServer, run each registrar against it, and then
 * inspect the resulting `_registeredTools` map. They validate that every
 * expected tool is registered with the metadata the MCP protocol requires
 * (name, description, inputSchema) — WITHOUT contacting any external service.
 *
 * External dependencies (PAL, the AITM API server, GitNexus) are never reached:
 * registrars only build tool definitions at import/registration time; the
 * network `fetch` calls live inside `run()` handlers which these tests do not
 * invoke. We still point the relevant *_URL env vars at an unused port as a
 * defensive guard.
 *
 * Schema introspection note:
 *   The MCP SDK (@modelcontextprotocol/sdk ^1.25.1) stores a tool's Zod schema
 *   on `entry.inputSchema`. Non-empty schemas surface as a classic ZodObject
 *   (`_def.shape()` / `_def.typeName === 'ZodObject'`); empty schemas (`{}`)
 *   surface as a Zod-mini object (`.def.shape` / `.def.type === 'object'`).
 *   `introspectObject()` normalises both into `{ type, shape, required }`.
 *
 * Run with: vitest run src/__tests__/integration.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRuntimeContext } from '../lib/tool-runtime.js';
// Statically import the GitNexus registrar so its heavy `gitnexus` package
// dependency (native DB + parsers, ~8s cold load) is resolved once during file
// import — NOT inside a per-test `beforeEach` hook where it would exceed the
// 15s hookTimeout and cause the hook to abort mid-registration (which then
// surfaced as a spurious "Tool gn_list_repos is already registered" cascade).
import { registerGitNexusTools } from '../tools/register-gitnexus-tools.js';

// ---------------------------------------------------------------------------
// Minimal ToolRuntimeContext — satisfies the interface for registrars that
// never touch the AITM core library during registration (all of the ones
// exercised here). Handlers are not invoked, so stubs are sufficient.
// ---------------------------------------------------------------------------

const mockRuntime: ToolRuntimeContext = {
  getLib: async () => ({}),
  getEngine: () => ({}),
  getSessionServer: () => ({}),
  getCurrentProjectPath: () => '/tmp/test-project',
  setCurrentProjectPath: () => undefined,
  resolveProjectPath: (p?: string) => p ?? '/tmp/test-project',
  resolveLibPath: async () => '/tmp/lib',
};

// ---------------------------------------------------------------------------
// McpServer introspection helpers
// ---------------------------------------------------------------------------

interface RegisteredToolEntry {
  description?: string;
  inputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

function buildServer(): McpServer {
  return new McpServer({ name: 'test-aitm-mcp', version: '2.0.0' });
}

function toolMap(server: McpServer): Record<string, RegisteredToolEntry> {
  return (server as unknown as { _registeredTools: Record<string, RegisteredToolEntry> })
    ._registeredTools;
}

function registeredToolNames(server: McpServer): string[] {
  return Object.keys(toolMap(server)).sort();
}

function getToolEntry(server: McpServer, name: string): RegisteredToolEntry | undefined {
  return toolMap(server)[name];
}

interface ObjectSchemaInfo {
  /** Normalised schema kind — 'object' for both classic and mini Zod objects. */
  type: string | undefined;
  /** Field-name -> Zod field definition. */
  shape: Record<string, unknown>;
  /** Names of non-optional (required) fields. */
  required: string[];
}

/** True for ZodOptional / ZodDefault wrappers in either classic or mini form. */
function isOptionalField(field: unknown): boolean {
  let classicDef: { typeName?: string } | undefined;
  try {
    classicDef = (field as { _def?: { typeName?: string } })?._def;
  } catch {
    classicDef = undefined;
  }
  if (classicDef?.typeName === 'ZodOptional' || classicDef?.typeName === 'ZodDefault') {
    return true;
  }
  const miniDef = (field as { def?: { type?: string }; _zod?: { def?: { type?: string } } })?.def
    ?? (field as { _zod?: { def?: { type?: string } } })?._zod?.def;
  return miniDef?.type === 'optional' || miniDef?.type === 'default';
}

/**
 * Normalise a Zod object schema (classic ZodObject or Zod-mini object) into a
 * { type, shape, required } view. Returns `type: undefined` for non-objects.
 */
function introspectObject(schema: unknown): ObjectSchemaInfo {
  // Classic ZodObject: _def.shape is a function (or object), typeName is 'ZodObject'.
  let classicDef: { typeName?: string; shape?: unknown } | undefined;
  try {
    classicDef = (schema as { _def?: { typeName?: string; shape?: unknown } })?._def;
  } catch {
    classicDef = undefined;
  }
  if (classicDef && (classicDef.typeName === 'ZodObject' || typeof classicDef.shape === 'function')) {
    const rawShape = typeof classicDef.shape === 'function'
      ? (classicDef.shape as () => Record<string, unknown>)()
      : (classicDef.shape as Record<string, unknown>);
    const shape = rawShape ?? {};
    return {
      type: 'object',
      shape,
      required: Object.keys(shape).filter((k) => !isOptionalField(shape[k])),
    };
  }

  // Zod-mini object: stable `.def` getter with { type, shape }.
  const miniDef = (schema as { def?: { type?: string; shape?: unknown } })?.def
    ?? (schema as { _zod?: { def?: { type?: string; shape?: unknown } } })?._zod?.def;
  if (miniDef) {
    let rawShape = miniDef.shape;
    if (typeof rawShape === 'function') {
      rawShape = (rawShape as () => Record<string, unknown>)();
    }
    const shape = (rawShape as Record<string, unknown>) ?? {};
    return {
      type: miniDef.type,
      shape,
      required: Object.keys(shape).filter((k) => !isOptionalField(shape[k])),
    };
  }

  return { type: undefined, shape: {}, required: [] };
}

// ---------------------------------------------------------------------------
// Shared assertions — requirement (7): non-empty description, inputSchema of
// type object, and a derivable required array.
// ---------------------------------------------------------------------------

function assertValidToolSchema(server: McpServer, toolName: string): void {
  const entry = getToolEntry(server, toolName);
  expect(entry, `Tool "${toolName}" should be registered`).toBeDefined();

  // name is the map key, so registration guarantees it; assert it is non-empty.
  expect(toolName.length, `Tool name should be non-empty`).toBeGreaterThan(0);

  expect(
    typeof entry!.description,
    `Tool "${toolName}" description should be a string`,
  ).toBe('string');
  expect(
    entry!.description!.length,
    `Tool "${toolName}" description should be non-empty`,
  ).toBeGreaterThan(0);

  expect(entry!.inputSchema, `Tool "${toolName}" should have an inputSchema`).toBeDefined();

  const info = introspectObject(entry!.inputSchema);
  expect(info.type, `Tool "${toolName}" inputSchema should be an object schema`).toBe('object');
  expect(
    Array.isArray(info.required),
    `Tool "${toolName}" should expose a required array`,
  ).toBe(true);
}

function schemaFields(server: McpServer, toolName: string): string[] {
  return Object.keys(introspectObject(getToolEntry(server, toolName)!.inputSchema).shape);
}

function requiredFields(server: McpServer, toolName: string): string[] {
  return introspectObject(getToolEntry(server, toolName)!.inputSchema).required;
}

// ---------------------------------------------------------------------------
// 1 + 2. PAL tools
// ---------------------------------------------------------------------------

describe('PAL tools registration', () => {
  let server: McpServer;

  beforeEach(async () => {
    server = buildServer();
    process.env.PAL_MCP_URL = 'http://localhost:19999'; // unused — guard only
    const { registerPalTools } = await import('../tools/register-pal-tools.js');
    registerPalTools(server, mockRuntime);
  });

  // The six required PAL tools called out in the spec, plus the two extras the
  // registrar also exposes.
  const requiredPalTools = [
    'pal_execute',
    'pal_execute_notebook',
    'pal_install_package',
    'pal_list_packages',
    'pal_create_session',
    'pal_destroy_session',
  ] as const;

  const allPalTools = [...requiredPalTools, 'pal_analyze_code', 'pal_convert_notebook'] as const;

  it('registers all six required PAL tools', () => {
    const names = registeredToolNames(server);
    for (const toolName of requiredPalTools) {
      expect(names, `Expected "${toolName}" to be registered`).toContain(toolName);
    }
  });

  it.each(allPalTools)('PAL tool "%s" has a valid object schema', (toolName) => {
    assertValidToolSchema(server, toolName);
  });

  it('pal_execute requires "code"', () => {
    expect(schemaFields(server, 'pal_execute')).toContain('code');
    expect(requiredFields(server, 'pal_execute')).toContain('code');
  });

  it('pal_execute_notebook requires "cells"', () => {
    expect(requiredFields(server, 'pal_execute_notebook')).toContain('cells');
  });

  it('pal_destroy_session requires "sessionId"', () => {
    expect(requiredFields(server, 'pal_destroy_session')).toContain('sessionId');
  });

  it('pal_create_session exposes an optional "ttl" field', () => {
    expect(schemaFields(server, 'pal_create_session')).toContain('ttl');
    expect(requiredFields(server, 'pal_create_session')).not.toContain('ttl');
  });

  it('pal_list_packages takes no required arguments', () => {
    expect(requiredFields(server, 'pal_list_packages')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Workspace tools
// ---------------------------------------------------------------------------

describe('Workspace tools registration', () => {
  let server: McpServer;

  beforeEach(async () => {
    server = buildServer();
    process.env.AITM_API_URL = 'http://localhost:19998'; // unused — guard only
    const { registerWorkspaceTools } = await import('../tools/register-workspace-tools.js');
    registerWorkspaceTools(server, mockRuntime);
  });

  const expectedWorkspaceTools = [
    'ws_files',
    'ws_summary',
    'ws_search',
    'ws_git_status',
    'ws_recent_changes',
  ] as const;

  it('registers all expected workspace tools', () => {
    const names = registeredToolNames(server);
    for (const toolName of expectedWorkspaceTools) {
      expect(names).toContain(toolName);
    }
  });

  it.each(expectedWorkspaceTools)('workspace tool "%s" has a valid object schema', (toolName) => {
    assertValidToolSchema(server, toolName);
  });

  it('ws_search requires "query"', () => {
    expect(requiredFields(server, 'ws_search')).toContain('query');
  });
});

// ---------------------------------------------------------------------------
// 4. GitNexus tools (gn_ prefix, registered when GitNexus is configured)
// ---------------------------------------------------------------------------

describe('GitNexus tools registration', () => {
  let server: McpServer;

  beforeEach(() => {
    server = buildServer();
    process.env.GITNEXUS_URL = 'http://localhost:19997'; // unused — guard only
    registerGitNexusTools(server, mockRuntime);
  });

  const expectedGitNexusTools = [
    'gn_list_repos',
    'gn_query',
    'gn_cypher',
    'gn_context',
    'gn_detect_changes',
    'gn_check',
    'gn_rename',
    'gn_impact',
    'gn_explain',
    'gn_pdg_query',
    'gn_route_map',
    'gn_tool_map',
    'gn_shape_check',
    'gn_api_impact',
    'gn_group_list',
    'gn_group_sync',
    'gn_trace',
  ] as const;

  it('registers all expected GitNexus tools', () => {
    const names = registeredToolNames(server);
    for (const toolName of expectedGitNexusTools) {
      expect(names).toContain(toolName);
    }
  });

  it('every GitNexus tool uses the gn_ prefix', () => {
    const gnTools = registeredToolNames(server).filter((n) => n.startsWith('gn_'));
    expect(gnTools).toHaveLength(expectedGitNexusTools.length);
  });

  it.each(expectedGitNexusTools)('GitNexus tool "%s" has a valid object schema', (toolName) => {
    assertValidToolSchema(server, toolName);
  });

  it('gn_query requires "search_query"', () => {
    expect(requiredFields(server, 'gn_query')).toContain('search_query');
  });

  it('gn_impact requires "target" and "direction"', () => {
    const required = requiredFields(server, 'gn_impact');
    expect(required).toContain('target');
    expect(required).toContain('direction');
  });

  it('gn_rename requires "new_name"', () => {
    expect(requiredFields(server, 'gn_rename')).toContain('new_name');
  });
});

// ---------------------------------------------------------------------------
// 5. Beads tools (DAG task tracker, registered when Beads is enabled)
// ---------------------------------------------------------------------------

describe('Beads tools registration', () => {
  let server: McpServer;

  beforeEach(async () => {
    server = buildServer();
    process.env.AITM_API_URL = 'http://localhost:19998'; // unused — guard only
    const { registerBeadsTools } = await import('../tools/register-beads-tools.js');
    registerBeadsTools(server, mockRuntime);
  });

  const expectedBeadsTools = [
    'beads_list_tasks',
    'beads_create_task',
    'beads_mark_ready',
    'beads_mark_done',
    'beads_get_task',
  ] as const;

  it('registers all expected Beads tools', () => {
    const names = registeredToolNames(server);
    for (const toolName of expectedBeadsTools) {
      expect(names).toContain(toolName);
    }
  });

  it.each(expectedBeadsTools)('Beads tool "%s" has a valid object schema', (toolName) => {
    assertValidToolSchema(server, toolName);
  });

  it('beads_create_task requires "title"', () => {
    expect(requiredFields(server, 'beads_create_task')).toContain('title');
  });

  it('beads_mark_ready requires "id"', () => {
    expect(requiredFields(server, 'beads_mark_ready')).toContain('id');
  });

  it('beads_mark_done requires "id"', () => {
    expect(requiredFields(server, 'beads_mark_done')).toContain('id');
  });
});

// ---------------------------------------------------------------------------
// 6. Analysis tools
// ---------------------------------------------------------------------------

describe('Analysis tools registration', () => {
  let server: McpServer;

  beforeEach(async () => {
    server = buildServer();
    const { registerAnalysisTools } = await import('../tools/register-analysis-tools.js');
    registerAnalysisTools(server, mockRuntime);
  });

  const requiredAnalysisTools = [
    'analyze_dependencies',
    'check_security_vulnerabilities',
    'measure_code_complexity',
  ] as const;

  const allAnalysisTools = [...requiredAnalysisTools, 'find_dead_code', 'estimate_tech_debt'] as const;

  it('registers the three required analysis tools', () => {
    const names = registeredToolNames(server);
    for (const toolName of requiredAnalysisTools) {
      expect(names).toContain(toolName);
    }
  });

  it.each(allAnalysisTools)('analysis tool "%s" has a valid object schema', (toolName) => {
    assertValidToolSchema(server, toolName);
  });

  it('analyze_dependencies requires "projectPath"', () => {
    expect(requiredFields(server, 'analyze_dependencies')).toContain('projectPath');
  });

  it('measure_code_complexity requires "filePath"', () => {
    expect(requiredFields(server, 'measure_code_complexity')).toContain('filePath');
  });

  it('check_security_vulnerabilities description mentions security or vulnerabilities', () => {
    const entry = getToolEntry(server, 'check_security_vulnerabilities');
    expect(entry!.description!.toLowerCase()).toMatch(/secur|vulnerab|cve/);
  });
});

// ---------------------------------------------------------------------------
// 7. Cross-cutting schema invariants across every registrar above
// ---------------------------------------------------------------------------

describe('cross-registrar schema invariants', () => {
  it('no two registrars produce duplicate tool names', async () => {
    process.env.PAL_MCP_URL = 'http://localhost:19999';
    process.env.AITM_API_URL = 'http://localhost:19998';
    process.env.GITNEXUS_URL = 'http://localhost:19997';

    const [
      { registerPalTools },
      { registerWorkspaceTools },
      { registerGitNexusTools },
      { registerBeadsTools },
      { registerAnalysisTools },
    ] = await Promise.all([
      import('../tools/register-pal-tools.js'),
      import('../tools/register-workspace-tools.js'),
      import('../tools/register-gitnexus-tools.js'),
      import('../tools/register-beads-tools.js'),
      import('../tools/register-analysis-tools.js'),
    ]);

    const server = buildServer();
    // Registering all into one server would throw on a duplicate name, so this
    // call succeeding is itself the assertion; we additionally count uniqueness.
    registerPalTools(server, mockRuntime);
    registerWorkspaceTools(server, mockRuntime);
    registerGitNexusTools(server, mockRuntime);
    registerBeadsTools(server, mockRuntime);
    registerAnalysisTools(server, mockRuntime);

    const names = registeredToolNames(server);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(30);
  });

  it('every registered tool satisfies the MCP schema contract', async () => {
    const server = buildServer();
    const { registerAnalysisTools } = await import('../tools/register-analysis-tools.js');
    const { registerPalTools } = await import('../tools/register-pal-tools.js');
    registerPalTools(server, mockRuntime);
    registerAnalysisTools(server, mockRuntime);

    for (const name of registeredToolNames(server)) {
      assertValidToolSchema(server, name);
    }
  });
});
