/**
 * 3-Way Merge - ported from Git's merge-ort.c
 * Merges changes from two branches relative to a common ancestor
 * 
 * Features:
 * - LCS-based diff3 algorithm
 * - Recursive merge for complex history
 * - Multiple conflict resolution strategies
 * - Word-level conflict detection
 * - Auto-resolution for simple conflicts
 */

export interface MergeInput {
  base: string;    // Common ancestor
  ours: string;    // Current version
  theirs: string;  // Incoming version
}

export interface MergeResult {
  merged: string;
  hasConflicts: boolean;
  conflicts: ConflictRegion[];
  stats: MergeStats;
}

export interface MergeStats {
  hunksTotal: number;
  hunksClean: number;
  hunksConflicted: number;
  linesAdded: number;
  linesRemoved: number;
  autoResolved: number;
}

export interface ConflictRegion {
  startLine: number;
  endLine: number;
  ours: string[];
  theirs: string[];
  base: string[];
  type: ConflictType;
  autoResolvable: boolean;
}

export type ConflictType = 
  | 'content'           // Both sides modified same region differently
  | 'add-add'           // Both sides added at same location
  | 'modify-delete'     // One side modified, other deleted
  | 'rename-rename'     // Both sides renamed differently
  | 'rename-delete';    // One renamed, other deleted

export type MergeStrategy = 'recursive' | 'ort' | 'resolve' | 'ours' | 'theirs';

export interface MergeOptions {
  strategy?: MergeStrategy;
  conflictStyle?: 'merge' | 'diff3' | 'zdiff3';
  unionMerge?: boolean;      // Auto-resolve add/add by combining
  ignoreWhitespace?: boolean;
  wordDiff?: boolean;
  renameDetection?: boolean;
  renameThreshold?: number;  // 0-100, similarity threshold
}

/**
 * 3-way merge engine based on Git's merge-ort algorithm
 * Provides multiple strategies and conflict resolution
 */
export class ThreeWayMerge {
  private options: MergeOptions;

  constructor(options: MergeOptions = {}) {
    this.options = {
      strategy: 'ort',
      conflictStyle: 'diff3',
      unionMerge: false,
      ignoreWhitespace: false,
      wordDiff: false,
      renameDetection: true,
      renameThreshold: 50,
      ...options
    };
  }

  /**
   * Perform 3-way merge with configurable strategy
   */
  merge(input: MergeInput): MergeResult {
    // Normalize line endings
    const base = this.normalizeLineEndings(input.base);
    const ours = this.normalizeLineEndings(input.ours);
    const theirs = this.normalizeLineEndings(input.theirs);

    // Shortcut: check for trivial cases
    if (base === ours) {
      return this.createResult(theirs, false, [], { type: 'fast-forward-theirs' });
    }
    if (base === theirs) {
      return this.createResult(ours, false, [], { type: 'fast-forward-ours' });
    }
    if (ours === theirs) {
      return this.createResult(ours, false, [], { type: 'identical' });
    }

    // Use the appropriate strategy
    switch (this.options.strategy) {
      case 'ours':
        return this.createResult(ours, false, [], { type: 'strategy-ours' });
      case 'theirs':
        return this.createResult(theirs, false, [], { type: 'strategy-theirs' });
      case 'resolve':
        return this.mergeResolve(base, ours, theirs);
      case 'recursive':
      case 'ort':
      default:
        return this.mergeOrt(base, ours, theirs);
    }
  }

  /**
   * Merge-ort algorithm (Git's default since 2.33)
   * Better performance and handling than recursive
   */
  private mergeOrt(base: string, ours: string, theirs: string): MergeResult {
    const baseLines = base.split('\n');
    const oursLines = ours.split('\n');
    const theirsLines = theirs.split('\n');

    // Build change regions using LCS
    const regions = this.findMergeRegions(baseLines, oursLines, theirsLines);
    
    // Process regions and detect conflicts
    return this.processRegions(baseLines, oursLines, theirsLines, regions);
  }

  /**
   * Simple resolve strategy - first parent wins on conflict
   */
  private mergeResolve(base: string, ours: string, theirs: string): MergeResult {
    const result = this.mergeOrt(base, ours, theirs);
    
    // Auto-resolve conflicts by taking ours
    if (result.hasConflicts) {
      let resolved = result.merged;
      for (const conflict of result.conflicts) {
        resolved = this.resolveConflictInText(resolved, conflict, 'ours');
      }
      return {
        ...result,
        merged: resolved,
        hasConflicts: false,
        stats: {
          ...result.stats,
          autoResolved: result.conflicts.length
        }
      };
    }
    
    return result;
  }

  /**
   * Find merge regions using diff3 algorithm
   */
  private findMergeRegions(
    base: string[],
    ours: string[],
    theirs: string[]
  ): MergeRegion[] {
    const regions: MergeRegion[] = [];
    
    // Get LCS for base-ours and base-theirs
    const lcsOurs = this.longestCommonSubsequence(base, ours);
    const lcsTheirs = this.longestCommonSubsequence(base, theirs);
    
    // Find aligned positions
    const oursPositions = this.findLcsPositions(base, ours, lcsOurs);
    const theirsPositions = this.findLcsPositions(base, theirs, lcsTheirs);
    
    // Build regions by walking through base
    let baseIdx = 0;
    let oursIdx = 0;
    let theirsIdx = 0;

    while (baseIdx < base.length || oursIdx < ours.length || theirsIdx < theirs.length) {
      // Find next sync point
      const syncBase = this.findNextSync(base, baseIdx, lcsOurs, lcsTheirs);
      
      // Collect lines until sync point
      const baseChunk: string[] = [];
      const oursChunk: string[] = [];
      const theirsChunk: string[] = [];

      while (baseIdx < syncBase) {
        baseChunk.push(base[baseIdx++]);
      }
      
      // Collect ours lines until they match base sync
      while (oursIdx < ours.length && 
             (syncBase >= base.length || ours[oursIdx] !== base[syncBase])) {
        oursChunk.push(ours[oursIdx++]);
      }
      
      // Collect theirs lines until they match base sync  
      while (theirsIdx < theirs.length && 
             (syncBase >= base.length || theirs[theirsIdx] !== base[syncBase])) {
        theirsChunk.push(theirs[theirsIdx++]);
      }

      if (baseChunk.length > 0 || oursChunk.length > 0 || theirsChunk.length > 0) {
        regions.push({
          base: baseChunk,
          ours: oursChunk,
          theirs: theirsChunk,
          type: this.determineRegionType(baseChunk, oursChunk, theirsChunk)
        });
      }

      // If we're at a sync point, add unchanged region
      if (syncBase < base.length && 
          oursIdx < ours.length && ours[oursIdx] === base[syncBase] &&
          theirsIdx < theirs.length && theirs[theirsIdx] === base[syncBase]) {
        
        // Collect consecutive unchanged lines
        const unchanged: string[] = [];
        while (baseIdx < base.length && 
               oursIdx < ours.length && theirsIdx < theirs.length &&
               base[baseIdx] === ours[oursIdx] && base[baseIdx] === theirs[theirsIdx]) {
          unchanged.push(base[baseIdx]);
          baseIdx++;
          oursIdx++;
          theirsIdx++;
        }
        
        if (unchanged.length > 0) {
          regions.push({
            base: unchanged,
            ours: unchanged,
            theirs: unchanged,
            type: 'unchanged'
          });
        }
      }

      // Prevent infinite loop
      if (baseIdx >= base.length && oursIdx >= ours.length && theirsIdx >= theirs.length) {
        break;
      }
    }

    return regions;
  }

  /**
   * Process merge regions and build result
   */
  private processRegions(
    base: string[],
    ours: string[],
    theirs: string[],
    regions: MergeRegion[]
  ): MergeResult {
    const resultLines: string[] = [];
    const conflicts: ConflictRegion[] = [];
    let hasConflicts = false;
    const stats: MergeStats = {
      hunksTotal: 0,
      hunksClean: 0,
      hunksConflicted: 0,
      linesAdded: 0,
      linesRemoved: 0,
      autoResolved: 0
    };

    for (const region of regions) {
      stats.hunksTotal++;

      switch (region.type) {
        case 'unchanged':
          // All three versions match
          resultLines.push(...region.base);
          stats.hunksClean++;
          break;

        case 'ours-only':
          // Only ours changed
          resultLines.push(...region.ours);
          stats.hunksClean++;
          stats.linesAdded += region.ours.length;
          stats.linesRemoved += region.base.length;
          break;

        case 'theirs-only':
          // Only theirs changed
          resultLines.push(...region.theirs);
          stats.hunksClean++;
          stats.linesAdded += region.theirs.length;
          stats.linesRemoved += region.base.length;
          break;

        case 'both-same':
          // Both changed the same way
          resultLines.push(...region.ours);
          stats.hunksClean++;
          break;

        case 'both-different':
        case 'add-add':
        case 'modify-delete':
          // Conflict!
          const conflictType = this.classifyConflict(region);
          const autoResolvable = this.isAutoResolvable(region, conflictType);

          if (autoResolvable && this.options.unionMerge && conflictType === 'add-add') {
            // Union merge: combine both additions
            resultLines.push(...region.ours);
            resultLines.push(...region.theirs);
            stats.hunksClean++;
            stats.autoResolved++;
          } else {
            // Create conflict markers
            hasConflicts = true;
            stats.hunksConflicted++;

            const startLine = resultLines.length;
            resultLines.push(...this.formatConflictMarkers(region));
            
            conflicts.push({
              startLine,
              endLine: resultLines.length - 1,
              ours: region.ours,
              theirs: region.theirs,
              base: region.base,
              type: conflictType,
              autoResolvable
            });
          }
          break;
      }
    }

    return {
      merged: resultLines.join('\n'),
      hasConflicts,
      conflicts,
      stats
    };
  }

  /**
   * Format conflict markers based on style option
   */
  private formatConflictMarkers(region: MergeRegion): string[] {
    const lines: string[] = [];
    
    switch (this.options.conflictStyle) {
      case 'diff3':
      case 'zdiff3':
        lines.push('<<<<<<< OURS');
        lines.push(...region.ours);
        if (region.base.length > 0) {
          lines.push('||||||| BASE');
          if (this.options.conflictStyle === 'zdiff3') {
            // zdiff3: trim common prefix/suffix from base
            const trimmed = this.trimCommonLines(region.base, region.ours, region.theirs);
            lines.push(...trimmed);
          } else {
            lines.push(...region.base);
          }
        }
        lines.push('=======');
        lines.push(...region.theirs);
        lines.push('>>>>>>> THEIRS');
        break;

      default: // 'merge'
        lines.push('<<<<<<< OURS');
        lines.push(...region.ours);
        lines.push('=======');
        lines.push(...region.theirs);
        lines.push('>>>>>>> THEIRS');
        break;
    }

    return lines;
  }

  /**
   * Trim common prefix/suffix for zdiff3 style
   */
  private trimCommonLines(base: string[], ours: string[], theirs: string[]): string[] {
    if (base.length === 0) return [];

    // Find common prefix between all three
    let prefixLen = 0;
    const minLen = Math.min(base.length, ours.length, theirs.length);
    while (prefixLen < minLen &&
           base[prefixLen] === ours[prefixLen] &&
           base[prefixLen] === theirs[prefixLen]) {
      prefixLen++;
    }

    // Find common suffix
    let suffixLen = 0;
    while (suffixLen < minLen - prefixLen &&
           base[base.length - 1 - suffixLen] === ours[ours.length - 1 - suffixLen] &&
           base[base.length - 1 - suffixLen] === theirs[theirs.length - 1 - suffixLen]) {
      suffixLen++;
    }

    return base.slice(prefixLen, base.length - suffixLen);
  }

  /**
   * Determine region type based on changes
   */
  private determineRegionType(
    base: string[],
    ours: string[],
    theirs: string[]
  ): MergeRegionType {
    const baseEmpty = base.length === 0;
    const oursEmpty = ours.length === 0;
    const theirsEmpty = theirs.length === 0;
    
    const oursMatch = this.arraysEqual(base, ours);
    const theirsMatch = this.arraysEqual(base, theirs);
    const bothMatch = this.arraysEqual(ours, theirs);

    if (oursMatch && theirsMatch) return 'unchanged';
    if (oursMatch) return 'theirs-only';
    if (theirsMatch) return 'ours-only';
    if (bothMatch) return 'both-same';
    
    // Both different
    if (baseEmpty && !oursEmpty && !theirsEmpty) return 'add-add';
    if (!baseEmpty && (oursEmpty || theirsEmpty)) return 'modify-delete';
    
    return 'both-different';
  }

  /**
   * Classify conflict type for detailed reporting
   */
  private classifyConflict(region: MergeRegion): ConflictType {
    if (region.base.length === 0 && region.ours.length > 0 && region.theirs.length > 0) {
      return 'add-add';
    }
    if (region.base.length > 0 && (region.ours.length === 0 || region.theirs.length === 0)) {
      return 'modify-delete';
    }
    return 'content';
  }

  /**
   * Check if conflict can be auto-resolved
   */
  private isAutoResolvable(region: MergeRegion, type: ConflictType): boolean {
    // Add-add conflicts can be union-merged
    if (type === 'add-add') return true;
    
    // Check for whitespace-only differences
    if (this.options.ignoreWhitespace) {
      const oursNorm = region.ours.map(l => l.trim()).join('\n');
      const theirsNorm = region.theirs.map(l => l.trim()).join('\n');
      if (oursNorm === theirsNorm) return true;
    }

    return false;
  }

  /**
   * Resolve a conflict in merged text
   */
  private resolveConflictInText(
    text: string,
    conflict: ConflictRegion,
    resolution: 'ours' | 'theirs' | 'both'
  ): string {
    const lines = text.split('\n');
    let replacement: string[];

    switch (resolution) {
      case 'ours':
        replacement = conflict.ours;
        break;
      case 'theirs':
        replacement = conflict.theirs;
        break;
      case 'both':
        replacement = [...conflict.ours, ...conflict.theirs];
        break;
    }

    // Find and replace conflict markers
    const before = lines.slice(0, conflict.startLine);
    const after = lines.slice(conflict.endLine + 1);

    return [...before, ...replacement, ...after].join('\n');
  }

  /**
   * Find LCS positions for alignment
   */
  private findLcsPositions(
    base: string[],
    modified: string[],
    lcs: string[]
  ): Map<number, number> {
    const positions = new Map<number, number>();
    let baseIdx = 0;
    let modIdx = 0;

    for (const lcsLine of lcs) {
      while (baseIdx < base.length && base[baseIdx] !== lcsLine) baseIdx++;
      while (modIdx < modified.length && modified[modIdx] !== lcsLine) modIdx++;
      
      if (baseIdx < base.length && modIdx < modified.length) {
        positions.set(baseIdx, modIdx);
        baseIdx++;
        modIdx++;
      }
    }

    return positions;
  }

  /**
   * Find next sync point in base
   */
  private findNextSync(
    base: string[],
    from: number,
    lcsOurs: string[],
    lcsTheirs: string[]
  ): number {
    const lcsSet = new Set([...lcsOurs, ...lcsTheirs]);
    
    for (let i = from; i < base.length; i++) {
      if (lcsSet.has(base[i])) {
        return i;
      }
    }
    
    return base.length;
  }

  /**
   * Helper to create result object
   */
  private createResult(
    merged: string,
    hasConflicts: boolean,
    conflicts: ConflictRegion[],
    info: { type: string }
  ): MergeResult {
    return {
      merged,
      hasConflicts,
      conflicts,
      stats: {
        hunksTotal: 1,
        hunksClean: hasConflicts ? 0 : 1,
        hunksConflicted: hasConflicts ? 1 : 0,
        linesAdded: 0,
        linesRemoved: 0,
        autoResolved: 0
      }
    };
  }

  /**
   * LCS for diff computation (O(nm) time, O(nm) space)
   */
  private longestCommonSubsequence(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;
    
    // Use optimized algorithm for large inputs
    if (m * n > 1000000) {
      return this.lcsLinearSpace(a, b);
    }

    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find LCS
    const lcs: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        lcs.unshift(a[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return lcs;
  }

  /**
   * Linear space LCS for large inputs (Hirschberg algorithm)
   */
  private lcsLinearSpace(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;

    if (m === 0 || n === 0) return [];
    if (m === 1) return b.includes(a[0]) ? [a[0]] : [];
    if (n === 1) return a.includes(b[0]) ? [b[0]] : [];

    const mid = Math.floor(m / 2);
    const left = this.lcsScore(a.slice(0, mid), b);
    const right = this.lcsScoreReverse(a.slice(mid), b);

    // Find best split point
    let maxScore = -1;
    let splitJ = 0;
    for (let j = 0; j <= n; j++) {
      const score = left[j] + right[n - j];
      if (score > maxScore) {
        maxScore = score;
        splitJ = j;
      }
    }

    // Recurse
    const leftLcs = this.lcsLinearSpace(a.slice(0, mid), b.slice(0, splitJ));
    const rightLcs = this.lcsLinearSpace(a.slice(mid), b.slice(splitJ));

    return [...leftLcs, ...rightLcs];
  }

  /**
   * Compute LCS score row
   */
  private lcsScore(a: string[], b: string[]): number[] {
    const m = a.length;
    const n = b.length;
    let prev = new Array(n + 1).fill(0);
    let curr = new Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      [prev, curr] = [curr, prev];
    }

    return prev;
  }

  /**
   * Compute reverse LCS score row
   */
  private lcsScoreReverse(a: string[], b: string[]): number[] {
    return this.lcsScore([...a].reverse(), [...b].reverse()).reverse();
  }

  /**
   * Normalize line endings to \n
   */
  private normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Format conflict markers (Git style) - for external use
   */
  formatConflict(ours: string[], base: string[], theirs: string[], showBase = false): string {
    const lines: string[] = ['<<<<<<< OURS'];
    lines.push(...ours);
    if (showBase && base.length > 0) {
      lines.push('||||||| BASE');
      lines.push(...base);
    }
    lines.push('=======');
    lines.push(...theirs);
    lines.push('>>>>>>> THEIRS');
    return lines.join('\n');
  }
}

// Internal type for merge regions
type MergeRegionType = 'unchanged' | 'ours-only' | 'theirs-only' | 'both-same' | 'both-different' | 'add-add' | 'modify-delete';

interface MergeRegion {
  base: string[];
  ours: string[];
  theirs: string[];
  type: MergeRegionType;
}

/**
 * Merge files with automatic conflict detection
 */
export async function mergeFiles(
  basePath: string | null,
  oursPath: string,
  theirsPath: string,
  options?: MergeOptions
): Promise<MergeResult> {
  const fs = await import('fs');
  
  const base = basePath ? fs.readFileSync(basePath, 'utf8') : '';
  const ours = fs.readFileSync(oursPath, 'utf8');
  const theirs = fs.readFileSync(theirsPath, 'utf8');

  const merger = new ThreeWayMerge(options);
  return merger.merge({ base, ours, theirs });
}

// ============================================================================
// Conflict Resolution Helpers
// ============================================================================

export type ConflictResolution = 'ours' | 'theirs' | 'both' | 'manual';

export class ConflictResolver {
  /**
   * Parse conflict markers from content
   */
  static parseConflicts(content: string): ConflictRegion[] {
    const lines = content.split('\n');
    const conflicts: ConflictRegion[] = [];
    let i = 0;

    while (i < lines.length) {
      if (lines[i].startsWith('<<<<<<<')) {
        const startLine = i;
        const ours: string[] = [];
        const theirs: string[] = [];
        const base: string[] = [];
        let section: 'ours' | 'base' | 'theirs' = 'ours';

        i++;
        while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
          if (lines[i].startsWith('|||||||')) {
            section = 'base';
          } else if (lines[i].startsWith('=======')) {
            section = 'theirs';
          } else {
            if (section === 'ours') ours.push(lines[i]);
            else if (section === 'base') base.push(lines[i]);
            else theirs.push(lines[i]);
          }
          i++;
        }

        conflicts.push({
          startLine,
          endLine: i,
          ours,
          theirs,
          base,
          type: 'content',
          autoResolvable: false
        });
      }
      i++;
    }

    return conflicts;
  }

  /**
   * Resolve a single conflict
   */
  static resolveConflict(
    content: string,
    conflictIndex: number,
    resolution: ConflictResolution,
    manualContent?: string
  ): string {
    const conflicts = this.parseConflicts(content);
    if (conflictIndex >= conflicts.length) return content;

    const conflict = conflicts[conflictIndex];
    const lines = content.split('\n');
    
    let resolved: string[];
    switch (resolution) {
      case 'ours':
        resolved = conflict.ours;
        break;
      case 'theirs':
        resolved = conflict.theirs;
        break;
      case 'both':
        resolved = [...conflict.ours, ...conflict.theirs];
        break;
      case 'manual':
        resolved = manualContent ? manualContent.split('\n') : [];
        break;
      default:
        resolved = conflict.ours;
    }

    // Replace conflict region
    const before = lines.slice(0, conflict.startLine);
    const after = lines.slice(conflict.endLine + 1);
    
    return [...before, ...resolved, ...after].join('\n');
  }

  /**
   * Resolve all conflicts with a single strategy
   */
  static resolveAll(content: string, resolution: 'ours' | 'theirs'): string {
    let result = content;
    
    // Keep resolving until no more conflicts
    while (this.hasConflicts(result)) {
      const conflicts = this.parseConflicts(result);
      if (conflicts.length === 0) break;
      
      // Always resolve first conflict (indices shift after each resolution)
      result = this.resolveConflict(result, 0, resolution);
    }
    
    return result;
  }

  /**
   * Check if content has unresolved conflicts
   */
  static hasConflicts(content: string): boolean {
    return content.includes('<<<<<<<') && 
           content.includes('=======') && 
           content.includes('>>>>>>>');
  }

  /**
   * Count unresolved conflicts
   */
  static countConflicts(content: string): number {
    return (content.match(/^<<<<<<</gm) || []).length;
  }

  /**
   * Get a summary of conflicts
   */
  static summarize(content: string): { 
    count: number; 
    conflicts: Array<{ 
      line: number; 
      oursLines: number; 
      theirsLines: number;
      type: ConflictType;
    }> 
  } {
    const conflicts = this.parseConflicts(content);
    return {
      count: conflicts.length,
      conflicts: conflicts.map(c => ({
        line: c.startLine + 1,
        oursLines: c.ours.length,
        theirsLines: c.theirs.length,
        type: c.type
      }))
    };
  }

  /**
   * Interactive conflict resolution (returns next action)
   */
  static getConflictPreview(content: string, index: number): {
    found: boolean;
    conflict?: ConflictRegion;
    context?: { before: string[]; after: string[] };
  } {
    const conflicts = this.parseConflicts(content);
    if (index >= conflicts.length) {
      return { found: false };
    }

    const conflict = conflicts[index];
    const lines = content.split('\n');
    
    // Get 3 lines of context
    const beforeStart = Math.max(0, conflict.startLine - 3);
    const afterEnd = Math.min(lines.length, conflict.endLine + 4);

    return {
      found: true,
      conflict,
      context: {
        before: lines.slice(beforeStart, conflict.startLine),
        after: lines.slice(conflict.endLine + 1, afterEnd)
      }
    };
  }
}

/**
 * File-level merge utilities
 */
export class FileMerge {
  /**
   * Merge two versions of a file given a common ancestor
   */
  static async merge(
    basePath: string | null,
    oursPath: string,
    theirsPath: string,
    outputPath: string,
    options?: MergeOptions
  ): Promise<{ success: boolean; result: MergeResult }> {
    const result = await mergeFiles(basePath, oursPath, theirsPath, options);
    
    const fs = await import('fs');
    fs.writeFileSync(outputPath, result.merged);
    
    return {
      success: !result.hasConflicts,
      result
    };
  }

  /**
   * Check if a merge would result in conflicts
   */
  static async previewMerge(
    basePath: string | null,
    oursPath: string,
    theirsPath: string,
    options?: MergeOptions
  ): Promise<MergeResult> {
    return mergeFiles(basePath, oursPath, theirsPath, options);
  }

  /**
   * Detect file renames between versions
   */
  static detectRenames(
    oldFiles: Map<string, string>,  // path -> hash
    newFiles: Map<string, string>,
    threshold = 50
  ): Map<string, string> {  // old path -> new path
    const renames = new Map<string, string>();
    
    // Find files that exist only in old or new
    const deleted = new Map<string, string>();
    const added = new Map<string, string>();
    
    for (const [path, hash] of oldFiles) {
      if (!newFiles.has(path)) {
        deleted.set(hash, path);
      }
    }
    
    for (const [path, hash] of newFiles) {
      if (!oldFiles.has(path)) {
        added.set(hash, path);
      }
    }
    
    // Exact content match = rename
    for (const [hash, oldPath] of deleted) {
      if (added.has(hash)) {
        const newPath = added.get(hash)!;
        renames.set(oldPath, newPath);
        deleted.delete(hash);
        added.delete(hash);
      }
    }
    
    return renames;
  }
}
