/**
 * register-workspace-tools.ts
 *
 * Registers workspace context tools into the AITM MCP server.
 * These tools proxy to the AITM API server's /workspace endpoints.
 * Useful for agents that need to understand the current project structure.
 *
 * The AITM API server protects /workspace/* with `apiKeyAuth`, so every
 * request must carry the AITM_API_KEY credential (X-API-Key header). The
 * shared aitm-api-client centralises base-URL resolution, auth headers, and
 * actionable error messages.
 */

import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import { readOnlyAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse } from '../lib/tool-responses.js';
import { aitmApiRequest } from '../lib/aitm-api-client.js';

const LABEL = 'Workspace API';

async function workspaceGet(
  endpoint: string
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/workspace${endpoint}`);
  return jsonResponse(data);
}

async function workspacePost(
  endpoint: string,
  body: unknown
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/workspace${endpoint}`, {
    method: 'POST',
    body,
  });
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
