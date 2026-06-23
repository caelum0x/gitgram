/**
 * register-workspace-tools.ts
 *
 * Registers workspace context tools into the AITM MCP server.
 * These tools proxy to the AITM API server's /workspace endpoints.
 * Useful for agents that need to understand the current project structure.
 */

import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import { readOnlyAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';

const AITM_API_URL =
  (typeof process !== 'undefined' && process.env.AITM_API_URL) ||
  'http://localhost:3001';

async function workspaceGet(endpoint: string): Promise<ReturnType<typeof jsonResponse>> {
  const res = await fetch(`${AITM_API_URL}/workspace${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Workspace API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return jsonResponse(data);
}

async function workspacePost(endpoint: string, body: unknown): Promise<ReturnType<typeof jsonResponse>> {
  const res = await fetch(`${AITM_API_URL}/workspace${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Workspace API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return jsonResponse(data);
}

export const registerWorkspaceTools = createToolRegistrar([
  defineTool({
    name: 'ws_files',
    description: 'List all files in the current workspace (excludes node_modules, .git, dist). Returns array of relative paths.',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async () => workspaceGet('/files'),
  }),

  defineTool({
    name: 'ws_summary',
    description: 'Get a summary of the workspace: file count, language breakdown, total lines, largest files.',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async () => workspaceGet('/summary'),
  }),

  defineTool({
    name: 'ws_search',
    description: 'Search for a string pattern across workspace files. Returns list of matching file paths.',
    schema: {
      query: z.string().describe('Text to search for in file contents'),
      filePattern: z.string().optional().describe('Glob pattern to filter files (e.g., "*.ts" or "**/*.tsx")'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => workspacePost('/search', args),
  }),

  defineTool({
    name: 'ws_git_status',
    description: 'Get the current git status of the workspace (modified, staged, untracked files).',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async () => workspaceGet('/git-status'),
  }),

  defineTool({
    name: 'ws_recent_changes',
    description: 'Get the 20 most recent git commits in the workspace (hash + message).',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async () => workspaceGet('/recent-changes'),
  }),
]);

export default registerWorkspaceTools;
