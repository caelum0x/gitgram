import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  thinking?: string | null;
  metadata?: Record<string, unknown> | null;
  checkpointId?: string | null;
}

export interface ContextToolCall {
  id: string;
  messageId?: string | null;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  success: boolean | null;
  error?: string | null;
  timestamp: string;
  durationMs?: number | null;
  checkpointBeforeId?: string | null;
  checkpointAfterId?: string | null;
}

export interface CheckpointInfo {
  id: string;
  projectId?: string | null;
  name?: string | null;
  message?: string | null;
  createdAt?: string | null;
  triggerType?: string | null;
  linkedCheckpointId?: string | null;
}

export interface SavedContext {
  id: string;
  name: string | null;
  summary?: string | null;
  activeFiles?: string[] | null;
  currentTask?: string | null;
  goals?: string[] | null;
  createdAt: string | null;
}

export interface ContextReplayData {
  success: boolean;
  checkpoint: CheckpointInfo;
  messages: ContextMessage[];
  toolCalls: ContextToolCall[];
  contexts: SavedContext[];
}

/**
 * A unified timeline entry (message or tool call) for rendering the conversation
 * flow in chronological order.
 */
export interface TimelineEntry {
  type: 'message' | 'tool_call' | 'checkpoint_marker';
  id: string;
  timestamp: string;
  message?: ContextMessage;
  toolCall?: ContextToolCall;
  checkpointId?: string;
  isCheckpointBoundary?: boolean;
}

export type ConversationFilter = 'all' | 'user' | 'assistant' | 'system' | 'tool_calls' | 'errors';

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch context replay data');
  return res.json();
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContextReplay(checkpointId: string | null) {
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  const [activeScrollIndex, setActiveScrollIndex] = useState<number | null>(null);

  const { data, error, isLoading, mutate } = useSWR<ContextReplayData>(
    checkpointId ? `/api/context/${checkpointId}?messageLimit=200&toolCallLimit=200&contextLimit=50` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Build unified timeline entries sorted chronologically
  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    if (!data) return [];

    const entries: TimelineEntry[] = [];

    // Add messages
    for (const msg of data.messages) {
      entries.push({
        type: 'message',
        id: msg.id,
        timestamp: msg.timestamp,
        message: msg,
        checkpointId: msg.checkpointId || undefined,
        isCheckpointBoundary: !!msg.checkpointId,
      });
    }

    // Add tool calls
    for (const tc of data.toolCalls) {
      entries.push({
        type: 'tool_call',
        id: tc.id,
        timestamp: tc.timestamp,
        toolCall: tc,
        checkpointId: tc.checkpointAfterId || tc.checkpointBeforeId || undefined,
        isCheckpointBoundary: !!(tc.checkpointAfterId || tc.checkpointBeforeId),
      });
    }

    // Sort by timestamp
    entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Insert checkpoint markers where before/after checkpoints appear
    const checkpointIds = new Set<string>();
    if (data.checkpoint?.id) checkpointIds.add(data.checkpoint.id);
    if (data.checkpoint?.linkedCheckpointId) checkpointIds.add(data.checkpoint.linkedCheckpointId);

    const withMarkers: TimelineEntry[] = [];
    const insertedMarkers = new Set<string>();

    for (const entry of entries) {
      // Insert checkpoint marker before entries that are linked to a checkpoint
      if (entry.checkpointId && !insertedMarkers.has(entry.checkpointId)) {
        insertedMarkers.add(entry.checkpointId);
        withMarkers.push({
          type: 'checkpoint_marker',
          id: `marker-${entry.checkpointId}`,
          timestamp: entry.timestamp,
          checkpointId: entry.checkpointId,
        });
      }
      withMarkers.push(entry);
    }

    return withMarkers;
  }, [data]);

  // Apply filter and search
  const filteredEntries = useMemo(() => {
    let result = timelineEntries;

    // Apply filter
    switch (filter) {
      case 'user':
        result = result.filter(
          (e) => e.type === 'message' && e.message?.role === 'user' || e.type === 'checkpoint_marker'
        );
        break;
      case 'assistant':
        result = result.filter(
          (e) => e.type === 'message' && e.message?.role === 'assistant' || e.type === 'checkpoint_marker'
        );
        break;
      case 'system':
        result = result.filter(
          (e) => e.type === 'message' && e.message?.role === 'system' || e.type === 'checkpoint_marker'
        );
        break;
      case 'tool_calls':
        result = result.filter((e) => e.type === 'tool_call' || e.type === 'checkpoint_marker');
        break;
      case 'errors':
        result = result.filter(
          (e) =>
            (e.type === 'tool_call' && e.toolCall?.success === false) ||
            e.type === 'checkpoint_marker'
        );
        break;
    }

    // Apply search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) => {
        if (e.type === 'checkpoint_marker') return true;
        if (e.type === 'message') {
          return (
            e.message?.content.toLowerCase().includes(q) ||
            e.message?.role.toLowerCase().includes(q)
          );
        }
        if (e.type === 'tool_call') {
          return (
            e.toolCall?.toolName.toLowerCase().includes(q) ||
            JSON.stringify(e.toolCall?.arguments || {}).toLowerCase().includes(q) ||
            JSON.stringify(e.toolCall?.result || '').toLowerCase().includes(q) ||
            (e.toolCall?.error || '').toLowerCase().includes(q)
          );
        }
        return false;
      });
    }

    return result;
  }, [timelineEntries, filter, searchQuery]);

  const toggleToolCallExpanded = useCallback((id: string) => {
    setExpandedToolCalls((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAllToolCalls = useCallback(() => {
    if (!data) return;
    setExpandedToolCalls(new Set(data.toolCalls.map((tc) => tc.id)));
  }, [data]);

  const collapseAllToolCalls = useCallback(() => {
    setExpandedToolCalls(new Set());
  }, []);

  // Export conversation as markdown
  const exportAsMarkdown = useCallback((): string => {
    if (!data) return '';

    const lines: string[] = [];
    lines.push(`# Conversation Context - Checkpoint ${data.checkpoint.id}`);
    lines.push('');
    if (data.checkpoint.message) {
      lines.push(`> ${data.checkpoint.message}`);
      lines.push('');
    }
    lines.push(`**Created:** ${data.checkpoint.createdAt || 'Unknown'}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const entry of timelineEntries) {
      if (entry.type === 'checkpoint_marker') {
        lines.push(`## --- Checkpoint: ${entry.checkpointId} ---`);
        lines.push('');
        continue;
      }

      const ts = new Date(entry.timestamp).toLocaleString();

      if (entry.type === 'message' && entry.message) {
        const roleLabel = entry.message.role === 'user' ? 'User' : entry.message.role === 'assistant' ? 'Assistant' : 'System';
        lines.push(`### ${roleLabel} (${ts})`);
        lines.push('');
        lines.push(entry.message.content);
        lines.push('');
      }

      if (entry.type === 'tool_call' && entry.toolCall) {
        const tc = entry.toolCall;
        const status = tc.success ? 'Success' : `Failed: ${tc.error || 'unknown'}`;
        lines.push(`### Tool Call: ${tc.toolName} (${ts}) - ${status}`);
        lines.push('');
        lines.push('**Arguments:**');
        lines.push('```json');
        lines.push(JSON.stringify(tc.arguments, null, 2));
        lines.push('```');
        lines.push('');
        if (tc.result) {
          lines.push('**Result:**');
          lines.push('```json');
          lines.push(JSON.stringify(tc.result, null, 2));
          lines.push('```');
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }, [data, timelineEntries]);

  // Copy a single message to clipboard
  const copyMessage = useCallback((message: ContextMessage) => {
    const text = `[${message.role}] ${new Date(message.timestamp).toLocaleString()}\n${message.content}`;
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  return {
    data,
    isLoading,
    isError: !!error,
    mutate,

    // Timeline
    timelineEntries,
    filteredEntries,

    // Filter & search
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,

    // Tool call expansion
    expandedToolCalls,
    toggleToolCallExpanded,
    expandAllToolCalls,
    collapseAllToolCalls,

    // Scroll tracking
    activeScrollIndex,
    setActiveScrollIndex,

    // Actions
    exportAsMarkdown,
    copyMessage,
  };
}
