/**
 * Core types for AITimeMachine
 */

export interface TimePoint {
  id: string;
  timestamp: Date;
  description: string;

  // What triggered this capture
  trigger: {
    type: 'ai_action' | 'manual' | 'auto' | 'restore';
    tool?: string;      // claude_code, cursor, gemini, etc
    action?: string;    // file_write, refactor, etc
    status?: 'before' | 'after_success' | 'after_failed';
  };

  // Linking before/after pairs
  linkedCheckpointId?: string;

  // Conversation state at this moment
  conversation: {
    sessionId: string;
    messageCount: number;
    lastMessagePreview: string;
  };

  // File system state
  files: FileEntry[];

  // Changes from previous timepoint
  changes: {
    added: string[];
    modified: string[];
    deleted: string[];
  };

  // Stats
  stats: {
    totalFiles: number;
    totalSize: number;
  };
}

export interface FileEntry {
  path: string;           // Relative path from project root
  hash: string;           // Content hash in store
  size: number;
  mode: number;           // File permissions
  mtime: number;          // Modified time (ms)
}

// ============================================
// TREE TYPES (Git-like directory tree objects)
// ============================================

/**
 * A single entry in a tree object, representing either a file (blob) or subdirectory (tree).
 */
export interface TreeEntry {
  name: string;           // Name of the file or directory (not full path)
  type: 'blob' | 'tree';
  hash: string;           // Content hash (blob hash for files, tree hash for subdirectories)
  mode: number;           // File permissions (e.g. 0o644 for files, 0o755 for dirs)
  size: number;           // Size in bytes (file size for blobs, 0 for trees)
}

/**
 * A tree object representing the contents of a single directory.
 * Trees are content-addressed: identical directory states produce the same hash.
 */
export interface Tree {
  id: string;
  projectId: string;
  hash: string;           // Content-addressed hash of this tree
  parentPath: string;     // Directory path this tree represents, e.g. "/" or "src/"
  entries: TreeEntry[];
}

export interface ConversationMessage {
  id: string;
  timestamp: Date;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    tool?: string;        // Which AI tool
    action?: string;      // What action was taken
    files?: string[];     // Files affected
  };
}

export interface TimePointSummary {
  id: string;
  timestamp: Date;
  description: string;
  trigger: TimePoint['trigger'];
  stats: TimePoint['stats'];
  changesCount: number;
  linkedCheckpointId?: string;
}

export interface RestorePreview {
  timepoint: TimePointSummary;
  filesToRestore: string[];
  filesToDelete: string[];
  conversationMessagesToKeep: number;
}

export interface Config {
  autoCapture: boolean;
  captureInterval: number;    // ms, for debouncing
  maxTimePoints: number;
  excludePatterns: string[];
  includePatterns: string[];
  maxFileSize: number;        // bytes
}

export const DEFAULT_CONFIG: Config = {
  autoCapture: true,
  captureInterval: 2000,
  maxTimePoints: 1000,
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.aitimemachine/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/*.log',
    '**/.DS_Store',
  ],
  includePatterns: [],
  maxFileSize: 10 * 1024 * 1024, // 10MB
};
