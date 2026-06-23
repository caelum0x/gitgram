import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Metadata for an AITM-managed git worktree.
 */
export interface WorktreeInfo {
  readonly path: string;
  readonly branch: string;
  readonly checkpointId: string;
  readonly createdAt: string;
}

/**
 * Result from a worktree restore operation.
 */
export interface WorktreeRestoreResult {
  readonly worktree: WorktreeInfo;
  readonly filesWritten: number;
  readonly filesSkipped: number;
}

/**
 * WorktreeManager creates isolated git worktrees for safe AITM restore previews.
 *
 * Instead of mutating the working directory, a restore can be materialized
 * into a detached worktree under the system temp directory, allowing the
 * user to inspect or diff the restored state without risk.
 */
export class WorktreeManager {
  private readonly projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  // ─── Precondition checks ────────────────────────────────────────────

  /**
   * Verify that `git` is available on PATH.
   */
  private assertGitAvailable(): void {
    try {
      execSync('git --version', { stdio: 'pipe' });
    } catch {
      throw new Error(
        'git is not available. Install git to use worktree operations.'
      );
    }
  }

  /**
   * Verify that the project path is inside a git repository.
   */
  private assertIsGitRepo(): void {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: this.projectPath,
        stdio: 'pipe',
      });
    } catch {
      throw new Error(
        `${this.projectPath} is not inside a git repository. ` +
          'Initialize one with "git init" first.'
      );
    }
  }

  /**
   * Run both precondition checks.
   */
  private assertPreconditions(): void {
    this.assertGitAvailable();
    this.assertIsGitRepo();
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /**
   * Create an isolated worktree for a restore preview.
   *
   * The worktree is created in a detached HEAD state under the system
   * temp directory so it never interferes with the main working tree.
   */
  createRestoreWorktree(checkpointId: string): WorktreeInfo {
    this.assertPreconditions();

    const shortId = checkpointId.slice(0, 12);
    const branchName = `aitm-restore-${checkpointId.slice(0, 8)}`;
    const worktreePath = path.join(
      os.tmpdir(),
      `aitm-worktree-${shortId}`
    );

    // Guard: worktree already exists at this path
    if (fs.existsSync(worktreePath)) {
      throw new Error(
        `Worktree already exists at ${worktreePath}. ` +
          'Remove it first with "aitm worktree cleanup" or provide a different checkpoint.'
      );
    }

    try {
      execSync(`git worktree add --detach "${worktreePath}"`, {
        cwd: this.projectPath,
        stdio: 'pipe',
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to create worktree: ${msg}`);
    }

    return {
      path: worktreePath,
      branch: branchName,
      checkpointId,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * List all AITM-managed worktrees for the current project.
   *
   * AITM worktrees are identified by paths containing `aitm-worktree-`
   * inside the system temp directory.
   */
  listWorktrees(): readonly WorktreeInfo[] {
    this.assertPreconditions();

    const raw = execSync('git worktree list --porcelain', {
      cwd: this.projectPath,
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    const worktrees: WorktreeInfo[] = [];
    const blocks = raw.split('\n\n').filter(Boolean);

    for (const block of blocks) {
      const lines = block.split('\n');
      const worktreeLine = lines.find((l) => l.startsWith('worktree '));
      if (!worktreeLine) continue;

      const wtPath = worktreeLine.replace('worktree ', '');

      // Only include AITM-managed worktrees
      if (!path.basename(wtPath).startsWith('aitm-worktree-')) continue;

      // Extract checkpoint ID from folder name: aitm-worktree-<shortId>
      const match = path.basename(wtPath).match(/^aitm-worktree-(.+)$/);
      const shortCheckpointId = match ? match[1] : 'unknown';

      // Read creation time from the filesystem
      let createdAt = new Date().toISOString();
      try {
        const stat = fs.statSync(wtPath);
        createdAt = stat.birthtime.toISOString();
      } catch {
        // best-effort
      }

      worktrees.push({
        path: wtPath,
        branch: `aitm-restore-${shortCheckpointId.slice(0, 8)}`,
        checkpointId: shortCheckpointId,
        createdAt,
      });
    }

    return worktrees;
  }

  /**
   * Remove a single AITM worktree by path.
   */
  removeWorktree(worktreePath: string): void {
    this.assertPreconditions();

    if (!fs.existsSync(worktreePath)) {
      throw new Error(`Worktree path does not exist: ${worktreePath}`);
    }

    try {
      execSync(`git worktree remove --force "${worktreePath}"`, {
        cwd: this.projectPath,
        stdio: 'pipe',
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to remove worktree at ${worktreePath}: ${msg}`);
    }
  }

  /**
   * Clean up all AITM-managed worktrees for the current project.
   *
   * Returns the number of worktrees removed.
   */
  cleanupAll(): number {
    this.assertPreconditions();

    const worktrees = this.listWorktrees();
    let removed = 0;

    for (const wt of worktrees) {
      try {
        this.removeWorktree(wt.path);
        removed++;
      } catch {
        // best-effort: log but continue
      }
    }

    // Prune stale worktree references
    try {
      execSync('git worktree prune', {
        cwd: this.projectPath,
        stdio: 'pipe',
      });
    } catch {
      // non-critical
    }

    return removed;
  }
}
