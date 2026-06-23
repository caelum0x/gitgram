import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Cursor stores data in SQLite databases (state.vscdb)
 * This reader extracts conversation history from Cursor's storage
 */
export interface CursorWorkspace {
  id: string;
  folder: string;
  name: string;
}

export interface CursorMessage {
  timestamp: Date;
  role: 'user' | 'assistant';
  content: string;
}

export class CursorReader {
  private cursorDir: string;
  private userDataDir: string;
  private workspaceStorageDir: string;

  constructor() {
    this.cursorDir = path.join(os.homedir(), '.cursor');
    
    // Cursor stores data in Application Support on macOS
    if (process.platform === 'darwin') {
      this.userDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User');
    } else if (process.platform === 'win32') {
      this.userDataDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User');
    } else {
      this.userDataDir = path.join(os.homedir(), '.config', 'Cursor', 'User');
    }
    
    this.workspaceStorageDir = path.join(this.userDataDir, 'workspaceStorage');
  }

  /**
   * Check if Cursor is installed
   */
  isInstalled(): boolean {
    return fs.existsSync(this.cursorDir) || fs.existsSync(this.userDataDir);
  }

  /**
   * Get all workspaces
   */
  getWorkspaces(): CursorWorkspace[] {
    if (!fs.existsSync(this.workspaceStorageDir)) return [];

    const workspaces: CursorWorkspace[] = [];
    
    for (const dir of fs.readdirSync(this.workspaceStorageDir)) {
      const workspaceJson = path.join(this.workspaceStorageDir, dir, 'workspace.json');
      if (fs.existsSync(workspaceJson)) {
        try {
          const data = JSON.parse(fs.readFileSync(workspaceJson, 'utf-8'));
          if (data.folder) {
            const folderPath = data.folder.replace('file://', '');
            workspaces.push({
              id: dir,
              folder: folderPath,
              name: path.basename(folderPath),
            });
          }
        } catch {}
      }
    }

    return workspaces;
  }

  /**
   * Find workspace for a project path
   */
  findWorkspace(projectPath: string): CursorWorkspace | null {
    const workspaces = this.getWorkspaces();
    const normalized = path.resolve(projectPath);
    
    return workspaces.find(w => path.resolve(w.folder) === normalized) || null;
  }

  /**
   * Get MCP configuration
   */
  getMcpConfig(): Record<string, any> | null {
    const mcpPath = path.join(this.cursorDir, 'mcp.json');
    if (fs.existsSync(mcpPath)) {
      try {
        return JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      } catch {}
    }
    return null;
  }

  /**
   * Add AITimeMachine to Cursor's MCP config
   */
  addToMcpConfig(projectPath: string): boolean {
    const mcpPath = path.join(this.cursorDir, 'mcp.json');
    let config: any = { mcpServers: {} };
    
    if (fs.existsSync(mcpPath)) {
      try {
        config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
      } catch {}
    }

    config.mcpServers = config.mcpServers || {};
    config.mcpServers.aitimemachine = {
      command: 'aitm',
      args: ['mcp'],
      cwd: projectPath,
    };

    try {
      fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Note: Cursor stores conversations in SQLite (state.vscdb)
   * Full extraction requires sqlite3 module
   * For now, we provide workspace detection and MCP integration
   */
}
