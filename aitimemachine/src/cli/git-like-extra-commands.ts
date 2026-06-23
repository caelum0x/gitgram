/**
 * Git-Like Extra Commands
 *
 * clean, revert, shortlog, worktree, annotate, tags, report
 */

import { Command } from 'commander';
import { TimeMachineEngine } from '../core/engine.js';
import { C, formatSize, timeAgo } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function registerGitLikeExtraCommands(program: Command): void {

  // Clean
  program
    .command('clean')
    .description('Remove files not in latest checkpoint (like git clean)')
    .option('-n, --dry-run', 'Show what would be removed')
    .option('-f, --force', 'Actually remove files')
    .option('-d', 'Also remove directories')
    .action(async (opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      if (list.length === 0) { console.log('No checkpoints'); return; }
      const latest = engine.getTimePoint(list[list.length - 1].id);
      if (!latest) return;
      const trackedFiles = new Set(latest.files.map(f => f.path));
      const toRemove: string[] = [];
      const scanDir = (dir: string, base = '') => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const rel = base ? `${base}/${entry.name}` : entry.name;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) { if (opts.d) scanDir(full, rel); }
          else if (!trackedFiles.has(rel)) { toRemove.push(rel); }
        }
      };
      scanDir(process.cwd());
      if (toRemove.length === 0) { console.log('Nothing to clean'); return; }
      console.log(`\n${opts.dryRun ? 'Would remove' : 'Removing'}:\n`);
      for (const f of toRemove.slice(0, 20)) { console.log(`  ${C.red}- ${f}${C.reset}`); }
      if (toRemove.length > 20) console.log(`  ${C.dim}... and ${toRemove.length - 20} more${C.reset}`);
      if (!opts.dryRun && opts.force) {
        for (const f of toRemove) { fs.unlinkSync(path.join(process.cwd(), f)); }
        console.log(`\n${C.green}[OK]${C.reset} Removed ${toRemove.length} files`);
      } else if (!opts.dryRun) { console.log(`\n${C.dim}Use --force to actually remove files${C.reset}`); }
    });

  // Revert
  program
    .command('revert <checkpoint>')
    .description('Create checkpoint that undoes changes (like git revert)')
    .action(async (checkpoint) => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      const match = list.find(tp => tp.id.startsWith(checkpoint));
      if (!match) { console.log(`Checkpoint not found: ${checkpoint}`); return; }
      const idx = list.findIndex(t => t.id === match.id);
      if (idx <= 0) { console.log('Cannot revert first checkpoint'); return; }
      const prevId = list[idx - 1].id;
      const diff = engine.getDiff(prevId, match.id);
      let reverted = 0;
      for (const file of diff.deleted) {
        const content = engine.getFileAt(prevId, file);
        if (content) { const fullPath = path.join(process.cwd(), file); fs.mkdirSync(path.dirname(fullPath), { recursive: true }); fs.writeFileSync(fullPath, content); reverted++; }
      }
      for (const file of diff.added) { const fullPath = path.join(process.cwd(), file); if (fs.existsSync(fullPath)) { fs.unlinkSync(fullPath); reverted++; } }
      for (const file of diff.modified) { const content = engine.getFileAt(prevId, file); if (content) { fs.writeFileSync(path.join(process.cwd(), file), content); reverted++; } }
      const tp = engine.capture(`Revert "${match.description}"`, { type: 'manual' });
      console.log(`${C.green}[OK]${C.reset} Reverted ${match.id.slice(0, 12)}`);
      console.log(`   ${reverted} files changed`);
      console.log(`   New checkpoint: ${tp.id.slice(0, 12)}`);
    });

  // Shortlog
  program
    .command('shortlog')
    .description('Summarize checkpoint history (like git shortlog)')
    .option('-n, --numbered', 'Sort by number of checkpoints')
    .option('-s, --summary', 'Show only counts')
    .action(async (opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      const byType: Record<string, string[]> = {};
      for (const tp of list) { const type = tp.trigger?.type || 'manual'; if (!byType[type]) byType[type] = []; byType[type].push(tp.description); }
      const entries = Object.entries(byType);
      if (opts.numbered) { entries.sort((a, b) => b[1].length - a[1].length); }
      console.log(`\n${C.bright}Checkpoint Summary${C.reset}\n`);
      for (const [type, descs] of entries) {
        console.log(`${C.cyan}${type}${C.reset} (${descs.length}):`);
        if (!opts.summary) { for (const d of descs.slice(0, 5)) { console.log(`      ${d.slice(0, 60)}`); } if (descs.length > 5) console.log(`      ${C.dim}... and ${descs.length - 5} more${C.reset}`); }
        console.log();
      }
    });

  // Worktree
  program
    .command('worktree <action> [path]')
    .description('Manage working directory snapshots')
    .action(async (action, targetPath) => {
      const worktreeDir = path.join(os.homedir(), '.aitimemachine', 'worktrees', encodeURIComponent(process.cwd()));
      fs.mkdirSync(worktreeDir, { recursive: true });
      if (action === 'list') {
        const entries = fs.existsSync(worktreeDir) ? fs.readdirSync(worktreeDir) : [];
        if (entries.length === 0) { console.log('No worktrees'); return; }
        console.log(`\n${C.bright}Worktrees${C.reset}\n`);
        for (const e of entries) { console.log(`  ${e}`); }
      } else if (action === 'add' && targetPath) {
        const engine = new TimeMachineEngine(process.cwd());
        const list = engine.listTimePoints();
        const latest = list[list.length - 1];
        if (!latest) { console.log('No checkpoints'); return; }
        const wtPath = path.join(worktreeDir, targetPath);
        fs.mkdirSync(wtPath, { recursive: true });
        const tp = engine.getTimePoint(latest.id);
        if (tp) {
          for (const f of tp.files.slice(0, 100)) {
            const content = engine.getFileAt(latest.id, f.path);
            if (content) { const dest = path.join(wtPath, f.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, content); }
          }
        }
        console.log(`${C.green}[OK]${C.reset} Created worktree: ${targetPath}`);
      } else if (action === 'remove' && targetPath) {
        const wtPath = path.join(worktreeDir, targetPath);
        if (fs.existsSync(wtPath)) { fs.rmSync(wtPath, { recursive: true }); console.log(`Removed worktree: ${targetPath}`); }
      }
    });

  // Annotate
  program
    .command('annotate <checkpoint>')
    .alias('note')
    .description('Add notes or tags to a checkpoint')
    .option('-n, --note <text>', 'Set note text')
    .option('-t, --tag <tag>', 'Add a tag')
    .option('--remove-tag <tag>', 'Remove a tag')
    .option('-s, --show', 'Show current annotations')
    .action(async (checkpoint, options) => {
      const { AnnotationStore } = await import('../core/annotation-store.js');
      const engine = new TimeMachineEngine(process.cwd());
      const store = new AnnotationStore(process.cwd());
      const list = engine.listTimePoints();
      const match = list.find(t => t.id === checkpoint || t.id.startsWith(checkpoint));
      if (!match) { console.log(`${C.red}Checkpoint not found: ${checkpoint}${C.reset}`); return; }
      if (options.show || (!options.note && !options.tag && !options.removeTag)) {
        const ann = store.get(match.id);
        console.log(`\n${C.bright}Checkpoint: ${match.description}${C.reset}`);
        console.log(`${C.dim}ID: ${match.id}${C.reset}\n`);
        if (ann) {
          if (ann.notes) console.log(`${C.cyan}Notes:${C.reset} ${ann.notes}`);
          if (ann.tags.length) console.log(`${C.cyan}Tags:${C.reset} ${ann.tags.join(', ')}`);
          if (!ann.notes && !ann.tags.length) console.log(`${C.dim}No annotations${C.reset}`);
        } else { console.log(`${C.dim}No annotations${C.reset}`); }
        console.log(); return;
      }
      if (options.note) { store.setNote(match.id, options.note); console.log(`${C.green}\u2713${C.reset} Note saved`); }
      if (options.tag) { store.addTag(match.id, options.tag); console.log(`${C.green}\u2713${C.reset} Tag added: ${options.tag}`); }
      if (options.removeTag) {
        if (store.removeTag(match.id, options.removeTag)) { console.log(`${C.green}\u2713${C.reset} Tag removed: ${options.removeTag}`); }
        else { console.log(`${C.yellow}Tag not found: ${options.removeTag}${C.reset}`); }
      }
    });

  // List tags (annotation-based)
  program
    .command('tags')
    .description('List all checkpoint tags')
    .option('-t, --tag <tag>', 'Show checkpoints with specific tag')
    .action(async (options) => {
      const { AnnotationStore } = await import('../core/annotation-store.js');
      const store = new AnnotationStore(process.cwd());
      if (options.tag) {
        const annotations = store.getByTag(options.tag);
        console.log(`\n${C.bright}Checkpoints tagged "${options.tag}"${C.reset} (${annotations.length})\n`);
        for (const ann of annotations) {
          console.log(`  ${C.cyan}${ann.checkpointId.slice(0, 16)}${C.reset}`);
          if (ann.notes) console.log(`    ${C.dim}${ann.notes.slice(0, 60)}${C.reset}`);
        }
      } else {
        const tags = store.getAllTags();
        console.log(`\n${C.bright}All Tags${C.reset} (${tags.length})\n`);
        for (const tag of tags) { const count = store.getByTag(tag).length; console.log(`  ${C.cyan}${tag}${C.reset} ${C.dim}(${count})${C.reset}`); }
      }
      console.log();
    });

  // Report
  program
    .command('report <from> [to]')
    .description('Generate markdown comparison report')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .option('--checkpoint', 'Generate single checkpoint report')
    .action(async (from, to, options) => {
      const { CheckpointReportGenerator } = await import('../core/checkpoint-report.js');
      const { AnnotationStore } = await import('../core/annotation-store.js');
      const engine = new TimeMachineEngine(process.cwd());
      const annotations = new AnnotationStore(process.cwd());
      const generator = new CheckpointReportGenerator(engine, annotations);
      const list = engine.listTimePoints();
      const fromMatch = list.find(t => t.id === from || t.id.startsWith(from));
      if (!fromMatch) { console.log(`${C.red}Checkpoint not found: ${from}${C.reset}`); return; }
      let markdown: string;
      if (options.checkpoint) { markdown = generator.generateCheckpointReport(fromMatch.id); }
      else { const toMatch = to ? list.find(t => t.id === to || t.id.startsWith(to)) : undefined; const result = generator.generateComparison(fromMatch.id, toMatch?.id); markdown = result.markdown; }
      if (options.output) { fs.writeFileSync(options.output, markdown); console.log(`${C.green}\u2713${C.reset} Report saved to: ${options.output}`); }
      else { console.log(markdown); }
    });
}
