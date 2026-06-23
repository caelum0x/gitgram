/**
 * Checkpoint Commands
 *
 * Core checkpoint CRUD: create, list, show, preview, restore, back,
 * restore-file, cat, diff, diff-file, timeline, where, stats,
 * annotate, tags, report, auto-checkpoint, log, bisect
 */

import { Command } from 'commander';
import { TimeMachineEngine } from '../core/engine.js';
import { C, formatSize, formatDate, timeAgo, parseTime, confirm } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';

export function registerCheckpointCommands(program: Command): void {

  // Checkpoint (manual capture)
  program
    .command('checkpoint [description]')
    .alias('cp')
    .description('Create a manual checkpoint')
    .option('-j, --json', 'Output as JSON')
    .action(async (description = 'Manual checkpoint', opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const tp = engine.capture(description, { type: 'manual' });
      if (opts.json) {
        console.log(JSON.stringify({ id: tp.id, timestamp: tp.timestamp, description, stats: tp.stats }));
        return;
      }
      console.log(`[+] Checkpoint created: ${tp.id}`);
      console.log(`   ${tp.stats.totalFiles} files, ${formatSize(tp.stats.totalSize)}`);
    });

  // List timepoints
  program
    .command('list')
    .alias('ls')
    .description('List all timepoints')
    .option('-n, --limit <n>', 'Limit results', '20')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints().slice(-parseInt(options.limit)).reverse();
      if (options.json) { console.log(JSON.stringify(list)); return; }
      if (list.length === 0) { console.log('No timepoints yet. Run: aitm init'); return; }
      console.log('\nTimePoints:\n');
      for (const tp of list) {
        const ago = timeAgo(tp.timestamp);
        const changes = tp.changesCount > 0 ? ` (${tp.changesCount} changes)` : '';
        console.log(`  ${C.cyan}${tp.id.slice(0, 20)}${C.reset}  ${formatDate(tp.timestamp)} ${C.dim}(${ago})${C.reset}`);
        console.log(`  ${C.dim}\u2514\u2500${C.reset} ${tp.description}${changes}`);
        console.log();
      }
    });

  // Show timepoint details
  program
    .command('show <id>')
    .description('Show timepoint details')
    .option('-j, --json', 'Output as JSON')
    .action(async (id, opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      const match = list.find(tp => tp.id.startsWith(id));
      if (!match) {
        if (opts.json) console.log(JSON.stringify({ error: 'TimePoint not found' }));
        else console.log('TimePoint not found');
        return;
      }
      const tp = engine.getTimePoint(match.id);
      if (!tp) return;
      if (opts.json) {
        console.log(JSON.stringify({
          id: tp.id, timestamp: tp.timestamp.toISOString(), description: tp.description,
          trigger: tp.trigger, stats: tp.stats, changes: tp.changes, files: tp.files, conversation: tp.conversation
        }));
        return;
      }
      console.log(`\n${C.bright}TimePoint: ${tp.id}${C.reset}`);
      console.log(`${C.dim}\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${C.reset}`);
      console.log(`Time:        ${tp.timestamp.toISOString()}`);
      console.log(`Description: ${tp.description}`);
      console.log(`Trigger:     ${tp.trigger.type}${tp.trigger.action ? ` (${tp.trigger.action})` : ''}`);
      console.log(`Files:       ${tp.stats.totalFiles} (${formatSize(tp.stats.totalSize)})`);
      console.log(`\nChanges:`);
      console.log(`  ${C.green}+ Added:${C.reset}    ${tp.changes.added.length}`);
      console.log(`  ${C.yellow}~ Modified:${C.reset} ${tp.changes.modified.length}`);
      console.log(`  ${C.red}- Deleted:${C.reset}  ${tp.changes.deleted.length}`);
      if (tp.conversation.messageCount > 0) {
        console.log(`\nConversation: ${tp.conversation.messageCount} messages`);
        console.log(`  Last: "${tp.conversation.lastMessagePreview}"`);
      }
    });

  // Preview restore
  program
    .command('preview <id>')
    .description('Preview what restore will change')
    .action(async (id) => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      const match = list.find(tp => tp.id.startsWith(id));
      if (!match) { console.log('TimePoint not found'); return; }
      const preview = engine.previewRestore(match.id);
      if (!preview) return;
      console.log(`\n${C.bright}Restore Preview${C.reset}`);
      console.log(`${C.dim}\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500${C.reset}`);
      console.log(`Target: ${preview.timepoint.description}`);
      console.log(`Time:   ${preview.timepoint.timestamp.toISOString()}`);
      console.log();
      console.log(`${C.cyan}Files to restore:${C.reset} ${preview.filesToRestore.length}`);
      console.log(`${C.red}Files to delete:${C.reset}  ${preview.filesToDelete.length}`);
      if (preview.filesToDelete.length > 0) {
        console.log(`\nFiles that will be deleted (created after this timepoint):`);
        for (const f of preview.filesToDelete.slice(0, 10)) {
          console.log(`  ${C.red}- ${f}${C.reset}`);
        }
        if (preview.filesToDelete.length > 10) {
          console.log(`  ${C.dim}... and ${preview.filesToDelete.length - 10} more${C.reset}`);
        }
      }
    });

  // Restore
  program
    .command('restore <target>')
    .description('Restore to a timepoint (ID, time, or description)')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (target, options) => {
      const engine = new TimeMachineEngine(process.cwd());
      let tp = engine.getTimePoint(target);
      if (!tp) {
        const list = engine.listTimePoints();
        const match = list.find(t => t.id.startsWith(target));
        if (match) tp = engine.getTimePoint(match.id);
      }
      if (!tp) { try { const time = parseTime(target); tp = engine.findByTime(time); } catch { /* ignore */ } }
      if (!tp) { tp = engine.findByDescription(target); }
      if (!tp) {
        console.log(`${C.red}[!]${C.reset} No matching timepoint found for: ${target}`);
        console.log(`${C.dim}Tip: Use 'aitm list' to see available timepoints${C.reset}`);
        return;
      }
      const preview = engine.previewRestore(tp.id);
      if (!preview) { console.log(`${C.red}[!]${C.reset} Failed to preview restore - timepoint may be corrupted`); return; }
      console.log(`\n${C.bright}Restore to:${C.reset} ${tp.description}`);
      console.log(`${C.dim}Time: ${tp.timestamp.toISOString()}${C.reset}`);
      console.log(`\nThis will:`);
      console.log(`  \u2022 Restore ${preview.filesToRestore.length} files`);
      console.log(`  \u2022 Delete ${preview.filesToDelete.length} files created after this point`);
      console.log(`  \u2022 Remove ${engine.getConversations().length - preview.conversationMessagesToKeep} conversation messages`);
      if (!options.yes) {
        const confirmed = await confirm('\nProceed with restore?');
        if (!confirmed) { console.log('Cancelled'); return; }
      }
      try {
        const result = engine.restore(tp.id);
        console.log(`\n${C.green}[OK] Restored!${C.reset}`);
        console.log(`   Files restored: ${result.filesRestored}`);
        console.log(`   Files deleted: ${result.filesDeleted}`);
        console.log(`   Messages removed: ${result.messagesRemoved}`);
      } catch (err) {
        console.error(`${C.red}[!]${C.reset} Restore failed: ${(err as Error).message}`);
        console.log(`${C.dim}Your files may be in an inconsistent state. Check .aitimemachine/backups/${C.reset}`);
      }
    });

  // Back - quick restore
  program
    .command('back [target]')
    .description('Go back to a checkpoint (ID, description, or time)')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (target, options) => {
      if (!target) {
        const engine = new TimeMachineEngine(process.cwd());
        const allTps = engine.listTimePoints();
        if (allTps.length < 2) { console.log('No previous checkpoint to go back to'); return; }
        target = allTps[allTps.length - 2].id;
      }
      await program.parseAsync(['node', 'aitm', 'restore', target, ...(options.yes ? ['-y'] : [])]);
    });

  // Restore specific file
  program
    .command('restore-file <file> <checkpoint>')
    .description('Restore a single file from a checkpoint')
    .option('-s, --strategy <s>', 'Conflict strategy: ours, theirs, merge', 'theirs')
    .option('-b, --base <id>', 'Base checkpoint for 3-way merge')
    .action(async (file, checkpoint, opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      let tp = engine.getTimePoint(checkpoint);
      if (!tp) {
        const list = engine.listTimePoints();
        const match = list.find(t => t.id.startsWith(checkpoint));
        if (match) tp = engine.getTimePoint(match.id);
      }
      if (!tp) { console.log(`${C.red}[!]${C.reset} Checkpoint not found: ${checkpoint}`); return; }
      const theirsContent = engine.getFileAt(tp.id, file);
      if (!theirsContent) { console.log(`${C.red}[!]${C.reset} File not found in checkpoint: ${file}`); return; }
      const fullPath = path.join(process.cwd(), file);
      let oursContent = '';
      let hasLocal = false;
      try { oursContent = fs.readFileSync(fullPath, 'utf8'); hasLocal = oursContent !== theirsContent; } catch {}
      let finalContent = theirsContent;
      let mergeInfo = '';
      if (hasLocal && opts.strategy === 'merge') {
        const { ThreeWayMerge } = await import('../core/three-way-merge.js');
        let baseContent = '';
        if (opts.base) { baseContent = engine.getFileAt(opts.base, file) || ''; }
        const merger = new ThreeWayMerge();
        const result = merger.merge({ base: baseContent, ours: oursContent, theirs: theirsContent });
        finalContent = result.merged;
        mergeInfo = result.hasConflicts
          ? `${C.yellow}Warning: ${result.conflicts.length} conflicts need resolution${C.reset}`
          : `${C.green}Auto-merged${C.reset}`;
      } else if (hasLocal && opts.strategy === 'ours') {
        console.log(`${C.yellow}[SKIP]${C.reset} Keeping local: ${file}`);
        return;
      }
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, finalContent);
      console.log(`${C.green}[OK]${C.reset} Restored: ${file}`);
      console.log(`   From: ${tp.description}`);
      console.log(`   Strategy: ${opts.strategy}`);
      if (mergeInfo) console.log(`   ${mergeInfo}`);
    });

  // Cat - view file at checkpoint
  program
    .command('cat <file> <checkpoint>')
    .description('View file content at a checkpoint (without restoring)')
    .action(async (file, checkpoint) => {
      const engine = new TimeMachineEngine(process.cwd());
      let tp = engine.getTimePoint(checkpoint);
      if (!tp) {
        const list = engine.listTimePoints();
        const match = list.find(t => t.id.startsWith(checkpoint));
        if (match) tp = engine.getTimePoint(match.id);
      }
      if (!tp) { console.error(`Checkpoint not found: ${checkpoint}`); process.exit(1); }
      const content = engine.getFileAt(tp.id, file);
      if (!content) { console.error(`File not found in checkpoint: ${file}`); process.exit(1); }
      process.stdout.write(content);
    });

  // Diff
  program
    .command('diff <from> [to]')
    .description('Show diff between timepoints (or timepoint and current)')
    .option('-j, --json', 'Output as JSON')
    .action(async (from, to, opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      const fromMatch = list.find(tp => tp.id.startsWith(from));
      if (!fromMatch) {
        if (opts.json) console.log(JSON.stringify({ error: 'From timepoint not found' }));
        else console.log('From timepoint not found');
        return;
      }
      let toId: string | undefined;
      if (to && to !== 'current') {
        const toMatch = list.find(tp => tp.id.startsWith(to));
        if (!toMatch) {
          if (opts.json) console.log(JSON.stringify({ error: 'To timepoint not found' }));
          else console.log('To timepoint not found');
          return;
        }
        toId = toMatch.id;
      }
      const diff = engine.getDiff(fromMatch.id, toId);
      if (opts.json) {
        console.log(JSON.stringify({
          from: fromMatch.id, to: toId || 'current',
          changes: [
            ...diff.added.map(p => ({ path: p, type: 'added' })),
            ...diff.modified.map(p => ({ path: p, type: 'modified' })),
            ...diff.deleted.map(p => ({ path: p, type: 'deleted' }))
          ]
        }));
        return;
      }
      console.log(`\n${C.bright}Diff: ${fromMatch.id.slice(0, 16)} \u2192 ${toId ? toId.slice(0, 16) : 'current'}${C.reset}\n`);
      if (diff.added.length > 0) { console.log(`${C.green}Added (${diff.added.length}):${C.reset}`); diff.added.forEach(f => console.log(`  + ${f}`)); console.log(); }
      if (diff.modified.length > 0) { console.log(`${C.yellow}Modified (${diff.modified.length}):${C.reset}`); diff.modified.forEach(f => console.log(`  ~ ${f}`)); console.log(); }
      if (diff.deleted.length > 0) { console.log(`${C.red}Deleted (${diff.deleted.length}):${C.reset}`); diff.deleted.forEach(f => console.log(`  - ${f}`)); }
      if (diff.added.length === 0 && diff.modified.length === 0 && diff.deleted.length === 0) { console.log('No changes'); }
    });

  // Enhanced diff with algorithm selection
  program
    .command('diff-file <path> <from> [to]')
    .description('Show file diff with Git-quality algorithms (Myers, Patience, Histogram)')
    .option('-a, --algorithm <alg>', 'Diff algorithm: myers, patience, histogram', 'histogram')
    .option('-c, --context <n>', 'Context lines', '3')
    .action(async (filePath, from, to, opts) => {
      const { AdvancedDiffEngine } = await import('../core/diff-engine-v2.js');
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      const fromMatch = list.find(tp => tp.id.startsWith(from));
      if (!fromMatch) { console.log('From timepoint not found'); return; }
      const fromTp = engine.getTimePoint(fromMatch.id);
      const fromFile = fromTp?.files.find((f: any) => f.path === filePath);
      if (!fromFile) { console.log(`File not found in checkpoint: ${filePath}`); return; }
      const contentA = engine.getFileContent(fromMatch.id, filePath) || '';
      let contentB = '';
      if (to && to !== 'current') {
        const toMatch = list.find(tp => tp.id.startsWith(to));
        if (toMatch) { contentB = engine.getFileContent(toMatch.id, filePath) || ''; }
      } else {
        try { contentB = fs.readFileSync(path.join(process.cwd(), filePath), 'utf8'); } catch {}
      }
      const diffEngine = new AdvancedDiffEngine();
      const diff = diffEngine.diff(contentA, contentB, { algorithm: opts.algorithm as any, context: parseInt(opts.context) });
      console.log(`\n${C.bright}Diff: ${filePath}${C.reset}`);
      console.log(`Algorithm: ${opts.algorithm} | +${diff.added} -${diff.removed}\n`);
      console.log(diffEngine.formatUnified(diff, `a/${filePath}`, `b/${filePath}`));
    });

  // Stats
  program
    .command('stats')
    .description('Show TimeMachine statistics')
    .action(async () => {
      const engine = new TimeMachineEngine(process.cwd());
      const stats = engine.getStats();
      console.log(`\n${C.bright}AITimeMachine Stats${C.reset}\n`);
      console.log(`  TimePoints:    ${stats.timePoints}`);
      console.log(`  Conversations: ${stats.conversations}`);
      console.log(`  Storage:       ${formatSize(stats.storageSize)}`);
    });

  // Where - show current state
  program
    .command('where')
    .alias('w')
    .description('Show current state and recent history')
    .action(async () => {
      const engine = new TimeMachineEngine(process.cwd());
      const allTps = engine.listTimePoints();
      if (allTps.length === 0) { console.log('No checkpoints yet. Run: aitm init'); return; }
      const latest = allTps[allTps.length - 1];
      const recent = allTps.slice(-5).reverse();
      console.log(`\n${C.bright}WHERE AM I${C.reset}\n`);
      console.log(`${C.bright}Current State:${C.reset}`);
      console.log(`  ${latest.description}`);
      console.log(`  ${C.dim}Created: ${timeAgo(latest.timestamp)}${C.reset}`);
      console.log(`  ${C.dim}Files: ${latest.stats.totalFiles}${C.reset}`);
      console.log(`  ${C.dim}Changes: ${latest.changesCount || 0}${C.reset}`);
      console.log(`\n${C.bright}Recent Timeline:${C.reset}`);
      recent.forEach((tp, i) => {
        const icon = i === 0 ? C.green + '\u25CF' : C.dim + '\u25CB';
        console.log(`  ${icon} ${tp.description} ${C.dim}(${timeAgo(tp.timestamp)})${C.reset}`);
      });
      console.log(`\n${C.dim}Commands:${C.reset}`);
      console.log(`  ${C.dim}aitm restore <id>     - Go back to a checkpoint${C.reset}`);
      console.log(`  ${C.dim}aitm timeline         - Show full timeline${C.reset}`);
      console.log(`  ${C.dim}aitm diff <from> <to> - Compare checkpoints${C.reset}`);
      console.log(`  ${C.dim}aitm kb-search <q>    - Search cloud knowledge base${C.reset}\n`);
    });

  // Timeline - visual view
  program
    .command('timeline')
    .alias('tl')
    .description('Show visual timeline of checkpoints')
    .option('-n, --limit <n>', 'Number of checkpoints to show', '20')
    .option('-p, --pairs', 'Show only before/after pairs')
    .option('--after <date>', 'Show checkpoints after date (ISO or relative like "2h ago")')
    .option('--before <date>', 'Show checkpoints before date')
    .option('-f, --file <path>', 'Filter by file path')
    .option('--pattern <glob>', 'Filter by file pattern (e.g., "src/**/*.ts")')
    .option('-t, --trigger <type>', 'Filter by trigger type (manual, auto, ai_action)')
    .option('-s, --sort <field>', 'Sort by: timestamp, changes, files', 'timestamp')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      const { TimelineIndex } = await import('../core/timeline-index.js');
      const engine = new TimeMachineEngine(process.cwd());
      const timeline = new TimelineIndex(engine);
      const parseDate = (str: string): Date | undefined => {
        if (!str) return undefined;
        const match = str.match(/^(\d+)(m|h|d)\s*ago$/i);
        if (match) {
          const amount = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          const ms = unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
          return new Date(Date.now() - amount * ms);
        }
        return new Date(str);
      };
      const results = timeline.query({
        startDate: parseDate(options.after), endDate: parseDate(options.before),
        filePath: options.file, filePattern: options.pattern, trigger: options.trigger,
        sortBy: options.sort, sortOrder: 'desc', limit: parseInt(options.limit)
      });
      if (options.json) { console.log(JSON.stringify(results, null, 2)); return; }
      if (results.length === 0) { console.log('No checkpoints match the filters.'); return; }
      const filters: string[] = [];
      if (options.after) filters.push(`after: ${options.after}`);
      if (options.before) filters.push(`before: ${options.before}`);
      if (options.file) filters.push(`file: ${options.file}`);
      if (options.pattern) filters.push(`pattern: ${options.pattern}`);
      if (options.trigger) filters.push(`trigger: ${options.trigger}`);
      console.log(`\n${C.bright}Timeline${C.reset} (${results.length} checkpoints)`);
      if (filters.length > 0) { console.log(`${C.dim}Filters: ${filters.join(', ')}${C.reset}`); }
      console.log();
      console.log(`  NOW ${C.green}\u25CF${C.reset}`);
      if (options.pairs) {
        const pairs: Array<{before: any, after: any}> = [];
        const standalone: any[] = [];
        results.forEach(tp => {
          if (tp.description.includes('START:') || tp.description.includes('Before:')) {
            const after = results.find(t =>
              (t as any).linkedCheckpointId === tp.id ||
              (t.description.includes('DONE:') || t.description.includes('FAILED:') || t.description.includes('After:')) &&
              t.description.slice(t.description.indexOf(':') + 1) === tp.description.slice(tp.description.indexOf(':') + 1)
            );
            if (after) { pairs.push({ before: tp, after }); } else { standalone.push(tp); }
          } else if (!results.some(t => (t as any).linkedCheckpointId === tp.id)) { standalone.push(tp); }
        });
        pairs.forEach(({ before, after }) => {
          console.log(`      \u2502`);
          console.log(`      \u251C\u2500\u252C\u2500 ${after.description.includes('DONE') ? 'OK' : 'FAIL'} ${after.description}`);
          console.log(`      \u2502 \u2502  ${C.dim}${timeAgo(after.timestamp)}${C.reset}`);
          console.log(`      \u2502 \u2514\u2500 ${before.description}`);
          console.log(`      \u2502    ${C.dim}${timeAgo(before.timestamp)}${C.reset}`);
        });
        if (standalone.length > 0) {
          console.log(`      \u2502`);
          console.log(`      ${C.dim}\u251C\u2500 Standalone checkpoints:${C.reset}`);
          standalone.forEach(tp => {
            console.log(`      \u2502  \u25CB ${tp.description} ${C.dim}(${timeAgo(tp.timestamp)})${C.reset}`);
          });
        }
      } else {
        results.forEach((tp) => {
          const ago = timeAgo(tp.timestamp);
          const connector = '\u251C\u2500';
          let statusIcon = '';
          if (tp.description.includes('START:') || tp.description.startsWith('Before:')) statusIcon = 'START';
          else if (tp.description.includes('DONE:') || tp.description.startsWith('After:')) statusIcon = 'DONE';
          else if (tp.description.includes('FAILED:')) statusIcon = 'FAIL';
          else if (tp.description.includes('Manual')) statusIcon = 'PIN';
          console.log(`      \u2502`);
          console.log(`      ${connector} ${statusIcon} ${tp.description}`);
          console.log(`      \u2502  ${C.dim}${tp.id.slice(0, 20)} \u2022 ${ago}${C.reset}`);
          if (tp.changesCount && tp.changesCount > 0) {
            console.log(`      \u2502  ${C.dim}${tp.changesCount} changes${C.reset}`);
          }
        });
      }
      console.log(`      \u2502`);
      console.log(`\n${C.dim}Use 'aitm restore <id>' to go back to any checkpoint${C.reset}`);
      console.log(`${C.dim}Use 'aitm timeline --file <path>' to filter by file${C.reset}\n`);
    });
}
