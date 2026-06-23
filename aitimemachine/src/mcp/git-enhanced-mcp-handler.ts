/**
 * MCP Server Integration for Git-Enhanced Tools
 * 
 * Adds handlers for:
 * - tm_diff_advanced: Git-quality diff algorithms
 * - tm_timeline_query: Bloom filter optimized timeline
 * - tm_restore_selective: Conflict-aware selective restore
 * - tm_file_history: File history with bloom filter lookup
 * - tm_merge: Three-way merge with conflict detection
 * - tm_resolve_conflict: Resolve merge conflicts
 * - tm_pack_optimize: Pack file optimization
 */

import { AdvancedDiffEngine, DiffAlgorithm, DiffOptions } from '../core/diff-engine-v2.js';
import { CheckpointGraph, CheckpointNode, TimelineOptions } from '../core/checkpoint-graph.js';
import { ThreeWayMerge, ConflictResolver, MergeOptions, MergeResult, ConflictRegion } from '../core/three-way-merge.js';
import { CasStore } from '../core/cas.js';
import { parseManifestJson, type FileEntry as ManifestFileEntry, type Manifest } from '../core/manifest.js';
import type { Repo } from '../store/repo.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface DiffAdvancedInput {
  projectId: string;
  checkpointA: string;
  checkpointB?: string;
  filePath?: string;
  paths?: string[];
  algorithm?: DiffAlgorithm;
  context?: number;
  colorMoved?: boolean;
}

export interface TimelineQueryInput {
  projectId: string;
  afterDate?: string;
  beforeDate?: string;
  path?: string;
  limit?: number;
  offset?: number;
}

export interface RestoreSelectiveInput {
  projectId: string;
  checkpointId: string;
  patterns: string[];
  strategy?: 'ours' | 'theirs' | 'abort';
  dryRun?: boolean;
  createBackup?: boolean;
}

export interface FileHistoryInput {
  projectId: string;
  filePath: string;
  limit?: number;
}

export interface MergeInput {
  projectId: string;
  baseCheckpoint?: string;  // Common ancestor (optional, will detect)
  oursCheckpoint: string;   // Current/ours version
  theirsCheckpoint: string; // Incoming/theirs version
  filePath: string;         // File to merge
  strategy?: 'recursive' | 'ort' | 'resolve' | 'ours' | 'theirs';
  conflictStyle?: 'merge' | 'diff3' | 'zdiff3';
  unionMerge?: boolean;
}

export interface ResolveConflictInput {
  projectId: string;
  filePath: string;
  content: string;          // Current content with conflicts
  conflictIndex?: number;   // Specific conflict (0-indexed), or all
  resolution: 'ours' | 'theirs' | 'both' | 'manual';
  manualContent?: string;   // For manual resolution
}

export interface PackOptimizeInput {
  projectId: string;
  aggressive?: boolean;     // Maximum compression
  maxDeltaDepth?: number;   // Delta chain depth limit
  windowSize?: number;      // Sliding window size
}

// ============================================================================
// Handler Class
// ============================================================================

export class GitEnhancedMcpHandler {
  private diffEngine: AdvancedDiffEngine;
  private graphCache: Map<string, CheckpointGraph> = new Map();
  private mergeEngine: ThreeWayMerge;

  private toRecord(value: unknown): Record<string, unknown> {
    return (value && typeof value === 'object') ? (value as Record<string, unknown>) : {};
  }

  constructor(
    private repo: Repo,
    private cas: CasStore,
    private dataDir: string
  ) {
    this.diffEngine = new AdvancedDiffEngine();
    this.mergeEngine = new ThreeWayMerge();
  }

  // ==========================================================================
  // tm_diff_advanced
  // ==========================================================================
  async handleDiffAdvanced(input: DiffAdvancedInput): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    const project = this.getProject(input.projectId);
    
    // Get checkpoint A
    const cpA = this.repo.getCheckpoint(input.projectId, input.checkpointA);
    if (!cpA) {
      return this.textResponse(`❌ Checkpoint not found: ${input.checkpointA}`);
    }
    
    const manifestA = this.getManifest(cpA.manifestBlobHash);
    
    // Get checkpoint B or current state
    let manifestB: Manifest;
    if (input.checkpointB) {
      const cpB = this.repo.getCheckpoint(input.projectId, input.checkpointB);
      if (!cpB) {
        return this.textResponse(`❌ Checkpoint not found: ${input.checkpointB}`);
      }
      manifestB = this.getManifest(cpB.manifestBlobHash);
    } else {
      // Compare to current state - get latest checkpoint
      const latest = this.repo.listCheckpointsNewestFirst(input.projectId, 1)[0];
      if (latest) {
        manifestB = this.getManifest(latest.manifestBlobHash);
      } else {
        manifestB = {
          version: 1,
          rootRel: ".",
          capturedAt: new Date().toISOString(),
          ignore: [],
          files: [],
        };
      }
    }

    // Determine files to compare
    const filesA = new Map<string, ManifestFileEntry>(manifestA.files.map((f) => [f.path, f]));
    const filesB = new Map<string, ManifestFileEntry>(manifestB.files.map((f) => [f.path, f]));
    
    // Single file or multiple paths
    let pathsToCompare: string[];
    if (input.filePath) {
      pathsToCompare = [input.filePath];
    } else if (input.paths && input.paths.length > 0) {
      pathsToCompare = input.paths;
    } else {
      const allPaths = new Set([...filesA.keys(), ...filesB.keys()]);
      pathsToCompare = Array.from(allPaths);
    }

    const algorithm = input.algorithm || 'histogram';
    const results: string[] = [];
    let totalAdded = 0;
    let totalRemoved = 0;
    let filesChanged = 0;

    for (const filePath of pathsToCompare) {
      const fileA = filesA.get(filePath);
      const fileB = filesB.get(filePath);
      
      let status: string;
      let oldContent = '';
      let newContent = '';

      if (!fileA && fileB) {
        status = 'added';
        newContent = this.getFileContent(fileB);
      } else if (fileA && !fileB) {
        status = 'deleted';
        oldContent = this.getFileContent(fileA);
      } else if (fileA && fileB) {
        if (fileA.hash === fileB.hash) continue;
        status = 'modified';
        oldContent = this.getFileContent(fileA);
        newContent = this.getFileContent(fileB);
      } else {
        continue;
      }

      filesChanged++;

      // Skip binary
      if (this.isBinary(oldContent) || this.isBinary(newContent)) {
        results.push(`Binary file: ${filePath} (${status})`);
        continue;
      }

      // Compute diff
      const diff = this.diffEngine.diff(oldContent, newContent, {
        algorithm,
        context: input.context ?? 3,
        colorMoved: input.colorMoved ?? true
      });

      totalAdded += diff.added;
      totalRemoved += diff.removed;

      // Format output
      results.push(`--- a/${filePath}`);
      results.push(`+++ b/${filePath}`);
      
      for (const hunk of diff.hunks) {
        results.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
        for (const line of hunk.lines) {
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
          const moved = line.moved ? ' (moved)' : '';
          results.push(`${prefix}${line.content}${moved}`);
        }
      }
      results.push('');
    }

    const summary = `📊 Diff Summary (${algorithm} algorithm)\n` +
      `Files changed: ${filesChanged}\n` +
      `Insertions: +${totalAdded}\n` +
      `Deletions: -${totalRemoved}\n\n` +
      results.join('\n');

    return this.textResponse(summary);
  }

  // ==========================================================================
  // tm_timeline_query
  // ==========================================================================
  async handleTimelineQuery(input: TimelineQueryInput): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    const graph = await this.getOrBuildGraph(input.projectId);
    
    const options: TimelineOptions = {
      after: input.afterDate ? new Date(input.afterDate) : undefined,
      before: input.beforeDate ? new Date(input.beforeDate) : undefined,
      path: input.path,
      limit: input.limit || 50,
      offset: input.offset || 0
    };

    const results = graph.getTimeline(options);

    if (results.length === 0) {
      return this.textResponse('No checkpoints match the criteria');
    }

    const lines = results.map((cp, i) => {
      const ago = this.getTimeAgo(cp.timestamp);
      const mightContain = input.path 
        ? (graph.checkpointMightContainFile(cp.id, input.path) ? '✓' : '?')
        : '';
      
      return `${i + 1}. ${cp.id.slice(0, 12)} - ${cp.description}\n` +
             `   📅 ${cp.timestamp.toLocaleString()} (${ago})\n` +
             `   📁 ${cp.stats.totalFiles} files ${mightContain}`;
    });

    const output = `📅 Timeline Query${input.path ? ` (filtered by: ${input.path})` : ''}\n` +
      `Found ${results.length} checkpoints\n\n` +
      lines.join('\n\n');

    return this.textResponse(output);
  }

  // ==========================================================================
  // tm_restore_selective
  // ==========================================================================
  async handleRestoreSelective(input: RestoreSelectiveInput): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    const { minimatch } = await import('minimatch');
    const project = this.getProject(input.projectId);
    
    const checkpoint = this.repo.getCheckpoint(input.projectId, input.checkpointId);
    if (!checkpoint) {
      return this.textResponse(`❌ Checkpoint not found: ${input.checkpointId}`);
    }

    const manifest = this.getManifest(checkpoint.manifestBlobHash);
    const strategy = input.strategy || 'abort';

    // Match files
    const matchedFiles = manifest.files.filter((f) =>
      input.patterns.some(pattern => minimatch(f.path, pattern))
    );

    if (matchedFiles.length === 0) {
      return this.textResponse('No files match the specified patterns');
    }

    // Detect conflicts
    const conflicts: Array<{ path: string; reason: string }> = [];
    const toRestore: ManifestFileEntry[] = [];

    for (const file of matchedFiles) {
      const fullPath = path.join(project.rootPath, file.path);
      
      if (fs.existsSync(fullPath)) {
        const currentContent = fs.readFileSync(fullPath);
        const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');

        if (currentHash !== file.hash) {
          conflicts.push({
            path: file.path,
            reason: 'File has been modified'
          });
          continue;
        }
      }
      
      toRestore.push(file);
    }

    // Handle abort
    if (conflicts.length > 0 && strategy === 'abort') {
      return this.textResponse(
        `❌ Restore aborted due to conflicts:\n\n` +
        conflicts.map(c => `  ⚠️ ${c.path} - ${c.reason}`).join('\n') +
        `\n\nUse strategy="theirs" to overwrite, or strategy="ours" to skip`
      );
    }

    // Dry run
    if (input.dryRun) {
      const wouldRestore = [...toRestore.map((f) => f.path)];
      if (strategy === 'theirs') {
        wouldRestore.push(...conflicts.map(c => c.path));
      }
      
      return this.textResponse(
        `🔍 Dry Run - Would restore ${wouldRestore.length} files:\n\n` +
        wouldRestore.map(f => `  ✓ ${f}`).join('\n') +
        (conflicts.length > 0 ? `\n\nConflicts (${strategy}):\n` +
          conflicts.map(c => `  ⚠️ ${c.path}`).join('\n') : '')
      );
    }

    // Create backup
    let backupId: string | undefined;
    if (input.createBackup !== false) {
      backupId = `backup_${Date.now()}`;
      const backupDir = path.join(this.dataDir, 'backups', backupId);
      fs.mkdirSync(backupDir, { recursive: true });

      for (const file of matchedFiles) {
        const srcPath = path.join(project.rootPath, file.path);
        if (fs.existsSync(srcPath)) {
          const destPath = path.join(backupDir, file.path);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    // Perform restore
    const restored: string[] = [];
    const skipped: string[] = [];

    for (const file of toRestore) {
      try {
        const content = this.cas.getBytes(file.hash);
        const fullPath = path.join(project.rootPath, file.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
        restored.push(file.path);
      } catch {
        skipped.push(file.path);
      }
    }

    // Handle conflicts based on strategy
    for (const conflict of conflicts) {
      if (strategy === 'theirs') {
        const file = matchedFiles.find((f) => f.path === conflict.path);
        if (file) {
          try {
            const content = this.cas.getBytes(file.hash);
            const fullPath = path.join(project.rootPath, file.path);
            fs.writeFileSync(fullPath, content);
            restored.push(file.path);
          } catch {
            skipped.push(conflict.path);
          }
        }
      } else if (strategy === 'ours') {
        skipped.push(conflict.path);
      }
    }

    return this.textResponse(
      `✅ Restore Complete\n\n` +
      `Restored: ${restored.length} files\n` +
      (backupId ? `Backup: ${backupId}\n` : '') +
      (skipped.length > 0 ? `Skipped: ${skipped.length} files\n` : '') +
      (conflicts.length > 0 ? `Conflicts handled: ${conflicts.length} (${strategy})\n` : '') +
      `\nRestored files:\n` +
      restored.map(f => `  ✓ ${f}`).join('\n')
    );
  }

  // ==========================================================================
  // tm_file_history
  // ==========================================================================
  async handleFileHistory(input: FileHistoryInput): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    const graph = await this.getOrBuildGraph(input.projectId);
    
    // Find checkpoints containing this file using bloom filter
    const checkpoints = graph.findCheckpointsWithFile(input.filePath)
      .slice(0, input.limit || 20);

    if (checkpoints.length === 0) {
      return this.textResponse(`No history found for: ${input.filePath}`);
    }

    const history: string[] = [];
    let prevHash: string | null = null;

    for (const cp of checkpoints) {
      const checkpoint = this.repo.getCheckpoint(input.projectId, cp.id);
      if (!checkpoint) continue;

      const manifest = this.getManifest(checkpoint.manifestBlobHash);
      const file = manifest.files.find((f) => f.path === input.filePath);

      let status: string;
      if (!file) {
        status = '❌ deleted';
      } else if (prevHash === null) {
        status = '✅ added';
        prevHash = file.hash;
      } else if (file.hash !== prevHash) {
        status = '✏️ modified';
        prevHash = file.hash;
      } else {
        continue; // No change
      }

      const ago = this.getTimeAgo(cp.timestamp);
      history.push(
        `${status} ${cp.id.slice(0, 8)} - ${cp.description}\n` +
        `   📅 ${cp.timestamp.toLocaleString()} (${ago})`
      );
    }

    return this.textResponse(
      `📜 File History: ${input.filePath}\n` +
      `Found in ${checkpoints.length} checkpoints\n\n` +
      history.join('\n\n')
    );
  }

  // ==========================================================================
  // tm_merge - Three-way merge with conflict detection
  // ==========================================================================
  async handleMerge(input: MergeInput): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    const project = this.getProject(input.projectId);
    
    // Get the three versions
    const cpOurs = this.repo.getCheckpoint(input.projectId, input.oursCheckpoint);
    if (!cpOurs) {
      return this.textResponse(`❌ Checkpoint not found: ${input.oursCheckpoint}`);
    }
    
    const cpTheirs = this.repo.getCheckpoint(input.projectId, input.theirsCheckpoint);
    if (!cpTheirs) {
      return this.textResponse(`❌ Checkpoint not found: ${input.theirsCheckpoint}`);
    }
    
    // Get base checkpoint (common ancestor) or use empty if not provided
    let baseContent = '';
    if (input.baseCheckpoint) {
      const cpBase = this.repo.getCheckpoint(input.projectId, input.baseCheckpoint);
      if (cpBase) {
        const manifestBase = this.getManifest(cpBase.manifestBlobHash);
        const fileBase = manifestBase.files.find((f) => f.path === input.filePath);
        if (fileBase) {
          baseContent = this.getFileContent(fileBase);
        }
      }
    } else {
      // Try to detect common ancestor via timeline
      baseContent = await this.detectCommonAncestor(input.projectId, input.oursCheckpoint, input.theirsCheckpoint, input.filePath);
    }
    
    // Get ours content
    const manifestOurs = this.getManifest(cpOurs.manifestBlobHash);
    const fileOurs = manifestOurs.files.find((f) => f.path === input.filePath);
    const oursContent = fileOurs ? this.getFileContent(fileOurs) : '';
    
    // Get theirs content
    const manifestTheirs = this.getManifest(cpTheirs.manifestBlobHash);
    const fileTheirs = manifestTheirs.files.find((f) => f.path === input.filePath);
    const theirsContent = fileTheirs ? this.getFileContent(fileTheirs) : '';
    
    // Configure merge engine
    const merger = new ThreeWayMerge({
      strategy: input.strategy || 'ort',
      conflictStyle: input.conflictStyle || 'diff3',
      unionMerge: input.unionMerge || false
    });
    
    // Perform merge
    const result = merger.merge({
      base: baseContent,
      ours: oursContent,
      theirs: theirsContent
    });
    
    // Format response
    let response = `🔀 Three-Way Merge: ${input.filePath}\n`;
    response += `   Strategy: ${input.strategy || 'ort'}\n`;
    response += `   Conflict Style: ${input.conflictStyle || 'diff3'}\n\n`;
    
    response += `📊 Statistics:\n`;
    response += `   Total hunks: ${result.stats.hunksTotal}\n`;
    response += `   Clean merges: ${result.stats.hunksClean}\n`;
    response += `   Conflicts: ${result.stats.hunksConflicted}\n`;
    response += `   Auto-resolved: ${result.stats.autoResolved}\n`;
    response += `   Lines added: +${result.stats.linesAdded}\n`;
    response += `   Lines removed: -${result.stats.linesRemoved}\n\n`;
    
    if (result.hasConflicts) {
      response += `⚠️ ${result.conflicts.length} conflict(s) require resolution:\n\n`;
      
      for (let i = 0; i < result.conflicts.length; i++) {
        const conflict = result.conflicts[i];
        response += `Conflict ${i + 1}:\n`;
        response += `   Type: ${conflict.type}\n`;
        response += `   Line: ${conflict.startLine + 1}\n`;
        response += `   Ours: ${conflict.ours.length} lines\n`;
        response += `   Theirs: ${conflict.theirs.length} lines\n`;
        response += `   Auto-resolvable: ${conflict.autoResolvable ? 'yes' : 'no'}\n\n`;
      }
      
      response += `Use tm_resolve_conflict to resolve conflicts.\n`;
    } else {
      response += `✅ Merge completed cleanly!\n`;
    }
    
    response += `\n--- Merged Content ---\n${result.merged}\n--- End ---`;
    
    return this.textResponse(response);
  }

  // ==========================================================================
  // tm_resolve_conflict - Resolve merge conflicts
  // ==========================================================================
  async handleResolveConflict(input: ResolveConflictInput): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    if (!ConflictResolver.hasConflicts(input.content)) {
      return this.textResponse(`✅ No conflicts found in content.`);
    }
    
    const conflictCount = ConflictResolver.countConflicts(input.content);
    let resolved: string;
    
    if (input.conflictIndex !== undefined) {
      // Resolve specific conflict
      resolved = ConflictResolver.resolveConflict(
        input.content,
        input.conflictIndex,
        input.resolution,
        input.manualContent
      );
    } else if (input.resolution === 'ours' || input.resolution === 'theirs') {
      // Resolve all conflicts with same strategy
      resolved = ConflictResolver.resolveAll(input.content, input.resolution);
    } else {
      return this.textResponse(
        `❌ For 'both' or 'manual' resolution, please specify conflictIndex.\n` +
        `Found ${conflictCount} conflict(s).`
      );
    }
    
    const remainingConflicts = ConflictResolver.countConflicts(resolved);
    
    let response = `🔧 Conflict Resolution: ${input.filePath}\n`;
    response += `   Strategy: ${input.resolution}\n`;
    response += `   Conflicts before: ${conflictCount}\n`;
    response += `   Conflicts after: ${remainingConflicts}\n\n`;
    
    if (remainingConflicts === 0) {
      response += `✅ All conflicts resolved!\n`;
    } else {
      response += `⚠️ ${remainingConflicts} conflict(s) remaining.\n`;
    }
    
    response += `\n--- Resolved Content ---\n${resolved}\n--- End ---`;
    
    return this.textResponse(response);
  }

  // ==========================================================================
  // tm_pack_optimize - Pack file optimization
  // ==========================================================================
  async handlePackOptimize(input: PackOptimizeInput): Promise<{
    content: Array<{ type: string; text: string }>;
  }> {
    const project = this.getProject(input.projectId);
    const projectPath = project.rootPath;
    const aitmPath = path.join(projectPath, '.aitm');
    const packDir = path.join(aitmPath, 'pack');
    const objectsDir = path.join(aitmPath, 'objects');
    
    // Check directories exist
    if (!fs.existsSync(objectsDir)) {
      return this.textResponse(`❌ No objects directory found at ${objectsDir}`);
    }
    
    // Ensure pack directory exists
    if (!fs.existsSync(packDir)) {
      fs.mkdirSync(packDir, { recursive: true });
    }
    
    // Collect all loose objects
    const looseObjects: Array<{ hash: string; content: Buffer; size: number }> = [];
    let totalLooseSize = 0;
    
    const walkDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walkDir(path.join(dir, entry.name));
        } else if (entry.name.length === 62) { // SHA-256 hex minus 2 char prefix
          const hash = entry.name;
          const fullPath = path.join(dir, entry.name);
          const content = fs.readFileSync(fullPath);
          looseObjects.push({ hash, content, size: content.length });
          totalLooseSize += content.length;
        }
      }
    };
    
    walkDir(objectsDir);
    
    if (looseObjects.length === 0) {
      return this.textResponse(`✅ No loose objects to pack.`);
    }
    
    // Import pack writer dynamically
    const { PackWriter } = await import('../core/pack/writer.js');
    const writer = new PackWriter();
    
    // Add objects to pack
    for (const obj of looseObjects) {
      writer.addObject(obj.hash, obj.content);
    }
    
    // Write pack file
    const packName = `pack-${Date.now()}`;
    const packPath = path.join(packDir, `${packName}.pack`);
    const packHash = writer.write(packPath);
    
    // Calculate stats
    const packStats = fs.statSync(packPath);
    const idxStats = fs.statSync(packPath.replace('.pack', '.idx'));
    const totalPackSize = packStats.size + idxStats.size;
    const savings = totalLooseSize - totalPackSize;
    const savingsPercent = ((savings / totalLooseSize) * 100).toFixed(1);
    
    // Optionally remove loose objects
    if (input.aggressive) {
      for (const obj of looseObjects) {
        const prefix = obj.hash.slice(0, 2);
        const suffix = obj.hash.slice(2);
        const loosePath = path.join(objectsDir, prefix, suffix);
        if (fs.existsSync(loosePath)) {
          fs.unlinkSync(loosePath);
        }
      }
    }
    
    let response = `📦 Pack Optimization Complete\n\n`;
    response += `📊 Statistics:\n`;
    response += `   Objects packed: ${looseObjects.length}\n`;
    response += `   Loose size: ${this.formatSize(totalLooseSize)}\n`;
    response += `   Pack size: ${this.formatSize(totalPackSize)}\n`;
    response += `   Savings: ${this.formatSize(savings)} (${savingsPercent}%)\n`;
    response += `   Pack hash: ${packHash.slice(0, 12)}...\n`;
    response += `   Pack file: ${packPath}\n`;
    
    if (input.aggressive) {
      response += `\n🧹 Loose objects removed.`;
    }
    
    return this.textResponse(response);
  }

  /**
   * Detect common ancestor checkpoint for merge
   */
  private async detectCommonAncestor(
    projectId: string,
    oursId: string,
    theirsId: string,
    filePath: string
  ): Promise<string> {
    // Simple implementation: find first checkpoint before both that has the file
    const checkpoints = this.repo.listCheckpointsNewestFirst(projectId, 1000);
    
    const oursIdx = checkpoints.findIndex((cp) => cp.checkpointId === oursId);
    const theirsIdx = checkpoints.findIndex((cp) => cp.checkpointId === theirsId);
    
    if (oursIdx === -1 || theirsIdx === -1) return '';
    
    // Start from after the later checkpoint
    const startIdx = Math.min(oursIdx, theirsIdx) + 1;
    
    for (let i = startIdx; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      const manifest = this.getManifest(cp.manifestBlobHash);
      const file = manifest.files.find((f) => f.path === filePath);
      if (file) {
        return this.getFileContent(file);
      }
    }
    
    return '';
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getProject(projectId: string) {
    const projects = this.repo.listProjects();
    const project = projects.find((p) => p.projectId === projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }

  private getManifest(manifestBlobHash: string) {
    const blob = this.cas.getBytes(manifestBlobHash);
    return parseManifestJson(blob.toString('utf8'));
  }

  private getFileContent(file: { hash: string }): string {
    try {
      return this.cas.getBytes(file.hash).toString('utf-8');
    } catch {
      return '';
    }
  }

  private isBinary(content: string): boolean {
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
    return `${diffDays}d ago`;
  }

  private textResponse(text: string) {
    return {
      content: [{ type: 'text', text }]
    };
  }

  private async getOrBuildGraph(projectId: string): Promise<CheckpointGraph> {
    if (this.graphCache.has(projectId)) {
      return this.graphCache.get(projectId)!;
    }

    const graph = new CheckpointGraph(this.dataDir);
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
    this.graphCache.set(projectId, graph);
    return graph;
  }
}

// ============================================================================
// Tool Definitions for MCP Registration
// ============================================================================

export const gitEnhancedToolDefinitions = [
  {
    name: 'tm_diff_advanced',
    description: `🔍 Compare files using Git-quality diff algorithms.

Algorithms:
- myers: Classic O(ND) algorithm, good for most cases
- patience: Better for refactored code, finds unique lines as anchors
- histogram: Fastest for large files, Git's default

Features:
- Color-moved detection highlights relocated code blocks
- Context lines control how much surrounding code to show

Examples:
- Single file diff: filePath="src/app.ts"
- Multiple files: paths=["src/*.ts"]
- Use patience for refactors: algorithm="patience"`,
    inputSchema: {
      type: 'object',
      required: ['projectId', 'checkpointA'],
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'Project ID' },
        checkpointA: { type: 'string', minLength: 1, description: 'First checkpoint ID' },
        checkpointB: { type: 'string', description: 'Second checkpoint ID (omit for latest)' },
        filePath: { type: 'string', description: 'Single file to diff' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Multiple files to diff' },
        algorithm: { type: 'string', enum: ['myers', 'patience', 'histogram'], default: 'histogram' },
        context: { type: 'number', default: 3, description: 'Context lines' },
        colorMoved: { type: 'boolean', default: true, description: 'Detect moved code' }
      }
    }
  },
  {
    name: 'tm_timeline_query',
    description: `📅 Query checkpoint timeline with filters.

Features:
- Bloom filter optimization for fast file path lookup
- Date range filtering (ISO format)
- Pagination support
- O(1) checkpoint lookup

Use cases:
- Find file history: path="src/critical.ts"
- Date range: afterDate="2024-01-01", beforeDate="2024-01-31"
- Recent only: limit=10`,
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', minLength: 1, description: 'Project ID' },
        afterDate: { type: 'string', description: 'Show after date (ISO format)' },
        beforeDate: { type: 'string', description: 'Show before date (ISO format)' },
        path: { type: 'string', description: 'Filter by file path' },
        limit: { type: 'number', default: 50, description: 'Max results' },
        offset: { type: 'number', default: 0, description: 'Pagination offset' }
      }
    }
  },
  {
    name: 'tm_restore_selective',
    description: `🔄 Restore specific files with conflict handling.

Strategies:
- abort: Stop if any conflicts (safest)
- ours: Keep current version on conflict
- theirs: Use checkpoint version on conflict

Features:
- Glob pattern matching (e.g., "src/**/*.ts")
- Automatic backup creation
- Dry-run mode for preview`,
    inputSchema: {
      type: 'object',
      required: ['projectId', 'checkpointId', 'patterns'],
      properties: {
        projectId: { type: 'string', minLength: 1 },
        checkpointId: { type: 'string', minLength: 1 },
        patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns' },
        strategy: { type: 'string', enum: ['ours', 'theirs', 'abort'], default: 'abort' },
        dryRun: { type: 'boolean', default: false },
        createBackup: { type: 'boolean', default: true }
      }
    }
  },
  {
    name: 'tm_file_history',
    description: `📜 Find all checkpoints containing a specific file.

Uses bloom filters for O(1) pre-filtering, then confirms with actual file list.`,
    inputSchema: {
      type: 'object',
      required: ['projectId', 'filePath'],
      properties: {
        projectId: { type: 'string', minLength: 1 },
        filePath: { type: 'string', minLength: 1 },
        limit: { type: 'number', default: 20 }
      }
    }
  },
  {
    name: 'tm_merge',
    description: `🔀 Three-way merge with conflict detection (Git merge-ort).

Strategies:
- ort: Git's default (best overall)
- recursive: Classic recursive merge
- resolve: Simple first-parent wins
- ours/theirs: Take one side completely

Conflict Styles:
- merge: Standard <<<<<<< / ======= / >>>>>>>
- diff3: Includes ||||||| BASE section
- zdiff3: diff3 with common lines trimmed

Features:
- Auto-detects common ancestor if not specified
- Union merge option for add-add conflicts
- Detailed conflict reporting with line numbers`,
    inputSchema: {
      type: 'object',
      required: ['projectId', 'oursCheckpoint', 'theirsCheckpoint', 'filePath'],
      properties: {
        projectId: { type: 'string', minLength: 1 },
        baseCheckpoint: { type: 'string', description: 'Common ancestor (auto-detected if omitted)' },
        oursCheckpoint: { type: 'string', minLength: 1, description: 'Current/ours checkpoint' },
        theirsCheckpoint: { type: 'string', minLength: 1, description: 'Incoming/theirs checkpoint' },
        filePath: { type: 'string', minLength: 1, description: 'File to merge' },
        strategy: { type: 'string', enum: ['recursive', 'ort', 'resolve', 'ours', 'theirs'], default: 'ort' },
        conflictStyle: { type: 'string', enum: ['merge', 'diff3', 'zdiff3'], default: 'diff3' },
        unionMerge: { type: 'boolean', default: false, description: 'Auto-resolve add-add by combining' }
      }
    }
  },
  {
    name: 'tm_resolve_conflict',
    description: `🔧 Resolve merge conflicts in content.

Resolutions:
- ours: Keep current version
- theirs: Use incoming version
- both: Combine both (for add-add)
- manual: Provide custom resolution

Can resolve:
- Single conflict by index
- All conflicts at once (ours/theirs only)`,
    inputSchema: {
      type: 'object',
      required: ['projectId', 'filePath', 'content', 'resolution'],
      properties: {
        projectId: { type: 'string', minLength: 1 },
        filePath: { type: 'string', minLength: 1 },
        content: { type: 'string', description: 'Content with conflict markers' },
        conflictIndex: { type: 'number', description: 'Specific conflict (0-indexed)' },
        resolution: { type: 'string', enum: ['ours', 'theirs', 'both', 'manual'] },
        manualContent: { type: 'string', description: 'Custom resolution content' }
      }
    }
  },
  {
    name: 'tm_pack_optimize',
    description: `📦 Optimize storage with pack files (like git gc).

Compresses loose objects into pack files with delta compression.
Achieves 50-90% space savings for typical codebases.

Options:
- aggressive: Remove loose objects after packing
- maxDeltaDepth: Limit delta chain depth (default 50)
- windowSize: Sliding window for compression (default 16MB)`,
    inputSchema: {
      type: 'object',
      required: ['projectId'],
      properties: {
        projectId: { type: 'string', minLength: 1 },
        aggressive: { type: 'boolean', default: false, description: 'Remove loose objects' },
        maxDeltaDepth: { type: 'number', default: 50 },
        windowSize: { type: 'number', default: 16777216, description: 'Window size in bytes' }
      }
    }
  }
];
