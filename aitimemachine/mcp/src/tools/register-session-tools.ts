import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import {
  destructiveAnnotations,
  mutatingAnnotations,
  readOnlyAnnotations,
} from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';

export const registerSessionTools = createToolRegistrar([
  defineTool({
    name: 'tm_session_capture',
    description: 'Capture current state as a session (used by daemon)',
    schema: {
      projectPath: z.string().min(1),
      description: z.string().optional(),
    },
    annotations: mutatingAnnotations(),
    run: async ({ projectPath, description }, runtime) => {
      const lib = await runtime.getLib();
      const capture = new lib.FastSessionCapture(projectPath);
      const result = capture.capture(description || 'Manual capture', {
        type: 'manual',
      });

      if (!result?.session) {
        return textResponse('No changes detected');
      }

      const sessionServer = runtime.getSessionServer();
      for (const [, content] of result.blobs) {
        sessionServer.storeBlob(content);
      }
      sessionServer.saveSession(result.session);

      return jsonResponse({
        sessionId: result.session.id,
        files: result.session.files.length,
        cached: result.stats.cached,
        hashed: result.stats.hashed,
      });
    },
  }),
  defineTool({
    name: 'tm_session_list',
    description: 'List all captured sessions',
    schema: {
      projectPath: z.string().optional(),
      limit: z.number().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ projectPath, limit }, runtime) => {
      const sessions = runtime
        .getSessionServer()
        .listSessions(projectPath)
        .slice(0, limit || 50);

      return jsonResponse(
        sessions.map((session: any) => ({
          id: session.id,
          projectPath: session.projectPath,
          createdAt: session.createdAt,
          description: session.description,
        }))
      );
    },
  }),
  defineTool({
    name: 'tm_bisect',
    description: 'Binary search to find when a test started failing',
    schema: {
      testCommand: z.string().min(1).describe('Command to test (e.g., "npm test")'),
      projectPath: z.string().optional(),
      goodSessionId: z.string().optional().describe('Known good session ID'),
    },
    annotations: destructiveAnnotations({
      idempotentHint: false,
      openWorldHint: true,
    }),
    run: async ({ testCommand, projectPath, goodSessionId }, runtime) => {
      const lib = await runtime.getLib();
      const smart = new lib.SmartRestore();
      const result = await smart.bisect(
        testCommand,
        runtime.resolveProjectPath(projectPath),
        {
          goodSession: goodSessionId,
          verbose: true,
        }
      );

      return jsonResponse(result);
    },
  }),
]);
