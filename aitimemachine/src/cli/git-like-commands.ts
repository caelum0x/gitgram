/**
 * Git-Like Commands
 *
 * stash, blame, reflog, history, tag, cherry-pick, show-ref, reset,
 * clean, revert, shortlog, worktree, annotate, tags, report
 */

import { Command } from 'commander';
import { TimeMachineEngine } from '../core/engine.js';
import { C, formatSize, timeAgo, parseTime } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function registerGitLikeCommands(program: Command): void {

  // Stash
  program
    .command('stash [message]')
    .description('Stash current changes (like git stash)')
    .option('-l, --list', 'List all stashes')
    .option('-p, --pop', 'Apply and remove latest stash')
    .option('-a, --apply [index]', 'Apply stash without removing')
    .option('-d, --drop [index]', 'Drop a stash')
    .option('-c, --clear', 'Clear all stashes')
    .action(async (message, opts) => {
      const stashDir = path.join(os.homedir(), '.aitimemachine', 'stashes', encodeURIComponent(process.cwd()));
      fs.mkdirSync(stashDir, { recursive: true });
      const stashIndex = path.join(stashDir, 'index.json');
      interface Stash { id: string; message: string; timestamp: string; checkpointId: string; }
      let stashes: Stash[] = [];
      if (fs.existsSync(stashIndex)) { stashes = JSON.parse(fs.readFileSync(stashIndex, 'utf-8')); }
      if (opts.list) {
        if (stashes.length === 0) { console.log('No stashes'); return; }
        console.log(`\n${C.bright}Stashes${C.reset}\n`);
        stashes.forEach((s, i) => { console.log(`  stash@{${i}}: ${s.message} ${C.dim}(${timeAgo(new Date(s.timestamp))})${C.reset}`); });
        return;
      }
      if (opts.clear) { stashes = []; fs.writeFileSync(stashIndex, '[]'); console.log('Cleared all stashes'); return; }
      if (opts.drop !== undefined) {
        const idx = typeof opts.drop === 'string' ? parseInt(opts.drop) : 0;
        if (idx < 0 || idx >= stashes.length) { console.log('Invalid stash index'); return; }
        const dropped = stashes.splice(idx, 1)[0];
        fs.writeFileSync(stashIndex, JSON.stringify(stashes, null, 2));
        console.log(`Dropped stash@{${idx}}: ${dropped.message}`);
        return;
      }
      const engine = new TimeMachineEngine(process.cwd());
      if (opts.pop || opts.apply !== undefined) {
        const idx = typeof opts.apply === 'string' ? parseInt(opts.apply) : 0;
        if (stashes.length === 0) { console.log('No stashes to apply'); return; }
        if (idx < 0 || idx >= stashes.length) { console.log('Invalid stash index'); return; }
        const stash = stashes[idx];
        engine.restore(stash.checkpointId);
        console.log(`${C.green}[OK]${C.reset} Applied stash@{${idx}}: ${stash.message}`);
        if (opts.pop) { stashes.splice(idx, 1); fs.writeFileSync(stashIndex, JSON.stringify(stashes, null, 2)); }
        return;
      }
      const tp = engine.capture(message || 'WIP', { type: 'manual' });
      stashes.unshift({ id: `stash_${Date.now()}`, message: message || 'WIP', timestamp: new Date().toISOString(), checkpointId: tp.id });
      fs.writeFileSync(stashIndex, JSON.stringify(stashes, null, 2));
      console.log(`${C.green}[OK]${C.reset} Saved working directory: ${message || 'WIP'}`);
      console.log(`   ${tp.stats.totalFiles} files stashed`);
    });

  // Blame
  program
    .command('blame <file>')
    .description('Show checkpoint info for each line (like git blame)')
    .option('-L <range>', 'Show only lines in range (e.g., 10,20)')
    .action(async (file, opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const timepoints = engine.listTimePoints();
      const fullPath = path.join(process.cwd(), file);
      if (!fs.existsSync(fullPath)) { console.log(`${C.red}[!]${C.reset} File not found: ${file}`); return; }
      const currentContent = fs.readFileSync(fullPath, 'utf-8');
      const lines = currentContent.split('\n');
      const lineInfo: Array<{ checkpoint: string; timestamp: Date; line: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        let found = false;
        for (let j = timepoints.length - 1; j >= 0; j--) {
          const content = engine.getFileAt(timepoints[j].id, file);
          if (content) {
            const oldLines = content.split('\n');
            if (oldLines[i] !== lines[i]) {
              const nextTp = timepoints[j + 1] || timepoints[j];
              lineInfo[i] = { checkpoint: nextTp.id, timestamp: nextTp.timestamp, line: lines[i] };
              found = true; break;
            }
          }
        }
        if (!found) { lineInfo[i] = { checkpoint: timepoints[0]?.id || 'unknown', timestamp: timepoints[0]?.timestamp || new Date(), line: lines[i] }; }
      }
      let start = 0, end = lines.length;
      if (opts.L) { const [s, e] = opts.L.split(',').map((n: string) => parseInt(n)); start = Math.max(0, s - 1); end = Math.min(lines.length, e || s); }
      console.log(`\n${C.bright}${file}${C.reset}\n`);
      for (let i = start; i < end; i++) {
        const info = lineInfo[i];
        const cpShort = info.checkpoint.slice(0, 8);
        const dateStr = info.timestamp.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        const lineNum = String(i + 1).padStart(4);
        console.log(`${C.cyan}${cpShort}${C.reset} ${C.dim}${dateStr}${C.reset} ${lineNum}) ${info.line}`);
      }
    });

  // Reflog
  program
    .command('reflog')
    .description('Show history of all operations (like git reflog)')
    .option('-n, --limit <n>', 'Limit entries', '20')
    .action(async (opts) => {
      const reflogPath = path.join(os.homedir(), '.aitimemachine', 'reflog', encodeURIComponent(process.cwd()) + '.json');
      interface ReflogEntry { action: string; checkpoint?: string; timestamp: string; details?: string; }
      let entries: ReflogEntry[] = [];
      if (fs.existsSync(reflogPath)) { entries = JSON.parse(fs.readFileSync(reflogPath, 'utf-8')); }
      const engine = new TimeMachineEngine(process.cwd());
      const tps = engine.listTimePoints();
      for (const tp of tps) { entries.push({ action: 'checkpoint', checkpoint: tp.id, timestamp: tp.timestamp.toISOString(), details: tp.description }); }
      entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      entries = entries.slice(0, parseInt(opts.limit));
      if (entries.length === 0) { console.log('No reflog entries'); return; }
      console.log(`\n${C.bright}Reflog${C.reset}\n`);
      entries.forEach((e, i) => {
        const cp = e.checkpoint ? e.checkpoint.slice(0, 8) : '--------';
        const ago = timeAgo(new Date(e.timestamp));
        console.log(`${C.cyan}${cp}${C.reset} HEAD@{${i}}: ${e.action}: ${e.details || ''} ${C.dim}(${ago})${C.reset}`);
      });
    });

  // History
  program
    .command('history')
    .alias('hist')
    .description('Show checkpoint history (like git log)')
    .option('-n, --limit <n>', 'Limit entries', '20')
    .option('--oneline', 'One line per checkpoint')
    .option('--graph', 'Show ASCII graph')
    .option('--stat', 'Show file change stats')
    .option('--since <date>', 'Show checkpoints since date')
    .option('--until <date>', 'Show checkpoints until date')
    .option('--author <pattern>', 'Filter by trigger type')
    .option('-p, --patch', 'Show diffs')
    .action(async (opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      let list = engine.listTimePoints().reverse();
      if (opts.since) { const since = parseTime(opts.since); list = list.filter(tp => tp.timestamp >= since); }
      if (opts.until) { const until = parseTime(opts.until); list = list.filter(tp => tp.timestamp <= until); }
      if (opts.author) { list = list.filter(tp => tp.trigger?.type?.includes(opts.author)); }
      list = list.slice(0, parseInt(opts.limit));
      if (list.length === 0) { console.log('No checkpoints'); return; }
      if (opts.graph) {
        for (let i = 0; i < list.length; i++) {
          const tp = list[i]; const isLast = i === list.length - 1;
          const connector = isLast ? '\u2514' : '\u251C'; const line = isLast ? ' ' : '\u2502';
          console.log(`${C.cyan}${connector}\u2500\u25CF${C.reset} ${C.yellow}${tp.id.slice(0, 8)}${C.reset} ${tp.description}`);
          console.log(`${C.cyan}${line}${C.reset}   ${C.dim}${tp.timestamp.toLocaleString()}${C.reset}`);
        }
        return;
      }
      if (opts.oneline) { for (const tp of list) { console.log(`${C.cyan}${tp.id.slice(0, 8)}${C.reset} ${tp.description}`); } return; }
      for (const tp of list) {
        console.log(`${C.yellow}checkpoint ${tp.id}${C.reset}`);
        console.log(`Date:   ${tp.timestamp.toISOString()}`);
        console.log(`\n    ${tp.description}\n`);
        if (opts.stat) {
          const full = engine.getTimePoint(tp.id);
          if (full?.changes) {
            const added = full.changes.added.length; const modified = full.changes.modified.length; const deleted = full.changes.deleted.length;
            if (added + modified + deleted > 0) { console.log(` ${added} additions, ${modified} modifications, ${deleted} deletions\n`); }
          }
        }
        if (opts.patch && list.indexOf(tp) < list.length - 1) {
          const next = list[list.indexOf(tp) + 1];
          const diff = engine.getDiff(next.id, tp.id);
          if (diff.modified.length > 0) {
            console.log(`${C.dim}--- Changes ---${C.reset}`);
            diff.modified.slice(0, 5).forEach(f => console.log(`  ${C.yellow}M ${f}${C.reset}`));
            diff.added.slice(0, 5).forEach(f => console.log(`  ${C.green}A ${f}${C.reset}`));
            diff.deleted.slice(0, 5).forEach(f => console.log(`  ${C.red}D ${f}${C.reset}`));
            console.log();
          }
        }
      }
    });

  // Tag
  program
    .command('tag [name] [checkpoint]')
    .description('Create or list tags (like git tag)')
    .option('-l, --list', 'List all tags')
    .option('-d, --delete <name>', 'Delete a tag')
    .option('-m, --message <msg>', 'Tag message')
    .action(async (name, checkpoint, opts) => {
      const tagDir = path.join(os.homedir(), '.aitimemachine', 'tags', encodeURIComponent(process.cwd()));
      fs.mkdirSync(tagDir, { recursive: true });
      const tagIndex = path.join(tagDir, 'index.json');
      interface Tag { name: string; checkpoint: string; message?: string; timestamp: string; }
      let tags: Tag[] = [];
      if (fs.existsSync(tagIndex)) { tags = JSON.parse(fs.readFileSync(tagIndex, 'utf-8')); }
      if (opts.list || (!name && !opts.delete)) {
        if (tags.length === 0) { console.log('No tags'); return; }
        console.log(`\n${C.bright}Tags${C.reset}\n`);
        for (const t of tags) { console.log(`  ${C.green}${t.name}${C.reset} \u2192 ${t.checkpoint.slice(0, 12)} ${t.message ? `"${t.message}"` : ''}`); }
        return;
      }
      if (opts.delete) {
        const idx = tags.findIndex(t => t.name === opts.delete);
        if (idx === -1) { console.log(`Tag not found: ${opts.delete}`); return; }
        tags.splice(idx, 1); fs.writeFileSync(tagIndex, JSON.stringify(tags, null, 2));
        console.log(`Deleted tag: ${opts.delete}`); return;
      }
      const engine = new TimeMachineEngine(process.cwd());
      let targetId = checkpoint;
      if (!targetId) { const list = engine.listTimePoints(); targetId = list[list.length - 1]?.id; }
      else { const list = engine.listTimePoints(); const match = list.find(tp => tp.id.startsWith(checkpoint)); if (match) targetId = match.id; }
      if (!targetId) { console.log('No checkpoint to tag'); return; }
      if (tags.some(t => t.name === name)) { console.log(`Tag already exists: ${name}`); return; }
      tags.push({ name, checkpoint: targetId, message: opts.message, timestamp: new Date().toISOString() });
      fs.writeFileSync(tagIndex, JSON.stringify(tags, null, 2));
      console.log(`${C.green}[OK]${C.reset} Created tag '${name}' at ${targetId.slice(0, 12)}`);
    });

  // Cherry-pick
  program
    .command('cherry-pick <checkpoint>')
    .description('Apply changes from a specific checkpoint (like git cherry-pick)')
    .action(async (checkpoint) => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      const match = list.find(tp => tp.id.startsWith(checkpoint));
      if (!match) { console.log(`Checkpoint not found: ${checkpoint}`); return; }
      const tp = engine.getTimePoint(match.id);
      if (!tp) return;
      const idx = list.findIndex(t => t.id === match.id);
      if (idx <= 0) { console.log('Cannot cherry-pick first checkpoint'); return; }
      const prevId = list[idx - 1].id;
      const diff = engine.getDiff(prevId, match.id);
      let applied = 0;
      // Use the Buffer API so binary files are applied byte-for-byte.
      for (const file of [...diff.added, ...diff.modified]) {
        const content = engine.getFileBufferAt(match.id, file);
        if (content) { const fullPath = path.join(process.cwd(), file); fs.mkdirSync(path.dirname(fullPath), { recursive: true }); fs.writeFileSync(fullPath, content); applied++; }
      }
      console.log(`${C.green}[OK]${C.reset} Cherry-picked ${match.id.slice(0, 12)}`);
      console.log(`   Applied ${applied} file changes`);
      console.log(`   ${C.dim}${tp.description}${C.reset}`);
    });

  // Show-ref
  program
    .command('show-ref')
    .description('Show all references (tags, HEAD)')
    .action(async () => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      const head = list[list.length - 1];
      console.log(`\n${C.bright}References${C.reset}\n`);
      if (head) { console.log(`  ${C.green}HEAD${C.reset} \u2192 ${head.id.slice(0, 12)} ${head.description}`); }
      const tagDir = path.join(os.homedir(), '.aitimemachine', 'tags', encodeURIComponent(process.cwd()));
      const tagIndex = path.join(tagDir, 'index.json');
      if (fs.existsSync(tagIndex)) {
        const tags = JSON.parse(fs.readFileSync(tagIndex, 'utf-8'));
        for (const t of tags) { console.log(`  ${C.yellow}tag: ${t.name}${C.reset} \u2192 ${t.checkpoint.slice(0, 12)}`); }
      }
    });

  // Reset
  program
    .command('reset [checkpoint]')
    .description('Reset to checkpoint (like git reset)')
    .option('--soft', 'Keep changes in working directory')
    .option('--hard', 'Discard all changes')
    .option('--mixed', 'Default: reset HEAD but keep working directory')
    .action(async (checkpoint, opts) => {
      const engine = new TimeMachineEngine(process.cwd());
      const list = engine.listTimePoints();
      const target = checkpoint ? list.find(tp => tp.id.startsWith(checkpoint)) : list[list.length - 2];
      if (!target) { console.log('Checkpoint not found'); return; }
      if (opts.hard) { engine.restore(target.id); console.log(`${C.green}[OK]${C.reset} Hard reset to ${target.id.slice(0, 12)}`); }
      else { console.log(`${C.green}[OK]${C.reset} Reset HEAD to ${target.id.slice(0, 12)}`); console.log(`   ${C.dim}Working directory unchanged${C.reset}`); }
    });

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
      // Use the Buffer API so binary files are restored byte-for-byte.
      for (const file of diff.deleted) {
        const content = engine.getFileBufferAt(prevId, file);
        if (content) { const fullPath = path.join(process.cwd(), file); fs.mkdirSync(path.dirname(fullPath), { recursive: true }); fs.writeFileSync(fullPath, content); reverted++; }
      }
      for (const file of diff.added) { const fullPath = path.join(process.cwd(), file); if (fs.existsSync(fullPath)) { fs.unlinkSync(fullPath); reverted++; } }
      for (const file of diff.modified) { const content = engine.getFileBufferAt(prevId, file); if (content) { fs.writeFileSync(path.join(process.cwd(), file), content); reverted++; } }
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
            // Buffer API keeps binary files intact in the worktree snapshot.
            const content = engine.getFileBufferAt(latest.id, f.path);
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
