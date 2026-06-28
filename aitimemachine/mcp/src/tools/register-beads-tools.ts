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
import {
  readOnlyAnnotations,
  mutatingAnnotations,
  idempotentMutationAnnotations,
  destructiveAnnotations,
} from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';
import { aitmApiRequest } from '../lib/aitm-api-client.js';
import {
  projectBeadsPayload,
  type BeadsProjectionOptions,
} from '../lib/beads-projection.js';

const LABEL = 'Beads API';

/**
 * Shared zod fields for context-efficient output trimming, mirroring the Beads
 * MCP server's brief / fields / max_description_length params. Spread into a
 * tool's schema so every read/mutation can opt into a smaller response.
 */
const projectionSchema = {
  brief: z
    .boolean()
    .optional()
    .describe('When true, return only {id, title, status, priority} per task (smallest output).'),
  briefDeps: z
    .boolean()
    .optional()
    .describe('When true, return the FULL task but collapse each dependency/dependent edge to {id, title, status, priority, dependencyType}. Ideal for inspecting a DAG node with many edges without a context blow-out. Ignored when brief is set.'),
  fields: z
    .array(z.string())
    .optional()
    .describe('Return only these fields per task (custom projection). Ignored when brief is set.'),
  maxDescriptionLength: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Truncate each task description to this many characters to save context.'),
} as const;

/** Schema fields controlling list compaction (preview + count for large lists). */
const listProjectionSchema = {
  ...projectionSchema,
  compactionThreshold: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Compact lists longer than this to a preview + total count (default 20).'),
  previewCount: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('How many tasks to include in a compacted preview (default 5).'),
} as const;

/** Extract the projection options shared by every read/mutation tool. */
function pickProjection(
  args: Partial<{
    brief: boolean;
    briefDeps: boolean;
    fields: string[];
    maxDescriptionLength: number;
    compactionThreshold: number;
    previewCount: number;
  }>,
  listLabel?: string
): BeadsProjectionOptions {
  return {
    brief: args.brief,
    briefDeps: args.briefDeps,
    fields: args.fields,
    maxDescriptionLength: args.maxDescriptionLength,
    compactionThreshold: args.compactionThreshold,
    previewCount: args.previewCount,
    listLabel,
  };
}

async function beadsGet(
  endpoint: string,
  projection?: BeadsProjectionOptions
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/beads${endpoint}`);
  return jsonResponse(projectBeadsPayload(data, projection));
}

async function beadsPost(
  endpoint: string,
  body: unknown,
  projection?: BeadsProjectionOptions
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/beads${endpoint}`, {
    method: 'POST',
    body,
  });
  return jsonResponse(projectBeadsPayload(data, projection));
}

async function beadsPatch(
  endpoint: string,
  body?: unknown,
  projection?: BeadsProjectionOptions
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/beads${endpoint}`, {
    method: 'PATCH',
    body,
  });
  return jsonResponse(projectBeadsPayload(data, projection));
}

/**
 * Shape returned by GET /beads/prime: the AITM API server forwards `bd prime`'s
 * markdown verbatim under data.content. Narrowed so the prime tool can extract
 * the markdown without `any`.
 */
interface BeadsPrimeResponse {
  readonly success?: boolean;
  readonly data?: {
    readonly format?: string;
    readonly content?: string;
  };
}

/**
 * Fetch GET /beads/prime and return its markdown content as a plain text MCP
 * response (not JSON-projected): the prime payload is human-/agent-readable
 * markdown meant to be injected directly into a session's context.
 */
async function beadsGetPrime(
  endpoint: string
): Promise<ReturnType<typeof textResponse>> {
  const data = await aitmApiRequest<BeadsPrimeResponse>(LABEL, `/beads${endpoint}`);
  const content = data?.data?.content;
  if (typeof content === 'string' && content.length > 0) {
    return textResponse(content);
  }
  // Fall back to the raw payload so an unexpected shape is still surfaced
  // (e.g. an empty prime output) rather than silently returning nothing.
  return textResponse(JSON.stringify(data, null, 2));
}

async function beadsPut(
  endpoint: string,
  body?: unknown,
  projection?: BeadsProjectionOptions
): Promise<ReturnType<typeof jsonResponse>> {
  const data = await aitmApiRequest(LABEL, `/beads${endpoint}`, {
    method: 'PUT',
    body,
  });
  return jsonResponse(projectBeadsPayload(data, projection));
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
    description: 'List all tasks in the Beads DAG task tracker, showing each task\'s status, dependencies, and position in the execution graph. Supports brief/fields/maxDescriptionLength projection and preview compaction for large lists.',
    schema: {
      ...listProjectionSchema,
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => beadsGet('/tasks', pickProjection(args, 'tasks')),
  }),

  defineTool({
    name: 'beads_create_task',
    description:
      'Create a new task in the Beads DAG task tracker with the full issue model: title plus optional design/acceptance/notes context, an issue type, a priority, and dependency task IDs that must complete before this task can run. Capturing description/design/acceptance at creation time gives downstream agents a complete spec instead of a bare title.',
    schema: {
      title: z.string().describe('Human-readable title for the task'),
      deps: z.array(z.string()).optional().describe('Array of task IDs that this task depends on (must complete first)'),
      description: z
        .string()
        .optional()
        .describe('Free-form description of the task / problem statement.'),
      design: z
        .string()
        .optional()
        .describe('Design notes: the intended approach or implementation plan.'),
      acceptanceCriteria: z
        .string()
        .optional()
        .describe('Acceptance criteria: the conditions that define the task as done.'),
      notes: z
        .string()
        .optional()
        .describe('Additional working notes / context for the task.'),
      externalRef: z
        .string()
        .optional()
        .describe("External reference linking this task to another system (e.g. 'gh-9', 'jira-ABC')."),
      priority: z
        .number()
        .int()
        .min(0)
        .max(4)
        .optional()
        .describe('Priority (0 = highest, 4 = lowest).'),
      issueType: z
        .enum(['bug', 'feature', 'task', 'epic', 'chore', 'decision'])
        .optional()
        .describe('The kind of issue (default: task).'),
      ...projectionSchema,
    },
    annotations: mutatingAnnotations(),
    run: async (args) =>
      beadsPost(
        '/tasks',
        {
          title: args.title,
          deps: args.deps,
          description: args.description,
          design: args.design,
          acceptanceCriteria: args.acceptanceCriteria,
          notes: args.notes,
          externalRef: args.externalRef,
          priority: args.priority,
          issueType: args.issueType,
        },
        pickProjection(args)
      ),
  }),

  defineTool({
    name: 'beads_mark_ready',
    description: 'Mark a Beads task as ready to execute. The task must have all its dependencies already completed.',
    schema: {
      id: z.string().describe('The ID of the task to mark as ready'),
      ...projectionSchema,
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) =>
      beadsPut(
        `/tasks/${encodeURIComponent(args.id)}/ready`,
        undefined,
        pickProjection(args)
      ),
  }),

  defineTool({
    name: 'beads_claim',
    description:
      'Atomically claim a Beads task for work: set the assignee to the configured actor AND move it to in_progress in one compare-and-swap step. This is the multi-agent-safe "grab the next piece of work" primitive — two agents racing on the same task cannot both win. The claim is idempotent when the task is already claimed by the same actor; when another actor already holds it the AITM API returns 409 (surfaced here as an error) so the agent should retry a different ready task. Pair with beads_ready to find candidates, then beads_claim to lock one in.',
    schema: {
      id: z.string().describe('The ID of the task to claim for work'),
      ...projectionSchema,
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) =>
      beadsPut(
        `/tasks/${encodeURIComponent(args.id)}/claim`,
        undefined,
        pickProjection(args)
      ),
  }),

  defineTool({
    name: 'beads_mark_done',
    description: 'Mark a Beads task as done (completed). This will unblock any downstream tasks that depend on this task.',
    schema: {
      id: z.string().describe('The ID of the task to mark as done'),
      ...projectionSchema,
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) =>
      beadsPut(
        `/tasks/${encodeURIComponent(args.id)}/done`,
        undefined,
        pickProjection(args)
      ),
  }),

  defineTool({
    name: 'beads_get_task',
    description: 'Get the full details of a specific Beads task by ID, including its status, dependencies, and any metadata. Use brief/fields/maxDescriptionLength to trim the response.',
    schema: {
      id: z.string().describe('The ID of the task to retrieve'),
      ...projectionSchema,
    },
    annotations: readOnlyAnnotations(),
    run: async (args) =>
      beadsGet(
        `/tasks/${encodeURIComponent(args.id)}`,
        pickProjection(args)
      ),
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
      ...listProjectionSchema,
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
        })}`,
        pickProjection(args, 'ready tasks')
      ),
  }),

  defineTool({
    name: 'beads_blocked',
    description:
      'List Beads tasks that are currently blocked, along with the dependencies blocking each one. Use this to see what is stuck in the DAG and why, so an operator or agent can unblock autonomous work. Supports brief/fields/maxDescriptionLength projection and preview compaction.',
    schema: {
      ...listProjectionSchema,
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => beadsGet('/blocked', pickProjection(args, 'blocked tasks')),
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
      ...projectionSchema,
    },
    annotations: mutatingAnnotations(),
    run: async (args) =>
      beadsPost(
        `/tasks/${encodeURIComponent(args.id)}/deps`,
        {
          dependsOn: args.dependsOn,
          type: args.type,
        },
        pickProjection(args)
      ),
  }),

  defineTool({
    name: 'beads_update_task',
    description:
      'Update editable fields of an existing Beads task: core fields (title, priority, assignee, status, labels) plus the rich issue model (description, design, acceptanceCriteria, notes, externalRef, issueType). Only the fields you provide are changed; at least one field is required.',
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
      description: z
        .string()
        .optional()
        .describe('New description / problem statement for the task.'),
      design: z
        .string()
        .optional()
        .describe('New design notes: the intended approach or implementation plan.'),
      acceptanceCriteria: z
        .string()
        .optional()
        .describe('New acceptance criteria defining when the task is done.'),
      notes: z
        .string()
        .optional()
        .describe('New working notes / context for the task.'),
      externalRef: z
        .string()
        .optional()
        .describe("New external reference (e.g. 'gh-9', 'jira-ABC')."),
      issueType: z
        .enum(['bug', 'feature', 'task', 'epic', 'chore', 'decision'])
        .optional()
        .describe('New issue type.'),
      ...projectionSchema,
    },
    annotations: mutatingAnnotations(),
    run: async (args) =>
      beadsPatch(
        `/tasks/${encodeURIComponent(args.id)}`,
        {
          title: args.title,
          priority: args.priority,
          assignee: args.assignee,
          status: args.status,
          labels: args.labels,
          description: args.description,
          design: args.design,
          acceptanceCriteria: args.acceptanceCriteria,
          notes: args.notes,
          externalRef: args.externalRef,
          issueType: args.issueType,
        },
        pickProjection(args)
      ),
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
      ...projectionSchema,
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) =>
      beadsPost(
        `/tasks/${encodeURIComponent(args.id)}/close`,
        {
          reason: args.reason,
        },
        pickProjection(args)
      ),
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
      ...projectionSchema,
    },
    annotations: idempotentMutationAnnotations(),
    run: async (args) =>
      beadsPost(
        `/tasks/${encodeURIComponent(args.id)}/reopen`,
        {
          reason: args.reason,
        },
        pickProjection(args)
      ),
  }),

  defineTool({
    name: 'beads_prime',
    description:
      'Bootstrap a fresh agent at session start with one call: returns the Beads workflow "prime" context as markdown — the current ready work plus the conventions and close protocol an agent should follow. This is the single highest-signal "orient me" primitive for an autonomous agent; inject the returned markdown directly into the session context instead of hand-assembling it.',
    schema: {
      mode: z
        .enum(['full', 'mcp'])
        .optional()
        .describe(
          'Force the command reference style: "full" = the complete CLI command reference; "mcp" = minimal MCP-mode reminders. Defaults to auto-detection on the server.'
        ),
      stealth: z
        .boolean()
        .optional()
        .describe('Stealth mode: omit git operations from the close protocol.'),
      memoriesOnly: z
        .boolean()
        .optional()
        .describe('Output only the persistent memories block (for compact / context-refresh hooks).'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) =>
      beadsGetPrime(
        `/prime${buildQuery({
          mode: args.mode,
          stealth: args.stealth ? '1' : undefined,
          memoriesOnly: args.memoriesOnly ? '1' : undefined,
        })}`
      ),
  }),

  defineTool({
    name: 'beads_deps_tree',
    description:
      'Get the recursive, transitive dependency tree rooted at a Beads task in ONE call (vs the flat one-hop edge list). Lets an agent plan multi-step work by seeing every transitive blocker (or dependent) of a task. direction=down (default) returns the blockers the task depends on; up returns the dependents that depend on it; both returns both.',
    schema: {
      id: z.string().describe('The task ID to root the dependency tree at'),
      direction: z
        .enum(['up', 'down', 'both'])
        .optional()
        .describe(
          'down (default): transitive blockers this task depends on; up: transitive dependents; both: both directions.'
        ),
      maxDepth: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Bound the traversal depth (1-100).'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) =>
      beadsGet(
        `/deps/tree${buildQuery({
          id: args.id,
          direction: args.direction,
          maxDepth: args.maxDepth,
        })}`
      ),
  }),

  defineTool({
    name: 'beads_deps_cycles',
    description:
      'Detect dependency cycles across the entire Beads DAG in one call. A cycle means the graph is broken (no valid execution order exists), so an orchestrator should run this to catch a corrupted DAG before scheduling autonomous work.',
    schema: {},
    annotations: readOnlyAnnotations(),
    run: async () => beadsGet('/deps/cycles'),
  }),

  defineTool({
    name: 'beads_stale',
    description:
      'Query Beads tasks that have gone quiet (no recent activity) so an orchestrator can re-prioritise or garbage-collect abandoned work. A cheap queue-hygiene primitive for long-running autonomous agents. Filter by a staleness threshold in days, a status, and a result limit.',
    schema: {
      days: z
        .number()
        .int()
        .min(1)
        .max(3650)
        .optional()
        .describe('Staleness threshold in days (default 30 on the server).'),
      status: z
        .enum(['open', 'in_progress', 'blocked', 'deferred'])
        .optional()
        .describe('Restrict to tasks in this status.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Maximum number of stale tasks to return (1-1000).'),
      ...listProjectionSchema,
    },
    annotations: readOnlyAnnotations(),
    run: async (args) =>
      beadsGet(
        `/stale${buildQuery({
          days: args.days,
          status: args.status,
          limit: args.limit,
        })}`,
        pickProjection(args, 'stale tasks')
      ),
  }),

  defineTool({
    name: 'beads_admin',
    description:
      'Run health diagnostics (and optional repair) on the Beads DAG: detect orphaned dependency references, duplicate issues, test pollution, and git-conflict cruft, keeping an always-on agent\'s task DB from silently degrading. READ-ONLY by default — set fix to auto-repair fixable findings, or clean to delete detected pollution/stale artifacts. Use deep for a slower full graph-integrity validation.',
    schema: {
      check: z
        .enum(['validate', 'pollution', 'artifacts'])
        .optional()
        .describe(
          'Run a single focused check instead of the full sanity sweep: validate (data integrity: orphans/duplicates/conflicts), pollution (leaked test issues), or artifacts (stale files/cruft).'
        ),
      fix: z
        .boolean()
        .optional()
        .describe('Auto-repair fixable validate findings (e.g. orphaned dependency refs). Mutating.'),
      clean: z
        .boolean()
        .optional()
        .describe('Delete detected test pollution / stale artifacts. Mutating.'),
      deep: z
        .boolean()
        .optional()
        .describe('Run the slower full graph-integrity validation (parent/dependency/epic consistency).'),
    },
    // fix/clean delete or rewrite DAG records; mark destructive so clients can
    // gate it. Idempotent: re-running after a repair is a no-op.
    annotations: destructiveAnnotations(),
    run: async (args) =>
      beadsPost('/admin', {
        check: args.check,
        fix: args.fix,
        clean: args.clean,
        deep: args.deep,
      }),
  }),
]);

export default registerBeadsTools;
