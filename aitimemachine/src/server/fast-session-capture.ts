import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Session, SessionFile, SessionDiff, SessionMessage } from './session-server.js';
import { GitCollector, EnvironmentCollector } from '../collectors/index.js';
import { FastScanner } from '../utils/fast-scanner.js';
import { platform } from '../utils/platform.js';
import { assertConsent } from '../auth/consent-policy.js';

/**
 * Fast Session Capture - Optimized for large projects
 * Uses incremental scanning with mtime-based caching
 */
export class FastSessionCapture {
  private projectPath: string;
  private scanner: FastScanner;
  private gitCollector: GitCollector;
  private envCollector: EnvironmentCollector;

  constructor(projectPath: string) {
    this.projectPath = platform.resolve(projectPath);
    this.scanner = new FastScanner(this.projectPath);
    this.gitCollector = new GitCollector(this.projectPath);
    this.envCollector = new EnvironmentCollector(this.projectPath);
  }

  /**
   * Quick check if project has changes
   */
  hasChanges(): boolean {
    return this.scanner.quickScan().changed;
  }

  /**
   * Capture session (optimized)
   */
  capture(
    description: string,
    trigger: Session['trigger'],
    previousSession?: Session,
    conversation: SessionMessage[] = []
  ): { session: Session; blobs: Map<string, Buffer>; stats: { cached: number; hashed: number } } {
    assertConsent(this.projectPath, 'capture', {
      source: 'server.fast-session-capture.capture',
      resource: this.projectPath,
    });

    const blobs = new Map<string, Buffer>();
    const diffs: SessionDiff[] = [];

    // Build previous files map
    const previousFiles = new Map<string, SessionFile>();
    if (previousSession) {
      for (const f of previousSession.files) {
        previousFiles.set(f.path, f);
      }
    }

    // Fast scan with caching
    const { files: scannedFiles, stats: scanStats } = this.scanner.scan();

    // Convert to SessionFile and collect blobs
    const files: SessionFile[] = [];
    const scannedPaths = new Set<string>();

    for (const f of scannedFiles) {
      scannedPaths.add(f.path);
      const fullPath = path.join(this.projectPath, f.path);

      // Read content for blob storage
      let content: Buffer;
      try {
        content = fs.readFileSync(fullPath);
      } catch {
        continue;
      }

      const isText = this.isTextFile(content);
      const file: SessionFile = {
        path: f.path,
        hash: f.hash,
        size: f.size,
        mode: 33188, // Default file mode
        mtime: f.mtime,
        type: isText ? 'text' : 'binary',
      };
      files.push(file);
      blobs.set(f.hash, content);

      // Calculate diff
      const prev = previousFiles.get(f.path);
      if (!prev) {
        diffs.push({ path: f.path, type: 'added', newHash: f.hash });
      } else if (prev.hash !== f.hash) {
        diffs.push({ path: f.path, type: 'modified', oldHash: prev.hash, newHash: f.hash });
      }
      previousFiles.delete(f.path);
    }

    // Deleted files
    for (const [relativePath, prev] of previousFiles) {
      diffs.push({ path: relativePath, type: 'deleted', oldHash: prev.hash });
    }

    // Capture git and env state
    const gitState = this.gitCollector.capture();
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

    return { session, blobs, stats: { cached: scanStats.cached, hashed: scanStats.hashed } };
  }

  private isTextFile(content: Buffer): boolean {
    // Check for null bytes in first 8KB
    const sample = content.slice(0, 8192);
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) return false;
    }
    return true;
  }
}
