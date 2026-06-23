'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  FolderGit2,
  GitBranch,
  Loader2,
  RotateCcw,
  AlertCircle,
  Undo2,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatRelativeTime } from '@/lib/utils';
import RestorePreview from '@/components/RestorePreview';
import ConfirmRestoreDialog from '@/components/ConfirmRestoreDialog';
import { useRestoreStore, type RestoreStep } from '@/store/restore';
import { TimelineEvent, useProjects } from '@/hooks/useDashboard';

// ============================================
// Step indicator
// ============================================

const STEPS: { key: RestoreStep; label: string; number: number }[] = [
  { key: 'select-checkpoint', label: 'Select Checkpoint', number: 1 },
  { key: 'choose-scope', label: 'Choose Scope', number: 2 },
  { key: 'preview', label: 'Preview Changes', number: 3 },
  { key: 'confirm', label: 'Confirm', number: 4 },
  { key: 'progress', label: 'Restoring', number: 5 },
  { key: 'result', label: 'Result', number: 6 },
];

function StepIndicator({ currentStep }: { currentStep: RestoreStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {STEPS.map((step, i) => {
        const isActive = i === currentIdx;
        const isComplete = i < currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1">
            <div
              className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium border transition-colors ${
                isComplete
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : isActive
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                  : 'bg-gray-800 border-gray-700 text-gray-500'
              }`}
            >
              {isComplete ? <CheckCircle2 className="h-4 w-4" /> : step.number}
            </div>
            <span
              className={`text-xs whitespace-nowrap ${
                isActive ? 'text-blue-400 font-medium' : isComplete ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-gray-700 mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Step 1: Select Checkpoint
// ============================================

interface CheckpointListProps {
  projectId: string;
  onSelect: (checkpointId: string) => void;
}

function SelectCheckpointStep({ projectId, onSelect }: CheckpointListProps) {
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function fetchCheckpoints() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ projectId, limit: '50' });
        const res = await fetch(`/api/time/timeline?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setCheckpoints(data.items || []);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCheckpoints();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    if (!search) return checkpoints;
    const q = search.toLowerCase();
    return checkpoints.filter(
      (cp) =>
        (cp.name || '').toLowerCase().includes(q) ||
        (cp.description || '').toLowerCase().includes(q)
    );
  }, [checkpoints, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-400">Loading checkpoints...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search checkpoints..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-[400px] overflow-y-auto space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No checkpoints found</p>
        ) : (
          filtered.map((cp) => (
            <Card
              key={cp.id}
              className="cursor-pointer transition-colors hover:border-blue-600/40"
              onClick={() => onSelect(cp.id)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">
                      {cp.name || cp.description || 'Unnamed checkpoint'}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {cp.createdAt ? formatRelativeTime(cp.createdAt) : 'Unknown time'}
                      </span>
                      {cp.triggerType && (
                        <Badge variant="secondary" className="text-xs">
                          {cp.triggerType}
                        </Badge>
                      )}
                      {cp.diff && cp.diff.fileCount > 0 && (
                        <span>
                          {cp.diff.fileCount} files changed
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-600" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================
// Step 2: Choose Scope
// ============================================

function ChooseScopeStep({
  scopeType,
  scopePath,
  onSetScopeType,
  onSetScopePath,
  onNext,
}: {
  scopeType: 'project' | 'folder' | 'file';
  scopePath: string;
  onSetScopeType: (s: 'project' | 'folder' | 'file') => void;
  onSetScopePath: (p: string) => void;
  onNext: () => void;
}) {
  const scopes = [
    {
      type: 'project' as const,
      icon: FolderGit2,
      title: 'Full Project',
      description: 'Restore all files in the project to the checkpoint state',
    },
    {
      type: 'folder' as const,
      icon: FolderGit2,
      title: 'Folder',
      description: 'Restore only files within a specific folder',
    },
    {
      type: 'file' as const,
      icon: GitBranch,
      title: 'Single File',
      description: 'Restore a single file to its checkpoint state',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {scopes.map((scope) => (
          <Card
            key={scope.type}
            className={`cursor-pointer transition-all ${
              scopeType === scope.type
                ? 'border-blue-500 bg-blue-600/5'
                : 'hover:border-gray-600'
            }`}
            onClick={() => onSetScopeType(scope.type)}
          >
            <CardContent className="py-4 px-4 flex items-center gap-4">
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                  scopeType === scope.type ? 'bg-blue-600/20' : 'bg-gray-800'
                }`}
              >
                <scope.icon
                  className={`h-5 w-5 ${
                    scopeType === scope.type ? 'text-blue-400' : 'text-gray-500'
                  }`}
                />
              </div>
              <div>
                <div className="text-sm font-medium text-white">{scope.title}</div>
                <div className="text-xs text-gray-500">{scope.description}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {scopeType !== 'project' && (
        <Input
          placeholder={
            scopeType === 'folder'
              ? 'Enter folder path, e.g. src/components'
              : 'Enter file path, e.g. src/app/page.tsx'
          }
          value={scopePath}
          onChange={(e) => onSetScopePath(e.target.value)}
        />
      )}

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={scopeType !== 'project' && !scopePath}
        >
          Preview Changes
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Step 5: Progress
// ============================================

function RestoreProgressStep({
  progressData,
}: {
  progressData: { phase: string; percent: number; message: string } | null;
}) {
  const phase = progressData?.phase || 'preparing';
  const percent = progressData?.percent || 0;
  const message = progressData?.message || 'Preparing restore...';

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-white">Restoring...</h3>
        <p className="text-sm text-gray-400">{message}</p>
        <Badge variant="secondary">{phase}</Badge>
      </div>
      <div className="w-full max-w-md">
        <Progress value={percent} />
        <p className="text-xs text-gray-500 text-center mt-2">{percent}% complete</p>
      </div>
    </div>
  );
}

// ============================================
// Step 6: Result
// ============================================

function RestoreResultStep({
  result,
  undoAvailable,
  undoDeadline,
  onUndo,
  onClose,
}: {
  result: { success: boolean; restoredCount: number; restoreEventId: string; error?: string };
  undoAvailable: boolean;
  undoDeadline: number | null;
  onUndo: () => void;
  onClose: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!undoDeadline) return;
    const interval = setInterval(() => {
      const left = Math.max(0, undoDeadline - Date.now());
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [undoDeadline]);

  const undoMinutesLeft = remaining !== null ? Math.ceil(remaining / 60000) : null;

  if (!result.success) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h3 className="text-lg font-medium text-red-400">Restore Failed</h3>
        <p className="text-sm text-gray-400 text-center max-w-md">
          {result.error || 'An unexpected error occurred during the restore operation.'}
        </p>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <CheckCircle2 className="h-12 w-12 text-green-500" />
      <h3 className="text-lg font-medium text-green-400">Restore Successful</h3>
      <p className="text-sm text-gray-400 text-center">
        Successfully restored {result.restoredCount} files.
      </p>
      <p className="text-xs text-gray-600">Event ID: {result.restoreEventId}</p>

      {undoAvailable && remaining !== null && remaining > 0 && (
        <div className="rounded-lg border border-yellow-600/30 bg-yellow-900/10 p-4 text-center max-w-md">
          <p className="text-sm text-yellow-300">
            Restored successfully. Undo available for {undoMinutesLeft} minute{undoMinutesLeft !== 1 ? 's' : ''}.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-yellow-600/40 text-yellow-400 hover:bg-yellow-900/20"
            onClick={onUndo}
          >
            <Undo2 className="mr-2 h-4 w-4" />
            Undo Restore
          </Button>
        </div>
      )}

      <Button onClick={onClose} className="mt-4">
        Done
      </Button>
    </div>
  );
}

// ============================================
// Toast notification for undo
// ============================================

function UndoToast({
  visible,
  minutesLeft,
  onUndo,
  onDismiss,
}: {
  visible: boolean;
  minutesLeft: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 shadow-xl">
        <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
        <div>
          <p className="text-sm text-white">Restored successfully.</p>
          <p className="text-xs text-gray-400">
            Undo available for {minutesLeft} minute{minutesLeft !== 1 ? 's' : ''}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onUndo}>
          <Undo2 className="mr-1 h-3 w-3" />
          Undo
        </Button>
        <button onClick={onDismiss} className="text-gray-500 hover:text-gray-300">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================
// Main RestoreFlow Component
// ============================================

export default function RestoreFlow() {
  const store = useRestoreStore();
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMinutes, setToastMinutes] = useState(5);

  // Fetch preview when moving to preview step
  const fetchPreview = useCallback(async () => {
    if (!store.projectId || !store.selectedCheckpointId) return;

    store.setPreviewLoading(true);
    store.setPreviewError(null);
    store.setPreviewData(null);

    try {
      const res = await fetch('/api/time/restore-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: store.projectId,
          toCheckpointId: store.selectedCheckpointId,
          scopeType: store.scopeType,
          scopePath: store.scopeType !== 'project' ? store.scopePath : undefined,
          includeConversation: true,
          messageLimit: 50,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || 'Failed to load preview');
      }

      const data = await res.json();
      store.setPreviewData(data);
    } catch (err: any) {
      store.setPreviewError(err.message || 'Failed to load preview');
    } finally {
      store.setPreviewLoading(false);
    }
  }, [store.projectId, store.selectedCheckpointId, store.scopeType, store.scopePath]);

  // Execute the restore
  const executeRestore = useCallback(async () => {
    if (!store.projectId || !store.selectedCheckpointId) return;

    store.setStep('progress');
    store.setRestoring(true);
    store.setProgressData({ phase: 'preparing', percent: 10, message: 'Preparing restore...' });

    try {
      // Simulate progress phases
      store.setProgressData({ phase: 'backing-up', percent: 25, message: 'Creating backup checkpoint...' });

      const hasSelectedFiles = store.selectedFiles.size > 0;
      const body: Record<string, unknown> = {
        projectId: store.projectId,
        checkpointId: store.selectedCheckpointId,
        scopeType: store.scopeType,
        scopePath: store.scopeType !== 'project' ? store.scopePath : undefined,
        includeContext: true,
        createBackup: store.createBackup,
      };

      if (hasSelectedFiles) {
        body.selectedFiles = Array.from(store.selectedFiles);
      }

      store.setProgressData({ phase: 'restoring', percent: 50, message: 'Applying restore...' });

      const res = await fetch('/api/time/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      store.setProgressData({ phase: 'finalizing', percent: 90, message: 'Finalizing...' });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Restore failed' }));
        throw new Error(errData.error || 'Restore failed');
      }

      const data = await res.json();

      store.setProgressData({ phase: 'finalizing', percent: 100, message: 'Complete' });

      // Set result
      store.setRestoreResult({
        success: true,
        restoredCount: data.restoredCount || 0,
        restoreEventId: data.restoreEventId || 'unknown',
        backupCheckpointId: data.backupCheckpointId,
      });

      // Set undo availability (5 minutes)
      const deadline = Date.now() + 5 * 60 * 1000;
      store.setUndoAvailable(true, deadline, data.backupCheckpointId);

      // Show toast
      setShowToast(true);
      setToastMinutes(5);

      // Auto-expire undo
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        store.setUndoAvailable(false);
        setShowToast(false);
      }, 5 * 60 * 1000);

      // Update toast timer
      const toastInterval = setInterval(() => {
        const left = Math.max(0, deadline - Date.now());
        setToastMinutes(Math.ceil(left / 60000));
        if (left <= 0) {
          clearInterval(toastInterval);
          setShowToast(false);
        }
      }, 10000);

      store.setStep('result');
    } catch (err: any) {
      store.setRestoreResult({
        success: false,
        restoredCount: 0,
        restoreEventId: '',
        error: err.message,
      });
      store.setStep('result');
    } finally {
      store.setRestoring(false);
    }
  }, [store.projectId, store.selectedCheckpointId, store.scopeType, store.scopePath, store.selectedFiles, store.createBackup]);

  // Execute undo
  const executeUndo = useCallback(async () => {
    if (!store.projectId || !store.backupCheckpointId) return;

    store.setStep('progress');
    store.setRestoring(true);
    store.setProgressData({ phase: 'restoring', percent: 30, message: 'Undoing restore...' });

    try {
      const res = await fetch('/api/time/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: store.projectId,
          includeContext: true,
        }),
      });

      if (!res.ok) {
        throw new Error('Undo failed');
      }

      const data = await res.json();

      store.setProgressData({ phase: 'finalizing', percent: 100, message: 'Undo complete' });
      store.setUndoAvailable(false);
      setShowToast(false);

      store.setRestoreResult({
        success: true,
        restoredCount: data.restoredCount || 0,
        restoreEventId: data.restoreEventId || 'unknown',
      });
      store.setStep('result');
    } catch (err: any) {
      store.setRestoreResult({
        success: false,
        restoredCount: 0,
        restoreEventId: '',
        error: err.message,
      });
      store.setStep('result');
    } finally {
      store.setRestoring(false);
    }
  }, [store.projectId, store.backupCheckpointId]);

  // Step navigation handlers
  const handleSelectCheckpoint = (checkpointId: string) => {
    store.setSelectedCheckpointId(checkpointId);
    store.setStep('choose-scope');
  };

  const handleScopeNext = () => {
    store.setStep('preview');
    fetchPreview();
  };

  const handlePreviewNext = () => {
    store.setStep('confirm');
  };

  const handleBack = () => {
    const stepIdx = STEPS.findIndex((s) => s.key === store.step);
    if (stepIdx > 0) {
      store.setStep(STEPS[stepIdx - 1].key);
    }
  };

  const handleClose = () => {
    store.close();
  };

  if (!store.isOpen) {
    return (
      <UndoToast
        visible={showToast}
        minutesLeft={toastMinutes}
        onUndo={executeUndo}
        onDismiss={() => setShowToast(false)}
      />
    );
  }

  return (
    <>
      <Dialog open={store.isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-400" />
              Restore Checkpoint
            </DialogTitle>
            <DialogDescription>
              Preview and confirm before restoring to a previous state
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <StepIndicator currentStep={store.step} />

          {/* Step content */}
          <div className="mt-4">
            {/* Step 1: Select Checkpoint */}
            {store.step === 'select-checkpoint' && store.projectId && (
              <SelectCheckpointStep
                projectId={store.projectId}
                onSelect={handleSelectCheckpoint}
              />
            )}

            {/* Step 2: Choose Scope */}
            {store.step === 'choose-scope' && (
              <div>
                <div className="mb-4">
                  <Button variant="ghost" size="sm" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to checkpoints
                  </Button>
                </div>
                <ChooseScopeStep
                  scopeType={store.scopeType}
                  scopePath={store.scopePath}
                  onSetScopeType={store.setScopeType}
                  onSetScopePath={store.setScopePath}
                  onNext={handleScopeNext}
                />
              </div>
            )}

            {/* Step 3: Preview */}
            {store.step === 'preview' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Button variant="ghost" size="sm" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to scope
                  </Button>
                  {store.previewData && (
                    <Button onClick={handlePreviewNext}>
                      Continue to Confirm
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                </div>

                {store.previewLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                    <span className="ml-2 text-gray-400">Loading restore preview...</span>
                  </div>
                )}

                {store.previewError && (
                  <div className="flex flex-col items-center py-12 space-y-3">
                    <AlertCircle className="h-8 w-8 text-red-500" />
                    <p className="text-sm text-red-400">{store.previewError}</p>
                    <Button variant="outline" size="sm" onClick={fetchPreview}>
                      Retry
                    </Button>
                  </div>
                )}

                {store.previewData && (
                  <RestorePreview
                    preview={store.previewData}
                    selectedFiles={store.selectedFiles}
                    onToggleFileSelection={store.toggleFileSelection}
                    onSelectAllInFolder={store.selectAllInFolder}
                    onDeselectAllInFolder={store.deselectAllInFolder}
                    onSelectAllChanged={store.selectAllChanged}
                    onClearSelection={store.clearFileSelection}
                    showOnlyChanged={store.showOnlyChanged}
                    onSetShowOnlyChanged={store.setShowOnlyChanged}
                  />
                )}
              </div>
            )}

            {/* Step 4: Confirm */}
            {store.step === 'confirm' && store.previewData && (
              <div>
                <div className="mb-4">
                  <Button variant="ghost" size="sm" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to preview
                  </Button>
                </div>
                <ConfirmRestoreDialog
                  preview={store.previewData}
                  acknowledged={store.acknowledged}
                  createBackup={store.createBackup}
                  onSetAcknowledged={store.setAcknowledged}
                  onSetCreateBackup={store.setCreateBackup}
                  onConfirm={executeRestore}
                  onCancel={() => store.setStep('preview')}
                  restoring={store.restoring}
                  selectedFileCount={store.selectedFiles.size}
                  selectiveMode={store.selectedFiles.size > 0}
                />
              </div>
            )}

            {/* Step 5: Progress */}
            {store.step === 'progress' && (
              <RestoreProgressStep progressData={store.progressData} />
            )}

            {/* Step 6: Result */}
            {store.step === 'result' && store.restoreResult && (
              <RestoreResultStep
                result={store.restoreResult}
                undoAvailable={store.undoAvailable}
                undoDeadline={store.undoDeadline}
                onUndo={executeUndo}
                onClose={handleClose}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <UndoToast
        visible={showToast && !store.isOpen}
        minutesLeft={toastMinutes}
        onUndo={() => {
          store.open(store.projectId || '', store.backupCheckpointId || undefined);
          executeUndo();
        }}
        onDismiss={() => setShowToast(false)}
      />
    </>
  );
}
