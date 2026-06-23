import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

export interface CursorMessage {
  text: string;
  timestamp?: Date;
  commandType: number;
}

export interface CursorSession {
  projectPath: string;
  projectName: string;
  prompts: CursorMessage[];
}

/**
 * Reads Cursor conversation history from SQLite databases
 */
export class CursorCollector {
  private cursorDir: string;
  private workspaceStorageDir: string;

  constructor() {
    this.cursorDir = path.join(os.homedir(), '.cursor');
    this.workspaceStorageDir = path.join(
      os.homedir(),
      'Library/Application Support/Cursor/User/workspaceStorage'
    );
  }

  /**
   * Check if Cursor is installed
   */
  isInstalled(): boolean {
    return fs.existsSync(this.cursorDir);
  }

  /**
   * Get all workspaces with Cursor history
   */
  getWorkspaces(): Array<{ id: string; projectPath: string; projectName: string }> {
    if (!fs.existsSync(this.workspaceStorageDir)) return [];

    const workspaces: Array<{ id: string; projectPath: string; projectName: string }> = [];

    try {
      const dirs = fs.readdirSync(this.workspaceStorageDir);
      
      for (const dir of dirs) {
        const workspaceJson = path.join(this.workspaceStorageDir, dir, 'workspace.json');
        if (fs.existsSync(workspaceJson)) {
          try {
            const data = JSON.parse(fs.readFileSync(workspaceJson, 'utf-8'));
            if (data.folder) {
              const projectPath = data.folder.replace('file://', '');
              workspaces.push({
                id: dir,
                projectPath,
                projectName: path.basename(projectPath),
              });
            }
          } catch {}
        }
      }
    } catch {}

    return workspaces;
  }

  /**
   * Get workspace ID for a project path
   */
  getWorkspaceId(projectPath: string): string | null {
    const resolved = path.resolve(projectPath);
    const workspaces = this.getWorkspaces();
    const match = workspaces.find(w => w.projectPath === resolved);
    return match?.id || null;
  }

  /**
   * Get prompts/messages from a workspace
   */
  getPrompts(workspaceId: string): CursorMessage[] {
    const dbPath = path.join(this.workspaceStorageDir, workspaceId, 'state.vscdb');
    if (!fs.existsSync(dbPath)) return [];

    try {
      // Query SQLite for aiService.prompts
      const result = execSync(
        `sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key='aiService.prompts'"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      if (!result) return [];

      const prompts = JSON.parse(result) as Array<{ text: string; commandType: number }>;
      return prompts.map(p => ({
        text: p.text,
        commandType: p.commandType,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get session for a project
   */
  getSession(projectPath: string): CursorSession | null {
    const workspaceId = this.getWorkspaceId(projectPath);
    if (!workspaceId) return null;

    const prompts = this.getPrompts(workspaceId);
    if (prompts.length === 0) return null;

    return {
      projectPath: path.resolve(projectPath),
      projectName: path.basename(projectPath),
      prompts,
    };
  }

  /**
   * Get all sessions across all workspaces
   */
  getAllSessions(): CursorSession[] {
    const sessions: CursorSession[] = [];
    const workspaces = this.getWorkspaces();

    for (const ws of workspaces) {
      const prompts = this.getPrompts(ws.id);
      if (prompts.length > 0) {
        sessions.push({
          projectPath: ws.projectPath,
          projectName: ws.projectName,
          prompts,
        });
      }
    }

    return sessions;
  }

  /**
   * Search prompts across all workspaces
   */
  searchPrompts(query: string): Array<{ workspace: string; prompt: CursorMessage; context: string }> {
    const results: Array<{ workspace: string; prompt: CursorMessage; context: string }> = [];
    const queryLower = query.toLowerCase();
    const sessions = this.getAllSessions();

    for (const session of sessions) {
      for (const prompt of session.prompts) {
        if (prompt.text.toLowerCase().includes(queryLower)) {
          results.push({
            workspace: session.projectName,
            prompt,
            context: prompt.text.slice(0, 200),
          });
        }
      }
    }

    return results;
  }
}
