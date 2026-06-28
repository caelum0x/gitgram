/**
 * register-analysis-tools.ts
 *
 * Registers code analysis tools into the AITM MCP server.
 * All tools run local shell commands (npm, pip, cargo, go) or parse files
 * directly — no external server required.
 *
 * Tools:
 *   analyze_dependencies        — find outdated packages for npm/pip/cargo/go
 *   check_security_vulnerabilities — scan for CVEs via npm audit / pip safety
 *   measure_code_complexity     — cyclomatic complexity for TS/JS files
 *   find_dead_code              — unused exports via ts-prune or grep heuristic
 *   estimate_tech_debt          — TODO/FIXME/HACK counts + large-file report
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { z } from 'zod';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import { readOnlyAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse } from '../lib/tool-responses.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const execFileAsync = promisify(execFile);

/** Run a command, returning stdout. Rejects with stderr on non-zero exit. */
async function run(
  cmd: string,
  args: string[],
  cwd: string
): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

/** Recursively collect all files under a directory, skipping common noise dirs. */
async function collectFiles(
  dir: string,
  extensions: string[],
  skipDirs = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next'])
): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        const sub = await collectFiles(join(dir, entry.name), extensions, skipDirs);
        results.push(...sub);
      }
    } else if (entry.isFile()) {
      if (extensions.length === 0 || extensions.includes(extname(entry.name))) {
        results.push(join(dir, entry.name));
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

/** Map npm audit severity strings to our canonical set. */
function normalizeNpmSeverity(s: string): Severity {
  const map: Record<string, Severity> = {
    critical: 'critical',
    high: 'high',
    moderate: 'moderate',
    low: 'low',
    info: 'info',
  };
  return map[s.toLowerCase()] ?? 'info';
}

// ---------------------------------------------------------------------------
// 1. analyze_dependencies
// ---------------------------------------------------------------------------

interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  severity: 'major' | 'minor' | 'patch';
}

interface AnalyzeDependenciesResult {
  outdated: OutdatedPackage[];
  /** Total number of installed/declared direct + transitive dependencies. */
  total: number;
  /** Count of dependencies already on their latest version (total - outdated). */
  upToDate: number;
}

function semverBump(current: string, latest: string): 'major' | 'minor' | 'patch' {
  const c = current.replace(/^[^0-9]*/, '').split('.').map(Number);
  const l = latest.replace(/^[^0-9]*/, '').split('.').map(Number);
  if ((l[0] ?? 0) > (c[0] ?? 0)) return 'major';
  if ((l[1] ?? 0) > (c[1] ?? 0)) return 'minor';
  return 'patch';
}

/**
 * Count the total number of installed dependencies for an ecosystem.
 * Returns `null` when the count cannot be determined (e.g. the CLI is missing),
 * so callers can fall back to a conservative estimate rather than reporting 0.
 */
async function countTotalDependencies(
  projectPath: string,
  ecosystem: 'npm' | 'pip' | 'cargo' | 'go'
): Promise<number | null> {
  try {
    if (ecosystem === 'npm') {
      // `npm ls --all --json` lists the full resolved dependency tree.
      let raw = '';
      try {
        raw = await run('npm', ['ls', '--all', '--json'], projectPath);
      } catch (err: unknown) {
        // npm ls exits non-zero on peer/extraneous warnings but still emits JSON.
        raw = (err as { stdout?: string }).stdout ?? '';
      }
      if (!raw.trim()) return null;
      const tree = JSON.parse(raw) as { dependencies?: Record<string, unknown> };
      return countNpmTree(tree.dependencies);
    }

    if (ecosystem === 'pip') {
      const raw = await run('pip', ['list', '--format=json'], projectPath);
      const parsed = JSON.parse(raw) as unknown[];
      return Array.isArray(parsed) ? parsed.length : null;
    }

    if (ecosystem === 'cargo') {
      // `cargo metadata` enumerates every package in the resolved graph.
      const raw = await run('cargo', ['metadata', '--format-version', '1'], projectPath);
      const parsed = JSON.parse(raw) as { packages?: unknown[] };
      return Array.isArray(parsed.packages)
        ? Math.max(parsed.packages.length - 1, 0) // exclude the root crate itself
        : null;
    }

    // go: `go list -m all` prints one module per line (first line is the main module).
    const raw = await run('go', ['list', '-m', 'all'], projectPath);
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    return Math.max(lines.length - 1, 0);
  } catch {
    return null;
  }
}

/** Recursively count unique nodes in an `npm ls --json` dependency tree. */
function countNpmTree(
  deps: Record<string, unknown> | undefined,
  seen = new Set<string>()
): number {
  if (!deps) return 0;
  let count = 0;
  for (const [name, node] of Object.entries(deps)) {
    const version =
      node && typeof node === 'object' && 'version' in node
        ? String((node as { version?: unknown }).version)
        : '';
    const key = `${name}@${version}`;
    if (!seen.has(key)) {
      seen.add(key);
      count++;
    }
    const child =
      node && typeof node === 'object' && 'dependencies' in node
        ? (node as { dependencies?: Record<string, unknown> }).dependencies
        : undefined;
    count += countNpmTree(child, seen);
  }
  return count;
}

async function analyzeDependencies(
  projectPath: string,
  ecosystem: 'npm' | 'pip' | 'cargo' | 'go'
): Promise<AnalyzeDependenciesResult> {
  const outdated: OutdatedPackage[] = [];

  if (ecosystem === 'npm') {
    let raw = '';
    try {
      raw = await run('npm', ['outdated', '--json'], projectPath);
    } catch (err: unknown) {
      // npm outdated exits with code 1 when there are outdated packages; stdout still has JSON.
      const nodeErr = err as { stdout?: string };
      raw = nodeErr.stdout ?? '';
    }
    if (!raw.trim()) {
      const totalOnly = await countTotalDependencies(projectPath, ecosystem);
      const resolvedTotal = totalOnly ?? 0;
      return { outdated: [], total: resolvedTotal, upToDate: resolvedTotal };
    }
    const parsed = JSON.parse(raw) as Record<string, { current: string; latest: string }>;
    for (const [name, info] of Object.entries(parsed)) {
      if (info.current && info.latest && info.current !== info.latest) {
        outdated.push({
          name,
          current: info.current,
          latest: info.latest,
          severity: semverBump(info.current, info.latest),
        });
      }
    }
  } else if (ecosystem === 'pip') {
    const raw = await run('pip', ['list', '--outdated', '--format=json'], projectPath);
    const parsed = JSON.parse(raw) as Array<{ name: string; version: string; latest_version: string }>;
    for (const pkg of parsed) {
      outdated.push({
        name: pkg.name,
        current: pkg.version,
        latest: pkg.latest_version,
        severity: semverBump(pkg.version, pkg.latest_version),
      });
    }
  } else if (ecosystem === 'cargo') {
    // cargo-outdated must be installed: `cargo install cargo-outdated`
    const raw = await run('cargo', ['outdated', '--format', 'json'], projectPath);
    const parsed = JSON.parse(raw) as { dependencies: Array<{ name: string; project: string; latest: string }> };
    for (const dep of parsed.dependencies ?? []) {
      if (dep.latest && dep.latest !== dep.project) {
        outdated.push({
          name: dep.name,
          current: dep.project,
          latest: dep.latest,
          severity: semverBump(dep.project, dep.latest),
        });
      }
    }
  } else if (ecosystem === 'go') {
    // `go list -u -m -json all` prints JSON per module (one per line)
    const raw = await run('go', ['list', '-u', '-m', '-json', 'all'], projectPath);
    const lines = raw.split('\n').filter(Boolean);
    // Each module is a separate JSON object; concatenate into an array
    const jsonText = `[${lines.join(',')}]`.replace(/}\s*{/g, '},{');
    let mods: Array<{ Path: string; Version?: string; Update?: { Version?: string } }> = [];
    try {
      mods = JSON.parse(jsonText);
    } catch {
      // Fallback: parse line by line
      for (const line of lines) {
        try { mods.push(JSON.parse(line)); } catch { /* skip */ }
      }
    }
    for (const mod of mods) {
      if (mod.Update?.Version && mod.Version && mod.Update.Version !== mod.Version) {
        outdated.push({
          name: mod.Path,
          current: mod.Version,
          latest: mod.Update.Version,
          severity: semverBump(mod.Version, mod.Update.Version),
        });
      }
    }
  }

  // Derive the full dependency count so `total` reflects ALL deps (not just the
  // outdated ones) and `upToDate` is meaningful. If the count cannot be
  // determined (CLI missing), fall back to the outdated count as a lower bound.
  const totalInstalled = await countTotalDependencies(projectPath, ecosystem);
  const total = totalInstalled !== null
    ? Math.max(totalInstalled, outdated.length)
    : outdated.length;
  const upToDate = Math.max(total - outdated.length, 0);

  return {
    outdated,
    total,
    upToDate,
  };
}

// ---------------------------------------------------------------------------
// 2. check_security_vulnerabilities
// ---------------------------------------------------------------------------

interface Vulnerability {
  pkg: string;
  severity: Severity;
  cve: string;
  description: string;
  fixVersion: string;
}

interface SecurityScanResult {
  vulnerabilities: Vulnerability[];
}

async function checkSecurityVulnerabilities(projectPath: string): Promise<SecurityScanResult> {
  const vulnerabilities: Vulnerability[] = [];

  // Try npm audit first (works if package.json exists)
  let usedNpm = false;
  try {
    let raw = '';
    try {
      raw = await run('npm', ['audit', '--json'], projectPath);
    } catch (err: unknown) {
      const nodeErr = err as { stdout?: string };
      raw = nodeErr.stdout ?? '';
    }
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as {
        vulnerabilities?: Record<string, {
          severity?: string;
          via?: Array<string | { title?: string; cwe?: string[]; url?: string; fixAvailable?: boolean | { version?: string } }>;
          fixAvailable?: boolean | { version?: string };
        }>;
      };
      for (const [name, info] of Object.entries(parsed.vulnerabilities ?? {})) {
        const vias = (info.via ?? []).filter((v): v is Exclude<typeof v, string> => typeof v === 'object');
        const first = vias[0];
        const cve = first?.cwe?.[0] ?? '';
        const description = first?.title ?? `Vulnerability in ${name}`;
        const fix = info.fixAvailable;
        const fixVersion =
          typeof fix === 'object' && fix.version
            ? fix.version
            : fix === true
              ? 'available'
              : 'no fix';
        vulnerabilities.push({
          pkg: name,
          severity: normalizeNpmSeverity(info.severity ?? 'info'),
          cve,
          description,
          fixVersion,
        });
      }
      usedNpm = true;
    }
  } catch {
    // not an npm project or npm not available
  }

  if (!usedNpm) {
    // Try pip safety check (pip install safety required)
    try {
      let raw = '';
      try {
        raw = await run('safety', ['check', '--json'], projectPath);
      } catch (err: unknown) {
        const nodeErr = err as { stdout?: string };
        raw = nodeErr.stdout ?? '';
      }
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as Array<[string, string, string, string, string]>;
        for (const entry of parsed) {
          vulnerabilities.push({
            pkg: entry[0] ?? '',
            severity: 'high',
            cve: entry[4] ?? '',
            description: entry[3] ?? '',
            fixVersion: entry[2] ?? '',
          });
        }
      }
    } catch {
      // safety not installed or not a pip project
    }
  }

  return { vulnerabilities };
}

// ---------------------------------------------------------------------------
// 3. measure_code_complexity
// ---------------------------------------------------------------------------

interface FunctionComplexity {
  name: string;
  complexity: number;
  location: string;
}

interface ComplexityResult {
  functions: FunctionComplexity[];
  maxComplexity: number;
  avgComplexity: number;
}

// Minimal structural typings for the @babel/parser AST nodes we traverse.
// We avoid a hard dependency on @babel/types to keep the import surface small.
interface BabelNode {
  type: string;
  start?: number;
  loc?: { start?: { line?: number } };
  id?: { name?: string } | null;
  key?: { name?: string; value?: string | number } | null;
  // The parser attaches arbitrary child nodes/arrays; index for traversal.
  [key: string]: unknown;
}

const FUNCTION_NODE_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
  'ClassPrivateMethod',
]);

// AST node types that introduce a cyclomatic branch (each adds +1).
const BRANCH_NODE_TYPES = new Set([
  'IfStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchCase', // each non-default case adds a branch
  'ConditionalExpression', // genuine ternary `a ? b : c`
  'CatchClause',
]);

/** True for logical operators that short-circuit and thus add a branch. */
function isLogicalBranch(node: BabelNode): boolean {
  if (node.type !== 'LogicalExpression') return false;
  const op = (node as { operator?: string }).operator;
  return op === '&&' || op === '||' || op === '??';
}

/** Derive a human-readable name for a function-like AST node. */
function functionName(node: BabelNode, parent: BabelNode | null): string {
  if (node.id?.name) return node.id.name;
  if (node.type === 'ObjectMethod' || node.type === 'ClassMethod' || node.type === 'ClassPrivateMethod') {
    const key = node.key;
    if (key?.name) return key.name;
    if (key && typeof key.value !== 'undefined') return String(key.value);
  }
  // Named via assignment: `const foo = () => {}` / `foo = function () {}`.
  if (parent) {
    if (parent.type === 'VariableDeclarator') {
      const pid = (parent as { id?: { name?: string } }).id;
      if (pid?.name) return pid.name;
    }
    if (parent.type === 'AssignmentExpression') {
      const left = (parent as { left?: { name?: string; property?: { name?: string } } }).left;
      if (left?.name) return left.name;
      if (left?.property?.name) return left.property.name;
    }
    if (parent.type === 'Property' || parent.type === 'ObjectProperty') {
      const key = (parent as { key?: { name?: string; value?: string | number } }).key;
      if (key?.name) return key.name;
      if (key && typeof key.value !== 'undefined') return String(key.value);
    }
  }
  return '<anonymous>';
}

/** Iterate the direct child AST nodes of a node. */
function* childNodes(node: BabelNode): Generator<BabelNode> {
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments') {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && typeof (item as BabelNode).type === 'string') {
          yield item as BabelNode;
        }
      }
    } else if (value && typeof value === 'object' && typeof (value as BabelNode).type === 'string') {
      yield value as BabelNode;
    }
  }
}

/**
 * Count the cyclomatic complexity contributed by a function body, WITHOUT
 * descending into nested function scopes (those are measured separately).
 * Cyclomatic complexity = 1 + number of decision points.
 */
function complexityOfFunctionBody(fnNode: BabelNode): number {
  let decisions = 0;

  const visit = (node: BabelNode): void => {
    for (const child of childNodes(node)) {
      // Do not cross into nested functions — they get their own measurement.
      if (FUNCTION_NODE_TYPES.has(child.type)) continue;

      if (child.type === 'SwitchCase') {
        // `default:` (no test) does not add a branch; real cases do.
        if ((child as { test?: unknown }).test) decisions++;
      } else if (BRANCH_NODE_TYPES.has(child.type)) {
        decisions++;
      } else if (isLogicalBranch(child)) {
        decisions++;
      }

      visit(child);
    }
  };

  visit(fnNode);
  return 1 + decisions;
}

/**
 * Measure per-function cyclomatic complexity using a real Babel AST.
 *
 * Scoping each function via the AST avoids the pitfalls of regex heuristics:
 * nested/anonymous functions are attributed correctly, optional chaining (`?.`)
 * is never mistaken for a ternary, and named expressions resolve to their
 * binding name. Only functions at or above `threshold` are returned; if the
 * source contains no functions, a single `<module>` entry reports file-level
 * complexity.
 */
async function measureComplexity(source: string, filePath: string, threshold: number): Promise<ComplexityResult> {
  const { parse } = await import('@babel/parser');

  let ast: BabelNode;
  try {
    ast = parse(source, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'classPrivateMethods',
        'classPrivateProperties',
        'topLevelAwait',
        'importAssertions',
      ],
    }) as unknown as BabelNode;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${filePath}: ${msg}`);
  }

  const functions: FunctionComplexity[] = [];

  // Walk the whole tree; when we hit a function node, measure it (its body
  // walk stops at nested functions, which the outer walk will reach separately).
  const walk = (node: BabelNode, parent: BabelNode | null): void => {
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      const complexity = complexityOfFunctionBody(node);
      if (complexity >= threshold) {
        const line = node.loc?.start?.line ?? 1;
        functions.push({
          name: functionName(node, parent),
          complexity,
          location: `${filePath}:${line}`,
        });
      }
    }
    for (const child of childNodes(node)) {
      walk(child, node);
    }
  };

  walk(ast, null);

  if (functions.length === 0) {
    // No functions cleared the threshold — report file-level complexity so the
    // tool always returns something actionable.
    const moduleComplexity = complexityOfFunctionBody(ast);
    if (moduleComplexity >= threshold) {
      functions.push({ name: '<module>', complexity: moduleComplexity, location: `${filePath}:1` });
    }
  }

  const maxComplexity = functions.reduce((m, f) => Math.max(m, f.complexity), 0);
  const avgComplexity =
    functions.length > 0
      ? Math.round((functions.reduce((s, f) => s + f.complexity, 0) / functions.length) * 10) / 10
      : 0;

  return { functions, maxComplexity, avgComplexity };
}

// ---------------------------------------------------------------------------
// 4. find_dead_code
// ---------------------------------------------------------------------------

interface UnusedExport {
  file: string;
  exportName: string;
  line: number;
}

interface DeadCodeResult {
  unusedExports: UnusedExport[];
  count: number;
}

async function findDeadCode(
  projectPath: string,
  extensions: string[]
): Promise<DeadCodeResult> {
  const unusedExports: UnusedExport[] = [];

  // Try ts-prune first
  try {
    const raw = await run('npx', ['ts-prune', '--error'], projectPath);
    // ts-prune output format: "path/to/file.ts:LINE - exportName"
    const lineRe = /^(.+?):(\d+)\s+-\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(raw)) !== null) {
      unusedExports.push({
        file: m[1],
        line: parseInt(m[2], 10),
        exportName: m[3].trim(),
      });
    }
    return { unusedExports, count: unusedExports.length };
  } catch {
    // ts-prune not available — fall back to manual grep
  }

  // Manual heuristic: collect all exported symbols, then check if they are
  // imported anywhere else in the project.
  const exts = extensions.length > 0 ? extensions : ['.ts', '.tsx', '.js', '.jsx'];
  const files = await collectFiles(projectPath, exts);

  const exportRe = /^\s*export\s+(?:(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+)([\w$]+)/gm;
  const allExports: Array<{ file: string; name: string; line: number }> = [];

  for (const file of files) {
    const src = await readFile(file, 'utf8').catch(() => '');
    let m: RegExpExecArray | null;
    while ((m = exportRe.exec(src)) !== null) {
      const line = src.slice(0, m.index).split('\n').length;
      allExports.push({ file: relative(projectPath, file), name: m[1], line });
    }
  }

  // For each exported name, check if it is referenced in any other file
  for (const exp of allExports) {
    let found = false;
    for (const file of files) {
      const absFile = relative(projectPath, file);
      if (absFile === exp.file) continue;
      const src = await readFile(file, 'utf8').catch(() => '');
      if (src.includes(exp.name)) {
        found = true;
        break;
      }
    }
    if (!found) {
      unusedExports.push({ file: exp.file, exportName: exp.name, line: exp.line });
    }
  }

  return { unusedExports, count: unusedExports.length };
}

// ---------------------------------------------------------------------------
// 5. estimate_tech_debt
// ---------------------------------------------------------------------------

interface LargeFile {
  path: string;
  lines: number;
}

interface TechDebtResult {
  todos: number;
  fixmes: number;
  hacks: number;
  largeFiles: LargeFile[];
  debtScore: number;
}

async function estimateTechDebt(projectPath: string): Promise<TechDebtResult> {
  const files = await collectFiles(projectPath, []);

  let todos = 0;
  let fixmes = 0;
  let hacks = 0;
  const largeFiles: LargeFile[] = [];

  for (const file of files) {
    const src = await readFile(file, 'utf8').catch(() => '');
    todos += (src.match(/\bTODO\b/g) ?? []).length;
    fixmes += (src.match(/\bFIXME\b/g) ?? []).length;
    hacks += (src.match(/\bHACK\b/g) ?? []).length;

    const lineCount = src.split('\n').length;
    if (lineCount > 400) {
      largeFiles.push({ path: relative(projectPath, file), lines: lineCount });
    }
  }

  // Sort largest files first
  largeFiles.sort((a, b) => b.lines - a.lines);

  // Debt score: weighted sum (arbitrary but consistent)
  const debtScore =
    todos * 1 +
    fixmes * 2 +
    hacks * 3 +
    largeFiles.reduce((s, f) => s + Math.floor(f.lines / 100), 0);

  return { todos, fixmes, hacks, largeFiles, debtScore };
}

// ---------------------------------------------------------------------------
// Tool registrations
// ---------------------------------------------------------------------------

export const registerAnalysisTools = createToolRegistrar([
  // -------------------------------------------------------------------------
  // analyze_dependencies
  // -------------------------------------------------------------------------
  defineTool({
    name: 'analyze_dependencies',
    description:
      'Analyze project dependencies and find outdated packages. ' +
      'Supports npm, pip, cargo, and go ecosystems. ' +
      'Returns a list of outdated packages with current/latest versions and upgrade severity, ' +
      'plus "total" (count of all installed dependencies) and "upToDate" (total minus outdated). ' +
      'When the dependency count cannot be determined (e.g. the ecosystem CLI is missing), ' +
      '"total" falls back to the number of outdated packages.',
    schema: {
      projectPath: z.string().describe('Absolute path to the project root directory'),
      ecosystem: z
        .enum(['npm', 'pip', 'cargo', 'go'])
        .optional()
        .default('npm')
        .describe(
          'Package ecosystem to check. Defaults to npm. ' +
          'Requires the ecosystem\'s CLI to be installed (npm, pip, cargo, go).'
        ),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const result = await analyzeDependencies(
        args.projectPath,
        (args.ecosystem ?? 'npm') as 'npm' | 'pip' | 'cargo' | 'go'
      );
      return jsonResponse(result);
    },
  }),

  // -------------------------------------------------------------------------
  // check_security_vulnerabilities
  // -------------------------------------------------------------------------
  defineTool({
    name: 'check_security_vulnerabilities',
    description:
      'Scan project dependencies for known security vulnerabilities. ' +
      'Uses npm audit for Node.js projects and pip safety for Python projects. ' +
      'Returns CVE details, severity, affected package, and fix version when available.',
    schema: {
      projectPath: z.string().describe('Absolute path to the project root directory'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const result = await checkSecurityVulnerabilities(args.projectPath);
      return jsonResponse(result);
    },
  }),

  // -------------------------------------------------------------------------
  // measure_code_complexity
  // -------------------------------------------------------------------------
  defineTool({
    name: 'measure_code_complexity',
    description:
      'Measure cyclomatic complexity of TypeScript or JavaScript files using a real Babel AST. ' +
      'Scopes each function (including nested and anonymous ones) and counts decision points ' +
      '(if/for/while/do/switch case/ternary/&&/||/??/catch) without miscounting optional chaining. ' +
      'Returns per-function complexity, max, and average. ' +
      'Only functions at or above the threshold are included in the output.',
    schema: {
      filePath: z.string().describe('Absolute path to the TypeScript or JavaScript file to analyze'),
      threshold: z
        .number()
        .int()
        .min(1)
        .default(5)
        .optional()
        .describe(
          'Minimum complexity to include in results. ' +
          'Functions below this threshold are omitted. Default 5.'
        ),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const source = await readFile(args.filePath, 'utf8');
      const result = await measureComplexity(source, args.filePath, args.threshold ?? 5);
      return jsonResponse(result);
    },
  }),

  // -------------------------------------------------------------------------
  // find_dead_code
  // -------------------------------------------------------------------------
  defineTool({
    name: 'find_dead_code',
    description:
      'Find unused exports and dead code paths in a TypeScript or JavaScript project. ' +
      'Uses ts-prune when available; falls back to a grep-based heuristic. ' +
      'Returns a list of exported symbols that are not imported anywhere in the project.',
    schema: {
      projectPath: z.string().describe('Absolute path to the project root directory'),
      extensions: z
        .array(z.string())
        .optional()
        .default(['.ts', '.tsx', '.js', '.jsx'])
        .describe(
          'File extensions to include in the scan. ' +
          'Defaults to [".ts", ".tsx", ".js", ".jsx"].'
        ),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const result = await findDeadCode(
        args.projectPath,
        args.extensions ?? ['.ts', '.tsx', '.js', '.jsx']
      );
      return jsonResponse(result);
    },
  }),

  // -------------------------------------------------------------------------
  // estimate_tech_debt
  // -------------------------------------------------------------------------
  defineTool({
    name: 'estimate_tech_debt',
    description:
      'Estimate technical debt in the codebase by counting TODO/FIXME/HACK comments, ' +
      'identifying files over 400 lines, and computing an aggregate debt score. ' +
      'Scans all source files under projectPath, skipping node_modules, .git, dist, build, and coverage.',
    schema: {
      projectPath: z.string().describe('Absolute path to the project root directory'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const result = await estimateTechDebt(args.projectPath);
      return jsonResponse(result);
    },
  }),
]);

export default registerAnalysisTools;
