import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolRuntimeContext } from '../lib/tool-runtime.js';

/**
 * Prompt templates exposed by the AITM MCP server.
 *
 * Prompts are reusable, parameterized message templates that an MCP client
 * (Claude Desktop, Claude Code, etc.) can surface to the user as slash-commands
 * or quick actions. Each prompt produces a `GetPromptResult` whose `messages`
 * are injected into the conversation.
 *
 * MCP prompt arguments must be string-shaped (PromptArgsRawShape), so every
 * argument schema below uses `z.string()`. Optional arguments use `.optional()`
 * and are defaulted inside the callback.
 */

type PromptMessage = GetPromptResult['messages'][number];

/** Build a single user-role text message. */
function userText(text: string): PromptMessage {
  return {
    role: 'user',
    content: { type: 'text', text: text.trim() },
  };
}

/** Build a single assistant-role text message (used to prime the model). */
function assistantText(text: string): PromptMessage {
  return {
    role: 'assistant',
    content: { type: 'text', text: text.trim() },
  };
}

/** Wrap one or more messages into a GetPromptResult with a description. */
function prompt(description: string, messages: PromptMessage[]): GetPromptResult {
  return { description, messages };
}

/**
 * Register all AITM prompt templates on the MCP server.
 *
 * Mirrors the resource/tool registrar pattern: a plain function that takes the
 * `McpServer` plus the shared `ToolRuntimeContext` so prompts can reference the
 * current project path and other runtime state.
 */
export function registerPrompts(
  server: McpServer,
  runtime: ToolRuntimeContext
): void {
  // 1. create-checkpoint -----------------------------------------------------
  server.prompt(
    'create-checkpoint',
    'Guide the assistant through creating a well-described AITM checkpoint of the current project state.',
    {
      label: z
        .string()
        .describe('Short human-readable label for the checkpoint (e.g. "before refactor").'),
      projectPath: z
        .string()
        .optional()
        .describe('Project path to checkpoint. Defaults to the current AITM project.'),
    },
    ({ label, projectPath }): GetPromptResult => {
      const target = projectPath || runtime.getCurrentProjectPath();
      return prompt('Create an AITM checkpoint with a meaningful description.', [
        userText(`
I want to save a checkpoint of my work using AITimeMachine.

Project: ${target}
Label: ${label}

Please:
1. Use the AITM tools to inspect what has changed since the last checkpoint.
2. Write a concise but descriptive checkpoint message that captures the intent
   of the current changes (not just "wip"). Reference affected files/modules.
3. Create the checkpoint using the appropriate AITM tool, passing the label
   "${label}" and your generated description.
4. Confirm the checkpoint id and summarize what was saved.
`),
      ]);
    }
  );

  // 2. review-session --------------------------------------------------------
  server.prompt(
    'review-session',
    'Review a captured AITM session: summarize what changed, flag risks, and suggest next steps.',
    {
      sessionId: z
        .string()
        .describe('The AITM session id to review.'),
      focus: z
        .string()
        .optional()
        .describe('Optional area to focus the review on (e.g. "security", "tests").'),
    },
    ({ sessionId, focus }): GetPromptResult => {
      const focusLine = focus
        ? `\nPay particular attention to: ${focus}.`
        : '';
      return prompt('Review the contents and diff of an AITM session.', [
        assistantText(`
I am an AITM session reviewer. I will load the session, examine its file
diffs and metadata, and produce an actionable review.
`),
        userText(`
Review AITM session "${sessionId}".${focusLine}

Please:
1. Load the session via the AITM tools and list the files it captured.
2. Examine the diff/contents to understand what changed and why.
3. Produce a structured review with these sections:
   - Summary: one paragraph on what this session accomplishes.
   - Notable changes: bullet list of the most important edits.
   - Risks / concerns: bugs, missing tests, security or migration hazards.
   - Suggested next steps: concrete follow-ups.
Keep it concise and reference specific files where relevant.
`),
      ]);
    }
  );

  // 3. restore-safely --------------------------------------------------------
  server.prompt(
    'restore-safely',
    'Restore the project to a previous AITM session/checkpoint with a safety checklist to avoid data loss.',
    {
      sessionId: z
        .string()
        .describe('The AITM session or checkpoint id to restore to.'),
      projectPath: z
        .string()
        .optional()
        .describe('Project path to restore. Defaults to the current AITM project.'),
    },
    ({ sessionId, projectPath }): GetPromptResult => {
      const target = projectPath || runtime.getCurrentProjectPath();
      return prompt('Safely restore a project to a prior AITM state.', [
        userText(`
I want to restore my project to AITM session "${sessionId}".

Project: ${target}

This is potentially destructive, so proceed carefully:
1. FIRST, create a fresh checkpoint of the CURRENT state so nothing is lost.
   Use a label like "pre-restore safety net".
2. Show me a diff/summary between the current state and session "${sessionId}"
   so I understand exactly what will change.
3. Call out any uncommitted work, untracked files, or files that exist now but
   not in the target session (these may be removed).
4. Ask me to confirm before performing the restore.
5. After I confirm, perform the restore using the AITM restore tool and report
   the result, including how to undo it via the safety checkpoint from step 1.
`),
      ]);
    }
  );

  // 4. summarize-changes -----------------------------------------------------
  server.prompt(
    'summarize-changes',
    'Summarize what changed across recent AITM sessions, suitable for a commit message or standup update.',
    {
      since: z
        .string()
        .optional()
        .describe('Session id, checkpoint, or timeframe to summarize from. Defaults to the latest checkpoint.'),
      style: z
        .string()
        .optional()
        .describe('Output style: "commit", "changelog", or "standup". Defaults to "commit".'),
    },
    ({ since, style }): GetPromptResult => {
      const styleChoice = (style || 'commit').toLowerCase();
      const sinceLine = since
        ? `since ${since}`
        : 'since the most recent checkpoint';
      return prompt('Summarize recent AITM changes in the requested style.', [
        userText(`
Summarize the changes captured by AITimeMachine ${sinceLine}.

Project: ${runtime.getCurrentProjectPath()}
Requested style: ${styleChoice}

Please:
1. Use the AITM tools to gather the relevant sessions/diffs in range.
2. Group related changes by feature or module.
3. Produce output in the "${styleChoice}" style:
   - commit: a conventional-commit subject line plus a short body.
   - changelog: grouped "Added / Changed / Fixed / Removed" bullets.
   - standup: 2-4 plain bullets on what was done and what's next.
Be specific and avoid filler. Reference files where it adds clarity.
`),
      ]);
    }
  );

  // 5. debug-conflict --------------------------------------------------------
  server.prompt(
    'debug-conflict',
    'Help diagnose and resolve a conflict between the current working tree and an AITM session/restore.',
    {
      sessionId: z
        .string()
        .optional()
        .describe('The AITM session id involved in the conflict, if known.'),
      details: z
        .string()
        .optional()
        .describe('Any error message or description of the conflict observed.'),
    },
    ({ sessionId, details }): GetPromptResult => {
      const sessionLine = sessionId
        ? `Session involved: ${sessionId}\n`
        : '';
      const detailLine = details
        ? `Observed problem:\n${details}\n`
        : '';
      return prompt('Diagnose and resolve an AITM restore/state conflict.', [
        assistantText(`
I am an AITM conflict-resolution assistant. I diagnose root cause before
suggesting any fix, and I never discard work without an explicit confirmation.
`),
        userText(`
I'm hitting a conflict with AITimeMachine.

Project: ${runtime.getCurrentProjectPath()}
${sessionLine}${detailLine}
Please:
1. Inspect the current working-tree state and the relevant AITM session(s).
2. Identify the ROOT CAUSE of the conflict (diverged files, uncommitted
   changes, stale blobs, hash mismatch, etc.) before proposing fixes.
3. Lay out 1-3 resolution options with their trade-offs and what each will
   keep vs. discard.
4. Recommend the safest option and, before acting, ensure a checkpoint of the
   current state exists so the conflict resolution itself is reversible.
`),
      ]);
    }
  );

  // 6. onboard-project -------------------------------------------------------
  server.prompt(
    'onboard-project',
    'Onboard a project into AITimeMachine: explain the setup, capture an initial baseline, and verify tracking.',
    {
      projectPath: z
        .string()
        .optional()
        .describe('Project path to onboard. Defaults to the current AITM project.'),
    },
    ({ projectPath }): GetPromptResult => {
      const target = projectPath || runtime.getCurrentProjectPath();
      return prompt('Set up AITimeMachine tracking for a project.', [
        userText(`
Help me onboard this project into AITimeMachine.

Project: ${target}

Please walk me through and execute the setup:
1. Confirm whether AITM is already tracking this project; if not, initialize it.
2. Explain briefly how AITM checkpoints and sessions work for this repo
   (what gets captured, where state is stored, how to restore).
3. Create an initial baseline checkpoint labeled "baseline" so there is always
   a known-good state to return to.
4. Verify tracking is working by listing the project's sessions/checkpoints.
5. Suggest a lightweight workflow (e.g. checkpoint before risky changes) and
   point out the most useful AITM tools for day-to-day use.
`),
      ]);
    }
  );
}
