import * as fs from 'fs';
import * as path from 'path';
import { ContentStore } from './content-store.js';
import { TimePointManager } from './timepoint-manager.js';
import { ConversationStore } from './conversation-store.js';
import { FileScanner } from './file-scanner.js';
import { TimePoint, FileEntry, Config, DEFAULT_CONFIG, RestorePreview, TimePointSummary } from './types.js';
import { assertConsent } from '../auth/consent-policy.js';

/**
 * Main TimeMachine engine - coordinates all components
 */
export class TimeMachineEngine {
  private basePath: string;
  private contentStore: ContentStore;
  private timePointManager: TimePointManager;
  private conversationStore: ConversationStore;
  private fileScanner: FileScanner;
  private config: Config;
  private captureListeners: ((tp: TimePoint) => void | Promise<void>)[] = [];

  constructor(private projectPath: string) {
    this.basePath = path.join(projectPath, '.aitimemachine');
    this.ensureDir(this.basePath);
    
    this.config = this.loadConfig();
    this.contentStore = new ContentStore(this.basePath);
    this.timePointManager = new TimePointManager(this.basePath);
    this.conversationStore = new ConversationStore(this.basePath);
    this.fileScanner = new FileScanner(projectPath, this.config);
  }

  /**
   * Register a callback to be called after each capture
   */
  onCapture(listener: (tp: TimePoint) => void | Promise<void>): void {
    this.captureListeners.push(listener);
  }

  private async notifyCapture(tp: TimePoint): Promise<void> {
    for (const listener of this.captureListeners) {
      try {
        await listener(tp);
      } catch (e) {
        console.error('[Engine] Capture listener error:', e);
      }
    }
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private loadConfig(): Config {
    const configPath = path.join(this.basePath, 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return { ...DEFAULT_CONFIG, ...data };
      } catch { /* use default */ }
    }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    const configPath = path.join(this.basePath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<Config>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    this.fileScanner = new FileScanner(this.projectPath, this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): Config {
    return { ...this.config };
  }

  /**
   * Capture current state as a TimePoint (optimized - only stores changed files)
   */
  capture(
    description: string,
    trigger: TimePoint['trigger'] = { type: 'manual' },
    linkedCheckpointId?: string
  ): TimePoint {
    assertConsent(this.projectPath, 'capture', {
      source: 'core.engine.capture',
      resource: this.projectPath,
    });

    const files = this.fileScanner.scan();
    const previousTp = this.timePointManager.getLatest();
    const previousFiles = new Map<string, FileEntry>();
    
    if (previousTp) {
      for (const f of previousTp.files) {
        previousFiles.set(f.path, f);
      }
    }

    const fileEntries: FileEntry[] = [];
    const changes = { added: [] as string[], modified: [] as string[], deleted: [] as string[] };
    let totalSize = 0;

    // Process current files - only read content if file changed
    for (const filePath of files) {
      const relativePath = path.relative(this.projectPath, filePath);
      const info = this.fileScanner.getFileInfo(filePath);
      if (!info) continue;

      const prev = previousFiles.get(relativePath);
      
      // Check if file changed by mtime first (fast check)
      let hash: string;
      if (prev && prev.mtime === info.mtime && prev.size === info.size) {
        // File unchanged - reuse hash without reading content
        hash = prev.hash;
      } else {
        // File changed or new - read and store content
        const content = this.fileScanner.readFile(filePath);
        if (!content) continue;
        hash = this.contentStore.put(content);
        
        // Track changes
        if (!prev) {
          changes.added.push(relativePath);
        } else if (prev.hash !== hash) {
          changes.modified.push(relativePath);
        }
      }

      totalSize += info.size;
      fileEntries.push({
        path: relativePath,
        hash,
        size: info.size,
        mode: info.mode,
        mtime: info.mtime,
      });

      previousFiles.delete(relativePath);
    }

    // Remaining in previousFiles are deleted
    changes.deleted = Array.from(previousFiles.keys());

    const tp: TimePoint = {
      id: this.timePointManager.generateId(),
      timestamp: new Date(),
      description,
      trigger,
      linkedCheckpointId,
      conversation: {
        sessionId: this.conversationStore.getSessionId(),
        messageCount: this.conversationStore.count(),
        lastMessagePreview: this.conversationStore.getLastPreview(),
      },
      files: fileEntries,
      changes,
      stats: {
        totalFiles: fileEntries.length,
        totalSize,
      },
    };

    this.timePointManager.save(tp);
    this.timePointManager.cleanup(this.config.maxTimePoints);

    // Notify listeners (async, non-blocking)
    this.notifyCapture(tp).catch(() => {});

    return tp;
  }

  /**
   * Log a conversation message
   */
  logMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: { tool?: string; action?: string; files?: string[] }
  ): void {
    this.conversationStore.add(role, content, metadata);
  }

  /**
   * Get file content at a specific timepoint
   */
  getFileAt(timePointId: string, filePath: string): string | null {
    const tp = this.timePointManager.load(timePointId);
    if (!tp) return null;

    const fileEntry = tp.files.find((f: FileEntry) => f.path === filePath);
    if (!fileEntry) return null;

    return this.contentStore.getString(fileEntry.hash);
  }

  /**
   * Get raw file content at a timepoint as a Buffer (binary-safe).
   *
   * Prefer this over getFileAt() whenever the content will be written back to
   * disk, so binary files (images, compiled assets, etc.) are not corrupted by
   * a lossy UTF-8 decode/encode round-trip. getFileAt() remains for callers
   * that genuinely need a string (display, diffing).
   */
  getFileBufferAt(timePointId: string, filePath: string): Buffer | null {
    const tp = this.timePointManager.load(timePointId);
    if (!tp) return null;

    const fileEntry = tp.files.find((f: FileEntry) => f.path === filePath);
    if (!fileEntry) return null;

    return this.contentStore.get(fileEntry.hash);
  }

  /**
   * Get preview of what restore will do
   */
  previewRestore(timePointId: string): RestorePreview | null {
    const tp = this.timePointManager.load(timePointId);
    if (!tp) return null;

    const currentFiles = new Set(
      this.fileScanner.scan().map(f => path.relative(this.projectPath, f))
    );
    const tpFiles = new Set(tp.files.map(f => f.path));

    const filesToRestore = tp.files.map(f => f.path);
    const filesToDelete = Array.from(currentFiles).filter(f => !tpFiles.has(f) && !f.startsWith('.aitimemachine'));

    return {
      timepoint: {
        id: tp.id,
        timestamp: tp.timestamp,
        description: tp.description,
        trigger: tp.trigger,
        stats: tp.stats,
        changesCount: tp.changes.added.length + tp.changes.modified.length + tp.changes.deleted.length,
      },
      filesToRestore,
      filesToDelete,
      conversationMessagesToKeep: this.conversationStore.getUntil(tp.timestamp).length,
    };
  }

  /**
   * Restore to a TimePoint with atomic operations and rollback on failure
   */
  restore(timePointId: string): { filesRestored: number; filesDeleted: number; messagesRemoved: number } {
    const tp = this.timePointManager.load(timePointId);
    if (!tp) throw new Error(`TimePoint not found: ${timePointId}`);

    // First, capture current state as backup
    const backupTp = this.capture(`Before restore to ${tp.description}`, { type: 'restore' });

    const currentFiles = new Set(
      this.fileScanner.scan().map(f => path.relative(this.projectPath, f))
    );
    const tpFiles = new Set(tp.files.map(f => f.path));

    // Track operations for rollback
    const operations: Array<{
      type: 'write' | 'delete' | 'mkdir';
      path: string;
      originalContent?: Buffer;
      originalExists: boolean;
    }> = [];

    let filesRestored = 0;
    let filesDeleted = 0;

    try {
      // Phase 1: Delete files that didn't exist at timepoint (but never delete .aitimemachine)
      for (const relativePath of currentFiles) {
        if (!tpFiles.has(relativePath) && !relativePath.startsWith('.aitimemachine')) {
          const fullPath = path.join(this.projectPath, relativePath);
          
          // Save original for rollback
          let originalContent: Buffer | undefined;
          try {
            originalContent = fs.readFileSync(fullPath);
          } catch {}
          
          operations.push({
            type: 'delete',
            path: fullPath,
            originalContent,
            originalExists: true,
          });

          fs.unlinkSync(fullPath);
          filesDeleted++;

          // Remove empty directories
          this.removeEmptyDirs(path.dirname(fullPath));
        }
      }

      // Phase 2: Restore files from timepoint
      for (const file of tp.files) {
        const content = this.contentStore.get(file.hash);
        if (!content) {
          console.warn(`Content not found for ${file.path}, skipping`);
          continue;
        }

        const fullPath = path.join(this.projectPath, file.path);
        const dir = path.dirname(fullPath);

        // Track original state
        let originalContent: Buffer | undefined;
        const originalExists = fs.existsSync(fullPath);
        if (originalExists) {
          try {
            originalContent = fs.readFileSync(fullPath);
          } catch {}
        }

        // Ensure directory exists
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          operations.push({
            type: 'mkdir',
            path: dir,
            originalExists: false,
          });
        }

        operations.push({
          type: 'write',
          path: fullPath,
          originalContent,
          originalExists,
        });

        // Write file
        fs.writeFileSync(fullPath, content);

        // Restore file mode (ignore errors on Windows)
        try {
          fs.chmodSync(fullPath, file.mode);
        } catch {}

        filesRestored++;
      }

      // Phase 3: Restore conversation
      const messagesRemoved = this.conversationStore.restoreTo(tp.timestamp);

      return { filesRestored, filesDeleted, messagesRemoved };

    } catch (error) {
      // Rollback all operations
      console.error('Restore failed, rolling back...', error);
      this.rollback(operations);
      throw new Error(`Restore failed and was rolled back: ${(error as Error).message}`);
    }
  }

  /**
   * Rollback operations in reverse order
   */
  private rollback(operations: Array<{
    type: 'write' | 'delete' | 'mkdir';
    path: string;
    originalContent?: Buffer;
    originalExists: boolean;
  }>): void {
    // Process in reverse order
    for (let i = operations.length - 1; i >= 0; i--) {
      const op = operations[i];
      try {
        switch (op.type) {
          case 'write':
            if (op.originalExists && op.originalContent) {
              fs.writeFileSync(op.path, op.originalContent);
            } else if (!op.originalExists) {
              fs.unlinkSync(op.path);
            }
            break;
          case 'delete':
            if (op.originalContent) {
              const dir = path.dirname(op.path);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              fs.writeFileSync(op.path, op.originalContent);
            }
            break;
          case 'mkdir':
            if (!op.originalExists) {
              try {
                fs.rmdirSync(op.path);
              } catch {}
            }
            break;
        }
      } catch (e) {
        console.error(`Rollback failed for ${op.path}:`, e);
      }
    }
  }

  /**
   * Remove empty directories up to project root
   */
  private removeEmptyDirs(dir: string): void {
    while (dir !== this.projectPath && dir.startsWith(this.projectPath)) {
      try {
        const entries = fs.readdirSync(dir);
        if (entries.length === 0) {
          fs.rmdirSync(dir);
          dir = path.dirname(dir);
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }

  /**
   * List all timepoints
   */
  listTimePoints(): TimePointSummary[] {
    return this.timePointManager.list();
  }

  /**
   * Get a specific timepoint
   */
  getTimePoint(id: string): TimePoint | null {
    return this.timePointManager.load(id);
  }

  /**
   * Find timepoint by time
   */
  findByTime(time: Date): TimePoint | null {
    return this.timePointManager.findByTime(time);
  }

  /**
   * Find timepoint by description
   */
  findByDescription(query: string): TimePoint | null {
    return this.timePointManager.findByDescription(query);
  }

  /**
   * Search conversations
   */
  searchConversations(query: string) {
    return this.conversationStore.search(query);
  }

  /**
   * Get all conversations
   */
  getConversations() {
    return this.conversationStore.getAll();
  }

  /**
   * Get conversations up to a time
   */
  getConversationsUntil(time: Date) {
    return this.conversationStore.getUntil(time);
  }

  /**
   * Start new conversation session
   */
  newSession(): string {
    return this.conversationStore.newSession();
  }

  /**
   * Get storage stats
   */
  getStats() {
    return {
      timePoints: this.timePointManager.count(),
      conversations: this.conversationStore.count(),
      storageSize: this.contentStore.getSize(),
    };
  }

  /**
   * Get file content from a timepoint
   */
  getFileContent(timePointId: string, filePath: string): string | null {
    const tp = this.timePointManager.load(timePointId);
    if (!tp) return null;

    const file = tp.files.find(f => f.path === filePath);
    if (!file) return null;

    return this.contentStore.getString(file.hash);
  }

  /**
   * Get diff between two timepoints (or timepoint and current)
   */
  getDiff(fromId: string, toId?: string): { added: string[]; modified: string[]; deleted: string[] } {
    const fromTp = this.timePointManager.load(fromId);
    if (!fromTp) throw new Error(`TimePoint not found: ${fromId}`);

    let toFiles: Map<string, string>;

    if (toId) {
      const toTp = this.timePointManager.load(toId);
      if (!toTp) throw new Error(`TimePoint not found: ${toId}`);
      toFiles = new Map(toTp.files.map(f => [f.path, f.hash]));
    } else {
      // Compare to current state
      toFiles = new Map();
      for (const filePath of this.fileScanner.scan()) {
        const relativePath = path.relative(this.projectPath, filePath);
        const content = this.fileScanner.readFile(filePath);
        if (content) {
          toFiles.set(relativePath, this.contentStore.put(content));
        }
      }
    }

    const fromFiles = new Map(fromTp.files.map(f => [f.path, f.hash]));
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    // Check for added and modified
    for (const [path, hash] of toFiles) {
      const fromHash = fromFiles.get(path);
      if (!fromHash) {
        added.push(path);
      } else if (fromHash !== hash) {
        modified.push(path);
      }
    }

    // Check for deleted
    for (const [path] of fromFiles) {
      if (!toFiles.has(path)) {
        deleted.push(path);
      }
    }

    return { added, modified, deleted };
  }

  /**
   * Get store path for GC
   */
  getStorePath(): string {
    return path.join(this.basePath, 'store');
  }

  /**
   * Get pack path for GC
   */
  getPackPath(): string {
    return this.contentStore.getPackPath();
  }

  /**
   * Reload packs after GC
   */
  reloadPacks(): void {
    this.contentStore.reloadPacks();
  }

  /**
   * Delete timepoint
   */
  deleteTimePoint(id: string): void {
    this.timePointManager.delete(id);
  }

  /**
   * Get project path
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * Hash content for comparison
   */
  hashContent(content: Buffer | string): string {
    return this.contentStore.hashContent(content);
  }

  // ============================================================================
  // TIME MACHINE EXPERIENCE METHODS (macOS Time Machine-like)
  // ============================================================================

  /**
   * Quick undo the last N actions (like pressing "Restore" in Mac Time Machine)
   */
  undoLast(steps: number = 1): {
    success: boolean;
    stepsUndone: number;
    from: TimePointSummary;
    to: TimePointSummary;
    result: { filesRestored: number; filesDeleted: number; messagesRemoved: number };
  } {
    const allTps = this.listTimePoints();
    
    if (allTps.length < steps + 1) {
      throw new Error(`Not enough history to undo ${steps} steps. Only ${allTps.length - 1} checkpoints available.`);
    }

    const currentTp = allTps[allTps.length - 1];
    const targetTp = allTps[allTps.length - 1 - steps];

    // Create backup before undo
    this.capture('Before undo', { type: 'restore' });

    // Restore to target
    const result = this.restore(targetTp.id);

    return {
      success: true,
      stepsUndone: steps,
      from: currentTp,
      to: targetTp,
      result
    };
  }

  /**
   * Find checkpoint before a specific action/description
   */
  findBeforeAction(query: string): { 
    found: boolean; 
    action?: TimePointSummary; 
    stateBefore?: TimePointSummary;
  } {
    const queryLower = query.toLowerCase();
    const allTps = this.listTimePoints();

    for (let i = allTps.length - 1; i >= 1; i--) {
      if (allTps[i].description.toLowerCase().includes(queryLower)) {
        return {
          found: true,
          action: allTps[i],
          stateBefore: allTps[i - 1]
        };
      }
    }

    return { found: false };
  }

  /**
   * Smart error detection - find when things went wrong
   */
  findErrorPoint(options: {
    errorPattern?: string;
    lookbackMinutes?: number;
  } = {}): {
    found: boolean;
    errorInfo?: string;
    suggestedRestorePoint?: TimePointSummary;
  } {
    const { errorPattern, lookbackMinutes = 60 } = options;
    const allTps = this.listTimePoints();
    
    const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000);
    const recentTps = allTps.filter(tp => new Date(tp.timestamp) >= cutoff);

    if (recentTps.length < 2) {
      return { found: false };
    }

    const errorIndicators = ['error', 'fail', 'broke', 'fix', 'revert', 'undo', 'rollback', 'broken', 'bug'];
    const goodIndicators = ['green', 'pass', 'success', 'working', 'stable', 'done', 'complete'];

    let lastGoodIndex = -1;
    let errorInfo = '';

    for (let i = 0; i < recentTps.length; i++) {
      const tp = recentTps[i];
      const desc = tp.description.toLowerCase();

      // Check pattern match
      if (errorPattern && desc.includes(errorPattern.toLowerCase())) {
        lastGoodIndex = i + 1;
        errorInfo = `Found pattern "${errorPattern}" in: ${tp.description}`;
        break;
      }

      // Check error indicators
      if (errorIndicators.some(ind => desc.includes(ind))) {
        lastGoodIndex = i + 1;
        errorInfo = `Found error indicator in: ${tp.description}`;
        break;
      }

      // Track last good state
      if (goodIndicators.some(ind => desc.includes(ind))) {
        lastGoodIndex = i;
        errorInfo = `Last known good state: ${tp.description}`;
      }
    }

    if (lastGoodIndex === -1 || lastGoodIndex >= recentTps.length) {
      return { found: false };
    }

    return {
      found: true,
      errorInfo,
      suggestedRestorePoint: recentTps[lastGoodIndex]
    };
  }

  /**
   * Get change summary between two timepoints
   */
  getChangeSummary(fromId: string, toId?: string): {
    from: TimePointSummary;
    to: string;
    added: number;
    modified: number;
    deleted: number;
    topChangedFiles: string[];
  } {
    const fromTp = this.listTimePoints().find(t => t.id === fromId || t.id.startsWith(fromId));
    if (!fromTp) throw new Error(`TimePoint not found: ${fromId}`);

    const diff = this.getDiff(fromTp.id, toId);

    return {
      from: fromTp,
      to: toId || 'current',
      added: diff.added.length,
      modified: diff.modified.length,
      deleted: diff.deleted.length,
      topChangedFiles: [...diff.modified, ...diff.added, ...diff.deleted].slice(0, 10)
    };
  }
}
