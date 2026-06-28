/**
 * register-meta-tools.ts
 *
 * Callable lazy-discovery meta-tools, ported from the Beads MCP server's
 * discover_tools / get_tool_info pattern.
 *
 * Rationale: the server exposes ~90 tools. Loading every parameter schema up
 * front is expensive. tm_discover_tools returns just the names + short
 * descriptions of the currently enabled tools (~cheap), and tm_get_tool_info
 * returns the full parameter detail plus a usage example for the one tool the
 * agent actually needs. Unlike the read-only tm://capabilities resource, these
 * are callable tools that include per-parameter type/required/description detail
 * derived from the live zod schema.
 */

import { z } from 'zod';
import { createToolRegistrar, defineTool } from '../lib/tool-runtime.js';
import { readOnlyAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse } from '../lib/tool-responses.js';
import {
  getCatalogSummary,
  getCatalogSize,
  getCatalogToolNames,
  getToolInfo,
} from '../lib/tool-catalog.js';

/**
 * Curated usage examples for the highest-value tools, mirroring the `example`
 * field Beads attaches to get_tool_info. Tools without an example still return
 * full parameter detail; the example is purely additive guidance.
 */
const TOOL_EXAMPLES: Readonly<Record<string, string>> = {
  before_action: "before_action({ action: 'refactor auth middleware' })",
  after_action: "after_action({ action: 'refactored auth middleware', success: true })",
  tm_checkpoint_create: "tm_checkpoint_create({ description: 'before risky migration' })",
  tm_checkpoint_restore: "tm_checkpoint_restore({ id: 'cp_123' })",
  tm_search: "tm_search({ query: 'null pointer in parser' })",
  beads_ready: 'beads_ready({ priority: 1, unassigned: true, limit: 5, brief: true })',
  beads_list_tasks: 'beads_list_tasks({ brief: true, maxDescriptionLength: 120 })',
  beads_get_task: "beads_get_task({ id: 'bd-a1b2', briefDeps: true })",
  beads_create_task: "beads_create_task({ title: 'Fix auth bug', deps: ['bd-a1b2'] })",
  beads_close_task: "beads_close_task({ id: 'bd-a1b2', reason: 'Fixed in PR #123' })",
  github_get_pr_diff: "github_get_pr_diff({ owner: 'org', repo: 'app', number: 42 })",
  tm_docs_resolve: "tm_docs_resolve({ libraryName: 'react' })",
  pal_execute: "pal_execute({ code: 'print(1 + 1)' })",
};

export const registerMetaTools = createToolRegistrar([
  defineTool({
    name: 'tm_discover_tools',
    description:
      'List the names and one-line descriptions of every tool currently enabled on this server (cheap discovery). Then call tm_get_tool_info(name) for the full parameter schema and an example of a specific tool, instead of loading every schema up front.',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async () =>
      jsonResponse({
        tools: getCatalogSummary(),
        count: getCatalogSize(),
        hint: "Use tm_get_tool_info({ name: '<tool>' }) for full parameters and a usage example.",
      }),
  }),

  defineTool({
    name: 'tm_get_tool_info',
    description:
      'Get the full details of one enabled tool: its description, category, read-only/destructive hints, every parameter (name, type, required, description), and a usage example when available. Use tm_discover_tools first to find the tool name.',
    schema: {
      name: z
        .string()
        .describe('The exact tool name to describe (e.g. "beads_ready").'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const info = getToolInfo(args.name);
      if (!info) {
        return jsonResponse({
          error: `Unknown or disabled tool: ${args.name}`,
          availableTools: getCatalogToolNames(),
          hint: 'Use tm_discover_tools to list the tools enabled in this process.',
        });
      }

      const example = TOOL_EXAMPLES[info.name];
      return jsonResponse({
        ...info,
        ...(example ? { example } : {}),
      });
    },
  }),
]);

export default registerMetaTools;
