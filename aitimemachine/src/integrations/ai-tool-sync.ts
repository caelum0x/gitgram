import * as fs from 'fs';
import * as path from 'path';
import { ClaudeCodeReader, ClaudeSession } from './claude-code.js';
import { CursorReader } from './cursor.js';
import { TimeMachineEngine } from '../core/engine.js';

export interface AIToolSession {
  tool: 'claude_code' | 'cursor' | 'gemini' | 'unknown';
  sessionId: string;
  projectPath: string;
  startTime: Date;
  endTime: Date;
  messageCount: number;
  summaries: string[];
  messages: Array<{
    timestamp: Date;
    role: 'user' | 'assistant';
    content: string;
  }>;
  fileChanges: Array<{
    timestamp: Date;
    files: string[];
  }>;
}

/**
 * Unified sync engine - pulls conversations from all AI tools
 * and creates TimePoints with full context
 */
export class AIToolSync {
  private engine: TimeMachineEngine;
  private claudeReader: ClaudeCodeReader;
  private cursorReader: CursorReader;
  private lastSyncTime: Map<string, Date> = new Map();

  constructor(private projectPath: string) {
    this.engine = new TimeMachineEngine(projectPath);
    this.claudeReader = new ClaudeCodeReader();
    this.cursorReader = new CursorReader();
    this.loadSyncState();
  }

  private getSyncStatePath(): string {
    return path.join(this.projectPath, '.aitimemachine', 'sync-state.json');
  }

  private loadSyncState(): void {
    const statePath = this.getSyncStatePath();
    if (fs.existsSync(statePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        for (const [key, value] of Object.entries(data.lastSync || {})) {
          this.lastSyncTime.set(key, new Date(value as string));
        }
      } catch {}
    }
  }

  private saveSyncState(): void {
    const statePath = this.getSyncStatePath();
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    const data: Record<string, string> = {};
    for (const [key, value] of this.lastSyncTime) {
      data[key] = value.toISOString();
    }
    fs.writeFileSync(statePath, JSON.stringify({ lastSync: data }, null, 2));
  }

  /**
   * Detect which AI tools have been used with this project
   */
  detectTools(): Array<{ tool: string; installed: boolean; hasHistory: boolean }> {
    const tools: Array<{ tool: string; installed: boolean; hasHistory: boolean }> = [];

    // Claude Code
    const claudeInstalled = this.claudeReader.isInstalled();
    const claudeDir = this.claudeReader.getProjectClaudeDir(this.projectPath);
    tools.push({
      tool: 'claude_code',
      installed: claudeInstalled,
      hasHistory: !!claudeDir,
    });

    // Cursor
    const cursorInstalled = this.cursorReader.isInstalled();
    const cursorWorkspace = this.cursorReader.findWorkspace(this.projectPath);
    tools.push({
      tool: 'cursor',
      installed: cursorInstalled,
      hasHistory: !!cursorWorkspace,
    });

    return tools;
  }

  /**
   * Sync conversations from Claude Code
   */
  async syncClaudeCode(): Promise<{ sessions: number; messages: number; timepoints: number }> {
    if (!this.claudeReader.isInstalled()) {
      return { sessions: 0, messages: 0, timepoints: 0 };
    }

    const sessions = await this.claudeReader.getSessions(this.projectPath);
    const lastSync = this.lastSyncTime.get('claude_code') || new Date(0);
    
    let totalMessages = 0;
    let totalTimepoints = 0;

    for (const session of sessions) {
      // Get new messages since last sync
      const newMessages = session.messages.filter(m => m.timestamp > lastSync);
      if (newMessages.length === 0) continue;

      totalMessages += newMessages.length;

      // Import messages to our conversation store
      for (const msg of newMessages) {
        const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        // Skip tool results and system messages
        if (contentStr.startsWith('[{') || contentStr.length < 10) continue;
        
        this.engine.logMessage(msg.role, contentStr.slice(0, 5000), {
          tool: 'claude_code',
          action: session.summaries[0] || 'conversation',
        });
      }

      // Create timepoint for significant sessions
      if (newMessages.length >= 5) {
        const description = session.summaries[0] || 
          `Claude Code session: ${newMessages.length} messages`;
        
        this.engine.capture(description, {
          type: 'ai_action',
          tool: 'claude_code',
          action: 'sync',
        });
        totalTimepoints++;
      }
    }

    this.lastSyncTime.set('claude_code', new Date());
    this.saveSyncState();

    return { sessions: sessions.length, messages: totalMessages, timepoints: totalTimepoints };
  }

  /**
   * Full sync from all AI tools
   */
  async syncAll(): Promise<{
    claude: { sessions: number; messages: number; timepoints: number };
    cursor: { sessions: number; messages: number; timepoints: number };
  }> {
    const claude = await this.syncClaudeCode();
    
    // Cursor sync would go here when we add SQLite support
    const cursor = { sessions: 0, messages: 0, timepoints: 0 };

    return { claude, cursor };
  }

  /**
   * Watch for new AI tool activity and auto-sync
   */
  startWatching(callback?: (tool: string, messages: number) => void): () => void {
    const stopFns: Array<() => void> = [];

    // Watch Claude Code
    if (this.claudeReader.isInstalled()) {
      const stop = this.claudeReader.watchProject(this.projectPath, async (session) => {
        const lastSync = this.lastSyncTime.get('claude_code') || new Date(0);
        const newMessages = session.messages.filter(m => m.timestamp > lastSync);
        
        if (newMessages.length > 0) {
          for (const msg of newMessages) {
            this.engine.logMessage(msg.role, msg.content, {
              tool: 'claude_code',
            });
          }
          
          this.lastSyncTime.set('claude_code', new Date());
          this.saveSyncState();
          
          callback?.('claude_code', newMessages.length);
        }
      });
      stopFns.push(stop);
    }

    return () => {
      for (const stop of stopFns) {
        stop();
      }
    };
  }

  /**
   * Get combined conversation history from all tools
   */
  async getCombinedHistory(): Promise<Array<{
    tool: string;
    timestamp: Date;
    role: 'user' | 'assistant';
    content: string;
  }>> {
    const history: Array<{
      tool: string;
      timestamp: Date;
      role: 'user' | 'assistant';
      content: string;
    }> = [];

    // Get from Claude Code
    const sessions = await this.claudeReader.getSessions(this.projectPath);
    for (const session of sessions) {
      for (const msg of session.messages) {
        history.push({
          tool: 'claude_code',
          timestamp: msg.timestamp,
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Get from our own store
    const ourMessages = this.engine.getConversations();
    for (const msg of ourMessages) {
      // Avoid duplicates
      const isDupe = history.some(h => 
        Math.abs(h.timestamp.getTime() - msg.timestamp.getTime()) < 1000 &&
        h.content === msg.content
      );
      if (!isDupe) {
        history.push({
          tool: msg.metadata?.tool || 'aitimemachine',
          timestamp: msg.timestamp,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Sort by timestamp
    history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return history;
  }

  /**
   * Search across all AI tool conversations
   */
  async searchAllConversations(query: string): Promise<Array<{
    tool: string;
    timestamp: Date;
    role: 'user' | 'assistant';
    content: string;
    context: string;
  }>> {
    const history = await this.getCombinedHistory();
    const lower = query.toLowerCase();
    
    return history
      .filter(h => {
        const contentStr = typeof h.content === 'string' ? h.content : JSON.stringify(h.content);
        return contentStr.toLowerCase().includes(lower);
      })
      .map(h => {
        const contentStr = typeof h.content === 'string' ? h.content : JSON.stringify(h.content);
        return {
          ...h,
          content: contentStr,
          context: this.getContext(contentStr, query),
        };
      });
  }

  private getContext(text: string, query: string, contextLength = 50): string {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, contextLength * 2);
    
    const start = Math.max(0, idx - contextLength);
    const end = Math.min(text.length, idx + query.length + contextLength);
    
    let context = text.slice(start, end);
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';
    
    return context;
  }

  /**
   * Get engine for direct access
   */
  getEngine(): TimeMachineEngine {
    return this.engine;
  }
}
