/**
 * register-beads-tools.ts
 *
 * Registers Beads DAG task tracker tools into the AITM MCP server.
 * These tools proxy to the AITM API server's /beads endpoints.
 * Beads is a directed acyclic graph (DAG) task tracker that models
 * task dependencies and execution order.
 *
 * The AITM API server protects /beads/* with `apiKeyAuth`, so every request
 * must carry the AITM_API_KEY credential (X-API-Key header). The shared
 * aitm-api-client centralises base-URL resolution, auth headers, and
 * actionable error messages.
 */

import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import { readOnlyAnnotations, mutatingAnnotations, idempotentMutationAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse } from '../lib/tool-responses.js';
import { aitmApiRequest } from '../lib/aitm-api-client.js';

const LABEL = 'Beads API';

async function beadsGet(
  endpoint: string
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/beads${endpoint}`);
  return jsonResponse(data);
}

async function beadsPost(
  endpoint: string,
  body: unknown
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/beads${endpoint}`, {
    method: 'POST',
    body,
  });
  return jsonResponse(data);
}

async function beadsPatch(
  endpoint: string,
  body?: unknown
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/beads${endpoint}`, {
    method: 'PATCH',
    body,
  });
  return jsonResponse(data);
}

async function beadsPut(
  endpoint: string,
  body?: unknown
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/beads${endpoint}`, {
    method: 'PUT',
    body,
  });
  return jsonResponse(data);
}

/**
 * Build a query-string from a set of params, skipping undefined/empty values
 * and joining array values with commas. Returns "" when no params are set.
 */
function buildQuery(
  params: Readonly<Record<string, string | number | boolean | string[] | undefined>>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      const joined = value.map((item) => item.trim()).filter(Boolean).join(',');
      if (joined.length > 0) {
        search.set(key, joined);
      }
      continue;
    }
    const str = String(value).trim();
    if (str.length > 0) {
      search.set(key, str);
    }
  }
  const qs = search.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

export const registerBeadsTools = createToolRegistrar([
  defineTool({
    name: 'beads_list_tasks',
    description: 'List all tasks in the Beads DAG task tracker, showing each task\'s status, dependencies, and position in the execution graph.',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async () => beadsGet('/tasks'),
  }),

  defineTool({
    name: 'beads_create_task',
    description: 'Create a new task in the Beads DAG task tracker with an optional list of dependency task IDs that must complete before this task can run.',
    schema: {
      title: z.string().describe('Human-readable title for the task'),
      deps: z.array(z.string()).optional().describe('Array of task IDs that this task depends on (must complete first)'),
    },
    annotations: mutatingAnnotations(),
    run: async (args) => beadsPost('/tasks', args),
  }),

  defineTool({
    name: 'beads_mark_ready',
    description: 'Mark a Beads task as ready to execute. The task must have all its dependencies already completed.',
    schema: {
      id: z.string().describe('The ID of the task to mark as ready'),
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) => beadsPut(`/tasks/${encodeURIComponent(args.id)}/ready`),
  }),

  defineTool({
    name: 'beads_mark_done',
    description: 'Mark a Beads task as done (completed). This will unblock any downstream tasks that depend on this task.',
    schema: {
      id: z.string().describe('The ID of the task to mark as done'),
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) => beadsPut(`/tasks/${encodeURIComponent(args.id)}/done`),
  }),

  defineTool({
    name: 'beads_get_task',
    description: 'Get the full details of a specific Beads task by ID, including its status, dependencies, and any metadata.',
    schema: {
      id: z.string().describe('The ID of the task to retrieve'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => beadsGet(`/tasks/${encodeURIComponent(args.id)}`),
  }),

  defineTool({
    name: 'beads_ready',
    description:
      'Query the Beads work queue for tasks that are unblocked and ready to work on right now (all dependencies satisfied). This is the core "what can I work on next?" primitive for autonomous agents. Supports filtering by priority, assignee, labels, and a result limit.',
    schema: {
      priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe('Filter to a single priority level (0 = highest, 4 = lowest)'),
      assignee: z
        .string()
        .optional()
        .describe('Filter to tasks assigned to this assignee'),
      unassigned: z
        .boolean()
        .optional()
        .describe('When true, return only tasks with no assignee'),
      labels: z
        .array(z.string())
        .optional()
        .describe('AND filter: task must have ALL of these labels'),
      labelsAny: z
        .array(z.string())
        .optional()
        .describe('OR filter: task must have AT LEAST ONE of these labels'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of ready tasks to return (1-100)'),
      sort: z
        .enum(['priority', 'hybrid', 'oldest'])
        .optional()
        .describe('Sort policy for the returned ready tasks'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) =>
      beadsGet(
        `/ready${buildQuery({
          priority: args.priority,
          assignee: args.assignee,
          unassigned: args.unassigned,
          labels: args.labels,
          labelsAny: args.labelsAny,
          limit: args.limit,
          sort: args.sort,
        })}`
      ),
  }),

  defineTool({
    name: 'beads_blocked',
    description:
      'List Beads tasks that are currently blocked, along with the dependencies blocking each one. Use this to see what is stuck in the DAG and why, so an operator or agent can unblock autonomous work.',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async () => beadsGet('/blocked'),
  }),

  defineTool({
    name: 'beads_stats',
    description:
      'Get aggregate statistics for the Beads DAG: totals by state (open, in_progress, closed, blocked), the count of ready tasks, and the average lead time. A cheap, high-signal health check for an orchestrator or dashboard.',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async () => beadsGet('/stats'),
  }),

  defineTool({
    name: 'beads_add_dependency',
    description:
      'Add a dependency edge from one Beads task to another after creation. Use this when an agent discovers a blocker mid-task (a discovered-from edge) or otherwise needs to refine the DAG. The dependency type defaults to "blocks".',
    schema: {
      id: z.string().describe('The task that has the dependency'),
      dependsOn: z
        .string()
        .describe('The task that must be resolved first (the dependency)'),
      type: z
        .enum(['blocks', 'related', 'parent-child', 'discovered-from'])
        .optional()
        .describe('The kind of dependency edge to create (default: blocks)'),
    },
    annotations: mutatingAnnotations(),
    run: async (args) =>
      beadsPost(`/tasks/${encodeURIComponent(args.id)}/deps`, {
        dependsOn: args.dependsOn,
        type: args.type,
      }),
  }),

  defineTool({
    name: 'beads_update_task',
    description:
      'Update editable fields of an existing Beads task: title, priority, assignee, status, and/or labels. Only the fields you provide are changed; at least one field is required.',
    schema: {
      id: z.string().describe('The ID of the task to update'),
      title: z.string().optional().describe('New title for the task'),
      priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe('New priority (0 = highest, 4 = lowest)'),
      assignee: z
        .string()
        .optional()
        .describe('New assignee (pass an empty string to clear the assignee)'),
      status: z
        .string()
        .optional()
        .describe('New status (e.g. open, in_progress, blocked, deferred, closed)'),
      labels: z
        .array(z.string())
        .optional()
        .describe('Replace the full set of labels with this list'),
    },
    annotations: mutatingAnnotations(),
    run: async (args) =>
      beadsPatch(`/tasks/${encodeURIComponent(args.id)}`, {
        title: args.title,
        priority: args.priority,
        assignee: args.assignee,
        status: args.status,
        labels: args.labels,
      }),
  }),

  defineTool({
    name: 'beads_close_task',
    description:
      'Close (complete) a Beads task with an optional human-readable reason that is recorded for the audit trail. Use this to explain why an agent finished or abandoned the work.',
    schema: {
      id: z.string().describe('The ID of the task to close'),
      reason: z
        .string()
        .optional()
        .describe('Why the task is being closed (default: "Completed")'),
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) =>
      beadsPost(`/tasks/${encodeURIComponent(args.id)}/close`, {
        reason: args.reason,
      }),
  }),

  defineTool({
    name: 'beads_reopen_task',
    description:
      'Reopen a previously closed Beads task, for example when a fix regresses and the work must be revisited. An optional reason is recorded.',
    schema: {
      id: z.string().describe('The ID of the task to reopen'),
      reason: z
        .string()
        .optional()
        .describe('Why the task is being reopened'),
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) =>
      beadsPost(`/tasks/${encodeURIComponent(args.id)}/reopen`, {
        reason: args.reason,
      }),
  }),
]);

export default registerBeadsTools;
