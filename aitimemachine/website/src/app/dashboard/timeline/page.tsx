'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCode,
  FileText,
  FilePlus,
  FileMinus,
  FileEdit,
  Filter,
  FolderGit2,
  Info,
  Keyboard,
  Link2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SearchX,
  Timer,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  cn,
  formatRelativeTime,
  humanizeEventDescription,
  triggerTypeLabel,
  formatChangeSummary,
} from '@/lib/utils';
import DiffViewer from '@/components/DiffViewer';
import { TimelineEvent, useProjects, useTimeline } from '@/hooks/useDashboard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimelineScope = 'project' | 'folder' | 'file';
type TriggerFilter = 'all' | 'ai_action' | 'manual' | 'auto' | 'restore';

interface PreviewResponse {
  success: boolean;
  fromCheckpointId: string;
  toCheckpointId: string;
  fileCount: number;
  summary: { added: number; removed: number; modified: number };
  files: Array<{
    filePath: string;
    diffContent: string | null;
    stats: { added?: number; removed?: number; modified?: number } | null;
  }>;
}

interface ContextResponse {
  success: boolean;
  checkpoint: {
    id: string;
    name?: string | null;
    createdAt?: string | null;
    triggerType?: string | null;
  };
  messages: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: string;
  }>;
  toolCalls: Array<{
    id: string;
    toolName: string;
    success: boolean | null;
    timestamp: string;
    error?: string | null;
  }>;
  contexts: Array<{
    id: string;
    name: string | null;
    createdAt: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Trigger type color helpers
// ---------------------------------------------------------------------------

function triggerColor(triggerType: string | null | undefined): string {
  switch (triggerType) {
    case 'manual':
      return 'bg-green-500';
    case 'ai_action':
    case 'before_action':
    case 'after_action':
      return 'bg-blue-500';
    case 'auto':
      return 'bg-orange-500';
    case 'restore':
      return 'bg-red-500';
    case 'sync':
      return 'bg-purple-500';
    default:
      return 'bg-gray-500';
  }
}

function triggerBorderColor(triggerType: string | null | undefined): string {
  switch (triggerType) {
    case 'manual':
      return 'border-green-500/40';
    case 'ai_action':
    case 'before_action':
    case 'after_action':
      return 'border-blue-500/40';
    case 'auto':
      return 'border-orange-500/40';
    case 'restore':
      return 'border-red-500/40';
    case 'sync':
      return 'border-purple-500/40';
    default:
      return 'border-gray-700';
  }
}

function triggerBadgeClass(triggerType: string | null | undefined): string {
  switch (triggerType) {
    case 'manual':
      return 'bg-green-600/20 text-green-400 border-green-600/30';
    case 'ai_action':
    case 'before_action':
    case 'after_action':
      return 'bg-blue-600/20 text-blue-400 border-blue-600/30';
    case 'auto':
      return 'bg-orange-600/20 text-orange-400 border-orange-600/30';
    case 'restore':
      return 'bg-red-600/20 text-red-400 border-red-600/30';
    case 'sync':
      return 'bg-purple-600/20 text-purple-400 border-purple-600/30';
    default:
      return 'bg-gray-700/40 text-gray-400 border-gray-600/30';
  }
}

function getTriggerIcon(triggerType: string | null | undefined) {
  switch (triggerType) {
    case 'manual':
      return <Save className="h-4 w-4 text-green-400" />;
    case 'ai_action':
    case 'before_action':
    case 'after_action':
      return <Bot className="h-4 w-4 text-blue-400" />;
    case 'auto':
      return <Timer className="h-4 w-4 text-orange-400" />;
    case 'restore':
      return <RotateCcw className="h-4 w-4 text-red-400" />;
    case 'sync':
      return <Activity className="h-4 w-4 text-purple-400" />;
    default:
      return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

// Maps raw trigger filter to the types it covers
function triggerFilterMatches(
  triggerType: string | null | undefined,
  filter: TriggerFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'ai_action') {
    return (
      triggerType === 'ai_action' ||
      triggerType === 'before_action' ||
      triggerType === 'after_action'
    );
  }
  return triggerType === filter;
}

// ---------------------------------------------------------------------------
// Skeleton / Error components
// ---------------------------------------------------------------------------

function TimelineSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="mb-2 h-9 w-32" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      {/* Search bar skeleton */}
      <Skeleton className="h-10 w-full" />

      {/* Filter pills skeleton */}
      <div className="flex flex-wrap items-center gap-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      {/* Legend skeleton */}
      <div className="flex flex-wrap gap-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-4 w-24" />
        ))}
      </div>

      {/* Timeline entries skeleton */}
      <div className="space-y-8">
        {[...Array(3)].map((_, i) => (
          <div key={i}>
            <div className="mb-4 flex items-center gap-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-48" />
              <div className="h-px flex-1 bg-gray-800" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="relative space-y-4 pl-8">
              <div className="absolute left-[11px] top-0 bottom-0 w-px bg-gray-800" />
              {[...Array(2)].map((_, j) => (
                <div key={j} className="relative">
                  <Skeleton className="absolute -left-[21px] top-4 h-5 w-5 rounded-full" />
                  <div className="rounded-lg border border-gray-800 p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="mt-0.5 h-9 w-9 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-4 w-32" />
                        <div className="flex gap-3">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
      <h2 className="mb-2 text-xl font-semibold text-white">
        Failed to load timeline
      </h2>
      <p className="mb-4 text-gray-400">
        There was an error loading your timeline events.
      </p>
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filtered empty state - shows contextual message based on active filters
// ---------------------------------------------------------------------------

function FilteredEmptyState({
  triggerFilter,
  searchQuery,
  project,
  typeFilter,
  scopeType,
  linkedOnly,
  fromDate,
  toDate,
  onClearFilters,
}: {
  triggerFilter: TriggerFilter;
  searchQuery: string;
  project: string;
  typeFilter: string;
  scopeType: TimelineScope;
  linkedOnly: boolean;
  fromDate: string;
  toDate: string;
  onClearFilters: () => void;
}) {
  const hasFilters =
    triggerFilter !== 'all' ||
    project !== 'all' ||
    typeFilter !== 'all' ||
    scopeType !== 'project' ||
    linkedOnly ||
    !!fromDate ||
    !!toDate;

  // Build a human-readable description of the active filters
  const filterDescriptions: string[] = [];
  if (searchQuery) filterDescriptions.push(`matching "${searchQuery}"`);
  if (triggerFilter !== 'all') {
    const labels: Record<string, string> = {
      ai_action: 'AI action',
      manual: 'manual',
      auto: 'auto-capture',
      restore: 'restore',
    };
    filterDescriptions.push(`triggered by ${labels[triggerFilter] || triggerFilter}`);
  }
  if (typeFilter !== 'all') filterDescriptions.push(`of type "${typeFilter}"`);
  if (linkedOnly) filterDescriptions.push('with linked pairs only');
  if (fromDate || toDate) {
    if (fromDate && toDate) filterDescriptions.push(`between ${fromDate} and ${toDate}`);
    else if (fromDate) filterDescriptions.push(`after ${fromDate}`);
    else filterDescriptions.push(`before ${toDate}`);
  }

  return (
    <Card>
      <CardContent className="py-16 text-center">
        {searchQuery ? (
          <SearchX className="mx-auto mb-4 h-12 w-12 text-gray-600" />
        ) : (
          <Clock className="mx-auto mb-4 h-12 w-12 text-gray-600" />
        )}
        <h3 className="mb-2 text-lg font-medium text-white">
          {searchQuery
            ? 'No matching events'
            : hasFilters
            ? 'No events match these filters'
            : 'No events yet'}
        </h3>
        <p className="mx-auto max-w-md text-sm text-gray-400">
          {filterDescriptions.length > 0 ? (
            <>
              No events found {filterDescriptions.join(', ')}.
              {' '}Try broadening your search or adjusting filters.
            </>
          ) : (
            'Create your first checkpoint to see events appear here.'
          )}
        </p>
        {(hasFilters || searchQuery) && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            className="mt-4 gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Clear all filters
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts help dialog
// ---------------------------------------------------------------------------

function KeyboardShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const shortcuts = [
    { keys: ['1'], description: 'Show all triggers' },
    { keys: ['2'], description: 'Filter to AI actions' },
    { keys: ['3'], description: 'Filter to manual saves' },
    { keys: ['4'], description: 'Filter to auto-captures' },
    { keys: ['5'], description: 'Filter to restores' },
    { keys: ['L'], description: 'Toggle linked pairs only' },
    { keys: ['F'], description: 'Toggle expanded filters' },
    { keys: ['/'], description: 'Focus search bar' },
    { keys: ['R'], description: 'Refresh timeline' },
    { keys: ['Esc'], description: 'Close panels / clear search' },
    { keys: ['?'], description: 'Show keyboard shortcuts' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Quick actions for navigating the timeline.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {shortcuts.map(({ keys, description }) => (
            <div
              key={description}
              className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-900/50"
            >
              <span className="text-sm text-gray-300">{description}</span>
              <div className="flex items-center gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-gray-700 bg-gray-800 px-1.5 font-mono text-xs text-gray-300"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Restore step type
// ---------------------------------------------------------------------------

type RestoreStep = 'preview' | 'review' | 'confirm' | 'success';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toIsoStartDay(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function toIsoEndDay(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T23:59:59.999Z`).toISOString();
}

// ---------------------------------------------------------------------------
// Change summary component
// ---------------------------------------------------------------------------

function ChangeSummary({
  changes,
}: {
  changes: { added: number; deleted: number; modified: number } | null | undefined;
}) {
  if (!changes) return null;
  const { added, deleted, modified } = changes;
  if (added === 0 && deleted === 0 && modified === 0) return null;

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      {added > 0 && (
        <span className="flex items-center gap-0.5 text-green-400">
          <FilePlus className="h-3 w-3" />
          {added}
        </span>
      )}
      {deleted > 0 && (
        <span className="flex items-center gap-0.5 text-red-400">
          <FileMinus className="h-3 w-3" />
          {deleted}
        </span>
      )}
      {modified > 0 && (
        <span className="flex items-center gap-0.5 text-yellow-400">
          <FileEdit className="h-3 w-3" />
          {modified}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Linked pair connector
// ---------------------------------------------------------------------------

function LinkedPairIndicator({
  event,
  allEvents,
}: {
  event: TimelineEvent;
  allEvents: TimelineEvent[];
}) {
  if (!event.linkedCheckpointId) return null;

  const linkedEvent = allEvents.find(
    (e) =>
      e.checkpointId === event.linkedCheckpointId ||
      e.id === event.linkedCheckpointId
  );

  const isBefore =
    event.triggerType === 'before_action' ||
    event.description.toLowerCase().startsWith('before');

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Link2 className="h-3 w-3 text-blue-400" />
      <span className="text-blue-400">
        {isBefore ? 'Before' : 'After'}
        {linkedEvent && (
          <span className="text-gray-500">
            {' '}
            -- paired with {isBefore ? 'after' : 'before'}
          </span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter panel component
// ---------------------------------------------------------------------------

function FilterPanel({
  triggerFilter,
  setTriggerFilter,
  project,
  setProject,
  typeFilter,
  setTypeFilter,
  scopeType,
  setScopeType,
  scopePath,
  setScopePath,
  actionFilter,
  setActionFilter,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  linkedOnly,
  setLinkedOnly,
  projects,
  filtersExpanded,
  setFiltersExpanded,
}: {
  triggerFilter: TriggerFilter;
  setTriggerFilter: (v: TriggerFilter) => void;
  project: string;
  setProject: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  scopeType: TimelineScope;
  setScopeType: (v: TimelineScope) => void;
  scopePath: string;
  setScopePath: (v: string) => void;
  actionFilter: string;
  setActionFilter: (v: string) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  linkedOnly: boolean;
  setLinkedOnly: (v: boolean) => void;
  projects: Array<{ id: string; name: string }>;
  filtersExpanded: boolean;
  setFiltersExpanded: (v: boolean) => void;
}) {
  const activeFilterCount = [
    triggerFilter !== 'all',
    project !== 'all',
    typeFilter !== 'all',
    scopeType !== 'project',
    !!actionFilter,
    !!fromDate,
    !!toDate,
    linkedOnly,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setTriggerFilter('all');
    setProject('all');
    setTypeFilter('all');
    setScopeType('project');
    setScopePath('');
    setActionFilter('');
    setFromDate('');
    setToDate('');
    setLinkedOnly(false);
  };

  return (
    <div className="space-y-4">
      {/* Trigger type filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Trigger:
        </span>
        {(
          [
            { value: 'all', label: 'All', icon: null },
            { value: 'ai_action', label: 'AI Actions', icon: <Bot className="h-3 w-3" /> },
            { value: 'manual', label: 'Manual', icon: <Save className="h-3 w-3" /> },
            { value: 'auto', label: 'Auto', icon: <Timer className="h-3 w-3" /> },
            { value: 'restore', label: 'Restore', icon: <RotateCcw className="h-3 w-3" /> },
          ] as const
        ).map((pill) => (
          <button
            key={pill.value}
            onClick={() => setTriggerFilter(pill.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              triggerFilter === pill.value
                ? pill.value === 'all'
                  ? 'border-white/30 bg-white/10 text-white'
                  : triggerBadgeClass(pill.value === 'ai_action' ? 'ai_action' : pill.value)
                : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            {pill.icon}
            {pill.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {/* Linked pairs toggle */}
          <button
            onClick={() => setLinkedOnly(!linkedOnly)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              linkedOnly
                ? 'border-blue-500/40 bg-blue-600/20 text-blue-400'
                : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            <Link2 className="h-3 w-3" />
            Linked Pairs
          </button>

          {/* Toggle more filters */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="gap-1.5"
          >
            <Filter className="h-3 w-3" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="ml-1 h-4 min-w-[16px] rounded-full bg-blue-600 px-1 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
            {filtersExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="gap-1 text-xs text-gray-400 hover:text-white"
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Expanded filters */}
      {filtersExpanded && (
        <div className="grid gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Project</label>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Event Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
            >
              <option value="all">All Events</option>
              <option value="checkpoint">Checkpoints</option>
              <option value="restore">Restores</option>
              <option value="sync">Syncs</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Scope</label>
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as TimelineScope)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
            >
              <option value="project">Project Scope</option>
              <option value="folder">Folder Scope</option>
              <option value="file">File Scope</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              {scopeType === 'project'
                ? 'Path (disabled for project)'
                : scopeType === 'folder'
                ? 'Folder path'
                : 'File path'}
            </label>
            <Input
              placeholder={
                scopeType === 'project'
                  ? 'N/A'
                  : scopeType === 'folder'
                  ? 'e.g. src/services'
                  : 'e.g. src/app/page.tsx'
              }
              value={scopePath}
              onChange={(e) => setScopePath(e.target.value)}
              disabled={scopeType === 'project'}
              className="h-9"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Action</label>
            <Input
              placeholder="e.g. edit_file, restore"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">From Date</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">To Date</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Detail Panel
// ---------------------------------------------------------------------------

function EventDetailPanel({
  event,
  allEvents,
  onClose,
  onOpenRestore,
  onOpenContext,
}: {
  event: TimelineEvent;
  allEvents: TimelineEvent[];
  onClose: () => void;
  onOpenRestore: (event: TimelineEvent) => void;
  onOpenContext: (event: TimelineEvent) => void;
}) {
  const humanDesc = humanizeEventDescription(
    event.description,
    event.triggerType,
    event.action
  );

  const linkedEvent = event.linkedCheckpointId
    ? allEvents.find(
        (e) =>
          e.checkpointId === event.linkedCheckpointId ||
          e.id === event.linkedCheckpointId
      )
    : null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-gray-800 bg-gray-950 shadow-2xl lg:max-w-lg">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-800 p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {getTriggerIcon(event.triggerType)}
            <Badge
              className={`border text-xs ${triggerBadgeClass(event.triggerType)}`}
            >
              {triggerTypeLabel(event.triggerType)}
            </Badge>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-white">{humanDesc}</h3>
          <p className="mt-1 text-sm text-gray-400">
            {new Date(event.timestamp).toLocaleString('en-US', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3">
          {event.project && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-1 text-xs text-gray-500">Project</div>
              <div className="flex items-center gap-1.5 text-sm text-white">
                <FolderGit2 className="h-3.5 w-3.5 text-gray-400" />
                {event.project}
              </div>
            </div>
          )}
          {event.action && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-1 text-xs text-gray-500">Action</div>
              <div className="flex items-center gap-1.5 text-sm text-white">
                <Wrench className="h-3.5 w-3.5 text-gray-400" />
                {event.action}
              </div>
            </div>
          )}
          {event.scopePath && (
            <div className="col-span-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-1 text-xs text-gray-500">
                Scope ({event.scopeType})
              </div>
              <div className="flex items-center gap-1.5 text-sm font-mono text-white">
                <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="truncate">{event.scopePath}</span>
              </div>
            </div>
          )}
          {event.fileCount != null && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-1 text-xs text-gray-500">Total Files</div>
              <div className="text-sm text-white">{event.fileCount}</div>
            </div>
          )}
          {event.checkpointId && (
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
              <div className="mb-1 text-xs text-gray-500">Checkpoint ID</div>
              <div className="truncate font-mono text-xs text-gray-300">
                {event.checkpointId}
              </div>
            </div>
          )}
        </div>

        {/* File change summary */}
        {event.changes && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <h4 className="mb-3 text-sm font-medium text-gray-300">
              File Changes
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  +{event.changes.added}
                </div>
                <div className="text-xs text-gray-500">Added</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">
                  -{event.changes.deleted}
                </div>
                <div className="text-xs text-gray-500">Deleted</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  ~{event.changes.modified}
                </div>
                <div className="text-xs text-gray-500">Modified</div>
              </div>
            </div>
            <div className="mt-3 text-center text-xs text-gray-500">
              {formatChangeSummary(event.changes)}
            </div>
          </div>
        )}

        {/* Conversation context preview */}
        {event.conversationPreview && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-300">
              <MessageSquare className="h-3.5 w-3.5" />
              Conversation Context
            </h4>
            <p className="text-sm leading-relaxed text-gray-400">
              {event.conversationPreview}
            </p>
          </div>
        )}

        {/* Linked pair */}
        {linkedEvent && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-950/20 p-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-blue-300">
              <Link2 className="h-3.5 w-3.5" />
              Linked Checkpoint
            </h4>
            <div className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  linkedEvent.triggerType === 'before_action'
                    ? 'bg-blue-900/50'
                    : 'bg-blue-900/50'
                }`}
              >
                {getTriggerIcon(linkedEvent.triggerType)}
              </div>
              <div className="flex-1">
                <div className="text-sm text-white">
                  {humanizeEventDescription(
                    linkedEvent.description,
                    linkedEvent.triggerType,
                    linkedEvent.action
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {formatRelativeTime(linkedEvent.timestamp)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex gap-2 border-t border-gray-800 p-4">
        {event.type === 'checkpoint' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenRestore(event)}
            className="flex-1 gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Preview Restore
          </Button>
        )}
        {event.checkpointId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenContext(event)}
            className="flex-1 gap-1.5"
          >
            <MessageSquare className="h-4 w-4" />
            Context Replay
          </Button>
        )}
        {event.checkpointId && (
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ExternalLink className="h-4 w-4" />
            Diff
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TimelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectFilter = searchParams.get('project');

  // Filters
  const [project, setProject] = useState<string>(projectFilter || 'all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>('all');
  const [scopeType, setScopeType] = useState<TimelineScope>('project');
  const [scopePath, setScopePath] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Detail panel
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  // Restore preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewEvent, setPreviewEvent] = useState<TimelineEvent | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [restoreConfirmChecked, setRestoreConfirmChecked] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    restoredCount: number;
    restoreEventId: string;
  } | null>(null);

  // Restore flow step
  const [restoreStep, setRestoreStep] = useState<RestoreStep>('preview');
  const [expandedDiffFile, setExpandedDiffFile] = useState<string | null>(null);

  // Context replay dialog
  const [contextOpen, setContextOpen] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextData, setContextData] = useState<ContextResponse | null>(null);
  const [contextSearch, setContextSearch] = useState('');
  const [toolStatusFilter, setToolStatusFilter] = useState<'all' | 'success' | 'failed'>('all');

  // Keyboard shortcuts dialog
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const { projects } = useProjects();
  const { events, isLoading, isError, mutate, hasMore, total } = useTimeline({
    project: project !== 'all' ? project : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    action: actionFilter || undefined,
    triggerType:
      triggerFilter !== 'all' && triggerFilter !== 'ai_action'
        ? triggerFilter
        : undefined,
    scopeType,
    scopePath: scopeType !== 'project' ? scopePath || undefined : undefined,
    linkedOnly,
    from: fromDate ? toIsoStartDay(fromDate) : undefined,
    to: toDate ? toIsoEndDay(toDate) : undefined,
    limit: 50,
    offset: 0,
  });

  // Client-side filtering (trigger type, search, linked only)
  const filteredEvents = useMemo(() => {
    let result = events;

    // Trigger type filter
    if (triggerFilter !== 'all') {
      result = result.filter((event) =>
        triggerFilterMatches(event.triggerType, triggerFilter)
      );
    }

    // Linked only
    if (linkedOnly) {
      result = result.filter((event) => !!event.linkedCheckpointId);
    }

    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((event) => {
        const humanDesc = humanizeEventDescription(
          event.description,
          event.triggerType,
          event.action
        );
        return (
          humanDesc.toLowerCase().includes(query) ||
          event.description.toLowerCase().includes(query) ||
          (event.project && event.project.toLowerCase().includes(query)) ||
          event.type.toLowerCase().includes(query) ||
          (event.scopePath || '').toLowerCase().includes(query) ||
          (event.action || '').toLowerCase().includes(query)
        );
      });
    }

    return result;
  }, [events, triggerFilter, linkedOnly, searchQuery]);

  // Clear all filters helper
  const clearAllFilters = useCallback(() => {
    setTriggerFilter('all');
    setProject('all');
    setTypeFilter('all');
    setScopeType('project');
    setScopePath('');
    setActionFilter('');
    setFromDate('');
    setToDate('');
    setLinkedOnly(false);
    setSearchQuery('');
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Only handle Escape in inputs
        if (e.key === 'Escape') {
          (target as HTMLInputElement).blur();
          if (searchQuery) setSearchQuery('');
        }
        return;
      }

      // Don't trigger in dialogs
      if (previewOpen || contextOpen) {
        if (e.key === 'Escape') {
          setPreviewOpen(false);
          setContextOpen(false);
        }
        return;
      }

      switch (e.key) {
        case '1':
          setTriggerFilter('all');
          break;
        case '2':
          setTriggerFilter('ai_action');
          break;
        case '3':
          setTriggerFilter('manual');
          break;
        case '4':
          setTriggerFilter('auto');
          break;
        case '5':
          setTriggerFilter('restore');
          break;
        case 'l':
        case 'L':
          setLinkedOnly((v) => !v);
          break;
        case 'f':
        case 'F':
          setFiltersExpanded((v) => !v);
          break;
        case '/':
          e.preventDefault();
          // Focus the search input
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[placeholder*="Search"]'
          );
          searchInput?.focus();
          break;
        case 'r':
        case 'R':
          mutate();
          break;
        case 'Escape':
          if (selectedEvent) {
            setSelectedEvent(null);
          } else if (searchQuery) {
            setSearchQuery('');
          }
          break;
        case '?':
          setShortcutsOpen(true);
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, previewOpen, contextOpen, selectedEvent, mutate]);

  // Group by date
  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce((groups, event) => {
      const date = new Date(event.timestamp).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
      return groups;
    }, {} as Record<string, TimelineEvent[]>);
  }, [filteredEvents]);

  // Actions
  const openRestorePreview = useCallback(
    async (event: TimelineEvent) => {
      if (!event.projectId || !event.checkpointId) return;
      setPreviewEvent(event);
      setPreviewData(null);
      setRestoreResult(null);
      setRestoreReason('');
      setRestoreConfirmChecked(false);
      setRestoreConfirmText('');
      setRestoreStep('preview');
      setExpandedDiffFile(null);
      setPreviewOpen(true);
      setPreviewLoading(true);
      try {
        const response = await fetch('/api/time/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: event.projectId,
            toCheckpointId: event.checkpointId,
            scopeType: event.scopeType || 'project',
            scopePath: event.scopePath || undefined,
            limit: 200,
          }),
        });
        if (!response.ok) throw new Error('preview_failed');
        const data = (await response.json()) as PreviewResponse;
        setPreviewData(data);
      } catch {
        setPreviewData(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  const applyRestore = useCallback(async () => {
    if (!previewEvent?.projectId || !previewEvent?.checkpointId) return;
    setRestoring(true);
    try {
      const response = await fetch('/api/time/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: previewEvent.projectId,
          checkpointId: previewEvent.checkpointId,
          scopeType: previewEvent.scopeType || 'project',
          scopePath: previewEvent.scopePath || undefined,
          reason: restoreReason || undefined,
          includeContext: true,
        }),
      });
      if (!response.ok) throw new Error('restore_failed');
      const data = await response.json();
      setRestoreResult({
        restoredCount: Number(data.restoredCount || 0),
        restoreEventId: data.restoreEventId || 'unknown',
      });
      await mutate();
    } finally {
      setRestoring(false);
    }
  }, [previewEvent, restoreReason, mutate]);

  const openContextReplay = useCallback(
    async (event: TimelineEvent) => {
      if (!event.checkpointId) return;
      setContextOpen(true);
      setContextLoading(true);
      setContextData(null);
      setContextSearch('');
      setToolStatusFilter('all');
      try {
        const response = await fetch(
          `/api/context/${event.checkpointId}?messageLimit=80&toolCallLimit=80&contextLimit=20`,
          { cache: 'no-store' }
        );
        if (!response.ok) throw new Error('context_failed');
        const data = (await response.json()) as ContextResponse;
        setContextData(data);
      } catch {
        setContextData(null);
      } finally {
        setContextLoading(false);
      }
    },
    []
  );

  if (isLoading) return <TimelineSkeleton />;
  if (isError) return <ErrorState onRetry={() => mutate()} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Timeline</h1>
          <p className="mt-1 text-gray-400">
            Human-readable project history with scoped filters
            {total > 0 && (
              <span className="text-gray-500">
                {' '}
                -- {filteredEvents.length}
                {filteredEvents.length !== total ? ` of ${total}` : ''} events
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShortcutsOpen(true)}
            className="gap-1 text-xs text-gray-500 hover:text-gray-300"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Shortcuts</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => mutate()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input
          placeholder="Search descriptions, paths, actions..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Filters */}
      <FilterPanel
        triggerFilter={triggerFilter}
        setTriggerFilter={setTriggerFilter}
        project={project}
        setProject={setProject}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        scopeType={scopeType}
        setScopeType={setScopeType}
        scopePath={scopePath}
        setScopePath={setScopePath}
        actionFilter={actionFilter}
        setActionFilter={setActionFilter}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        linkedOnly={linkedOnly}
        setLinkedOnly={setLinkedOnly}
        projects={projects}
        filtersExpanded={filtersExpanded}
        setFiltersExpanded={setFiltersExpanded}
      />

      {/* Color legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
          Manual saves
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          AI actions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
          Auto-captures
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          Restores
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
          Syncs
        </span>
      </div>

      {/* Timeline body */}
      {filteredEvents.length === 0 ? (
        <FilteredEmptyState
          triggerFilter={triggerFilter}
          searchQuery={searchQuery}
          project={project}
          typeFilter={typeFilter}
          scopeType={scopeType}
          linkedOnly={linkedOnly}
          fromDate={fromDate}
          toDate={toDate}
          onClearFilters={clearAllFilters}
        />
      ) : (
        <div className="relative space-y-8">
          {Object.entries(groupedEvents).map(([date, dateEvents]) => (
            <div key={date}>
              {/* Date header */}
              <div className="mb-4 flex items-center gap-3">
                <Calendar className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-medium text-gray-400">{date}</h3>
                <div className="h-px flex-1 bg-gray-800" />
                <span className="text-xs text-gray-600">
                  {dateEvents.length} event{dateEvents.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Vertical timeline line */}
              <div className="relative space-y-4 pl-8">
                {/* Vertical connector line */}
                <div className="absolute left-[11px] top-0 bottom-0 w-px bg-gray-800" />

                {dateEvents.map((event, idx) => {
                  const humanDesc = humanizeEventDescription(
                    event.description,
                    event.triggerType,
                    event.action
                  );
                  const isSelected = selectedEvent?.id === event.id;

                  // Check if this is part of a linked pair and mark the connection
                  const isLinkedBefore =
                    event.triggerType === 'before_action' &&
                    event.linkedCheckpointId;
                  const isLinkedAfter =
                    event.triggerType === 'after_action' &&
                    event.linkedCheckpointId;
                  const nextEvent = dateEvents[idx + 1];
                  const hasLinkedNext =
                    isLinkedBefore &&
                    nextEvent?.linkedCheckpointId === event.checkpointId;

                  return (
                    <div key={event.id} className="relative">
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-[21px] top-4 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-900 ${triggerColor(event.triggerType)}`}
                      >
                        <div className="h-2 w-2 rounded-full bg-white/80" />
                      </div>

                      {/* Linked pair connector (thicker line between before/after) */}
                      {hasLinkedNext && (
                        <div className="absolute -left-[12px] top-9 z-[5] h-[calc(100%+16px)] w-1 rounded bg-blue-500/30" />
                      )}

                      {/* Event card */}
                      <Card
                        className={`cursor-pointer transition-all hover:border-gray-600 ${
                          isSelected
                            ? `border-2 ${triggerBorderColor(event.triggerType)} bg-gray-900/80`
                            : ''
                        } ${isLinkedBefore || isLinkedAfter ? 'border-l-2 ' + triggerBorderColor(event.triggerType) : ''}`}
                        onClick={() =>
                          setSelectedEvent(
                            isSelected ? null : event
                          )
                        }
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              {/* Trigger icon */}
                              <div
                                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-800/80`}
                              >
                                {getTriggerIcon(event.triggerType)}
                              </div>
                              <div className="min-w-0">
                                {/* Title row */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="font-medium text-white">
                                    {humanDesc}
                                  </h4>
                                  <Badge
                                    className={`border text-[10px] ${triggerBadgeClass(event.triggerType)}`}
                                  >
                                    {triggerTypeLabel(event.triggerType)}
                                  </Badge>
                                  {event.type === 'restore' && (
                                    <Badge variant="destructive" className="text-[10px]">
                                      Restore
                                    </Badge>
                                  )}
                                </div>

                                {/* File change summary */}
                                {event.changes && (
                                  <div className="mt-1.5">
                                    <ChangeSummary changes={event.changes} />
                                  </div>
                                )}

                                {/* Meta row */}
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                  {event.project && (
                                    <span className="flex items-center gap-1">
                                      <FolderGit2 className="h-3 w-3" />
                                      {event.project}
                                    </span>
                                  )}
                                  {event.scopePath && (
                                    <span className="flex items-center gap-1 font-mono">
                                      <FileText className="h-3 w-3" />
                                      {event.scopeType}: {event.scopePath}
                                    </span>
                                  )}
                                  {event.action && (
                                    <span className="flex items-center gap-1">
                                      <Wrench className="h-3 w-3" />
                                      {event.action}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatRelativeTime(event.timestamp)}
                                  </span>
                                  <LinkedPairIndicator
                                    event={event}
                                    allEvents={filteredEvents}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Quick actions */}
                            <div className="flex shrink-0 gap-1">
                              {event.type === 'checkpoint' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRestorePreview(event);
                                  }}
                                  className="gap-1 text-xs"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Restore
                                </Button>
                              )}
                              {event.checkpointId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openContextReplay(event);
                                  }}
                                  className="text-xs"
                                >
                                  Context
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="pt-4 text-center">
              <Button variant="outline" onClick={() => mutate()}>
                Load More Events
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Event Detail Panel (slide-in) */}
      {selectedEvent && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedEvent(null)}
          />
          <EventDetailPanel
            event={selectedEvent}
            allEvents={filteredEvents}
            onClose={() => setSelectedEvent(null)}
            onOpenRestore={openRestorePreview}
            onOpenContext={openContextReplay}
          />
        </>
      )}

      {/* Restore Preview Dialog - Step-based flow */}
      <Dialog open={previewOpen} onOpenChange={(open) => {
        setPreviewOpen(open);
        if (!open) {
          setRestoreStep('preview');
          setExpandedDiffFile(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <RotateCcw className="h-5 w-5" />
              {restoreStep === 'success' ? 'Restore Complete' : 'Restore Preview'}
              {/* Step indicator */}
              {restoreStep !== 'success' && previewData && (
                <div className="ml-auto flex items-center gap-1.5 text-xs font-normal text-gray-500">
                  <span className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                    restoreStep === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
                  )}>1</span>
                  <span className="text-gray-600">--</span>
                  <span className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                    restoreStep === 'review' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
                  )}>2</span>
                  <span className="text-gray-600">--</span>
                  <span className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                    restoreStep === 'confirm' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
                  )}>3</span>
                </div>
              )}
            </DialogTitle>
            <DialogDescription>
              {restoreStep === 'preview' && 'Review the files that will be changed by this restore.'}
              {restoreStep === 'review' && 'Inspect the diff for each file. Click a file to expand its changes.'}
              {restoreStep === 'confirm' && 'Final confirmation required. This operation cannot be undone without creating a new checkpoint.'}
              {restoreStep === 'success' && 'The restore was applied successfully.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {/* Loading */}
            {previewLoading && (
              <div className="space-y-4 py-8">
                <div className="flex flex-col items-center">
                  <RefreshCw className="mb-3 h-8 w-8 animate-spin text-blue-500" />
                  <p className="text-sm text-gray-400">Loading diff preview...</p>
                  <p className="mt-1 text-xs text-gray-600">Comparing checkpoint states</p>
                </div>
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </div>
            )}

            {/* Error state */}
            {!previewLoading && !previewData && !restoreResult && (
              <div className="flex flex-col items-center py-12">
                <AlertCircle className="mb-3 h-10 w-10 text-red-500" />
                <p className="text-sm font-medium text-red-400">
                  Could not load preview for this checkpoint.
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  The checkpoint may no longer exist or the server may be unavailable.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => previewEvent && openRestorePreview(previewEvent)}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            )}

            {/* Step 1: Preview - summary + file list */}
            {previewData && restoreStep === 'preview' && (
              <div className="space-y-4">
                {/* Checkpoint info */}
                {previewEvent && (
                  <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      {getTriggerIcon(previewEvent.triggerType)}
                      <span className="font-medium text-white">
                        {humanizeEventDescription(
                          previewEvent.description,
                          previewEvent.triggerType,
                          previewEvent.action
                        )}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      {previewEvent.project && (
                        <span className="flex items-center gap-1">
                          <FolderGit2 className="h-3 w-3" />
                          {previewEvent.project}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(previewEvent.timestamp)}
                      </span>
                      <span className="font-mono text-gray-600">
                        {previewEvent.checkpointId?.slice(0, 12)}...
                      </span>
                    </div>
                  </div>
                )}

                {/* Summary stats */}
                <div className="grid gap-2 text-sm text-gray-300 md:grid-cols-4">
                  <div className="rounded-lg border border-gray-800 bg-gray-900 p-3 text-center">
                    <div className="text-lg font-bold text-white">{previewData.fileCount}</div>
                    <div className="text-xs text-gray-500">Files affected</div>
                  </div>
                  <div className="rounded-lg border border-green-900/40 bg-green-950/20 p-3 text-center">
                    <div className="text-lg font-bold text-green-400">+{previewData.summary.added}</div>
                    <div className="text-xs text-gray-500">Added</div>
                  </div>
                  <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-center">
                    <div className="text-lg font-bold text-red-400">-{previewData.summary.removed}</div>
                    <div className="text-xs text-gray-500">Removed</div>
                  </div>
                  <div className="rounded-lg border border-yellow-900/40 bg-yellow-950/20 p-3 text-center">
                    <div className="text-lg font-bold text-yellow-400">~{previewData.summary.modified}</div>
                    <div className="text-xs text-gray-500">Modified</div>
                  </div>
                </div>

                {/* File list */}
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Affected Files ({previewData.files.length})
                  </h4>
                  <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-gray-800 p-2">
                    {previewData.files.slice(0, 50).map((file) => {
                      const isAdded = Number(file.stats?.added || 0) > 0 && Number(file.stats?.removed || 0) === 0 && Number(file.stats?.modified || 0) === 0;
                      const isRemoved = Number(file.stats?.removed || 0) > 0 && Number(file.stats?.added || 0) === 0 && Number(file.stats?.modified || 0) === 0;
                      return (
                        <div
                          key={file.filePath}
                          className="flex items-center gap-2 rounded border border-gray-800/50 bg-gray-900/50 px-3 py-1.5 text-xs"
                        >
                          {isAdded ? (
                            <FilePlus className="h-3.5 w-3.5 shrink-0 text-green-400" />
                          ) : isRemoved ? (
                            <FileMinus className="h-3.5 w-3.5 shrink-0 text-red-400" />
                          ) : (
                            <FileEdit className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
                          )}
                          <span className="flex-1 truncate font-mono text-gray-300">{file.filePath}</span>
                          <span className="shrink-0 flex gap-2 text-[10px]">
                            {Number(file.stats?.added || 0) > 0 && (
                              <span className="text-green-400">+{file.stats?.added}</span>
                            )}
                            {Number(file.stats?.removed || 0) > 0 && (
                              <span className="text-red-400">-{file.stats?.removed}</span>
                            )}
                            {Number(file.stats?.modified || 0) > 0 && (
                              <span className="text-yellow-400">~{file.stats?.modified}</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {previewData.files.length > 50 && (
                      <p className="py-2 text-center text-xs text-gray-600">
                        +{previewData.files.length - 50} more files
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Review - expandable diff viewer per file */}
            {previewData && restoreStep === 'review' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-800/30 bg-blue-950/20 p-3">
                  <div className="flex items-center gap-2 text-sm text-blue-300">
                    <Info className="h-4 w-4" />
                    Click on a file to expand and view its diff. Review changes before proceeding.
                  </div>
                </div>

                <div className="max-h-[50vh] space-y-2 overflow-y-auto">
                  {previewData.files.slice(0, 50).map((file) => {
                    const isExpanded = expandedDiffFile === file.filePath;
                    return (
                      <div key={file.filePath} className="rounded-lg border border-gray-800 overflow-hidden">
                        {/* File header - clickable */}
                        <button
                          className="flex w-full items-center gap-2 bg-gray-900/80 px-3 py-2 text-left text-xs transition-colors hover:bg-gray-800/80"
                          onClick={() => setExpandedDiffFile(isExpanded ? null : file.filePath)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                          )}
                          <FileCode className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span className="flex-1 truncate font-mono text-gray-300">{file.filePath}</span>
                          <span className="shrink-0 flex items-center gap-2">
                            {Number(file.stats?.added || 0) > 0 && (
                              <span className="text-green-400">+{file.stats?.added}</span>
                            )}
                            {Number(file.stats?.removed || 0) > 0 && (
                              <span className="text-red-400">-{file.stats?.removed}</span>
                            )}
                            {Number(file.stats?.modified || 0) > 0 && (
                              <span className="text-yellow-400">~{file.stats?.modified}</span>
                            )}
                          </span>
                        </button>

                        {/* Expanded diff content */}
                        {isExpanded && (
                          <div className="border-t border-gray-800">
                            {file.diffContent ? (
                              <DiffViewer diff={file.diffContent} />
                            ) : (
                              <div className="px-4 py-6 text-center text-xs text-gray-500">
                                <FileText className="mx-auto mb-2 h-6 w-6 text-gray-600" />
                                <p>No diff content available for this file.</p>
                                <p className="mt-0.5 text-gray-600">
                                  The file may be binary or the diff is too large to display.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Restore reason */}
                <div>
                  <label className="mb-1 block text-xs text-gray-500">
                    Restore reason (optional, for audit trail)
                  </label>
                  <Input
                    placeholder="e.g., Rolling back a broken deployment"
                    value={restoreReason}
                    onChange={(e) => setRestoreReason(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {previewData && restoreStep === 'confirm' && (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-800/40 bg-amber-900/20 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                    <div className="space-y-2 text-sm text-amber-300">
                      <p className="font-semibold">This action will modify your workspace</p>
                      <p className="text-xs text-amber-400/80">
                        Restoring will change <span className="font-bold text-amber-300">{previewData.fileCount} files</span> in
                        {previewEvent?.project && <span className="font-bold text-amber-300"> {previewEvent.project}</span>}.
                        A new checkpoint will be created before the restore is applied,
                        so you can undo this action if needed.
                      </p>
                      {restoreReason && (
                        <p className="text-xs text-amber-400/80">
                          Reason: <span className="italic text-amber-300">{restoreReason}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Summary of changes */}
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg border border-green-900/40 bg-green-950/20 p-2">
                    <span className="text-green-400">+{previewData.summary.added}</span>
                    <span className="ml-1 text-gray-500">added</span>
                  </div>
                  <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-2">
                    <span className="text-red-400">-{previewData.summary.removed}</span>
                    <span className="ml-1 text-gray-500">removed</span>
                  </div>
                  <div className="rounded-lg border border-yellow-900/40 bg-yellow-950/20 p-2">
                    <span className="text-yellow-400">~{previewData.summary.modified}</span>
                    <span className="ml-1 text-gray-500">modified</span>
                  </div>
                </div>

                {/* Confirmation controls */}
                <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restoreConfirmChecked}
                      onChange={(e) => setRestoreConfirmChecked(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800"
                    />
                    <span className="text-sm text-gray-300">
                      I have reviewed the changes and understand that this will modify my workspace files.
                    </span>
                  </label>

                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-500">
                      Type <kbd className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 font-mono text-gray-300">RESTORE</kbd> to confirm:
                    </p>
                    <Input
                      placeholder="Type RESTORE"
                      value={restoreConfirmText}
                      onChange={(e) => setRestoreConfirmText(e.target.value)}
                      className="h-9 font-mono"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Success state */}
            {restoreStep === 'success' && restoreResult && (
              <div className="flex flex-col items-center py-8">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-900/30">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">Restore Applied</h3>
                <p className="text-sm text-gray-400">
                  Successfully restored <span className="font-bold text-green-400">{restoreResult.restoredCount}</span> files.
                </p>
                <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2 text-xs">
                  <span className="text-gray-500">Restore event ID: </span>
                  <span className="font-mono text-gray-300">{restoreResult.restoreEventId}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center gap-2">
            {/* Cancel / Back buttons */}
            {restoreStep === 'preview' && (
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                Cancel
              </Button>
            )}
            {restoreStep === 'review' && (
              <Button variant="outline" onClick={() => setRestoreStep('preview')} className="gap-1.5">
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
            )}
            {restoreStep === 'confirm' && (
              <Button variant="outline" onClick={() => setRestoreStep('review')} className="gap-1.5">
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </Button>
            )}
            {restoreStep === 'success' && (
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                Close
              </Button>
            )}

            {/* Forward / action buttons */}
            {restoreStep === 'preview' && previewData && (
              <Button onClick={() => setRestoreStep('review')} className="gap-1.5">
                Review Changes
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {restoreStep === 'review' && (
              <Button onClick={() => setRestoreStep('confirm')} className="gap-1.5">
                Proceed to Confirm
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
            {restoreStep === 'confirm' && (
              <Button
                onClick={async () => {
                  await applyRestore();
                  setRestoreStep('success');
                }}
                disabled={
                  !previewData ||
                  restoring ||
                  !restoreConfirmChecked ||
                  restoreConfirmText.trim() !== 'RESTORE'
                }
                variant="destructive"
                className="gap-1.5"
              >
                {restoring ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Applying Restore...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Confirm Restore
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Context Replay Dialog */}
      <Dialog open={contextOpen} onOpenChange={setContextOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Checkpoint Context Replay
            </DialogTitle>
            <DialogDescription>
              Messages and tool calls captured at or before this checkpoint.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {contextLoading && (
              <div className="flex flex-col items-center py-12">
                <RefreshCw className="mb-3 h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-400">
                  Loading checkpoint context...
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  Fetching messages and tool call history
                </p>
              </div>
            )}
            {!contextLoading && !contextData && (
              <div className="flex flex-col items-center py-12">
                <AlertCircle className="mb-3 h-10 w-10 text-red-500" />
                <p className="text-sm font-medium text-red-400">
                  Could not load context replay.
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  The context data may not be available for this checkpoint.
                </p>
              </div>
            )}
            {contextData && (
              <Tabs defaultValue="messages" className="w-full">
                {/* Summary counters */}
                <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border border-gray-800 bg-gray-900 p-2.5 text-center">
                    <div className="text-lg font-bold text-white">{contextData.messages.length}</div>
                    <div className="text-gray-500">Messages</div>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900 p-2.5 text-center">
                    <div className="text-lg font-bold text-white">{contextData.toolCalls.length}</div>
                    <div className="text-gray-500">Tool Calls</div>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900 p-2.5 text-center">
                    <div className="text-lg font-bold text-white">{contextData.contexts.length}</div>
                    <div className="text-gray-500">Saved Contexts</div>
                  </div>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  <Input
                    placeholder="Search context content..."
                    value={contextSearch}
                    onChange={(e) => setContextSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <TabsList>
                  <TabsTrigger value="messages">
                    Messages
                    <Badge variant="secondary" className="ml-1.5 h-4 min-w-[16px] px-1 text-[10px]">
                      {contextData.messages.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="tools">
                    Tool Calls
                    <Badge variant="secondary" className="ml-1.5 h-4 min-w-[16px] px-1 text-[10px]">
                      {contextData.toolCalls.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="saved">
                    Saved Contexts
                    <Badge variant="secondary" className="ml-1.5 h-4 min-w-[16px] px-1 text-[10px]">
                      {contextData.contexts.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="messages">
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {(() => {
                      const filtered = contextData.messages.filter((m) =>
                        !contextSearch
                          ? true
                          : `${m.role} ${m.content}`.toLowerCase().includes(contextSearch.toLowerCase())
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className="flex flex-col items-center py-8">
                            <SearchX className="mb-2 h-8 w-8 text-gray-600" />
                            <p className="text-sm text-gray-400">
                              {contextSearch ? 'No messages match your search.' : 'No messages in this context.'}
                            </p>
                          </div>
                        );
                      }
                      // Group messages into threads (consecutive messages from the same role)
                      const threads: Array<typeof filtered> = [];
                      let currentThread: typeof filtered = [];
                      filtered.forEach((m, i) => {
                        if (i === 0 || m.role !== filtered[i - 1].role) {
                          if (currentThread.length > 0) threads.push(currentThread);
                          currentThread = [m];
                        } else {
                          currentThread.push(m);
                        }
                      });
                      if (currentThread.length > 0) threads.push(currentThread);

                      return threads.map((thread, ti) => (
                        <div key={`thread-${ti}`} className="space-y-1">
                          {thread.map((m, mi) => (
                            <div
                              key={m.id}
                              className={cn(
                                'rounded-lg border p-3 text-sm',
                                m.role === 'user'
                                  ? 'border-blue-800/30 bg-blue-950/20'
                                  : m.role === 'assistant'
                                  ? 'border-gray-800 bg-gray-900'
                                  : 'border-gray-800/50 bg-gray-900/50',
                                mi === 0 ? '' : 'ml-4'
                              )}
                            >
                              <div className="mb-1.5 flex items-center gap-2 text-xs">
                                {m.role === 'user' ? (
                                  <Badge className="border border-blue-600/30 bg-blue-600/20 text-blue-400 text-[10px]">User</Badge>
                                ) : m.role === 'assistant' ? (
                                  <Badge className="border border-green-600/30 bg-green-600/20 text-green-400 text-[10px]">Assistant</Badge>
                                ) : (
                                  <Badge className="border border-gray-600/30 bg-gray-600/20 text-gray-400 text-[10px]">System</Badge>
                                )}
                                <span className="text-gray-500">{formatRelativeTime(m.timestamp)}</span>
                              </div>
                              <div className="whitespace-pre-wrap break-words text-gray-200 leading-relaxed">
                                {m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content}
                              </div>
                            </div>
                          ))}
                          {ti < threads.length - 1 && (
                            <div className="ml-2 h-3 border-l-2 border-gray-800" />
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </TabsContent>

                <TabsContent value="tools">
                  <div className="mb-2 flex items-center gap-2">
                    <label className="text-xs text-gray-500">Status:</label>
                    {(['all', 'success', 'failed'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setToolStatusFilter(status)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                          toolStatusFilter === status
                            ? status === 'success'
                              ? 'border-green-600/30 bg-green-600/20 text-green-400'
                              : status === 'failed'
                              ? 'border-red-600/30 bg-red-600/20 text-red-400'
                              : 'border-blue-600/30 bg-blue-600/20 text-blue-300'
                            : 'border-gray-700 text-gray-400 hover:border-gray-600'
                        )}
                      >
                        {status === 'success' && <CheckCircle2 className="h-3 w-3" />}
                        {status === 'failed' && <XCircle className="h-3 w-3" />}
                        {status === 'all' ? 'All' : status === 'success' ? 'Success' : 'Failed'}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {(() => {
                      const filtered = contextData.toolCalls
                        .filter((t) => {
                          if (toolStatusFilter === 'success') return t.success === true;
                          if (toolStatusFilter === 'failed') return t.success === false;
                          return true;
                        })
                        .filter((t) =>
                          !contextSearch
                            ? true
                            : `${t.toolName} ${t.error || ''}`.toLowerCase().includes(contextSearch.toLowerCase())
                        );

                      if (filtered.length === 0) {
                        return (
                          <div className="flex flex-col items-center py-8">
                            <Wrench className="mb-2 h-8 w-8 text-gray-600" />
                            <p className="text-sm text-gray-400">
                              {contextSearch || toolStatusFilter !== 'all'
                                ? 'No tool calls match current filters.'
                                : 'No tool calls in this context.'}
                            </p>
                          </div>
                        );
                      }

                      return filtered.map((t) => (
                        <div
                          key={t.id}
                          className={cn(
                            'rounded-lg border-l-4 p-3 text-sm',
                            t.success === true
                              ? 'border-l-green-500/60 bg-gray-900'
                              : t.success === false
                              ? 'border-l-red-500/60 bg-gray-900'
                              : 'border-l-gray-600/60 bg-gray-900'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Wrench className="h-3.5 w-3.5 text-gray-400" />
                              <span className="font-mono text-sm font-medium text-gray-200">{t.toolName}</span>
                              {t.success === true ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                              ) : t.success === false ? (
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                              ) : (
                                <Clock className="h-3.5 w-3.5 text-gray-500" />
                              )}
                            </div>
                            <span className="text-xs text-gray-500">{formatRelativeTime(t.timestamp)}</span>
                          </div>
                          {t.success === false && t.error && (
                            <div className="mt-2 rounded border border-red-800/30 bg-red-950/20 px-2 py-1 font-mono text-xs text-red-400">
                              {t.error}
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                </TabsContent>

                <TabsContent value="saved">
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {(() => {
                      const filtered = contextData.contexts.filter((c) =>
                        !contextSearch
                          ? true
                          : `${c.name || ''}`.toLowerCase().includes(contextSearch.toLowerCase())
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className="flex flex-col items-center py-8">
                            <FileText className="mb-2 h-8 w-8 text-gray-600" />
                            <p className="text-sm text-gray-400">
                              {contextSearch ? 'No saved contexts match your search.' : 'No saved contexts.'}
                            </p>
                          </div>
                        );
                      }
                      return filtered.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-lg border border-gray-800 bg-gray-900 p-3 text-sm text-gray-200"
                        >
                          <div className="font-medium">{c.name || 'Unnamed context'}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {c.createdAt
                              ? formatRelativeTime(c.createdAt)
                              : 'Unknown time'}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>

          <DialogFooter>
            {contextData?.checkpoint?.id && (
              <Button
                variant="outline"
                onClick={() => {
                  setContextOpen(false);
                  router.push(`/dashboard/context/${contextData.checkpoint.id}`);
                }}
                className="gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Full Replay
              </Button>
            )}
            <Button variant="outline" onClick={() => setContextOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keyboard shortcuts dialog */}
      <KeyboardShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
