import * as fs from 'fs';
import * as path from 'path';
import { ClaudeCodeReader, ClaudeSession } from './claude-code.js';
import { SessionServer, SessionCapture, Session, SessionMessage } from '../server/index.js';

/**
 * Full sync - imports Claude Code history and creates sessions with file snapshots
 */
export class FullSync {
  private projectPath: string;
  private claudeReader: ClaudeCodeReader;
  private server: SessionServer;
  private capture: SessionCapture;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
    this.claudeReader = new ClaudeCodeReader();
    this.server = new SessionServer();
    this.capture = new SessionCapture(projectPath);
  }

  /**
   * Sync all Claude Code sessions into AITimeMachine
   */
  async syncClaudeCode(): Promise<{ sessions: number; messages: number }> {
    const claudeSessions = await this.claudeReader.getSessions(this.projectPath);
    
    if (claudeSessions.length === 0) {
      return { sessions: 0, messages: 0 };
    }

    let totalMessages = 0;
    let sessionsCreated = 0;

    // Get existing sessions to avoid duplicates
    const existingSessions = new Set(
      this.server.listSessions(this.projectPath).map(s => s.description)
    );

    for (const claudeSession of claudeSessions) {
      if (claudeSession.messages.length === 0) continue;

      // Create session ID from Claude session
      const sessionKey = `claude:${claudeSession.sessionId}`;
      if (existingSessions.has(sessionKey)) continue;

      // Convert Claude messages to our format
      const conversation: SessionMessage[] = claudeSession.messages.map(m => ({
        id: m.uuid,
        timestamp: m.timestamp,
        role: m.role,
        content: m.content,
        tool: 'claude_code',
      }));

      // Get first and last message for description
      const firstMsg = claudeSession.messages[0];
      const lastMsg = claudeSession.messages[claudeSession.messages.length - 1];
      const preview = firstMsg.content.slice(0, 50).replace(/\n/g, ' ');
      
      // Capture current file state (we can't go back in time for files)
      // But we store the conversation from that time
      const { session, blobs } = this.capture.capture(
        sessionKey,
        {
          type: 'ai_action',
          tool: 'claude_code',
          description: `Claude: ${preview}...`,
        },
        undefined,
        conversation
      );

      // Override timestamp to match Claude session
      session.createdAt = firstMsg.timestamp;
      session.updatedAt = lastMsg.timestamp;

      // Store
      for (const [hash, content] of blobs) {
        this.server.storeBlob(content);
      }
      this.server.saveSession(session);

      sessionsCreated++;
      totalMessages += conversation.length;
    }

    return { sessions: sessionsCreated, messages: totalMessages };
  }

  /**
   * Get combined timeline of all sessions (AITimeMachine + Claude Code)
   */
  async getCombinedTimeline(): Promise<Array<{
    id: string;
    timestamp: Date;
    source: 'aitm' | 'claude_code';
    description: string;
    messageCount: number;
    fileCount: number;
  }>> {
    const timeline: Array<{
      id: string;
      timestamp: Date;
      source: 'aitm' | 'claude_code';
      description: string;
      messageCount: number;
      fileCount: number;
    }> = [];

    // Get AITimeMachine sessions
    const sessions = this.server.listSessions(this.projectPath);
    for (const s of sessions) {
      const full = this.server.loadSession(s.id);
      timeline.push({
        id: s.id,
        timestamp: s.createdAt,
        source: 'aitm',
        description: s.description,
        messageCount: full?.conversation.length || 0,
        fileCount: full?.files.length || 0,
      });
    }

    // Get Claude Code sessions not yet synced
    const claudeSessions = await this.claudeReader.getSessions(this.projectPath);
    const syncedIds = new Set(sessions.filter(s => s.description.startsWith('claude:')).map(s => s.description.replace('claude:', '')));
    
    for (const cs of claudeSessions) {
      if (syncedIds.has(cs.sessionId)) continue;
      if (cs.messages.length === 0) continue;

      const firstMsg = cs.messages[0];
      timeline.push({
        id: `claude:${cs.sessionId}`,
        timestamp: firstMsg.timestamp,
        source: 'claude_code',
        description: firstMsg.content.slice(0, 60).replace(/\n/g, ' ') + '...',
        messageCount: cs.messages.length,
        fileCount: 0, // Not synced yet
      });
    }

    return timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Search across all conversations (synced + Claude Code)
   */
  async searchAll(query: string): Promise<Array<{
    source: 'aitm' | 'claude_code';
    sessionId: string;
    timestamp: Date;
    role: 'user' | 'assistant';
    content: string;
    context: string;
  }>> {
    const results: Array<{
      source: 'aitm' | 'claude_code';
      sessionId: string;
      timestamp: Date;
      role: 'user' | 'assistant';
      content: string;
      context: string;
    }> = [];

    const queryLower = query.toLowerCase();

    // Search AITimeMachine sessions
    const sessions = this.server.listSessions(this.projectPath);
    for (const s of sessions) {
      const full = this.server.loadSession(s.id);
      if (!full) continue;

      for (let i = 0; i < full.conversation.length; i++) {
        const m = full.conversation[i];
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        if (content.toLowerCase().includes(queryLower)) {
          const prevContent = full.conversation[i - 1]?.content;
          const nextContent = full.conversation[i + 1]?.content;
          const prev = typeof prevContent === 'string' ? prevContent.slice(0, 50) : '';
          const next = typeof nextContent === 'string' ? nextContent.slice(0, 50) : '';
          results.push({
            source: 'aitm',
            sessionId: s.id,
            timestamp: m.timestamp,
            role: m.role as 'user' | 'assistant',
            content: content,
            context: `${prev ? '...' + prev + '\n' : ''}>>> ${content.slice(0, 100)}${next ? '\n' + next + '...' : ''}`,
          });
        }
      }
    }

    // Search Claude Code directly
    const claudeSessions = await this.claudeReader.getSessions(this.projectPath);
    for (const cs of claudeSessions) {
      for (let i = 0; i < cs.messages.length; i++) {
        const m = cs.messages[i];
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        if (content.toLowerCase().includes(queryLower)) {
          const prevContent = cs.messages[i - 1]?.content;
          const nextContent = cs.messages[i + 1]?.content;
          const prev = typeof prevContent === 'string' ? prevContent.slice(0, 50) : '';
          const next = typeof nextContent === 'string' ? nextContent.slice(0, 50) : '';
          results.push({
            source: 'claude_code',
            sessionId: cs.sessionId,
            timestamp: m.timestamp,
            role: m.role,
            content: content,
            context: `${prev ? '...' + prev + '\n' : ''}>>> ${content.slice(0, 100)}${next ? '\n' + next + '...' : ''}`,
          });
        }
      }
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}
