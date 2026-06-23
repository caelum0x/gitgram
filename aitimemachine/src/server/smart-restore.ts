import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { SessionServer, Session } from './session-server.js';

/**
 * Smart Restore - Find when things broke, restore by search, partial restore
 */
export class SmartRestore {
  private server: SessionServer;

  constructor() {
    this.server = new SessionServer();
  }

  /**
   * Bisect - Binary search to find when a test started failing
   */
  async bisect(
    projectPath: string,
    testCommand: string,
    options: { goodSession?: string; verbose?: boolean } = {}
  ): Promise<BisectResult> {
    const sessions = this.server.listSessions(projectPath)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (sessions.length < 2) {
      return { success: false, error: 'Need at least 2 sessions to bisect' };
    }

    // Test current state first
    const currentFails = !this.runTest(projectPath, testCommand);
    if (!currentFails) {
      return { success: false, error: 'Test passes on current state - nothing to bisect' };
    }

    // Find starting good session
    let goodIdx = 0;
    if (options.goodSession) {
      goodIdx = sessions.findIndex(s => s.id.startsWith(options.goodSession!));
      if (goodIdx === -1) {
        return { success: false, error: `Session ${options.goodSession} not found` };
      }
    }

    let badIdx = sessions.length - 1;
    const tested: Map<number, boolean> = new Map();

    // Verify good session is actually good
    if (options.verbose) console.log(`Testing oldest session...`);
    const oldestPasses = await this.testSession(sessions[goodIdx], projectPath, testCommand);
    if (!oldestPasses) {
      return { success: false, error: 'Oldest session also fails - cannot find good starting point' };
    }
    tested.set(goodIdx, true);
    tested.set(badIdx, false);

    // Binary search
    while (badIdx - goodIdx > 1) {
      const midIdx = Math.floor((goodIdx + badIdx) / 2);
      if (options.verbose) {
        console.log(`Testing session ${midIdx + 1}/${sessions.length}...`);
      }

      const passes = await this.testSession(sessions[midIdx], projectPath, testCommand);
      tested.set(midIdx, passes);

      if (passes) {
        goodIdx = midIdx;
      } else {
        badIdx = midIdx;
      }
    }

    const lastGood = this.server.loadSession(sessions[goodIdx].id);
    const firstBad = this.server.loadSession(sessions[badIdx].id);

    return {
      success: true,
      lastGood: lastGood!,
      firstBad: firstBad!,
      testedCount: tested.size,
    };
  }

  /**
   * Test a session by restoring to temp dir and running command
   */
  private async testSession(sessionMeta: any, projectPath: string, testCommand: string): Promise<boolean> {
    const session = this.server.loadSession(sessionMeta.id);
    if (!session) return false;

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-bisect-'));

    try {
      // Copy files from session to temp dir
      for (const file of session.files) {
        const blob = this.server.getBlob(file.hash);
        if (!blob) continue;

        const targetPath = path.join(tempDir, file.path);
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, blob);
      }

      // Copy node_modules/deps from original if they exist (for speed)
      const depsDir = path.join(projectPath, 'node_modules');
      if (fs.existsSync(depsDir)) {
        const tempDeps = path.join(tempDir, 'node_modules');
        fs.symlinkSync(depsDir, tempDeps);
      }

      return this.runTest(tempDir, testCommand);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private runTest(dir: string, command: string): boolean {
    try {
      execSync(command, { cwd: dir, stdio: 'pipe', timeout: 60000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Search conversations and return sessions for restore
   */
  searchForRestore(query: string, projectPath?: string): SearchResult[] {
    const sessions = this.server.listSessions(projectPath);
    const results: SearchResult[] = [];

    for (const meta of sessions) {
      const session = this.server.loadSession(meta.id);
      if (!session) continue;

      // Search in description
      if (session.trigger.description.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          session,
          matchType: 'description',
          matchText: session.trigger.description,
          context: '',
        });
        continue;
      }

      // Search in conversation
      for (const msg of session.conversation) {
        const content = typeof msg.content === 'string' ? msg.content : '';
        if (content.toLowerCase().includes(query.toLowerCase())) {
          const idx = content.toLowerCase().indexOf(query.toLowerCase());
          const start = Math.max(0, idx - 50);
          const end = Math.min(content.length, idx + query.length + 50);
          const context = (start > 0 ? '...' : '') + 
            content.slice(start, end) + 
            (end < content.length ? '...' : '');

          results.push({
            session,
            matchType: 'conversation',
            matchText: query,
            context,
          });
          break;
        }
      }
    }

    // Sort by date descending
    results.sort((a, b) => 
      new Date(b.session.createdAt).getTime() - new Date(a.session.createdAt).getTime()
    );

    return results.slice(0, 10);
  }

  /**
   * Partial restore - restore only specific files
   */
  partialRestore(
    sessionId: string,
    projectPath: string,
    patterns: string[],
    options: { exclude?: string[]; dryRun?: boolean } = {}
  ): PartialRestoreResult {
    const session = this.server.loadSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found', files: [] };
    }

    // Filter files by patterns
    const matchedFiles = session.files.filter(file => {
      // Check include patterns
      const included = patterns.some(p => this.matchGlob(file.path, p));
      if (!included) return false;

      // Check exclude patterns
      if (options.exclude) {
        const excluded = options.exclude.some(p => this.matchGlob(file.path, p));
        if (excluded) return false;
      }

      return true;
    });

    if (matchedFiles.length === 0) {
      return { success: false, error: 'No files match the patterns', files: [] };
    }

    if (options.dryRun) {
      return { success: true, files: matchedFiles.map(f => f.path), dryRun: true };
    }

    // Restore matched files
    const restored: string[] = [];
    const errors: string[] = [];

    for (const file of matchedFiles) {
      const blob = this.server.getBlob(file.hash);
      if (!blob) {
        errors.push(`${file.path}: content not found`);
        continue;
      }

      const targetPath = path.join(projectPath, file.path);
      const targetDir = path.dirname(targetPath);

      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, blob);
        restored.push(file.path);
      } catch (e) {
        errors.push(`${file.path}: ${(e as Error).message}`);
      }
    }

    return { success: errors.length === 0, files: restored, errors };
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    // Simple glob matching
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{DOUBLESTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{DOUBLESTAR}}/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regex}$`).test(filePath);
  }
}

export interface BisectResult {
  success: boolean;
  error?: string;
  lastGood?: Session;
  firstBad?: Session;
  testedCount?: number;
}

export interface SearchResult {
  session: Session;
  matchType: 'description' | 'conversation';
  matchText: string;
  context: string;
}

export interface PartialRestoreResult {
  success: boolean;
  error?: string;
  files: string[];
  errors?: string[];
  dryRun?: boolean;
}
