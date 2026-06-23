'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Terminal,
  FileEdit,
  FilePlus,
  FileSearch,
  Clock,
  Copy,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ContextToolCall } from '@/hooks/useContextReplay';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatArgValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '...';
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

const TOOL_CATEGORIES: Record<string, { label: string; color: string; icon?: string }> = {
  file_write: { label: 'Write File', color: 'border-blue-500/50' },
  write_file: { label: 'Write File', color: 'border-blue-500/50' },
  edit_file: { label: 'Edit File', color: 'border-blue-500/50' },
  create_file: { label: 'Create File', color: 'border-green-500/50' },
  delete_file: { label: 'Delete File', color: 'border-red-500/50' },
  bash: { label: 'Terminal', color: 'border-yellow-500/50' },
  read_file: { label: 'Read File', color: 'border-gray-500/50' },
  search: { label: 'Search', color: 'border-purple-500/50' },
  grep: { label: 'Search', color: 'border-purple-500/50' },
  glob: { label: 'Find Files', color: 'border-purple-500/50' },
  web_fetch: { label: 'Web Fetch', color: 'border-cyan-500/50' },
  web_search: { label: 'Web Search', color: 'border-cyan-500/50' },
};

function getToolCategory(toolName: string) {
  const lower = toolName.toLowerCase();
  for (const [key, val] of Object.entries(TOOL_CATEGORIES)) {
    if (lower.includes(key) || lower === key) return val;
  }
  return { label: toolName, color: 'border-gray-600/50' };
}

/**
 * Extract a short summary of tool call arguments for display in the collapsed header.
 */
function getArgsSummary(toolName: string, args: Record<string, unknown>): string | null {
  const lower = toolName.toLowerCase();

  // File operations - show path
  if (lower.includes('file') || lower.includes('write') || lower.includes('read')) {
    const path = (args.path || args.file_path || args.filePath) as string | undefined;
    if (path) return path;
  }

  // Bash - show command
  if (lower.includes('bash') || lower.includes('terminal') || lower.includes('exec')) {
    const cmd = args.command as string | undefined;
    if (cmd) return truncate(cmd, 60);
  }

  // Search operations
  if (lower.includes('search') || lower.includes('grep') || lower.includes('glob')) {
    const query = (args.query || args.pattern || args.search) as string | undefined;
    if (query) return truncate(query, 60);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FileContentBlock({ content, filePath }: { content: string; filePath?: string }) {
  const [copied, setCopied] = useState(false);
  const lines = content.split('\n');
  const displayLines = lines.slice(0, 50);
  const hasMore = lines.length > 50;

  const handleCopy = () => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      {filePath && (
        <div className="flex items-center gap-2 rounded-t border border-b-0 border-gray-700 bg-gray-800/80 px-3 py-1.5 text-xs text-gray-400">
          <FileEdit className="h-3 w-3" />
          <span className="font-mono">{filePath}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-5 px-1.5 text-xs"
            onClick={handleCopy}
          >
            <Copy className="mr-1 h-3 w-3" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
      <pre className={cn(
        'overflow-auto bg-gray-950 p-3 font-mono text-xs text-gray-300',
        filePath ? 'rounded-b border border-t-0 border-gray-700' : 'rounded border border-gray-700',
      )}>
        {displayLines.map((line, i) => (
          <div key={i} className="flex">
            <span className="mr-3 inline-block w-8 select-none text-right text-gray-600">
              {i + 1}
            </span>
            <span className="whitespace-pre">{line}</span>
          </div>
        ))}
        {hasMore && (
          <div className="mt-1 text-gray-500">... {lines.length - 50} more lines</div>
        )}
      </pre>
    </div>
  );
}

function BashBlock({ command, output }: { command: string; output?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded border border-yellow-600/30 bg-gray-950 px-3 py-2 font-mono text-xs">
        <Terminal className="h-3.5 w-3.5 text-yellow-500" />
        <span className="text-yellow-300">$ {command}</span>
      </div>
      {output && (
        <pre className="max-h-40 overflow-auto rounded border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-400">
          {truncate(output, 2000)}
        </pre>
      )}
    </div>
  );
}

function GenericArgsBlock({ args }: { args: Record<string, unknown> }) {
  return (
    <pre className="max-h-48 overflow-auto rounded border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-400">
      {JSON.stringify(args, null, 2)}
    </pre>
  );
}

function ResultBlock({ result }: { result: unknown }) {
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500">Result</div>
      <pre className="max-h-40 overflow-auto rounded border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-400">
        {truncate(text, 3000)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ToolCallViewerProps {
  toolCall: ContextToolCall;
  expanded: boolean;
  onToggle: () => void;
  onViewDiff?: (checkpointBeforeId: string, checkpointAfterId: string) => void;
  className?: string;
}

export default function ToolCallViewer({
  toolCall,
  expanded,
  onToggle,
  onViewDiff,
  className,
}: ToolCallViewerProps) {
  const category = getToolCategory(toolCall.toolName);
  const isSuccess = toolCall.success !== false;
  const borderColor = toolCall.success === false ? 'border-red-500/40' : isSuccess ? 'border-green-500/40' : 'border-gray-700';

  const args = (toolCall.arguments || {}) as Record<string, unknown>;
  const toolLower = toolCall.toolName.toLowerCase();

  // Determine if this is a file_write, bash, or generic tool call
  const isFileWrite = toolLower.includes('file_write') || toolLower.includes('write_file') || toolLower.includes('edit_file') || toolLower.includes('create_file');
  const isFileRead = toolLower.includes('read_file') || toolLower.includes('read');
  const isFileCreate = toolLower.includes('create_file');
  const isBash = toolLower.includes('bash') || toolLower.includes('terminal') || toolLower.includes('exec');
  const hasDiff = !!(toolCall.checkpointBeforeId && toolCall.checkpointAfterId);
  const argsSummary = getArgsSummary(toolCall.toolName, args);
  const duration = formatDuration(toolCall.durationMs);

  return (
    <div
      className={cn(
        'rounded-lg border-l-4 bg-gray-900/60 transition-all',
        borderColor,
        expanded && 'ring-1 ring-gray-700/50',
        className
      )}
    >
      {/* Header - always visible */}
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-800/40"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isBash ? (
            <Terminal className="h-4 w-4 shrink-0 text-yellow-500" />
          ) : isFileCreate ? (
            <FilePlus className="h-4 w-4 shrink-0 text-green-400" />
          ) : isFileWrite ? (
            <FileEdit className="h-4 w-4 shrink-0 text-blue-400" />
          ) : isFileRead ? (
            <FileSearch className="h-4 w-4 shrink-0 text-gray-400" />
          ) : (
            <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gray-700 text-[9px] font-bold text-gray-300">
              T
            </div>
          )}

          <span className="truncate font-mono text-sm text-gray-200">
            {toolCall.toolName}
          </span>

          {/* Show args summary if available */}
          {argsSummary && (
            <span className="truncate font-mono text-xs text-gray-500">
              {argsSummary}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Duration badge */}
          {duration && (
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <Clock className="h-3 w-3" />
              {duration}
            </span>
          )}

          {/* Status indicator */}
          {toolCall.success === false ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : toolCall.success === true ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-gray-500" />
          )}
          <Badge
            variant={toolCall.success === false ? 'destructive' : toolCall.success === true ? 'success' : 'secondary'}
            className="text-[10px]"
          >
            {category.label}
          </Badge>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="space-y-3 border-t border-gray-800 px-4 py-3">
          {/* Status + duration metadata bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-800/50 bg-gray-950/50 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">Status:</span>
              {toolCall.success === true ? (
                <span className="flex items-center gap-1 text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Success
                </span>
              ) : toolCall.success === false ? (
                <span className="flex items-center gap-1 text-red-400">
                  <XCircle className="h-3 w-3" />
                  Failed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-gray-400">
                  <AlertCircle className="h-3 w-3" />
                  Unknown
                </span>
              )}
            </div>
            {duration && (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Duration:</span>
                <span className={cn(
                  'font-mono',
                  (toolCall.durationMs || 0) > 5000 ? 'text-yellow-400' : 'text-gray-300'
                )}>
                  {duration}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">Time:</span>
              <span className="text-gray-300">
                {formatRelativeTime(toolCall.timestamp)}
              </span>
            </div>
            {hasDiff && (
              <div className="flex items-center gap-1">
                <span className="text-blue-400">Has checkpoint diff</span>
              </div>
            )}
          </div>

          {/* Arguments summary (for all tool types) */}
          {Object.keys(args).length > 0 && !isBash && !isFileWrite && !isFileRead && (
            <div>
              <div className="mb-1 text-xs font-medium text-gray-500">Arguments</div>
              <GenericArgsBlock args={args} />
            </div>
          )}

          {/* Tool-specific rendering */}
          {isBash && typeof args.command === 'string' ? (
            <BashBlock
              command={args.command as string}
              output={
                toolCall.result
                  ? typeof toolCall.result === 'string'
                    ? toolCall.result
                    : typeof (toolCall.result as any)?.output === 'string'
                      ? (toolCall.result as any).output
                      : JSON.stringify(toolCall.result, null, 2)
                  : undefined
              }
            />
          ) : isFileWrite || isFileCreate ? (
            <FileContentBlock
              filePath={(args.path || args.file_path || args.filePath) as string | undefined}
              content={
                typeof args.content === 'string'
                  ? args.content
                  : typeof args.new_content === 'string'
                    ? args.new_content
                    : JSON.stringify(args, null, 2)
              }
            />
          ) : isFileRead ? (
            <>
              {(args.path || args.file_path) && (
                <div className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800/80 px-3 py-1.5 text-xs text-gray-400">
                  <FileSearch className="h-3 w-3" />
                  <span className="font-mono">{(args.path || args.file_path) as string}</span>
                </div>
              )}
              {!!toolCall.result && (
                <ResultBlock result={toolCall.result} />
              )}
            </>
          ) : null}

          {/* Result (for non-bash, non-file calls) */}
          {!!toolCall.result && !isBash && !isFileWrite && !isFileCreate && !isFileRead && (
            <ResultBlock result={toolCall.result} />
          )}

          {/* Error */}
          {!!toolCall.error && (
            <div className="rounded-lg border border-red-700/40 bg-red-950/30 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                Error
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs text-red-300/80">
                {toolCall.error}
              </pre>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            {hasDiff && onViewDiff && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  onViewDiff(toolCall.checkpointBeforeId!, toolCall.checkpointAfterId!)
                }
              >
                <Eye className="mr-1 h-3 w-3" />
                View Diff
              </Button>
            )}
            <span className="ml-auto text-[10px] text-gray-600">
              {new Date(toolCall.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
