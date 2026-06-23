import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeReader } from './claude-code.js';
import { SessionServer, Session, SessionMessage } from '../server/index.js';
import { SessionCapture } from '../server/session-capture.js';

/**
 * Global Sync - Imports ALL Claude Code conversations from ALL projects
 */
export class GlobalSync {
  private claudeReader: ClaudeCodeReader;
  private server: SessionServer;

  constructor() {
    this.claudeReader = new ClaudeCodeReader();
    this.server = new SessionServer();
  }

  /**
   * Get all Claude Code project directories
   */
  getAllClaudeProjects(): Array<{ encoded: string; decoded: string }> {
    const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
    if (!fs.existsSync(claudeProjectsDir)) return [];

    const projects: Array<{ encoded: string; decoded: string }> = [];
    
    for (const encoded of fs.readdirSync(claudeProjectsDir)) {
      // Claude encodes paths: /Users/arhansubasi/project.xyz -> -Users-arhansubasi-project-xyz
      // We need to check if the decoded path exists to handle dots correctly
      
      // First try: simple decode (replace - with /)
      let decoded = '/' + encoded.slice(1).replace(/-/g, '/');
      
      // If path doesn't exist, try to find the real path by checking parent dirs
      if (!fs.existsSync(decoded)) {
        // Try reconstructing with dots for common patterns
        const parts = encoded.slice(1).split('-');
        let reconstructed = '';
        
        for (let i = 0; i < parts.length; i++) {
          const withSlash = reconstructed + '/' + parts[i];
          const withDot = reconstructed + '.' + parts[i];
          
          if (fs.existsSync(withSlash)) {
            reconstructed = withSlash;
          } else if (reconstructed && fs.existsSync(withDot)) {
            reconstructed = withDot;
          } else if (!reconstructed) {
            reconstructed = '/' + parts[i];
          } else {
            // Default to slash
            reconstructed = withSlash;
          }
        }
        
        if (fs.existsSync(reconstructed)) {
          decoded = reconstructed;
        }
      }
      
      projects.push({ encoded, decoded });
    }

    return projects;
  }

  /**
   * Sync ALL Claude Code projects
   */
  async syncAll(options: { force?: boolean } = {}): Promise<{
    projects: number;
    sessions: number;
    messages: number;
    skipped: number;
  }> {
    const projects = this.getAllClaudeProjects();
    let totalSessions = 0;
    let totalMessages = 0;
    let skipped = 0;

    // Get existing session descriptions to avoid duplicates
    const existingDescriptions = new Set(
      this.server.listSessions().map(s => s.description)
    );

    for (const project of projects) {
      const claudeDir = path.join(os.homedir(), '.claude', 'projects', project.encoded);
      const sessions = await this.claudeReader.getSessions(project.decoded);

      for (const claudeSession of sessions) {
        if (claudeSession.messages.length === 0) continue;

        const sessionKey = `claude:${claudeSession.sessionId}`;
        
        // Skip if already exists (unless force)
        if (!options.force && existingDescriptions.has(sessionKey)) {
          skipped++;
          continue;
        }

        // Convert messages
        const conversation: SessionMessage[] = claudeSession.messages.map(m => ({
          id: m.uuid,
          timestamp: m.timestamp,
          role: m.role,
          content: m.content,
          tool: 'claude_code',
        }));

        // Create session
        const firstMsg = claudeSession.messages[0];
        const lastMsg = claudeSession.messages[claudeSession.messages.length - 1];

        // We can't capture files from the past, so just store conversation
        const session: Session = {
          id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          projectPath: project.decoded,
          projectName: path.basename(project.decoded),
          createdAt: firstMsg.timestamp,
          updatedAt: lastMsg.timestamp,
          trigger: {
            type: 'ai_action',
            tool: 'claude_code',
            description: sessionKey,
          },
          files: [], // Can't recover past files
          diffs: [],
          conversation,
          stats: {
            totalFiles: 0,
            totalSize: 0,
            addedFiles: 0,
            modifiedFiles: 0,
            deletedFiles: 0,
            messageCount: conversation.length,
          },
        };

        this.server.saveSession(session);
        existingDescriptions.add(sessionKey);
        totalSessions++;
        totalMessages += conversation.length;
      }
    }

    return {
      projects: projects.length,
      sessions: totalSessions,
      messages: totalMessages,
      skipped,
    };
  }

  /**
   * Get stats about what would be synced
   */
  async getStats(): Promise<{
    projects: Array<{ path: string; sessions: number; messages: number }>;
    total: { sessions: number; messages: number };
  }> {
    const projects = this.getAllClaudeProjects();
    const stats: Array<{ path: string; sessions: number; messages: number }> = [];
    let totalSessions = 0;
    let totalMessages = 0;

    for (const project of projects) {
      const sessions = await this.claudeReader.getSessions(project.decoded);
      let projectMessages = 0;
      
      for (const s of sessions) {
        projectMessages += s.messages.length;
      }

      if (sessions.length > 0) {
        stats.push({
          path: project.decoded,
          sessions: sessions.length,
          messages: projectMessages,
        });
        totalSessions += sessions.length;
        totalMessages += projectMessages;
      }
    }

    return {
      projects: stats,
      total: { sessions: totalSessions, messages: totalMessages },
    };
  }
}

export default GlobalSync;
