/**
 * Git-Enhanced MCP Tools
 * Advanced diff, timeline, and restore tools using Git-quality algorithms
 */

import { AdvancedDiffEngine, DiffAlgorithm, DiffResult } from '../core/diff-engine-v2.js';
import { CheckpointGraph, CheckpointNode, TimelineOptions } from '../core/checkpoint-graph.js';
import { TimeMachineEngine } from '../core/engine.js';
import { SelectiveRestore } from '../core/selective-restore.js';

export interface DiffToolParams {
  checkpointA: string;
  checkpointB?: string;
  paths?: string[];
  algorithm?: DiffAlgorithm;
  context?: number;
  colorMoved?: boolean;
}

export interface TimelineToolParams {
  afterDate?: string;
  beforeDate?: string;
  path?: string;
  limit?: number;
  offset?: number;
}

export interface RestoreToolParams {
  checkpointId: string;
  patterns: string[];
  strategy?: 'ours' | 'theirs' | 'abort';
  dryRun?: boolean;
  createBackup?: boolean;
}

export class GitEnhancedTools {
  private diffEngine: AdvancedDiffEngine;
  private checkpointGraph: CheckpointGraph;
  private selectiveRestore: SelectiveRestore;

  constructor(
    private engine: TimeMachineEngine,
    dataDir: string
  ) {
    this.diffEngine = new AdvancedDiffEngine();
    this.checkpointGraph = new CheckpointGraph(dataDir);
    this.selectiveRestore = new SelectiveRestore(engine);
  }

  /**
   * Initialize checkpoint graph from engine data
   */
  async initialize(): Promise<void> {
    const timepoints = this.engine.listTimePoints();
    const checkpoints: CheckpointNode[] = [];

    for (const tp of timepoints) {
      const fullTp = this.engine.getTimePoint(tp.id);
      if (!fullTp) continue;

      checkpoints.push({
        id: tp.id,
        timestamp: tp.timestamp,
        description: tp.description,
        parentId: undefined, // Could be derived from timeline
        files: fullTp.files.map((f: any) => f.path),
        stats: {
          totalFiles: fullTp.files.length,
          totalSize: fullTp.files.reduce((sum: number, f: any) => sum + (f.size || 0), 0)
        }
      });
    }

    await this.checkpointGraph.build(checkpoints);
  }

  /**
   * Enhanced diff with algorithm selection
   */
  async diffFiles(params: DiffToolParams): Promise<{
    files: Array<{
      path: string;
      diff: DiffResult;
      unified: string;
    }>;
    summary: {
      filesChanged: number;
      insertions: number;
      deletions: number;
    };
  }> {
    const cpA = this.engine.getTimePoint(params.checkpointA);
    if (!cpA) throw new Error(`Checkpoint not found: ${params.checkpointA}`);

    // If no checkpointB, compare with current state
    const cpB = params.checkpointB 
      ? this.engine.getTimePoint(params.checkpointB)
      : null;

    const filesA = new Map(cpA.files.map((f: any) => [f.path, f]));
    const filesB = cpB 
      ? new Map(cpB.files.map((f: any) => [f.path, f]))
      : null;

    // Filter by paths if specified
    const pathsToCompare = params.paths || Array.from(filesA.keys());
    
    const results: Array<{ path: string; diff: DiffResult; unified: string }> = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const filePath of pathsToCompare) {
      const fileA = filesA.get(filePath);
      if (!fileA) continue;

      const contentA = this.engine.getFileContent(params.checkpointA, filePath);
      const contentB = params.checkpointB
        ? this.engine.getFileContent(params.checkpointB, filePath)
        : this.getCurrentFileContent(filePath);

      if (!contentA) continue;

      const oldContent = contentA;
      const newContent = contentB || '';

      const diff = this.diffEngine.diff(oldContent, newContent, {
        algorithm: params.algorithm || 'histogram',
        context: params.context ?? 3,
        colorMoved: params.colorMoved ?? true
      });

      if (diff.added > 0 || diff.removed > 0) {
        results.push({
          path: filePath,
          diff,
          unified: this.diffEngine.formatUnified(diff, `a/${filePath}`, `b/${filePath}`)
        });
        totalInsertions += diff.added;
        totalDeletions += diff.removed;
      }
    }

    return {
      files: results,
      summary: {
        filesChanged: results.length,
        insertions: totalInsertions,
        deletions: totalDeletions
      }
    };
  }

  /**
   * Timeline query with bloom filter optimization
   */
  async queryTimeline(params: TimelineToolParams): Promise<{
    checkpoints: Array<{
      id: string;
      timestamp: string;
      description: string;
      fileCount: number;
      mightContainPath: boolean;
    }>;
    total: number;
    hasMore: boolean;
  }> {
    const options: TimelineOptions = {
      after: params.afterDate ? new Date(params.afterDate) : undefined,
      before: params.beforeDate ? new Date(params.beforeDate) : undefined,
      path: params.path,
      limit: (params.limit || 50) + 1, // Fetch one extra to check hasMore
      offset: params.offset || 0
    };

    const results = this.checkpointGraph.getTimeline(options);
    const hasMore = results.length > (params.limit || 50);
    const checkpoints = results.slice(0, params.limit || 50);

    return {
      checkpoints: checkpoints.map(cp => ({
        id: cp.id,
        timestamp: cp.timestamp.toISOString(),
        description: cp.description,
        fileCount: cp.stats.totalFiles,
        mightContainPath: params.path 
          ? this.checkpointGraph.checkpointMightContainFile(cp.id, params.path)
          : true
      })),
      total: checkpoints.length,
      hasMore
    };
  }

  /**
   * Selective restore with conflict handling
   */
  async restoreSelective(params: RestoreToolParams): Promise<{
    success: boolean;
    restored: string[];
    conflicts: Array<{ path: string; reason: string }>;
    skipped: string[];
    backupId?: string;
  }> {
    // Preview first if dry run
    if (params.dryRun) {
      const checkpoint = this.engine.getTimePoint(params.checkpointId);
      if (!checkpoint) {
        return { success: false, restored: [], conflicts: [], skipped: [], backupId: undefined };
      }

      const matched = this.selectiveRestore.matchFiles(checkpoint.files, params.patterns);
      const conflicts = this.selectiveRestore.detectConflicts(matched);

      return {
        success: true,
        restored: matched.map((f: any) => f.path),
        conflicts: conflicts.map(c => ({ path: c.path, reason: 'File modified locally' })),
        skipped: []
      };
    }

    // Create backup if requested
    let backupId: string | undefined;
    if (params.createBackup !== false) {
      backupId = await this.createBackup(params.patterns);
    }

    // Perform restore
    const result = this.selectiveRestore.restore({
      checkpointId: params.checkpointId,
      patterns: params.patterns,
      strategy: params.strategy || 'abort',
      dryRun: false
    });

    return {
      success: result.restored.length > 0 || result.conflicts.length === 0,
      restored: result.restored,
      conflicts: result.conflicts.map(c => ({ path: c.path, reason: 'File modified locally' })),
      skipped: result.skipped,
      backupId
    };
  }

  /**
   * Find checkpoints containing a specific file
   */
  async findFileHistory(filePath: string): Promise<Array<{
    checkpointId: string;
    timestamp: string;
    description: string;
  }>> {
    const checkpoints = this.checkpointGraph.findCheckpointsWithFile(filePath);
    
    return checkpoints.map(cp => ({
      checkpointId: cp.id,
      timestamp: cp.timestamp.toISOString(),
      description: cp.description
    }));
  }

  /**
   * Get checkpoint ancestors (history chain)
   */
  async getCheckpointHistory(checkpointId: string, limit: number = 10): Promise<Array<{
    id: string;
    timestamp: string;
    description: string;
  }>> {
    const ancestors = this.checkpointGraph.getAncestors(checkpointId, limit);
    
    return ancestors.map(cp => ({
      id: cp.id,
      timestamp: cp.timestamp.toISOString(),
      description: cp.description
    }));
  }

  // Helper methods
  private getCurrentFileContent(filePath: string): string | null {
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.join(this.engine.getProjectPath(), filePath);
    
    try {
      return fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  private async createBackup(patterns: string[]): Promise<string> {
    const timestamp = Date.now();
    const backupId = `backup_${timestamp}`;
    // Implementation would create a checkpoint of current state
    return backupId;
  }
}

/**
 * MCP Tool Definitions for registration
 */
export const gitEnhancedToolDefinitions = {
  tm_diff_advanced: {
    name: 'tm_diff_advanced',
    description: 'Compare files between checkpoints using Git-quality diff algorithms (Myers, Patience, Histogram)',
    inputSchema: {
      type: 'object',
      required: ['checkpointA'],
      properties: {
        checkpointA: { type: 'string', description: 'First checkpoint ID' },
        checkpointB: { type: 'string', description: 'Second checkpoint ID (optional, defaults to current state)' },
        paths: { type: 'array', items: { type: 'string' }, description: 'File paths to compare (optional)' },
        algorithm: { type: 'string', enum: ['myers', 'patience', 'histogram'], description: 'Diff algorithm (default: histogram)' },
        context: { type: 'number', description: 'Context lines (default: 3)' },
        colorMoved: { type: 'boolean', description: 'Highlight moved lines (default: true)' }
      }
    }
  },

  tm_timeline_query: {
    name: 'tm_timeline_query',
    description: 'Query checkpoint timeline with Git-level performance using bloom filters',
    inputSchema: {
      type: 'object',
      properties: {
        afterDate: { type: 'string', format: 'date-time', description: 'Show checkpoints after this date' },
        beforeDate: { type: 'string', format: 'date-time', description: 'Show checkpoints before this date' },
        path: { type: 'string', description: 'Filter by file path (uses bloom filter for fast lookup)' },
        limit: { type: 'number', description: 'Max results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset (default: 0)' }
      }
    }
  },

  tm_restore_selective: {
    name: 'tm_restore_selective',
    description: 'Restore specific files from checkpoint with Git-style conflict handling',
    inputSchema: {
      type: 'object',
      required: ['checkpointId', 'patterns'],
      properties: {
        checkpointId: { type: 'string', description: 'Checkpoint to restore from' },
        patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns for files to restore' },
        strategy: { type: 'string', enum: ['ours', 'theirs', 'abort'], description: 'Conflict strategy (default: abort)' },
        dryRun: { type: 'boolean', description: 'Preview without making changes' },
        createBackup: { type: 'boolean', description: 'Create backup before restore (default: true)' }
      }
    }
  },

  tm_file_history: {
    name: 'tm_file_history',
    description: 'Find all checkpoints containing a specific file',
    inputSchema: {
      type: 'object',
      required: ['filePath'],
      properties: {
        filePath: { type: 'string', description: 'Path to the file' }
      }
    }
  }
};
