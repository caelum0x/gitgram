import { create } from 'zustand';

// ============================================
// Types
// ============================================

export type RestoreStep =
  | 'select-checkpoint'
  | 'choose-scope'
  | 'preview'
  | 'confirm'
  | 'progress'
  | 'result';

export type RestoreScope = 'project' | 'folder' | 'file';

export type FileStatus = 'added' | 'deleted' | 'modified' | 'unchanged';

export interface RestoreFileEntry {
  path: string;
  size: number;
  oldSize?: number;
  status: FileStatus;
  diff: string | null;
  diffStats: {
    added?: number;
    removed?: number;
    modified?: number;
  } | null;
}

export interface CheckpointInfo {
  id: string;
  name: string | null;
  description: string | null;
  createdAt: string | null;
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string;
}

export interface RestorePreviewData {
  fromCheckpoint: CheckpointInfo | null;
  toCheckpoint: CheckpointInfo;
  scope: {
    type: RestoreScope;
    path: string | null;
  };
  summary: {
    totalFiles: number;
    added: number;
    deleted: number;
    modified: number;
    unchanged: number;
  };
  diskSpaceImpact: {
    currentBytes: number;
    targetBytes: number;
    deltaBytes: number;
  };
  estimatedRestoreMs: number;
  files: RestoreFileEntry[];
  conversation: {
    targetMessageCount: number;
    currentMessageCount: number;
    messagesRestored: ConversationMessage[];
    messagesCurrent: ConversationMessage[];
  } | null;
}

export interface RestoreResultData {
  success: boolean;
  restoredCount: number;
  restoreEventId: string;
  backupCheckpointId?: string;
  error?: string;
}

export interface RestoreProgressData {
  phase: 'preparing' | 'backing-up' | 'restoring' | 'finalizing';
  percent: number;
  message: string;
}

// ============================================
// Store
// ============================================

interface RestoreStore {
  // Flow state
  step: RestoreStep;
  isOpen: boolean;

  // Selections
  projectId: string | null;
  selectedCheckpointId: string | null;
  scopeType: RestoreScope;
  scopePath: string;

  // Preview
  previewLoading: boolean;
  previewData: RestorePreviewData | null;
  previewError: string | null;

  // Selective restore (checked file paths)
  selectedFiles: Set<string>;
  showOnlyChanged: boolean;

  // Confirmation
  acknowledged: boolean;
  createBackup: boolean;

  // Progress
  restoring: boolean;
  progressData: RestoreProgressData | null;

  // Result
  restoreResult: RestoreResultData | null;

  // Undo
  undoAvailable: boolean;
  undoDeadline: number | null; // timestamp when undo expires
  backupCheckpointId: string | null;

  // Actions
  open: (projectId: string, checkpointId?: string) => void;
  close: () => void;
  setStep: (step: RestoreStep) => void;
  setProjectId: (id: string) => void;
  setSelectedCheckpointId: (id: string) => void;
  setScopeType: (scope: RestoreScope) => void;
  setScopePath: (path: string) => void;
  setPreviewLoading: (loading: boolean) => void;
  setPreviewData: (data: RestorePreviewData | null) => void;
  setPreviewError: (error: string | null) => void;
  toggleFileSelection: (path: string) => void;
  selectAllInFolder: (folderPath: string) => void;
  deselectAllInFolder: (folderPath: string) => void;
  selectAllChanged: () => void;
  clearFileSelection: () => void;
  setShowOnlyChanged: (show: boolean) => void;
  setAcknowledged: (ack: boolean) => void;
  setCreateBackup: (backup: boolean) => void;
  setRestoring: (restoring: boolean) => void;
  setProgressData: (data: RestoreProgressData | null) => void;
  setRestoreResult: (result: RestoreResultData | null) => void;
  setUndoAvailable: (available: boolean, deadline?: number, backupId?: string) => void;
  reset: () => void;
}

const initialState = {
  step: 'select-checkpoint' as RestoreStep,
  isOpen: false,
  projectId: null as string | null,
  selectedCheckpointId: null as string | null,
  scopeType: 'project' as RestoreScope,
  scopePath: '',
  previewLoading: false,
  previewData: null as RestorePreviewData | null,
  previewError: null as string | null,
  selectedFiles: new Set<string>(),
  showOnlyChanged: false,
  acknowledged: false,
  createBackup: true,
  restoring: false,
  progressData: null as RestoreProgressData | null,
  restoreResult: null as RestoreResultData | null,
  undoAvailable: false,
  undoDeadline: null as number | null,
  backupCheckpointId: null as string | null,
};

export const useRestoreStore = create<RestoreStore>((set, get) => ({
  ...initialState,

  open: (projectId, checkpointId) =>
    set({
      ...initialState,
      isOpen: true,
      projectId,
      selectedCheckpointId: checkpointId || null,
      step: checkpointId ? 'choose-scope' : 'select-checkpoint',
    }),

  close: () => set({ isOpen: false }),

  setStep: (step) => set({ step }),

  setProjectId: (id) => set({ projectId: id }),

  setSelectedCheckpointId: (id) => set({ selectedCheckpointId: id }),

  setScopeType: (scope) => set({ scopeType: scope }),

  setScopePath: (path) => set({ scopePath: path }),

  setPreviewLoading: (loading) => set({ previewLoading: loading }),

  setPreviewData: (data) => set({ previewData: data }),

  setPreviewError: (error) => set({ previewError: error }),

  toggleFileSelection: (path) => {
    const next = new Set(get().selectedFiles);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ selectedFiles: next });
  },

  selectAllInFolder: (folderPath) => {
    const { previewData, selectedFiles } = get();
    if (!previewData) return;
    const next = new Set(selectedFiles);
    const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
    for (const file of previewData.files) {
      if (file.path.startsWith(prefix) || file.path === folderPath) {
        next.add(file.path);
      }
    }
    set({ selectedFiles: next });
  },

  deselectAllInFolder: (folderPath) => {
    const { previewData, selectedFiles } = get();
    if (!previewData) return;
    const next = new Set(selectedFiles);
    const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
    for (const file of previewData.files) {
      if (file.path.startsWith(prefix) || file.path === folderPath) {
        next.delete(file.path);
      }
    }
    set({ selectedFiles: next });
  },

  selectAllChanged: () => {
    const { previewData } = get();
    if (!previewData) return;
    const next = new Set<string>();
    for (const file of previewData.files) {
      if (file.status !== 'unchanged') {
        next.add(file.path);
      }
    }
    set({ selectedFiles: next });
  },

  clearFileSelection: () => set({ selectedFiles: new Set() }),

  setShowOnlyChanged: (show) => set({ showOnlyChanged: show }),

  setAcknowledged: (ack) => set({ acknowledged: ack }),

  setCreateBackup: (backup) => set({ createBackup: backup }),

  setRestoring: (restoring) => set({ restoring }),

  setProgressData: (data) => set({ progressData: data }),

  setRestoreResult: (result) => set({ restoreResult: result }),

  setUndoAvailable: (available, deadline, backupId) =>
    set({
      undoAvailable: available,
      undoDeadline: deadline || null,
      backupCheckpointId: backupId || null,
    }),

  reset: () => set(initialState),
}));
