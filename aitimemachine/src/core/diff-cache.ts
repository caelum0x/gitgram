import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DiffResult } from './diff-engine.js';

export class DiffCache {
  private memCache = new Map<string, DiffResult>();
  private cacheDir: string;
  private maxMemoryEntries = 100;

  constructor(basePath: string) {
    this.cacheDir = path.join(basePath, 'diff-cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getKey(fromId: string, toId: string, filePath?: string): string {
    const input = `${fromId}:${toId}:${filePath || ''}`;
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
  }

  get(fromId: string, toId: string, filePath?: string): DiffResult | null {
    const key = this.getKey(fromId, toId, filePath);
    
    if (this.memCache.has(key)) return this.memCache.get(key)!;
    
    const diskPath = path.join(this.cacheDir, `${key}.json`);
    if (fs.existsSync(diskPath)) {
      const data = JSON.parse(fs.readFileSync(diskPath, 'utf-8'));
      this.memCache.set(key, data);
      return data;
    }
    return null;
  }

  set(fromId: string, toId: string, diff: DiffResult, filePath?: string): void {
    const key = this.getKey(fromId, toId, filePath);
    
    this.memCache.set(key, diff);
    if (this.memCache.size > this.maxMemoryEntries) {
      const firstKey = this.memCache.keys().next().value;
      if (firstKey) this.memCache.delete(firstKey);
    }
    
    const diskPath = path.join(this.cacheDir, `${key}.json`);
    fs.writeFileSync(diskPath, JSON.stringify(diff));
  }

  clear(): void {
    this.memCache.clear();
    if (fs.existsSync(this.cacheDir)) {
      for (const file of fs.readdirSync(this.cacheDir)) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
    }
  }
}
