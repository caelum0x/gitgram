import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { ConversationLogger } from './conversation-logger.js';

/**
 * Real-time file watcher - captures changes outside checkpoints
 */
export class FileChangeWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private fileCache = new Map<string, string>();

  constructor(
    private projectPath: string,
    private logger: ConversationLogger,
    private ignorePatterns: string[]
  ) {}

  /**
   * Start watching for file changes
   */
  start(): void {
    this.watcher = chokidar.watch(this.projectPath, {
      ignored: [
        ...this.ignorePatterns,
        '**/node_modules/**',
        '**/.git/**',
        '**/.aitimemachine/**',
      ],
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on('add', (filePath: string) => this.onFileCreated(filePath))
      .on('change', (filePath: string) => this.onFileModified(filePath))
      .on('unlink', (filePath: string) => this.onFileDeleted(filePath));
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private onFileCreated(filePath: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(this.projectPath, filePath);
    
    this.fileCache.set(relativePath, content);
    this.logger.logCodeChange(relativePath, null, content);
  }

  private onFileModified(filePath: string): void {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(this.projectPath, filePath);
    const oldContent = this.fileCache.get(relativePath) || null;
    
    this.fileCache.set(relativePath, content);
    this.logger.logCodeChange(relativePath, oldContent, content);
  }

  private onFileDeleted(filePath: string): void {
    const relativePath = path.relative(this.projectPath, filePath);
    const oldContent = this.fileCache.get(relativePath) || null;
    
    this.fileCache.delete(relativePath);
    this.logger.logCodeChange(relativePath, oldContent, null);
  }
}
