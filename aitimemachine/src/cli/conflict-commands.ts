/**
 * Conflict Commands
 *
 * Resolve sync conflicts that arise when the same checkpoint/files are
 * modified on multiple devices or by multiple agents before syncing.
 *
 *   aitm conflicts list                                – unresolved conflicts (id, device, files)
 *   aitm conflicts show <id>                           – local vs remote diff for one conflict
 *   aitm conflicts resolve <id> --strategy <s>         – resolve (local | remote | manual)
 *   aitm conflicts auto                                – auto-resolve non-overlapping conflicts
 *
 * Talks to the existing sync API:
 *   POST /v1/sync/conflicts            – list unresolved conflicts
 *   POST /v1/sync/conflicts/show       – detailed local/remote diff for one conflict
 *   POST /v1/sync/conflicts/resolve    – resolve a single conflict with a strategy
 *   POST /v1/sync/conflicts/auto       – auto-resolve all non-overlapping conflicts
 *
 * Reads AITM_API_URL + AITM_API_KEY (falls back to stored auth credentials).
 */

import { Command } from 'commander';
import { C, fail } from './cli-helpers.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConflictFile {
  path: string;
  localHash?: string;
  remoteHash?: string;
  /** true when local and remote changed the same file (overlapping) */
  overlapping?: boolean;
}

interface ConflictSummary {
  id: string;
  checkpointId: string;
  device: string;
  files: ConflictFile[];
  createdAt?: string;
}

interface ConflictDiffSide {
  device: string;
  content: string;
  hash?: string;
  updatedAt?: string;
}

interface ConflictDetail {
  id: string;
  checkpointId: string;
  files: Array<{
    path: string;
    local: ConflictDiffSide;
    remote: ConflictDiffSide;
    overlapping?: boolean;
  }>;
}

interface ResolveResult {
  id: string;
  strategy: string;
  resolvedFiles: number;
}

interface AutoResult {
  resolved: string[];
  skipped: Array<{ id: string; reason: string }>;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

type ResolveStrategy = 'local' | 'remote' | 'manual';

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

async function apiFetch<T>(apiPath: string, body?: unknown): Promise<ApiResponse<T>> {
  const apiKey = await resolveApiKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const url = `${getApiBase()}${apiPath}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
    });
  } catch (err: unknown) {
    throw new Error(
      `Cannot reach AITM API at ${getApiBase()} — is the server running? (${errorMessage(err)})`,
    );
  }

  const parsed = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !parsed.success) {
    throw new Error(parsed.error ?? `HTTP ${res.status}`);
  }
  return parsed;
}

function projectId(): string {
  return path.basename(process.cwd());
}

function shortId(id: string): string {
  return id.length > 10 ? id.slice(0, 10) : id;
}

function padEnd(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function isStrategy(value: string): value is ResolveStrategy {
  return value === 'local' || value === 'remote' || value === 'manual';
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderConflictTable(conflicts: ConflictSummary[]): string {
  if (conflicts.length === 0) {
    return `  ${C.green}No unresolved conflicts. Everything is in sync.${C.reset}`;
  }

  const lines: string[] = [];
  lines.push(
    `  ${C.bright}${padEnd('ID', 12)}  ${padEnd('DEVICE', 16)}  ${padEnd('FILES', 6)}  CHECKPOINT${C.reset}`,
  );
  lines.push(`  ${C.dim}${'─'.repeat(64)}${C.reset}`);

  for (const conflict of conflicts) {
    const overlapping = conflict.files.some((f) => f.overlapping);
    const marker = overlapping ? `${C.red}!${C.reset}` : `${C.yellow}~${C.reset}`;
    lines.push(
      `${marker} ${C.cyan}${padEnd(shortId(conflict.id), 12)}${C.reset}  ` +
        `${padEnd(conflict.device, 16)}  ` +
        `${padEnd(String(conflict.files.length), 6)}  ` +
        `${C.dim}${shortId(conflict.checkpointId)}${C.reset}`,
    );
    for (const file of conflict.files) {
      const fc = file.overlapping ? C.red : C.dim;
      lines.push(`    ${fc}${file.path}${C.reset}`);
    }
  }

  lines.push('');
  lines.push(
    `  ${C.dim}Legend: ${C.red}!${C.dim} overlapping (needs manual merge)  ` +
      `${C.yellow}~${C.dim} non-overlapping (auto-resolvable)${C.reset}`,
  );
  return lines.join('\n');
}

/** Side-by-side-ish line diff (local vs remote) without external deps. */
function renderFileDiff(localContent: string, remoteContent: string): string {
  const localLines = localContent.split('\n');
  const remoteLines = remoteContent.split('\n');
  const max = Math.max(localLines.length, remoteLines.length);
  const lines: string[] = [];

  for (let i = 0; i < max; i++) {
    const l = localLines[i] ?? '';
    const r = remoteLines[i] ?? '';
    if (l === r) {
      lines.push(`  ${C.dim}  ${l}${C.reset}`);
    } else {
      if (i < localLines.length) {
        lines.push(`  ${C.green}- ${l}${C.reset}`);
      }
      if (i < remoteLines.length) {
        lines.push(`  ${C.red}+ ${r}${C.reset}`);
      }
    }
  }
  return lines.join('\n');
}

// ─── Manual merge (editor) ──────────────────────────────────────────────────────

function buildMergeBuffer(filePath: string, local: string, remote: string): string {
  return [
    `<<<<<<< LOCAL (${filePath})`,
    local,
    '=======',
    remote,
    `>>>>>>> REMOTE (${filePath})`,
    '',
  ].join('\n');
}

async function openInEditor(initialContent: string): Promise<string> {
  const { spawnSync } = await import('child_process');
  const editor = process.env.VISUAL || process.env.EDITOR || 'vi';

  const tmpFile = path.join(
    os.tmpdir(),
    `aitm-merge-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  fs.writeFileSync(tmpFile, initialContent, 'utf-8');

  try {
    const result = spawnSync(editor, [tmpFile], { stdio: 'inherit' });
    if (result.error) {
      throw new Error(`Failed to launch editor "${editor}": ${result.error.message}`);
    }
    return fs.readFileSync(tmpFile, 'utf-8');
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* best-effort cleanup */
    }
  }
}

async function runManualMerge(conflictId: string): Promise<void> {
  const { data: detail } = await apiFetch<ConflictDetail>('/v1/sync/conflicts/show', {
    projectId: projectId(),
    conflictId,
  });

  const resolvedFiles: Array<{ path: string; content: string }> = [];

  for (const file of detail.files) {
    console.log(
      `\n${C.bright}Merging${C.reset} ${C.cyan}${file.path}${C.reset} ${C.dim}(opening ${process.env.EDITOR ?? 'vi'})${C.reset}`,
    );
    const buffer = buildMergeBuffer(file.path, file.local.content, file.remote.content);
    const merged = await openInEditor(buffer);
    resolvedFiles.push({ path: file.path, content: merged });
  }

  await apiFetch<ResolveResult>('/v1/sync/conflicts/resolve', {
    projectId: projectId(),
    conflictId,
    strategy: 'manual',
    files: resolvedFiles,
  });

  console.log(
    `\n${C.green}[OK]${C.reset} Conflict ${C.cyan}${shortId(conflictId)}${C.reset} resolved with ` +
      `${C.bright}manual${C.reset} merge (${resolvedFiles.length} file(s)).`,
  );
}

// ─── Registration ───────────────────────────────────────────────────────────────

export function registerConflictCommands(program: Command): void {
  const conflictsCmd = program
    .command('conflicts')
    .description('Resolve sync conflicts between devices and agents');

  // ── list ──────────────────────────────────────────────────────────────────
  conflictsCmd
    .command('list')
    .description('List all unresolved sync conflicts')
    .option('--json', 'Output raw JSON')
    .action(async (opts: { json?: boolean }) => {
      try {
        const { data } = await apiFetch<ConflictSummary[]>('/v1/sync/conflicts', {
          projectId: projectId(),
        });
        const conflicts = Array.isArray(data) ? data : [];

        if (opts.json) {
          console.log(JSON.stringify(conflicts, null, 2));
          return;
        }

        console.log(`\n${C.bright}[~] Sync Conflicts${C.reset} (${conflicts.length})\n`);
        console.log(renderConflictTable(conflicts));
        console.log();
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── show ──────────────────────────────────────────────────────────────────
  conflictsCmd
    .command('show <id>')
    .description('Show a detailed local-vs-remote diff for one conflict')
    .option('--json', 'Output raw JSON')
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const { data: detail } = await apiFetch<ConflictDetail>('/v1/sync/conflicts/show', {
          projectId: projectId(),
          conflictId: id,
        });

        if (opts.json) {
          console.log(JSON.stringify(detail, null, 2));
          return;
        }

        console.log(
          `\n${C.bright}Conflict ${C.cyan}${shortId(detail.id)}${C.reset}` +
            `  ${C.dim}checkpoint ${shortId(detail.checkpointId)}${C.reset}`,
        );

        if (detail.files.length === 0) {
          console.log(`  ${C.dim}No file-level changes recorded.${C.reset}\n`);
          return;
        }

        for (const file of detail.files) {
          const tag = file.overlapping
            ? `${C.red}[overlapping]${C.reset}`
            : `${C.yellow}[non-overlapping]${C.reset}`;
          console.log(`\n${C.bright}${file.path}${C.reset} ${tag}`);
          console.log(
            `  ${C.green}- local${C.reset}  ${C.dim}(${file.local.device}` +
              `${file.local.updatedAt ? `, ${file.local.updatedAt}` : ''})${C.reset}`,
          );
          console.log(
            `  ${C.red}+ remote${C.reset} ${C.dim}(${file.remote.device}` +
              `${file.remote.updatedAt ? `, ${file.remote.updatedAt}` : ''})${C.reset}`,
          );
          console.log();
          console.log(renderFileDiff(file.local.content, file.remote.content));
        }
        console.log();
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── resolve ───────────────────────────────────────────────────────────────
  conflictsCmd
    .command('resolve <id>')
    .description('Resolve a conflict with a strategy: local | remote | manual')
    .requiredOption('-s, --strategy <strategy>', 'local, remote, or manual')
    .option('--json', 'Output raw JSON (non-manual strategies only)')
    .action(async (id: string, opts: { strategy: string; json?: boolean }) => {
      const strategy = opts.strategy.toLowerCase();
      if (!isStrategy(strategy)) {
        fail(`Invalid strategy "${opts.strategy}"`, ['Use one of: local, remote, manual']);
        return;
      }

      try {
        if (strategy === 'manual') {
          await runManualMerge(id);
          return;
        }

        const { data } = await apiFetch<ResolveResult>('/v1/sync/conflicts/resolve', {
          projectId: projectId(),
          conflictId: id,
          strategy,
        });

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const kept = strategy === 'local' ? 'local' : 'remote';
        console.log(
          `${C.green}[OK]${C.reset} Conflict ${C.cyan}${shortId(id)}${C.reset} resolved — ` +
            `kept ${C.bright}${kept}${C.reset} version ` +
            `(${data.resolvedFiles ?? 0} file(s)).`,
        );
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });

  // ── auto ──────────────────────────────────────────────────────────────────
  conflictsCmd
    .command('auto')
    .description('Auto-resolve all non-overlapping conflicts')
    .option('--dry-run', 'Show what would be resolved without applying')
    .option('--json', 'Output raw JSON')
    .action(async (opts: { dryRun?: boolean; json?: boolean }) => {
      try {
        const { data } = await apiFetch<AutoResult>('/v1/sync/conflicts/auto', {
          projectId: projectId(),
          dryRun: opts.dryRun === true,
        });

        const resolved = Array.isArray(data.resolved) ? data.resolved : [];
        const skipped = Array.isArray(data.skipped) ? data.skipped : [];

        if (opts.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const verb = opts.dryRun ? 'Would auto-resolve' : 'Auto-resolved';
        console.log(
          `\n${C.green}[OK]${C.reset} ${verb} ${C.bright}${resolved.length}${C.reset} ` +
            `non-overlapping conflict(s).`,
        );
        for (const id of resolved) {
          console.log(`  ${C.green}✓${C.reset} ${C.cyan}${shortId(id)}${C.reset}`);
        }

        if (skipped.length > 0) {
          console.log(
            `\n${C.yellow}[!]${C.reset} Skipped ${skipped.length} conflict(s) ` +
              `(overlapping — resolve manually):`,
          );
          for (const item of skipped) {
            console.log(
              `  ${C.yellow}~${C.reset} ${C.cyan}${shortId(item.id)}${C.reset} ` +
                `${C.dim}${item.reason}${C.reset}`,
            );
          }
          console.log(
            `\n  ${C.dim}Resolve each with: aitm conflicts resolve <id> --strategy manual${C.reset}`,
          );
        }
        console.log();
      } catch (err: unknown) {
        fail(errorMessage(err));
      }
    });
}
