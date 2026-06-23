/**
 * register-beads-tools.ts
 *
 * Registers Beads DAG task tracker tools into the AITM MCP server.
 * These tools proxy to the AITM API server's /beads endpoints.
 * Beads is a directed acyclic graph (DAG) task tracker that models
 * task dependencies and execution order.
 */

import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import { readOnlyAnnotations, mutatingAnnotations, idempotentMutationAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse } from '../lib/tool-responses.js';

const AITM_API_URL =
  (typeof process !== 'undefined' && process.env.AITM_API_URL) ||
  'http://localhost:3001';

async function beadsGet(endpoint: string): Promise<ReturnType<typeof jsonResponse>> {
  const res = await fetch(`${AITM_API_URL}/beads${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Beads API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return jsonResponse(data);
}

async function beadsPost(endpoint: string, body: unknown): Promise<ReturnType<typeof jsonResponse>> {
  const res = await fetch(`${AITM_API_URL}/beads${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Beads API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return jsonResponse(data);
}

async function beadsPatch(endpoint: string, body?: unknown): Promise<ReturnType<typeof jsonResponse>> {
  const res = await fetch(`${AITM_API_URL}/beads${endpoint}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Beads API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return jsonResponse(data);
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
    run: async (args) => beadsPatch(`/tasks/${args.id}/ready`),
  }),

  defineTool({
    name: 'beads_mark_done',
    description: 'Mark a Beads task as done (completed). This will unblock any downstream tasks that depend on this task.',
    schema: {
      id: z.string().describe('The ID of the task to mark as done'),
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) => beadsPatch(`/tasks/${args.id}/done`),
  }),

  defineTool({
    name: 'beads_get_task',
    description: 'Get the full details of a specific Beads task by ID, including its status, dependencies, and any metadata.',
    schema: {
      id: z.string().describe('The ID of the task to retrieve'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => beadsGet(`/tasks/${args.id}`),
  }),
]);

export default registerBeadsTools;
