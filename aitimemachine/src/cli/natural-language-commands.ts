/**
 * Natural Language Commands
 *
 * Exposes the natural-language time-travel parser (src/cli/natural-language.ts)
 * as user-facing CLI commands so the feature is reachable from the shipping
 * entry point (lib/cli-v2.js):
 *
 *   aitm ask <query...>      Find checkpoints matching a natural language query
 *                            (alias: nl, find-cp)
 *   aitm when <query...>     Find when something happened (natural language)
 *   aitm what-changed        Show what changed between two checkpoints
 *   aitm back-to <query...>  Restore to a state using natural language
 *                            (alias: back)
 *   aitm fix                 Restore to the last known good state
 *   aitm diagnose            Analyze checkpoint history for the suspected break
 *                            point and last-known-good state (alias: bisect-nl)
 *
 * These commands operate on the global checkpoint store written by the
 * `checkpoint` command (~/.aitimemachine/db.sqlite via SqliteRepo + CasStore),
 * matching the storage model the natural-language parser was built against.
 */

import { Command } from 'commander';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as readline from 'readline';
import { C, timeAgo } from './cli-helpers.js';
import type { SqliteRepo } from '../store/sqlite_repo.js';
import type { CasStore } from '../core/cas.js';
import type { Project, CheckpointRow } from '../store/repo.js';

// ─── Store resolution ─────────────────────────────────────────────────────────
// The natural-language parser reads from the SQLite checkpoint store. This
// mirrors the path convention used by the checkpoint command.

const DATA_DIR = path.join(os.homedir(), '.aitimemachine');
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');
const BLOBS_DIR = path.join(DATA_DIR, 'blobs');

interface ResolvedStore {
  repo: SqliteRepo;
  project: Project;
}

/** Open the content-addressable blob store used alongside the SQLite repo. */
async function openCas(): Promise<CasStore> {
  const { CasStore } = await import('../core/cas.js');
  return new CasStore(BLOBS_DIR);
}

/** Prompt the user for a yes/no confirmation on stdin. */
async function confirmPrompt(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question(`${message} [y/N] `, (a) => resolve(a.trim().toLowerCase()));
    });
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * Open the global checkpoint store and resolve the project rooted at `cwd`.
 * Returns null (and prints an actionable message) when the store is missing
 * or the current directory is not an initialized project.
 */
async function resolveStore(cwd: string): Promise<ResolvedStore | null> {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`${C.red}[!]${C.reset} No checkpoint store found at ${DB_PATH}`);
    console.error(`${C.dim}    Create one with: aitm checkpoint "Initial state"${C.reset}`);
    return null;
  }

  const { SqliteRepo } = await import('../store/sqlite_repo.js');
  const repo = new SqliteRepo(DB_PATH);

  const project = repo.listProjects().find((p) => p.rootPath === cwd);
  if (!project) {
    console.error(`${C.red}[!]${C.reset} No initialized project for ${cwd}`);
    console.error(`${C.dim}    Initialize with: aitm init${C.reset}`);
    return null;
  }

  return { repo, project };
}

// ─── ask ──────────────────────────────────────────────────────────────────────

interface AskOptions {
  limit: string;
  json?: boolean;
}

function parseLimit(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function runAsk(queryParts: string[], options: AskOptions): Promise<void> {
  const query = queryParts.join(' ').trim();
  if (!query) {
    console.error(`${C.red}[!]${C.reset} Provide a query, e.g. aitm ask "when tests passed"`);
    process.exitCode = 1;
    return;
  }

  const resolved = await resolveStore(process.cwd());
  if (!resolved) {
    process.exitCode = 1;
    return;
  }

  const { parseAdvancedQuery, findCheckpointForAdvancedQuery } = await import('./natural-language.js');
  const parsed = parseAdvancedQuery(query);
  const limit = parseLimit(options.limit, 10);
  const matches = findCheckpointForAdvancedQuery(resolved.repo, resolved.project.projectId, parsed, limit);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          query,
          intent: parsed.intent,
          confidence: parsed.confidence,
          explanation: parsed.explanation,
          searchTerms: parsed.searchTerms,
          matches: matches.map((m) => ({
            checkpointId: m.checkpoint.checkpointId,
            name: m.checkpoint.name,
            createdAt: m.checkpoint.createdAt,
            score: m.score,
            reason: m.reason,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n${C.bright}Interpreting:${C.reset} "${query}"`);
  console.log(`  ${C.dim}intent: ${parsed.intent} | confidence: ${parsed.confidence}%${C.reset}`);
  console.log(`  ${C.dim}${parsed.explanation}${C.reset}\n`);

  if (matches.length === 0) {
    console.log(`${C.yellow}[!]${C.reset} No checkpoints matched. Try \`aitm list\` to browse all.\n`);
    return;
  }

  console.log(`${C.bright}Matches${C.reset} (${matches.length}):\n`);
  matches.forEach((m, i) => {
    const when = timeAgo(new Date(m.checkpoint.createdAt));
    console.log(`  ${C.cyan}${i + 1}.${C.reset} ${m.checkpoint.name}`);
    console.log(
      `     ${C.dim}${m.checkpoint.checkpointId.slice(0, 12)} | ${when} | score ${m.score}${C.reset}`,
    );
    if (m.reason) console.log(`     ${C.dim}${m.reason}${C.reset}`);
  });
  console.log(`\n${C.dim}Restore with: aitm restore <checkpoint-id>${C.reset}\n`);
}

// ─── diagnose ──────────────────────────────────────────────────────────────────

interface DiagnoseOptions {
  lookback: string;
  json?: boolean;
}

async function runDiagnose(options: DiagnoseOptions): Promise<void> {
  const resolved = await resolveStore(process.cwd());
  if (!resolved) {
    process.exitCode = 1;
    return;
  }

  const { analyzeErrorHistory } = await import('./natural-language.js');
  const lookback = parseLimit(options.lookback, 120);
  const result = analyzeErrorHistory(resolved.repo, resolved.project.projectId, lookback);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          lookbackMinutes: lookback,
          suspectedBreakPoint: result.suspectedBreakPoint
            ? {
                checkpointId: result.suspectedBreakPoint.checkpoint.checkpointId,
                name: result.suspectedBreakPoint.checkpoint.name,
                createdAt: result.suspectedBreakPoint.checkpoint.createdAt,
                confidence: result.suspectedBreakPoint.confidence,
                reasons: result.suspectedBreakPoint.reasons,
              }
            : null,
          lastKnownGood: result.lastKnownGood
            ? {
                checkpointId: result.lastKnownGood.checkpoint.checkpointId,
                name: result.lastKnownGood.checkpoint.name,
                createdAt: result.lastKnownGood.checkpoint.createdAt,
                confidence: result.lastKnownGood.confidence,
                reasons: result.lastKnownGood.reasons,
              }
            : null,
          timeline: result.timeline.map((t) => ({
            checkpointId: t.checkpoint.checkpointId,
            name: t.checkpoint.name,
            createdAt: t.checkpoint.createdAt,
            status: t.status,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n${C.bright}Checkpoint Diagnosis${C.reset} ${C.dim}(last ${lookback} min)${C.reset}\n`);

  if (result.timeline.length === 0) {
    console.log(`${C.yellow}[!]${C.reset} No checkpoints in the lookback window.\n`);
    return;
  }

  if (result.lastKnownGood) {
    const g = result.lastKnownGood;
    console.log(`${C.green}Last known good${C.reset} (${g.confidence}% confidence):`);
    console.log(`  ${g.checkpoint.name}`);
    console.log(
      `  ${C.dim}${g.checkpoint.checkpointId.slice(0, 12)} | ${timeAgo(new Date(g.checkpoint.createdAt))}${C.reset}\n`,
    );
  }

  if (result.suspectedBreakPoint) {
    const b = result.suspectedBreakPoint;
    console.log(`${C.red}Suspected break point${C.reset} (${b.confidence}% confidence):`);
    console.log(`  ${b.checkpoint.name}`);
    console.log(
      `  ${C.dim}${b.checkpoint.checkpointId.slice(0, 12)} | ${timeAgo(new Date(b.checkpoint.createdAt))}${C.reset}`,
    );
    if (b.reasons.length > 0) console.log(`  ${C.dim}${b.reasons.join(', ')}${C.reset}`);
    console.log();
  }

  const glyph: Record<'good' | 'bad' | 'unknown', string> = {
    good: `${C.green}+${C.reset}`,
    bad: `${C.red}x${C.reset}`,
    unknown: `${C.dim}?${C.reset}`,
  };
  console.log(`${C.bright}Timeline${C.reset} (newest first):`);
  for (const entry of result.timeline) {
    console.log(`  ${glyph[entry.status]} ${entry.checkpoint.name} ${C.dim}(${timeAgo(new Date(entry.checkpoint.createdAt))})${C.reset}`);
  }
  console.log();
}

// ─── when ───────────────────────────────────────────────────────────────────

interface WhenOptions {
  limit: string;
  json?: boolean;
}

async function runWhen(queryParts: string[], options: WhenOptions): Promise<void> {
  const query = queryParts.join(' ').trim();
  if (!query) {
    console.error(`${C.red}[!]${C.reset} Provide a query, e.g. aitm when "tests started failing"`);
    process.exitCode = 1;
    return;
  }

  const resolved = await resolveStore(process.cwd());
  if (!resolved) {
    process.exitCode = 1;
    return;
  }

  const { parseTimeQuery, findCheckpointsForQuery } = await import('./natural-language.js');
  const parsed = parseTimeQuery(query);
  const limit = parseLimit(options.limit, 5);
  const results = findCheckpointsForQuery(resolved.repo, resolved.project.projectId, parsed, limit);

  if (options.json) {
    console.log(JSON.stringify({ query, type: parsed.type, results }, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`\n${C.yellow}[!]${C.reset} No checkpoints found matching "${query}".`);
    console.log(`${C.dim}    Try \`aitm list\` to see all checkpoints.${C.reset}\n`);
    return;
  }

  console.log(`\n${C.bright}Found ${results.length} checkpoint(s)${C.reset} matching "${query}":\n`);
  results.forEach((cp, i) => {
    console.log(`  ${C.cyan}${i + 1}.${C.reset} ${cp.name}`);
    console.log(`     ${C.dim}${cp.checkpointId.slice(0, 12)} | ${timeAgo(new Date(cp.createdAt))}${C.reset}`);
  });
  console.log(`\n${C.dim}Restore with: aitm back-to <checkpoint-id>${C.reset}\n`);
}

// ─── what-changed ─────────────────────────────────────────────────────────────

interface WhatChangedOptions {
  from?: string;
  to?: string;
  since?: string;
  json?: boolean;
}

interface ManifestShape {
  files: { path: string; hash: string; size: number }[];
}

async function resolveFromCheckpoint(
  resolved: ResolvedStore,
  options: WhatChangedOptions,
): Promise<{ from?: CheckpointRow | null; to?: CheckpointRow | null }> {
  const { repo, project } = resolved;

  if (options.from === 'last-green') {
    const { findLastGreenCheckpoint } = await import('./natural-language.js');
    const green = findLastGreenCheckpoint(repo, project.projectId);
    if (!green) return { from: null };
    return { from: repo.getCheckpoint(project.projectId, green.checkpointId) };
  }
  if (options.from) {
    return { from: repo.getCheckpoint(project.projectId, options.from) };
  }
  if (options.since) {
    const { parseTimeQuery, findCheckpointsForQuery } = await import('./natural-language.js');
    const results = findCheckpointsForQuery(repo, project.projectId, parseTimeQuery(options.since), 1);
    if (results.length === 0) return { from: null };
    return { from: repo.getCheckpoint(project.projectId, results[0].checkpointId) };
  }
  // Default: compare the two most recent checkpoints.
  const recent = repo.listCheckpointsNewestFirst(project.projectId, 2);
  if (recent.length < 2) return { from: null };
  return { from: recent[1], to: recent[0] };
}

async function runWhatChanged(options: WhatChangedOptions): Promise<void> {
  const resolved = await resolveStore(process.cwd());
  if (!resolved) {
    process.exitCode = 1;
    return;
  }
  const { repo, project } = resolved;

  const { from: fromCheckpoint, to: defaultTo } = await resolveFromCheckpoint(resolved, options);
  if (!fromCheckpoint) {
    console.error(`${C.red}[!]${C.reset} Could not resolve a 'from' checkpoint (need at least 2, or pass --from).`);
    process.exitCode = 1;
    return;
  }

  let toCheckpoint = defaultTo ?? null;
  if (!toCheckpoint) {
    toCheckpoint = options.to
      ? repo.getCheckpoint(project.projectId, options.to)
      : repo.listCheckpointsNewestFirst(project.projectId, 1)[0] ?? null;
  }
  if (!toCheckpoint) {
    console.error(`${C.red}[!]${C.reset} Could not resolve a 'to' checkpoint.`);
    process.exitCode = 1;
    return;
  }

  const cas = await openCas();
  const { analyzeChanges, explainChanges } = await import('./natural-language.js');

  let fromManifest: ManifestShape;
  let toManifest: ManifestShape;
  try {
    fromManifest = JSON.parse(cas.getBytes(fromCheckpoint.manifestBlobHash).toString('utf8')) as ManifestShape;
    toManifest = JSON.parse(cas.getBytes(toCheckpoint.manifestBlobHash).toString('utf8')) as ManifestShape;
  } catch (err) {
    console.error(`${C.red}[!]${C.reset} Failed to load checkpoint manifests: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const analysis = analyzeChanges(fromManifest, toManifest);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          from: { checkpointId: fromCheckpoint.checkpointId, name: fromCheckpoint.name, createdAt: fromCheckpoint.createdAt },
          to: { checkpointId: toCheckpoint.checkpointId, name: toCheckpoint.name, createdAt: toCheckpoint.createdAt },
          analysis,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n${C.bright}Comparing checkpoints${C.reset}\n`);
  console.log(`  From: ${fromCheckpoint.name} ${C.dim}(${timeAgo(new Date(fromCheckpoint.createdAt))})${C.reset}`);
  console.log(`  To:   ${toCheckpoint.name} ${C.dim}(${timeAgo(new Date(toCheckpoint.createdAt))})${C.reset}\n`);
  console.log(explainChanges(analysis));
}

// ─── back-to / fix (restore) ───────────────────────────────────────────────────

interface BackToOptions {
  mode: string;
  backup?: boolean;
  context?: boolean;
  yes?: boolean;
}

/**
 * Restore the workspace to a resolved checkpoint atomically, optionally writing
 * a context packet for AI continuation. Shared by `back-to` and `fix`.
 */
async function performRestore(
  resolved: ResolvedStore,
  target: CheckpointRow,
  opts: { mode: 'safe' | 'hard'; backup: boolean; context: boolean },
): Promise<void> {
  const { repo, project } = resolved;
  const cas = await openCas();
  const { parseManifestJson } = await import('../core/manifest.js');
  const { restoreWorkspaceAtomic } = await import('../core/restore.js');
  const { ProjectLock } = await import('../core/lock.js');

  const lock = new ProjectLock(project.rootPath);
  lock.acquire();
  try {
    const manifest = parseManifestJson(cas.getBytes(target.manifestBlobHash).toString('utf8'));
    const result = restoreWorkspaceAtomic({
      projectRoot: project.rootPath,
      cas,
      manifest,
      mode: opts.mode,
      backupCurrent: opts.backup,
    });

    console.log(`\n${C.green}[OK]${C.reset} Restored ${result.filesWritten} file(s)`);
    if (result.backupPath) console.log(`  ${C.dim}Backup: ${result.backupPath}${C.reset}`);

    if (opts.context) {
      const { buildContextPacket } = await import('../context/context-packet.js');
      const contextPath = path.join(project.rootPath, '.aitm', 'context.md');
      fs.mkdirSync(path.dirname(contextPath), { recursive: true });
      const contextContent = await buildContextPacket({
        repo,
        cas,
        projectId: project.projectId,
        checkpointId: target.checkpointId,
      });
      fs.writeFileSync(contextPath, contextContent, 'utf8');
      console.log(`  ${C.dim}Context: ${contextPath}${C.reset}`);
    }
  } finally {
    lock.release();
  }
}

async function resolveBackToTarget(
  resolved: ResolvedStore,
  query: string,
): Promise<CheckpointRow | null> {
  const { repo, project } = resolved;
  const { parseBackToQuery, findLastGreenCheckpoint, parseTimeQuery, findCheckpointsForQuery } =
    await import('./natural-language.js');
  const parsed = parseBackToQuery(query);

  switch (parsed.type) {
    case 'last-green': {
      const green = findLastGreenCheckpoint(repo, project.projectId);
      return green ? repo.getCheckpoint(project.projectId, green.checkpointId) : null;
    }
    case 'time-ago': {
      const timeQuery = parseTimeQuery(`${parsed.timeAmount} ${parsed.timeUnit}s ago`);
      const results = findCheckpointsForQuery(repo, project.projectId, timeQuery, 1);
      return results.length > 0 ? repo.getCheckpoint(project.projectId, results[0].checkpointId) : null;
    }
    case 'checkpoint-id':
      return parsed.value ? repo.getCheckpoint(project.projectId, parsed.value) : null;
    case 'keyword':
    default: {
      const keywordResults = findCheckpointsForQuery(repo, project.projectId, parseTimeQuery(parsed.value || query), 5);
      if (keywordResults.length > 0) {
        return repo.getCheckpoint(project.projectId, keywordResults[0].checkpointId);
      }
      const search = repo.searchCheckpoints(project.projectId, parsed.value || query);
      return search.length > 0 ? search[0] : null;
    }
  }
}

async function runBackTo(queryParts: string[], options: BackToOptions): Promise<void> {
  const query = queryParts.join(' ').trim();
  if (!query) {
    console.error(`${C.red}[!]${C.reset} Provide a query, e.g. aitm back-to "when tests passed"`);
    process.exitCode = 1;
    return;
  }

  const resolved = await resolveStore(process.cwd());
  if (!resolved) {
    process.exitCode = 1;
    return;
  }

  const target = await resolveBackToTarget(resolved, query);
  if (!target) {
    console.error(`${C.red}[!]${C.reset} No checkpoint matched "${query}". Try \`aitm list\`.`);
    process.exitCode = 1;
    return;
  }

  const mode = options.mode === 'hard' ? 'hard' : 'safe';
  console.log(`\n${C.bright}Going back to:${C.reset}`);
  console.log(`  ${target.name}`);
  console.log(`  ${C.dim}${new Date(target.createdAt).toLocaleString()} | mode: ${mode}${C.reset}`);

  if (!options.yes && !(await confirmPrompt('\nProceed?'))) {
    console.log('Aborted.');
    return;
  }

  await performRestore(resolved, target, {
    mode,
    backup: options.backup !== false,
    context: options.context !== false,
  });
}

interface FixOptions {
  test?: string;
  yes?: boolean;
  context?: boolean;
}

async function runFix(options: FixOptions): Promise<void> {
  const resolved = await resolveStore(process.cwd());
  if (!resolved) {
    process.exitCode = 1;
    return;
  }
  const { repo, project } = resolved;

  console.log(`\n${C.bright}Auto-fix:${C.reset} finding last known good state...\n`);

  const { findLastGreenCheckpoint } = await import('./natural-language.js');
  const green = findLastGreenCheckpoint(repo, project.projectId);
  if (!green) {
    console.error(`${C.red}[!]${C.reset} No 'green' checkpoint found.`);
    console.error(`${C.dim}    Create one named like "Tests green" or "Build passed".${C.reset}`);
    process.exitCode = 1;
    return;
  }

  const target = repo.getCheckpoint(project.projectId, green.checkpointId);
  if (!target) {
    console.error(`${C.red}[!]${C.reset} Could not load checkpoint ${green.checkpointId}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${C.green}Last good state:${C.reset} ${target.name}`);
  console.log(`  ${C.dim}${new Date(target.createdAt).toLocaleString()}${C.reset}`);

  if (!options.yes && !(await confirmPrompt('\nRestore to this state?'))) {
    console.log('Aborted.');
    return;
  }

  await performRestore(resolved, target, {
    mode: 'safe',
    backup: true,
    context: options.context === true,
  });

  if (options.test) {
    console.log(`\n${C.bright}Verifying${C.reset} with: ${options.test}`);
    const { execSync } = await import('child_process');
    try {
      execSync(options.test, { cwd: project.rootPath, stdio: 'inherit' });
      console.log(`\n${C.green}[OK]${C.reset} Verification passed.`);
    } catch {
      console.log(`\n${C.yellow}[!]${C.reset} Verification failed - you may need to go back further.`);
      console.log(`${C.dim}    Try: aitm bisect --test "${options.test}"${C.reset}`);
      process.exitCode = 1;
    }
  }
}

// ─── Registration ───────────────────────────────────────────────────────────

export function registerNaturalLanguageCommands(program: Command): void {
  program
    .command('ask')
    .alias('nl')
    .alias('find-cp')
    .description('Find checkpoints using a natural language query (e.g. "when tests passed", "before docker changes")')
    .argument('<query...>', 'Natural language query')
    .option('-n, --limit <n>', 'Maximum number of matches', '10')
    .option('-j, --json', 'Output as JSON')
    .action(runAsk);

  program
    .command('when')
    .description('Find when something happened using natural language (e.g. "tests started failing")')
    .argument('<query...>', 'Natural language query')
    .option('-l, --limit <n>', 'Maximum results', '5')
    .option('-j, --json', 'Output as JSON')
    .action(runWhen);

  program
    .command('what-changed')
    .description('Show what changed between two checkpoints')
    .option('-f, --from <checkpoint>', "From checkpoint ID or 'last-green'")
    .option('-t, --to <checkpoint>', 'To checkpoint ID (default: latest)')
    .option('--since <time>', "Changes since (e.g. '1 hour ago', 'yesterday')")
    .option('-j, --json', 'Output as JSON')
    .action(runWhatChanged);

  program
    .command('back-to')
    // Note: no `back` alias — a top-level `back` command is already registered
    // by checkpoint-commands; commander forbids an alias that shadows a command.
    .description('Restore to a state using natural language (e.g. "when tests passed", "2 hours ago")')
    .argument('<query...>', 'Natural language query or checkpoint ID')
    .option('-m, --mode <mode>', 'Restore mode (safe|hard)', 'safe')
    .option('--no-backup', 'Skip backup of current state')
    .option('--no-context', 'Skip generating the context file')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(runBackTo);

  program
    .command('fix')
    .description('Auto-fix: restore to the last known good state (tests passed / build green)')
    .option('-t, --test <command>', "Test command to verify after restore (e.g. 'npm test')")
    .option('--context', 'Generate a context file for AI continuation')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(runFix);

  program
    .command('diagnose')
    .alias('bisect-nl')
    .description('Analyze recent checkpoint history for the suspected break point and last known good state')
    .option('-l, --lookback <minutes>', 'Lookback window in minutes', '120')
    .option('-j, --json', 'Output as JSON')
    .action(runDiagnose);
}
