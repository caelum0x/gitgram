import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

/**
 * Claude Code conversation entry types
 */
export interface ClaudeUserMessage {
  type: 'user';
  uuid: string;
  parentUuid: string;
  timestamp: string;
  sessionId: string;
  cwd: string;
  message: {
    role: 'user';
    content: string;
  };
  todos?: Array<{
    content: string;
    status: string;
  }>;
}

export interface ClaudeAssistantMessage {
  type: 'assistant';
  uuid: string;
  parentUuid: string;
  timestamp: string;
  sessionId: string;
  message: {
    role: 'assistant';
    content: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: any;
    }>;
  };
}

export interface ClaudeFileSnapshot {
  type: 'file-history-snapshot';
  messageId: string;
  snapshot: {
    messageId: string;
    timestamp: string;
    trackedFileBackups: Record<string, {
      backupFileName: string | null;
      version: number;
      backupTime: string;
    }>;
  };
}

export interface ClaudeSummary {
  type: 'summary';
  summary: string;
  leafUuid: string;
}

export type ClaudeEntry = ClaudeUserMessage | ClaudeAssistantMessage | ClaudeFileSnapshot | ClaudeSummary | { type: string };

export interface ClaudeSession {
  sessionId: string;
  projectPath: string;
  summaries: string[];
  messages: Array<{
    uuid: string;
    timestamp: Date;
    role: 'user' | 'assistant';
    content: string;
    todos?: Array<{ content: string; status: string }>;
  }>;
  fileSnapshots: Array<{
    messageId: string;
    timestamp: Date;
    files: Record<string, { version: number; backupFileName: string | null }>;
  }>;
}

/**
 * Reads and parses Claude Code conversation history
 */
export class ClaudeCodeReader {
  private claudeDir: string;
  private projectsDir: string;
  private historyFile: string;
  private fileHistoryDir: string;

  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude');
    this.projectsDir = path.join(this.claudeDir, 'projects');
    this.historyFile = path.join(this.claudeDir, 'history.jsonl');
    this.fileHistoryDir = path.join(this.claudeDir, 'file-history');
  }

  /**
   * Check if Claude Code is installed
   */
  isInstalled(): boolean {
    return fs.existsSync(this.claudeDir);
  }

  /**
   * Get all projects with Claude Code history
   */
  getProjects(): Array<{ name: string; path: string; claudePath: string }> {
    if (!fs.existsSync(this.projectsDir)) return [];

    const projects: Array<{ name: string; path: string; claudePath: string }> = [];
    
    for (const dir of fs.readdirSync(this.projectsDir)) {
      // Claude encodes paths as -Users-username-project
      const projectPath = '/' + dir.replace(/-/g, '/').slice(1);
      projects.push({
        name: path.basename(projectPath),
        path: projectPath,
        claudePath: path.join(this.projectsDir, dir),
      });
    }

    return projects;
  }

  /**
   * Get project's Claude directory
   */
  getProjectClaudeDir(projectPath: string): string | null {
    // Claude encodes paths by replacing / and . with -
    // /Users/arhansubasi/project.xyz -> -Users-arhansubasi-project-xyz
    const normalized = path.resolve(projectPath);
    const encoded = normalized.replace(/[\/\.]/g, '-');
    const claudePath = path.join(this.projectsDir, encoded);
    
    if (fs.existsSync(claudePath)) {
      return claudePath;
    }
    
    return null;
  }

  /**
   * Get all sessions for a project
   */
  async getSessions(projectPath: string): Promise<ClaudeSession[]> {
    const claudeDir = this.getProjectClaudeDir(projectPath);
    if (!claudeDir) return [];

    const sessions: ClaudeSession[] = [];
    const files = fs.readdirSync(claudeDir)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
      .sort();

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const session = await this.parseSessionFile(path.join(claudeDir, file), sessionId, projectPath);
      if (session.messages.length > 0) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Parse a session JSONL file
   */
  private async parseSessionFile(filePath: string, sessionId: string, projectPath: string): Promise<ClaudeSession> {
    const session: ClaudeSession = {
      sessionId,
      projectPath,
      summaries: [],
      messages: [],
      fileSnapshots: [],
    };

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      
      try {
        const entry = JSON.parse(line) as ClaudeEntry;
        
        if (entry.type === 'summary') {
          session.summaries.push((entry as ClaudeSummary).summary);
        } else if (entry.type === 'user') {
          const msg = entry as ClaudeUserMessage;
          session.messages.push({
            uuid: msg.uuid,
            timestamp: new Date(msg.timestamp),
            role: 'user',
            content: msg.message.content,
            todos: msg.todos,
          });
        } else if (entry.type === 'assistant') {
          const msg = entry as ClaudeAssistantMessage;
          // Extract text content from assistant message
          const textContent = msg.message.content
            .filter(c => c.type === 'text' && c.text)
            .map(c => c.text)
            .join('\n');
          
          if (textContent) {
            session.messages.push({
              uuid: msg.uuid,
              timestamp: new Date(msg.timestamp),
              role: 'assistant',
              content: textContent,
            });
          }
        } else if (entry.type === 'file-history-snapshot') {
          const snap = entry as ClaudeFileSnapshot;
          session.fileSnapshots.push({
            messageId: snap.messageId,
            timestamp: new Date(snap.snapshot.timestamp),
            files: snap.snapshot.trackedFileBackups,
          });
        }
      } catch (e) {
        // Skip malformed lines
      }
    }

    return session;
  }

  /**
   * Get the latest session for a project
   */
  async getLatestSession(projectPath: string): Promise<ClaudeSession | null> {
    const sessions = await this.getSessions(projectPath);
    if (sessions.length === 0) return null;

    // Sort by latest message timestamp
    sessions.sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.timestamp.getTime() || 0;
      const bLast = b.messages[b.messages.length - 1]?.timestamp.getTime() || 0;
      return bLast - aLast;
    });

    return sessions[0];
  }

  /**
   * Get file backup content from Claude's file-history
   */
  getFileBackup(backupFileName: string): string | null {
    if (!backupFileName) return null;
    
    // Claude stores backups in file-history/{first-2-chars}/{filename}
    const prefix = backupFileName.slice(0, 2);
    const backupPath = path.join(this.fileHistoryDir, prefix, backupFileName);
    
    if (fs.existsSync(backupPath)) {
      return fs.readFileSync(backupPath, 'utf-8');
    }
    return null;
  }

  /**
   * Watch for new Claude Code activity
   */
  watchProject(projectPath: string, callback: (session: ClaudeSession) => void): () => void {
    const claudeDir = this.getProjectClaudeDir(projectPath);
    if (!claudeDir) {
      console.warn('No Claude Code history for this project');
      return () => {};
    }

    const watcher = fs.watch(claudeDir, async (eventType, filename) => {
      if (filename?.endsWith('.jsonl') && !filename.startsWith('agent-')) {
        const session = await this.parseSessionFile(
          path.join(claudeDir, filename),
          filename.replace('.jsonl', ''),
          projectPath
        );
        callback(session);
      }
    });

    return () => watcher.close();
  }

  /**
   * Get global history (all user prompts across projects)
   */
  async getGlobalHistory(): Promise<Array<{
    display: string;
    timestamp: Date;
    project: string;
  }>> {
    if (!fs.existsSync(this.historyFile)) return [];

    const history: Array<{ display: string; timestamp: Date; project: string }> = [];
    const fileStream = fs.createReadStream(this.historyFile);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.display && entry.timestamp) {
          history.push({
            display: entry.display,
            timestamp: new Date(entry.timestamp),
            project: entry.project || '',
          });
        }
      } catch {}
    }

    return history;
  }
}
