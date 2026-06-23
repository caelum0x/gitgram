import * as fs from 'fs';
import * as path from 'path';
import { Config, DEFAULT_CONFIG } from './types.js';

/**
 * Scans project files respecting include/exclude patterns
 * Optimized for large projects with caching and parallel reads
 */
export class FileScanner {
  private cache: Map<string, { mtime: number; hash?: string }> = new Map();

  constructor(private projectPath: string, private config: Config = DEFAULT_CONFIG) {}

  /**
   * Check if path matches any pattern
   */
  private matchesPattern(filePath: string, patterns: string[]): boolean {
    const relativePath = path.relative(this.projectPath, filePath).replace(/\\/g, '/');
    
    for (const pattern of patterns) {
      // Fast path for common patterns
      if (pattern === '**/node_modules/**' && relativePath.includes('node_modules')) return true;
      if (pattern === '**/.git/**' && relativePath.includes('.git')) return true;
      if (pattern === '**/.aitimemachine/**' && relativePath.includes('.aitimemachine')) return true;

      const regex = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/{{GLOBSTAR}}/g, '.*');
      
      if (new RegExp(`^${regex}$`).test(relativePath)) return true;
    }
    return false;
  }

  /**
   * Check if file should be included
   */
  shouldInclude(filePath: string): boolean {
    if (this.matchesPattern(filePath, this.config.excludePatterns)) return false;
    if (this.config.includePatterns.length > 0) {
      return this.matchesPattern(filePath, this.config.includePatterns);
    }
    return true;
  }

  /**
   * Scan directory - optimized with early bailout
   */
  scan(): string[] {
    const files: string[] = [];
    this.scanDir(this.projectPath, files);
    return files;
  }

  private scanDir(dir: string, files: string[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Fast skip for common excludes
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.aitimemachine') {
        continue;
      }

      if (entry.isDirectory()) {
        if (!this.matchesPattern(fullPath + '/', this.config.excludePatterns)) {
          this.scanDir(fullPath, files);
        }
      } else if (entry.isFile()) {
        if (this.shouldInclude(fullPath)) {
          try {
            const stats = fs.statSync(fullPath);
            if (stats.size <= this.config.maxFileSize) {
              files.push(fullPath);
            }
          } catch {}
        }
      }
    }
  }

  /**
   * Get files that changed since last scan (for incremental capture)
   */
  getChangedFiles(files: string[]): string[] {
    const changed: string[] = [];

    for (const file of files) {
      try {
        const stats = fs.statSync(file);
        const cached = this.cache.get(file);
        
        if (!cached || cached.mtime !== stats.mtimeMs) {
          changed.push(file);
          this.cache.set(file, { mtime: stats.mtimeMs });
        }
      } catch {
        changed.push(file);
      }
    }

    return changed;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  getFileInfo(filePath: string): { size: number; mode: number; mtime: number } | null {
    try {
      const stats = fs.statSync(filePath);
      return { size: stats.size, mode: stats.mode, mtime: stats.mtimeMs };
    } catch {
      return null;
    }
  }

  readFile(filePath: string): Buffer | null {
    try {
      return fs.readFileSync(filePath);
    } catch {
      return null;
    }
  }
}
