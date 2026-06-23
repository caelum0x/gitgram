/**
 * Workspace Commands
 *
 * Inspect the current working workspace.
 *
 *   aitm workspace files            – list files in workspace
 *   aitm workspace search <query>   – search file content
 *   aitm workspace status           – git status
 *   aitm workspace summary          – high-level workspace overview
 */

import { Command } from 'commander';
import { C, fail, formatSize } from './cli-helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkspaceFile {
  relativePath: string;
  size: number;
  modifiedAt: Date;
}

interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'lib', '.next', 'out',
  'coverage', '.cache', '.turbo', '.vite', '__pycache__',
]);

const IGNORE_EXTENSIONS = new Set([
  '.pyc', '.pyo', '.class', '.o', '.a', '.so', '.dll', '.exe',
  '.lock', '.map',
]);

function shouldIgnoreEntry(name: string): boolean {
  return name.startsWith('.') && name !== '.env' && name !== '.gitignore'
    ? true
    : IGNORE_DIRS.has(name);
}

function collectFiles(
  dir: string,
  base: string,
  results: WorkspaceFile[],
  maxFiles: number,
): void {
  if (results.length >= maxFiles) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxFiles) break;
    if (shouldIgnoreEntry(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(base, fullPath);

    if (entry.isDirectory()) {
      collectFiles(fullPath, base, results, maxFiles);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (IGNORE_EXTENSIONS.has(ext)) continue;

      try {
        const stat = fs.statSync(fullPath);
        results.push({ relativePath, size: stat.size, modifiedAt: stat.mtime });
      } catch {
        // skip unreadable files
      }
    }
  }
}

function searchInFile(filePath: string, query: string, maxMatches: number): SearchMatch[] {
  const matches: SearchMatch[] = [];
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return matches;
  }

  const lines = content.split('\n');
  const lowerQuery = query.toLowerCase();

  for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
    if (lines[i].toLowerCase().includes(lowerQuery)) {
      matches.push({
        file: filePath,
        line: i + 1,
        text: lines[i].trim().slice(0, 120),
      });
    }
  }
  return matches;
}

function searchWorkspace(
  dir: string,
  base: string,
  query: string,
  results: SearchMatch[],
  maxResults: number,
): void {
  if (results.length >= maxResults) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break;
    if (shouldIgnoreEntry(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      searchWorkspace(fullPath, base, query, results, maxResults);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (IGNORE_EXTENSIONS.has(ext)) continue;

      // Skip large binary-ish files
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 512 * 1024) continue; // skip files > 512 KB
      } catch {
        continue;
      }

      const matches = searchInFile(fullPath, query, maxResults - results.length);
      for (const m of matches) {
        results.push({ ...m, file: path.relative(base, m.file) });
      }
    }
  }
}

async function getGitStatus(cwd: string): Promise<{ lines: string[]; branch: string }> {
  let branch = 'unknown';
  let lines: string[] = [];

  try {
    const { stdout: branchOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
    branch = branchOut.trim();
  } catch {
    // not a git repo or git unavailable
  }

  try {
    const { stdout } = await execFileAsync('git', ['status', '--short'], { cwd });
    lines = stdout.split('\n').filter(l => l.trim().length > 0);
  } catch {
    // ignore
  }

  return { lines, branch };
}

function detectLanguages(files: WorkspaceFile[]): string[] {
  const extCount = new Map<string, number>();
  for (const f of files) {
    const ext = path.extname(f.relativePath);
    if (ext) extCount.set(ext, (extCount.get(ext) ?? 0) + 1);
  }

  const langMap: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript/React',
    '.js': 'JavaScript', '.jsx': 'JavaScript/React',
    '.py': 'Python', '.go': 'Go', '.rs': 'Rust',
    '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
    '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#',
    '.cpp': 'C++', '.c': 'C', '.h': 'C/C++ Header',
    '.sql': 'SQL', '.sh': 'Shell', '.md': 'Markdown',
    '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML',
    '.toml': 'TOML', '.html': 'HTML', '.css': 'CSS',
  };

  return [...extCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ext]) => langMap[ext] ?? ext)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerWorkspaceCommands(program: Command): void {

  const wsCmd = program
    .command('workspace')
    .description('Inspect the current working workspace');

  // ── files ─────────────────────────────────────────────────────────────────

  wsCmd
    .command('files')
    .description('List files in the workspace')
    .option('-n, --limit <n>', 'Max files to show', '100')
    .option('--sort <by>', 'Sort by: name|size|modified', 'name')
    .option('--json', 'Output raw JSON')
    .action((opts: { limit?: string; sort?: string; json?: boolean }) => {
      const cwd = process.cwd();
      const maxFiles = parseInt(opts.limit ?? '100', 10) || 100;
      const sortBy = opts.sort ?? 'name';

      const files: WorkspaceFile[] = [];
      collectFiles(cwd, cwd, files, maxFiles);

      switch (sortBy) {
        case 'size':
          files.sort((a, b) => b.size - a.size);
          break;
        case 'modified':
          files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
          break;
        default:
          files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            files.map(f => ({
              path: f.relativePath,
              size: f.size,
              modifiedAt: f.modifiedAt.toISOString(),
            })),
            null,
            2,
          ),
        );
        return;
      }

      const totalSize = files.reduce((s, f) => s + f.size, 0);
      console.log(
        `\n${C.bright}[+] Workspace Files${C.reset} ${C.dim}(${cwd})${C.reset}\n`,
      );
      console.log(
        `  ${C.bright}${('PATH').padEnd(55)}  SIZE${C.reset}`,
      );
      console.log(`  ${C.dim}${'─'.repeat(62)}${C.reset}`);

      for (const f of files) {
        const display =
          f.relativePath.length > 54
            ? '...' + f.relativePath.slice(-51)
            : f.relativePath;
        console.log(
          `  ${display.padEnd(55)}  ${C.dim}${formatSize(f.size)}${C.reset}`,
        );
      }

      console.log(`  ${C.dim}${'─'.repeat(62)}${C.reset}`);
      console.log(
        `  ${C.dim}${files.length} files — total ${formatSize(totalSize)}${C.reset}\n`,
      );
    });

  // ── search ────────────────────────────────────────────────────────────────

  wsCmd
    .command('search <query>')
    .description('Search file content in the workspace')
    .option('-n, --limit <n>', 'Max results', '50')
    .option('--json', 'Output raw JSON')
    .action((query: string, opts: { limit?: string; json?: boolean }) => {
      const cwd = process.cwd();
      const maxResults = parseInt(opts.limit ?? '50', 10) || 50;

      if (!query.trim()) {
        fail('query cannot be empty');
        return;
      }

      const matches: SearchMatch[] = [];
      searchWorkspace(cwd, cwd, query, matches, maxResults);

      if (opts.json) {
        console.log(JSON.stringify(matches, null, 2));
        return;
      }

      console.log(
        `\n${C.bright}[+] Search: "${query}"${C.reset} ${C.dim}(${cwd})${C.reset}\n`,
      );

      if (matches.length === 0) {
        console.log(`  ${C.dim}No matches found${C.reset}\n`);
        return;
      }

      let currentFile = '';
      for (const m of matches) {
        if (m.file !== currentFile) {
          currentFile = m.file;
          console.log(`  ${C.cyan}${m.file}${C.reset}`);
        }
        const highlighted = m.text.replace(
          new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
          match => `${C.yellow}${match}${C.reset}`,
        );
        console.log(`    ${C.dim}${String(m.line).padStart(4)}:${C.reset}  ${highlighted}`);
      }

      console.log(
        `\n  ${C.dim}${matches.length} match${matches.length !== 1 ? 'es' : ''}${matches.length >= maxResults ? ' (limit reached)' : ''}${C.reset}\n`,
      );
    });

  // ── status ────────────────────────────────────────────────────────────────

  wsCmd
    .command('status')
    .description('Show git status of the workspace')
    .option('--json', 'Output raw JSON')
    .action(async (opts: { json?: boolean }) => {
      const cwd = process.cwd();

      try {
        const { lines, branch } = await getGitStatus(cwd);

        if (opts.json) {
          const staged   = lines.filter(l => !'?! '.includes(l[0])).map(l => l.slice(3));
          const unstaged = lines.filter(l => !'?! '.includes(l[1])).map(l => l.slice(3));
          const untracked = lines.filter(l => l.startsWith('?')).map(l => l.slice(3));
          console.log(JSON.stringify({ branch, staged, unstaged, untracked, clean: lines.length === 0 }, null, 2));
          return;
        }

        console.log(`\n${C.bright}[+] Git Status${C.reset} ${C.dim}(${cwd})${C.reset}\n`);
        console.log(`  Branch: ${C.cyan}${branch}${C.reset}`);

        if (lines.length === 0) {
          console.log(`  ${C.green}Working tree clean${C.reset}\n`);
          return;
        }

        const staged    = lines.filter(l => l[0] !== ' ' && l[0] !== '?');
        const unstaged  = lines.filter(l => l[1] !== ' ' && l[0] !== '?');
        const untracked = lines.filter(l => l.startsWith('??'));

        if (staged.length > 0) {
          console.log(`\n  ${C.bright}Staged:${C.reset}`);
          for (const l of staged) {
            const icon = l[0] === 'A' ? C.green + '+' : l[0] === 'D' ? C.red + '-' : C.yellow + '~';
            console.log(`    ${icon}${C.reset} ${l.slice(3)}`);
          }
        }

        if (unstaged.length > 0) {
          console.log(`\n  ${C.bright}Modified (unstaged):${C.reset}`);
          for (const l of unstaged) {
            console.log(`    ${C.yellow}~${C.reset} ${l.slice(3)}`);
          }
        }

        if (untracked.length > 0) {
          console.log(`\n  ${C.bright}Untracked:${C.reset}`);
          for (const l of untracked.slice(0, 20)) {
            console.log(`    ${C.dim}?${C.reset} ${l.slice(3)}`);
          }
          if (untracked.length > 20) {
            console.log(`    ${C.dim}... and ${untracked.length - 20} more${C.reset}`);
          }
        }

        console.log();
      } catch (err: unknown) {
        fail(`git status failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

  // ── summary ───────────────────────────────────────────────────────────────

  wsCmd
    .command('summary')
    .description('High-level workspace overview')
    .option('--json', 'Output raw JSON')
    .action(async (opts: { json?: boolean }) => {
      const cwd = process.cwd();

      // Collect data in parallel
      const [gitInfo] = await Promise.all([getGitStatus(cwd)]);

      const files: WorkspaceFile[] = [];
      collectFiles(cwd, cwd, files, 2000);

      const totalSize = files.reduce((s, f) => s + f.size, 0);
      const languages = detectLanguages(files);

      // Detect package manager / project type
      const hasPkg = (name: string): boolean =>
        fs.existsSync(path.join(cwd, name));

      const projectTypes: string[] = [];
      if (hasPkg('package.json'))    projectTypes.push('Node.js');
      if (hasPkg('tsconfig.json'))   projectTypes.push('TypeScript');
      if (hasPkg('Cargo.toml'))      projectTypes.push('Rust');
      if (hasPkg('go.mod'))          projectTypes.push('Go');
      if (hasPkg('pyproject.toml') || hasPkg('requirements.txt')) projectTypes.push('Python');
      if (hasPkg('pom.xml'))         projectTypes.push('Java/Maven');
      if (hasPkg('build.gradle'))    projectTypes.push('Java/Gradle');

      const recentFiles = [...files]
        .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
        .slice(0, 5);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              cwd,
              git: { branch: gitInfo.branch, changes: gitInfo.lines.length },
              files: { count: files.length, totalSize },
              languages,
              projectTypes,
              recentFiles: recentFiles.map(f => ({
                path: f.relativePath,
                size: f.size,
                modifiedAt: f.modifiedAt.toISOString(),
              })),
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`\n${C.bright}[+] Workspace Summary${C.reset}\n`);
      console.log(`  ${C.cyan}Path:${C.reset}      ${cwd}`);
      console.log(`  ${C.cyan}Branch:${C.reset}    ${gitInfo.branch}`);

      const changeCount = gitInfo.lines.length;
      if (changeCount > 0) {
        console.log(`  ${C.cyan}Changes:${C.reset}   ${C.yellow}${changeCount} uncommitted${C.reset}`);
      } else {
        console.log(`  ${C.cyan}Changes:${C.reset}   ${C.green}clean${C.reset}`);
      }

      console.log(`  ${C.cyan}Files:${C.reset}     ${files.length} (${formatSize(totalSize)})`);

      if (projectTypes.length > 0) {
        console.log(`  ${C.cyan}Project:${C.reset}   ${projectTypes.join(', ')}`);
      }

      if (languages.length > 0) {
        console.log(`  ${C.cyan}Languages:${C.reset} ${languages.join(', ')}`);
      }

      if (recentFiles.length > 0) {
        console.log(`\n  ${C.bright}Recently Modified:${C.reset}`);
        for (const f of recentFiles) {
          const ago = Math.floor((Date.now() - f.modifiedAt.getTime()) / 1000);
          const agoStr =
            ago < 60
              ? `${ago}s ago`
              : ago < 3600
              ? `${Math.floor(ago / 60)}m ago`
              : ago < 86400
              ? `${Math.floor(ago / 3600)}h ago`
              : `${Math.floor(ago / 86400)}d ago`;
          console.log(
            `    ${C.dim}${agoStr.padEnd(8)}${C.reset}  ${f.relativePath}`,
          );
        }
      }

      console.log();
    });
}
