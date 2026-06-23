/**
 * Context bundle generator for restoration.
 * Creates markdown context packets to inject into AI sessions after rewind.
 */

import type { Repo, CheckpointRow } from "../store/repo.js";
import type { CasStore } from "../core/cas.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isContextInjection?: boolean;
}

export interface TerminalEvent {
  command: string;
  exitCode: number;
  timestamp: string;
  stdoutPreview?: string;
  stderrPreview?: string;
}

export interface BuildContextOptions {
  repo: Repo;
  cas?: CasStore;
  projectId: string;
  checkpointId: string;
  /** Maximum number of chat messages to include */
  maxMessages?: number;
  /** Maximum number of terminal events to include */
  maxTerminalEvents?: number;
  /** Include terminal command outputs */
  includeTerminalOutputs?: boolean;
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
}

/**
 * Build a context packet markdown string for restoration.
 * This context can be injected into an AI session to resume from a checkpoint.
 */
export async function buildContextPacket(opts: BuildContextOptions): Promise<string> {
  const {
    repo,
    cas,
    projectId,
    checkpointId,
    maxMessages = 20,
    maxTerminalEvents = 10,
    includeTerminalOutputs = true,
  } = opts;

  const checkpoint = repo.getCheckpoint(projectId, checkpointId);
  if (!checkpoint) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  const project = repo.getProject(projectId);
  const projectPath = project?.rootPath || "Unknown";

  // Get recent chat messages
  const chatEvents = repo.listEvents(projectId, "chat.message", maxMessages * 2);
  const chatMessages: ChatMessage[] = chatEvents
    .filter((e) => e.payload.isContextInjection !== true)
    .slice(0, maxMessages)
    .map((e) => ({
      role: readString(e.payload, "role") === "assistant" ? "assistant" : "user",
      content:
        readString(e.payload, "content")
        ?? readString(e.payload, "contentPreview")
        ?? "[Long message stored as blob]",
      timestamp: e.timestamp,
      isContextInjection: e.payload.isContextInjection === true,
    }));

  // Get recent terminal events
  const termEvents = repo.listEvents(projectId, "term.exit", maxTerminalEvents);
  const terminalEvents: TerminalEvent[] = termEvents.slice(0, maxTerminalEvents).map((e) => ({
    command: readString(e.payload, "command") ?? "",
    exitCode: readNumber(e.payload, "exitCode") ?? 0,
    timestamp: e.timestamp,
    stderrPreview: includeTerminalOutputs ? readString(e.payload, "stderrPreview") ?? undefined : undefined,
  }));

  // Build the context markdown
  const sections: string[] = [];

  // Header
  sections.push(`# AITM Restored Context`);
  sections.push(``);
  sections.push(`**Checkpoint**: ${checkpointId}`);
  sections.push(`**Name**: ${checkpoint.name}`);
  sections.push(`**Time**: ${checkpoint.createdAt}`);
  sections.push(`**Project**: ${projectPath}`);
  sections.push(`**Scope**: ${checkpoint.scope}`);

  // Linked checkpoint info (before/after action pairs)
  if (checkpoint.linkedCheckpointId) {
    const linkedCp = repo.getCheckpoint(projectId, checkpoint.linkedCheckpointId);
    if (linkedCp) {
      sections.push(`**Linked Checkpoint**: ${linkedCp.checkpointId} ("${linkedCp.name}" at ${linkedCp.createdAt})`);
      if (checkpoint.name.startsWith("[after]")) {
        sections.push(`_This is the state AFTER the action. The "before" state is checkpoint ${linkedCp.checkpointId}._`);
      } else if (checkpoint.name.startsWith("[before]")) {
        sections.push(`_This is the state BEFORE the action. The "after" state is checkpoint ${linkedCp.checkpointId}._`);
      }
    }
  }

  sections.push(``);

  // Conversation history
  if (chatMessages.length > 0) {
    sections.push(`## Conversation (last ${chatMessages.length} messages)`);
    sections.push(``);

    chatMessages.forEach((msg, i) => {
      const roleIcon = msg.role === "user" ? "User" : "Assistant";
      const preview = truncateContent(msg.content, 500);
      sections.push(`${i + 1}) **${roleIcon}**: ${preview}`);
      sections.push(``);
    });
  } else {
    sections.push(`## Conversation`);
    sections.push(``);
    sections.push(`_No recorded conversation before this checkpoint._`);
    sections.push(``);
  }

  // Terminal commands
  if (terminalEvents.length > 0) {
    sections.push(`## Recent Terminal Commands`);
    sections.push(``);

    terminalEvents.forEach((evt) => {
      const status = evt.exitCode === 0 ? "✓" : `✗ (exit ${evt.exitCode})`;
      sections.push(`- \`${truncateContent(evt.command, 80)}\` ${status}`);
      if (evt.stderrPreview && evt.exitCode !== 0) {
        const preview = truncateContent(evt.stderrPreview, 200);
        sections.push(`  \`\`\`\n  ${preview}\n  \`\`\``);
      }
    });
    sections.push(``);
  }

  // Instructions for AI
  sections.push(`## Instruction`);
  sections.push(``);
  sections.push(`You are now operating on the restored workspace state from checkpoint "${checkpoint.name}".`);
  sections.push(`The files have been restored to their exact state at ${checkpoint.createdAt}.`);
  sections.push(``);
  sections.push(`**What to do next:**`);
  sections.push(`1. Review the conversation context above to understand what was being worked on`);
  sections.push(`2. Check the current state of files if needed`);
  sections.push(`3. Continue from this checkpoint - you can try a different approach or proceed with the original plan`);
  sections.push(``);

  return sections.join("\n");
}

/**
 * Build a minimal context packet for MCP tool responses.
 */
export function buildMinimalContextPacket(checkpoint: CheckpointRow): string {
  return [
    `# Restored to Checkpoint`,
    ``,
    `**ID**: ${checkpoint.checkpointId}`,
    `**Name**: ${checkpoint.name}`,
    `**Time**: ${checkpoint.createdAt}`,
    `**Scope**: ${checkpoint.scope}`,
    ``,
    `The workspace has been restored to this checkpoint.`,
    `Continue working from this state.`,
  ].join("\n");
}

/**
 * Extract the goal/intent from recent messages.
 */
export function extractGoalFromMessages(messages: ChatMessage[]): string | null {
  // Find the most recent user message that looks like a task/goal
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && msg.content.length > 15) {
      // Skip simple confirmations or short responses
      const lower = msg.content.toLowerCase();
      if (
        !lower.startsWith("yes") &&
        !lower.startsWith("ok") &&
        !lower.startsWith("no") &&
        !lower.startsWith("thanks")
      ) {
        return msg.content;
      }
    }
  }
  return null;
}

/**
 * Truncate content for display.
 */
function truncateContent(content: string, maxLen: number): string {
  const cleaned = content.replace(/\n/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3) + "...";
}

/**
 * Format a checkpoint for display in context.
 */
export function formatCheckpointInfo(checkpoint: CheckpointRow): string {
  return [
    `Checkpoint: ${checkpoint.checkpointId}`,
    `Name: ${checkpoint.name}`,
    `Created: ${checkpoint.createdAt}`,
    `Scope: ${checkpoint.scope}`,
  ].join("\n");
}
