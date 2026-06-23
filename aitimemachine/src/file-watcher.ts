import * as fs from 'fs';
import * as path from 'path';
import { TimeMachineEngine } from './core/index.js';

/**
 * File watcher daemon - auto-captures on file changes
 */
export class FileWatcher {
  private engine: TimeMachineEngine;
  private debounceTimer: NodeJS.Timeout | null = null;
  private changedFiles: Set<string> = new Set();
  private watchers: fs.FSWatcher[] = [];
  private running = false;

  constructor(private projectPath: string) {
    this.engine = new TimeMachineEngine(projectPath);
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const config = this.engine.getConfig();
    console.log(`Watching ${this.projectPath} for changes...`);

    this.watchDirectory(this.projectPath, config.excludePatterns);
  }

  /**
   * Stop watching
   */
  stop(): void {
    this.running = false;
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    console.log('Stopped watching');
  }

  private watchDirectory(dir: string, excludePatterns: string[]): void {
    if (!fs.existsSync(dir)) return;

    // Check if directory should be excluded
    const relativePath = path.relative(this.projectPath, dir);
    for (const pattern of excludePatterns) {
      const regex = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      if (new RegExp(`^${regex}`).test(relativePath + '/')) {
        return;
      }
    }

    try {
      const watcher = fs.watch(dir, { persistent: true }, (eventType, filename) => {
        if (!filename) return;
        const fullPath = path.join(dir, filename);
        const relPath = path.relative(this.projectPath, fullPath);

        // Skip .aitimemachine
        if (relPath.startsWith('.aitimemachine')) return;

        this.onFileChange(relPath, eventType);
      });

      this.watchers.push(watcher);

      // Watch subdirectories
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          this.watchDirectory(path.join(dir, entry.name), excludePatterns);
        }
      }
    } catch (err) {
      // Permission denied, etc
    }
  }

  private onFileChange(filePath: string, eventType: string): void {
    this.changedFiles.add(filePath);

    // Debounce captures
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const config = this.engine.getConfig();
    this.debounceTimer = setTimeout(() => {
      this.captureChanges();
    }, config.captureInterval);
  }

  private captureChanges(): void {
    if (this.changedFiles.size === 0) return;

    const files = Array.from(this.changedFiles);
    this.changedFiles.clear();

    const description = files.length === 1
      ? `Changed: ${files[0]}`
      : `Changed ${files.length} files`;

    const tp = this.engine.capture(description, { type: 'auto' });
    console.log(`Auto-captured: ${tp.id.slice(0, 20)} (${files.length} files changed)`);
  }

  /**
   * Get engine for external access
   */
  getEngine(): TimeMachineEngine {
    return this.engine;
  }
}
