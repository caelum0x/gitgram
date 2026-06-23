import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface FileChange {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: Date;
}

export class FileWatcher extends EventEmitter {
  private watchers = new Map<string, fs.FSWatcher>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private ignorePatterns: RegExp[];

  constructor(
    private projectPath: string,
    private options: { debounceMs?: number; ignore?: string[] } = {}
  ) {
    super();
    this.ignorePatterns = (options.ignore || [
      'node_modules', '.git', '.aitimemachine', 'dist', 'build', '.next'
    ]).map(p => new RegExp(p.replace(/\*/g, '.*')));
  }

  start(): void {
    this.watchDir(this.projectPath);
  }

  stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private watchDir(dir: string): void {
    if (this.shouldIgnore(dir)) return;

    try {
      const watcher = fs.watch(dir, { persistent: false }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(dir, filename);
        this.handleChange(fullPath, eventType);
      });

      this.watchers.set(dir, watcher);

      // Watch subdirectories
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !this.shouldIgnore(entry.name)) {
          this.watchDir(path.join(dir, entry.name));
        }
      }
    } catch {
      // Directory may not exist or be inaccessible
    }
  }

  private shouldIgnore(filePath: string): boolean {
    const relative = path.relative(this.projectPath, filePath);
    return this.ignorePatterns.some(p => p.test(relative) || p.test(path.basename(filePath)));
  }

  private handleChange(filePath: string, eventType: string): void {
    if (this.shouldIgnore(filePath)) return;

    // Debounce rapid changes
    const debounceMs = this.options.debounceMs || 100;
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(filePath, setTimeout(() => {
      this.debounceTimers.delete(filePath);
      
      const exists = fs.existsSync(filePath);
      const isDir = exists && fs.statSync(filePath).isDirectory();

      if (isDir && exists && !this.watchers.has(filePath)) {
        this.watchDir(filePath);
      }

      const change: FileChange = {
        type: !exists ? 'unlink' : eventType === 'rename' ? 'add' : 'change',
        path: path.relative(this.projectPath, filePath),
        timestamp: new Date()
      };

      this.emit('change', change);
    }, debounceMs));
  }
}
