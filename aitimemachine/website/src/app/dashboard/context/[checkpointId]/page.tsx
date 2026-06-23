'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns,
  Copy,
  Clock,
  FileCode,
  FileSearch,
  GitBranch,
  MessageSquare,
  Minimize2,
  Monitor,
  RefreshCw,
  AlertCircle,
  Share2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatRelativeTime } from '@/lib/utils';
import ContextReplayPanel from '@/components/ContextReplayPanel';
import DiffViewer from '@/components/DiffViewer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useContextReplay } from '@/hooks/useContextReplay';
import type { TimelineEntry, ContextMessage, ContextToolCall } from '@/hooks/useContextReplay';

// ---------------------------------------------------------------------------
// Thread visualization helpers
// ---------------------------------------------------------------------------

interface ThreadGroup {
  id: string;
  entries: TimelineEntry[];
  role?: string;
  type: 'message_thread' | 'tool_sequence' | 'checkpoint' | 'mixed';
}

function groupIntoThreads(entries: TimelineEntry[]): ThreadGroup[] {
  const groups: ThreadGroup[] = [];
  let current: TimelineEntry[] = [];
  let currentType: ThreadGroup['type'] = 'mixed';
  let currentRole: string | undefined;

  const flush = () => {
    if (current.length > 0) {
      groups.push({
        id: `thread-${groups.length}`,
        entries: [...current],
        role: currentRole,
        type: currentType,
      });
      current = [];
      currentType = 'mixed';
      currentRole = undefined;
    }
  };

  for (const entry of entries) {
    if (entry.type === 'checkpoint_marker') {
      flush();
      groups.push({
        id: `cp-${entry.checkpointId}`,
        entries: [entry],
        type: 'checkpoint',
      });
      continue;
    }

    if (entry.type === 'message') {
      const role = entry.message?.role;
      if (currentType === 'message_thread' && currentRole === role) {
        current.push(entry);
      } else {
        flush();
        currentType = 'message_thread';
        currentRole = role;
        current.push(entry);
      }
    } else if (entry.type === 'tool_call') {
      if (currentType === 'tool_sequence') {
        current.push(entry);
      } else {
        flush();
        currentType = 'tool_sequence';
        current.push(entry);
      }
    }
  }

  flush();
  return groups;
}

// ---------------------------------------------------------------------------
// Message thread component
// ---------------------------------------------------------------------------

// Individual message bubble in a thread (extracted to use hooks properly)
function ThreadMessageBubble({
  msg,
  idx,
  total,
  isUser,
  isAssistant,
  isSystem,
  onCopy,
}: {
  msg: ContextMessage;
  idx: number;
  total: number;
  isUser: boolean;
  isAssistant: boolean;
  isSystem: boolean;
  onCopy: (text: string) => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const content = msg.content || '';
  const isLong = content.length > 500;
  const display = isLong && !showFull ? content.slice(0, 500) + '...' : content;

  return (
    <div className="group relative">
      <div
        className={cn(
          'rounded-2xl px-4 py-3 transition-colors',
          isUser && 'rounded-br-md bg-blue-600/90 text-white',
          isAssistant && 'rounded-bl-md border border-gray-700 bg-gray-800 text-gray-200',
          isSystem && 'rounded-lg bg-gray-800/50 px-5 py-2 text-center text-sm text-gray-400 italic',
          idx > 0 && isUser && 'rounded-tr-md',
          idx > 0 && isAssistant && 'rounded-tl-md',
        )}
      >
        {/* Timestamp */}
        <div className={cn(
          'mb-1 text-[10px]',
          isUser ? 'text-blue-200/60' : 'text-gray-600'
        )}>
          {formatRelativeTime(msg.timestamp)}
        </div>

        {/* Content */}
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {display}
        </div>

        {isLong && (
          <button
            className={cn(
              'mt-1 text-xs font-medium',
              isUser ? 'text-blue-200 hover:text-white' : 'text-gray-500 hover:text-gray-300'
            )}
            onClick={() => setShowFull(!showFull)}
          >
            {showFull ? 'Show less' : 'Show more'}
          </button>
        )}

        {/* Checkpoint badge */}
        {msg.checkpointId && (
          <div className="mt-2">
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                isUser ? 'border-blue-400/40 text-blue-200' : 'border-green-500/40 text-green-400'
              )}
            >
              <GitBranch className="mr-1 h-2.5 w-2.5" />
              Linked checkpoint
            </Badge>
          </div>
        )}
      </div>

      {/* Hover copy button */}
      <button
        className="absolute -top-1 right-1 hidden rounded bg-gray-700 p-1 text-gray-400 hover:text-white group-hover:block"
        onClick={() => onCopy(content)}
        title="Copy message"
      >
        <Copy className="h-3 w-3" />
      </button>

      {/* Thread connector between messages */}
      {idx < total - 1 && (
        <div className={cn(
          'my-0.5 h-2',
          isUser ? 'ml-auto mr-4' : isAssistant ? 'ml-4' : 'mx-auto',
          'w-px bg-gray-700/50'
        )} />
      )}
    </div>
  );
}

function MessageThread({ messages, onCopy }: { messages: ContextMessage[]; onCopy: (text: string) => void }) {
  if (messages.length === 0) return null;
  const role = messages[0].role;
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';
  const isSystem = role === 'system';

  return (
    <div className={cn('flex w-full', isUser && 'justify-end', isAssistant && 'justify-start', isSystem && 'justify-center')}>
      <div className={cn('max-w-[85%] space-y-1', isUser && 'items-end')}>
        {/* Role header */}
        <div className={cn(
          'flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider',
          isUser && 'justify-end text-blue-300',
          isAssistant && 'text-gray-500',
          isSystem && 'justify-center text-gray-600',
        )}>
          {isUser && <MessageSquare className="h-3 w-3" />}
          {isAssistant && <Bot className="h-3 w-3" />}
          {isSystem && <Monitor className="h-3 w-3" />}
          {role}
          {messages.length > 1 && (
            <span className="font-normal normal-case text-gray-600">({messages.length} messages)</span>
          )}
        </div>

        {/* Messages */}
        {messages.map((msg, idx) => (
          <ThreadMessageBubble
            key={msg.id}
            msg={msg}
            idx={idx}
            total={messages.length}
            isUser={isUser}
            isAssistant={isAssistant}
            isSystem={isSystem}
            onCopy={onCopy}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call sequence component
// ---------------------------------------------------------------------------

function ToolCallSequence({ toolCalls }: { toolCalls: ContextToolCall[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const successCount = toolCalls.filter(t => t.success === true).length;
  const failedCount = toolCalls.filter(t => t.success === false).length;

  return (
    <div className="space-y-1">
      {/* Sequence header */}
      <div className="flex items-center gap-2 px-1 text-[10px] text-gray-500">
        <Wrench className="h-3 w-3" />
        <span className="font-semibold uppercase tracking-wider">Tool Calls</span>
        <span className="font-normal">
          {toolCalls.length} call{toolCalls.length !== 1 ? 's' : ''}
        </span>
        {successCount > 0 && (
          <span className="flex items-center gap-0.5 text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            {successCount}
          </span>
        )}
        {failedCount > 0 && (
          <span className="flex items-center gap-0.5 text-red-400">
            <XCircle className="h-3 w-3" />
            {failedCount}
          </span>
        )}
      </div>

      {/* Tool calls */}
      <div className="space-y-1 rounded-lg border border-gray-800 bg-gray-900/40 p-2">
        {toolCalls.map((tc, idx) => {
          const isExpanded = expandedIds.has(tc.id);
          const args = (tc.arguments || {}) as Record<string, unknown>;
          const toolLower = tc.toolName.toLowerCase();
          const isFileOp = toolLower.includes('file') || toolLower.includes('write') || toolLower.includes('edit') || toolLower.includes('create') || toolLower.includes('read');
          const isBash = toolLower.includes('bash') || toolLower.includes('terminal');
          const argPath = (args.path || args.file_path || args.filePath) as string | undefined;
          const argCmd = args.command as string | undefined;

          const durationStr = tc.durationMs != null
            ? tc.durationMs < 1000 ? `${tc.durationMs}ms` : `${(tc.durationMs / 1000).toFixed(1)}s`
            : null;

          return (
            <div key={tc.id}>
              {/* Connector */}
              {idx > 0 && (
                <div className="ml-4 h-1.5 w-px bg-gray-700/50" />
              )}

              {/* Tool call row */}
              <div
                className={cn(
                  'rounded-lg border-l-4 transition-all',
                  tc.success === false ? 'border-l-red-500/60' : tc.success === true ? 'border-l-green-500/60' : 'border-l-gray-600/60',
                  isExpanded && 'ring-1 ring-gray-700/50'
                )}
              >
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-gray-800/40"
                  onClick={() => toggleExpand(tc.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-gray-500" />
                  )}

                  {/* Tool icon */}
                  <Wrench className="h-3.5 w-3.5 shrink-0 text-gray-400" />

                  {/* Tool name */}
                  <span className="font-mono text-gray-200">{tc.toolName}</span>

                  {/* Args hint */}
                  {isFileOp && argPath && (
                    <span className="truncate font-mono text-[10px] text-gray-500">{argPath}</span>
                  )}
                  {isBash && argCmd && (
                    <span className="truncate font-mono text-[10px] text-gray-500">
                      $ {argCmd.length > 40 ? argCmd.slice(0, 40) + '...' : argCmd}
                    </span>
                  )}

                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {/* Duration */}
                    {durationStr && (
                      <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                        <Clock className="h-2.5 w-2.5" />
                        {durationStr}
                      </span>
                    )}

                    {/* Status */}
                    {tc.success === true ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : tc.success === false ? (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-gray-500" />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="space-y-2 border-t border-gray-800 px-3 py-2">
                    {/* Status + duration bar */}
                    <div className="flex flex-wrap items-center gap-3 text-[10px]">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Status:</span>
                        {tc.success === true ? (
                          <span className="text-green-400">Success</span>
                        ) : tc.success === false ? (
                          <span className="text-red-400">Failed</span>
                        ) : (
                          <span className="text-gray-400">Unknown</span>
                        )}
                      </div>
                      {durationStr && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Duration:</span>
                          <span className={cn(
                            'font-mono',
                            (tc.durationMs || 0) > 5000 ? 'text-yellow-400' : 'text-gray-300'
                          )}>{durationStr}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Time:</span>
                        <span className="text-gray-300">{formatRelativeTime(tc.timestamp)}</span>
                      </div>
                    </div>

                    {/* Arguments */}
                    {Object.keys(args).length > 0 && (
                      <div>
                        <div className="mb-1 text-[10px] font-medium text-gray-500">Arguments</div>
                        <pre className="max-h-32 overflow-auto rounded border border-gray-700 bg-gray-950 p-2 font-mono text-[10px] text-gray-400">
                          {JSON.stringify(args, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Result */}
                    {!!tc.result && (
                      <div>
                        <div className="mb-1 text-[10px] font-medium text-gray-500">Result</div>
                        <pre className="max-h-32 overflow-auto rounded border border-gray-700 bg-gray-950 p-2 font-mono text-[10px] text-gray-400">
                          {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Error */}
                    {!!tc.error && (
                      <div className="rounded border border-red-700/40 bg-red-950/30 p-2">
                        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-red-400">
                          <XCircle className="h-3 w-3" />
                          Error
                        </div>
                        <pre className="whitespace-pre-wrap font-mono text-[10px] text-red-300/80">
                          {String(tc.error)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkpoint marker
// ---------------------------------------------------------------------------

function CheckpointMarkerInline({ checkpointId, onGoTo }: { checkpointId: string; onGoTo?: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
      <button
        className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-900/20 px-3 py-1 text-xs text-green-400 transition-colors hover:border-green-500/50 hover:bg-green-900/30"
        onClick={() => onGoTo?.(checkpointId)}
      >
        <GitBranch className="h-3 w-3" />
        Checkpoint
        <ChevronRight className="h-3 w-3" />
      </button>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Threaded conversation view
// ---------------------------------------------------------------------------

function ThreadedConversationView({
  entries,
  onGoToCheckpoint,
  onCopy,
}: {
  entries: TimelineEntry[];
  onGoToCheckpoint?: (id: string) => void;
  onCopy: (text: string) => void;
}) {
  const threads = useMemo(() => groupIntoThreads(entries), [entries]);

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <MessageSquare className="mb-3 h-10 w-10" />
        <p className="text-sm">No conversation data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((thread) => {
        if (thread.type === 'checkpoint') {
          return (
            <CheckpointMarkerInline
              key={thread.id}
              checkpointId={thread.entries[0].checkpointId!}
              onGoTo={onGoToCheckpoint}
            />
          );
        }

        if (thread.type === 'message_thread') {
          const messages = thread.entries
            .filter(e => e.message)
            .map(e => e.message!);
          return <MessageThread key={thread.id} messages={messages} onCopy={onCopy} />;
        }

        if (thread.type === 'tool_sequence') {
          const toolCalls = thread.entries
            .filter(e => e.toolCall)
            .map(e => e.toolCall!);
          return <ToolCallSequence key={thread.id} toolCalls={toolCalls} />;
        }

        return null;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File state panel - shows file state at the currently active conversation point
// ---------------------------------------------------------------------------

interface FileStatePanelProps {
  checkpointId: string;
  activeEntry: TimelineEntry | null;
}

function FileStatePanel({ checkpointId, activeEntry }: FileStatePanelProps) {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'file' | 'diff'>('diff');

  // Derive the relevant file and checkpoint from the active entry
  useEffect(() => {
    if (!activeEntry) {
      setFileContent(null);
      setFilePath(null);
      setDiffContent(null);
      return;
    }

    if (activeEntry.type === 'tool_call' && activeEntry.toolCall) {
      const tc = activeEntry.toolCall;
      const args = (tc.arguments || {}) as Record<string, unknown>;
      const path = (args.path || args.file_path || args.filePath) as string | undefined;

      if (path) {
        setFilePath(path);
      }

      // If tool call has before/after checkpoints, show the diff
      if (tc.checkpointBeforeId && tc.checkpointAfterId) {
        setLoading(true);
        fetch(`/api/context/${checkpointId}?messageLimit=0&toolCallLimit=0`)
          .then(() => {
            const content = typeof args.content === 'string'
              ? args.content
              : typeof args.new_content === 'string'
                ? args.new_content
                : null;
            if (content) {
              const lines = content.split('\n');
              const diffLines = [
                `--- a/${path || 'file'}`,
                `+++ b/${path || 'file'}`,
                `@@ -0,0 +1,${lines.length} @@`,
                ...lines.map((l: string) => `+${l}`),
              ];
              setDiffContent(diffLines.join('\n'));
            }
            setLoading(false);
          })
          .catch(() => {
            setLoading(false);
          });
      }

      // Show file content from write operations
      const content = typeof args.content === 'string'
        ? args.content
        : typeof args.new_content === 'string'
          ? args.new_content
          : typeof tc.result === 'string'
            ? tc.result
            : null;
      if (content) {
        setFileContent(content);
      }
    }
  }, [activeEntry, checkpointId]);

  if (!activeEntry) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <FileCode className="mb-3 h-10 w-10" />
        <p className="text-sm font-medium">Select a tool call</p>
        <p className="mt-1 text-xs text-gray-600">
          Click on a tool call in the conversation to see file changes
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <RefreshCw className="mb-3 h-6 w-6 animate-spin text-blue-500" />
        <p className="text-xs text-gray-500">Loading file state...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* File path header */}
      {filePath && (
        <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-2">
          <FileCode className="h-4 w-4 text-gray-500" />
          <span className="flex-1 truncate font-mono text-sm text-gray-300">{filePath}</span>
          {diffContent && (
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode('diff')}
                className={cn(
                  'rounded px-2 py-0.5 text-xs transition-colors',
                  viewMode === 'diff' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                )}
              >
                Diff
              </button>
              <button
                onClick={() => setViewMode('file')}
                className={cn(
                  'rounded px-2 py-0.5 text-xs transition-colors',
                  viewMode === 'file' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                )}
              >
                File
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'diff' && diffContent ? (
          <DiffViewer diff={diffContent} />
        ) : fileContent ? (
          <pre className="overflow-auto rounded border border-gray-800 bg-gray-950 p-4 font-mono text-xs text-gray-300">
            {fileContent.split('\n').map((line, i) => (
              <div key={i} className="flex">
                <span className="mr-3 inline-block w-8 select-none text-right text-gray-600">
                  {i + 1}
                </span>
                <span className="whitespace-pre">{line}</span>
              </div>
            ))}
          </pre>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <FileSearch className="mb-2 h-8 w-8 text-gray-600" />
            <p className="text-sm">No file content available for this entry</p>
            {activeEntry.type === 'message' && (
              <p className="mt-1 text-xs text-gray-600">
                File state is shown for tool calls that modify files
              </p>
            )}
          </div>
        )}
      </div>

      {/* Entry info footer */}
      <div className="border-t border-gray-800 px-4 py-2 text-xs text-gray-500">
        {activeEntry.type === 'tool_call' && activeEntry.toolCall && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-3 w-3" />
              <span className="font-mono">{activeEntry.toolCall.toolName}</span>
              {activeEntry.toolCall.success === true && <CheckCircle2 className="h-3 w-3 text-green-500" />}
              {activeEntry.toolCall.success === false && <XCircle className="h-3 w-3 text-red-500" />}
              {activeEntry.toolCall.durationMs != null && (
                <span className="text-gray-600">
                  {activeEntry.toolCall.durationMs < 1000
                    ? `${activeEntry.toolCall.durationMs}ms`
                    : `${(activeEntry.toolCall.durationMs / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
            <span>{new Date(activeEntry.timestamp).toLocaleTimeString()}</span>
          </div>
        )}
        {activeEntry.type === 'message' && activeEntry.message && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3 w-3" />
              <span>{activeEntry.message.role} message</span>
            </div>
            <span>{new Date(activeEntry.timestamp).toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function ContextStatsBar({ data }: { data: { messages: any[]; toolCalls: any[]; contexts: any[] } }) {
  const successTools = data.toolCalls.filter((t: any) => t.success === true).length;
  const failedTools = data.toolCalls.filter((t: any) => t.success === false).length;
  const userMessages = data.messages.filter((m: any) => m.role === 'user').length;
  const assistantMessages = data.messages.filter((m: any) => m.role === 'assistant').length;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-2.5 text-center">
        <div className="text-lg font-bold text-white">{data.messages.length}</div>
        <div className="text-[10px] text-gray-500">Messages</div>
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-2.5 text-center">
        <div className="text-lg font-bold text-blue-400">{userMessages}</div>
        <div className="text-[10px] text-gray-500">User</div>
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-2.5 text-center">
        <div className="text-lg font-bold text-gray-300">{assistantMessages}</div>
        <div className="text-[10px] text-gray-500">Assistant</div>
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-2.5 text-center">
        <div className="text-lg font-bold text-white">{data.toolCalls.length}</div>
        <div className="text-[10px] text-gray-500">Tool Calls</div>
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-2.5 text-center">
        <div className="text-lg font-bold text-green-400">{successTools}</div>
        <div className="text-[10px] text-gray-500">Succeeded</div>
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-2.5 text-center">
        <div className="text-lg font-bold text-red-400">{failedTools}</div>
        <div className="text-[10px] text-gray-500">Failed</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full Context Page
// ---------------------------------------------------------------------------

export default function ContextReplayPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkpointId = params.checkpointId as string;

  const [viewMode, setViewMode] = useState<'threaded' | 'panel'>('threaded');
  const [splitView, setSplitView] = useState(true);
  const [activeEntry, setActiveEntry] = useState<TimelineEntry | null>(null);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffFromId, setDiffFromId] = useState<string | null>(null);
  const [diffToId, setDiffToId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState(false);
  const gitgramBaseUrl = process.env.NEXT_PUBLIC_GITGRAM_URL || 'https://gitgram.app';

  const {
    data,
    isLoading,
    isError,
    filteredEntries,
    timelineEntries,
    mutate,
  } = useContextReplay(checkpointId);

  const handleGoToCheckpoint = useCallback(
    (cpId: string) => {
      if (cpId === checkpointId) return;
      router.push(`/dashboard/context/${cpId}`);
    },
    [checkpointId, router]
  );

  const handleViewDiff = useCallback((fromId: string, toId: string) => {
    setDiffFromId(fromId);
    setDiffToId(toId);
    setDiffModalOpen(true);
  }, []);

  const handleReplayFrom = useCallback(
    async (cpId: string) => {
      if (!confirm('This will restore the project to this checkpoint. Continue?')) return;
      try {
        const res = await fetch('/api/time/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            checkpointId: cpId,
            reason: 'Replay from context view',
            includeContext: true,
          }),
        });
        if (res.ok) {
          router.push('/dashboard/timeline');
        }
      } catch {
        // Silently fail
      }
    },
    [router]
  );

  const handleShareLink = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).catch(() => {});
    setShareToast(true);
    setTimeout(() => setShareToast(false), 2000);
  }, []);

  const handleCopyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  const handleOpenGitgramComposer = useCallback(
    (type: 'post' | 'change_story') => {
      if (!data) return;

      const checkpointLabel =
        data.checkpoint.name || data.checkpoint.message || `Checkpoint ${checkpointId.slice(0, 8)}`;
      const params = new URLSearchParams({
        type,
        checkpointId,
        projectId: data.checkpoint.projectId || '',
      });

      if (data.checkpoint.linkedCheckpointId) {
        params.set('fromCheckpointId', data.checkpoint.linkedCheckpointId);
      }

      if (type === 'post') {
        params.set(
          'content',
          [
            `Checkpoint update: ${checkpointLabel}`,
            '',
            'Captured from Gitgram TimeMachine context replay.',
          ].join('\n')
        );
      } else {
        params.set('title', `Change Story: ${checkpointLabel}`);
        params.set(
          'content',
          data.checkpoint.message ||
            `Checkpoint-linked repository change story generated from ${checkpointLabel}.`
        );
      }

      const url = `${gitgramBaseUrl}/compose?${params.toString()}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    [checkpointId, data, gitgramBaseUrl]
  );

  // Track active entry based on scroll position in the conversation panel
  const handleEntryInView = useCallback(
    (entry: TimelineEntry) => {
      if (entry.type !== 'checkpoint_marker') {
        setActiveEntry(entry);
      }
    },
    []
  );

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <div>
            <Skeleton className="h-7 w-64" />
            <Skeleton className="mt-1 h-4 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className={cn('rounded-2xl', i % 2 === 0 ? 'ml-auto h-20 w-3/4' : 'h-24 w-2/3')} />
            ))}
          </div>
          <Skeleton className="h-[500px] w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
        <h2 className="mb-2 text-xl font-semibold text-white">Failed to load context</h2>
        <p className="mb-1 text-gray-400">Could not load context replay for this checkpoint.</p>
        <p className="mb-4 font-mono text-xs text-gray-600">{checkpointId}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push('/dashboard/timeline')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Timeline
          </Button>
          <Button onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push('/dashboard/timeline')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">
                {data.checkpoint.name || data.checkpoint.message || 'Context Replay'}
              </h1>
              {data.checkpoint.triggerType && (
                <Badge variant="secondary" className="text-[10px]">
                  {data.checkpoint.triggerType}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-sm text-gray-400">
              <span className="font-mono text-xs text-gray-500">
                {checkpointId.slice(0, 12)}...
              </span>
              <span>
                {data.messages.length} messages, {data.toolCalls.length} tool calls
              </span>
              {data.checkpoint.createdAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(data.checkpoint.createdAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-gray-700 p-0.5">
            <button
              onClick={() => setViewMode('threaded')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'threaded' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
              )}
            >
              Threaded
            </button>
            <button
              onClick={() => setViewMode('panel')}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                viewMode === 'panel' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
              )}
            >
              Panel
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={handleShareLink}
          >
            <Share2 className="mr-1 h-3.5 w-3.5" />
            {shareToast ? 'Copied!' : 'Share'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => handleOpenGitgramComposer('post')}
          >
            Post to Gitgram
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => handleOpenGitgramComposer('change_story')}
          >
            Change Story
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setSplitView(!splitView)}
          >
            {splitView ? (
              <>
                <Minimize2 className="mr-1 h-3.5 w-3.5" />
                Single
              </>
            ) : (
              <>
                <Columns className="mr-1 h-3.5 w-3.5" />
                Split
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => mutate()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <ContextStatsBar data={data} />

      {/* Content */}
      {splitView ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Conversation */}
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              {viewMode === 'threaded' ? (
                <div className="max-h-[70vh] overflow-y-auto pr-1">
                  <ThreadedConversationView
                    entries={filteredEntries}
                    onGoToCheckpoint={handleGoToCheckpoint}
                    onCopy={handleCopyText}
                  />
                </div>
              ) : (
                <ContextReplayPanel
                  checkpointId={checkpointId}
                  onGoToCheckpoint={handleGoToCheckpoint}
                  onViewDiff={handleViewDiff}
                  onReplayFrom={handleReplayFrom}
                />
              )}
            </CardContent>
          </Card>

          {/* Right: File state */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-gray-800 px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileCode className="h-4 w-4 text-gray-500" />
                File State at Conversation Point
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[70vh]">
                <FileStatePanel checkpointId={checkpointId} activeEntry={activeEntry} />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            {viewMode === 'threaded' ? (
              <div className="max-h-[75vh] overflow-y-auto pr-1">
                <ThreadedConversationView
                  entries={filteredEntries}
                  onGoToCheckpoint={handleGoToCheckpoint}
                  onCopy={handleCopyText}
                />
              </div>
            ) : (
              <ContextReplayPanel
                checkpointId={checkpointId}
                onGoToCheckpoint={handleGoToCheckpoint}
                onViewDiff={handleViewDiff}
                onReplayFrom={handleReplayFrom}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Diff modal */}
      <Dialog open={diffModalOpen} onOpenChange={setDiffModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Checkpoint Diff</DialogTitle>
            <DialogDescription>
              Changes between checkpoints {diffFromId?.slice(0, 8)}... and {diffToId?.slice(0, 8)}...
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <FileCode className="mb-3 h-8 w-8" />
              <p className="text-sm">Diff view between checkpoints</p>
              <p className="mt-1 text-xs text-gray-600">
                Full diff comparison requires the backend to compute changes between the two checkpoints.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiffModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
