/**
 * register-gitnexus-tools.ts
 *
 * Registers GitNexus's MCP tools into the AITM MCP server. Each tool's run()
 * handler dispatches the call IN-PROCESS to the embedded GitNexus backend
 * (`gitnexus` workspace library → `LocalBackend.callTool`), which is the exact
 * same dispatch path the GitNexus HTTP/stdio MCP transports drove. This
 * replaces the previous JSON-RPC 2.0 proxy to a standalone GitNexus HTTP server
 * at GITNEXUS_URL — same tool names, inputs, and outputs, zero network hop.
 *
 * Tool names are prefixed with `gn_` to avoid conflicts with AITM tools.
 */

import { z } from 'zod';
import { createGitNexusBackend, type GitNexusBackend } from 'gitnexus';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import {
  mutatingAnnotations,
  readOnlyAnnotations,
} from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';

// ---------------------------------------------------------------------------
// In-process backend (lazy singleton)
// ---------------------------------------------------------------------------

/**
 * Memoised backend promise. The GitNexus backend opens pooled database handles
 * and discovers indexed repos, so it is created once and reused across tool
 * calls. A failed init is not cached, so a later call can retry.
 */
let backendPromise: Promise<GitNexusBackend> | null = null;

function getGitNexusBackend(): Promise<GitNexusBackend> {
  if (backendPromise === null) {
    backendPromise = createGitNexusBackend().catch((err: unknown) => {
      backendPromise = null;
      throw err;
    });
  }
  return backendPromise;
}

async function callGitNexus(
  toolName: string,
  args: Record<string, unknown>
): Promise<ReturnType<typeof textResponse>> {
  let backend: GitNexusBackend;
  try {
    backend = await getGitNexusBackend();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `GitNexus: failed to initialise the in-process backend — ${message}. ` +
        'Ensure the gitnexus package is built (dist/index.js) and at least ' +
        'one repo has been indexed with `gitnexus analyze`.'
    );
  }

  let result: unknown;
  try {
    result = await backend.callTool(toolName, args);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`GitNexus tool '${toolName}' failed: ${message}`);
  }

  // `callTool` returns either a pre-formatted string (Markdown/text) — exactly
  // what the MCP `tools/call` handler would have wrapped into a text content
  // block — or a structured object. Preserve the previous output contract:
  // string results become a textResponse; everything else becomes a
  // jsonResponse.
  if (typeof result === 'string') {
    if (result.length > 0) {
      return textResponse(result);
    }
    return jsonResponse(result);
  }

  return jsonResponse(result);
}

// ---------------------------------------------------------------------------
// Zod schema builder
//
// Converts a JSON Schema `properties` map into a flat z.ZodRawShape so that
// defineTool() can register it via the standard AITM tool-runtime path.
// Required fields become non-optional; everything else gets .optional().
// ---------------------------------------------------------------------------

type JsonSchemaProp = {
  type: string;
  description?: string;
  default?: unknown;
  items?: { type: string };
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
};

function buildZodShape(
  properties: Record<string, JsonSchemaProp>,
  required: string[]
): z.ZodRawShape {
  const shape: z.ZodRawShape = {};
  const requiredSet = new Set(required);

  for (const [key, prop] of Object.entries(properties)) {
    let field: z.ZodTypeAny;

    switch (prop.type) {
      case 'boolean':
        field = z.boolean();
        break;
      case 'integer':
      case 'number': {
        let num = z.number();
        if (typeof prop.minimum === 'number') num = num.min(prop.minimum);
        if (typeof prop.maximum === 'number') num = num.max(prop.maximum);
        field = num;
        break;
      }
      case 'array':
        field = z.array(z.any());
        break;
      case 'object':
        field = z.record(z.any());
        break;
      case 'string':
      default: {
        let str = z.string();
        if (typeof prop.minLength === 'number') str = str.min(prop.minLength);
        if (prop.enum && prop.enum.length > 0) {
          // Cast is safe: prop.enum is string[] from the JSON Schema type above.
          field = z.enum(prop.enum as [string, ...string[]]);
          break;
        }
        field = str;
        break;
      }
    }

    if (prop.description) {
      field = field.describe(prop.description);
    }

    if (!requiredSet.has(key)) {
      field = field.optional();
    }

    shape[key] = field;
  }

  return shape;
}

// ---------------------------------------------------------------------------
// Tool definitions
//
// Mutating tools (rename, group_sync): mutatingAnnotations()
// All others: readOnlyAnnotations()
// ---------------------------------------------------------------------------

const MUTATING_TOOLS = new Set(['rename', 'group_sync']);

function annotationsFor(toolName: string) {
  return MUTATING_TOOLS.has(toolName) ? mutatingAnnotations() : readOnlyAnnotations();
}

// Inline tool catalogue — mirrors GITNEXUS_TOOLS without importing from the
// gitnexus package (which may not be built yet in every environment).

const GITNEXUS_TOOL_SPECS: Array<{
  name: string;
  description: string;
  properties: Record<string, JsonSchemaProp>;
  required: string[];
}> = [
  {
    name: 'list_repos',
    description:
      'List indexed repositories available to GitNexus (paginated). ' +
      'Returns repos with name, path, indexed date, last commit, stats, and pagination metadata.',
    properties: {
      limit: {
        type: 'integer',
        description: 'Max repositories to return in this page (default: 50, min: 1, max: 200).',
        minimum: 1,
        maximum: 200,
      },
      offset: {
        type: 'integer',
        description: 'Number of repositories to skip before this page (default: 0).',
        minimum: 0,
      },
    },
    required: [],
  },
  {
    name: 'query',
    description:
      'Query the code knowledge graph for execution flows related to a concept. ' +
      'Returns processes (call chains) ranked by relevance with symbols and file locations.',
    properties: {
      search_query: {
        type: 'string',
        description: 'Natural language or keyword search query.',
      },
      task_context: {
        type: 'string',
        description: 'What you are working on (e.g., "adding OAuth support"). Helps ranking.',
      },
      goal: {
        type: 'string',
        description: 'What you want to find (e.g., "existing auth validation logic"). Helps ranking.',
      },
      limit: {
        type: 'number',
        description: 'Max processes to return (default: 5)',
        minimum: 1,
        maximum: 100,
      },
      max_symbols: {
        type: 'number',
        description: 'Max symbols per process (default: 10)',
        minimum: 1,
        maximum: 200,
      },
      include_content: {
        type: 'boolean',
        description: 'Include full symbol source code (default: false)',
      },
      repo: {
        type: 'string',
        description:
          'Indexed repository name or path, or group mode "@<groupName>". Omit when only one indexed repo exists.',
      },
      service: {
        type: 'string',
        description: 'Optional monorepo service root (relative path, "/" separators).',
        minLength: 1,
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index. Omit for the default branch.',
      },
    },
    required: ['search_query'],
  },
  {
    name: 'cypher',
    description:
      'Execute a Cypher query against the code knowledge graph. ' +
      'Returns { markdown, row_count } — results formatted as a Markdown table.',
    properties: {
      statement: {
        type: 'string',
        description: 'Cypher statement to execute.',
      },
      params: {
        type: 'object',
        description: 'Optional query parameters for placeholders (e.g. $name).',
      },
      repo: {
        type: 'string',
        description: 'Repository name or path. Omit if only one repo is indexed.',
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: ['statement'],
  },
  {
    name: 'context',
    description:
      '360-degree view of a single code symbol: categorized incoming/outgoing references, ' +
      'process participation, and file location.',
    properties: {
      name: { type: 'string', description: 'Symbol name (e.g., "validateUser", "AuthService")' },
      uid: {
        type: 'string',
        description: 'Direct symbol UID from prior tool results (zero-ambiguity lookup)',
      },
      file_path: { type: 'string', description: 'File path to disambiguate common names' },
      kind: {
        type: 'string',
        description:
          "Kind filter to disambiguate common names (e.g. 'Function', 'Class', 'Method')",
      },
      include_content: {
        type: 'boolean',
        description: 'Include full symbol source code (default: false)',
      },
      repo: {
        type: 'string',
        description:
          'Indexed repository name or path, or group mode "@<groupName>". Omit if only one repo is indexed.',
      },
      service: {
        type: 'string',
        description: 'Optional monorepo service root (relative path).',
        minLength: 1,
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: [],
  },
  {
    name: 'detect_changes',
    description:
      'Analyze uncommitted git changes and find affected execution flows. ' +
      'Returns: changed symbols, affected processes, and a risk summary.',
    properties: {
      scope: {
        type: 'string',
        description: 'What to analyze: "unstaged" (default), "staged", "all", or "compare"',
        enum: ['unstaged', 'staged', 'all', 'compare'],
      },
      base_ref: {
        type: 'string',
        description: 'Branch/commit for "compare" scope (e.g., "main")',
      },
      worktree: {
        type: 'string',
        description:
          'Absolute path to a linked git worktree when server runs from a different directory.',
      },
      repo: {
        type: 'string',
        description: 'Repository name or path. Omit if only one repo is indexed.',
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: [],
  },
  {
    name: 'check',
    description:
      'Run read-only structural checks against the indexed graph. ' +
      'Currently detects directed cycles between File nodes connected by IMPORTS edges.',
    properties: {
      cycles: {
        type: 'boolean',
        description: 'Detect circular file imports (default: true).',
      },
      repo: {
        type: 'string',
        description: 'Repository name or path. Omit if only one repo is indexed.',
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: [],
  },
  {
    name: 'rename',
    description:
      'Multi-file coordinated rename using the knowledge graph + text search. ' +
      'Preview by default (dry_run: true). Each edit is tagged with confidence.',
    properties: {
      symbol_name: { type: 'string', description: 'Current symbol name to rename' },
      symbol_uid: {
        type: 'string',
        description: 'Direct symbol UID from prior tool results (zero-ambiguity)',
      },
      new_name: { type: 'string', description: 'The new name for the symbol' },
      file_path: { type: 'string', description: 'File path to disambiguate common names' },
      dry_run: {
        type: 'boolean',
        description: 'Preview edits without modifying files (default: true)',
      },
      repo: {
        type: 'string',
        description: 'Repository name or path. Omit if only one repo is indexed.',
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: ['new_name'],
  },
  {
    name: 'impact',
    description:
      'Analyze the blast radius of changing a code symbol. ' +
      'Returns affected symbols grouped by depth, risk assessment, affected execution flows, and modules.',
    properties: {
      target: { type: 'string', description: 'Name of function, class, or file to analyze' },
      target_uid: {
        type: 'string',
        description: 'Direct symbol UID from prior tool results (zero-ambiguity lookup)',
      },
      direction: {
        type: 'string',
        description: 'upstream (what depends on this) or downstream (what this depends on)',
      },
      mode: {
        type: 'string',
        enum: ['callgraph', 'pdg'],
        description: "'callgraph' (default) or 'pdg' (requires --pdg index).",
      },
      line: {
        type: 'integer',
        description: "1-based source line — PDG statement anchor (mode:'pdg').",
        minimum: 1,
      },
      file_path: { type: 'string', description: 'File path hint to disambiguate common names' },
      kind: {
        type: 'string',
        description: "Kind filter to disambiguate common names (e.g. 'Function', 'Class')",
      },
      maxDepth: {
        type: 'number',
        description: 'Max relationship depth (default: 3, server clamps to 1–32)',
        minimum: 1,
        maximum: 32,
      },
      crossDepth: {
        type: 'number',
        description: 'Cross-repository hop depth (default: 1)',
        minimum: 1,
        maximum: 32,
      },
      relationTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, HAS_METHOD, HAS_PROPERTY, etc.',
      },
      includeTests: { type: 'boolean', description: 'Include test files (default: false)' },
      minConfidence: {
        type: 'number',
        description: 'Minimum edge confidence 0–1 (default: 0)',
        minimum: 0,
        maximum: 1,
      },
      repo: {
        type: 'string',
        description: 'Indexed repository name or path, or group mode "@<groupName>".',
      },
      service: {
        type: 'string',
        description: 'Optional monorepo service root (relative path).',
        minLength: 1,
      },
      subgroup: {
        type: 'string',
        description: 'Optional group subgroup prefix limiting which repos participate.',
      },
      limit: {
        type: 'integer',
        description: 'Max symbols returned in byDepth per depth level (default: 100).',
        minimum: 1,
        maximum: 10000,
      },
      offset: {
        type: 'integer',
        description: 'Skip this many symbols per depth level before applying limit.',
        minimum: 0,
      },
      summaryOnly: {
        type: 'boolean',
        description: 'When true, omits byDepth — returns summary, risk, counts only.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Wall-clock budget in milliseconds for the Phase-1 local impact leg.',
        minimum: 1,
        maximum: 3600000,
      },
      timeout: {
        type: 'number',
        description: 'Alias of timeoutMs.',
        minimum: 1,
        maximum: 3600000,
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: ['target', 'direction'],
  },
  {
    name: 'explain',
    description:
      'Explain persisted taint findings from `gitnexus analyze --pdg`. ' +
      'Shows source→sink data flows (intra- and inter-procedural). Requires --pdg index.',
    properties: {
      target: {
        type: 'string',
        description:
          'Optional anchor: a file path or symbol/function name. Omit to enumerate all findings.',
      },
      limit: {
        type: 'integer',
        description: 'Max findings returned (default: 50, max: 200).',
        minimum: 1,
        maximum: 200,
      },
      repo: {
        type: 'string',
        description: 'Repository name or path. Omit if only one repo is indexed.',
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: [],
  },
  {
    name: 'pdg_query',
    description:
      'Query the persisted Program Dependence Graph: control dependence (CDG) and data dependence (REACHING_DEF). ' +
      'Requires `gitnexus analyze --pdg`. Modes: "controls" or "flows".',
    properties: {
      mode: {
        type: 'string',
        enum: ['controls', 'flows'],
        description:
          "'controls' = control dependence (CDG); 'flows' = data dependence (REACHING_DEF).",
      },
      target: {
        type: 'string',
        description: 'Required anchor: a file path or symbol/function name.',
      },
      variable: {
        type: 'string',
        description: 'Optional (flows mode only): restrict to this source-level variable name.',
      },
      limit: {
        type: 'integer',
        description: 'Max edges returned (default: 50, max: 200).',
        minimum: 1,
        maximum: 200,
      },
      repo: {
        type: 'string',
        description: 'Repository name or path. Omit if only one repo is indexed.',
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: ['mode', 'target'],
  },
  {
    name: 'route_map',
    description:
      'Show API route mappings: which components/hooks fetch which API endpoints, ' +
      'and which handler files serve them. Returns route nodes with handlers, middleware, and consumers.',
    properties: {
      route: {
        type: 'string',
        description: 'Filter by route path (e.g., "/api/grants"). Omit for all routes.',
      },
      repo: {
        type: 'string',
        description: 'Repository name or path. Omit if only one repo is indexed.',
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: [],
  },
  {
    name: 'tool_map',
    description:
      'Show MCP/RPC tool definitions: which tools are defined, where they are handled, and their descriptions.',
    properties: {
      tool: { type: 'string', description: 'Filter by tool name. Omit for all tools.' },
      repo: { type: 'string', description: 'Repository name or path.' },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: [],
  },
  {
    name: 'shape_check',
    description:
      'Check response shapes for API routes against their consumers\' property accesses. ' +
      'Reports MISMATCH when a consumer accesses keys not present in the route response shape.',
    properties: {
      route: {
        type: 'string',
        description: 'Check a specific route (e.g., "/api/grants"). Omit to check all routes.',
      },
      repo: {
        type: 'string',
        description: 'Repository name or path. Omit if only one repo is indexed.',
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: [],
  },
  {
    name: 'api_impact',
    description:
      'Pre-change impact report for an API route handler. ' +
      'Shows consumers, response fields accessed, middleware, and execution flows. ' +
      'Requires at least "route" or "file" parameter.',
    properties: {
      route: { type: 'string', description: 'Route path (e.g., "/api/grants")' },
      file: { type: 'string', description: 'Handler file path (alternative to route)' },
      repo: { type: 'string', description: 'Repository name or path.' },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: [],
  },
  {
    name: 'group_list',
    description:
      'List all configured repository groups, or return details for one group (repos, manifest links).',
    properties: {
      name: { type: 'string', description: 'Group name. Omit to list all groups.' },
    },
    required: [],
  },
  {
    name: 'group_sync',
    description:
      'Rebuild the Contract Registry (contracts.json) for a group. ' +
      'Run after changing group.yaml or re-indexing member repos.',
    properties: {
      name: { type: 'string', description: 'Group name' },
      skipEmbeddings: {
        type: 'boolean',
        description: 'Exact + BM25 only (skip semantic embeddings)',
      },
      exactOnly: { type: 'boolean', description: 'Exact match only in cascade' },
    },
    required: ['name'],
  },
  {
    name: 'trace',
    description:
      'Find the shortest directed path between two symbols over call and class-member edges. ' +
      'Returns ordered hops with file:line positions and per-hop edge type and confidence.',
    properties: {
      from: { type: 'string', description: 'Source symbol name' },
      from_uid: { type: 'string', description: 'Source symbol UID (zero-ambiguity)' },
      from_file: { type: 'string', description: 'Source file path hint for disambiguation' },
      to: { type: 'string', description: 'Target symbol name' },
      to_uid: { type: 'string', description: 'Target symbol UID (zero-ambiguity)' },
      to_file: { type: 'string', description: 'Target file path hint for disambiguation' },
      maxDepth: {
        type: 'number',
        description: 'Maximum path length in hops (default: 10)',
        minimum: 1,
        maximum: 30,
      },
      includeTests: {
        type: 'boolean',
        description: 'Include test-file symbols in traversal (default: false)',
      },
      repo: {
        type: 'string',
        description: 'Repository name or path. Omit if only one repo is indexed.',
      },
      branch: {
        type: 'string',
        description: 'Optional: scope to a specific branch index.',
      },
    },
    required: [],
  },
];

// ---------------------------------------------------------------------------
// Build and export the registrar
// ---------------------------------------------------------------------------

export const registerGitNexusTools = createToolRegistrar(
  GITNEXUS_TOOL_SPECS.map((spec) =>
    defineTool({
      name: `gn_${spec.name}`,
      description: spec.description,
      schema: buildZodShape(spec.properties, spec.required),
      annotations: annotationsFor(spec.name),
      run: async (args) => {
        return callGitNexus(spec.name, args as Record<string, unknown>);
      },
    })
  )
);

export default registerGitNexusTools;
