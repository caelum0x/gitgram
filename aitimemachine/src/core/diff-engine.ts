import { diffLines, diffWords } from 'diff';
import * as crypto from 'crypto';

export interface DiffOptions {
  algorithm?: 'myers' | 'patience';
  context?: number;
  format?: 'unified' | 'side-by-side';
}

export interface DiffResult {
  added: number;
  removed: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export class DiffEngine {
  private cache = new Map<string, DiffResult>();

  diff(oldContent: string, newContent: string, options: DiffOptions = {}): DiffResult {
    const cacheKey = this.getCacheKey(oldContent, newContent, options);
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const changes = diffLines(oldContent, newContent);
    const hunks: DiffHunk[] = [];
    let added = 0;
    let removed = 0;
    let oldLineNo = 1;
    let newLineNo = 1;
    let currentHunk: DiffLine[] = [];

    for (const change of changes) {
      const lines = change.value.split('\n').filter(l => l !== '');
      
      for (const line of lines) {
        if (change.added) {
          currentHunk.push({
            type: 'add',
            content: line,
            newLineNo: newLineNo++
          });
          added++;
        } else if (change.removed) {
          currentHunk.push({
            type: 'remove',
            content: line,
            oldLineNo: oldLineNo++
          });
          removed++;
        } else {
          currentHunk.push({
            type: 'context',
            content: line,
            oldLineNo: oldLineNo++,
            newLineNo: newLineNo++
          });
        }
      }

      if (currentHunk.length > 0) {
        hunks.push({
          oldStart: oldLineNo - currentHunk.length,
          oldLines: currentHunk.filter(l => l.type !== 'add').length,
          newStart: newLineNo - currentHunk.length,
          newLines: currentHunk.filter(l => l.type !== 'remove').length,
          lines: currentHunk
        });
        currentHunk = [];
      }
    }

    const result = { added, removed, hunks };
    this.cache.set(cacheKey, result);
    return result;
  }

  formatUnified(diff: DiffResult, oldPath: string, newPath: string): string {
    let output = `--- ${oldPath}\n+++ ${newPath}\n`;

    for (const hunk of diff.hunks) {
      output += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
      
      for (const line of hunk.lines) {
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        output += `${prefix}${line.content}\n`;
      }
    }

    return output;
  }

  private getCacheKey(oldContent: string, newContent: string, options: DiffOptions): string {
    const hash = crypto.createHash('sha256');
    hash.update(oldContent);
    hash.update(newContent);
    hash.update(JSON.stringify(options));
    return hash.digest('hex');
  }
}
