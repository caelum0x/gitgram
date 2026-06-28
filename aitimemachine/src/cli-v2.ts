#!/usr/bin/env node

/**
 * AITimeMachine CLI v2 - Thin registration shell.
 *
 * All commands are defined in src/cli/*-commands.ts modules.
 * This file only wires them together and handles top-level concerns
 * (program metadata, error handling, process signals).
 *
 * Top-level commands added here (not large enough for their own module):
 *   push    - push checkpoints to cloud
 *   pull    - pull checkpoints from cloud
 *   version - print CLI version information
 *   clog    - checkpoint log with --json support (alias: checkpoint history)
 */

import { Command } from 'commander';
import { createRequire } from 'module';
import { registerCheckpointCommands } from './cli/checkpoint-commands.js';
import { registerSearchCommands } from './cli/search-commands.js';
import { registerMcpCommands } from './cli/mcp-commands.js';
import { registerGitEnhancedCommands } from './cli/git-enhanced-commands.js';
import { registerTimeMachineCommands } from './cli/time-machine-commands.js';
import { registerConfigCommands } from './cli/config-commands.js';
import { registerGitLikeCommands } from './cli/git-like-commands.js';
import { registerSessionCommands } from './cli/session-commands.js';
import { registerAuthCommands } from './cli/auth-commands.js';
import { registerInspectCommands } from './cli/inspect-commands.js';
import { registerCloudCommands } from './cloud/cloud-commands.js';
import { registerSetupCommand } from './cli/setup-command.js';
import { registerWorktreeCommands } from './cli/worktree-commands.js';
import { registerAgentsCommands } from './cli/agents-commands.js';
import { registerWorkspaceCommands } from './cli/workspace-commands.js';
import { registerExportCommands } from './cli/export-commands.js';
import { registerMemoryCommands } from './cli/memory-commands.js';
import { registerConflictCommands } from './cli/conflict-commands.js';
import { registerWatchCommands } from './cli/watch-commands.js';
import { registerGitLikeExtraCommands } from './cli/git-like-extra-commands.js';
import { registerSessionToolCommands } from './cli/session-tool-commands.js';
import { registerDoctorCommands } from './cli/doctor-commands.js';
import { registerNaturalLanguageCommands } from './cli/natural-language-commands.js';
import { runInteractiveMode } from './cli/interactive-mode.js';

// ─── Program setup ──────────────────────────────────────────────────────────

const program = new Command();

// Resolve the package version at runtime so it always matches package.json.
const _require = createRequire(import.meta.url);
let PKG_VERSION = '2.0.0';
try {
  const pkg = _require('../package.json') as { version: string };
  PKG_VERSION = pkg.version;
} catch { /* fallback to hardcoded */ }

program
  .name('aitm')
  .description('Gitgram TimeMachine - Time travel for AI coding assistants')
  .version(PKG_VERSION);

// ─── Register command groups ────────────────────────────────────────────────

registerCheckpointCommands(program);     // checkpoint, list, show, preview, restore, back, restore-file, cat, diff, diff-file, stats, where, timeline
registerSearchCommands(program);         // search, search-conv, kb-search, ai-search, conv-search, find-restore
registerMcpCommands(program);            // mcp, mcp-tools, setup-mcp, daemon, daemon-*, install, uninstall, service-status, ui, serve
registerConfigCommands(program);         // init, setup-project, setup-all, status, install-hooks, sync, sync-config, sync-status, s3-*, export, import, sync-ai, config set|get|list
registerGitEnhancedCommands(program);    // diff-advanced, merge, resolve, history (git-quality algorithms, gc removed - lives in inspect-commands)
registerGitLikeCommands(program);        // stash, blame, reflog, history, tag, cherry-pick, show-ref, reset, clean, revert, shortlog, worktree, annotate, tags, report
registerSessionCommands(program);        // sessions, session, restore-session, session-diff, projects, log, watch, auto-checkpoint, bisect, ai-history, cursor-*, conversation, export-session, exec, replay, compare, restore-pattern, file-diff, timeline-query, file-history
registerAuthCommands(program);           // login, logout, whoami, register, api-key, audit, team-create, teams, user-create, users
registerInspectCommands(program);        // db-state, container-state, gemini-sessions, gc, pack-info, pack-verify, repack, ai-concepts, ai-focus, timeline-interactive
registerTimeMachineCommands(program);    // Time Machine experience (macOS-style)
registerSetupCommand(program);            // setup (auto-configure AITM MCP in AI agents)
registerCloudCommands(program);          // Cloud / Neon database integration
registerWorktreeCommands(program);       // worktree-restore restore|list|cleanup (git worktree isolation)
registerAgentsCommands(program);         // agents list|add|ready|done|show|watch (beads DAG task tracker)
registerWorkspaceCommands(program);      // workspace files|search|status|summary
registerExportCommands(program);         // export json|markdown|csv|report|git-history
registerMemoryCommands(program);         // memory list|search|show|tasks|remember|stats (unified memory layer)
registerConflictCommands(program);       // conflicts list|show|resolve|auto (sync conflict resolution)
registerWatchCommands(program);          // watch + daemon start|stop|status (auto-checkpoint)
registerGitLikeExtraCommands(program);   // extra git-like porcelain commands
registerSessionToolCommands(program);    // session tool commands
registerDoctorCommands(program);         // doctor (environment diagnostics with --json / --fix)
registerNaturalLanguageCommands(program);// ask, nl, find-cp, when, what-changed, back-to, back, fix, diagnose (natural-language checkpoint search + restore)

// ─── Inline top-level commands ───────────────────────────────────────────────
// Small commands that don't justify their own module live here.

const _C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

// version — print detailed version information (--version flag already exists,
// this command gives a richer output including Node version and platform).
program
  .command('version')
  .description('Show CLI version, Node version, and platform info')
  .option('-j, --json', 'Output as JSON')
  .action((opts: { json?: boolean }) => {
    const info = {
      version: PKG_VERSION,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    };
    if (opts.json) {
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log(`\n${_C.bright}AITimeMachine CLI${_C.reset}`);
      console.log(`  Version:  ${_C.cyan}${info.version}${_C.reset}`);
      console.log(`  Node:     ${info.node}`);
      console.log(`  Platform: ${info.platform}/${info.arch}`);
      console.log();
    }
  });

// push — push local checkpoints to configured cloud endpoint
program
  .command('push')
  .description('Push checkpoints to cloud (alias: aitm sync --all)')
  .option('--all', 'Push all checkpoints (default: only latest)', false)
  .option('--dry-run', 'Show what would be pushed without actually pushing')
  .option('-j, --json', 'Output as JSON')
  .action(async (opts: { all?: boolean; dryRun?: boolean; json?: boolean }) => {
    const { SecureSyncClient } = await import('./sync/secure-client.js');
    const { TimeMachineEngine } = await import('./core/engine.js');
    const path = await import('path');

    const engine = new TimeMachineEngine(process.cwd());
    const projectId = path.basename(process.cwd());
    const summaries = engine.listTimePoints();

    if (summaries.length === 0) {
      if (opts.json) {
        console.log(JSON.stringify({ ok: false, error: 'No checkpoints to push. Run: aitm checkpoint' }));
      } else {
        console.error(`${_C.red}[!]${_C.reset} No checkpoints to push. Run: aitm checkpoint`);
      }
      process.exitCode = 1;
      return;
    }

    const toSync = opts.all ? summaries : [summaries[summaries.length - 1]];

    if (opts.dryRun) {
      if (opts.json) {
        console.log(JSON.stringify({ dryRun: true, checkpoints: toSync.map(s => ({ id: s.id, description: s.description })) }));
      } else {
        console.log(`\n${_C.bright}Would push ${toSync.length} checkpoint(s):${_C.reset}\n`);
        for (const s of toSync) {
          console.log(`  ${_C.cyan}${s.id.slice(0, 16)}${_C.reset}  ${s.description}`);
        }
        console.log();
      }
      return;
    }

    const client = new SecureSyncClient();
    let synced = 0;
    const errors: string[] = [];

    for (const summary of toSync) {
      const cp = engine.getTimePoint(summary.id);
      if (!cp) continue;
      try {
        const result = await client.syncCheckpoint(projectId, cp);
        if (result.ok) {
          synced++;
        } else {
          errors.push(`${summary.id.slice(0, 12)}: sync returned not-ok`);
        }
      } catch (err) {
        errors.push(`${summary.id.slice(0, 12)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (opts.json) {
      console.log(JSON.stringify({ ok: errors.length === 0, synced, failed: errors.length, errors }));
    } else {
      if (synced > 0) {
        console.log(`${_C.green}[OK]${_C.reset} Pushed ${synced}/${toSync.length} checkpoint(s) to cloud`);
      }
      if (errors.length > 0) {
        console.error(`${_C.red}[!]${_C.reset} ${errors.length} checkpoint(s) failed:`);
        errors.forEach(e => console.error(`  - ${e}`));
        process.exitCode = 1;
      }
    }
  });

// pull — pull checkpoints from cloud into local store
program
  .command('pull')
  .description('Pull checkpoints from cloud into local store')
  .option('--all', 'Pull all available checkpoints (default: latest 10)')
  .option('--dry-run', 'Show what would be pulled without actually pulling')
  .option('-j, --json', 'Output as JSON')
  .action(async (opts: { all?: boolean; dryRun?: boolean; json?: boolean }) => {
    const { SecureSyncClient } = await import('./sync/secure-client.js');
    const path = await import('path');

    const projectId = path.basename(process.cwd());
    const client = new SecureSyncClient();

    let remoteCheckpoints: Array<{ id: string; description: string; timestamp: string }> = [];
    try {
      remoteCheckpoints = await client.listRemoteCheckpoints(projectId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (opts.json) {
        console.log(JSON.stringify({ ok: false, error: msg }));
      } else {
        console.error(`${_C.red}[!]${_C.reset} Failed to list remote checkpoints: ${msg}`);
        console.error(`${_C.dim}Tip: Configure sync with: aitm sync-config <endpoint> <api-key>${_C.reset}`);
      }
      process.exitCode = 1;
      return;
    }

    if (remoteCheckpoints.length === 0) {
      if (opts.json) {
        console.log(JSON.stringify({ ok: true, pulled: 0, message: 'No remote checkpoints found' }));
      } else {
        console.log(`${_C.yellow}[!]${_C.reset} No remote checkpoints found for project: ${projectId}`);
      }
      return;
    }

    const toPull = opts.all ? remoteCheckpoints : remoteCheckpoints.slice(0, 10);

    if (opts.dryRun) {
      if (opts.json) {
        console.log(JSON.stringify({ dryRun: true, checkpoints: toPull }));
      } else {
        console.log(`\n${_C.bright}Would pull ${toPull.length} checkpoint(s):${_C.reset}\n`);
        for (const c of toPull) {
          console.log(`  ${_C.cyan}${c.id.slice(0, 16)}${_C.reset}  ${c.description}  ${_C.dim}${c.timestamp}${_C.reset}`);
        }
        console.log();
      }
      return;
    }

    let pulled = 0;
    const errors: string[] = [];

    for (const remote of toPull) {
      try {
        await client.pullCheckpoint(projectId, remote.id);
        pulled++;
      } catch (err) {
        errors.push(`${remote.id.slice(0, 12)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (opts.json) {
      console.log(JSON.stringify({ ok: errors.length === 0, pulled, failed: errors.length, errors }));
    } else {
      if (pulled > 0) {
        console.log(`${_C.green}[OK]${_C.reset} Pulled ${pulled}/${toPull.length} checkpoint(s) from cloud`);
      }
      if (errors.length > 0) {
        console.error(`${_C.red}[!]${_C.reset} ${errors.length} checkpoint(s) failed:`);
        errors.forEach(e => console.error(`  - ${e}`));
        process.exitCode = 1;
      }
    }
  });

// clog — checkpoint log (the 'log' command is taken by session log).
// Provides 'aitm log --json' semantics for checkpoint history via 'aitm clog'.
program
  .command('clog')
  .description('Show checkpoint history (like git log). Use --json for machine-readable output.')
  .option('-n, --limit <n>', 'Limit number of entries', '20')
  .option('-j, --json', 'Output as JSON')
  .option('--oneline', 'One line per checkpoint')
  .action(async (opts: { limit?: string; json?: boolean; oneline?: boolean }) => {
    const { TimeMachineEngine } = await import('./core/engine.js');

    const engine = new TimeMachineEngine(process.cwd());
    const list = engine.listTimePoints().reverse().slice(0, parseInt(opts.limit ?? '20', 10));

    if (list.length === 0) {
      if (opts.json) {
        console.log(JSON.stringify([]));
      } else {
        console.log('No checkpoints yet. Run: aitm init');
      }
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(
        list.map(tp => ({
          id: tp.id,
          shortId: tp.id.slice(0, 12),
          description: tp.description,
          timestamp: tp.timestamp.toISOString(),
          trigger: tp.trigger ?? null,
          stats: tp.stats,
          changesCount: tp.changesCount ?? 0,
        })),
        null,
        2,
      ));
      return;
    }

    if (opts.oneline) {
      for (const tp of list) {
        console.log(`${_C.cyan}${tp.id.slice(0, 8)}${_C.reset} ${tp.description}`);
      }
      return;
    }

    for (const tp of list) {
      const ago = Math.floor((Date.now() - tp.timestamp.getTime()) / 1000);
      const agoStr = ago < 60 ? `${ago}s ago`
        : ago < 3600 ? `${Math.floor(ago / 60)}m ago`
        : ago < 86400 ? `${Math.floor(ago / 3600)}h ago`
        : `${Math.floor(ago / 86400)}d ago`;

      console.log(`${_C.yellow}checkpoint ${tp.id}${_C.reset}`);
      console.log(`Date:   ${tp.timestamp.toISOString()}  ${_C.dim}(${agoStr})${_C.reset}`);
      console.log(`\n    ${tp.description}\n`);
      console.log(`    Files: ${tp.stats.totalFiles}  Changes: ${tp.changesCount ?? 0}\n`);
    }
  });

// interactive — full-screen REPL menu (alias: i)
program
  .command('interactive')
  .alias('i')
  .description('Launch interactive REPL menu for AITM (alias: aitm i)')
  .action(async () => {
    await runInteractiveMode();
  });

// ─── Error handling ─────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

program.configureOutput({
  outputError: (str) =>
    console.error(`${C.red}[!]${C.reset} ${str.replace('error: ', '')}`),
});

function handleError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);

  const friendly: Record<string, string> = {
    ENOENT: 'File or directory not found',
    EACCES: 'Permission denied',
    ENOSPC: 'No space left on device',
    EEXIST: 'File already exists',
    EISDIR: 'Expected a file but found a directory',
    ENOTDIR: 'Expected a directory but found a file',
    EMFILE: 'Too many open files - try closing some applications',
    ECONNREFUSED: 'Connection refused - is the server running?',
  };

  const code = (err as NodeJS.ErrnoException).code;
  const hint = code && friendly[code] ? ` (${friendly[code]})` : '';

  console.error(`${C.red}[!] Error:${C.reset} ${msg}${hint}`);

  if (process.env.AITM_DEBUG && err instanceof Error && err.stack) {
    console.error(`${C.dim}${err.stack}${C.reset}`);
  }

  process.exit(1);
}

process.on('uncaughtException', handleError);
process.on('unhandledRejection', handleError);

// ─── Parse and run ──────────────────────────────────────────────────────────

program.parse();
