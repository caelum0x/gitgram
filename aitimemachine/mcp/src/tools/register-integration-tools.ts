import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import { readOnlyAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';

export const registerIntegrationTools = createToolRegistrar([
  defineTool({
    name: 'tm_container_state',
    description: 'Get Docker/container state for project',
    schema: {
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ projectPath }, runtime) => {
      const lib = await runtime.getLib();
      const collector = new lib.ContainerCollector(
        runtime.resolveProjectPath(projectPath)
      );
      return jsonResponse(collector.capture());
    },
  }),
  defineTool({
    name: 'tm_database_state',
    description: 'Get database state for project',
    schema: {
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ projectPath }, runtime) => {
      const lib = await runtime.getLib();
      const collector = new lib.DatabaseCollector(
        runtime.resolveProjectPath(projectPath)
      );
      return jsonResponse(collector.capture());
    },
  }),
  defineTool({
    name: 'tm_gemini_sessions',
    description: 'List Gemini CLI sessions',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async (_args, runtime) => {
      const lib = await runtime.getLib();
      const collector = new lib.GeminiCollector();
      if (!collector.isAvailable()) {
        return textResponse('Gemini CLI not available');
      }

      const sessions = collector.getAllSessions();
      return jsonResponse(
        sessions.slice(0, 20).map((session: any) => ({
          id: session.id,
          createdAt: session.createdAt,
          messageCount: session.messages.length,
        }))
      );
    },
  }),
  defineTool({
    name: 'tm_git_state',
    description: 'Get git state for project',
    schema: {
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: async ({ projectPath }, runtime) => {
      const lib = await runtime.getLib();
      const collector = new lib.GitCollector(
        runtime.resolveProjectPath(projectPath)
      );
      return jsonResponse(collector.capture());
    },
  }),
  defineTool({
    name: 'tm_env_state',
    description: 'Get environment state (runtimes, package managers, dependencies)',
    schema: {
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: async ({ projectPath }, runtime) => {
      const lib = await runtime.getLib();
      const collector = new lib.EnvCollector(
        runtime.resolveProjectPath(projectPath)
      );
      return jsonResponse(collector.capture());
    },
  }),
  defineTool({
    name: 'tm_aider_sessions',
    description: 'List Aider sessions',
    schema: {
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: async ({ projectPath }, runtime) => {
      const lib = await runtime.getLib();
      const collector = new lib.AiderCollector(
        runtime.resolveProjectPath(projectPath)
      );
      return jsonResponse(collector.getSessions().slice(0, 20));
    },
  }),
  defineTool({
    name: 'tm_cursor_workspaces',
    description: 'List Cursor workspaces',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async (_args, runtime) => {
      const lib = await runtime.getLib();
      const collector = new lib.CursorCollector();
      return jsonResponse(collector.getWorkspaces().slice(0, 20));
    },
  }),
  defineTool({
    name: 'tm_claude_projects',
    description: 'List Claude Code projects',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async (_args, runtime) => {
      const lib = await runtime.getLib();
      const claude = new lib.ClaudeCodeIntegration();
      return jsonResponse(claude.getProjects().slice(0, 20));
    },
  }),
  defineTool({
    name: 'tm_claude_conversations',
    description: 'Get Claude Code conversations for a project',
    schema: {
      projectPath: z.string().min(1),
      limit: z.number().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: async ({ projectPath, limit }, runtime) => {
      const lib = await runtime.getLib();
      const claude = new lib.ClaudeCodeIntegration();
      return jsonResponse(
        claude.getConversations(projectPath).slice(0, limit || 20)
      );
    },
  }),
]);
