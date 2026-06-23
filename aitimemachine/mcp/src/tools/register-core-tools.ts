import * as fs from 'fs';
import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import {
  destructiveAnnotations,
  idempotentMutationAnnotations,
  mutatingAnnotations,
  readOnlyAnnotations,
} from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';

export const registerCoreTools = createToolRegistrar([
  defineTool({
    name: 'tm_project_init',
    description: 'Initialize or register a project for time tracking',
    schema: {
      projectPath: z.string().min(1).describe('Absolute path to project'),
      name: z.string().optional().describe('Project name'),
    },
    annotations: idempotentMutationAnnotations(),
    run: ({ projectPath, name }, runtime) => {
      runtime.setCurrentProjectPath(projectPath);
      const engine = runtime.getEngine(projectPath);
      const tp = engine.capture(name || 'Project initialized', {
        type: 'manual',
      });

      runtime.getSessionServer().registerProject(projectPath);

      return jsonResponse({
        projectPath,
        timePointId: tp.id,
        filesTracked: tp.stats.totalFiles,
      });
    },
  }),
  defineTool({
    name: 'tm_set_project',
    description: 'Set the current working project',
    schema: {
      projectPath: z.string().min(1),
    },
    annotations: idempotentMutationAnnotations(),
    run: ({ projectPath }, runtime) => {
      if (!fs.existsSync(projectPath)) {
        throw new Error(`Project path does not exist: ${projectPath}`);
      }
      runtime.setCurrentProjectPath(projectPath);
      return textResponse(`Project set to: ${projectPath}`);
    },
  }),
  defineTool({
    name: 'tm_checkpoint_create',
    description: 'Create a checkpoint (snapshot of current state)',
    schema: {
      description: z.string().min(1).describe('Description of this checkpoint'),
      projectPath: z.string().optional(),
    },
    annotations: mutatingAnnotations(),
    run: ({ description, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const tp = engine.capture(description, { type: 'manual' });

      return jsonResponse({
        checkpointId: tp.id,
        description: tp.description,
        filesTracked: tp.stats.totalFiles,
        timestamp: tp.timestamp,
      });
    },
  }),
  defineTool({
    name: 'tm_checkpoint_list',
    description: 'List all checkpoints/timepoints',
    schema: {
      projectPath: z.string().optional(),
      limit: z.number().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ projectPath, limit }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const timepoints = engine.listTimePoints().slice(0, limit || 50);

      return jsonResponse(
        timepoints.map((tp: any) => ({
          id: tp.id,
          description: tp.description,
          timestamp: tp.timestamp,
          files: tp.stats.totalFiles,
        }))
      );
    },
  }),
  defineTool({
    name: 'tm_checkpoint_restore',
    description: 'Restore project to a checkpoint',
    schema: {
      checkpointId: z.string().min(1),
      projectPath: z.string().optional(),
    },
    annotations: destructiveAnnotations(),
    run: ({ checkpointId, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const result = engine.restore(checkpointId);

      return jsonResponse({
        restored: true,
        filesRestored: result.filesRestored,
        filesDeleted: result.filesDeleted,
      });
    },
  }),
  defineTool({
    name: 'tm_checkpoint_preview',
    description: 'Preview what restore would change',
    schema: {
      checkpointId: z.string().min(1),
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ checkpointId, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const preview = engine.previewRestore(checkpointId);

      if (!preview) {
        throw new Error('Checkpoint not found');
      }

      return jsonResponse({
        filesToRestore: preview.filesToRestore.length,
        filesToDelete: preview.filesToDelete,
      });
    },
  }),
  defineTool({
    name: 'tm_diff',
    description: 'Show diff between two checkpoints or checkpoint and current',
    schema: {
      fromCheckpointId: z.string().min(1),
      toCheckpointId: z
        .string()
        .optional()
        .describe('If not provided, diffs against current state'),
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ fromCheckpointId, toCheckpointId, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const diff = engine.getDiff(fromCheckpointId, toCheckpointId);

      return jsonResponse({
        added: diff.added,
        modified: diff.modified,
        deleted: diff.deleted,
      });
    },
  }),
  defineTool({
    name: 'tm_diff_checkpoints',
    description: 'Detailed diff between two checkpoints (files + chat + terminal)',
    schema: {
      aCheckpointId: z.string().min(1),
      bCheckpointId: z.string().min(1),
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ aCheckpointId, bCheckpointId, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const fileDiff = engine.getDiff(aCheckpointId, bCheckpointId);

      const tpA = engine.getTimePoint(aCheckpointId);
      const tpB = engine.getTimePoint(bCheckpointId);
      const conversations = engine.getConversations();
      const chatBetween = conversations.filter((conversation: any) => {
        const ts = new Date(conversation.timestamp).getTime();
        const aTs = tpA ? new Date(tpA.timestamp).getTime() : 0;
        const bTs = tpB ? new Date(tpB.timestamp).getTime() : Date.now();
        return ts >= aTs && ts <= bTs;
      });

      return jsonResponse({
        fileDiffs: {
          added: fileDiff.added,
          modified: fileDiff.modified,
          deleted: fileDiff.deleted,
        },
        chatDiff: {
          messageCount: chatBetween.length,
          messages: chatBetween.slice(0, 10).map((conversation: any) => ({
            role: conversation.role,
            content: conversation.content?.slice(0, 100),
          })),
        },
        checkpointA: tpA
          ? { id: tpA.id, description: tpA.description, timestamp: tpA.timestamp }
          : null,
        checkpointB: tpB
          ? { id: tpB.id, description: tpB.description, timestamp: tpB.timestamp }
          : null,
      });
    },
  }),
  defineTool({
    name: 'tm_event_append',
    description: 'Append an event to the project timeline (chat/fs/terminal/capsule)',
    schema: {
      type: z.enum([
        'chat.message',
        'fs.change_batch',
        'term.command',
        'term.output',
        'term.exit',
        'capsule.state',
        'checkpoint.created',
      ]),
      payload: z.record(z.any()),
      projectPath: z.string().optional(),
    },
    annotations: mutatingAnnotations(),
    run: ({ type, payload, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);

      if (type === 'chat.message') {
        engine.logMessage(payload.role || 'user', payload.content || '');
      }

      if (type === 'fs.change_batch' || type === 'checkpoint.created') {
        const tp = engine.capture(payload.description || `Event: ${type}`, {
          type: 'auto',
        });
        return jsonResponse({ eventType: type, checkpointId: tp.id });
      }

      return jsonResponse({ eventType: type, logged: true });
    },
  }),
  defineTool({
    name: 'tm_timeline',
    description: 'Get timeline of events for a project',
    schema: {
      projectPath: z.string().optional(),
      limit: z.number().optional(),
      type: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ projectPath, limit, type }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const timepoints = engine.listTimePoints().slice(0, limit || 50);
      const conversations = engine.getConversations().slice(0, limit || 50);

      const timeline = [
        ...timepoints.map((tp: any) => ({
          type: 'checkpoint',
          id: tp.id,
          timestamp: tp.timestamp,
          description: tp.description,
        })),
        ...conversations.map((conversation: any) => ({
          type: 'chat.message',
          id: conversation.id,
          timestamp: conversation.timestamp,
          role: conversation.role,
          content: conversation.content?.slice(0, 200),
        })),
      ].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const filtered = type
        ? timeline.filter((event) => event.type === type)
        : timeline;
      return jsonResponse(filtered.slice(0, limit || 50));
    },
  }),
  defineTool({
    name: 'tm_search',
    description: 'Search across conversations and checkpoints',
    schema: {
      query: z.string().min(1),
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ query, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const conversationResults = engine.searchConversations(query);
      const timepoints = engine.listTimePoints().filter((tp: any) =>
        tp.description.toLowerCase().includes(query.toLowerCase())
      );

      return jsonResponse({
        conversations: conversationResults.slice(0, 10),
        checkpoints: timepoints.slice(0, 10).map((tp: any) => ({
          id: tp.id,
          description: tp.description,
          timestamp: tp.timestamp,
        })),
      });
    },
  }),
  defineTool({
    name: 'tm_find_restore',
    description: 'Search conversations and find checkpoint to restore',
    schema: {
      query: z.string().min(1),
    },
    annotations: readOnlyAnnotations(),
    run: async ({ query }, runtime) => {
      const lib = await runtime.getLib();
      const smart = new lib.SmartRestore();
      const results = smart.searchSessions(query);

      return jsonResponse(
        results.slice(0, 10).map((result: any) => ({
          sessionId: result.sessionId,
          matches: result.matches.slice(0, 3),
        }))
      );
    },
  }),
  defineTool({
    name: 'tm_log_message',
    description: 'Log a conversation message',
    schema: {
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1),
      projectPath: z.string().optional(),
    },
    annotations: mutatingAnnotations(),
    run: ({ role, content, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      engine.logMessage(role, content);
      return textResponse('Message logged');
    },
  }),
  defineTool({
    name: 'before_action',
    description: 'Call before making file changes - creates automatic checkpoint',
    schema: {
      action: z.string().min(1).describe('Description of planned action'),
      projectPath: z.string().optional(),
    },
    annotations: mutatingAnnotations(),
    run: ({ action, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const tp = engine.capture(`Before: ${action}`, { type: 'ai_action' });
      return jsonResponse({ checkpointId: tp.id, action });
    },
  }),
  defineTool({
    name: 'after_action',
    description: 'Call after making file changes - records what was done',
    schema: {
      action: z.string().min(1).describe('Description of completed action'),
      projectPath: z.string().optional(),
    },
    annotations: mutatingAnnotations(),
    run: ({ action, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const tp = engine.capture(`After: ${action}`, { type: 'ai_action' });
      return jsonResponse({ checkpointId: tp.id, action });
    },
  }),
  defineTool({
    name: 'tm_stats',
    description: 'Get TimeMachine statistics',
    schema: {
      projectPath: z.string().optional(),
    },
    annotations: readOnlyAnnotations(),
    run: ({ projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      return jsonResponse(engine.getStats());
    },
  }),

  // ── tm_ready — beads-style DAG "what's unblocked" ─────────────────────────
  // Concept ported from gastownhall/beads (MIT): show checkpoints (work items)
  // that have no unresolved blockers so agents know what to work on next.
  //
  // Convention: a checkpoint tagged `blocked` is blocked.
  //             a checkpoint tagged `done` is completed and hidden by default.
  //             a checkpoint tagged `wip` is in progress.
  //             untagged or tagged `todo` is ready.
  defineTool({
    name: 'tm_ready',
    description:
      'Show unblocked checkpoints — work items with no active blockers. ' +
      'Inspired by `bd ready` from the beads issue tracker. ' +
      'Returns checkpoints tagged todo/wip or untagged, excluding those tagged blocked or done.',
    schema: {
      projectPath: z.string().optional(),
      includeWip: z
        .boolean()
        .optional()
        .describe('Include in-progress (wip) checkpoints. Default true.'),
      limit: z.number().optional().describe('Max results. Default 20.'),
    },
    annotations: readOnlyAnnotations(),
    run: ({ projectPath, includeWip = true, limit = 20 }, runtime) => {
      const engine = runtime.getEngine(projectPath);
      const timepoints = engine.listTimePoints();

      // AnnotationStore lives on the engine — access via getAnnotationStore if exposed,
      // otherwise use the tags baked into timepoint metadata.
      const getStore = (engine as any).getAnnotationStore?.bind(engine);
      const store = getStore ? getStore() : null;

      const ready: Array<{
        id: string;
        description: string;
        timestamp: string;
        tags: string[];
        status: string;
      }> = [];

      for (const tp of timepoints) {
        const tags: string[] = store
          ? (store.get(tp.id)?.tags ?? [])
          : ((tp as any).tags ?? []);

        const isDone = tags.includes('done');
        const isBlocked = tags.includes('blocked');
        const isWip = tags.includes('wip');

        if (isDone || isBlocked) continue;
        if (isWip && !includeWip) continue;

        ready.push({
          id: tp.id,
          description: tp.description,
          timestamp: tp.timestamp,
          tags,
          status: isWip ? 'wip' : 'todo',
        });

        if (ready.length >= limit) break;
      }

      return jsonResponse({
        ready,
        total: ready.length,
        hint:
          ready.length === 0
            ? 'No unblocked work found. Tag checkpoints with todo/wip to surface them here.'
            : `${ready.length} item(s) ready. Tag with "blocked" to hide, "done" to complete.`,
      });
    },
  }),

  defineTool({
    name: 'tm_tag',
    description:
      'Add or remove a tag on a checkpoint. ' +
      'Use with status tags: todo, wip, blocked, done. ' +
      'Works with any custom tag for filtering.',
    schema: {
      checkpointId: z.string().min(1),
      tag: z.string().min(1).describe('Tag to add or remove'),
      action: z.enum(['add', 'remove']).default('add'),
      projectPath: z.string().optional(),
    },
    annotations: mutatingAnnotations(),
    run: ({ checkpointId, tag, action, projectPath }, runtime) => {
      const engine = runtime.getEngine(projectPath);

      const getStore = (engine as any).getAnnotationStore?.bind(engine);
      if (!getStore) {
        throw new Error('AnnotationStore not exposed on this engine version. Upgrade AITM.');
      }
      const store = getStore();

      if (action === 'add') {
        store.addTag(checkpointId, tag);
      } else {
        store.removeTag(checkpointId, tag);
      }

      const updated = store.get(checkpointId);
      return jsonResponse({
        checkpointId,
        tags: updated?.tags ?? [],
        action,
      });
    },
  }),
]);
