/**
 * Export Commands
 *
 * Export AITM session data in various formats.
 *
 *   aitm export json       [--output file.json]  [--limit 50] [--since 2024-01-01]
 *   aitm export markdown   [--output dir/]        [--limit 50]
 *   aitm export csv        [--output sessions.csv]
 *   aitm export report     [--output report.html] [--period 30d]
 *   aitm export git-history [--repo .]            [--branch aitm-history]
 */

import { Command } from 'commander';
import { C, fail } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExportOptions {
  limit?: string;
  since?: string;
  output?: string;
  period?: string;
  repo?: string;
  branch?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

interface GitExportResult {
  repoPath: string;
  commitCount: number;
  branch: string;
  instructions?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiBase(): string {
  return process.env.AITM_API_URL ?? 'http://localhost:3001';
}

async function resolveApiKey(): Promise<string | undefined> {
  if (process.env.AITM_API_KEY) {
    return process.env.AITM_API_KEY;
  }
  try {
    const { getStoredAuth } = await import('../auth/index.js');
    return getStoredAuth()?.apiKey;
  } catch {
    return undefined;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const apiKey = await resolveApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const url = `${getApiBase()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err: unknown) {
    throw new Error(
      `Cannot reach AITM API at ${getApiBase()} — is the server running? (${errorMessage(err)})`,
    );
  }

  const body = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body;
}

// ─── Spinner (ANSI, no external deps) ────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createSpinner(text: string): { stop: (finalText?: string) => void } {
  let frame = 0;
  const isTTY = process.stdout.isTTY;

  if (!isTTY) {
    process.stdout.write(`${text}...\n`);
    return { stop: (finalText) => { if (finalText) process.stdout.write(`${finalText}\n`); } };
  }

  const interval = setInterval(() => {
    const icon = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
    process.stdout.write(`\r${C.cyan}${icon}${C.reset} ${text}  `);
    frame++;
  }, 80);

  return {
    stop: (finalText?: string) => {
      clearInterval(interval);
      process.stdout.write('\r\x1b[2K'); // clear line
      if (finalText) process.stdout.write(`${finalText}\n`);
    },
  };
}

// ─── Output helpers ───────────────────────────────────────────────────────────

function writeOutput(outputPath: string | undefined, content: string, defaultName: string): void {
  const target = outputPath ?? defaultName;
  const resolved = path.resolve(target);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');
}

function resolveOutputDir(outputPath: string | undefined, defaultDir: string): string {
  const dir = path.resolve(outputPath ?? defaultDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Registration ──────────────────────────────────────────────────────────────

export function registerExportCommands(program: Command): void {

  // `export` is owned exclusively by this module: it is a command group whose
  // subcommands are the output formats (json|markdown|csv|report|git-history).
  // The portable whole-store dump lives under the distinct `export-all` verb in
  // config-commands, so there is no name collision and no order-dependent
  // shadowing here.
  const exportCmd = program
    .command('export')
    .description('Export session data in various formats (json|markdown|csv|report|git-history)');

  // ── json ──────────────────────────────────────────────────────────────────

  exportCmd
    .command('json')
    .description('Export sessions as a JSON file')
    .option('--output <file>', 'Output file path (default: sessions-export.json)')
    .option('--limit <n>', 'Maximum number of sessions to export', '50')
    .option('--since <date>', 'Only export sessions on or after this date (ISO 8601)')
    .action(async (opts: ExportOptions) => {
      const spinner = createSpinner('Exporting sessions as JSON');
      try {
        const body: Record<string, unknown> = {
          limit: parseInt(opts.limit ?? '50', 10),
        };
        if (opts.since) {
          body.since = opts.since;
        }

        const { data } = await apiFetch<unknown>('/v1/sessions/export/json', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        const content = JSON.stringify(data, null, 2);

        if (opts.output) {
          writeOutput(opts.output, content, opts.output);
          spinner.stop(`${C.green}[OK]${C.reset} Saved to ${C.cyan}${path.resolve(opts.output)}${C.reset}`);
        } else {
          spinner.stop();
          process.stdout.write(content + '\n');
        }
      } catch (err: unknown) {
        spinner.stop();
        fail(errorMessage(err));
      }
    });

  // ── markdown ──────────────────────────────────────────────────────────────

  exportCmd
    .command('markdown')
    .description('Export sessions as individual Markdown files (one per session)')
    .option('--output <dir>', 'Output directory (default: ./aitm-export-md)')
    .option('--limit <n>', 'Maximum number of sessions to export', '50')
    .action(async (opts: ExportOptions) => {
      const spinner = createSpinner('Exporting sessions as Markdown');
      try {
        const { data } = await apiFetch<Array<{ id: string; filename: string; content: string }>>(
          '/v1/sessions/export/markdown',
          {
            method: 'POST',
            body: JSON.stringify({ limit: parseInt(opts.limit ?? '50', 10) }),
          },
        );

        const sessions = Array.isArray(data) ? data : [];
        if (sessions.length === 0) {
          spinner.stop(`${C.yellow}[!]${C.reset} No sessions found to export`);
          return;
        }

        const outDir = resolveOutputDir(opts.output, './aitm-export-md');

        for (const session of sessions) {
          const filename = session.filename ?? `${session.id}.md`;
          const filePath = path.join(outDir, filename);
          fs.writeFileSync(filePath, session.content ?? '', 'utf-8');
        }

        spinner.stop(
          `${C.green}[OK]${C.reset} Wrote ${C.bright}${sessions.length}${C.reset} file(s) to ${C.cyan}${outDir}${C.reset}`,
        );
      } catch (err: unknown) {
        spinner.stop();
        fail(errorMessage(err));
      }
    });

  // ── csv ───────────────────────────────────────────────────────────────────

  exportCmd
    .command('csv')
    .description('Export session metadata as a CSV file')
    .option('--output <file>', 'Output file path (default: sessions.csv)')
    .action(async (opts: ExportOptions) => {
      const spinner = createSpinner('Exporting sessions as CSV');
      try {
        const { data } = await apiFetch<string>('/v1/sessions/export/csv', {
          method: 'POST',
          body: JSON.stringify({}),
        });

        const content = typeof data === 'string' ? data : JSON.stringify(data);

        if (opts.output) {
          writeOutput(opts.output, content, opts.output);
          spinner.stop(`${C.green}[OK]${C.reset} Saved to ${C.cyan}${path.resolve(opts.output)}${C.reset}`);
        } else {
          const defaultPath = 'sessions.csv';
          writeOutput(defaultPath, content, defaultPath);
          spinner.stop(`${C.green}[OK]${C.reset} Saved to ${C.cyan}${path.resolve(defaultPath)}${C.reset}`);
        }
      } catch (err: unknown) {
        spinner.stop();
        fail(errorMessage(err));
      }
    });

  // ── report ────────────────────────────────────────────────────────────────

  exportCmd
    .command('report')
    .description('Generate an HTML activity report')
    .option('--output <file>', 'Output file path (default: aitm-report.html)')
    .option('--period <period>', 'Time period: e.g. 7d, 30d, 90d (default: 30d)', '30d')
    .action(async (opts: ExportOptions) => {
      const period = opts.period ?? '30d';
      const spinner = createSpinner(`Generating activity report for last ${period}`);
      try {
        const { data } = await apiFetch<string>(
          `/v1/sessions/export/activity-report?period=${encodeURIComponent(period)}`,
        );

        const content = typeof data === 'string' ? data : JSON.stringify(data);
        const outputPath = opts.output ?? 'aitm-report.html';
        writeOutput(outputPath, content, outputPath);

        spinner.stop(
          `${C.green}[OK]${C.reset} Report saved to ${C.cyan}${path.resolve(outputPath)}${C.reset}`,
        );
        console.log(
          `       Open with: ${C.dim}open ${path.resolve(outputPath)}${C.reset}`,
        );
      } catch (err: unknown) {
        spinner.stop();
        fail(errorMessage(err));
      }
    });

  // ── git-history ───────────────────────────────────────────────────────────

  exportCmd
    .command('git-history')
    .description('Export sessions as git commit history into a local repository')
    .option('--repo <path>', 'Target repository path (default: current directory)', '.')
    .option('--branch <name>', 'Branch name to write history onto (default: aitm-history)', 'aitm-history')
    .action(async (opts: ExportOptions) => {
      const repoPath = path.resolve(opts.repo ?? '.');
      const branch = opts.branch ?? 'aitm-history';
      const spinner = createSpinner(`Exporting sessions as git history → branch ${branch}`);
      try {
        const { data } = await apiFetch<GitExportResult>('/v1/sessions/export/git', {
          method: 'POST',
          body: JSON.stringify({ repoPath, branch }),
        });

        const result = data as GitExportResult;
        spinner.stop(
          `${C.green}[OK]${C.reset} Exported ${C.bright}${result?.commitCount ?? '?'}${C.reset} commit(s) to branch ${C.cyan}${result?.branch ?? branch}${C.reset}`,
        );

        if (result?.repoPath) {
          console.log(`       Repo: ${C.dim}${result.repoPath}${C.reset}`);
        }
        if (result?.instructions) {
          console.log(`\n${C.bright}Next steps:${C.reset}`);
          for (const line of result.instructions.split('\n')) {
            console.log(`  ${line}`);
          }
        } else {
          console.log(`\n${C.bright}Next steps:${C.reset}`);
          console.log(`  ${C.dim}cd ${repoPath}${C.reset}`);
          console.log(`  ${C.dim}git log ${branch} --oneline${C.reset}`);
          console.log(`  ${C.dim}git push origin ${branch}${C.reset}`);
        }
      } catch (err: unknown) {
        spinner.stop();
        fail(errorMessage(err));
      }
    });
}
