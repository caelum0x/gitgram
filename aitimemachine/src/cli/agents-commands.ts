/**
 * Agents Commands
 *
 * Manage AI agent tasks via the beads DAG tracker.
 *
 *   aitm agents list                         – table of all tasks + status
 *   aitm agents add <title> [--deps a,b]     – create a new task
 *   aitm agents ready <id>                   – mark task as ready
 *   aitm agents done <id>                    – mark task as done
 *   aitm agents show <id>                    – task details + dependency tree
 *   aitm agents watch                        – live-refresh every 2 s (ANSI redrawn)
 */

import { Command } from 'commander';
import { C, fail } from './cli-helpers.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BeadTask {
  id: string;
  title: string;
  status: 'pending' | 'ready' | 'done' | string;
  deps?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface BeadsApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getApiBase(): string {
  return process.env.AITM_API_URL ?? 'http://localhost:3001';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function beadsFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<BeadsApiResponse<T>> {
  const url = `${getApiBase()}/beads${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });
  } catch (err: unknown) {
    throw new Error(
      `Cannot reach AITM API at ${getApiBase()} — is the server running? (${errorMessage(err)})`,
    );
  }

  const body = (await res.json()) as BeadsApiResponse<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body;
}

function statusColor(status: string): string {
  switch (status) {
    case 'done':    return C.green;
    case 'ready':   return C.cyan;
    case 'pending': return C.yellow;
    default:        return C.dim;
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case 'done':    return '[x]';
    case 'ready':   return '[>]';
    case 'pending': return '[ ]';
    default:        return '[?]';
  }
}

function padEnd(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderTaskTable(tasks: BeadTask[]): string {
  const lines: string[] = [];

  if (tasks.length === 0) {
    lines.push(`  ${C.dim}No tasks yet. Use: aitm agents add "task title"${C.reset}`);
    return lines.join('\n');
  }

  const header =
    `  ${C.bright}${padEnd('ID', 8)}  ${padEnd('STATUS', 8)}  TITLE${C.reset}`;
  const sep = `  ${C.dim}${'─'.repeat(60)}${C.reset}`;
  lines.push(header);
  lines.push(sep);

  for (const t of tasks) {
    const sc = statusColor(t.status);
    const icon = statusIcon(t.status);
    const shortId = t.id.slice(0, 8);
    const deps =
      t.deps && t.deps.length > 0
        ? ` ${C.dim}← ${t.deps.map(d => d.slice(0, 6)).join(', ')}${C.reset}`
        : '';
    lines.push(
      `  ${C.dim}${shortId}${C.reset}  ${sc}${padEnd(icon, 8)}${C.reset}  ${t.title}${deps}`,
    );
  }

  return lines.join('\n');
}

function buildDagLines(tasks: BeadTask[]): string[] {
  const byId = new Map<string, BeadTask>(tasks.map(t => [t.id, t]));
  const lines: string[] = [];

  // Tasks with no dependents are roots
  const depSet = new Set<string>(tasks.flatMap(t => t.deps ?? []));
  const roots = tasks.filter(t => !depSet.has(t.id));

  function renderNode(task: BeadTask, prefix: string, isLast: boolean): void {
    const connector = isLast ? '└─ ' : '├─ ';
    const sc = statusColor(task.status);
    lines.push(
      `${prefix}${connector}${sc}${statusIcon(task.status)}${C.reset} ${task.title} ${C.dim}[${task.id.slice(0, 8)}]${C.reset}`,
    );
    const childPrefix = prefix + (isLast ? '   ' : '│  ');
    // Children: tasks whose deps include this task's id
    const children = tasks.filter(t => (t.deps ?? []).includes(task.id));
    children.forEach((child, i) => {
      renderNode(child, childPrefix, i === children.length - 1);
    });
  }

  // Guard against orphan/cycle: only render rooted nodes
  const rendered = new Set<string>();
  function renderRoot(task: BeadTask): void {
    if (rendered.has(task.id)) return;
    rendered.add(task.id);
    renderNode(task, '', true);
    // Mark all descendants rendered to avoid duplication
    const stack = [task];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const children = tasks.filter(t => (t.deps ?? []).includes(cur.id));
      for (const child of children) {
        if (!rendered.has(child.id)) {
          rendered.add(child.id);
          stack.push(child);
        }
      }
    }
  }

  for (const root of roots) {
    renderRoot(root);
  }

  // Render any tasks not reached by DAG traversal (isolated/cyclic)
  for (const task of tasks) {
    if (!rendered.has(task.id)) {
      const sc = statusColor(task.status);
      lines.push(
        `└─ ${sc}${statusIcon(task.status)}${C.reset} ${task.title} ${C.dim}[${task.id.slice(0, 8)}]${C.reset}`,
      );
    }
  }

  if (lines.length === 0) {
    lines.push(`  ${C.dim}(empty)${C.reset}`);
  }

  return lines;
}

function renderWatchFrame(tasks: BeadTask[], tick: number): string {
  const dots = '.'.repeat((tick % 3) + 1).padEnd(3, ' ');
  const pending = tasks.filter(t => t.status === 'pending').length;
  const ready   = tasks.filter(t => t.status === 'ready').length;
  const done    = tasks.filter(t => t.status === 'done').length;

  const lines: string[] = [
    `${C.bright}aitm agents watch${C.reset} ${C.dim}${dots}${C.reset}  (Ctrl+C to exit)`,
    `${C.dim}Server: ${getApiBase()}${C.reset}`,
    '',
    `  ${C.yellow}pending: ${pending}${C.reset}  ${C.cyan}ready: ${ready}${C.reset}  ${C.green}done: ${done}${C.reset}  total: ${tasks.length}`,
    '',
    `${C.bright}Tasks${C.reset}`,
    renderTaskTable(tasks),
    '',
    `${C.bright}DAG${C.reset}`,
    ...buildDagLines(tasks),
    '',
  ];

  return lines.join('\n');
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAgentsCommands(program: Command): void {

  const agentsCmd = program
    .command('agents')
    .description('Manage AI agent tasks via the beads DAG tracker');

  // ── list ──────────────────────────────────────────────────────────────────

  agentsCmd
    .command('list')
    .description('List all tasks with status table')
    .option('--json', 'Output raw JSON')
    .action(async (opts: { json?: boolean }) => {
      try {
        const { data } = await beadsFetch<BeadTask[]>('/tasks');
        const tasks = Array.isArray(data) ? data : [];

        if (opts.json) {
          console.log(JSON.stringify(tasks, null, 2));
          return;
        }

        console.log(`\n${C.bright}[+] Agent Tasks${C.reset} (${tasks.length})\n`);
        console.log(renderTaskTable(tasks));
        console.log();
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── add ───────────────────────────────────────────────────────────────────

  agentsCmd
    .command('add <title>')
    .description('Add a new task')
    .option('--deps <ids>', 'Comma-separated dependency task IDs')
    .action(async (title: string, opts: { deps?: string }) => {
      if (!title.trim()) {
        fail('title cannot be empty');
        return;
      }

      const deps: string[] = opts.deps
        ? opts.deps.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      try {
        const body: { title: string; deps?: string[] } = { title: title.trim() };
        if (deps.length > 0) body.deps = deps;

        const { data } = await beadsFetch<BeadTask>('/tasks', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        const task = data as BeadTask;
        console.log(
          `${C.green}[OK]${C.reset} Created task ${C.cyan}${task?.id ?? '?'}${C.reset}: ${title}`,
        );
        if (deps.length > 0) {
          console.log(`     ${C.dim}Deps: ${deps.join(', ')}${C.reset}`);
        }
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── ready ─────────────────────────────────────────────────────────────────

  agentsCmd
    .command('ready <id>')
    .description('Mark a task as ready')
    .action(async (id: string) => {
      try {
        await beadsFetch(`/tasks/${encodeURIComponent(id)}/ready`, { method: 'PUT' });
        console.log(`${C.green}[OK]${C.reset} Task ${C.cyan}${id}${C.reset} marked ${C.cyan}ready${C.reset}`);
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── done ──────────────────────────────────────────────────────────────────

  agentsCmd
    .command('done <id>')
    .description('Mark a task as done')
    .action(async (id: string) => {
      try {
        await beadsFetch(`/tasks/${encodeURIComponent(id)}/done`, { method: 'PUT' });
        console.log(`${C.green}[OK]${C.reset} Task ${C.cyan}${id}${C.reset} marked ${C.green}done${C.reset}`);
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── show ──────────────────────────────────────────────────────────────────

  agentsCmd
    .command('show <id>')
    .description('Show task details and dependency tree')
    .option('--json', 'Output raw JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const { data } = await beadsFetch<BeadTask>(`/tasks/${encodeURIComponent(id)}`);
        const task = data as BeadTask;

        if (opts.json) {
          console.log(JSON.stringify(task, null, 2));
          return;
        }

        const sc = statusColor(task.status);
        console.log();
        console.log(`${C.bright}Task: ${task.title}${C.reset}`);
        console.log(`  ID:      ${C.dim}${task.id}${C.reset}`);
        console.log(`  Status:  ${sc}${statusIcon(task.status)} ${task.status}${C.reset}`);

        if (task.createdAt) {
          console.log(`  Created: ${C.dim}${new Date(task.createdAt).toLocaleString()}${C.reset}`);
        }
        if (task.updatedAt) {
          console.log(`  Updated: ${C.dim}${new Date(task.updatedAt).toLocaleString()}${C.reset}`);
        }

        if (task.deps && task.deps.length > 0) {
          console.log(`\n${C.bright}Dependencies${C.reset}`);
          for (const depId of task.deps) {
            try {
              const { data: depData } = await beadsFetch<BeadTask>(
                `/tasks/${encodeURIComponent(depId)}`,
              );
              const dep = depData as BeadTask;
              const dsc = statusColor(dep.status);
              console.log(
                `  ${dsc}${statusIcon(dep.status)}${C.reset} ${dep.title} ${C.dim}[${dep.id.slice(0, 8)}]${C.reset}`,
              );
            } catch {
              console.log(`  ${C.dim}[${depId.slice(0, 8)}] (not found)${C.reset}`);
            }
          }
        } else {
          console.log(`\n  ${C.dim}No dependencies${C.reset}`);
        }
        console.log();
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── watch ─────────────────────────────────────────────────────────────────

  agentsCmd
    .command('watch')
    .description('Live-refresh the task list every 2 s (Ctrl+C to exit)')
    .option('--interval <ms>', 'Refresh interval in ms', '2000')
    .action(async (opts: { interval?: string }) => {
      const intervalMs = Math.max(500, parseInt(opts.interval ?? '2000', 10) || 2000);
      let tick = 0;

      // Hide cursor for cleaner output
      process.stdout.write('\x1b[?25l');

      const restore = (): void => {
        process.stdout.write('\x1b[?25h\n');
      };

      process.on('SIGINT', () => { restore(); process.exit(0); });
      process.on('SIGTERM', () => { restore(); process.exit(0); });

      const draw = async (): Promise<void> => {
        let tasks: BeadTask[] = [];
        let fetchError: string | null = null;

        try {
          const { data } = await beadsFetch<BeadTask[]>('/tasks');
          tasks = Array.isArray(data) ? data : [];
        } catch (err: unknown) {
          fetchError = errorMessage(err);
        }

        // Move cursor to top-left and clear screen
        process.stdout.write('\x1b[H\x1b[2J');

        if (fetchError) {
          process.stdout.write(
            `${C.red}[!]${C.reset} ${fetchError}\n\n${C.dim}Retrying in ${intervalMs}ms${C.reset}\n`,
          );
        } else {
          process.stdout.write(renderWatchFrame(tasks, tick) + '\n');
        }

        tick += 1;
      };

      // Initial draw
      await draw();

      const timer = setInterval(draw, intervalMs);

      // Keep the process alive
      process.stdin.resume();
      process.stdin.on('data', (chunk: Buffer) => {
        // Quit on 'q' or ESC
        if (chunk[0] === 113 || chunk[0] === 27) {
          clearInterval(timer);
          restore();
          process.exit(0);
        }
      });
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
    });
}
