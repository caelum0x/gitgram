'use client';

import { AlertTriangle, ShieldCheck, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import type { RestorePreviewData } from '@/store/restore';

interface ConfirmRestoreDialogProps {
  preview: RestorePreviewData;
  acknowledged: boolean;
  createBackup: boolean;
  onSetAcknowledged: (ack: boolean) => void;
  onSetCreateBackup: (backup: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  restoring: boolean;
  selectedFileCount: number;
  selectiveMode: boolean;
}

export default function ConfirmRestoreDialog({
  preview,
  acknowledged,
  createBackup,
  onSetAcknowledged,
  onSetCreateBackup,
  onConfirm,
  onCancel,
  restoring,
  selectedFileCount,
  selectiveMode,
}: ConfirmRestoreDialogProps) {
  const { summary } = preview;
  const modifyCount = selectiveMode ? selectedFileCount : summary.added + summary.modified;
  const deleteCount = selectiveMode ? 0 : summary.deleted;

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-lg border border-yellow-600/30 bg-yellow-900/10 p-4">
        <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-yellow-400">Confirm Restore Operation</h3>
          <p className="text-sm text-yellow-200/70 mt-1">
            {selectiveMode
              ? `This will restore ${selectedFileCount} selected files from the target checkpoint.`
              : `This will modify ${modifyCount} files and delete ${deleteCount} files in your working directory.`}
          </p>
        </div>
      </div>

      {/* Restore summary */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Current State</div>
          <div className="text-sm text-gray-300">
            {preview.fromCheckpoint ? (
              <>
                <div className="font-medium">{preview.fromCheckpoint.name || 'Unnamed checkpoint'}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {preview.fromCheckpoint.createdAt
                    ? formatRelativeTime(preview.fromCheckpoint.createdAt)
                    : 'Unknown time'}
                </div>
              </>
            ) : (
              <span className="text-gray-500">No baseline checkpoint</span>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-blue-600/30 bg-blue-900/10 p-4">
          <div className="text-xs text-blue-400 uppercase tracking-wide mb-2">Restore Target</div>
          <div className="text-sm text-gray-300">
            <div className="font-medium">{preview.toCheckpoint.name || 'Unnamed checkpoint'}</div>
            <div className="text-xs text-gray-500 mt-1">
              {preview.toCheckpoint.createdAt
                ? formatRelativeTime(preview.toCheckpoint.createdAt)
                : 'Unknown time'}
            </div>
          </div>
        </div>
      </div>

      {/* Impact stats */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <span className="text-green-400 font-mono">+{summary.added}</span>
          <span className="text-gray-500">files added</span>
        </div>
        <div className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <span className="text-red-400 font-mono">-{summary.deleted}</span>
          <span className="text-gray-500">files deleted</span>
        </div>
        <div className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <span className="text-yellow-400 font-mono">~{summary.modified}</span>
          <span className="text-gray-500">files modified</span>
        </div>
        <div className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900 px-3 py-2">
          <span className="text-gray-400 font-mono">
            {preview.diskSpaceImpact.deltaBytes >= 0 ? '+' : '-'}
            {formatBytes(Math.abs(preview.diskSpaceImpact.deltaBytes))}
          </span>
          <span className="text-gray-500">disk impact</span>
        </div>
      </div>

      {/* Scope indicator */}
      {preview.scope.type !== 'project' && (
        <div className="text-sm text-gray-400">
          Scope:{' '}
          <Badge variant="outline" className="ml-1">
            {preview.scope.type}: {preview.scope.path}
          </Badge>
        </div>
      )}

      {/* Create backup toggle */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <div
          className={`relative w-10 h-5 rounded-full transition-colors ${
            createBackup ? 'bg-blue-600' : 'bg-gray-700'
          }`}
          onClick={() => onSetCreateBackup(!createBackup)}
        >
          <div
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              createBackup ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </div>
        <div>
          <div className="text-sm text-gray-200 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-400" />
            Create backup checkpoint before restore
          </div>
          <div className="text-xs text-gray-500">Recommended. Allows undo after restore.</div>
        </div>
      </label>

      {/* Acknowledgment checkbox */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onSetAcknowledged(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
        />
        <div className="text-sm text-gray-300">
          I understand this action modifies my working directory
          {summary.deleted > 0 && (
            <span className="text-red-400"> and will permanently delete {summary.deleted} files</span>
          )}
          .
        </div>
      </label>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-800">
        <Button variant="outline" onClick={onCancel} disabled={restoring}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!acknowledged || restoring}
          className={restoring ? '' : 'bg-blue-600 hover:bg-blue-500'}
        >
          {restoring ? (
            <>
              <RotateCcw className="mr-2 h-4 w-4 animate-spin" />
              Restoring...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {selectiveMode ? `Restore ${selectedFileCount} Files` : 'Confirm Restore'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
