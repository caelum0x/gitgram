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
 *   aitm fix                 Restore to the last known good state
 *   aitm diagnose            Analyze checkpoint history for the suspected break
 *                            point and last-known-good state (alias: bisect-nl)
 *
 * These commands operate on the SAME project-local checkpoint store written by
 * `aitm checkpoint`, `aitm init`, watch/daemon auto-checkpoints, and the shipped
 * MCP server — all of which go through TimeMachineEngine (`.aitimemachine/`).
 * The engine is adapted to the parser's read interface via
 * EngineCheckpointReader so a single store backs every checkpoint command.
 */

import { Command } from 'commander';
import * as path from 'path';
import { C, timeAgo, confirm } from './cli-helpers.js';
import type { TimeMachineEngine } from '../core/engine.js';
import type { CheckpointReader } from './natural-language.js';
import type { CheckpointRow } from '../store/repo.js';
import { EngineCheckpointReader } from './engine-checkpoint-reader.js';

// ─── Store resolution ─────────────────────────────────────────────────────────
// Natural-language commands read from the project-local engine store. A project
// is "initialized" once it has at least one checkpoint (created by
// `aitm checkpoint`, `aitm init`, watch mode, or the MCP server).

interface ResolvedStore {
  engine: TimeMachineEngine;
  reader: CheckpointReader;
  projectId: string;
  projectRoot: string;
}

/** Stable per-project identifier derived from the project root path. */
function projectIdFor(root: string): string {
  return path.basename(root) || root;
}

/**
 * Open the project-local engine store for the current directory. Returns null
 * (and prints an actionable message) when the project has no checkpoints yet.
 */
async function resolveStore(cwd: string): Promise<ResolvedStore | null> {
  const { TimeMachineEngine } = await import('../core/engine.js');
  const engine = new TimeMachineEngine(cwd);

  if (engine.listTimePoints().length === 0) {
    console.error(`${C.red}[!]${C.reset} No checkpoints found for ${cwd}`);
    console.error(`${C.dim}    Create one with: aitm checkpoint "Initial state"${C.reset}`);
    console.error(`${C.dim}    Or initialize the project with: aitm init${C.reset}`);
    return null;
  }

  const projectId = projectIdFor(cwd);
  const reader = new EngineCheckpointReader(engine, projectId);
  return { engine, reader, projectId, projectRoot: cwd };
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
  const matches = findCheckpointForAdvancedQuery(resolved.reader, resolved.projectId, parsed, limit);

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
  const result = analyzeErrorHistory(resolved.reader, resolved.projectId, lookback);

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
  const results = findCheckpointsForQuery(resolved.reader, resolved.projectId, parsed, limit);

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

/**
 * Resolve the (from, to) checkpoint pair to diff. Defaults to the two most
 * recent checkpoints. Supports --from <id|last-green>, --to <id>, --since <time>.
 */
async function resolveDiffPair(
  resolved: ResolvedStore,
  options: WhatChangedOptions,
): Promise<{ from: CheckpointRow | null; to: CheckpointRow | null }> {
  const { reader, projectId } = resolved;
  const recent = reader.listCheckpointsNewestFirst(projectId, 2);

  let from: CheckpointRow | null = null;
  let to: CheckpointRow | null = null;

  if (options.from === 'last-green') {
    const { findLastGreenCheckpoint } = await import('./natural-language.js');
    const green = findLastGreenCheckpoint(reader, projectId);
    from = green ? reader.getCheckpoint(projectId, green.checkpointId) : null;
  } else if (options.from) {
    from = reader.getCheckpoint(projectId, options.from);
  } else if (options.since) {
    const { parseTimeQuery, findCheckpointsForQuery } = await import('./natural-language.js');
    const results = findCheckpointsForQuery(reader, projectId, parseTimeQuery(options.since), 1);
    from = results.length > 0 ? reader.getCheckpoint(projectId, results[0].checkpointId) : null;
  } else {
    // Default: compare the two most recent checkpoints (older -> newer).
    from = recent[1] ?? null;
    to = recent[0] ?? null;
  }

  if (!to) {
    to = options.to
      ? reader.getCheckpoint(projectId, options.to)
      : recent[0] ?? null;
  }

  return { from, to };
}

async function runWhatChanged(options: WhatChangedOptions): Promise<void> {
  const resolved = await resolveStore(process.cwd());
  if (!resolved) {
    process.exitCode = 1;
    return;
  }

  const { from, to } = await resolveDiffPair(resolved, options);
  if (!from) {
    console.error(`${C.red}[!]${C.reset} Could not resolve a 'from' checkpoint (need at least 2, or pass --from).`);
    process.exitCode = 1;
    return;
  }
  if (!to) {
    console.error(`${C.red}[!]${C.reset} Could not resolve a 'to' checkpoint.`);
    process.exitCode = 1;
    return;
  }

  let diff: { added: string[]; modified: string[]; deleted: string[] };
  try {
    // Compare against current working tree when `to` is the newest checkpoint
    // and no explicit `--to` was given would require extra state; instead diff
    // the two resolved checkpoints deterministically via the engine.
    diff = resolved.engine.getDiff(from.checkpointId, to.checkpointId);
  } catch (err) {
    console.error(`${C.red}[!]${C.reset} Failed to diff checkpoints: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          from: { checkpointId: from.checkpointId, name: from.name, createdAt: from.createdAt },
          to: { checkpointId: to.checkpointId, name: to.name, createdAt: to.createdAt },
          analysis: {
            filesAdded: diff.added,
            filesRemoved: diff.deleted,
            filesModified: diff.modified,
            summary: summarizeDiff(diff),
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n${C.bright}Comparing checkpoints${C.reset}\n`);
  console.log(`  From: ${from.name} ${C.dim}(${timeAgo(new Date(from.createdAt))})${C.reset}`);
  console.log(`  To:   ${to.name} ${C.dim}(${timeAgo(new Date(to.createdAt))})${C.reset}\n`);
  console.log(`${C.bright}Change Summary${C.reset}`);
  console.log(`  ${summarizeDiff(diff)}\n`);
  renderFileList(`${C.green}Added`, diff.added);
  renderFileList(`${C.yellow}Modified`, diff.modified);
  renderFileList(`${C.red}Removed`, diff.deleted);
}

function summarizeDiff(diff: { added: string[]; modified: string[]; deleted: string[] }): string {
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`${diff.added.length} added`);
  if (diff.modified.length > 0) parts.push(`${diff.modified.length} modified`);
  if (diff.deleted.length > 0) parts.push(`${diff.deleted.length} removed`);
  return parts.length > 0 ? parts.join(', ') : 'No changes detected';
}

function renderFileList(label: string, files: string[]): void {
  if (files.length === 0) return;
  console.log(`${label} (${files.length}):${C.reset}`);
  for (const f of files.slice(0, 10)) {
    console.log(`  ${f}`);
  }
  if (files.length > 10) console.log(`  ${C.dim}... and ${files.length - 10} more${C.reset}`);
  console.log();
}

// ─── back-to / fix (restore) ───────────────────────────────────────────────────

interface BackToOptions {
  mode: string;
  backup?: boolean;
  yes?: boolean;
}

async function resolveBackToTarget(
  resolved: ResolvedStore,
  query: string,
): Promise<CheckpointRow | null> {
  const { reader, projectId } = resolved;
  const { parseBackToQuery, findLastGreenCheckpoint, parseTimeQuery, findCheckpointsForQuery } =
    await import('./natural-language.js');
  const parsed = parseBackToQuery(query);

  switch (parsed.type) {
    case 'last-green': {
      const green = findLastGreenCheckpoint(reader, projectId);
      return green ? reader.getCheckpoint(projectId, green.checkpointId) : null;
    }
    case 'time-ago': {
      const timeQuery = parseTimeQuery(`${parsed.timeAmount} ${parsed.timeUnit}s ago`);
      const results = findCheckpointsForQuery(reader, projectId, timeQuery, 1);
      return results.length > 0 ? reader.getCheckpoint(projectId, results[0].checkpointId) : null;
    }
    case 'checkpoint-id':
      return parsed.value ? reader.getCheckpoint(projectId, parsed.value) : null;
    case 'keyword':
    default: {
      const keywordResults = findCheckpointsForQuery(reader, projectId, parseTimeQuery(parsed.value || query), 5);
      if (keywordResults.length > 0) {
        return reader.getCheckpoint(projectId, keywordResults[0].checkpointId);
      }
      const search = reader.searchCheckpoints(projectId, parsed.value || query);
      return search.length > 0 ? search[0] : null;
    }
  }
}

/** Restore the workspace to a resolved checkpoint via the engine. */
function performRestore(resolved: ResolvedStore, target: CheckpointRow): void {
  const result = resolved.engine.restore(target.checkpointId);
  console.log(`\n${C.green}[OK]${C.reset} Restored ${result.filesRestored} file(s)`);
  if (result.filesDeleted > 0) console.log(`  ${C.dim}Deleted ${result.filesDeleted} file(s)${C.reset}`);
  if (result.messagesRemoved > 0) console.log(`  ${C.dim}Removed ${result.messagesRemoved} message(s)${C.reset}`);
  console.log(`  ${C.dim}A backup checkpoint of the prior state was created automatically.${C.reset}`);
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

  console.log(`\n${C.bright}Going back to:${C.reset}`);
  console.log(`  ${target.name}`);
  console.log(`  ${C.dim}${new Date(target.createdAt).toLocaleString()}${C.reset}`);

  if (!options.yes && !(await confirm('\nProceed?'))) {
    console.log('Aborted.');
    return;
  }

  try {
    performRestore(resolved, target);
  } catch (err) {
    console.error(`${C.red}[!]${C.reset} Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

interface FixOptions {
  test?: string;
  yes?: boolean;
}

async function runFix(options: FixOptions): Promise<void> {
  const resolved = await resolveStore(process.cwd());
  if (!resolved) {
    process.exitCode = 1;
    return;
  }
  const { reader, projectId } = resolved;

  console.log(`\n${C.bright}Auto-fix:${C.reset} finding last known good state...\n`);

  const { findLastGreenCheckpoint } = await import('./natural-language.js');
  const green = findLastGreenCheckpoint(reader, projectId);
  if (!green) {
    console.error(`${C.red}[!]${C.reset} No 'green' checkpoint found.`);
    console.error(`${C.dim}    Create one named like "Tests green" or "Build passed".${C.reset}`);
    process.exitCode = 1;
    return;
  }

  const target = reader.getCheckpoint(projectId, green.checkpointId);
  if (!target) {
    console.error(`${C.red}[!]${C.reset} Could not load checkpoint ${green.checkpointId}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${C.green}Last good state:${C.reset} ${target.name}`);
  console.log(`  ${C.dim}${new Date(target.createdAt).toLocaleString()}${C.reset}`);

  if (!options.yes && !(await confirm('\nRestore to this state?'))) {
    console.log('Aborted.');
    return;
  }

  try {
    performRestore(resolved, target);
  } catch (err) {
    console.error(`${C.red}[!]${C.reset} Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  if (options.test) {
    console.log(`\n${C.bright}Verifying${C.reset} with: ${options.test}`);
    const { execSync } = await import('child_process');
    try {
      execSync(options.test, { cwd: resolved.projectRoot, stdio: 'inherit' });
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
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(runBackTo);

  program
    .command('fix')
    .description('Auto-fix: restore to the last known good state (tests passed / build green)')
    .option('-t, --test <command>', "Test command to verify after restore (e.g. 'npm test')")
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
