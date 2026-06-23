import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface GitState {
  isRepo: boolean;
  branch?: string;
  commit?: string;
  commitMessage?: string;
  uncommittedChanges: boolean;
  stagedChanges: boolean;
  untrackedFiles: number;
  stashCount: number;
  remotes: Array<{ name: string; url: string }>;
}

/**
 * Captures Git repository state
 */
export class GitCollector {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
  }

  /**
   * Check if project is a git repo
   */
  isGitRepo(): boolean {
    return fs.existsSync(path.join(this.projectPath, '.git'));
  }

  /**
   * Capture current git state
   */
  capture(): GitState {
    if (!this.isGitRepo()) {
      return { isRepo: false, uncommittedChanges: false, stagedChanges: false, untrackedFiles: 0, stashCount: 0, remotes: [] };
    }

    const run = (cmd: string): string => {
      try {
        return execSync(cmd, { cwd: this.projectPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch {
        return '';
      }
    };

    // Current branch
    const branch = run('git rev-parse --abbrev-ref HEAD');

    // Current commit
    const commit = run('git rev-parse HEAD');
    const commitMessage = run('git log -1 --pretty=%s');

    // Check for uncommitted changes
    const status = run('git status --porcelain');
    const lines = status.split('\n').filter(l => l.trim());
    const uncommittedChanges = lines.some(l => l[1] !== ' ' && l[1] !== '?');
    const stagedChanges = lines.some(l => l[0] !== ' ' && l[0] !== '?');
    const untrackedFiles = lines.filter(l => l.startsWith('??')).length;

    // Stash count
    const stashList = run('git stash list');
    const stashCount = stashList ? stashList.split('\n').length : 0;

    // Remotes
    const remotesRaw = run('git remote -v');
    const remotes: Array<{ name: string; url: string }> = [];
    const seen = new Set<string>();
    for (const line of remotesRaw.split('\n')) {
      const match = line.match(/^(\S+)\s+(\S+)/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        remotes.push({ name: match[1], url: match[2] });
      }
    }

    return {
      isRepo: true,
      branch,
      commit,
      commitMessage,
      uncommittedChanges,
      stagedChanges,
      untrackedFiles,
      stashCount,
      remotes,
    };
  }

  /**
   * Get uncommitted diff
   */
  getUncommittedDiff(): string {
    if (!this.isGitRepo()) return '';
    try {
      return execSync('git diff', { cwd: this.projectPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    } catch {
      return '';
    }
  }

  /**
   * Get staged diff
   */
  getStagedDiff(): string {
    if (!this.isGitRepo()) return '';
    try {
      return execSync('git diff --cached', { cwd: this.projectPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    } catch {
      return '';
    }
  }
}
