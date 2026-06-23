/**
 * SessionManager - Manages session lifecycle, persistence, and sync
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

export interface Session {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  projectPath: string;
  messageCount: number;
  checkpointCount: number;
  metadata?: Record<string, any>;
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  checkpointId?: string;
}

export interface SessionState {
  currentSessionId: string | null;
  sessions: Session[];
  messages: SessionMessage[];
}

export class SessionManager {
  private static instance: SessionManager;
  private _context: vscode.ExtensionContext;
  private _state: SessionState;
  private _autoSaveTimer: NodeJS.Timeout | null = null;
  private _onStateChange = new vscode.EventEmitter<SessionState>();

  public readonly onStateChange = this._onStateChange.event;

  private constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this._state = this._loadState();
    this._startAutoSave();
  }

  public static getInstance(context?: vscode.ExtensionContext): SessionManager {
    if (!SessionManager.instance) {
      if (!context) {
        throw new Error('SessionManager must be initialized with a context');
      }
      SessionManager.instance = new SessionManager(context);
    }
    return SessionManager.instance;
  }

  /**
   * Get current state
   */
  public getState(): SessionState {
    return { ...this._state };
  }

  /**
   * Get current session
   */
  public getCurrentSession(): Session | null {
    if (!this._state.currentSessionId) return null;
    return this._state.sessions.find(s => s.id === this._state.currentSessionId) || null;
  }

  /**
   * Get all sessions
   */
  public getSessions(): Session[] {
    return [...this._state.sessions];
  }

  /**
   * Create a new session
   */
  public async createSession(title?: string): Promise<Session> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    const session: Session = {
      id: this._generateId('sess'),
      title: title || `Session ${new Date().toLocaleString()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      projectPath: workspaceRoot,
      messageCount: 0,
      checkpointCount: 0,
    };

    this._state.sessions.unshift(session);
    this._state.currentSessionId = session.id;
    this._state.messages = [];

    await this._saveState();
    this._notifyChange();

    // Create session in CLI if available
    try {
      const output = execSync(`aitm session create "${session.title}" --id ${session.id} --json`, {
        cwd: workspaceRoot,
        encoding: 'utf-8',
      });
      console.log('Session created in CLI:', output);
    } catch {
      // CLI might not support this yet
    }

    return session;
  }

  /**
   * Switch to a session
   */
  public async switchSession(sessionId: string): Promise<boolean> {
    const session = this._state.sessions.find(s => s.id === sessionId);
    if (!session) return false;

    // Save current session messages
    await this._saveCurrentSessionMessages();

    // Switch session
    this._state.currentSessionId = sessionId;

    // Load messages for the new session
    this._state.messages = await this._loadSessionMessages(sessionId);

    await this._saveState();
    this._notifyChange();

    return true;
  }

  /**
   * Update session
   */
  public async updateSession(sessionId: string, updates: Partial<Session>): Promise<boolean> {
    const session = this._state.sessions.find(s => s.id === sessionId);
    if (!session) return false;

    Object.assign(session, updates, { updatedAt: new Date() });

    await this._saveState();
    this._notifyChange();

    return true;
  }

  /**
   * Delete a session
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    const index = this._state.sessions.findIndex(s => s.id === sessionId);
    if (index === -1) return false;

    this._state.sessions.splice(index, 1);

    // If deleting current session, switch to another or create new
    if (this._state.currentSessionId === sessionId) {
      if (this._state.sessions.length > 0) {
        await this.switchSession(this._state.sessions[0].id);
      } else {
        await this.createSession('New Session');
      }
    }

    // Delete stored messages
    await this._deleteSessionMessages(sessionId);

    await this._saveState();
    this._notifyChange();

    return true;
  }

  /**
   * Add a message to current session
   */
  public async addMessage(message: Omit<SessionMessage, 'id'>): Promise<SessionMessage> {
    const fullMessage: SessionMessage = {
      ...message,
      id: this._generateId('msg'),
    };

    this._state.messages.push(fullMessage);

    // Update session stats
    const currentSession = this.getCurrentSession();
    if (currentSession) {
      currentSession.messageCount = this._state.messages.length;
      currentSession.updatedAt = new Date();
    }

    // Don't await to avoid blocking
    this._saveState();
    this._notifyChange();

    return fullMessage;
  }

  /**
   * Get messages for current session
   */
  public getMessages(): SessionMessage[] {
    return [...this._state.messages];
  }

  /**
   * Clear messages in current session
   */
  public async clearMessages(): Promise<void> {
    this._state.messages = [];

    const currentSession = this.getCurrentSession();
    if (currentSession) {
      currentSession.messageCount = 0;
      currentSession.updatedAt = new Date();
    }

    await this._saveState();
    this._notifyChange();
  }

  /**
   * Search sessions
   */
  public searchSessions(query: string): Session[] {
    const lowerQuery = query.toLowerCase();
    return this._state.sessions.filter(s =>
      s.title.toLowerCase().includes(lowerQuery) ||
      s.id.includes(lowerQuery)
    );
  }

  /**
   * Export session to file
   */
  public async exportSession(sessionId: string, format: 'json' | 'markdown' = 'json'): Promise<string> {
    const session = this._state.sessions.find(s => s.id === sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const messages = sessionId === this._state.currentSessionId
      ? this._state.messages
      : await this._loadSessionMessages(sessionId);

    if (format === 'markdown') {
      const lines = [
        `# ${session.title}`,
        '',
        `Session ID: ${session.id}`,
        `Created: ${session.createdAt.toLocaleString()}`,
        `Updated: ${session.updatedAt.toLocaleString()}`,
        '',
        '---',
        '',
      ];

      messages.forEach(msg => {
        const roleLabel = msg.role === 'user' ? '**User**' : msg.role === 'assistant' ? '**Assistant**' : '**System**';
        lines.push(`### ${roleLabel}`);
        lines.push('');
        lines.push(msg.content);
        lines.push('');
      });

      return lines.join('\n');
    }

    return JSON.stringify({
      session,
      messages,
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  /**
   * Sync session to cloud
   */
  public async syncToCloud(): Promise<boolean> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return false;

    try {
      execSync('aitm sync', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Dispose manager
   */
  public dispose(): void {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
    }
    this._saveState();
    this._onStateChange.dispose();
  }

  // Private methods

  private _loadState(): SessionState {
    try {
      const savedState = this._context.globalState.get<any>('sessionState');
      if (savedState) {
        return {
          currentSessionId: savedState.currentSessionId,
          sessions: (savedState.sessions || []).map((s: any) => ({
            ...s,
            createdAt: new Date(s.createdAt),
            updatedAt: new Date(s.updatedAt),
          })),
          messages: (savedState.messages || []).map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })),
        };
      }
    } catch (error) {
      console.error('Failed to load session state:', error);
    }

    // Return default state
    return {
      currentSessionId: null,
      sessions: [],
      messages: [],
    };
  }

  private async _saveState(): Promise<void> {
    try {
      const stateToSave = {
        currentSessionId: this._state.currentSessionId,
        sessions: this._state.sessions.map(s => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
        messages: this._state.messages.slice(-100).map(m => ({
          ...m,
          timestamp: m.timestamp.toISOString(),
        })),
      };

      await this._context.globalState.update('sessionState', stateToSave);
    } catch (error) {
      console.error('Failed to save session state:', error);
    }
  }

  private async _saveCurrentSessionMessages(): Promise<void> {
    if (!this._state.currentSessionId) return;

    const storageKey = `session_${this._state.currentSessionId}_messages`;
    const messagesToSave = this._state.messages.map(m => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    }));

    await this._context.globalState.update(storageKey, messagesToSave);
  }

  private async _loadSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    const storageKey = `session_${sessionId}_messages`;
    const savedMessages = this._context.globalState.get<any[]>(storageKey, []);

    return savedMessages.map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  }

  private async _deleteSessionMessages(sessionId: string): Promise<void> {
    const storageKey = `session_${sessionId}_messages`;
    await this._context.globalState.update(storageKey, undefined);
  }

  private _startAutoSave(): void {
    // Auto-save every 30 seconds
    this._autoSaveTimer = setInterval(() => {
      this._saveState();
    }, 30000);
  }

  private _notifyChange(): void {
    this._onStateChange.fire(this.getState());
  }

  private _generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }
}

// Export singleton accessor
export function getSessionManager(context?: vscode.ExtensionContext): SessionManager {
  return SessionManager.getInstance(context);
}
