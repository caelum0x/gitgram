/**
 * Interactive Mode — REPL-style menu-driven interface for AITM CLI.
 *
 *   aitm interactive   (alias: aitm i)
 *
 * Features:
 *   - ASCII art banner on entry
 *   - Session info header (project path, checkpoint count)
 *   - Numbered menu with 8 top-level actions
 *   - Tab completion for common commands
 *   - ANSI colorized output (no chalk dependency)
 *   - Arrow-key history via readline's built-in history
 *   - confirm() and selectFromList() helpers used throughout
 */

import * as readline from 'readline';
import * as path from 'path';

// ─── ANSI color palette ──────────────────────────────────────────────────────

const C = {
  reset:   '\x1b[0m',
  bright:  '\x1b[1m',
  dim:     '\x1b[2m',
  italic:  '\x1b[3m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  bgBlue:  '\x1b[44m',
  bgCyan:  '\x1b[46m',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface MenuOption {
  key: string;
  label: string;
  description: string;
}

interface SessionInfo {
  projectPath: string;
  projectName: string;
  checkpointCount: number;
  latestCheckpoint: string | null;
  syncStatus: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MENU_OPTIONS: MenuOption[] = [
  { key: '1', label: 'List sessions',    description: 'Browse all captured sessions'            },
  { key: '2', label: 'Create checkpoint', description: 'Save the current project state'          },
  { key: '3', label: 'Restore session',  description: 'Travel back to a previous snapshot'       },
  { key: '4', label: 'View sync status', description: 'Show cloud sync health and last push'     },
  { key: '5', label: 'Agent tasks',      description: 'Manage AI agent beads (DAG task tracker)' },
  { key: '6', label: 'Export',           description: 'Export history as JSON / Markdown / CSV'  },
  { key: '7', label: 'Settings',         description: 'View and edit AITM configuration'         },
  { key: '8', label: 'Quit',             description: 'Exit interactive mode'                    },
];

const TAB_COMPLETIONS = [
  '1', '2', '3', '4', '5', '6', '7', '8',
  'list', 'checkpoint', 'restore', 'sync', 'agents', 'export', 'settings', 'quit', 'q', 'help', '?',
];

const BANNER = `
${C.cyan}${C.bright}   █████╗ ██╗████████╗███╗   ███╗${C.reset}
${C.cyan}${C.bright}  ██╔══██╗██║╚══██╔══╝████╗ ████║${C.reset}
${C.cyan}${C.bright}  ███████║██║   ██║   ██╔████╔██║${C.reset}
${C.cyan}${C.bright}  ██╔══██║██║   ██║   ██║╚██╔╝██║${C.reset}
${C.cyan}${C.bright}  ██║  ██║██║   ██║   ██║ ╚═╝ ██║${C.reset}
${C.cyan}${C.bright}  ╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝     ╚═╝${C.reset}
${C.dim}  AITimeMachine — Time travel for AI coding assistants${C.reset}
`;

// ─── Low-level readline utilities ────────────────────────────────────────────

/**
 * Create a readline interface with tab completion wired in.
 * The interface is kept open for the entire session and shared via closure.
 */
function createRl(): readline.Interface {
  const completer = (line: string): [string[], string] => {
    const hits = TAB_COMPLETIONS.filter(c => c.startsWith(line));
    return [hits.length ? hits : TAB_COMPLETIONS, line];
  };

  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    terminal: true,
  });
}

/**
 * Ask a single question and return the trimmed answer.
 */
export async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

/**
 * Ask a yes/no question. Returns true if the user answers 'y' or 'yes'.
 */
export async function confirm(rl: readline.Interface, question: string): Promise<boolean> {
  const answer = await prompt(rl, `${C.yellow}?${C.reset} ${question} ${C.dim}(y/N)${C.reset} `);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Present a numbered list and return the 0-based index chosen.
 * Returns -1 if the input is invalid or the user cancels (empty).
 */
export async function selectFromList(rl: readline.Interface, items: string[]): Promise<number> {
  items.forEach((item, i) => {
    console.log(`  ${C.cyan}${i + 1}.${C.reset} ${item}`);
  });
  console.log();
  const raw = await prompt(rl, `${C.dim}Enter number (or press Enter to cancel):${C.reset} `);
  if (!raw) return -1;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1 || n > items.length) {
    console.log(`${C.yellow}  Invalid selection.${C.reset}`);
    return -1;
  }
  return n - 1;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H');
}

/**
 * Print the 8-option main menu.
 */
export function printMenu(options: MenuOption[] = MENU_OPTIONS): void {
  const width = 56;
  const border = `${C.dim}${'─'.repeat(width)}${C.reset}`;

  console.log();
  console.log(border);
  console.log(`${C.bright}  Main Menu${C.reset}`);
  console.log(border);

  for (const opt of options) {
    const label = `${C.bright}${opt.key}.${C.reset} ${C.white}${opt.label}${C.reset}`;
    const desc  = `${C.dim}${opt.description}${C.reset}`;
    console.log(`  ${label}`);
    console.log(`     ${desc}`);
  }

  console.log(border);
  console.log(`${C.dim}  Type a number, or "help" / "?" for tips, "q" to quit.${C.reset}`);
  console.log();
}

/**
 * Gather live session / checkpoint info from the engine (best-effort).
 */
async function loadSessionInfo(): Promise<SessionInfo> {
  const projectPath = process.cwd();
  const projectName = path.basename(projectPath);

  let checkpointCount = 0;
  let latestCheckpoint: string | null = null;
  let syncStatus = 'unknown';

  try {
    const { TimeMachineEngine } = await import('../core/engine.js');
    const engine = new TimeMachineEngine(projectPath);
    const points = engine.listTimePoints();
    checkpointCount = points.length;
    if (points.length > 0) {
      const latest = points[points.length - 1];
      latestCheckpoint = latest.description ?? latest.id.slice(0, 16);
    }
  } catch {
    // Engine not initialised — show zeros
  }

  try {
    const { SecureSyncClient } = await import('../sync/secure-client.js');
    const client = new SecureSyncClient();
    const projectId = projectName;
    const remote = await client.listRemoteCheckpoints(projectId);
    syncStatus = remote.length > 0 ? `${remote.length} remote checkpoint(s)` : 'no remote checkpoints';
  } catch {
    syncStatus = 'not configured';
  }

  return { projectPath, projectName, checkpointCount, latestCheckpoint, syncStatus };
}

/**
 * Render the session info header below the banner.
 */
function printSessionInfo(info: SessionInfo): void {
  const width = 56;
  const border = `${C.dim}${'─'.repeat(width)}${C.reset}`;

  console.log(border);
  console.log(
    `  ${C.dim}Project:${C.reset}     ${C.cyan}${info.projectName}${C.reset}  ${C.dim}(${info.projectPath})${C.reset}`
  );
  console.log(
    `  ${C.dim}Checkpoints:${C.reset} ${C.green}${info.checkpointCount}${C.reset} saved` +
    (info.latestCheckpoint ? `  ${C.dim}— latest: ${info.latestCheckpoint}${C.reset}` : '')
  );
  console.log(
    `  ${C.dim}Sync:${C.reset}        ${C.yellow}${info.syncStatus}${C.reset}`
  );
  console.log(border);
}

// ─── Action handlers ─────────────────────────────────────────────────────────

async function handleListSessions(rl: readline.Interface): Promise<void> {
  console.log(`\n${C.bright}[+] Sessions${C.reset}\n`);
  try {
    const { SessionServer } = await import('../server/index.js');
    const server = new SessionServer();
    const sessions = server.listSessions(process.cwd()).slice(0, 15);

    if (sessions.length === 0) {
      console.log(`  ${C.dim}No sessions yet. Run the daemon first: aitm daemon${C.reset}`);
    } else {
      for (const s of sessions) {
        const ts = new Date(s.createdAt).toLocaleString();
        console.log(
          `  ${C.cyan}*${C.reset} ${C.white}${ts}${C.reset}  ${C.dim}${s.id.slice(0, 20)}${C.reset}`
        );
        if (s.description) {
          console.log(`    ${s.description}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${C.red}Error loading sessions: ${msg}${C.reset}`);
  }

  console.log();
  await prompt(rl, `${C.dim}Press Enter to return to menu...${C.reset}`);
}

async function handleCreateCheckpoint(rl: readline.Interface): Promise<void> {
  console.log(`\n${C.bright}[+] Create Checkpoint${C.reset}\n`);

  const description = await prompt(
    rl,
    `${C.dim}Description (optional, press Enter to skip):${C.reset} `
  );

  const yes = await confirm(rl, `Save checkpoint${description ? ` "${description}"` : ''}?`);
  if (!yes) {
    console.log(`${C.dim}  Cancelled.${C.reset}\n`);
    return;
  }

  console.log(`\n  ${C.dim}Creating checkpoint...${C.reset}`);

  try {
    const { TimeMachineEngine } = await import('../core/engine.js');
    const engine = new TimeMachineEngine(process.cwd());
    const tp = engine.capture(description || 'Interactive checkpoint', { type: 'manual' });
    console.log(`\n  ${C.green}[OK]${C.reset} Checkpoint created: ${C.cyan}${tp.id.slice(0, 16)}${C.reset}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`\n  ${C.red}[!] Failed: ${msg}${C.reset}`);
    console.log(`  ${C.dim}Tip: Run "aitm init" to initialise AITM in this project.${C.reset}`);
  }

  console.log();
  await prompt(rl, `${C.dim}Press Enter to return to menu...${C.reset}`);
}

async function handleRestoreSession(rl: readline.Interface): Promise<void> {
  console.log(`\n${C.bright}[+] Restore Session${C.reset}\n`);

  let items: Array<{ label: string; id: string }> = [];

  try {
    const { TimeMachineEngine } = await import('../core/engine.js');
    const engine = new TimeMachineEngine(process.cwd());
    const points = engine.listTimePoints().reverse().slice(0, 20);

    if (points.length === 0) {
      console.log(`  ${C.dim}No checkpoints found. Create one first with option 2.${C.reset}\n`);
      await prompt(rl, `${C.dim}Press Enter to return to menu...${C.reset}`);
      return;
    }

    items = points.map(p => {
      const ts = new Date(p.timestamp).toLocaleString();
      return { label: `${ts}  — ${p.description ?? p.id.slice(0, 20)}`, id: p.id };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${C.red}Error loading checkpoints: ${msg}${C.reset}\n`);
    await prompt(rl, `${C.dim}Press Enter to return to menu...${C.reset}`);
    return;
  }

  console.log(`${C.dim}  Select a checkpoint to restore:${C.reset}\n`);
  const idx = await selectFromList(rl, items.map(i => i.label));
  if (idx === -1) return;

  const target = items[idx];
  console.log();

  const yes = await confirm(
    rl,
    `${C.yellow}Restore to "${target.label.split('—')[0].trim()}"?  ${C.reset}` +
    `${C.red}This will overwrite current working files.${C.reset}`
  );

  if (!yes) {
    console.log(`${C.dim}  Cancelled.${C.reset}\n`);
    return;
  }

  try {
    const { TimeMachineEngine } = await import('../core/engine.js');
    const engine = new TimeMachineEngine(process.cwd());
    engine.restore(target.id);
    console.log(`\n  ${C.green}[OK]${C.reset} Restored to checkpoint ${C.cyan}${target.id.slice(0, 16)}${C.reset}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`\n  ${C.red}[!] Restore failed: ${msg}${C.reset}`);
  }

  console.log();
  await prompt(rl, `${C.dim}Press Enter to return to menu...${C.reset}`);
}

async function handleViewSyncStatus(rl: readline.Interface): Promise<void> {
  console.log(`\n${C.bright}[+] Sync Status${C.reset}\n`);
  console.log(`  ${C.dim}Fetching sync status...${C.reset}`);

  try {
    const { SecureSyncClient } = await import('../sync/secure-client.js');
    const client = new SecureSyncClient();
    const projectId = path.basename(process.cwd());
    const remote = await client.listRemoteCheckpoints(projectId);

    console.log(`\n  ${C.green}Connected.${C.reset}  Remote checkpoints: ${C.cyan}${remote.length}${C.reset}`);

    if (remote.length > 0) {
      const latest = remote[remote.length - 1];
      console.log(
        `  Latest remote: ${C.white}${latest.description ?? latest.id.slice(0, 20)}${C.reset}  ` +
        `${C.dim}${latest.timestamp}${C.reset}`
      );
    }
  } catch {
    console.log(`\n  ${C.yellow}[!]${C.reset} Sync not configured.`);
    console.log(`  ${C.dim}Configure with: aitm sync-config <endpoint> <api-key>${C.reset}`);
  }

  console.log();
  await prompt(rl, `${C.dim}Press Enter to return to menu...${C.reset}`);
}

async function handleAgentTasks(rl: readline.Interface): Promise<void> {
  console.log(`\n${C.bright}[+] Agent Tasks (Beads)${C.reset}\n`);

  const apiBase = process.env.AITM_API_URL ?? 'http://localhost:3001';
  console.log(`  ${C.dim}API: ${apiBase}${C.reset}`);
  console.log(`  ${C.dim}Fetching tasks...${C.reset}\n`);

  type BeadTask = { id: string; title: string; status: string; deps?: string[] };
  type BeadsApiResponse = { success: boolean; data: BeadTask[]; error?: string };

  try {
    const res = await fetch(`${apiBase}/api/beads/tasks`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as BeadsApiResponse;

    const tasks: BeadTask[] = Array.isArray(body.data) ? body.data : [];

    if (tasks.length === 0) {
      console.log(`  ${C.dim}No agent tasks found.${C.reset}`);
    } else {
      const statusColor = (s: string): string => {
        if (s === 'done')    return C.green;
        if (s === 'ready')   return C.cyan;
        if (s === 'pending') return C.yellow;
        return C.dim;
      };

      for (const t of tasks) {
        const sc = statusColor(t.status);
        console.log(
          `  ${sc}${t.status.padEnd(8)}${C.reset} ${C.white}${t.title}${C.reset}  ` +
          `${C.dim}${t.id.slice(0, 12)}${C.reset}`
        );
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${C.red}[!] Could not reach AITM API server: ${msg}${C.reset}`);
    console.log(`  ${C.dim}Start it with: aitm daemon${C.reset}`);
  }

  console.log();
  await prompt(rl, `${C.dim}Press Enter to return to menu...${C.reset}`);
}

async function handleExport(rl: readline.Interface): Promise<void> {
  console.log(`\n${C.bright}[+] Export${C.reset}\n`);

  const formats = ['JSON — full structured export', 'Markdown — human-readable report', 'CSV — spreadsheet-friendly', 'Git history — patch series'];
  console.log(`  ${C.dim}Choose export format:${C.reset}\n`);
  const idx = await selectFromList(rl, formats);
  if (idx === -1) return;

  const formatMap = ['json', 'markdown', 'csv', 'git-history'] as const;
  const chosen = formatMap[idx];

  const outDir = await prompt(
    rl,
    `${C.dim}Output directory (default: ./aitm-export):${C.reset} `
  );
  const dir = outDir || './aitm-export';

  console.log(`\n  ${C.dim}Hint: Run the following command to export:${C.reset}`);
  console.log(`  ${C.cyan}aitm export ${chosen} --output ${dir}${C.reset}\n`);

  await prompt(rl, `${C.dim}Press Enter to return to menu...${C.reset}`);
}

async function handleSettings(rl: readline.Interface): Promise<void> {
  console.log(`\n${C.bright}[+] Settings${C.reset}\n`);

  try {
    const { ConfigManager } = await import('../config.js');
    const mgr    = new ConfigManager(process.cwd());
    const config = mgr.getConfig();

    const lines: [string, string][] = [
      ['Project',        process.cwd()],
      ['Auto-confirm',   String(config.autoConfirm)],
      ['Watch enabled',  String(config.watchEnabled)],
      ['Max snapshots',  String(config.maxSnapshots)],
      ['Max file size',  config.maxFileSize ? `${(config.maxFileSize / 1024 / 1024).toFixed(0)} MB` : '10 MB'],
    ];

    const keyWidth = Math.max(...lines.map(([k]) => k.length)) + 2;

    for (const [key, val] of lines) {
      console.log(
        `  ${C.dim}${key.padEnd(keyWidth)}${C.reset}${C.white}${val}${C.reset}`
      );
    }
  } catch {
    console.log(`  ${C.dim}Config not loaded — defaults apply.${C.reset}`);
    console.log(`  ${C.dim}Run "aitm init" or "aitm config set <key> <value>" to configure.${C.reset}`);
  }

  console.log();
  const sub = await prompt(
    rl,
    `${C.dim}Type "set <key> <value>" to change a setting, or press Enter to go back:${C.reset} `
  );

  if (sub.startsWith('set ')) {
    const parts = sub.slice(4).split(' ');
    const key   = parts[0];
    const value = parts.slice(1).join(' ');
    if (key && value) {
      console.log(`\n  ${C.dim}Hint: Run: aitm config set ${key} ${value}${C.reset}\n`);
    }
  }

  await prompt(rl, `${C.dim}Press Enter to return to menu...${C.reset}`);
}

function printHelp(): void {
  console.log(`
${C.bright}Interactive Mode Help${C.reset}

  ${C.cyan}Numbers${C.reset}    Type a number (1-8) and press Enter to select a menu item.
  ${C.cyan}Tab${C.reset}        Auto-complete partial input.
  ${C.cyan}Up/Down${C.reset}    Navigate command history (readline built-in).
  ${C.cyan}q / quit${C.reset}   Exit interactive mode.
  ${C.cyan}? / help${C.reset}   Show this help message.
  ${C.cyan}clear${C.reset}      Clear the screen and redraw the menu.
`);
}

// ─── Main REPL loop ───────────────────────────────────────────────────────────

/**
 * Entry point called by "aitm interactive" / "aitm i".
 */
export async function runInteractiveMode(): Promise<void> {
  clearScreen();
  console.log(BANNER);

  // Load session info asynchronously while showing the banner.
  const infoPromise = loadSessionInfo();
  const info = await infoPromise;
  printSessionInfo(info);

  const rl = createRl();

  // Graceful exit on Ctrl-C.
  rl.on('SIGINT', () => {
    console.log(`\n${C.dim}  Goodbye.${C.reset}\n`);
    rl.close();
    process.exit(0);
  });

  // ─── REPL loop ──────────────────────────────────────────────────────────────
  while (true) {
    printMenu();

    const raw = await prompt(rl, `${C.bright}${C.cyan}aitm>${C.reset} `);
    const input = raw.toLowerCase().trim();

    if (!input) continue;

    // Exit shortcuts
    if (['8', 'q', 'quit', 'exit', 'bye'].includes(input)) {
      console.log(`\n${C.dim}  Goodbye.${C.reset}\n`);
      rl.close();
      return;
    }

    // Help
    if (['help', '?', 'h'].includes(input)) {
      printHelp();
      continue;
    }

    // Clear screen
    if (input === 'clear' || input === 'cls') {
      clearScreen();
      console.log(BANNER);
      printSessionInfo(info);
      continue;
    }

    // Menu dispatch
    switch (input) {
      case '1':
      case 'list':
      case 'sessions':
        await handleListSessions(rl);
        break;

      case '2':
      case 'checkpoint':
      case 'save':
        await handleCreateCheckpoint(rl);
        break;

      case '3':
      case 'restore':
        await handleRestoreSession(rl);
        break;

      case '4':
      case 'sync':
      case 'status':
        await handleViewSyncStatus(rl);
        break;

      case '5':
      case 'agents':
      case 'beads':
      case 'tasks':
        await handleAgentTasks(rl);
        break;

      case '6':
      case 'export':
        await handleExport(rl);
        break;

      case '7':
      case 'settings':
      case 'config':
        await handleSettings(rl);
        break;

      default:
        console.log(
          `\n  ${C.yellow}Unknown option: "${raw}".${C.reset}  ` +
          `${C.dim}Type a number 1-8 or "?" for help.${C.reset}\n`
        );
    }
  }
}
