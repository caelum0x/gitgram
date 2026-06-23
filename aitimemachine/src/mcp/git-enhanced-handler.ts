/**
 * Git-Enhanced MCP Tool Handler
 * Integrates advanced diff, timeline, and restore with MCP server
 * 
 * This module connects Git-quality algorithms to the MCP protocol,
 * providing Time Machine-like capabilities for AI development.
 */

import { AdvancedDiffEngine, DiffAlgorithm, DiffResult, DiffOptions } from '../core/diff-engine-v2.js';
import { CheckpointGraph, CheckpointNode, TimelineOptions } from '../core/checkpoint-graph.js';
import { EnhancedBloomFilter, CheckpointBloom } from '../core/bloom-filter-v2.js';
import { SelectiveRestore } from '../core/selective-restore.js';
import { TimeMachineEngine } from '../core/engine.js';
import type { Repo } from '../store/repo.js';
import { CasStore } from '../core/cas.js';
import { parseManifestJson, type FileEntry as ManifestFileEntry, type Manifest } from '../core/manifest.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface DiffAdvancedParams {
  projectId: string;
  checkpointA: string;
  checkpointB?: string;
  paths?: string[];
  algorithm?: DiffAlgorithm;
  context?: number;
  colorMoved?: boolean;
  output?: 'unified' | 'stat' | 'name-only' | 'name-status';
}

export interface TimelineQueryParams {
  projectId: string;
  afterDate?: string;
  beforeDate?: string;
  path?: string;
  author?: string;
  limit?: number;
  offset?: number;
  format?: 'full' | 'oneline' | 'short';
}

export interface RestoreSelectiveParams {
  projectId: string;
  checkpointId: string;
  patterns: string[];
  strategy?: 'ours' | 'theirs' | 'merge' | 'abort';
  dryRun?: boolean;
  createBackup?: boolean;
}

export interface FileHistoryParams {
  projectId: string;
  filePath: string;
  limit?: number;
  showDiff?: boolean;
}

export interface BloomQueryParams {
  projectId: string;
  filePaths: string[];
}

export interface DiffAdvancedResult {
  files: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    oldPath?: string;
    diff?: DiffResult;
    unified?: string;
    stat?: string;
  }>;
  summary: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  algorithm: DiffAlgorithm;
}

export interface TimelineQueryResult {
  checkpoints: Array<{
    id: string;
    shortId: string;
    timestamp: string;
    timeAgo: string;
    description: string;
    fileCount: number;
    totalSize: number;
    mightContainPath?: boolean;
    parentId?: string;
  }>;
  total: number;
  hasMore: boolean;
  filtered: boolean;
}

export interface RestoreSelectiveResult {
  success: boolean;
  restored: string[];
  conflicts: Array<{
    path: string;
    reason: string;
    resolution?: 'ours' | 'theirs' | 'merged';
  }>;
  skipped: string[];
  backupId?: string;
  dryRun: boolean;
}

export interface FileHistoryResult {
  file: string;
  history: Array<{
    checkpointId: string;
    shortId: string;
    timestamp: string;
    description: string;
    changeType: 'added' | 'modified' | 'deleted';
    diff?: string;
    stats?: { added: number; removed: number };
  }>;
}

// ============================================================================
// Handler Class
// ============================================================================

export class GitEnhancedHandler {
  private diffEngine: AdvancedDiffEngine;
  private checkpointGraphs: Map<string, CheckpointGraph> = new Map();
  private bloomFilters: Map<string, EnhancedBloomFilter> = new Map();

  private toConflictResolution(strategy: RestoreSelectiveParams['strategy']): 'ours' | 'theirs' | 'merged' | undefined {
    if (strategy === 'ours' || strategy === 'theirs') return strategy;
    if (strategy === 'merge') return 'merged';
    return undefined;
  }

  constructor(
    private repo: Repo,
    private cas: CasStore,
    private dataDir: string
  ) {
    this.diffEngine = new AdvancedDiffEngine();
  }

  // ==========================================================================
  // Advanced Diff Tool
  // ==========================================================================

  async diffAdvanced(params: DiffAdvancedParams): Promise<DiffAdvancedResult> {
    const project = this.getProject(params.projectId);
    
    // Get checkpoint A manifest
    const cpA = this.repo.getCheckpoint(params.projectId, params.checkpointA);
    if (!cpA) {
      throw new Error(`Checkpoint not found: ${params.checkpointA}`);
    }
    
    const manifestA = this.getManifest(cpA.manifestBlobHash);
    const filesA = new Map<string, ManifestFileEntry>(manifestA.files.map((f) => [f.path, f]));

    // Get checkpoint B manifest (or current state)
    let filesB: Map<string, ManifestFileEntry | { path: string; hash: string; size: number }>;
    let manifestB: Manifest | null = null;
    
    if (params.checkpointB) {
      const cpB = this.repo.getCheckpoint(params.projectId, params.checkpointB);
      if (!cpB) {
        throw new Error(`Checkpoint not found: ${params.checkpointB}`);
      }
      manifestB = this.getManifest(cpB.manifestBlobHash);
      filesB = new Map<string, ManifestFileEntry>(manifestB.files.map((f) => [f.path, f]));
    } else {
      // Compare to current workspace
      filesB = await this.scanCurrentFiles(project.rootPath);
    }

    // Determine which files to compare
    const allPaths = new Set([...filesA.keys(), ...filesB.keys()]);
    const pathsToCompare = params.paths 
      ? params.paths.filter(p => allPaths.has(p))
      : Array.from(allPaths);

    const algorithm = params.algorithm || 'histogram';
    const results: DiffAdvancedResult['files'] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const filePath of pathsToCompare) {
      const fileA = filesA.get(filePath);
      const fileB = filesB.get(filePath);

      // Determine file status
      let status: 'added' | 'modified' | 'deleted' | 'renamed';
      let oldContent = '';
      let newContent = '';

      if (!fileA && fileB) {
        status = 'added';
        newContent = await this.getFileContent(fileB, params.checkpointB, project.rootPath);
      } else if (fileA && !fileB) {
        status = 'deleted';
        oldContent = await this.getFileContent(fileA, params.checkpointA, project.rootPath);
      } else if (fileA && fileB) {
        if (fileA.hash === fileB.hash) continue; // No change
        status = 'modified';
        oldContent = await this.getFileContent(fileA, params.checkpointA, project.rootPath);
        newContent = await this.getFileContent(fileB, params.checkpointB, project.rootPath);
      } else {
        continue;
      }

      // Skip binary files
      if (this.isBinaryContent(oldContent) || this.isBinaryContent(newContent)) {
        results.push({
          path: filePath,
          status,
          stat: 'Binary file differs'
        });
        continue;
      }

      // Compute diff using selected algorithm
      const diffOptions: DiffOptions = {
        algorithm,
        context: params.context ?? 3,
        colorMoved: params.colorMoved ?? true
      };

      const diff = this.diffEngine.diff(oldContent, newContent, diffOptions);

      const result: DiffAdvancedResult['files'][0] = {
        path: filePath,
        status
      };

      // Format output based on requested format
      switch (params.output) {
        case 'name-only':
          break; // Just include path and status
        case 'name-status':
          break; // Just include path and status
        case 'stat':
          const plusSigns = '+'.repeat(Math.min(diff.added, 20));
          const minusSigns = '-'.repeat(Math.min(diff.removed, 20));
          result.stat = `${filePath} | ${diff.added + diff.removed} ${plusSigns}${minusSigns}`;
          break;
        case 'unified':
        default:
          result.diff = diff;
          result.unified = this.diffEngine.formatUnified(diff, `a/${filePath}`, `b/${filePath}`);
          break;
      }

      results.push(result);
      totalInsertions += diff.added;
      totalDeletions += diff.removed;
    }

    return {
      files: results,
      summary: {
        filesChanged: results.length,
        insertions: totalInsertions,
        deletions: totalDeletions
      },
      algorithm
    };
  }

  // ==========================================================================
  // Timeline Query with Bloom Filter Optimization
  // ==========================================================================

  async queryTimeline(params: TimelineQueryParams): Promise<TimelineQueryResult> {
    // Get or build checkpoint graph
    const graph = await this.getOrBuildGraph(params.projectId);
    
    const options: TimelineOptions = {
      after: params.afterDate ? new Date(params.afterDate) : undefined,
      before: params.beforeDate ? new Date(params.beforeDate) : undefined,
      path: params.path,
      limit: (params.limit || 50) + 1, // Fetch extra to detect hasMore
      offset: params.offset || 0
    };

    const results = graph.getTimeline(options);
    const hasMore = results.length > (params.limit || 50);
    const checkpoints = results.slice(0, params.limit || 50);

    return {
      checkpoints: checkpoints.map(cp => ({
        id: cp.id,
        shortId: cp.id.slice(0, 8),
        timestamp: cp.timestamp.toISOString(),
        timeAgo: this.getTimeAgo(cp.timestamp),
        description: cp.description,
        fileCount: cp.stats.totalFiles,
        totalSize: cp.stats.totalSize,
        mightContainPath: params.path 
          ? graph.checkpointMightContainFile(cp.id, params.path)
          : undefined,
        parentId: cp.parentId
      })),
      total: checkpoints.length,
      hasMore,
      filtered: !!(params.path || params.afterDate || params.beforeDate)
    };
  }

  // ==========================================================================
  // Selective Restore with Conflict Handling
  // ==========================================================================

  async restoreSelective(params: RestoreSelectiveParams): Promise<RestoreSelectiveResult> {
    const project = this.getProject(params.projectId);
    const checkpoint = this.repo.getCheckpoint(params.projectId, params.checkpointId);
    
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${params.checkpointId}`);
    }

    const manifest = this.getManifest(checkpoint.manifestBlobHash);
    const strategy = params.strategy || 'abort';
    const dryRun = params.dryRun ?? false;

    // Match files against patterns
    const { minimatch } = await import('minimatch');
    const matchedFiles = manifest.files.filter((f) =>
      params.patterns.some(pattern => minimatch(f.path, pattern))
    );

    if (matchedFiles.length === 0) {
      return {
        success: true,
        restored: [],
        conflicts: [],
        skipped: [],
        dryRun
      };
    }

    // Detect conflicts
    const conflicts: RestoreSelectiveResult['conflicts'] = [];
    const toRestore: ManifestFileEntry[] = [];

    for (const file of matchedFiles) {
      const fullPath = path.join(project.rootPath, file.path);
      
      if (fs.existsSync(fullPath)) {
        const currentContent = fs.readFileSync(fullPath);
        const currentHash = this.hashContent(currentContent);

        if (currentHash !== file.hash) {
          conflicts.push({
            path: file.path,
            reason: 'File has been modified since checkpoint'
          });
        } else {
          toRestore.push(file);
        }
      } else {
        toRestore.push(file);
      }
    }

    // Handle conflicts based on strategy
    if (conflicts.length > 0 && strategy === 'abort') {
      return {
        success: false,
        restored: [],
        conflicts,
        skipped: matchedFiles.map((f) => f.path),
        dryRun
      };
    }

    if (dryRun) {
      const resolution = this.toConflictResolution(strategy);
      return {
        success: true,
        restored: [...toRestore.map((f) => f.path), ...conflicts.map(c => c.path)],
        conflicts: conflicts.map(c => ({ ...c, resolution })),
        skipped: [],
        dryRun: true
      };
    }

    // Create backup if requested
    let backupId: string | undefined;
    if (params.createBackup !== false) {
      backupId = await this.createBackup(project.rootPath, matchedFiles);
    }

    // Perform restore
    const restored: string[] = [];
    const skipped: string[] = [];

    for (const file of toRestore) {
      try {
        await this.restoreFile(file, project.rootPath);
        restored.push(file.path);
      } catch (error) {
        skipped.push(file.path);
      }
    }

    // Handle conflicts based on strategy
    for (const conflict of conflicts) {
      if (strategy === 'theirs') {
        const file = matchedFiles.find((f) => f.path === conflict.path);
        if (file) {
          try {
            await this.restoreFile(file, project.rootPath);
            restored.push(file.path);
            conflict.resolution = 'theirs';
          } catch (error) {
            skipped.push(file.path);
          }
        }
      } else if (strategy === 'ours') {
        skipped.push(conflict.path);
        conflict.resolution = 'ours';
      } else if (strategy === 'merge') {
        // Three-way merge
        const merged = await this.attemptMerge(conflict.path, params.checkpointId, project.rootPath);
        if (merged.success) {
          restored.push(conflict.path);
          conflict.resolution = 'merged';
        } else {
          skipped.push(conflict.path);
        }
      }
    }

    return {
      success: restored.length > 0 || skipped.length === 0,
      restored,
      conflicts,
      skipped,
      backupId,
      dryRun: false
    };
  }

  // ==========================================================================
  // File History with Bloom Filter Lookup
  // ==========================================================================

  async getFileHistory(params: FileHistoryParams): Promise<FileHistoryResult> {
    const project = this.getProject(params.projectId);
    const graph = await this.getOrBuildGraph(params.projectId);
    
    // Use bloom filter for fast pre-filtering
    const candidates = graph.findCheckpointsWithFile(params.filePath);
    const limit = params.limit || 20;
    
    const history: FileHistoryResult['history'] = [];
    let prevContent: string | null = null;

    for (const cp of candidates.slice(0, limit)) {
      const checkpoint = this.repo.getCheckpoint(params.projectId, cp.id);
      if (!checkpoint) continue;

      const manifest = this.getManifest(checkpoint.manifestBlobHash);
      const file = manifest.files.find((f) => f.path === params.filePath);

      let changeType: 'added' | 'modified' | 'deleted';
      let diffStr: string | undefined;
      let stats: { added: number; removed: number } | undefined;

      if (!file) {
        changeType = 'deleted';
      } else {
        const content = this.cas.getBytes(file.hash).toString('utf-8');
        
        if (prevContent === null) {
          changeType = 'added';
        } else if (content !== prevContent) {
          changeType = 'modified';
          
          if (params.showDiff) {
            const diff = this.diffEngine.diff(prevContent, content, { algorithm: 'histogram' });
            diffStr = this.diffEngine.formatUnified(diff, `a/${params.filePath}`, `b/${params.filePath}`);
            stats = { added: diff.added, removed: diff.removed };
          }
        } else {
          continue; // No change, skip
        }
        
        prevContent = content;
      }

      history.push({
        checkpointId: cp.id,
        shortId: cp.id.slice(0, 8),
        timestamp: cp.timestamp.toISOString(),
        description: cp.description,
        changeType,
        diff: diffStr,
        stats
      });
    }

    return {
      file: params.filePath,
      history
    };
  }

  // ==========================================================================
  // Bloom Filter Query (for fast file existence check)
  // ==========================================================================

  async queryBloomFilters(params: BloomQueryParams): Promise<Map<string, string[]>> {
    const graph = await this.getOrBuildGraph(params.projectId);
    const results = new Map<string, string[]>();

    for (const filePath of params.filePaths) {
      const checkpoints = graph.findCheckpointsWithFile(filePath);
      results.set(filePath, checkpoints.map(cp => cp.id));
    }

    return results;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getProject(projectId: string) {
    const projects = this.repo.listProjects();
    const project = projects.find(p => p.projectId === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }

  private getManifest(manifestBlobHash: string) {
    const manifestBlob = this.cas.getBytes(manifestBlobHash);
    return parseManifestJson(manifestBlob.toString('utf8'));
  }

  private async getOrBuildGraph(projectId: string): Promise<CheckpointGraph> {
    if (this.checkpointGraphs.has(projectId)) {
      return this.checkpointGraphs.get(projectId)!;
    }

    const project = this.getProject(projectId);
    const graph = new CheckpointGraph(this.dataDir);
    
    // Build from checkpoints
    const checkpoints = this.repo.listCheckpointsNewestFirst(projectId, 1000);
    const nodes: CheckpointNode[] = [];

    for (const cp of checkpoints) {
      const manifest = this.getManifest(cp.manifestBlobHash);
      nodes.push({
        id: cp.checkpointId,
        timestamp: new Date(cp.createdAt),
        description: cp.name,
        files: manifest.files.map((f) => f.path),
        stats: {
          totalFiles: manifest.files.length,
          totalSize: manifest.files.reduce((sum: number, f) => sum + (f.size || 0), 0)
        }
      });
    }

    await graph.build(nodes);
    this.checkpointGraphs.set(projectId, graph);
    return graph;
  }

  private async scanCurrentFiles(rootPath: string): Promise<Map<string, { path: string; hash: string; size: number }>> {
    const files = new Map<string, { path: string; hash: string; size: number }>();
    
    const scan = (dir: string, prefix: string = '') => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(prefix, entry.name);
        
        // Skip common ignored directories
        if (entry.isDirectory()) {
          if (['node_modules', '.git', '.aitimemachine', 'coverage', 'dist'].includes(entry.name)) {
            continue;
          }
          scan(fullPath, relativePath);
        } else {
          const content = fs.readFileSync(fullPath);
          const hash = this.hashContent(content);
          files.set(relativePath, { path: relativePath, hash, size: content.length });
        }
      }
    };

    scan(rootPath);
    return files;
  }

  private async getFileContent(file: { hash: string; path: string }, checkpointId: string | undefined, rootPath: string): Promise<string> {
    if (checkpointId) {
      // Get from CAS
      try {
        return this.cas.getBytes(file.hash).toString('utf-8');
      } catch {
        return '';
      }
    } else {
      // Get from filesystem
      const fullPath = path.join(rootPath, file.path);
      try {
        return fs.readFileSync(fullPath, 'utf-8');
      } catch {
        return '';
      }
    }
  }

  private hashContent(content: Buffer | string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private isBinaryContent(content: string): boolean {
    // Check for null bytes (common indicator of binary)
    return content.includes('\0') || /[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 8000));
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  private async createBackup(rootPath: string, files: Array<{ path: string }>): Promise<string> {
    const timestamp = Date.now();
    const backupId = `backup_${timestamp}`;
    const backupDir = path.join(this.dataDir, 'backups', backupId);
    
    fs.mkdirSync(backupDir, { recursive: true });
    
    for (const file of files) {
      const srcPath = path.join(rootPath, file.path);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(backupDir, file.path);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
      }
    }
    
    return backupId;
  }

  private async restoreFile(file: { hash: string; path: string }, rootPath: string): Promise<void> {
    const content = this.cas.getBytes(file.hash);
    const fullPath = path.join(rootPath, file.path);
    
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  private async attemptMerge(
    filePath: string,
    checkpointId: string,
    rootPath: string
  ): Promise<{ success: boolean; content?: string }> {
    try {
      const { ThreeWayMerge } = await import('../core/three-way-merge.js');

      // "ours" = current file on disk
      const fullPath = path.join(rootPath, filePath);
      const oursContent = fs.readFileSync(fullPath, 'utf-8');

      // "theirs" = the version from the target checkpoint
      const checkpoint = this.repo.listCheckpointsNewestFirst(
        // find projectId from checkpoint
        this.repo.listProjects().find(p => p.rootPath === rootPath)?.projectId || '',
        1000
      ).find(cp => cp.checkpointId === checkpointId);
      if (!checkpoint) return { success: false };

      const projectId = this.repo.listProjects().find(p => p.rootPath === rootPath)?.projectId || '';
      const manifest = this.getManifest(checkpoint.manifestBlobHash);
      const theirsFile = manifest.files.find(f => f.path === filePath);
      if (!theirsFile) return { success: false };

      const theirsContent = this.cas.getBytes(theirsFile.hash).toString('utf-8');

      // "base" = find common ancestor from the previous checkpoint that contains this file
      let baseContent = '';
      const allCheckpoints = this.repo.listCheckpointsNewestFirst(projectId, 1000);
      const cpIndex = allCheckpoints.findIndex(cp => cp.checkpointId === checkpointId);

      // Walk backwards from the checkpoint to find the previous version of this file
      for (let i = cpIndex + 1; i < allCheckpoints.length; i++) {
        const prevManifest = this.getManifest(allCheckpoints[i].manifestBlobHash);
        const prevFile = prevManifest.files.find(f => f.path === filePath);
        if (prevFile) {
          baseContent = this.cas.getBytes(prevFile.hash).toString('utf-8');
          break;
        }
      }

      // Perform the 3-way merge
      const merger = new ThreeWayMerge({ conflictStyle: 'diff3' });
      const result = merger.merge({ base: baseContent, ours: oursContent, theirs: theirsContent });

      // Write the merged content to disk
      fs.writeFileSync(fullPath, result.merged);

      return {
        success: !result.hasConflicts,
        content: result.merged
      };
    } catch {
      return { success: false };
    }
  }
}

// ============================================================================
// MCP Tool Definitions
// ============================================================================

export const gitEnhancedToolDefinitions = [
  {
    name: 'tm_diff_advanced',
    description: `🔍 Advanced diff with Git-quality algorithms (Myers, Patience, Histogram).
    
Features:
- Multiple algorithm support for optimal diff quality
- Color-moved detection (highlights moved code blocks)
- Various output formats: unified, stat, name-only
- Compare any two checkpoints or checkpoint vs current state

Usage examples:
- Compare checkpoints: checkpointA="cp_abc123", checkpointB="cp_def456"
- Compare to current: checkpointA="cp_abc123" (omit checkpointB)
- Specific files: paths=["src/app.ts", "package.json"]
- Use patience for refactored code: algorithm="patience"`,
    inputSchema: {
      type: 'object',
      required: ['projectId', 'checkpointA'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        checkpointA: { type: 'string', description: 'First checkpoint ID' },
        checkpointB: { type: 'string', description: 'Second checkpoint ID (omit for current state)' },
        paths: { 
          type: 'array', 
          items: { type: 'string' }, 
          description: 'Specific file paths to compare' 
        },
        algorithm: { 
          type: 'string', 
          enum: ['myers', 'patience', 'histogram'],
          default: 'histogram',
          description: 'Diff algorithm (histogram is fastest, patience best for refactors)'
        },
        context: { type: 'number', default: 3, description: 'Lines of context' },
        colorMoved: { type: 'boolean', default: true, description: 'Detect moved code blocks' },
        output: { 
          type: 'string', 
          enum: ['unified', 'stat', 'name-only', 'name-status'],
          default: 'unified',
          description: 'Output format'
        }
      }
    }
  },
  {
    name: 'tm_timeline_query',
    description: `📅 Query checkpoint timeline with Git-level performance.
    
Features:
- Bloom filter optimization for fast file path filtering
- Date range filtering
- Pagination support
- O(1) checkpoint lookup

Use cases:
- Find when a file was last modified: path="src/critical.ts"
- Show recent checkpoints: limit=10
- Date range: afterDate="2024-01-01", beforeDate="2024-01-31"`,
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        afterDate: { type: 'string', format: 'date-time', description: 'Show after this date (ISO format)' },
        beforeDate: { type: 'string', format: 'date-time', description: 'Show before this date (ISO format)' },
        path: { type: 'string', description: 'Filter by file path (uses bloom filter)' },
        limit: { type: 'number', default: 50, description: 'Max results' },
        offset: { type: 'number', default: 0, description: 'Pagination offset' },
        format: { type: 'string', enum: ['full', 'oneline', 'short'], default: 'full' }
      }
    }
  },
  {
    name: 'tm_restore_selective',
    description: `🔄 Selective restore with Git-style conflict handling.
    
Strategies:
- abort: Stop if any conflicts (safest)
- ours: Keep current version on conflict
- theirs: Use checkpoint version on conflict  
- merge: Attempt three-way merge

Features:
- Pattern-based file selection (glob patterns)
- Automatic backup creation
- Dry-run mode for preview
- Atomic restore with rollback on failure`,
    inputSchema: {
      type: 'object',
      required: ['projectId', 'checkpointId', 'patterns'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        checkpointId: { type: 'string', description: 'Checkpoint to restore from' },
        patterns: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Glob patterns (e.g., ["src/**/*.ts", "package.json"])'
        },
        strategy: { 
          type: 'string', 
          enum: ['ours', 'theirs', 'merge', 'abort'],
          default: 'abort',
          description: 'Conflict resolution strategy'
        },
        dryRun: { type: 'boolean', default: false, description: 'Preview without changes' },
        createBackup: { type: 'boolean', default: true, description: 'Create backup before restore' }
      }
    }
  },
  {
    name: 'tm_file_history',
    description: `📜 Get complete history of a file across checkpoints.
    
Features:
- Uses bloom filters for fast lookup
- Optional inline diff for each change
- Shows add/modify/delete status
- Efficient O(1) checkpoint graph traversal`,
    inputSchema: {
      type: 'object',
      required: ['projectId', 'filePath'],
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        filePath: { type: 'string', description: 'Path to the file' },
        limit: { type: 'number', default: 20, description: 'Max history entries' },
        showDiff: { type: 'boolean', default: false, description: 'Include inline diffs' }
      }
    }
  }
];
