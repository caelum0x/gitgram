/**
 * Time Machine Experience CLI Commands
 * 
 * macOS Time Machine-like experience for AI coding:
 * - Go back in time (restore files + chat context)
 * - Undo mistakes with one command
 * - See what changed (visual diff)
 * - Restore specific files selectively
 * - Smart error detection
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { TimeMachineEngine } from '../core/engine.js';
import { AdvancedDiffEngine } from '../core/diff-engine-v2.js';
import { minimatch } from 'minimatch';

// Colors for terminal output
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function getTimeAgo(date: Date): string {
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Register Time Machine experience commands
 */
export function registerTimeMachineCommands(program: Command): void {
  // ============================================================================
  // UNDO - One-click undo (like Mac Time Machine's Restore button)
  // ============================================================================
  program
    .command('undo')
    .description('⏪ Quick undo the last AI action (like pressing Restore in Mac Time Machine)')
    .option('-n, --steps <n>', 'Number of steps to undo', '1')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const allTps = engine.listTimePoints();
      const steps = parseInt(opts.steps, 10);

      if (allTps.length < steps + 1) {
        console.log(`${C.red}[!]${C.reset} Not enough history. Only ${allTps.length - 1} checkpoints available.`);
        return;
      }

      // Get current and target
      const currentIdx = allTps.length - 1;
      const targetIdx = currentIdx - steps;
      const currentTp = allTps[currentIdx];
      const targetTp = allTps[targetIdx];

      console.log(`\n${C.cyan}⏪ UNDO${C.reset} - Reverting ${steps} action${steps > 1 ? 's' : ''}\n`);
      console.log(`${C.gray}Current:${C.reset} ${currentTp.description}`);
      console.log(`${C.gray}Going to:${C.reset} ${targetTp.description} (${getTimeAgo(new Date(targetTp.timestamp))})\n`);

      // Show what will be undone
      const undone = allTps.slice(targetIdx + 1).reverse();
      console.log(`${C.yellow}Actions to undo:${C.reset}`);
      for (const tp of undone) {
        console.log(`  ↩️  ${tp.description}`);
      }
      console.log();

      // Confirm
      if (!opts.yes) {
        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve => {
          rl.question(`${C.yellow}Proceed with undo? [y/N] ${C.reset}`, resolve);
        });
        rl.close();
        if (answer.toLowerCase() !== 'y') {
          console.log('Cancelled.');
          return;
        }
      }

      // Do the restore
      const fullTp = engine.getTimePoint(targetTp.id);
      if (!fullTp) {
        console.log(`${C.red}[!]${C.reset} Checkpoint not found`);
        return;
      }

      // Capture backup before restore
      engine.capture('Before undo', { type: 'restore' });

      const result = engine.restore(targetTp.id);
      
      console.log(`\n${C.green}✅ UNDO COMPLETE${C.reset}`);
      console.log(`   Files restored: ${result.filesRestored}`);
      console.log(`   Files removed: ${result.filesDeleted}`);
      console.log(`   Messages restored: ${result.messagesRemoved}`);
      console.log(`\n${C.gray}Use 'aitm list' to see all checkpoints${C.reset}`);
    });

  // ============================================================================
  // CHANGES - Quick summary of recent changes
  // ============================================================================
  program
    .command('changes')
    .alias('summary')
    .description('📊 Show summary of changes since last checkpoint')
    .option('-f, --from <id>', 'Compare from checkpoint')
    .option('-t, --to <id>', 'Compare to checkpoint (default: current)')
    .action(async (opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const allTps = engine.listTimePoints();

      if (allTps.length < 1) {
        console.log('No checkpoints yet. Run `aitm init` first.');
        return;
      }

      // Get from checkpoint
      let fromTp = opts.from 
        ? allTps.find(t => t.id.startsWith(opts.from))
        : allTps.length > 1 ? allTps[allTps.length - 2] : allTps[allTps.length - 1];

      if (!fromTp) {
        console.log(`${C.red}[!]${C.reset} From checkpoint not found`);
        return;
      }

      const fromFull = engine.getTimePoint(fromTp.id);
      if (!fromFull) {
        console.log(`${C.red}[!]${C.reset} Could not load checkpoint`);
        return;
      }

      // Get diff
      const diff = engine.getDiff(fromTp.id, opts.to);

      console.log(`\n${C.cyan}📊 CHANGE SUMMARY${C.reset}\n`);
      console.log(`${C.gray}From:${C.reset} ${fromTp.description} (${getTimeAgo(new Date(fromTp.timestamp))})`);
      console.log(`${C.gray}To:${C.reset} ${opts.to || 'Current state'}\n`);
      
      console.log('━'.repeat(50));
      console.log(`${C.green}✅ Added:${C.reset}    ${diff.added.length} files`);
      console.log(`${C.yellow}✏️  Modified:${C.reset} ${diff.modified.length} files`);
      console.log(`${C.red}❌ Deleted:${C.reset}  ${diff.deleted.length} files`);
      console.log('━'.repeat(50));

      if (diff.added.length > 0) {
        console.log(`\n${C.green}Added files:${C.reset}`);
        for (const f of diff.added.slice(0, 10)) {
          console.log(`  ${C.green}+${C.reset} ${f}`);
        }
        if (diff.added.length > 10) console.log(`  ${C.gray}... and ${diff.added.length - 10} more${C.reset}`);
      }

      if (diff.modified.length > 0) {
        console.log(`\n${C.yellow}Modified files:${C.reset}`);
        for (const f of diff.modified.slice(0, 10)) {
          console.log(`  ${C.yellow}~${C.reset} ${f}`);
        }
        if (diff.modified.length > 10) console.log(`  ${C.gray}... and ${diff.modified.length - 10} more${C.reset}`);
      }

      if (diff.deleted.length > 0) {
        console.log(`\n${C.red}Deleted files:${C.reset}`);
        for (const f of diff.deleted.slice(0, 10)) {
          console.log(`  ${C.red}-${C.reset} ${f}`);
        }
        if (diff.deleted.length > 10) console.log(`  ${C.gray}... and ${diff.deleted.length - 10} more${C.reset}`);
      }

      console.log();
    });

  // ============================================================================
  // BROWSE - Browse files at a checkpoint
  // ============================================================================
  program
    .command('browse <checkpoint>')
    .description('👁️ Browse files at a specific checkpoint (like looking around in Time Machine)')
    .option('-p, --path <path>', 'Path to browse', '')
    .action(async (checkpoint, opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      
      let tp = engine.getTimePoint(checkpoint);
      if (!tp) {
        const list = engine.listTimePoints();
        const match = list.find(t => t.id.startsWith(checkpoint));
        if (match) tp = engine.getTimePoint(match.id);
      }

      if (!tp) {
        console.log(`${C.red}[!]${C.reset} Checkpoint not found: ${checkpoint}`);
        return;
      }

      console.log(`\n${C.cyan}👁️ BROWSING CHECKPOINT${C.reset}\n`);
      console.log(`${C.gray}Checkpoint:${C.reset} ${tp.description}`);
      console.log(`${C.gray}Time:${C.reset} ${tp.timestamp} (${getTimeAgo(new Date(tp.timestamp))})`);
      console.log(`${C.gray}Total files:${C.reset} ${tp.stats.totalFiles}\n`);

      // Build tree
      const pathFilter = opts.path;
      const files = tp.files.filter(f => 
        !pathFilter || f.path.startsWith(pathFilter)
      );

      // Group by directory
      const dirs = new Map<string, { files: string[]; totalSize: number }>();
      
      for (const file of files) {
        const dir = path.dirname(file.path);
        if (!dirs.has(dir)) {
          dirs.set(dir, { files: [], totalSize: 0 });
        }
        dirs.get(dir)!.files.push(path.basename(file.path));
        dirs.get(dir)!.totalSize += file.size;
      }

      // Sort directories
      const sortedDirs = Array.from(dirs.entries()).sort((a, b) => a[0].localeCompare(b[0]));

      for (const [dir, info] of sortedDirs.slice(0, 30)) {
        console.log(`${C.blue}📁 ${dir}/${C.reset} (${info.files.length} files, ${formatSize(info.totalSize)})`);
        for (const file of info.files.slice(0, 5)) {
          console.log(`   📄 ${file}`);
        }
        if (info.files.length > 5) {
          console.log(`   ${C.gray}... and ${info.files.length - 5} more${C.reset}`);
        }
      }

      if (sortedDirs.length > 30) {
        console.log(`\n${C.gray}... and ${sortedDirs.length - 30} more directories${C.reset}`);
      }

      console.log(`\n${C.gray}Use 'aitm cat <file> ${checkpoint}' to view file contents${C.reset}`);
    });

  // ============================================================================
  // RESTORE-PATTERN - Restore files by glob pattern
  // ============================================================================
  program
    .command('restore-files <pattern>')
    .description('📂 Restore multiple files by glob pattern (e.g., "*.ts", "src/**")')
    .option('-f, --from <id>', 'Checkpoint to restore from')
    .option('-d, --dry-run', 'Preview files without restoring')
    .option('-s, --strategy <s>', 'Strategy: overwrite, skip_existing', 'overwrite')
    .action(async (pattern, opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const allTps = engine.listTimePoints();

      // Get checkpoint
      let tp;
      if (opts.from) {
        tp = allTps.find(t => t.id.startsWith(opts.from));
      } else {
        tp = allTps[allTps.length - 1];
      }

      if (!tp) {
        console.log(`${C.red}[!]${C.reset} Checkpoint not found`);
        return;
      }

      const fullTp = engine.getTimePoint(tp.id);
      if (!fullTp) {
        console.log(`${C.red}[!]${C.reset} Could not load checkpoint`);
        return;
      }

      // Match files
      const matchingFiles = fullTp.files.filter(f => minimatch(f.path, pattern));

      if (matchingFiles.length === 0) {
        console.log(`${C.yellow}[!]${C.reset} No files matched pattern: ${pattern}`);
        return;
      }

      console.log(`\n${C.cyan}📂 RESTORE FILES${C.reset}\n`);
      console.log(`${C.gray}Pattern:${C.reset} ${pattern}`);
      console.log(`${C.gray}From:${C.reset} ${tp.description} (${getTimeAgo(new Date(tp.timestamp))})`);
      console.log(`${C.gray}Matched:${C.reset} ${matchingFiles.length} files\n`);

      if (opts.dryRun) {
        console.log(`${C.yellow}DRY RUN - No changes will be made${C.reset}\n`);
        for (const f of matchingFiles.slice(0, 30)) {
          console.log(`  ${f.path} (${formatSize(f.size)})`);
        }
        if (matchingFiles.length > 30) {
          console.log(`  ${C.gray}... and ${matchingFiles.length - 30} more${C.reset}`);
        }
        console.log(`\n${C.gray}Run without --dry-run to restore${C.reset}`);
        return;
      }

      // Restore files
      let restored = 0, skipped = 0, errors = 0;

      for (const file of matchingFiles) {
        try {
          const fullPath = path.join(process.cwd(), file.path);
          const exists = fs.existsSync(fullPath);

          if (exists && opts.strategy === 'skip_existing') {
            skipped++;
            continue;
          }

          const content = engine.getFileAt(tp.id, file.path);
          if (!content) {
            errors++;
            continue;
          }

          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
          fs.writeFileSync(fullPath, content);
          restored++;
        } catch {
          errors++;
        }
      }

      console.log(`${C.green}✅ Restored: ${restored}${C.reset}`);
      if (skipped > 0) console.log(`${C.yellow}⏭️  Skipped: ${skipped}${C.reset}`);
      if (errors > 0) console.log(`${C.red}❌ Errors: ${errors}${C.reset}`);
    });

  // ============================================================================
  // BEFORE - Find and optionally restore to state before an action
  // ============================================================================
  program
    .command('before <query>')
    .description('⏮️ Find state before a specific action (e.g., "before docker", "before api changes")')
    .option('-r, --restore', 'Actually restore to that point')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (query, opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const allTps = engine.listTimePoints();

      if (allTps.length < 2) {
        console.log('Not enough history.');
        return;
      }

      // Search for matching checkpoint
      const queryLower = query.toLowerCase();
      let foundIndex = -1;

      for (let i = allTps.length - 1; i >= 1; i--) {
        const tp = allTps[i];
        if (tp.description.toLowerCase().includes(queryLower)) {
          foundIndex = i - 1; // The checkpoint BEFORE this one
          break;
        }
      }

      if (foundIndex < 0) {
        console.log(`${C.yellow}[!]${C.reset} No checkpoint found matching: ${query}`);
        console.log(`\n${C.gray}Try 'aitm list' to see all checkpoints${C.reset}`);
        return;
      }

      const matchedTp = allTps[foundIndex + 1];
      const targetTp = allTps[foundIndex];

      console.log(`\n${C.cyan}⏮️ BEFORE ACTION${C.reset}\n`);
      console.log(`${C.gray}Action found:${C.reset} ${matchedTp.description}`);
      console.log(`${C.gray}State before:${C.reset} ${targetTp.description}`);
      console.log(`${C.gray}Time:${C.reset} ${getTimeAgo(new Date(targetTp.timestamp))}\n`);

      if (!opts.restore) {
        console.log(`${C.gray}Run with --restore to go back to this state${C.reset}`);
        return;
      }

      // Confirm
      if (!opts.yes) {
        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve => {
          rl.question(`${C.yellow}Restore to this state? [y/N] ${C.reset}`, resolve);
        });
        rl.close();
        if (answer.toLowerCase() !== 'y') {
          console.log('Cancelled.');
          return;
        }
      }

      // Restore
      engine.capture('Before restoring to previous state', { type: 'restore' });
      const result = engine.restore(targetTp.id);

      console.log(`\n${C.green}✅ RESTORED${C.reset}`);
      console.log(`   Files restored: ${result.filesRestored}`);
      console.log(`   Files removed: ${result.filesDeleted}`);
    });

  // ============================================================================
  // FIND-ERROR - Smart error detection
  // ============================================================================
  program
    .command('find-error')
    .alias('when-broken')
    .description('🔍 Find when things went wrong (smart error detection)')
    .option('-p, --pattern <p>', 'Error pattern to search for')
    .option('-m, --minutes <n>', 'How far back to search', '60')
    .option('-r, --restore', 'Auto-restore to last good state')
    .action(async (opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const allTps = engine.listTimePoints();

      const lookbackMs = parseInt(opts.minutes, 10) * 60 * 1000;
      const cutoff = new Date(Date.now() - lookbackMs);

      const recentTps = allTps.filter(tp => new Date(tp.timestamp) >= cutoff);

      if (recentTps.length < 2) {
        console.log('Not enough recent history to analyze.');
        return;
      }

      console.log(`\n${C.cyan}🔍 FINDING ERROR POINT${C.reset}\n`);
      console.log(`${C.gray}Searching last ${opts.minutes} minutes (${recentTps.length} checkpoints)${C.reset}\n`);

      // Error/good indicators
      const errorIndicators = ['error', 'fail', 'broke', 'fix', 'revert', 'undo', 'broken', 'bug'];
      const goodIndicators = ['green', 'pass', 'success', 'working', 'stable', 'done', 'complete'];

      let lastGoodIndex = -1;
      let errorInfo = '';

      for (let i = 0; i < recentTps.length; i++) {
        const tp = recentTps[i];
        const desc = tp.description.toLowerCase();

        // Check pattern match
        if (opts.pattern && desc.includes(opts.pattern.toLowerCase())) {
          lastGoodIndex = i + 1;
          errorInfo = `Found pattern "${opts.pattern}" in: ${tp.description}`;
          break;
        }

        // Check error indicators
        if (errorIndicators.some(ind => desc.includes(ind))) {
          lastGoodIndex = i + 1;
          errorInfo = `Found error indicator in: ${tp.description}`;
          break;
        }

        // Track last good state
        if (goodIndicators.some(ind => desc.includes(ind))) {
          lastGoodIndex = i;
          errorInfo = `Last known good state: ${tp.description}`;
        }
      }

      if (lastGoodIndex === -1 || lastGoodIndex >= recentTps.length) {
        console.log(`${C.yellow}[!]${C.reset} No clear error point found.`);
        console.log(`${C.gray}Try 'aitm timeline' to review manually${C.reset}`);
        return;
      }

      const targetTp = recentTps[lastGoodIndex];

      console.log(`${C.green}✅ Found potential restore point${C.reset}\n`);
      console.log(`${C.gray}${errorInfo}${C.reset}\n`);
      console.log(`Suggested restore point:`);
      console.log(`  ${C.bold}${targetTp.description}${C.reset}`);
      console.log(`  ${getTimeAgo(new Date(targetTp.timestamp))}`);

      if (!opts.restore) {
        console.log(`\n${C.gray}Run with --restore to go back to this state${C.reset}`);
        return;
      }

      // Restore
      engine.capture('Before error recovery restore', { type: 'restore' });
      const result = engine.restore(targetTp.id);

      console.log(`\n${C.green}✅ RESTORED TO LAST GOOD STATE${C.reset}`);
      console.log(`   Files restored: ${result.filesRestored}`);
      console.log(`   Files removed: ${result.filesDeleted}`);
    });

  // ============================================================================
  // QUICK-DIFF - Quick file diff
  // ============================================================================
  program
    .command('quick-diff <file>')
    .description('📝 Show quick diff for a file vs last checkpoint')
    .option('-f, --from <id>', 'From checkpoint')
    .option('-c, --context <n>', 'Context lines', '3')
    .action(async (file, opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const allTps = engine.listTimePoints();

      if (allTps.length < 1) {
        console.log('No checkpoints yet.');
        return;
      }

      let tp = opts.from
        ? allTps.find(t => t.id.startsWith(opts.from))
        : allTps[allTps.length - 1];

      if (!tp) {
        console.log(`${C.red}[!]${C.reset} Checkpoint not found`);
        return;
      }

      const oldContent = engine.getFileAt(tp.id, file) || '';
      let newContent = '';
      try {
        newContent = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      } catch {}

      if (oldContent === newContent) {
        console.log(`${C.gray}No changes in ${file}${C.reset}`);
        return;
      }

      const diffEngine = new AdvancedDiffEngine();
      const result = diffEngine.diff(oldContent, newContent, {
        algorithm: 'histogram',
        context: parseInt(opts.context, 10)
      });

      console.log(`\n${C.cyan}📝 DIFF: ${file}${C.reset}`);
      console.log(`${C.gray}From: ${tp.description}${C.reset}\n`);
      console.log(`${C.green}+${result.added} added${C.reset}, ${C.red}-${result.removed} removed${C.reset}\n`);

      for (const hunk of result.hunks) {
        console.log(`${C.cyan}@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${C.reset}`);
        for (const line of hunk.lines) {
          if (line.type === 'add') {
            console.log(`${C.green}+${line.content}${C.reset}`);
          } else if (line.type === 'remove') {
            console.log(`${C.red}-${line.content}${C.reset}`);
          } else {
            console.log(` ${line.content}`);
          }
        }
      }
    });
}
