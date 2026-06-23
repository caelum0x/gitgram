/**
 * Doctor / Diagnostics Commands
 *
 * `aitm doctor [--json] [--fix]`
 *
 * Runs a battery of environment health checks and reports each as
 * pass / warn / fail with an actionable detail line. Designed to be the
 * first thing a user (or support engineer) runs when "something is wrong".
 *
 * Checks:
 *   1.  Node version (>= 18)
 *   2.  AITM config file present & valid (~/.aitm/config.json)
 *   3.  Project initialized (.aitimemachine present, store readable)
 *   4.  API connectivity (GET <api_url>/health)
 *   5.  API key configured & valid
 *   6.  Disk space available for checkpoints
 *   7.  Git repository detected (optional, warns if missing)
 *   8.  CAS store integrity (sample loose objects, verify hashes)
 *   9.  Daemon status (running / stopped)
 *   10. Provider health (GET <api_url>/health/providers if available)
 *
 * With --fix, safe auto-fixes are attempted (create missing config dir,
 * re-init project store). With --json, structured output is emitted.
 *
 * Uses Commander + raw ANSI colors (no chalk dependency).
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { C } from './cli-helpers.js';
import { getStoredAuth } from '../auth/cli-auth.js';

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'warn' | 'fail';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
  /** Optional fix hint shown to the user when not auto-fixed. */
  hint?: string;
  /** True when --fix successfully repaired this check. */
  fixed?: boolean;
}

interface DoctorOptions {
  json?: boolean;
  fix?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_NODE_MAJOR = 18;
const AITM_CONFIG_DIR = path.join(os.homedir(), '.aitm');
const AITM_CONFIG_PATH = path.join(AITM_CONFIG_DIR, 'config.json');
const PROJECT_DIR_NAME = '.aitimemachine';
const DEFAULT_API_URL = 'http://localhost:3001';
const API_TIMEOUT_MS = 4000;
const MIN_FREE_DISK_BYTES = 100 * 1024 * 1024; // 100 MB
const CAS_SAMPLE_SIZE = 8;

// ─── Status glyphs ──────────────────────────────────────────────────────────

const GLYPH: Record<CheckStatus, string> = {
  pass: `${C.green}✓${C.reset}`,
  warn: `${C.yellow}⚠${C.reset}`,
  fail: `${C.red}✗${C.reset}`,
};

// ─── Small helpers ──────────────────────────────────────────────────────────

function pass(name: string, detail: string): CheckResult {
  return { name, status: 'pass', detail };
}

function warn(name: string, detail: string, hint?: string): CheckResult {
  return { name, status: 'warn', detail, hint };
}

function fail(name: string, detail: string, hint?: string): CheckResult {
  return { name, status: 'fail', detail, hint };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function readConfig(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(AITM_CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(AITM_CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveApiUrl(config: Record<string, unknown> | null): string {
  const fromEnv = process.env.AITM_API_URL;
  const fromConfig = config && typeof config.api_url === 'string' ? config.api_url : undefined;
  return (fromEnv || fromConfig || DEFAULT_API_URL).replace(/\/+$/, '');
}

function resolveApiKey(): string | undefined {
  if (process.env.AITM_API_KEY) return process.env.AITM_API_KEY;
  const auth = getStoredAuth();
  return auth?.apiKey;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Individual checks ──────────────────────────────────────────────────────

function checkNodeVersion(): CheckResult {
  const raw = process.versions.node;
  const major = parseInt(raw.split('.')[0] ?? '0', 10);
  if (major >= MIN_NODE_MAJOR) {
    return pass('Node version', `v${raw} (>= ${MIN_NODE_MAJOR} required)`);
  }
  return fail(
    'Node version',
    `v${raw} is below the required v${MIN_NODE_MAJOR}`,
    `Upgrade Node: https://nodejs.org (need >= ${MIN_NODE_MAJOR})`,
  );
}

function checkConfigFile(opts: DoctorOptions): CheckResult {
  if (!fs.existsSync(AITM_CONFIG_DIR)) {
    if (opts.fix) {
      try {
        fs.mkdirSync(AITM_CONFIG_DIR, { recursive: true });
        fs.writeFileSync(AITM_CONFIG_PATH, JSON.stringify({}, null, 2));
        return { ...pass('Config file', `Created ${AITM_CONFIG_PATH}`), fixed: true };
      } catch (err) {
        return fail('Config file', `Failed to create config dir: ${(err as Error).message}`);
      }
    }
    return warn(
      'Config file',
      `${AITM_CONFIG_DIR} does not exist`,
      'Run `aitm doctor --fix` or `aitm config set api_url <url>`',
    );
  }
  if (!fs.existsSync(AITM_CONFIG_PATH)) {
    return warn('Config file', `${AITM_CONFIG_PATH} not found (using defaults)`, 'Run `aitm config set api_url <url>`');
  }
  try {
    JSON.parse(fs.readFileSync(AITM_CONFIG_PATH, 'utf-8'));
    return pass('Config file', `Valid JSON at ${AITM_CONFIG_PATH}`);
  } catch (err) {
    return fail(
      'Config file',
      `${AITM_CONFIG_PATH} is not valid JSON: ${(err as Error).message}`,
      'Fix or delete the file, then re-run',
    );
  }
}

function checkProjectInitialized(opts: DoctorOptions): CheckResult {
  const projectDir = path.join(process.cwd(), PROJECT_DIR_NAME);
  const storeDir = path.join(projectDir, 'store');

  if (!fs.existsSync(projectDir)) {
    if (opts.fix) {
      try {
        fs.mkdirSync(storeDir, { recursive: true });
        return { ...pass('Project initialized', `Created ${PROJECT_DIR_NAME}/`), fixed: true };
      } catch (err) {
        return fail('Project initialized', `Failed to create ${PROJECT_DIR_NAME}: ${(err as Error).message}`);
      }
    }
    return warn(
      'Project initialized',
      `No ${PROJECT_DIR_NAME}/ in ${process.cwd()}`,
      'Run `aitm init` to initialize this project',
    );
  }

  try {
    fs.accessSync(projectDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    return fail('Project initialized', `${PROJECT_DIR_NAME}/ is not readable/writable`, 'Check directory permissions');
  }

  if (!fs.existsSync(storeDir)) {
    if (opts.fix) {
      try {
        fs.mkdirSync(storeDir, { recursive: true });
        return { ...pass('Project initialized', `Re-created store at ${PROJECT_DIR_NAME}/store`), fixed: true };
      } catch (err) {
        return fail('Project initialized', `Failed to create store: ${(err as Error).message}`);
      }
    }
    return warn('Project initialized', `${PROJECT_DIR_NAME}/store missing`, 'Run `aitm doctor --fix` or `aitm init`');
  }

  return pass('Project initialized', `${PROJECT_DIR_NAME}/ present and readable`);
}

async function checkApiConnectivity(apiUrl: string): Promise<CheckResult> {
  try {
    const res = await fetchWithTimeout(`${apiUrl}/health`, {});
    if (res.ok) {
      return pass('API connectivity', `${apiUrl}/health responded ${res.status}`);
    }
    return warn('API connectivity', `${apiUrl}/health returned HTTP ${res.status}`, 'Check that the AITM API server is healthy');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = msg.includes('abort') ? 'timed out' : msg;
    return fail(
      'API connectivity',
      `Cannot reach ${apiUrl}/health (${reason})`,
      'Start the server (`aitm serve`) or set AITM_API_URL',
    );
  }
}

async function checkApiKey(apiUrl: string): Promise<CheckResult> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    return warn(
      'API key',
      'No API key configured',
      'Run `aitm login` or set AITM_API_KEY',
    );
  }
  try {
    const res = await fetchWithTimeout(`${apiUrl}/auth/me`, { 'X-API-Key': apiKey });
    if (res.ok) {
      return pass('API key', 'Configured and accepted by server');
    }
    if (res.status === 401 || res.status === 403) {
      return fail('API key', `Server rejected the key (HTTP ${res.status})`, 'Re-authenticate with `aitm login`');
    }
    // Endpoint may not exist; key is at least present.
    return warn('API key', `Configured (could not validate, HTTP ${res.status})`, 'Server did not validate the key');
  } catch {
    return warn('API key', 'Configured (server unreachable, not validated)', 'Validate once the API is reachable');
  }
}

function checkDiskSpace(): CheckResult {
  const target = path.join(process.cwd(), PROJECT_DIR_NAME);
  const probe = fs.existsSync(target) ? target : process.cwd();
  try {
    const stat = fs.statfsSync(probe);
    const free = stat.bavail * stat.bsize;
    if (free >= MIN_FREE_DISK_BYTES) {
      return pass('Disk space', `${formatBytes(free)} free for checkpoints`);
    }
    return warn(
      'Disk space',
      `Only ${formatBytes(free)} free (recommended >= ${formatBytes(MIN_FREE_DISK_BYTES)})`,
      'Run `aitm gc` to reclaim space or free up disk',
    );
  } catch (err) {
    return warn('Disk space', `Could not determine free space: ${(err as Error).message}`);
  }
}

async function checkGitRepository(): Promise<CheckResult> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: process.cwd(),
    });
    if (stdout.trim() === 'true') {
      return pass('Git repository', 'Detected git working tree');
    }
    return warn('Git repository', 'Not inside a git work tree', 'AITM works best alongside git');
  } catch {
    return warn('Git repository', 'No git repository detected (optional)', 'Run `git init` for richer history');
  }
}

function checkCasIntegrity(): CheckResult {
  const storeDir = path.join(process.cwd(), PROJECT_DIR_NAME, 'store');
  if (!fs.existsSync(storeDir)) {
    return warn('CAS store integrity', 'No store to verify (project not initialized)', 'Run `aitm init`');
  }

  // Collect loose object paths: store/<2-hex>/<hash>
  const objects: Array<{ hash: string; file: string }> = [];
  try {
    for (const sub of fs.readdirSync(storeDir)) {
      const subDir = path.join(storeDir, sub);
      if (!fs.statSync(subDir).isDirectory() || !/^[0-9a-f]{2}$/.test(sub)) continue;
      for (const name of fs.readdirSync(subDir)) {
        objects.push({ hash: name, file: path.join(subDir, name) });
        if (objects.length >= CAS_SAMPLE_SIZE * 4) break;
      }
      if (objects.length >= CAS_SAMPLE_SIZE * 4) break;
    }
  } catch (err) {
    return fail('CAS store integrity', `Failed to read store: ${(err as Error).message}`);
  }

  if (objects.length === 0) {
    return pass('CAS store integrity', 'No loose objects to verify (empty or packed)');
  }

  // Sample up to CAS_SAMPLE_SIZE objects and re-hash. The store truncates
  // sha256 to 32 hex chars, so we compare against that prefix.
  const sample = objects.slice(0, CAS_SAMPLE_SIZE);
  const corrupt: string[] = [];
  for (const obj of sample) {
    try {
      const buf = fs.readFileSync(obj.file);
      const actual = crypto.createHash('sha256').update(buf).digest('hex').slice(0, obj.hash.length);
      if (actual !== obj.hash) corrupt.push(obj.hash.slice(0, 12));
    } catch {
      corrupt.push(obj.hash.slice(0, 12));
    }
  }

  if (corrupt.length === 0) {
    return pass('CAS store integrity', `Verified ${sample.length}/${objects.length} sampled object(s)`);
  }
  return fail(
    'CAS store integrity',
    `${corrupt.length}/${sample.length} sampled object(s) failed hash check: ${corrupt.join(', ')}`,
    'Store may be corrupt; restore from a backup or re-pull',
  );
}

async function checkDaemonStatus(apiUrl: string): Promise<CheckResult> {
  // The daemon answers on the same API surface; probe a lightweight endpoint.
  try {
    const res = await fetchWithTimeout(`${apiUrl}/health`, {});
    if (res.ok) {
      return pass('Daemon status', 'Running (responds on health endpoint)');
    }
    return warn('Daemon status', `Reachable but unhealthy (HTTP ${res.status})`);
  } catch {
    return warn('Daemon status', 'Stopped or unreachable', 'Start with `aitm daemon start`');
  }
}

async function checkProviderHealth(apiUrl: string): Promise<CheckResult> {
  const apiKey = resolveApiKey();
  const headers: Record<string, string> = apiKey ? { 'X-API-Key': apiKey } : {};
  try {
    const res = await fetchWithTimeout(`${apiUrl}/health/providers`, headers);
    if (res.status === 404) {
      return warn('Provider health', 'Endpoint not available on this server', 'Upgrade the API server for provider checks');
    }
    if (!res.ok) {
      return warn('Provider health', `Returned HTTP ${res.status}`);
    }
    const body = (await res.json().catch(() => null)) as
      | { providers?: Array<{ name: string; healthy: boolean }> }
      | null;
    const providers = body?.providers ?? [];
    if (providers.length === 0) {
      return pass('Provider health', 'No providers configured');
    }
    const unhealthy = providers.filter((p) => !p.healthy).map((p) => p.name);
    if (unhealthy.length === 0) {
      return pass('Provider health', `${providers.length} provider(s) healthy`);
    }
    return fail(
      'Provider health',
      `${unhealthy.length}/${providers.length} provider(s) unhealthy: ${unhealthy.join(', ')}`,
      'Check provider credentials and rate limits',
    );
  } catch {
    return warn('Provider health', 'Could not reach provider health endpoint');
  }
}

// ─── Orchestration ──────────────────────────────────────────────────────────

async function runAllChecks(opts: DoctorOptions): Promise<CheckResult[]> {
  const config = readConfig();
  const apiUrl = resolveApiUrl(config);

  // Synchronous / fast checks first.
  const results: CheckResult[] = [
    checkNodeVersion(),
    checkConfigFile(opts),
    checkProjectInitialized(opts),
  ];

  // Network checks run in parallel for speed.
  const [api, apiKey, daemon, providers] = await Promise.all([
    checkApiConnectivity(apiUrl),
    checkApiKey(apiUrl),
    checkDaemonStatus(apiUrl),
    checkProviderHealth(apiUrl),
  ]);

  results.push(api, apiKey);
  results.push(checkDiskSpace());
  results.push(await checkGitRepository());
  results.push(checkCasIntegrity());
  results.push(daemon, providers);

  return results;
}

function summarize(results: CheckResult[]): { passed: number; warnings: number; failed: number } {
  return results.reduce(
    (acc, r) => {
      if (r.status === 'pass') acc.passed += 1;
      else if (r.status === 'warn') acc.warnings += 1;
      else acc.failed += 1;
      return acc;
    },
    { passed: 0, warnings: 0, failed: 0 },
  );
}

function printHuman(results: CheckResult[], opts: DoctorOptions): void {
  console.log(`\n${C.bright}AITM Doctor${C.reset} ${C.dim}— environment diagnostics${C.reset}\n`);

  for (const r of results) {
    const fixedTag = r.fixed ? ` ${C.green}(fixed)${C.reset}` : '';
    console.log(`  ${GLYPH[r.status]} ${C.bright}${r.name}${C.reset}: ${r.detail}${fixedTag}`);
    if (r.hint && r.status !== 'pass' && !r.fixed) {
      console.log(`      ${C.dim}↳ ${r.hint}${C.reset}`);
    }
  }

  const { passed, warnings, failed } = summarize(results);
  const parts = [
    `${C.green}${passed} passed${C.reset}`,
    `${C.yellow}${warnings} warning${warnings === 1 ? '' : 's'}${C.reset}`,
    `${C.red}${failed} failed${C.reset}`,
  ];
  console.log(`\n${C.bright}Summary:${C.reset} ${parts.join(', ')}`);

  if (failed > 0) {
    console.log(`${C.dim}Run with --fix to attempt safe automatic repairs.${C.reset}`);
  } else if (warnings > 0 && !opts.fix) {
    console.log(`${C.dim}Some optional checks raised warnings — see hints above.${C.reset}`);
  }
  console.log();
}

function printJson(results: CheckResult[]): void {
  const summary = summarize(results);
  console.log(
    JSON.stringify(
      {
        ok: summary.failed === 0,
        summary,
        checks: results.map((r) => ({
          name: r.name,
          status: r.status,
          detail: r.detail,
          hint: r.hint ?? null,
          fixed: r.fixed ?? false,
        })),
      },
      null,
      2,
    ),
  );
}

// ─── Registration ───────────────────────────────────────────────────────────

export function registerDoctorCommands(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose AITM environment health (Node, config, API, store, daemon, providers)')
    .option('-j, --json', 'Output structured JSON')
    .option('--fix', 'Attempt safe automatic fixes (create config dir, re-init store)')
    .action(async (opts: DoctorOptions) => {
      const results = await runAllChecks(opts);

      if (opts.json) {
        printJson(results);
      } else {
        printHuman(results, opts);
      }

      // Non-zero exit when any hard failure remains after fixes.
      const { failed } = summarize(results);
      if (failed > 0) process.exitCode = 1;
    });
}
