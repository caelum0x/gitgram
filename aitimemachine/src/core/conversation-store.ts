import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ConversationMessage } from './types.js';

/**
 * Stores and manages all AI conversations
 */
export class ConversationStore {
  private basePath: string;
  private currentSessionId: string;
  private messages: ConversationMessage[] = [];

  constructor(basePath: string) {
    this.basePath = path.join(basePath, 'conversations');
    this.ensureDir(this.basePath);
    this.currentSessionId = this.generateSessionId();
    this.loadAll();
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.basePath, `${sessionId}.json`);
  }

  /**
   * Load all conversations from disk
   */
  private loadAll(): void {
    this.messages = [];
    
    if (!fs.existsSync(this.basePath)) return;

    const files = fs.readdirSync(this.basePath).filter(f => f.endsWith('.json')).sort();
    
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.basePath, file), 'utf-8'));
        const msgs = data.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        this.messages.push(...msgs);
      } catch { /* ignore corrupt files */ }
    }

    // Sort by timestamp
    this.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Save current session to disk
   */
  private saveSession(): void {
    const sessionMessages = this.messages.filter(m => m.sessionId === this.currentSessionId);
    if (sessionMessages.length === 0) return;

    const serialized = sessionMessages.map(m => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    }));

    fs.writeFileSync(this.getSessionPath(this.currentSessionId), JSON.stringify(serialized, null, 2));
  }

  /**
   * Start a new session
   */
  newSession(): string {
    this.currentSessionId = this.generateSessionId();
    return this.currentSessionId;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.currentSessionId;
  }

  /**
   * Add a message
   */
  add(
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: ConversationMessage['metadata']
  ): ConversationMessage {
    const msg: ConversationMessage = {
      id: `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date(),
      sessionId: this.currentSessionId,
      role,
      content,
      metadata,
    };

    this.messages.push(msg);
    this.saveSession();
    return msg;
  }

  /**
   * Get all messages
   */
  getAll(): ConversationMessage[] {
    return [...this.messages];
  }

  /**
   * Get messages up to a timestamp
   */
  getUntil(timestamp: Date): ConversationMessage[] {
    return this.messages.filter(m => m.timestamp <= timestamp);
  }

  /**
   * Get messages for current session
   */
  getCurrentSession(): ConversationMessage[] {
    return this.messages.filter(m => m.sessionId === this.currentSessionId);
  }

  /**
   * Get message count
   */
  count(): number {
    return this.messages.length;
  }

  /**
   * Get last message preview
   */
  getLastPreview(maxLength = 100): string {
    if (this.messages.length === 0) return '';
    const last = this.messages[this.messages.length - 1];
    return last.content.slice(0, maxLength) + (last.content.length > maxLength ? '...' : '');
  }

  /**
   * Search messages
   */
  search(query: string): ConversationMessage[] {
    const lower = query.toLowerCase();
    return this.messages.filter(m => m.content.toLowerCase().includes(lower));
  }

  /**
   * Restore conversation to a point in time (delete messages after)
   */
  restoreTo(timestamp: Date): number {
    const before = this.messages.length;
    this.messages = this.messages.filter(m => m.timestamp <= timestamp);
    
    // Rewrite all session files
    const sessions = new Map<string, ConversationMessage[]>();
    for (const m of this.messages) {
      if (!sessions.has(m.sessionId)) sessions.set(m.sessionId, []);
      sessions.get(m.sessionId)!.push(m);
    }

    // Clear and rewrite
    for (const file of fs.readdirSync(this.basePath)) {
      fs.unlinkSync(path.join(this.basePath, file));
    }

    for (const [sessionId, msgs] of sessions) {
      const serialized = msgs.map(m => ({ ...m, timestamp: m.timestamp.toISOString() }));
      fs.writeFileSync(this.getSessionPath(sessionId), JSON.stringify(serialized, null, 2));
    }

    return before - this.messages.length;
  }
}
