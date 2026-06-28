import { minimatch } from 'minimatch';
import * as fs from 'fs';
import * as path from 'path';
import { TimeMachineEngine } from './engine.js';
import { ThreeWayMerge } from './three-way-merge.js';

export interface RestoreOptions {
  patterns: string[];
  checkpointId: string;
  strategy: 'ours' | 'theirs' | 'merge' | 'abort';
  baseCheckpointId?: string; // For 3-way merge
  dryRun?: boolean;
}

export interface Conflict {
  path: string;
  currentHash: string;
  checkpointHash: string;
}

export interface MergeConflict {
  path: string;
  conflictCount: number;
  content: string; // Content with conflict markers
}

export interface RestoreResult {
  restored: string[];
  conflicts: Conflict[];
  merged: MergeConflict[];
  skipped: string[];
}

export class SelectiveRestore {
  private merger = new ThreeWayMerge();

  constructor(private engine: TimeMachineEngine) {}

  matchFiles(manifest: any[], patterns: string[]): any[] {
    return manifest.filter(file => 
      patterns.some(pattern => minimatch(file.path, pattern))
    );
  }

  detectConflicts(files: any[]): Conflict[] {
    const conflicts: Conflict[] = [];
    
    for (const file of files) {
      const currentPath = path.join(this.engine.getProjectPath(), file.path);
      if (fs.existsSync(currentPath)) {
        const currentContent = fs.readFileSync(currentPath);
        const currentHash = this.engine.hashContent(currentContent);
        
        if (currentHash !== file.hash) {
          conflicts.push({
            path: file.path,
            currentHash,
            checkpointHash: file.hash
          });
        }
      }
    }
    
    return conflicts;
  }

  restore(options: RestoreOptions): RestoreResult {
    const checkpoint = this.engine.getTimePoint(options.checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${options.checkpointId}`);
    }

    const matchedFiles = this.matchFiles(checkpoint.files, options.patterns);
    const conflicts = this.detectConflicts(matchedFiles);

    if (conflicts.length > 0 && options.strategy === 'abort') {
      return {
        restored: [],
        conflicts,
        merged: [],
        skipped: matchedFiles.map(f => f.path)
      };
    }

    if (options.dryRun) {
      return {
        restored: matchedFiles.map(f => f.path),
        conflicts,
        merged: [],
        skipped: []
      };
    }

    const restored: string[] = [];
    const merged: MergeConflict[] = [];
    const skipped: string[] = [];

    for (const file of matchedFiles) {
      const conflict = conflicts.find(c => c.path === file.path);
      
      if (conflict) {
        if (options.strategy === 'ours') {
          skipped.push(file.path);
          continue;
        }
        
        if (options.strategy === 'merge') {
          // 3-way merge
          const result = this.mergeFile(file.path, options.checkpointId, options.baseCheckpointId);
          if (result) {
            const fullPath = path.join(this.engine.getProjectPath(), file.path);
            fs.writeFileSync(fullPath, result.content);
            
            if (result.hasConflicts) {
              merged.push({
                path: file.path,
                conflictCount: result.conflictCount,
                content: result.content
              });
            } else {
              restored.push(file.path);
            }
            continue;
          }
        }
        // strategy === 'theirs', proceed with overwrite
      }

      try {
        // Write-through restore (no merge): use the Buffer API so binary files
        // are materialized byte-for-byte rather than corrupted by a UTF-8
        // decode/encode round-trip.
        const content = this.engine.getFileBufferAt(options.checkpointId, file.path);
        if (!content) {
          skipped.push(file.path);
          continue;
        }

        const fullPath = path.join(this.engine.getProjectPath(), file.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
        restored.push(file.path);
      } catch (error) {
        skipped.push(file.path);
      }
    }

    return { restored, conflicts, merged, skipped };
  }

  private mergeFile(filePath: string, theirsCheckpointId: string, baseCheckpointId?: string): { content: string; hasConflicts: boolean; conflictCount: number } | null {
    const fullPath = path.join(this.engine.getProjectPath(), filePath);
    
    // Get current (ours)
    let ours = '';
    try { ours = fs.readFileSync(fullPath, 'utf8'); } catch { return null; }
    
    // Get theirs
    const theirs = this.engine.getFileContent(theirsCheckpointId, filePath);
    if (!theirs) return null;
    
    // Get base (common ancestor)
    let base = '';
    if (baseCheckpointId) {
      base = this.engine.getFileContent(baseCheckpointId, filePath) || '';
    }
    
    const result = this.merger.merge({ base, ours, theirs });
    
    return {
      content: result.merged,
      hasConflicts: result.hasConflicts,
      conflictCount: result.conflicts.length
    };
  }
}
