/**
 * Advanced Diff Engine - Git-quality diff algorithms
 * Ported from Git's xdiff library (xdiffi.c, xpatience.c, xhistogram.c)
 */

export type DiffAlgorithm = 'myers' | 'patience' | 'histogram';

export interface DiffOptions {
  algorithm?: DiffAlgorithm;
  context?: number;
  ignoreWhitespace?: boolean;
  colorMoved?: boolean;
}

export interface Edit {
  type: 'insert' | 'delete' | 'equal';
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Array<{ type: 'add' | 'remove' | 'context'; content: string; moved?: boolean }>;
}

export interface DiffResult {
  algorithm: DiffAlgorithm;
  added: number;
  removed: number;
  hunks: DiffHunk[];
}

export class AdvancedDiffEngine {
  /**
   * Compute diff using specified algorithm
   */
  diff(oldContent: string, newContent: string, options: DiffOptions = {}): DiffResult {
    const algorithm = options.algorithm || 'histogram';
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    let edits: Edit[];
    switch (algorithm) {
      case 'myers':
        edits = this.myersDiff(oldLines, newLines);
        break;
      case 'patience':
        edits = this.patienceDiff(oldLines, newLines);
        break;
      case 'histogram':
        edits = this.histogramDiff(oldLines, newLines);
        break;
    }

    const hunks = this.editsToHunks(edits, oldLines, newLines, options.context ?? 3);
    
    if (options.colorMoved) {
      this.detectMovedLines(hunks);
    }

    return {
      algorithm,
      added: hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'add').length, 0),
      removed: hunks.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'remove').length, 0),
      hunks
    };
  }

  /**
   * Myers O(ND) diff algorithm - ported from xdiff/xdiffi.c
   */
  private myersDiff(oldLines: string[], newLines: string[]): Edit[] {
    const N = oldLines.length;
    const M = newLines.length;
    const MAX = N + M;
    
    if (MAX === 0) return [];

    const V = new Int32Array(2 * MAX + 1);
    const offset = MAX;
    V[offset + 1] = 0;

    const trace: Int32Array[] = [];

    for (let D = 0; D <= MAX; D++) {
      trace.push(V.slice());

      for (let k = -D; k <= D; k += 2) {
        let x: number;
        if (k === -D || (k !== D && V[offset + k - 1] < V[offset + k + 1])) {
          x = V[offset + k + 1]; // Move down
        } else {
          x = V[offset + k - 1] + 1; // Move right
        }

        let y = x - k;

        // Extend diagonal (snake)
        while (x < N && y < M && oldLines[x] === newLines[y]) {
          x++;
          y++;
        }

        V[offset + k] = x;

        if (x >= N && y >= M) {
          return this.backtrack(trace, N, M, offset, oldLines, newLines);
        }
      }
    }

    return [];
  }

  private backtrack(
    trace: Int32Array[],
    N: number,
    M: number,
    offset: number,
    oldLines: string[],
    newLines: string[]
  ): Edit[] {
    const edits: Edit[] = [];
    let x = N, y = M;

    for (let D = trace.length - 1; D >= 0; D--) {
      const V = trace[D];
      const k = x - y;

      let prevK: number;
      if (k === -D || (k !== D && V[offset + k - 1] < V[offset + k + 1])) {
        prevK = k + 1;
      } else {
        prevK = k - 1;
      }

      const prevX = V[offset + prevK];
      const prevY = prevX - prevK;

      // Add equal edits for diagonal
      while (x > prevX && y > prevY) {
        x--;
        y--;
        edits.unshift({ type: 'equal', oldStart: x, oldEnd: x + 1, newStart: y, newEnd: y + 1 });
      }

      if (D > 0) {
        if (x === prevX) {
          // Insert
          y--;
          edits.unshift({ type: 'insert', oldStart: x, oldEnd: x, newStart: y, newEnd: y + 1 });
        } else {
          // Delete
          x--;
          edits.unshift({ type: 'delete', oldStart: x, oldEnd: x + 1, newStart: y, newEnd: y });
        }
      }
    }

    return this.mergeEdits(edits);
  }

  /**
   * Patience diff - ported from xdiff/xpatience.c
   * Better for code with unique anchor lines
   */
  private patienceDiff(oldLines: string[], newLines: string[]): Edit[] {
    // Find unique lines in both files
    const uniqueOld = this.findUniqueLines(oldLines);
    const uniqueNew = this.findUniqueLines(newLines);

    // Find common unique lines
    const commonUnique: Array<{ oldIdx: number; newIdx: number; line: string }> = [];
    for (const [line, oldIdx] of uniqueOld) {
      if (uniqueNew.has(line)) {
        commonUnique.push({ oldIdx, newIdx: uniqueNew.get(line)!, line });
      }
    }

    // Sort by old index
    commonUnique.sort((a, b) => a.oldIdx - b.oldIdx);

    // Find longest increasing subsequence by new index (anchors)
    const anchors = this.longestIncreasingSubsequence(commonUnique.map(c => c.newIdx))
      .map(i => commonUnique[i]);

    if (anchors.length === 0) {
      // No anchors, fall back to Myers
      return this.myersDiff(oldLines, newLines);
    }

    // Recursively diff between anchors
    const edits: Edit[] = [];
    let oldStart = 0, newStart = 0;

    for (const anchor of anchors) {
      // Diff before anchor
      if (oldStart < anchor.oldIdx || newStart < anchor.newIdx) {
        const subEdits = this.myersDiff(
          oldLines.slice(oldStart, anchor.oldIdx),
          newLines.slice(newStart, anchor.newIdx)
        );
        edits.push(...this.offsetEdits(subEdits, oldStart, newStart));
      }

      // Add anchor as equal
      edits.push({
        type: 'equal',
        oldStart: anchor.oldIdx,
        oldEnd: anchor.oldIdx + 1,
        newStart: anchor.newIdx,
        newEnd: anchor.newIdx + 1
      });

      oldStart = anchor.oldIdx + 1;
      newStart = anchor.newIdx + 1;
    }

    // Diff after last anchor
    if (oldStart < oldLines.length || newStart < newLines.length) {
      const subEdits = this.myersDiff(
        oldLines.slice(oldStart),
        newLines.slice(newStart)
      );
      edits.push(...this.offsetEdits(subEdits, oldStart, newStart));
    }

    return this.mergeEdits(edits);
  }

  /**
   * Histogram diff - ported from xdiff/xhistogram.c
   * Fast for large files with low-occurrence matches
   */
  private histogramDiff(oldLines: string[], newLines: string[]): Edit[] {
    // Build histogram of line occurrences
    const histogram = new Map<string, { oldIndices: number[]; newIndices: number[] }>();

    for (let i = 0; i < oldLines.length; i++) {
      const line = oldLines[i];
      if (!histogram.has(line)) {
        histogram.set(line, { oldIndices: [], newIndices: [] });
      }
      histogram.get(line)!.oldIndices.push(i);
    }

    for (let i = 0; i < newLines.length; i++) {
      const line = newLines[i];
      if (!histogram.has(line)) {
        histogram.set(line, { oldIndices: [], newIndices: [] });
      }
      histogram.get(line)!.newIndices.push(i);
    }

    // Find lowest occurrence common lines as anchors
    const candidates: Array<{ line: string; oldIdx: number; newIdx: number; count: number }> = [];
    
    histogram.forEach((data, line) => {
      if (data.oldIndices.length > 0 && data.newIndices.length > 0) {
        const count = data.oldIndices.length + data.newIndices.length;
        // Only consider low-occurrence lines as anchors
        if (count <= 4) {
          for (const oldIdx of data.oldIndices) {
            for (const newIdx of data.newIndices) {
              candidates.push({ line, oldIdx, newIdx, count });
            }
          }
        }
      }
    });

    // Sort by count (prefer unique), then by position
    candidates.sort((a, b) => a.count - b.count || a.oldIdx - b.oldIdx);

    // Greedily select non-overlapping anchors
    const anchors: Array<{ oldIdx: number; newIdx: number }> = [];
    const usedOld = new Set<number>();
    const usedNew = new Set<number>();

    for (const c of candidates) {
      if (!usedOld.has(c.oldIdx) && !usedNew.has(c.newIdx)) {
        anchors.push({ oldIdx: c.oldIdx, newIdx: c.newIdx });
        usedOld.add(c.oldIdx);
        usedNew.add(c.newIdx);
      }
    }

    // Sort anchors by old index
    anchors.sort((a, b) => a.oldIdx - b.oldIdx);

    // Filter to keep only increasing new indices
    const validAnchors: typeof anchors = [];
    let lastNewIdx = -1;
    for (const a of anchors) {
      if (a.newIdx > lastNewIdx) {
        validAnchors.push(a);
        lastNewIdx = a.newIdx;
      }
    }

    if (validAnchors.length === 0) {
      return this.myersDiff(oldLines, newLines);
    }

    // Recursively diff between anchors
    const edits: Edit[] = [];
    let oldStart = 0, newStart = 0;

    for (const anchor of validAnchors) {
      if (oldStart < anchor.oldIdx || newStart < anchor.newIdx) {
        const subEdits = this.histogramDiffRecursive(
          oldLines.slice(oldStart, anchor.oldIdx),
          newLines.slice(newStart, anchor.newIdx),
          0
        );
        edits.push(...this.offsetEdits(subEdits, oldStart, newStart));
      }

      edits.push({
        type: 'equal',
        oldStart: anchor.oldIdx,
        oldEnd: anchor.oldIdx + 1,
        newStart: anchor.newIdx,
        newEnd: anchor.newIdx + 1
      });

      oldStart = anchor.oldIdx + 1;
      newStart = anchor.newIdx + 1;
    }

    if (oldStart < oldLines.length || newStart < newLines.length) {
      const subEdits = this.histogramDiffRecursive(
        oldLines.slice(oldStart),
        newLines.slice(newStart),
        0
      );
      edits.push(...this.offsetEdits(subEdits, oldStart, newStart));
    }

    return this.mergeEdits(edits);
  }

  private histogramDiffRecursive(oldLines: string[], newLines: string[], depth: number): Edit[] {
    if (depth > 10 || oldLines.length < 5 || newLines.length < 5) {
      return this.myersDiff(oldLines, newLines);
    }
    return this.histogramDiff(oldLines, newLines);
  }

  // Helper methods
  private findUniqueLines(lines: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    const indices = new Map<string, number>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      counts.set(line, (counts.get(line) || 0) + 1);
      indices.set(line, i);
    }

    const unique = new Map<string, number>();
    counts.forEach((count, line) => {
      if (count === 1) {
        unique.set(line, indices.get(line)!);
      }
    });
    return unique;
  }

  private longestIncreasingSubsequence(arr: number[]): number[] {
    if (arr.length === 0) return [];

    const n = arr.length;
    const dp = new Array(n).fill(1);
    const prev = new Array(n).fill(-1);

    let maxLen = 1, maxIdx = 0;

    for (let i = 1; i < n; i++) {
      for (let j = 0; j < i; j++) {
        if (arr[j] < arr[i] && dp[j] + 1 > dp[i]) {
          dp[i] = dp[j] + 1;
          prev[i] = j;
        }
      }
      if (dp[i] > maxLen) {
        maxLen = dp[i];
        maxIdx = i;
      }
    }

    const result: number[] = [];
    let idx = maxIdx;
    while (idx !== -1) {
      result.unshift(idx);
      idx = prev[idx];
    }
    return result;
  }

  private offsetEdits(edits: Edit[], oldOffset: number, newOffset: number): Edit[] {
    return edits.map(e => ({
      ...e,
      oldStart: e.oldStart + oldOffset,
      oldEnd: e.oldEnd + oldOffset,
      newStart: e.newStart + newOffset,
      newEnd: e.newEnd + newOffset
    }));
  }

  private mergeEdits(edits: Edit[]): Edit[] {
    if (edits.length === 0) return [];

    const merged: Edit[] = [edits[0]];
    for (let i = 1; i < edits.length; i++) {
      const last = merged[merged.length - 1];
      const curr = edits[i];

      if (last.type === curr.type && last.oldEnd === curr.oldStart && last.newEnd === curr.newStart) {
        last.oldEnd = curr.oldEnd;
        last.newEnd = curr.newEnd;
      } else {
        merged.push(curr);
      }
    }
    return merged;
  }

  private editsToHunks(edits: Edit[], oldLines: string[], newLines: string[], context: number): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    for (const edit of edits) {
      if (edit.type === 'equal') continue;

      const hunkStart = Math.max(0, edit.oldStart - context);
      const hunkEnd = Math.min(oldLines.length, edit.oldEnd + context);

      if (currentHunk && hunkStart <= currentHunk.oldStart + currentHunk.oldLines + context) {
        // Extend current hunk
        this.extendHunk(currentHunk, edit, oldLines, newLines, context);
      } else {
        // Start new hunk
        if (currentHunk) hunks.push(currentHunk);
        currentHunk = this.createHunk(edit, oldLines, newLines, context);
      }
    }

    if (currentHunk) hunks.push(currentHunk);
    return hunks;
  }

  private createHunk(edit: Edit, oldLines: string[], newLines: string[], context: number): DiffHunk {
    const oldStart = Math.max(0, edit.oldStart - context);
    const newStart = Math.max(0, edit.newStart - context);

    const lines: DiffHunk['lines'] = [];

    // Context before
    for (let i = oldStart; i < edit.oldStart; i++) {
      lines.push({ type: 'context', content: oldLines[i] });
    }

    // Changes
    if (edit.type === 'delete') {
      for (let i = edit.oldStart; i < edit.oldEnd; i++) {
        lines.push({ type: 'remove', content: oldLines[i] });
      }
    } else if (edit.type === 'insert') {
      for (let i = edit.newStart; i < edit.newEnd; i++) {
        lines.push({ type: 'add', content: newLines[i] });
      }
    }

    // Context after
    const contextEnd = Math.min(oldLines.length, edit.oldEnd + context);
    for (let i = edit.oldEnd; i < contextEnd; i++) {
      lines.push({ type: 'context', content: oldLines[i] });
    }

    return {
      oldStart: oldStart + 1,
      oldLines: lines.filter(l => l.type !== 'add').length,
      newStart: newStart + 1,
      newLines: lines.filter(l => l.type !== 'remove').length,
      lines
    };
  }

  private extendHunk(hunk: DiffHunk, edit: Edit, oldLines: string[], newLines: string[], context: number): void {
    // Add context between previous content and new edit
    const lastLine = hunk.lines[hunk.lines.length - 1];
    const lastOldIdx = hunk.oldStart - 1 + hunk.lines.filter(l => l.type !== 'add').length;

    for (let i = lastOldIdx; i < edit.oldStart; i++) {
      hunk.lines.push({ type: 'context', content: oldLines[i] });
    }

    // Add changes
    if (edit.type === 'delete') {
      for (let i = edit.oldStart; i < edit.oldEnd; i++) {
        hunk.lines.push({ type: 'remove', content: oldLines[i] });
      }
    } else if (edit.type === 'insert') {
      for (let i = edit.newStart; i < edit.newEnd; i++) {
        hunk.lines.push({ type: 'add', content: newLines[i] });
      }
    }

    // Update counts
    hunk.oldLines = hunk.lines.filter(l => l.type !== 'add').length;
    hunk.newLines = hunk.lines.filter(l => l.type !== 'remove').length;
  }

  /**
   * Detect moved lines (Git's --color-moved feature)
   */
  private detectMovedLines(hunks: DiffHunk[]): void {
    const removed = new Map<string, DiffHunk['lines'][0][]>();
    const added = new Map<string, DiffHunk['lines'][0][]>();

    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        const trimmed = line.content.trim();
        if (trimmed.length < 3) continue;

        if (line.type === 'remove') {
          if (!removed.has(trimmed)) removed.set(trimmed, []);
          removed.get(trimmed)!.push(line);
        } else if (line.type === 'add') {
          if (!added.has(trimmed)) added.set(trimmed, []);
          added.get(trimmed)!.push(line);
        }
      }
    }

    // Mark lines that appear in both removed and added
    removed.forEach((removedLines, content) => {
      const addedLines = added.get(content);
      if (addedLines) {
        for (const line of removedLines) line.moved = true;
        for (const line of addedLines) line.moved = true;
      }
    });
  }

  /**
   * Format diff as unified diff string
   */
  formatUnified(result: DiffResult, oldPath: string, newPath: string): string {
    let output = `--- ${oldPath}\n+++ ${newPath}\n`;

    for (const hunk of result.hunks) {
      output += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
      for (const line of hunk.lines) {
        const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        output += `${prefix}${line.content}\n`;
      }
    }

    return output;
  }

  /**
   * Format diff statistics
   */
  formatDiffstat(result: DiffResult): string {
    return `${result.added} insertions(+), ${result.removed} deletions(-)`;
  }
}
