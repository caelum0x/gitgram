#!/usr/bin/env node
/**
 * Git-Enhanced CLI Commands
 * 
 * Commands using Git-quality algorithms:
 * - aitm diff --algorithm histogram
 * - aitm timeline --path src/app.ts
 * - aitm restore --selective --strategy merge
 * - aitm history <file>
 * - aitm merge --ours cp1 --theirs cp2 <file>
 * - aitm resolve --strategy ours <file>
 */

import { Command } from 'commander';
import { AdvancedDiffEngine, DiffAlgorithm } from '../core/diff-engine-v2.js';
import { CheckpointGraph } from '../core/checkpoint-graph.js';
import { ThreeWayMerge, ConflictResolver, MergeOptions } from '../core/three-way-merge.js';
import { TimeMachineEngine } from '../core/engine.js';
import type { FileEntry as TimePointFileEntry } from '../core/types.js';
import * as fs from 'fs';
import * as path from 'path';

// ANSI color codes
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Register Git-enhanced commands on a Commander program
 */
export function registerGitEnhancedCommands(program: Command): void {
  
  // =========================================================================
  // DIFF-ADVANCED - Advanced diff with algorithm selection
  // =========================================================================
  program
    .command('diff-advanced')
    .description('Show changes between checkpoints using Git-quality diff algorithms')
    .argument('[checkpoint1]', 'First checkpoint (default: previous)')
    .argument('[checkpoint2]', 'Second checkpoint (default: current)')
    .option('-a, --algorithm <alg>', 'Diff algorithm: myers, patience, histogram', 'histogram')
    .option('-c, --context <n>', 'Context lines', '3')
    .option('--color-moved', 'Highlight moved lines', true)
    .option('--stat', 'Show diffstat summary only')
    .option('--name-only', 'Show only changed file names')
    .option('--name-status', 'Show file names with status (A/M/D)')
    .option('-p, --path <pattern>', 'Filter by path pattern')
    .option('--no-color', 'Disable color output')
    .action(async (checkpoint1, checkpoint2, options) => {
      const engine = new TimeMachineEngine(process.cwd());
      const diffEngine = new AdvancedDiffEngine();
      
      // Get checkpoints
      const list = engine.listTimePoints();
      if (list.length === 0) {
        console.error('No checkpoints found. Run: aitm checkpoint "Initial"');
        process.exit(1);
      }
      
      const cp1 = checkpoint1 
        ? list.find(tp => tp.id.startsWith(checkpoint1))
        : list[list.length - 2];
      
      const cp2 = checkpoint2
        ? list.find(tp => tp.id.startsWith(checkpoint2))
        : list[list.length - 1];
      
      if (!cp1) {
        console.error(`Checkpoint not found: ${checkpoint1 || 'previous'}`);
        process.exit(1);
      }
      
      const tp1 = engine.getTimePoint(cp1.id);
      const tp2 = cp2 ? engine.getTimePoint(cp2.id) : null;
      
      if (!tp1) {
        console.error('Could not load checkpoint');
        process.exit(1);
      }

      // Build file maps
      const filesA = new Map<string, TimePointFileEntry>(tp1.files.map((f) => [f.path, f]));
      const filesB = tp2 
        ? new Map<string, TimePointFileEntry>(tp2.files.map((f) => [f.path, f]))
        : await scanCurrentFiles(process.cwd());
      
      // Determine which files to compare
      const allPaths = new Set([...filesA.keys(), ...filesB.keys()]);
      const pathsToCompare = options.path
        ? Array.from(allPaths).filter(p => p.includes(options.path))
        : Array.from(allPaths);
      
      const algorithm = options.algorithm as DiffAlgorithm;
      let totalAdded = 0;
      let totalRemoved = 0;
      let filesChanged = 0;
      
      const statLines: string[] = [];
      const nameLines: string[] = [];

      for (const filePath of pathsToCompare) {
        const fileA = filesA.get(filePath);
        const fileB = filesB.get(filePath);
        
        // Determine status
        let status: 'A' | 'M' | 'D';
        let oldContent = '';
        let newContent = '';
        
        if (!fileA && fileB) {
          status = 'A';
          newContent = await getFileContent(engine, fileB, cp2?.id);
        } else if (fileA && !fileB) {
          status = 'D';
          oldContent = await getFileContent(engine, fileA, cp1.id);
        } else if (fileA && fileB) {
          if (fileA.hash === fileB.hash) continue;
          status = 'M';
          oldContent = await getFileContent(engine, fileA, cp1.id);
          newContent = await getFileContent(engine, fileB, cp2?.id);
        } else {
          continue;
        }
        
        filesChanged++;
        
        // Skip binary files
        if (isBinary(oldContent) || isBinary(newContent)) {
          if (options.nameOnly || options.nameStatus) {
            nameLines.push(options.nameStatus ? `${status}\t${filePath}` : filePath);
          } else if (options.stat) {
            statLines.push(`${filePath} | Binary`);
          }
          continue;
        }
        
        // Compute diff
        const diff = diffEngine.diff(oldContent, newContent, {
          algorithm,
          context: parseInt(options.context),
          colorMoved: options.colorMoved
        });
        
        totalAdded += diff.added;
        totalRemoved += diff.removed;
        
        // Output based on format
        if (options.nameOnly) {
          nameLines.push(filePath);
        } else if (options.nameStatus) {
          nameLines.push(`${status}\t${filePath}`);
        } else if (options.stat) {
          const changes = diff.added + diff.removed;
          const plus = '+'.repeat(Math.min(diff.added, 25));
          const minus = '-'.repeat(Math.min(diff.removed, 25));
          statLines.push(`${filePath.padEnd(50)} | ${String(changes).padStart(4)} ${C.green}${plus}${C.red}${minus}${C.reset}`);
        } else {
          // Full unified diff
          const header = [
            `${C.bright}diff --aitm a/${filePath} b/${filePath}${C.reset}`,
            status === 'A' ? `${C.green}new file${C.reset}` : '',
            status === 'D' ? `${C.red}deleted file${C.reset}` : '',
            `--- ${status === 'A' ? '/dev/null' : `a/${filePath}`}`,
            `+++ ${status === 'D' ? '/dev/null' : `b/${filePath}`}`
          ].filter(Boolean).join('\n');
          
          console.log(header);
          
          for (const hunk of diff.hunks) {
            console.log(`${C.cyan}@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${C.reset}`);
            
            for (const line of hunk.lines) {
              let prefix: string;
              let color: string;
              
              switch (line.type) {
                case 'add':
                  prefix = '+';
                  color = line.moved ? C.cyan : C.green;
                  break;
                case 'remove':
                  prefix = '-';
                  color = line.moved ? C.magenta : C.red;
                  break;
                default:
                  prefix = ' ';
                  color = '';
              }
              
              if (options.color === false) {
                console.log(`${prefix}${line.content}`);
              } else {
                console.log(`${color}${prefix}${line.content}${C.reset}`);
              }
            }
          }
          console.log();
        }
      }
      
      // Print summary
      if (options.nameOnly || options.nameStatus) {
        console.log(nameLines.join('\n'));
      } else if (options.stat) {
        console.log(statLines.join('\n'));
        console.log(`\n${filesChanged} files changed, ${C.green}${totalAdded} insertions(+)${C.reset}, ${C.red}${totalRemoved} deletions(-)${C.reset}`);
      } else {
        console.log(`${C.dim}Algorithm: ${algorithm} | ${filesChanged} files changed, ${totalAdded} insertions(+), ${totalRemoved} deletions(-)${C.reset}`);
      }
    });

  // =========================================================================
  // TIMELINE-ADVANCED - Browse timeline with filters
  // =========================================================================
  program
    .command('timeline-advanced')
    .description('Browse checkpoint timeline with bloom filter optimization')
    .option('--after <date>', 'Show checkpoints after date (YYYY-MM-DD)')
    .option('--before <date>', 'Show checkpoints before date')
    .option('-p, --path <pattern>', 'Filter by file path (uses bloom filter)')
    .option('--graph', 'Show ASCII graph')
    .option('--oneline', 'Compact one-line format')
    .option('-n, --limit <n>', 'Limit results', '20')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      const engine = new TimeMachineEngine(process.cwd());
      const graph = new CheckpointGraph(path.join(process.cwd(), '.aitimemachine'));
      
      // Build graph from checkpoints
      const list = engine.listTimePoints();
      const nodes = list.map(tp => {
        const full = engine.getTimePoint(tp.id);
        return {
          id: tp.id,
          timestamp: tp.timestamp,
          description: tp.description,
          parentId: undefined,
          files: full?.files.map((f) => f.path) || [],
          stats: {
            totalFiles: tp.stats.totalFiles,
            totalSize: 0
          }
        };
      });
      
      await graph.build(nodes);
      
      // Query with filters
      const results = graph.getTimeline({
        after: options.after ? new Date(options.after) : undefined,
        before: options.before ? new Date(options.before) : undefined,
        path: options.path,
        limit: parseInt(options.limit)
      });
      
      if (options.json) {
        console.log(JSON.stringify(results.map(cp => ({
          id: cp.id,
          timestamp: cp.timestamp.toISOString(),
          description: cp.description,
          fileCount: cp.stats.totalFiles
        }))));
        return;
      }
      
      if (results.length === 0) {
        console.log('No checkpoints match the criteria');
        return;
      }
      
      if (options.oneline) {
        for (const cp of results) {
          const shortId = cp.id.slice(0, 8);
          const ago = getTimeAgo(cp.timestamp);
          console.log(`${C.yellow}${shortId}${C.reset} ${cp.description} ${C.dim}(${ago})${C.reset}`);
        }
        return;
      }
      
      if (options.graph) {
        console.log(`\n${C.bright}Timeline Graph${C.reset}\n`);
        for (let i = 0; i < results.length; i++) {
          const cp = results[i];
          const shortId = cp.id.slice(0, 8);
          const ago = getTimeAgo(cp.timestamp);
          const branch = i === 0 ? '◉' : '│';
          const connector = i === results.length - 1 ? '└' : '├';
          
          console.log(`${C.cyan}${branch}${C.reset} ${C.yellow}${shortId}${C.reset} - ${cp.description}`);
          console.log(`${C.cyan}${connector}─${C.reset} ${C.dim}${cp.timestamp.toLocaleString()} (${ago})${C.reset}`);
          if (i < results.length - 1) console.log(`${C.cyan}│${C.reset}`);
        }
        return;
      }
      
      // Detailed format
      console.log(`\n${C.bright}Timeline${C.reset}${options.path ? ` (filtered by: ${options.path})` : ''}\n`);
      
      for (const cp of results) {
        const shortId = cp.id.slice(0, 8);
        const ago = getTimeAgo(cp.timestamp);
        
        console.log(`${C.yellow}checkpoint ${shortId}${C.reset}`);
        console.log(`Date:  ${cp.timestamp.toLocaleString()} (${ago})`);
        console.log(`Files: ${cp.stats.totalFiles}`);
        console.log(`\n    ${cp.description}\n`);
      }
    });

  // =========================================================================
  // RESTORE-ADVANCED - Selective restore with conflict handling
  // =========================================================================
  program
    .command('restore-advanced <checkpoint>')
    .description('Restore files with 3-way merge conflict handling')
    .argument('[patterns...]', 'File patterns to restore (default: all)')
    .option('-s, --strategy <s>', 'Conflict strategy: ours, theirs, merge, abort', 'abort')
    .option('--dry-run', 'Preview without making changes')
    .option('--no-backup', 'Skip creating backup')
    .option('-f, --force', 'Force restore (same as --strategy theirs)')
    .option('-j, --json', 'Output as JSON')
    .action(async (checkpoint, patterns, options) => {
      const engine = new TimeMachineEngine(process.cwd());
      const { minimatch } = await import('minimatch');
      
      // Find checkpoint
      const list = engine.listTimePoints();
      const match = list.find(tp => tp.id.startsWith(checkpoint));
      
      if (!match) {
        console.error(`Checkpoint not found: ${checkpoint}`);
        process.exit(1);
      }
      
      const tp = engine.getTimePoint(match.id);
      if (!tp) {
        console.error('Could not load checkpoint');
        process.exit(1);
      }
      
      const strategy = options.force ? 'theirs' : options.strategy;
      const patternList = patterns.length > 0 ? patterns : ['**/*'];
      
      // Match files
      const matchedFiles = tp.files.filter((f) =>
        patternList.some((p: string) => minimatch(f.path, p))
      );
      
      if (matchedFiles.length === 0) {
        console.log('No files match the specified patterns');
        return;
      }
      
      // Detect conflicts
      const projectPath = process.cwd();
      const conflicts: Array<{ path: string; reason: string }> = [];
      const toRestore: TimePointFileEntry[] = [];
      
      for (const file of matchedFiles) {
        const fullPath = path.join(projectPath, file.path);
        
        if (fs.existsSync(fullPath)) {
          const currentContent = fs.readFileSync(fullPath);
          const crypto = await import('crypto');
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
      
      // Handle abort strategy
      if (conflicts.length > 0 && strategy === 'abort') {
        if (options.json) {
          console.log(JSON.stringify({ success: false, conflicts }));
        } else {
          console.error(`${C.red}Restore aborted due to conflicts:${C.reset}`);
          for (const c of conflicts) {
            console.error(`  ${C.yellow}!${C.reset} ${c.path} - ${c.reason}`);
          }
          console.error(`\nUse --strategy theirs to overwrite, or --strategy ours to skip`);
        }
        process.exit(1);
      }
      
      // Dry run output
      if (options.dryRun) {
        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            dryRun: true,
            wouldRestore: [...toRestore.map((f) => f.path), ...(strategy === 'theirs' ? conflicts.map(c => c.path) : [])],
            conflicts,
            skipped: strategy === 'ours' ? conflicts.map(c => c.path) : []
          }));
        } else {
          console.log(`${C.bright}Dry run - would restore:${C.reset}\n`);
          for (const file of toRestore) {
            console.log(`  ${C.green}✓${C.reset} ${file.path}`);
          }
          if (conflicts.length > 0) {
            console.log(`\n${C.yellow}Conflicts:${C.reset}`);
            for (const c of conflicts) {
              const action = strategy === 'theirs' ? 'overwrite' : strategy === 'ours' ? 'skip' : 'abort';
              console.log(`  ${C.yellow}!${C.reset} ${c.path} (${action})`);
            }
          }
        }
        return;
      }
      
      // Create backup
      let backupId: string | undefined;
      if (options.backup !== false) {
        backupId = `backup_${Date.now()}`;
        const backupDir = path.join(process.cwd(), '.aitimemachine', 'backups', backupId);
        fs.mkdirSync(backupDir, { recursive: true });
        
        for (const file of matchedFiles) {
          const srcPath = path.join(projectPath, file.path);
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
          const content = engine.getFileContent(match.id, file.path);
          if (content) {
            const fullPath = path.join(projectPath, file.path);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content);
            restored.push(file.path);
          } else {
            skipped.push(file.path);
          }
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
              const content = engine.getFileContent(match.id, file.path);
              if (content) {
                const fullPath = path.join(projectPath, file.path);
                fs.writeFileSync(fullPath, content);
                restored.push(file.path);
              }
            } catch {
              skipped.push(conflict.path);
            }
          }
        } else if (strategy === 'ours') {
          skipped.push(conflict.path);
        }
      }
      
      // Output
      if (options.json) {
        console.log(JSON.stringify({
          success: restored.length > 0,
          restored,
          conflicts,
          skipped,
          backupId
        }));
      } else {
        console.log(`${C.green}✓ Restored ${restored.length} files${C.reset}`);
        if (backupId) {
          console.log(`  Backup: ${backupId}`);
        }
        if (skipped.length > 0) {
          console.log(`  Skipped: ${skipped.length} files`);
        }
        if (conflicts.length > 0 && strategy === 'theirs') {
          console.log(`  Conflicts overwritten: ${conflicts.length}`);
        }
      }
    });

  // =========================================================================
  // FILE-HISTORY - File history with bloom filter lookup
  // =========================================================================
  program
    .command('file-history <file>')
    .description('Show history of a specific file with bloom filter optimization')
    .option('-n, --limit <n>', 'Limit results', '10')
    .option('--diff', 'Show inline diffs')
    .option('-j, --json', 'Output as JSON')
    .action(async (file, options) => {
      const engine = new TimeMachineEngine(process.cwd());
      const graph = new CheckpointGraph(path.join(process.cwd(), '.aitimemachine'));
      const diffEngine = new AdvancedDiffEngine();
      
      // Build graph
      const list = engine.listTimePoints();
      const nodes = list.map(tp => {
        const full = engine.getTimePoint(tp.id);
        return {
          id: tp.id,
          timestamp: tp.timestamp,
          description: tp.description,
          parentId: undefined,
          files: full?.files.map((f) => f.path) || [],
          stats: { totalFiles: tp.stats.totalFiles, totalSize: 0 }
        };
      });
      
      await graph.build(nodes);
      
      // Find checkpoints containing this file
      const checkpoints = graph.findCheckpointsWithFile(file).slice(0, parseInt(options.limit));
      
      if (checkpoints.length === 0) {
        console.log(`No history found for: ${file}`);
        return;
      }
      
      const history: Array<{
        checkpointId: string;
        timestamp: Date;
        description: string;
        changeType: string;
        diff?: string;
        stats?: { added: number; removed: number };
      }> = [];
      
      let prevContent: string | null = null;
      
      for (const cp of checkpoints) {
        const tp = engine.getTimePoint(cp.id);
        if (!tp) continue;
        
        const fileEntry = tp.files.find((f) => f.path === file);
        let changeType: string;
        let diffStr: string | undefined;
        let stats: { added: number; removed: number } | undefined;
        
        if (!fileEntry) {
          changeType = 'deleted';
        } else {
          const content = engine.getFileContent(cp.id, file) || '';
          
          if (prevContent === null) {
            changeType = 'added';
          } else if (content !== prevContent) {
            changeType = 'modified';
            
            if (options.diff && !isBinary(content) && !isBinary(prevContent)) {
              const diff = diffEngine.diff(prevContent, content, { algorithm: 'histogram' });
              diffStr = diffEngine.formatUnified(diff, `a/${file}`, `b/${file}`);
              stats = { added: diff.added, removed: diff.removed };
            }
          } else {
            continue; // No change
          }
          
          prevContent = content;
        }
        
        history.push({
          checkpointId: cp.id,
          timestamp: cp.timestamp,
          description: cp.description,
          changeType,
          diff: diffStr,
          stats
        });
      }
      
      if (options.json) {
        console.log(JSON.stringify(history.map(h => ({
          ...h,
          timestamp: h.timestamp.toISOString()
        }))));
        return;
      }
      
      console.log(`\n${C.bright}History of ${file}${C.reset}\n`);
      
      for (const entry of history) {
        const shortId = entry.checkpointId.slice(0, 8);
        const ago = getTimeAgo(entry.timestamp);
        
        let statusIcon: string;
        let statusColor: string;
        
        switch (entry.changeType) {
          case 'added':
            statusIcon = '+';
            statusColor = C.green;
            break;
          case 'deleted':
            statusIcon = '-';
            statusColor = C.red;
            break;
          default:
            statusIcon = '~';
            statusColor = C.yellow;
        }
        
        console.log(`${statusColor}${statusIcon}${C.reset} ${C.yellow}${shortId}${C.reset} ${entry.description} ${C.dim}(${ago})${C.reset}`);
        
        if (entry.stats) {
          console.log(`  ${C.green}+${entry.stats.added}${C.reset} ${C.red}-${entry.stats.removed}${C.reset}`);
        }
        
        if (entry.diff && options.diff) {
          console.log(entry.diff);
        }
        
        console.log();
      }
    });

  // =========================================================================
  // MERGE - Three-way merge between checkpoints
  // =========================================================================
  program
    .command('merge')
    .description('Three-way merge a file between checkpoints')
    .argument('<file>', 'File path to merge')
    .option('-o, --ours <checkpoint>', 'Our checkpoint ID', 'HEAD')
    .option('-t, --theirs <checkpoint>', 'Their checkpoint ID (required)')
    .option('-b, --base <checkpoint>', 'Base/ancestor checkpoint (auto-detected)')
    .option('-s, --strategy <strategy>', 'Merge strategy: ort, recursive, resolve, ours, theirs', 'ort')
    .option('--conflict-style <style>', 'Conflict marker style: merge, diff3, zdiff3', 'diff3')
    .option('--union', 'Auto-resolve add-add by combining both')
    .option('--dry-run', 'Preview merge without writing')
    .option('-j, --json', 'Output as JSON')
    .action(async (file, options) => {
      const engine = new TimeMachineEngine(process.cwd());
      const projectPath = process.cwd();
      
      // Get checkpoints
      const list = engine.listTimePoints();
      if (list.length === 0) {
        console.error('No checkpoints found');
        process.exit(1);
      }
      
      // Resolve ours checkpoint (HEAD = latest or specific)
      let cpOurs;
      if (options.ours === 'HEAD') {
        cpOurs = list[list.length - 1];
      } else {
        cpOurs = list.find(tp => tp.id.startsWith(options.ours));
      }
      
      if (!cpOurs) {
        console.error(`Ours checkpoint not found: ${options.ours}`);
        process.exit(1);
      }
      
      // Resolve theirs checkpoint
      if (!options.theirs) {
        console.error('--theirs checkpoint is required');
        process.exit(1);
      }
      
      const cpTheirs = list.find(tp => tp.id.startsWith(options.theirs));
      if (!cpTheirs) {
        console.error(`Theirs checkpoint not found: ${options.theirs}`);
        process.exit(1);
      }
      
      // Get file contents
      const oursContent = engine.getFileContent(cpOurs.id, file) || '';
      const theirsContent = engine.getFileContent(cpTheirs.id, file) || '';
      
      // Get base content (from ancestor or first checkpoint with the file)
      let baseContent = '';
      if (options.base) {
        const cpBase = list.find(tp => tp.id.startsWith(options.base));
        if (cpBase) {
          baseContent = engine.getFileContent(cpBase.id, file) || '';
        }
      } else {
        // Auto-detect: find first common ancestor
        const oursIdx = list.findIndex(tp => tp.id === cpOurs.id);
        const theirsIdx = list.findIndex(tp => tp.id === cpTheirs.id);
        const startIdx = Math.min(oursIdx, theirsIdx) + 1;
        
        for (let i = startIdx; i < list.length; i++) {
          const content = engine.getFileContent(list[i].id, file);
          if (content) {
            baseContent = content;
            break;
          }
        }
      }
      
      // Configure merge
      const mergeOpts: MergeOptions = {
        strategy: options.strategy as MergeOptions['strategy'],
        conflictStyle: options.conflictStyle as MergeOptions['conflictStyle'],
        unionMerge: options.union || false
      };
      
      // Perform merge
      const merger = new ThreeWayMerge(mergeOpts);
      const result = merger.merge({
        base: baseContent,
        ours: oursContent,
        theirs: theirsContent
      });
      
      // Output
      if (options.json) {
        console.log(JSON.stringify({
          file,
          strategy: options.strategy,
          conflictStyle: options.conflictStyle,
          hasConflicts: result.hasConflicts,
          stats: result.stats,
          conflicts: result.conflicts.map(c => ({
            line: c.startLine + 1,
            type: c.type,
            oursLines: c.ours.length,
            theirsLines: c.theirs.length,
            autoResolvable: c.autoResolvable
          })),
          merged: result.merged
        }, null, 2));
      } else {
        console.log(`\n${C.bright}Three-Way Merge: ${file}${C.reset}`);
        console.log(`  Ours: ${cpOurs.id.slice(0, 8)} - ${cpOurs.description}`);
        console.log(`  Theirs: ${cpTheirs.id.slice(0, 8)} - ${cpTheirs.description}`);
        console.log(`  Strategy: ${options.strategy}`);
        console.log(`  Conflict Style: ${options.conflictStyle}\n`);
        
        console.log(`${C.dim}Statistics:${C.reset}`);
        console.log(`  Hunks: ${result.stats.hunksTotal} (${C.green}${result.stats.hunksClean} clean${C.reset}, ${C.red}${result.stats.hunksConflicted} conflicts${C.reset})`);
        console.log(`  Lines: ${C.green}+${result.stats.linesAdded}${C.reset} ${C.red}-${result.stats.linesRemoved}${C.reset}`);
        console.log(`  Auto-resolved: ${result.stats.autoResolved}\n`);
        
        if (result.hasConflicts) {
          console.log(`${C.yellow}⚠ ${result.conflicts.length} conflict(s) require resolution:${C.reset}\n`);
          
          for (let i = 0; i < result.conflicts.length; i++) {
            const c = result.conflicts[i];
            console.log(`  ${i + 1}. Line ${c.startLine + 1} - ${c.type}`);
            console.log(`     Ours: ${c.ours.length} lines, Theirs: ${c.theirs.length} lines`);
            if (c.autoResolvable) {
              console.log(`     ${C.cyan}(auto-resolvable with --union)${C.reset}`);
            }
          }
          console.log(`\nUse ${C.cyan}aitm resolve${C.reset} to resolve conflicts.`);
        } else {
          console.log(`${C.green}✓ Merge completed cleanly!${C.reset}`);
        }
        
        // Write or preview
        if (!options.dryRun) {
          const outputPath = path.join(projectPath, file);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, result.merged);
          console.log(`\n${C.green}Wrote merged content to ${file}${C.reset}`);
        } else {
          console.log(`\n${C.dim}--- Merged Content (dry-run) ---${C.reset}`);
          console.log(result.merged);
          console.log(`${C.dim}--- End ---${C.reset}`);
        }
      }
    });

  // =========================================================================
  // RESOLVE - Resolve merge conflicts
  // =========================================================================
  program
    .command('resolve')
    .description('Resolve merge conflicts in a file')
    .argument('<file>', 'File with conflict markers')
    .option('-s, --strategy <strategy>', 'Resolution: ours, theirs, both', 'ours')
    .option('-i, --index <n>', 'Resolve specific conflict by index (0-based)')
    .option('-a, --all', 'Resolve all conflicts with strategy')
    .option('--show', 'Show conflicts without resolving')
    .option('-j, --json', 'Output as JSON')
    .action(async (file, options) => {
      const filePath = path.join(process.cwd(), file);
      
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      
      if (!ConflictResolver.hasConflicts(content)) {
        if (options.json) {
          console.log(JSON.stringify({ hasConflicts: false, file }));
        } else {
          console.log(`${C.green}✓${C.reset} No conflicts in ${file}`);
        }
        return;
      }
      
      const summary = ConflictResolver.summarize(content);
      
      // Show mode
      if (options.show) {
        if (options.json) {
          console.log(JSON.stringify({
            file,
            ...summary
          }, null, 2));
        } else {
          console.log(`\n${C.bright}Conflicts in ${file}${C.reset}\n`);
          console.log(`Found ${summary.count} conflict(s):\n`);
          
          for (const c of summary.conflicts) {
            console.log(`  ${c.line}: ${C.green}ours ${c.oursLines} lines${C.reset} vs ${C.red}theirs ${c.theirsLines} lines${C.reset}`);
          }
          
          // Show preview of first conflict
          const preview = ConflictResolver.getConflictPreview(content, 0);
          if (preview.found && preview.conflict) {
            console.log(`\n${C.dim}First conflict preview:${C.reset}`);
            if (preview.context?.before.length) {
              console.log(preview.context.before.map(l => `  ${C.dim}${l}${C.reset}`).join('\n'));
            }
            console.log(`  ${C.yellow}<<<<<<< OURS${C.reset}`);
            for (const l of preview.conflict.ours.slice(0, 3)) {
              console.log(`  ${C.green}${l}${C.reset}`);
            }
            if (preview.conflict.ours.length > 3) {
              console.log(`  ${C.dim}... ${preview.conflict.ours.length - 3} more lines${C.reset}`);
            }
            console.log(`  ${C.yellow}=======${C.reset}`);
            for (const l of preview.conflict.theirs.slice(0, 3)) {
              console.log(`  ${C.red}${l}${C.reset}`);
            }
            if (preview.conflict.theirs.length > 3) {
              console.log(`  ${C.dim}... ${preview.conflict.theirs.length - 3} more lines${C.reset}`);
            }
            console.log(`  ${C.yellow}>>>>>>> THEIRS${C.reset}`);
          }
        }
        return;
      }
      
      // Resolve
      let resolved: string;
      const resolution = options.strategy as 'ours' | 'theirs' | 'both';
      
      if (options.index !== undefined) {
        resolved = ConflictResolver.resolveConflict(content, parseInt(options.index), resolution);
      } else if (options.all || resolution === 'ours' || resolution === 'theirs') {
        resolved = ConflictResolver.resolveAll(content, resolution as 'ours' | 'theirs');
      } else {
        console.error('Use --all or --index to specify which conflicts to resolve');
        process.exit(1);
      }
      
      const remainingConflicts = ConflictResolver.countConflicts(resolved);
      
      // Write
      fs.writeFileSync(filePath, resolved);
      
      if (options.json) {
        console.log(JSON.stringify({
          file,
          strategy: resolution,
          conflictsBefore: summary.count,
          conflictsAfter: remainingConflicts,
          resolved: summary.count - remainingConflicts
        }));
      } else {
        console.log(`\n${C.bright}Conflict Resolution: ${file}${C.reset}`);
        console.log(`  Strategy: ${resolution}`);
        console.log(`  Resolved: ${summary.count - remainingConflicts} / ${summary.count}`);
        
        if (remainingConflicts === 0) {
          console.log(`\n${C.green}✓ All conflicts resolved!${C.reset}`);
        } else {
          console.log(`\n${C.yellow}⚠ ${remainingConflicts} conflict(s) remaining${C.reset}`);
        }
      }
    });
}

// ============================================================================
// Helper Functions
// ============================================================================

async function scanCurrentFiles(rootPath: string): Promise<Map<string, { path: string; hash: string; size: number }>> {
  const files = new Map<string, { path: string; hash: string; size: number }>();
  const crypto = await import('crypto');
  
  const scan = (dir: string, prefix: string = '') => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(prefix, entry.name);
        
        if (entry.isDirectory()) {
          if (['node_modules', '.git', '.aitimemachine', 'coverage', 'dist', '.next'].includes(entry.name)) {
            continue;
          }
          scan(fullPath, relativePath);
        } else {
          const content = fs.readFileSync(fullPath);
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          files.set(relativePath, { path: relativePath, hash, size: content.length });
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  };
  
  scan(rootPath);
  return files;
}

async function getFileContent(engine: TimeMachineEngine, file: { path: string }, checkpointId?: string): Promise<string> {
  if (checkpointId) {
    return engine.getFileContent(checkpointId, file.path) || '';
  } else {
    const fullPath = path.join(process.cwd(), file.path);
    try {
      return fs.readFileSync(fullPath, 'utf-8');
    } catch {
      return '';
    }
  }
}

function isBinary(content: string): boolean {
  return content.includes('\0') || /[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 8000));
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
