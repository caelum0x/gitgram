/**
 * Worktree Commands
 *
 * Isolated git worktree operations for safe AITM restore previews:
 *   worktree restore <checkpoint-id>
 *   worktree list
 *   worktree cleanup
 */

import { Command } from 'commander';
import { TimeMachineEngine } from '../core/engine.js';
import { WorktreeManager } from '../server/worktree-manager.js';
import { C, formatSize, timeAgo } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';

export function registerWorktreeCommands(program: Command): void {
  const worktreeCmd = program
    .command('worktree-restore')
    .description('Manage isolated git worktrees for safe restore previews');

  // ─── worktree restore ────────────────────────────────────────────────

  worktreeCmd
    .command('restore <checkpointId>')
    .description('Restore a checkpoint into an isolated git worktree')
    .action(async (checkpointId: string) => {
      const projectPath = process.cwd();
      const engine = new TimeMachineEngine(projectPath);

      // Resolve checkpoint by prefix match
      const timepoints = engine.listTimePoints();
      const match = timepoints.find(
        (tp) => tp.id === checkpointId || tp.id.startsWith(checkpointId)
      );
      if (!match) {
        console.error(
          `${C.red}[!]${C.reset} Checkpoint not found: ${checkpointId}`
        );
        process.exitCode = 1;
        return;
      }

      const fullCheckpointId = match.id;
      const manager = new WorktreeManager(projectPath);

      let worktree;
      try {
        worktree = manager.createRestoreWorktree(fullCheckpointId);
      } catch (err) {
        console.error(
          `${C.red}[!]${C.reset} ${(err as Error).message}`
        );
        process.exitCode = 1;
        return;
      }

      // Materialize checkpoint files into the worktree
      const tp = engine.getTimePoint(fullCheckpointId);
      if (!tp) {
        console.error(
          `${C.red}[!]${C.reset} Could not load checkpoint: ${fullCheckpointId}`
        );
        process.exitCode = 1;
        return;
      }

      let filesWritten = 0;
      let filesSkipped = 0;

      for (const file of tp.files) {
        // Use the Buffer API so binary files (images, compiled assets, etc.)
        // are materialized byte-for-byte instead of being corrupted by a
        // UTF-8 decode/encode round-trip.
        const content = engine.getFileBufferAt(fullCheckpointId, file.path);
        if (content === null) {
          filesSkipped++;
          continue;
        }

        const dest = path.join(worktree.path, file.path);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, content);
        filesWritten++;
      }

      console.log(
        `${C.green}[OK]${C.reset} Restored checkpoint to isolated worktree`
      );
      console.log(`   ${C.bright}Checkpoint:${C.reset} ${fullCheckpointId.slice(0, 20)}`);
      console.log(`   ${C.bright}Description:${C.reset} ${match.description}`);
      console.log(`   ${C.bright}Worktree:${C.reset} ${worktree.path}`);
      console.log(`   ${C.bright}Files:${C.reset} ${filesWritten} written, ${filesSkipped} skipped`);
      console.log();
      console.log(`   ${C.dim}Browse: cd ${worktree.path}${C.reset}`);
      console.log(
        `   ${C.dim}Diff:   diff -rq ${worktree.path} .${C.reset}`
      );
      console.log(
        `   ${C.dim}Cleanup: aitm worktree-restore cleanup${C.reset}`
      );
    });

  // ─── worktree list ───────────────────────────────────────────────────

  worktreeCmd
    .command('list')
    .description('List active AITM worktrees')
    .option('-j, --json', 'Output as JSON')
    .action(async (opts) => {
      const manager = new WorktreeManager(process.cwd());

      let worktrees;
      try {
        worktrees = manager.listWorktrees();
      } catch (err) {
        console.error(
          `${C.red}[!]${C.reset} ${(err as Error).message}`
        );
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(worktrees, null, 2));
        return;
      }

      if (worktrees.length === 0) {
        console.log('No active AITM worktrees');
        return;
      }

      console.log(`\n${C.bright}AITM Worktrees${C.reset} (${worktrees.length})\n`);
      for (const wt of worktrees) {
        const ago = timeAgo(new Date(wt.createdAt));
        console.log(
          `  ${C.cyan}${wt.checkpointId}${C.reset}  ${wt.path}  ${C.dim}(${ago})${C.reset}`
        );
      }
      console.log();
    });

  // ─── worktree cleanup ────────────────────────────────────────────────

  worktreeCmd
    .command('cleanup')
    .description('Remove all AITM worktrees')
    .action(async () => {
      const manager = new WorktreeManager(process.cwd());

      let removed;
      try {
        removed = manager.cleanupAll();
      } catch (err) {
        console.error(
          `${C.red}[!]${C.reset} ${(err as Error).message}`
        );
        process.exitCode = 1;
        return;
      }

      if (removed === 0) {
        console.log('No AITM worktrees to clean up');
      } else {
        console.log(
          `${C.green}[OK]${C.reset} Removed ${removed} worktree${removed !== 1 ? 's' : ''}`
        );
      }
    });
}
