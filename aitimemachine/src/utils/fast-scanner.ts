import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { platform } from './platform.js';

interface FileInfo {
  path: string;
  hash: string;
  size: number;
  mtime: number;
}

interface ScanCache {
  version: number;
  files: Record<string, { hash: string; mtime: number; size: number }>;
}

const CACHE_VERSION = 1;

/**
 * Fast incremental file scanner
 * - Caches file hashes by mtime
 * - Parallel hashing for large projects
 * - Respects .gitignore patterns
 */
export class FastScanner {
  private projectPath: string;
  private cachePath: string;
  private cache: ScanCache;
  private excludePatterns: RegExp[];
  private maxFileSize: number;

  constructor(projectPath: string, options: { maxFileSize?: number } = {}) {
    this.projectPath = projectPath;
    this.cachePath = path.join(projectPath, '.aitimemachine', 'scan-cache.json');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
    this.cache = this.loadCache();
    this.excludePatterns = this.buildExcludePatterns();
  }

  private loadCache(): ScanCache {
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
        if (data.version === CACHE_VERSION) return data;
      }
    } catch {}
    return { version: CACHE_VERSION, files: {} };
  }

  private saveCache(): void {
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache));
    } catch {}
  }

  private buildExcludePatterns(): RegExp[] {
    const patterns = [
      /node_modules/,
      /\.git$/,
      /\.git\//,
      /dist\//,
      /build\//,
      /\.next\//,
      /\.nuxt\//,
      /\.cache\//,
      /coverage\//,
      /__pycache__\//,
      /\.venv\//,
      /venv\//,
      /target\//,
      /\.aitimemachine\//,
      /\.DS_Store$/,
      /Thumbs\.db$/,
    ];

    // Load .gitignore patterns
    const gitignorePath = path.join(this.projectPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          try {
            const pattern = trimmed
              .replace(/\./g, '\\.')
              .replace(/\*/g, '.*')
              .replace(/\?/g, '.');
            patterns.push(new RegExp(pattern));
          } catch {}
        }
      }
    }

    return patterns;
  }

  private shouldExclude(relativePath: string): boolean {
    return this.excludePatterns.some(p => p.test(relativePath));
  }

  /**
   * Scan project and return file info
   * Uses cache for unchanged files (by mtime)
   */
  scan(): { files: FileInfo[]; stats: { total: number; cached: number; hashed: number } } {
    const files: FileInfo[] = [];
    let cached = 0, hashed = 0;

    const scanDir = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = platform.relative(this.projectPath, fullPath);

        if (this.shouldExclude(relativePath)) continue;

        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          try {
            const stats = fs.statSync(fullPath);
            if (stats.size > this.maxFileSize) continue;

            const mtime = stats.mtimeMs;
            const cacheKey = relativePath;
            const cacheEntry = this.cache.files[cacheKey];

            let hash: string;
            if (cacheEntry && cacheEntry.mtime === mtime && cacheEntry.size === stats.size) {
              hash = cacheEntry.hash;
              cached++;
            } else {
              hash = this.hashFile(fullPath);
              this.cache.files[cacheKey] = { hash, mtime, size: stats.size };
              hashed++;
            }

            files.push({ path: relativePath, hash, size: stats.size, mtime });
          } catch {}
        }
      }
    };

    scanDir(this.projectPath);
    this.saveCache();

    return { files, stats: { total: files.length, cached, hashed } };
  }

  /**
   * Quick scan - only check for changes without full hash
   */
  quickScan(): { changed: boolean; changedFiles: string[] } {
    const changedFiles: string[] = [];

    const checkDir = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = platform.relative(this.projectPath, fullPath);

        if (this.shouldExclude(relativePath)) continue;

        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.isFile()) {
          try {
            const stats = fs.statSync(fullPath);
            const cacheEntry = this.cache.files[relativePath];

            if (!cacheEntry || cacheEntry.mtime !== stats.mtimeMs || cacheEntry.size !== stats.size) {
              changedFiles.push(relativePath);
            }
          } catch {}
        }
      }
    };

    checkDir(this.projectPath);
    return { changed: changedFiles.length > 0, changedFiles };
  }

  private hashFile(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 32);
  }

  /**
   * Parallel hash multiple files (for initial scan of large projects)
   */
  async parallelHash(files: string[], concurrency = 4): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const queue = [...files];

    const worker = async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (!file) break;
        try {
          const hash = this.hashFile(path.join(this.projectPath, file));
          results.set(file, hash);
        } catch {}
      }
    };

    await Promise.all(Array(concurrency).fill(0).map(() => worker()));
    return results;
  }

  /**
   * Clear cache (force full rescan)
   */
  clearCache(): void {
    this.cache = { version: CACHE_VERSION, files: {} };
    try {
      if (fs.existsSync(this.cachePath)) fs.unlinkSync(this.cachePath);
    } catch {}
  }
}
