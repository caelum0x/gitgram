'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  Search,
  Download,
  Copy,
  Link2,
  Filter,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Bot,
  Monitor,
  Wrench,
  AlertTriangle,
  Clock,
  GitBranch,
  ExternalLink,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ToolCallViewer from '@/components/ToolCallViewer';
import type {
  ContextMessage,
  ContextToolCall,
  TimelineEntry,
  ConversationFilter,
  ContextReplayData,
  SavedContext,
} from '@/hooks/useContextReplay';
import { useContextReplay } from '@/hooks/useContextReplay';

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

const FILTERS: { value: ConversationFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All', icon: <Filter className="h-3.5 w-3.5" /> },
  { value: 'user', label: 'User', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { value: 'assistant', label: 'Assistant', icon: <Bot className="h-3.5 w-3.5" /> },
  { value: 'system', label: 'System', icon: <Monitor className="h-3.5 w-3.5" /> },
  { value: 'tool_calls', label: 'Tool Calls', icon: <Wrench className="h-3.5 w-3.5" /> },
  { value: 'errors', label: 'Errors', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
];

function FilterBar({
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onExpandAll,
  onCollapseAll,
  onExport,
  messageCount,
  toolCallCount,
}: {
  filter: ConversationFilter;
  onFilterChange: (f: ConversationFilter) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onExport: () => void;
  messageCount: number;
  toolCallCount: number;
}) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder="Search messages, tool calls, and arguments..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Filter pills + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === f.value
                ? 'border-blue-500/50 bg-blue-600/20 text-blue-300'
                : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
            )}
          >
            {f.icon}
            {f.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {messageCount} messages, {toolCallCount} tool calls
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onExpandAll}>
            <ChevronDown className="mr-1 h-3 w-3" />
            Expand
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCollapseAll}>
            <ChevronUp className="mr-1 h-3 w-3" />
            Collapse
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onExport}>
            <Download className="mr-1 h-3 w-3" />
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  onCopy,
  onGoToCheckpoint,
}: {
  message: ContextMessage;
  onCopy: (msg: ContextMessage) => void;
  onGoToCheckpoint?: (checkpointId: string) => void;
}) {
  const [showFull, setShowFull] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';

  const content = message.content || '';
  const isLong = content.length > 500;
  const displayContent = isLong && !showFull ? content.slice(0, 500) + '...' : content;

  return (
    <div
      className={cn(
        'flex w-full',
        isUser && 'justify-end',
        isAssistant && 'justify-start',
        isSystem && 'justify-center'
      )}
    >
      <div
        className={cn(
          'group relative max-w-[85%] rounded-2xl px-4 py-3',
          isUser && 'rounded-br-md bg-blue-600/90 text-white',
          isAssistant && 'rounded-bl-md border border-gray-700 bg-gray-800 text-gray-200',
          isSystem && 'max-w-[90%] rounded-lg bg-gray-800/50 px-5 py-2 text-center text-sm text-gray-400 italic'
        )}
      >
        {/* Role label */}
        <div
          className={cn(
            'mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider',
            isUser && 'text-blue-200',
            isAssistant && 'text-gray-500',
            isSystem && 'text-gray-600'
          )}
        >
          {isUser && <MessageSquare className="h-3 w-3" />}
          {isAssistant && <Bot className="h-3 w-3" />}
          {isSystem && <Monitor className="h-3 w-3" />}
          {message.role}
          <span className="font-normal normal-case">
            {formatRelativeTime(message.timestamp)}
          </span>
        </div>

        {/* Content */}
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {displayContent}
        </div>

        {/* Show more / less */}
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

        {/* Hover actions */}
        <div className="absolute -top-2 right-2 hidden items-center gap-1 group-hover:flex">
          <button
            className="rounded bg-gray-700 p-1 text-gray-400 hover:text-white"
            onClick={() => onCopy(message)}
            title="Copy message"
          >
            <Copy className="h-3 w-3" />
          </button>
          {message.checkpointId && onGoToCheckpoint && (
            <button
              className="rounded bg-gray-700 p-1 text-gray-400 hover:text-white"
              onClick={() => onGoToCheckpoint(message.checkpointId!)}
              title="Go to checkpoint"
            >
              <GitBranch className="h-3 w-3" />
            </button>
          )}
          <button
            className="rounded bg-gray-700 p-1 text-gray-400 hover:text-white"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('msg', message.id);
              navigator.clipboard.writeText(url.toString()).catch(() => {});
            }}
            title="Copy link to message"
          >
            <Link2 className="h-3 w-3" />
          </button>
        </div>

        {/* Checkpoint badge */}
        {message.checkpointId && (
          <div className="mt-2 flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn(
                'cursor-pointer text-[10px]',
                isUser ? 'border-blue-400/40 text-blue-200' : 'border-green-500/40 text-green-400'
              )}
              onClick={() => onGoToCheckpoint?.(message.checkpointId!)}
            >
              <GitBranch className="mr-1 h-2.5 w-2.5" />
              Linked checkpoint
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkpoint Marker
// ---------------------------------------------------------------------------

function CheckpointMarker({
  checkpointId,
  onGoToCheckpoint,
}: {
  checkpointId: string;
  onGoToCheckpoint?: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
      <button
        className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-900/20 px-3 py-1 text-xs text-green-400 transition-colors hover:border-green-500/50 hover:bg-green-900/30"
        onClick={() => onGoToCheckpoint?.(checkpointId)}
      >
        <GitBranch className="h-3 w-3" />
        Checkpoint created
        <ArrowRight className="h-3 w-3" />
      </button>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ContextReplaySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-8 w-48" />
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
            <Skeleton className={cn('h-16 rounded-2xl', i % 2 === 0 ? 'w-3/4' : 'w-2/3')} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved Contexts sidebar
// ---------------------------------------------------------------------------

function SavedContextsList({ contexts }: { contexts: SavedContext[] }) {
  if (contexts.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-500">No saved contexts.</p>;
  }

  return (
    <div className="space-y-2">
      {contexts.map((ctx) => (
        <div key={ctx.id} className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
          <div className="text-sm font-medium text-gray-200">{ctx.name || 'Unnamed context'}</div>
          {ctx.summary && (
            <p className="mt-1 text-xs text-gray-400">{ctx.summary}</p>
          )}
          {ctx.currentTask && (
            <div className="mt-2 text-xs text-gray-500">
              <span className="font-medium text-gray-400">Task: </span>
              {ctx.currentTask}
            </div>
          )}
          {ctx.goals && ctx.goals.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ctx.goals.map((goal, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">
                  {goal}
                </Badge>
              ))}
            </div>
          )}
          {ctx.activeFiles && ctx.activeFiles.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ctx.activeFiles.slice(0, 5).map((file, i) => (
                <span key={i} className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-400">
                  {file}
                </span>
              ))}
              {ctx.activeFiles.length > 5 && (
                <span className="text-[10px] text-gray-600">
                  +{ctx.activeFiles.length - 5} more
                </span>
              )}
            </div>
          )}
          <div className="mt-1 text-[10px] text-gray-600">
            {ctx.createdAt ? formatRelativeTime(ctx.createdAt) : 'Unknown time'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

interface ContextReplayPanelProps {
  checkpointId: string;
  onGoToCheckpoint?: (checkpointId: string) => void;
  onViewDiff?: (fromId: string, toId: string) => void;
  onReplayFrom?: (checkpointId: string) => void;
  className?: string;
}

export default function ContextReplayPanel({
  checkpointId,
  onGoToCheckpoint,
  onViewDiff,
  onReplayFrom,
  className,
}: ContextReplayPanelProps) {
  const {
    data,
    isLoading,
    isError,
    filteredEntries,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    expandedToolCalls,
    toggleToolCallExpanded,
    expandAllToolCalls,
    collapseAllToolCalls,
    exportAsMarkdown,
    copyMessage,
  } = useContextReplay(checkpointId);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [copiedExport, setCopiedExport] = useState(false);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (data && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [data]);

  const handleExport = useCallback(() => {
    const md = exportAsMarkdown();
    if (!md) return;

    // Create a blob and trigger download
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `context-replay-${checkpointId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportAsMarkdown, checkpointId]);

  const handleCopyExport = useCallback(() => {
    const md = exportAsMarkdown();
    navigator.clipboard.writeText(md).catch(() => {});
    setCopiedExport(true);
    setTimeout(() => setCopiedExport(false), 2000);
  }, [exportAsMarkdown]);

  if (isLoading) return <ContextReplaySkeleton />;

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertTriangle className="mb-3 h-10 w-10 text-red-500" />
        <p className="text-sm text-gray-400">Failed to load context replay data.</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Checkpoint info header */}
      <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900/80 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-green-500" />
              <h3 className="text-sm font-semibold text-white">
                {data.checkpoint.name || data.checkpoint.message || `Checkpoint ${data.checkpoint.id.slice(0, 8)}`}
              </h3>
              {data.checkpoint.triggerType && (
                <Badge variant="secondary" className="text-[10px]">
                  {data.checkpoint.triggerType}
                </Badge>
              )}
            </div>
            <p className="mt-1 font-mono text-xs text-gray-500">{data.checkpoint.id}</p>
            {data.checkpoint.createdAt && (
              <p className="mt-0.5 text-xs text-gray-500">
                <Clock className="mr-1 inline h-3 w-3" />
                {formatRelativeTime(data.checkpoint.createdAt)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onReplayFrom && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onReplayFrom(checkpointId)}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Replay from here
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleCopyExport}
            >
              <Copy className="mr-1 h-3 w-3" />
              {copiedExport ? 'Copied!' : 'Copy All'}
            </Button>
          </div>
        </div>

        {data.checkpoint.linkedCheckpointId && (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <Link2 className="h-3 w-3" />
            Linked checkpoint:
            <button
              className="font-mono text-blue-400 hover:underline"
              onClick={() => onGoToCheckpoint?.(data.checkpoint.linkedCheckpointId!)}
            >
              {data.checkpoint.linkedCheckpointId.slice(0, 12)}...
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onExpandAll={expandAllToolCalls}
        onCollapseAll={collapseAllToolCalls}
        onExport={handleExport}
        messageCount={data.messages.length}
        toolCallCount={data.toolCalls.length}
      />

      {/* Conversation stream */}
      <div
        ref={scrollContainerRef}
        className="mt-4 flex-1 space-y-3 overflow-y-auto scroll-smooth pr-1"
        style={{ maxHeight: '60vh' }}
      >
        {filteredEntries.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {searchQuery || filter !== 'all'
              ? 'No entries match the current filter.'
              : 'No conversation data for this checkpoint.'}
          </div>
        ) : (
          filteredEntries.map((entry) => {
            if (entry.type === 'checkpoint_marker') {
              return (
                <CheckpointMarker
                  key={entry.id}
                  checkpointId={entry.checkpointId!}
                  onGoToCheckpoint={onGoToCheckpoint}
                />
              );
            }

            if (entry.type === 'message' && entry.message) {
              return (
                <MessageBubble
                  key={entry.id}
                  message={entry.message}
                  onCopy={copyMessage}
                  onGoToCheckpoint={onGoToCheckpoint}
                />
              );
            }

            if (entry.type === 'tool_call' && entry.toolCall) {
              return (
                <ToolCallViewer
                  key={entry.id}
                  toolCall={entry.toolCall}
                  expanded={expandedToolCalls.has(entry.toolCall.id)}
                  onToggle={() => toggleToolCallExpanded(entry.toolCall!.id)}
                  onViewDiff={onViewDiff}
                />
              );
            }

            return null;
          })
        )}
      </div>

      {/* Saved contexts section */}
      {data.contexts.length > 0 && (
        <div className="mt-4 border-t border-gray-800 pt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Saved Contexts
          </h4>
          <SavedContextsList contexts={data.contexts} />
        </div>
      )}
    </div>
  );
}
