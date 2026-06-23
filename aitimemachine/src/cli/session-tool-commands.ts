/**
 * Session Tool Commands
 *
 * exec, replay, compare, restore-pattern, file-diff, timeline-query,
 * file-history, bisect, auto-checkpoint, watch
 */

import { Command } from 'commander';
import { TimeMachineEngine } from '../core/engine.js';
import { C, formatSize, formatDate, timeAgo, formatDuration } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';

export function registerSessionToolCommands(program: Command): void {

  // Execute command
  program
    .command('exec <command>')
    .description('Execute command and log to conversation history')
    .action(async (command) => {
      const { ConversationLogger } = await import('../core/conversation-logger.js');
      const { EventStore } = await import('../core/event-store.js');
      const { executeAndLog } = await import('../tools/terminal-exec.js');
      const logger = new ConversationLogger(process.cwd());
      const eventStore = new EventStore(process.cwd());
      eventStore.load();
      console.log(`${C.cyan}Executing:${C.reset} ${command}\n`);
      const result = await executeAndLog(command, process.cwd(), logger, eventStore);
      console.log(`\n${C.dim}Exit code: ${result.exitCode}${C.reset}`);
      console.log(`${C.green}\u2713${C.reset} Command logged to conversation history\n`);
      process.exit(result.exitCode);
    });

  // Replay
  program
    .command('replay <session-id>')
    .description('Replay session step-by-step')
    .option('--step <number>', 'Replay to specific step', '0')
    .action(async (sessionId, options) => {
      const { ConversationLogger } = await import('../core/conversation-logger.js');
      const { EventStore } = await import('../core/event-store.js');
      const { SessionReplayer } = await import('../tools/session-replayer.js');
      const engine = new TimeMachineEngine(process.cwd());
      const logger = new ConversationLogger(process.cwd());
      const eventStore = new EventStore(process.cwd());
      eventStore.load();
      const replayer = new SessionReplayer(logger, eventStore, engine);
      const steps = replayer.getSteps(sessionId);
      console.log(`\n${C.bright}Session Replay${C.reset}\n`);
      console.log(`Total steps: ${steps.length}\n`);
      if (options.step) {
        const stepIndex = parseInt(options.step);
        await replayer.replayToStep(sessionId, stepIndex);
        console.log(`${C.green}\u2713${C.reset} Replayed to step ${stepIndex}\n`);
      } else {
        steps.forEach((step, i) => { console.log(`${C.dim}${i}.${C.reset} ${step.type} - ${step.timestamp.toISOString()}`); });
        console.log();
      }
    });

  // Compare
  program
    .command('compare <from> <to>')
    .description('Compare two checkpoints (files and conversation)')
    .option('--format <type>', 'Output format (text|json|markdown)', 'text')
    .action(async (from, to, options) => {
      const { ConversationLogger } = await import('../core/conversation-logger.js');
      const { EventStore } = await import('../core/event-store.js');
      const { CheckpointComparator } = await import('../tools/checkpoint-comparator.js');
      const engine = new TimeMachineEngine(process.cwd());
      const logger = new ConversationLogger(process.cwd());
      const eventStore = new EventStore(process.cwd());
      eventStore.load();
      const comparator = new CheckpointComparator(logger, eventStore, engine);
      try {
        const comparison = comparator.compare(from, to);
        if (options.format === 'json') { console.log(JSON.stringify(comparison, null, 2)); }
        else if (options.format === 'markdown') { console.log(comparator.generateReport(comparison)); }
        else {
          console.log(`\n${C.bright}Checkpoint Comparison${C.reset}\n`);
          console.log(`${C.cyan}From:${C.reset} ${comparison.from.description}`);
          console.log(`${C.cyan}To:${C.reset}   ${comparison.to.description}`);
          console.log(`${C.dim}Duration: ${formatDuration(comparison.timeDiff)}${C.reset}\n`);
          console.log(`${C.bright}File Changes:${C.reset}`);
          console.log(`  ${C.green}+${C.reset} ${comparison.fileChanges.added.length} added`);
          console.log(`  ${C.yellow}~${C.reset} ${comparison.fileChanges.modified.length} modified`);
          console.log(`  ${C.red}-${C.reset} ${comparison.fileChanges.deleted.length} deleted\n`);
          console.log(`${C.bright}Conversation:${C.reset}`);
          console.log(`  ${comparison.conversationChanges.messageCount} messages`);
          console.log(`  ${comparison.conversationChanges.toolCalls} tool calls\n`);
        }
      } catch (error: any) { console.error(`${C.red}Error:${C.reset} ${error.message}`); process.exit(1); }
    });

  // Restore-pattern
  program
    .command('restore-pattern <checkpoint> <patterns...>')
    .description('Restore specific files from checkpoint using glob patterns')
    .option('--strategy <type>', 'Conflict strategy (ours|theirs|abort)', 'abort')
    .option('--dry-run', 'Preview without restoring')
    .action(async (checkpoint, patterns, options) => {
      const { SelectiveRestore } = await import('../core/selective-restore.js');
      const engine = new TimeMachineEngine(process.cwd());
      const restore = new SelectiveRestore(engine);
      try {
        const result = restore.restore({ checkpointId: checkpoint, patterns, strategy: options.strategy, dryRun: options.dryRun });
        if (options.dryRun) {
          console.log(`\n${C.bright}Preview: Would restore${C.reset}\n`);
          result.restored.forEach(f => console.log(`  ${C.green}+${C.reset} ${f}`));
          if (result.conflicts.length > 0) { console.log(`\n${C.yellow}Conflicts:${C.reset}`); result.conflicts.forEach(c => console.log(`  ${C.yellow}!${C.reset} ${c.path}`)); }
        } else {
          console.log(`\n${C.green}\u2713${C.reset} Restored ${result.restored.length} files\n`);
          if (result.conflicts.length > 0) { console.log(`${C.yellow}Conflicts (${options.strategy}):${C.reset} ${result.conflicts.length}`); }
          if (result.skipped.length > 0) { console.log(`${C.dim}Skipped:${C.reset} ${result.skipped.length}`); }
        }
      } catch (error: any) { console.error(`${C.red}Error:${C.reset} ${error.message}`); process.exit(1); }
    });

  // File-diff
  program
    .command('file-diff <path> <from> [to]')
    .description('Show diff for specific file between checkpoints')
    .option('--format <type>', 'Format (unified|side-by-side)', 'unified')
    .action(async (filePath, from, to, options) => {
      const { FileComparator } = await import('../core/file-comparator.js');
      const engine = new TimeMachineEngine(process.cwd());
      const comparator = new FileComparator(engine);
      try {
        const diff = comparator.getFileDiff(filePath, from, to || 'current');
        if (diff) { console.log(diff); } else { console.log(`${C.yellow}No diff available${C.reset}`); }
      } catch (error: any) { console.error(`${C.red}Error:${C.reset} ${error.message}`); process.exit(1); }
    });

  // Timeline-query
  program
    .command('timeline-query')
    .description('Query timeline with filters')
    .option('--start <date>', 'Start date (ISO format)')
    .option('--end <date>', 'End date (ISO format)')
    .option('--file <path>', 'Filter by file path')
    .option('--limit <n>', 'Max results', '20')
    .action(async (options) => {
      const { TimelineIndex } = await import('../core/timeline-index.js');
      const engine = new TimeMachineEngine(process.cwd());
      const timeline = new TimelineIndex(engine);
      const query: any = {};
      if (options.start) query.startDate = new Date(options.start);
      if (options.end) query.endDate = new Date(options.end);
      if (options.file) query.filePath = options.file;
      query.limit = parseInt(options.limit);
      const results = timeline.query(query);
      console.log(`\n${C.bright}Timeline Query Results${C.reset}\n`);
      console.log(`Found ${results.length} checkpoints\n`);
      results.forEach(cp => { console.log(`${C.cyan}${cp.id}${C.reset} - ${cp.description}`); console.log(`  ${C.dim}${cp.timestamp.toISOString()} (${cp.files.length} files)${C.reset}`); });
    });

  // File-history
  program
    .command('file-history <path>')
    .description('Show version history of a file')
    .action(async (filePath) => {
      const { FileHistoryTracker } = await import('../core/file-history-tracker.js');
      const { TimelineIndex } = await import('../core/timeline-index.js');
      const engine = new TimeMachineEngine(process.cwd());
      const timeline = new TimelineIndex(engine);
      const tracker = new FileHistoryTracker(engine, timeline);
      const history = tracker.getFileHistory(filePath);
      console.log(`\n${C.bright}File History: ${filePath}${C.reset}\n`);
      console.log(`${history.versions.length} versions found\n`);
      history.versions.forEach((version, i) => {
        console.log(`${i + 1}. ${C.cyan}${version.checkpointId}${C.reset}`);
        console.log(`   ${version.timestamp.toISOString()}`);
        console.log(`   ${C.dim}Hash: ${version.hash.slice(0, 8)}... Size: ${version.size} bytes${C.reset}\n`);
      });
    });

  // Bisect
  program
    .command('bisect <command>')
    .description('Find when a test started failing (binary search through sessions)')
    .option('-g, --good <session>', 'Known good session to start from')
    .option('-v, --verbose', 'Show progress')
    .action(async (command, options) => {
      const { SmartRestore } = await import('../server/smart-restore.js');
      const smart = new SmartRestore();
      console.log(`\n${C.bright}Bisecting...${C.reset}`);
      console.log(`Command: ${C.cyan}${command}${C.reset}\n`);
      const result = await smart.bisect(process.cwd(), command, { goodSession: options.good, verbose: options.verbose });
      if (!result.success) { console.log(`${C.red}[!]${C.reset} ${result.error}`); return; }
      console.log(`\n${C.green}[OK] Found the breaking change!${C.reset}\n`);
      console.log(`${C.green}Last good:${C.reset}  ${result.lastGood!.id.slice(0, 20)}`);
      console.log(`            ${formatDate(result.lastGood!.createdAt)}`);
      console.log(`            "${result.lastGood!.trigger.description}"`);
      console.log();
      console.log(`${C.red}First bad:${C.reset}  ${result.firstBad!.id.slice(0, 20)}`);
      console.log(`            ${formatDate(result.firstBad!.createdAt)}`);
      console.log(`            "${result.firstBad!.trigger.description}"`);
      console.log();
      const diffs = result.firstBad!.diffs || [];
      if (diffs.length > 0) {
        console.log(`${C.bright}Changes in breaking session:${C.reset}`);
        for (const d of diffs.slice(0, 10)) {
          const icon = d.type === 'added' ? C.green + '+' : d.type === 'deleted' ? C.red + '-' : C.yellow + '~';
          console.log(`  ${icon} ${d.path}${C.reset}`);
        }
        if (diffs.length > 10) console.log(`  ${C.dim}... and ${diffs.length - 10} more${C.reset}`);
      }
      console.log(`\n${C.dim}Tested ${result.testedCount} sessions${C.reset}`);
      console.log(`\nTo restore to last good: ${C.cyan}aitm restore ${result.lastGood!.id.slice(0, 16)}${C.reset}`);
    });

  // Auto-checkpoint
  program
    .command('auto-checkpoint')
    .alias('ac')
    .description('Run smart auto-checkpoint rules (tests, build, etc.)')
    .option('-r, --rule <name>', 'Run specific rule')
    .option('-l, --list', 'List available rules')
    .option('--enable <name>', 'Enable a rule')
    .option('--disable <name>', 'Disable a rule')
    .action(async (options) => {
      const { SmartAutoCheckpoint } = await import('../core/smart-auto-checkpoint.js');
      const engine = new TimeMachineEngine(process.cwd());
      const auto = new SmartAutoCheckpoint(engine);
      if (options.list) {
        console.log(`\n${C.bright}Auto-Checkpoint Rules${C.reset}\n`);
        for (const rule of auto.getRules()) {
          const status = rule.enabled ? C.green + '\u2713' : C.dim + '\u25CB';
          console.log(`  ${status} ${C.cyan}${rule.name}${C.reset}`);
          console.log(`    ${C.dim}${rule.command}${C.reset}`);
        }
        console.log(); return;
      }
      if (options.enable) { auto.enableRule(options.enable, true); console.log(`${C.green}\u2713${C.reset} Enabled: ${options.enable}`); return; }
      if (options.disable) { auto.enableRule(options.disable, false); console.log(`${C.dim}\u25CB${C.reset} Disabled: ${options.disable}`); return; }
      if (options.rule) {
        console.log(`Running rule: ${C.cyan}${options.rule}${C.reset}\n`);
        const result = await auto.runRule(options.rule);
        console.log(result.success ? `${C.green}\u2713 Passed${C.reset}` : `${C.red}\u2717 Failed${C.reset}`);
        if (result.checkpointId) { console.log(`${C.cyan}Checkpoint: ${result.checkpointId.slice(0, 16)}${C.reset}`); }
        return;
      }
      console.log(`${C.bright}Running enabled rules...${C.reset}\n`);
      const results = await auto.runAllEnabled();
      for (const [name, result] of results) {
        const icon = result.success ? C.green + '\u2713' : C.red + '\u2717';
        console.log(`  ${icon} ${name}${C.reset} ${C.dim}(${result.duration}ms)${C.reset}`);
        if (result.checkpointId) { console.log(`    ${C.cyan}${result.checkpointId.slice(0, 16)}${C.reset}`); }
      }
    });

  // Watch
  program
    .command('watch <command>')
    .description('Watch command and auto-checkpoint on failures')
    .option('-i, --interval <seconds>', 'Check interval (0 for single run)', '30')
    .option('--no-checkpoint', 'Disable auto-checkpointing')
    .option('--max-errors <n>', 'Suggest restore after N errors', '5')
    .action(async (command, options) => {
      const { EnhancedErrorWatcher } = await import('../core/enhanced-error-watcher.js');
      const engine = new TimeMachineEngine(process.cwd());
      const watcher = new EnhancedErrorWatcher(engine);
      const interval = parseInt(options.interval) * 1000;
      console.log(`${C.bright}Watching: ${C.cyan}${command}${C.reset}`);
      if (interval > 0) console.log(`${C.dim}Interval: ${options.interval}s${C.reset}`);
      console.log();
      watcher.on('event', (event: any) => {
        const time = event.timestamp.toLocaleTimeString();
        switch (event.type) {
          case 'start': process.stdout.write(`[${time}] Running... `); break;
          case 'success': console.log(`${C.green}\u2713${C.reset} ${C.dim}(${event.data.duration}ms)${C.reset}`); break;
          case 'failure':
            console.log(`${C.red}\u2717${C.reset}`);
            if (event.data.errors?.length > 0) {
              event.data.errors.slice(0, 3).forEach((e: any) => {
                const color = e.pattern.severity === 'error' ? C.red : C.yellow;
                console.log(`  ${color}[${e.pattern.name}]${C.reset} ${e.match.slice(0, 80)}`);
                if (e.pattern.suggestion) { console.log(`    ${C.dim}${e.pattern.suggestion}${C.reset}`); }
              });
            }
            break;
          case 'checkpoint': console.log(`  ${C.cyan}Checkpoint: ${event.data.id.slice(0, 16)}${C.reset}`); break;
        }
      });
      watcher.on('suggest-restore', (data: any) => {
        console.log(`\n${C.yellow}${data.errorCount} consecutive failures${C.reset}`);
        console.log(`${C.dim}Last good checkpoint: ${data.checkpointId.slice(0, 16)}${C.reset}`);
        console.log(`${C.dim}Run: aitm restore ${data.checkpointId.slice(0, 16)}${C.reset}\n`);
      });
      await watcher.watch(command, { interval, autoCheckpoint: options.checkpoint !== false, maxErrors: parseInt(options.maxErrors) });
    });
}
