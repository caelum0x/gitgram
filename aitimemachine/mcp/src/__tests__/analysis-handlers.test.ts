/**
 * analysis-handlers.test.ts
 *
 * Handler-level (run()-invoking) tests for the analysis + file tools. These
 * exercise real execution paths — AST parsing, fs walks, glob matching — using
 * temp directories, with no external services.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerAnalysisTools } from '../tools/register-analysis-tools.js';
import { registerFileTools } from '../tools/register-file-tools.js';
import { captureTools, stubRuntime, parseJsonResponse, responseText } from './helpers/capture-tools.js';

interface ComplexityResult {
  functions: Array<{ name: string; complexity: number; location: string }>;
  maxComplexity: number;
  avgComplexity: number;
}

describe('measure_code_complexity (AST-based)', () => {
  const { call } = captureTools(registerAnalysisTools, stubRuntime);
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aitm-complexity-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('attributes complexity to the correct (named) function and counts branches', async () => {
    const file = join(dir, 'sample.ts');
    writeFileSync(
      file,
      `
export function branchy(n: number): string {
  if (n > 0) {
    for (let i = 0; i < n; i++) {
      if (i % 2 === 0 && i > 2) {
        return 'even';
      }
    }
  } else if (n < 0) {
    return 'neg';
  }
  return n > 5 ? 'big' : 'small';
}

export const simple = (x: number) => x + 1;
`,
      'utf8'
    );

    const result = parseJsonResponse<ComplexityResult>(
      await call('measure_code_complexity', { filePath: file, threshold: 1 })
    );

    const branchy = result.functions.find((f) => f.name === 'branchy');
    expect(branchy).toBeDefined();
    // 1 base + if + for + if + && + else-if + ternary = 7
    expect(branchy!.complexity).toBe(7);

    const simple = result.functions.find((f) => f.name === 'simple');
    expect(simple).toBeDefined();
    expect(simple!.complexity).toBe(1);
  });

  it('does not miscount optional chaining (?.) as a ternary branch', async () => {
    const file = join(dir, 'optional.ts');
    writeFileSync(
      file,
      `export function uses(obj: { a?: { b?: number } }): number | undefined {
  return obj?.a?.b;
}`,
      'utf8'
    );

    const result = parseJsonResponse<ComplexityResult>(
      await call('measure_code_complexity', { filePath: file, threshold: 1 })
    );
    const uses = result.functions.find((f) => f.name === 'uses');
    expect(uses!.complexity).toBe(1); // no real branches
  });

  it('scopes nested functions separately (no cross-attribution)', async () => {
    const file = join(dir, 'nested.ts');
    writeFileSync(
      file,
      `export function outer(n: number): number {
  function inner(m: number): number {
    return m > 0 ? 1 : 2;
  }
  return n > 0 ? inner(n) : 0;
}`,
      'utf8'
    );

    const result = parseJsonResponse<ComplexityResult>(
      await call('measure_code_complexity', { filePath: file, threshold: 1 })
    );
    const outer = result.functions.find((f) => f.name === 'outer');
    const inner = result.functions.find((f) => f.name === 'inner');
    // Each owns exactly one ternary; the outer must NOT inherit inner's branch.
    expect(outer!.complexity).toBe(2);
    expect(inner!.complexity).toBe(2);
  });
});

describe('tm_repo_to_text fallback (glob include/exclude)', () => {
  const { call } = captureTools(registerFileTools, stubRuntime);
  let repo: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'aitm-repo-'));
    mkdirSync(join(repo, 'src'), { recursive: true });
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'src', 'index.ts'), 'export const a = 1;', 'utf8');
    writeFileSync(join(repo, 'src', 'util.ts'), 'export const b = 2;', 'utf8');
    writeFileSync(join(repo, 'src', 'data.json'), '{"x":1}', 'utf8');
    writeFileSync(join(repo, 'docs', 'readme.md'), '# docs', 'utf8');
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('honors includePatterns (only matching files appear)', async () => {
    const text = responseText(
      await call('tm_repo_to_text', {
        repoPath: repo,
        outputFormat: 'markdown',
        includePatterns: ['**/*.ts'],
      })
    );
    expect(text).toContain('src/index.ts');
    expect(text).toContain('src/util.ts');
    expect(text).not.toContain('data.json');
    expect(text).not.toContain('readme.md');
  });

  it('honors basename-style include globs at any depth', async () => {
    const text = responseText(
      await call('tm_repo_to_text', {
        repoPath: repo,
        outputFormat: 'markdown',
        includePatterns: ['*.json'],
      })
    );
    expect(text).toContain('src/data.json');
    expect(text).not.toContain('index.ts');
  });

  it('honors excludePatterns (matching files are dropped)', async () => {
    const text = responseText(
      await call('tm_repo_to_text', {
        repoPath: repo,
        outputFormat: 'markdown',
        excludePatterns: ['**/*.json', 'docs/**'],
      })
    );
    expect(text).toContain('index.ts');
    expect(text).not.toContain('data.json');
    expect(text).not.toContain('readme.md');
  });

  it('produces XML when outputFormat is xml', async () => {
    const text = responseText(
      await call('tm_repo_to_text', {
        repoPath: repo,
        outputFormat: 'xml',
        includePatterns: ['src/index.ts'],
      })
    );
    expect(text).toContain('<repository');
    expect(text).toContain('<file path="src/index.ts">');
  });
});

describe('estimate_tech_debt (real fs walk)', () => {
  const { call } = captureTools(registerAnalysisTools, stubRuntime);
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aitm-debt-'));
    writeFileSync(
      join(dir, 'a.ts'),
      '// TODO: x\n// FIXME: y\n// HACK: z\n// TODO: again\n',
      'utf8'
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('counts TODO/FIXME/HACK markers and computes a debt score', async () => {
    const result = parseJsonResponse<{ todos: number; fixmes: number; hacks: number; debtScore: number }>(
      await call('estimate_tech_debt', { projectPath: dir })
    );
    expect(result.todos).toBe(2);
    expect(result.fixmes).toBe(1);
    expect(result.hacks).toBe(1);
    // 2*1 + 1*2 + 1*3 = 7
    expect(result.debtScore).toBe(7);
  });
});
