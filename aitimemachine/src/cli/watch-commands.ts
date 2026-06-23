/**
 * Watch Commands
 *
 * watch        — Auto-checkpoint on file changes with live status dashboard
 * daemon start — Start AITM as a background daemon process
 * daemon stop  — Stop the running daemon
 * daemon status — Check daemon health and uptime
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { spawn } from 'child_process';
import { C, timeAgo } from './cli-helpers.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AITM_DIR = path.join(os.homedir(), '.aitm');
const PID_FILE = path.join(AITM_DIR, 'daemon.pid');
const LOG_FILE = path.join(AITM_DIR, 'daemon.log');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', '.aitimemachine'];
const DEBOUNCE_MS = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatchOptions {
  interval: string;
  exclude: string;
}

interface DaemonStartOptions {
  port: string;
}

interface WatchState {
  projectPath: string;
  filesWatched: number;
  lastChangedFile: string | null;
  lastChangedAt: Date | null;
  checkpointsToday: number;
  intervalMs: number;
  watchers: fs.FSWatcher[];
  debounceTimer: NodeJS.Timeout | null;
  intervalTimer: NodeJS.Timeout | null;
  pendingChanges: Set<string>;
  running: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureAtmDir(): void {
  fs.mkdirSync(AITM_DIR, { recursive: true });
}

function parseIntervalMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h)?$/.exec(value);
  if (!match) return DEFAULT_INTERVAL_MS;
  const n = parseInt(match[1], 10);
  const unit = match[2] ?? 'm';
  switch (unit) {
    case 'ms': return n;
    case 's':  return n * 1000;
    case 'h':  return n * 60 * 60 * 1000;
    default:   return n * 60 * 1000; // 'm'
  }
}

function countFiles(dir: string, excludes: string[]): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (excludes.includes(entry.name)) continue;
      if (entry.isDirectory()) {
        count += countFiles(path.join(dir, entry.name), excludes);
      } else {
        count += 1;
      }
    }
  } catch {
    // permission denied or similar — skip silently
  }
  return count;
}

function watchDirectory(
  dir: string,
  excludes: string[],
  state: WatchState,
  onChange: (filePath: string) => void,
): void {
  if (!fs.existsSync(dir)) return;

  const dirName = path.basename(dir);
  if (excludes.includes(dirName)) return;

  try {
    const watcher = fs.watch(dir, { persistent: true }, (_eventType, filename) => {
      if (!filename) return;
      const full = path.join(dir, filename);
      const rel = path.relative(state.projectPath, full);
      // Skip hidden/excluded paths
      if (rel.startsWith('.aitimemachine')) return;
      for (const exc of excludes) {
        if (rel.startsWith(exc + path.sep) || rel === exc) return;
      }
      onChange(rel);
    });
    state.watchers.push(watcher);

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !excludes.includes(entry.name)) {
        watchDirectory(path.join(dir, entry.name), excludes, state, onChange);
      }
    }
  } catch {
    // skip unreadable directories
  }
}

function createCheckpointNow(state: WatchState, reason: string): void {
  // Dynamic import to avoid pulling heavy deps at startup unless needed.
  // We shell out to `aitm checkpoint` to reuse the existing checkpoint pipeline
  // (SqliteRepo + CasStore + manifest build) without duplicating the logic here.
  const description = reason;
  const child = spawn(
    process.execPath,
    [process.argv[1] ?? 'aitm', 'checkpoint', description],
    { cwd: state.projectPath, stdio: 'pipe' },
  );
  child.on('close', (code) => {
    if (code === 0) {
      state.checkpointsToday += 1;
    }
  });
}

// ---------------------------------------------------------------------------
// Dashboard renderer
// ---------------------------------------------------------------------------

function clearScreen(): void {
  process.stdout.write('\x1Bc');
}

function renderDashboard(state: WatchState, excludes: string[]): void {
  clearScreen();

  const intervalLabel = state.intervalMs >= 60_000
    ? `${Math.round(state.intervalMs / 60_000)}m`
    : `${state.intervalMs / 1000}s`;

  const lastChange = state.lastChangedAt
    ? `${timeAgo(state.lastChangedAt)} (${state.lastChangedFile ?? ''})`
    : 'none';

  console.log(`${C.bright}${C.cyan}AITM Watch${C.reset} — Auto-Checkpoint Mode\n`);
  console.log(`  ${C.dim}Watching:${C.reset}          ${state.projectPath}`);
  console.log(`  ${C.dim}Files watched:${C.reset}     ${state.filesWatched}`);
  console.log(`  ${C.dim}Excluded:${C.reset}          ${excludes.join(', ')}`);
  console.log(`  ${C.dim}Last change:${C.reset}       ${lastChange}`);
  console.log(`  ${C.dim}Auto-checkpoint:${C.reset}   every ${intervalLabel}`);
  console.log(`  ${C.dim}Checkpoints today:${C.reset} ${state.checkpointsToday}`);
  console.log();
  console.log(`  ${C.dim}Press ${C.reset}${C.bright}Q${C.reset}${C.dim} to quit  ${C.reset}${C.bright}C${C.reset}${C.dim} to checkpoint now${C.reset}`);
}

// ---------------------------------------------------------------------------
// Watch command implementation
// ---------------------------------------------------------------------------

function runWatch(opts: WatchOptions): void {
  const projectPath = process.cwd();
  const excludes = opts.exclude
    ? opts.exclude.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_EXCLUDES;
  const intervalMs = parseIntervalMs(opts.interval ?? '5m');

  const state: WatchState = {
    projectPath,
    filesWatched: 0,
    lastChangedFile: null,
    lastChangedAt: null,
    checkpointsToday: 0,
    intervalMs,
    watchers: [],
    debounceTimer: null,
    intervalTimer: null,
    pendingChanges: new Set(),
    running: true,
  };

  // Count initial file set (cheap approximate)
  state.filesWatched = countFiles(projectPath, excludes);

  // File-change handler with debounce
  const onFileChange = (relPath: string): void => {
    state.lastChangedFile = relPath;
    state.lastChangedAt = new Date();
    state.pendingChanges.add(relPath);

    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => {
      // Mark change acknowledged — interval timer will pick it up
      renderDashboard(state, excludes);
    }, DEBOUNCE_MS);
  };

  watchDirectory(projectPath, excludes, state, onFileChange);

  // Periodic auto-checkpoint
  state.intervalTimer = setInterval(() => {
    if (state.pendingChanges.size > 0) {
      const count = state.pendingChanges.size;
      const label = count === 1
        ? `Auto: changed ${[...state.pendingChanges][0]}`
        : `Auto: ${count} files changed`;
      state.pendingChanges.clear();
      createCheckpointNow(state, label);
      renderDashboard(state, excludes);
    }
  }, intervalMs);

  // Keyboard input: Q = quit, C = manual checkpoint
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', (_ch: unknown, key: { name?: string; ctrl?: boolean } | undefined) => {
    if (!key) return;

    if (key.ctrl && key.name === 'c') {
      shutdown(state);
      return;
    }

    const name = (key.name ?? '').toLowerCase();

    if (name === 'q') {
      shutdown(state);
    } else if (name === 'c') {
      const label = 'Manual checkpoint via watch mode';
      createCheckpointNow(state, label);
      renderDashboard(state, excludes);
    }
  });

  // Initial render
  renderDashboard(state, excludes);
}

function shutdown(state: WatchState): void {
  state.running = false;

  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  if (state.intervalTimer) clearInterval(state.intervalTimer);
  for (const w of state.watchers) {
    try { w.close(); } catch { /* ignore */ }
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }

  process.stdout.write('\n');
  console.log(`${C.dim}Watch mode stopped.${C.reset}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Daemon helpers
// ---------------------------------------------------------------------------

function readPid(): number | null {
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readDaemonMeta(): { startedAt: string } | null {
  const metaPath = path.join(AITM_DIR, 'daemon.meta.json');
  try {
    const raw = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(raw) as { startedAt: string };
  } catch {
    return null;
  }
}

function writeDaemonMeta(pid: number): void {
  const metaPath = path.join(AITM_DIR, 'daemon.meta.json');
  const meta = { pid, startedAt: new Date().toISOString() };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Register commands
// ---------------------------------------------------------------------------

export function registerWatchCommands(program: Command): void {

  // -------------------------------------------------------------------------
  // aitm watch
  // -------------------------------------------------------------------------
  program
    .command('watch')
    .description('Watch current project and auto-checkpoint on file changes')
    .option('-i, --interval <duration>', 'Auto-checkpoint interval (e.g. 5m, 30s)', '5m')
    .option('-e, --exclude <patterns>', 'Comma-separated directories to exclude', DEFAULT_EXCLUDES.join(','))
    .action((opts: WatchOptions) => {
      runWatch(opts);
    });

  // -------------------------------------------------------------------------
  // aitm daemon (sub-command group)
  // -------------------------------------------------------------------------
  const daemonCmd = program
    .command('daemon')
    .description('Manage the AITM background daemon');

  // aitm daemon start
  daemonCmd
    .command('start')
    .description('Start AITM daemon in the background')
    .option('-p, --port <port>', 'Port for daemon HTTP interface', '9999')
    .action((opts: DaemonStartOptions) => {
      ensureAtmDir();

      const existingPid = readPid();
      if (existingPid !== null && isProcessAlive(existingPid)) {
        console.log(`${C.yellow}[!]${C.reset} Daemon already running (PID ${existingPid})`);
        process.exit(1);
      }

      // Spawn a detached watch process that redirects stdout/stderr to log
      const logFd = fs.openSync(LOG_FILE, 'a');
      const child = spawn(
        process.execPath,
        [
          process.argv[1] ?? 'aitm',
          'watch',
          '--interval', '5m',
        ],
        {
          detached: true,
          stdio: ['ignore', logFd, logFd],
          env: {
            ...process.env,
            AITM_DAEMON_PORT: opts.port,
            AITM_DAEMON_MODE: '1',
          },
        },
      );

      child.unref();
      fs.closeSync(logFd);

      const pid = child.pid;
      if (pid === undefined) {
        console.error(`${C.red}[!]${C.reset} Failed to start daemon`);
        process.exit(1);
      }

      fs.writeFileSync(PID_FILE, String(pid), 'utf8');
      writeDaemonMeta(pid);

      console.log(`${C.green}[OK]${C.reset} AITM daemon started`);
      console.log(`     PID:  ${pid}`);
      console.log(`     Port: ${opts.port}`);
      console.log(`     Log:  ${LOG_FILE}`);
      console.log(`     PID file: ${PID_FILE}`);
    });

  // aitm daemon stop
  daemonCmd
    .command('stop')
    .description('Stop the running AITM daemon')
    .action(() => {
      const pid = readPid();
      if (pid === null) {
        console.log(`${C.yellow}[!]${C.reset} No PID file found — daemon may not be running`);
        process.exit(1);
      }

      if (!isProcessAlive(pid)) {
        console.log(`${C.yellow}[!]${C.reset} Process ${pid} is not running (stale PID file removed)`);
        try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
        process.exit(0);
      }

      try {
        process.kill(pid, 'SIGTERM');
        // Give it a moment, then verify
        setTimeout(() => {
          if (!isProcessAlive(pid)) {
            try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
            console.log(`${C.green}[OK]${C.reset} Daemon stopped (PID ${pid})`);
          } else {
            // Force kill
            try {
              process.kill(pid, 'SIGKILL');
              try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
              console.log(`${C.green}[OK]${C.reset} Daemon force-killed (PID ${pid})`);
            } catch (err: unknown) {
              console.error(`${C.red}[!]${C.reset} Failed to kill daemon: ${err instanceof Error ? err.message : String(err)}`);
              process.exit(1);
            }
          }
        }, 500);
      } catch (err: unknown) {
        console.error(`${C.red}[!]${C.reset} Failed to send signal: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  // aitm daemon status
  daemonCmd
    .command('status')
    .description('Show daemon running status and uptime')
    .action(() => {
      const pid = readPid();

      if (pid === null) {
        console.log(`${C.dim}Daemon:${C.reset} ${C.red}not running${C.reset} (no PID file)`);
        process.exit(0);
      }

      const alive = isProcessAlive(pid);

      if (!alive) {
        console.log(`${C.dim}Daemon:${C.reset} ${C.red}not running${C.reset} (stale PID ${pid})`);
        console.log(`  Run ${C.cyan}aitm daemon start${C.reset} to start`);
        process.exit(0);
      }

      const meta = readDaemonMeta();
      const startedAt = meta?.startedAt ? new Date(meta.startedAt) : null;
      const uptimeLabel = startedAt ? timeAgo(startedAt) : 'unknown';

      console.log(`${C.dim}Daemon:${C.reset} ${C.green}running${C.reset}`);
      console.log(`  PID:     ${pid}`);
      console.log(`  Uptime:  ${uptimeLabel}`);
      console.log(`  Log:     ${LOG_FILE}`);
      if (startedAt) {
        console.log(`  Started: ${startedAt.toLocaleString()}`);
      }
    });
}
