import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { platform } from '../utils/platform.js';
import { FastSessionCapture } from './fast-session-capture.js';
import { SessionServer } from './session-server.js';
import { DaemonManager } from './daemon-manager.js';

/**
 * Global Daemon - Runs in background, handles:
 * 1. Auto-detect projects from ALL AI tools (Claude, Cursor, Aider, Windsurf, Copilot, etc)
 * 2. Watch active terminal sessions for project activity
 * 3. Periodic capture of all active projects (with incremental scanning)
 * 4. Cloud sync (if configured)
 */
export class GlobalDaemon {
  private dm: DaemonManager;
  private server: SessionServer;
  private running = false;
  private shuttingDown = false;
  private knownProjects = new Set<string>();
  private activeProjects = new Set<string>();
  private captureInterval = 5 * 60 * 1000; // 5 minutes
  private watchInterval = 30 * 1000; // 30 seconds
  private syncInterval = 15 * 60 * 1000; // 15 minutes
  private intervals: NodeJS.Timeout[] = [];

  constructor() {
    this.dm = new DaemonManager();
    this.server = new SessionServer();
  }

  async run(): Promise<void> {
    this.dm.writePid();
    this.dm.log('Global daemon started - watching all AI tools');
    this.running = true;

    // Initial scan
    await this.scanAllSources();
    await this.captureActiveProjects();

    // Watch for activity
    this.intervals.push(setInterval(() => this.scanAllSources(), this.watchInterval));

    // Periodic capture of active projects
    this.intervals.push(setInterval(() => this.captureActiveProjects(), this.captureInterval));

    // Cloud sync (if configured)
    this.intervals.push(setInterval(() => this.syncToCloud(), this.syncInterval));

    // Handle shutdown
    process.on('SIGTERM', () => { void this.shutdown(); });
    process.on('SIGINT', () => { void this.shutdown(); });

    // Keep alive
    await new Promise(() => {});
  }

  /**
   * Scan all sources for projects
   */
  private async scanAllSources(): Promise<void> {
    // 1. Claude Code projects
    this.scanClaudeProjects();
    
    // 2. Cursor projects
    this.scanCursorProjects();
    
    // 3. Aider projects
    this.scanAiderProjects();
    
    // 4. Windsurf projects
    this.scanWindsurfProjects();
    
    // 5. VS Code / Copilot recent projects
    this.scanVSCodeProjects();
    
    // 6. Zed projects
    this.scanZedProjects();
    
    // 7. Active terminal sessions (lsof)
    this.scanActiveTerminals();
    
    // 8. Git repos with recent activity
    this.scanRecentGitRepos();
  }

  /**
   * Scan Claude Code projects
   */
  private scanClaudeProjects(): void {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    if (!fs.existsSync(claudeDir)) return;

    for (const encoded of fs.readdirSync(claudeDir)) {
      const decoded = this.decodePath(encoded);
      if (decoded && fs.existsSync(decoded)) {
        this.addProject(decoded, 'claude');
      }
    }
  }

  /**
   * Scan Cursor projects from state
   */
  private scanCursorProjects(): void {
    const cursorPaths = [
      path.join(os.homedir(), '.cursor', 'state.vscdb'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    ];
    
    for (const dbPath of cursorPaths) {
      if (!fs.existsSync(dbPath)) continue;
      
      // Also check recent workspaces
      const workspacesPath = path.join(path.dirname(dbPath), '..', 'workspaceStorage');
      if (fs.existsSync(workspacesPath)) {
        for (const ws of fs.readdirSync(workspacesPath).slice(0, 20)) {
          const wsJson = path.join(workspacesPath, ws, 'workspace.json');
          if (fs.existsSync(wsJson)) {
            try {
              const data = JSON.parse(fs.readFileSync(wsJson, 'utf-8'));
              if (data.folder) {
                const folder = data.folder.replace('file://', '');
                if (fs.existsSync(folder)) this.addProject(folder, 'cursor');
              }
            } catch {}
          }
        }
      }
    }
  }

  /**
   * Scan Aider chat history
   */
  private scanAiderProjects(): void {
    const aiderDir = path.join(os.homedir(), '.aider');
    if (!fs.existsSync(aiderDir)) return;

    // Aider stores chat history per project
    for (const file of fs.readdirSync(aiderDir)) {
      if (file.endsWith('.md') || file.endsWith('.txt')) {
        // Extract project path from filename or content
        const content = fs.readFileSync(path.join(aiderDir, file), 'utf-8').slice(0, 500);
        const match = content.match(/(?:^|\n)# (.+?)(?:\n|$)/);
        if (match) {
          const projPath = match[1];
          if (fs.existsSync(projPath)) this.addProject(projPath, 'aider');
        }
      }
    }
    
    // Also check for .aider.chat.history.md in common locations
    const homeProjects = fs.readdirSync(os.homedir()).filter(d => {
      const full = path.join(os.homedir(), d);
      return fs.statSync(full).isDirectory() && 
             fs.existsSync(path.join(full, '.aider.chat.history.md'));
    });
    homeProjects.forEach(p => this.addProject(path.join(os.homedir(), p), 'aider'));
  }

  /**
   * Scan Windsurf (Codeium) projects
   */
  private scanWindsurfProjects(): void {
    const windsurfPaths = [
      path.join(os.homedir(), '.windsurf'),
      path.join(os.homedir(), '.codeium'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Windsurf'),
    ];
    
    for (const wsPath of windsurfPaths) {
      if (!fs.existsSync(wsPath)) continue;
      
      // Check for workspace storage similar to VS Code
      const storage = path.join(wsPath, 'workspaceStorage');
      if (fs.existsSync(storage)) {
        for (const ws of fs.readdirSync(storage).slice(0, 20)) {
          const wsJson = path.join(storage, ws, 'workspace.json');
          if (fs.existsSync(wsJson)) {
            try {
              const data = JSON.parse(fs.readFileSync(wsJson, 'utf-8'));
              if (data.folder) {
                const folder = data.folder.replace('file://', '');
                if (fs.existsSync(folder)) this.addProject(folder, 'windsurf');
              }
            } catch {}
          }
        }
      }
    }
  }

  /**
   * Scan VS Code / Copilot projects
   */
  private scanVSCodeProjects(): void {
    const vscodePaths = [
      path.join(os.homedir(), '.vscode'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage'),
    ];
    
    for (const vscPath of vscodePaths) {
      if (!fs.existsSync(vscPath)) continue;
      
      if (vscPath.includes('workspaceStorage')) {
        for (const ws of fs.readdirSync(vscPath).slice(0, 30)) {
          const wsJson = path.join(vscPath, ws, 'workspace.json');
          if (fs.existsSync(wsJson)) {
            try {
              const data = JSON.parse(fs.readFileSync(wsJson, 'utf-8'));
              if (data.folder) {
                const folder = data.folder.replace('file://', '');
                if (fs.existsSync(folder)) this.addProject(folder, 'vscode');
              }
            } catch {}
          }
        }
      }
    }
  }

  /**
   * Scan Zed editor projects
   */
  private scanZedProjects(): void {
    const zedPaths = [
      path.join(os.homedir(), '.config', 'zed'),
      path.join(os.homedir(), 'Library', 'Application Support', 'Zed'),
    ];
    
    for (const zedPath of zedPaths) {
      const workspaces = path.join(zedPath, 'workspaces');
      if (!fs.existsSync(workspaces)) continue;
      
      for (const ws of fs.readdirSync(workspaces).slice(0, 20)) {
        const wsPath = path.join(workspaces, ws);
        if (fs.statSync(wsPath).isDirectory()) {
          // Zed stores workspace info in JSON
          try {
            const files = fs.readdirSync(wsPath);
            for (const f of files) {
              if (f.endsWith('.json')) {
                const data = JSON.parse(fs.readFileSync(path.join(wsPath, f), 'utf-8'));
                if (data.root_path && fs.existsSync(data.root_path)) {
                  this.addProject(data.root_path, 'zed');
                }
              }
            }
          } catch {}
        }
      }
    }
  }

  /**
   * Scan active terminal sessions using lsof
   */
  private scanActiveTerminals(): void {
    try {
      // Find processes with open files in common project locations
      const output = execSync(
        `lsof -c node -c python -c ruby -c cargo -c go 2>/dev/null | grep -E "cwd|txt" | awk '{print $9}' | sort -u | head -50`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      
      for (const line of output.split('\n')) {
        if (!line || line.startsWith('/usr') || line.startsWith('/opt')) continue;
        
        // Find project root (has package.json, Cargo.toml, etc)
        let dir = line;
        for (let i = 0; i < 5 && dir !== '/'; i++) {
          if (this.isProjectRoot(dir)) {
            this.addProject(dir, 'terminal');
            this.activeProjects.add(dir);
            break;
          }
          dir = path.dirname(dir);
        }
      }
    } catch {}
  }

  /**
   * Scan git repos with recent commits
   */
  private scanRecentGitRepos(): void {
    // Check common project directories
    const searchDirs = [
      os.homedir(),
      path.join(os.homedir(), 'Projects'),
      path.join(os.homedir(), 'Developer'),
      path.join(os.homedir(), 'dev'),
      path.join(os.homedir(), 'code'),
      path.join(os.homedir(), 'src'),
    ];
    
    for (const searchDir of searchDirs) {
      if (!fs.existsSync(searchDir)) continue;
      
      try {
        const entries = fs.readdirSync(searchDir);
        for (const entry of entries.slice(0, 50)) {
          const full = path.join(searchDir, entry);
          const gitDir = path.join(full, '.git');
          
          if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
            // Check if there's recent activity (last 24h)
            try {
              const headPath = path.join(gitDir, 'HEAD');
              const stats = fs.statSync(headPath);
              const hoursSinceModified = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
              
              if (hoursSinceModified < 24) {
                this.addProject(full, 'git');
                this.activeProjects.add(full);
              }
            } catch {}
          }
        }
      } catch {}
    }
  }

  private isProjectRoot(dir: string): boolean {
    const markers = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'Gemfile', '.git'];
    return markers.some(m => fs.existsSync(path.join(dir, m)));
  }

  private addProject(projectPath: string, source: string): void {
    if (this.knownProjects.has(projectPath)) return;
    
    this.knownProjects.add(projectPath);
    this.setupProject(projectPath);
    this.dm.log(`Discovered: ${path.basename(projectPath)} (${source})`);
  }

  private decodePath(encoded: string): string | null {
    const parts = encoded.slice(1).split('-');
    let reconstructed = '';

    for (const part of parts) {
      const withSlash = reconstructed + '/' + part;
      const withHyphen = reconstructed + '-' + part;

      if (fs.existsSync(withSlash)) {
        reconstructed = withSlash;
      } else if (reconstructed && fs.existsSync(withHyphen)) {
        reconstructed = withHyphen;
      } else if (!reconstructed) {
        reconstructed = '/' + part;
      } else {
        reconstructed = withSlash;
      }
    }

    return fs.existsSync(reconstructed) ? reconstructed : null;
  }

  private async setupProject(projectPath: string): Promise<void> {
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    const hasAitm = fs.existsSync(claudeMdPath) && 
      fs.readFileSync(claudeMdPath, 'utf-8').includes('AITimeMachine');

    if (!hasAitm) {
      const instructions = `# AITimeMachine Integration

## Before file changes
Call: \`before_action({ action: "description" })\`

## After changes  
Call: \`after_action({ action: "what was done", success: true })\`
`;
      if (fs.existsSync(claudeMdPath)) {
        fs.appendFileSync(claudeMdPath, '\n\n' + instructions);
      } else {
        fs.writeFileSync(claudeMdPath, instructions);
      }
      this.dm.log(`Auto-setup: ${path.basename(projectPath)}`);
    }
  }

  /**
   * Capture only active projects (recently used)
   */
  private async captureActiveProjects(): Promise<void> {
    // Capture active projects more frequently
    for (const projectPath of this.activeProjects) {
      await this.captureProject(projectPath);
    }
    this.activeProjects.clear();
    
    // Also capture all known projects periodically
    for (const projectPath of this.knownProjects) {
      await this.captureProject(projectPath);
    }
  }

  private async captureProject(projectPath: string): Promise<void> {
    if (!fs.existsSync(projectPath)) return;

    try {
      const capture = new FastSessionCapture(projectPath);
      
      // Quick check if anything changed
      if (!capture.hasChanges()) return;

      const result = capture.capture('Auto-capture', { type: 'auto', description: 'daemon' });
      if (result?.session) {
        // Add database state
        try {
          const { DatabaseCollector } = await import('../collectors/database-collector.js');
          const dbCollector = new DatabaseCollector(projectPath);
          const databases = dbCollector.capture();
          if (databases.length > 0) {
            (result.session as any).databases = databases;
          }
        } catch {}

        // Add container state
        try {
          const { ContainerCollector } = await import('../collectors/container-collector.js');
          const containerCollector = new ContainerCollector(projectPath);
          const containers = containerCollector.capture();
          if (containers.hasDocker && (containers.containers.length > 0 || containers.compose)) {
            (result.session as any).containers = containers;
          }
        } catch {}

        // Save blobs first
        for (const [hash, content] of result.blobs) {
          this.server.storeBlob(content);
        }
        // Save session
        this.server.saveSession(result.session);
        this.dm.log(`Captured: ${path.basename(projectPath)} (${result.session.files.length} files, ${result.stats.cached} cached, ${result.stats.hashed} hashed)`);
      }
    } catch (err) {
      // Silent fail for non-critical errors
    }
  }

  private async syncToCloud(): Promise<void> {
    const configPath = path.join(platform.dataDir(), 'cloud-config.json');
    if (!fs.existsSync(configPath)) return;

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!config.endpoint || !config.apiKey) return;

      const { CloudSync } = await import('../cloud-sync-v2.js');
      const sync = new CloudSync();
      const result = await sync.sync();
      this.dm.log(`Cloud sync: pushed ${result.pushed.sessions}, pulled ${result.pulled.sessions}`);
    } catch (err) {
      this.dm.log(`Sync error: ${(err as Error).message}`);
    }
  }

  private async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.running = false;
    this.dm.log(`Daemon shutting down (tracked ${this.knownProjects.size} projects)`);

    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];

    try {
      await this.captureActiveProjects();
    } catch {}

    this.dm.cleanup();
    process.exit(0);
  }
}
