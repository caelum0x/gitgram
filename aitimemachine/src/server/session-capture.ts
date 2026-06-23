import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Session, SessionFile, SessionDiff, SessionMessage, DiffHunk } from './session-server.js';
import { GitCollector, EnvironmentCollector } from '../collectors/index.js';
import { assertConsent } from '../auth/consent-policy.js';

const PENDING_SESSION_FILE = '.aitm_pending_session.json';

/**
 * Session Capture - Creates complete session snapshots
 * Supports lossless capture across shutdown/restart
 */
export class SessionCapture {
  private projectPath: string;
  private gitCollector: GitCollector;
  private envCollector: EnvironmentCollector;
  private pendingSessionPath: string;
  private excludePatterns = [
    'node_modules', '.git', '.aitimemachine', 'dist', 'build', 
    '.next', 'coverage', '*.log', '.DS_Store', '__pycache__'
  ];
  private maxFileSize = 10 * 1024 * 1024; // 10MB
  private pendingBlobs: Map<string, Buffer> = new Map();
  private isDirty: boolean = false;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
    this.gitCollector = new GitCollector(projectPath);
    this.envCollector = new EnvironmentCollector(projectPath);
    this.pendingSessionPath = path.join(this.projectPath, '.tm_internal', PENDING_SESSION_FILE);
    
    // Load any pending session from crash recovery
    this.loadPendingSession();
  }

  /**
   * Load pending session from disk (crash recovery)
   */
  private loadPendingSession(): void {
    try {
      if (fs.existsSync(this.pendingSessionPath)) {
        const data = JSON.parse(fs.readFileSync(this.pendingSessionPath, 'utf-8'));
        if (data.blobs) {
          for (const [hash, base64] of Object.entries(data.blobs)) {
            this.pendingBlobs.set(hash, Buffer.from(base64 as string, 'base64'));
          }
        }
        this.isDirty = true;
        console.log(`[SessionCapture] Recovered ${this.pendingBlobs.size} pending blobs`);
      }
    } catch (err) {
      console.warn(`[SessionCapture] Failed to load pending session: ${(err as Error).message}`);
    }
  }

  /**
   * Save pending session to disk for crash recovery
   */
  private savePendingSession(): void {
    if (!this.isDirty || this.pendingBlobs.size === 0) return;

    try {
      const dir = path.dirname(this.pendingSessionPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const blobsObj: Record<string, string> = {};
      for (const [hash, buffer] of this.pendingBlobs) {
        blobsObj[hash] = buffer.toString('base64');
      }
      
      fs.writeFileSync(this.pendingSessionPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        blobs: blobsObj,
      }));
    } catch (err) {
      console.warn(`[SessionCapture] Failed to save pending session: ${(err as Error).message}`);
    }
  }

  /**
   * Clear pending session after successful capture
   */
  private clearPendingSession(): void {
    this.pendingBlobs.clear();
    this.isDirty = false;
    try {
      if (fs.existsSync(this.pendingSessionPath)) {
        fs.unlinkSync(this.pendingSessionPath);
      }
    } catch {}
  }

  /**
   * Flush pending data to disk on shutdown
   */
  flush(): { blobsFlushed: number; sessionSaved: boolean } {
    const blobsFlushed = this.pendingBlobs.size;
    
    if (this.isDirty) {
      this.savePendingSession();
    }
    
    return { blobsFlushed, sessionSaved: this.isDirty };
  }

  /**
   * Register shutdown handlers to ensure data is flushed
   */
  registerShutdownHandlers(): void {
    const flushOnExit = () => {
      console.log('[SessionCapture] Flushing pending data before exit...');
      this.flush();
    };

    process.on('SIGTERM', flushOnExit);
    process.on('SIGINT', flushOnExit);
    process.on('beforeExit', flushOnExit);
  }

  /**
   * Capture complete project state as a session
   */
  capture(
    description: string,
    trigger: Session['trigger'],
    previousSession?: Session,
    conversation: SessionMessage[] = []
  ): { session: Session; blobs: Map<string, Buffer> } {
    assertConsent(this.projectPath, 'capture', {
      source: 'server.session-capture.capture',
      resource: this.projectPath,
    });

    const blobs = new Map<string, Buffer>();
    const files: SessionFile[] = [];
    const diffs: SessionDiff[] = [];
    
    const previousFiles = new Map<string, SessionFile>();
    if (previousSession) {
      for (const f of previousSession.files) {
        previousFiles.set(f.path, f);
      }
    }

    // Scan all files
    const scannedPaths = new Set<string>();
    this.scanDirectory(this.projectPath, (filePath, stats) => {
      const relativePath = path.relative(this.projectPath, filePath);
      scannedPaths.add(relativePath);
      
      const content = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 32);
      const isText = this.isTextFile(content);
      
      const file: SessionFile = {
        path: relativePath,
        hash,
        size: stats.size,
        mode: stats.mode,
        mtime: stats.mtimeMs,
        type: isText ? 'text' : 'binary',
      };
      files.push(file);
      
      // Store blob
      blobs.set(hash, content);
      this.pendingBlobs.set(hash, content);
      this.isDirty = true;
      
      // Calculate diff
      const prev = previousFiles.get(relativePath);
      if (!prev) {
        diffs.push({ path: relativePath, type: 'added', newHash: hash });
      } else if (prev.hash !== hash) {
        const diff: SessionDiff = {
          path: relativePath,
          type: 'modified',
          oldHash: prev.hash,
          newHash: hash,
        };
        
        // Generate line-by-line diff for text files
        if (isText && previousSession) {
          const oldContent = blobs.get(prev.hash)?.toString('utf-8');
          const newContent = content.toString('utf-8');
          if (oldContent) {
            diff.hunks = this.generateDiffHunks(oldContent, newContent);
          }
        }
        
        diffs.push(diff);
      }
      previousFiles.delete(relativePath);
    });

    // Deleted files
    for (const [relativePath, prev] of previousFiles) {
      diffs.push({
        path: relativePath,
        type: 'deleted',
        oldHash: prev.hash,
      });
    }

    // Capture git state
    const gitState = this.gitCollector.capture();

    // Capture environment state
    const envState = this.envCollector.capture();

    const session: Session = {
      id: `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      projectPath: this.projectPath,
      projectName: path.basename(this.projectPath),
      createdAt: new Date(),
      updatedAt: new Date(),
      trigger: { ...trigger, description },
      files,
      diffs,
      conversation,
      stats: {
        totalFiles: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        addedFiles: diffs.filter(d => d.type === 'added').length,
        modifiedFiles: diffs.filter(d => d.type === 'modified').length,
        deletedFiles: diffs.filter(d => d.type === 'deleted').length,
        messageCount: conversation.length,
      },
      git: gitState.isRepo ? {
        branch: gitState.branch,
        commit: gitState.commit,
        commitMessage: gitState.commitMessage,
        uncommittedChanges: gitState.uncommittedChanges,
        stagedChanges: gitState.stagedChanges,
        untrackedFiles: gitState.untrackedFiles,
      } : undefined,
      environment: {
        runtimes: envState.runtimes as Record<string, string>,
        packageManager: envState.packageManager,
        dependencies: envState.dependencies,
      },
    };

    // Clear pending after successful capture
    this.clearPendingSession();

    return { session, blobs };
  }

  /**
   * Scan directory recursively
   */
  private scanDirectory(dir: string, callback: (filePath: string, stats: fs.Stats) => void): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip excluded
      if (this.shouldExclude(entry.name)) continue;
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        this.scanDirectory(fullPath, callback);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          if (stats.size <= this.maxFileSize) {
            callback(fullPath, stats);
          }
        } catch {}
      }
    }
  }

  private shouldExclude(name: string): boolean {
    for (const pattern of this.excludePatterns) {
      if (pattern.startsWith('*')) {
        if (name.endsWith(pattern.slice(1))) return true;
      } else if (name === pattern) {
        return true;
      }
    }
    return false;
  }

  private isTextFile(content: Buffer): boolean {
    // Check for null bytes (binary indicator)
    for (let i = 0; i < Math.min(8000, content.length); i++) {
      if (content[i] === 0) return false;
    }
    return true;
  }

  /**
   * Generate diff hunks between two text contents
   */
  private generateDiffHunks(oldContent: string, newContent: string): DiffHunk[] {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const hunks: DiffHunk[] = [];
    
    // Simple diff algorithm - find changed regions
    let i = 0, j = 0;
    
    while (i < oldLines.length || j < newLines.length) {
      // Skip matching lines
      while (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        i++; j++;
      }
      
      if (i >= oldLines.length && j >= newLines.length) break;
      
      // Found a difference - collect the hunk
      const hunkOldStart = i + 1;
      const hunkNewStart = j + 1;
      const lines: string[] = [];
      
      // Collect removed lines
      const removedStart = i;
      while (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
        // Check if this line appears later in new
        const foundLater = newLines.slice(j).indexOf(oldLines[i]);
        if (foundLater !== -1 && foundLater < 5) break;
        lines.push(`-${oldLines[i]}`);
        i++;
      }
      
      // Collect added lines
      while (j < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[j])) {
        const foundLater = oldLines.slice(i).indexOf(newLines[j]);
        if (foundLater !== -1 && foundLater < 5) break;
        lines.push(`+${newLines[j]}`);
        j++;
      }
      
      if (lines.length > 0) {
        hunks.push({
          oldStart: hunkOldStart,
          oldLines: i - removedStart,
          newStart: hunkNewStart,
          newLines: lines.filter(l => l.startsWith('+')).length,
          lines,
        });
      }
    }
    
    return hunks;
  }
}
