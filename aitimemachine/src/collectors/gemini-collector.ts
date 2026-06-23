import * as fs from 'fs';
import * as path from 'path';
import { platform } from '../utils/index.js';

interface GeminiMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface GeminiSession {
  id: string;
  projectPath?: string;
  messages: GeminiMessage[];
  tasks?: string[];
  createdAt: Date;
}

/**
 * Gemini CLI Collector
 * Reads from ~/.gemini/antigravity/
 * 
 * Note: Conversations are stored in protobuf (.pb) files.
 * We extract what we can from the brain/ folder which has readable markdown.
 */
export class GeminiCollector {
  private geminiDir: string;

  constructor() {
    this.geminiDir = path.join(platform.geminiDir(), 'antigravity');
  }

  isAvailable(): boolean {
    return fs.existsSync(this.geminiDir);
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    const convDir = path.join(this.geminiDir, 'conversations');
    if (!fs.existsSync(convDir)) return [];
    
    return fs.readdirSync(convDir)
      .filter(f => f.endsWith('.pb'))
      .map(f => f.replace('.pb', ''));
  }

  /**
   * Get session with available data
   * Since .pb files are binary protobuf, we extract from brain/ folder
   */
  getSession(sessionId: string): GeminiSession | null {
    const brainDir = path.join(this.geminiDir, 'brain', sessionId);
    const convFile = path.join(this.geminiDir, 'conversations', `${sessionId}.pb`);
    
    if (!fs.existsSync(convFile)) return null;

    const session: GeminiSession = {
      id: sessionId,
      messages: [],
      createdAt: fs.statSync(convFile).mtime,
    };

    // Try to extract from brain folder (markdown files)
    if (fs.existsSync(brainDir)) {
      const files = fs.readdirSync(brainDir);
      
      for (const file of files) {
        const filePath = path.join(brainDir, file);
        
        if (file === 'task.md') {
          const content = fs.readFileSync(filePath, 'utf-8');
          session.tasks = this.parseTasks(content);
        }
        
        if (file.endsWith('.md') && !file.includes('metadata')) {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Add as assistant message (these are Gemini's outputs)
          session.messages.push({
            role: 'assistant',
            content: content.slice(0, 2000), // Truncate
            timestamp: fs.statSync(filePath).mtime,
          });
        }

        // Try to get metadata
        const metaFile = `${file}.metadata.json`;
        if (files.includes(metaFile)) {
          try {
            const meta = JSON.parse(fs.readFileSync(path.join(brainDir, metaFile), 'utf-8'));
            if (meta.updatedAt) {
              session.createdAt = new Date(meta.updatedAt);
            }
          } catch {}
        }
      }
    }

    // Try to extract text from protobuf using strings
    const pbContent = this.extractStringsFromPb(convFile);
    if (pbContent.length > 0) {
      // Heuristic: longer strings are likely messages
      const potentialMessages = pbContent
        .filter(s => s.length > 50 && s.length < 5000)
        .filter(s => !s.includes('\x00') && /^[\x20-\x7E\n\r\t]+$/.test(s));
      
      for (const msg of potentialMessages.slice(0, 20)) {
        // Try to determine role based on content patterns
        const isUser = msg.length < 500 || msg.includes('?') || !msg.includes('```');
        session.messages.push({
          role: isUser ? 'user' : 'assistant',
          content: msg,
          timestamp: session.createdAt,
        });
      }
    }

    return session.messages.length > 0 ? session : null;
  }

  /**
   * Extract readable strings from protobuf file
   */
  private extractStringsFromPb(filePath: string): string[] {
    try {
      const buffer = fs.readFileSync(filePath);
      const strings: string[] = [];
      let current = '';
      
      for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i];
        // Printable ASCII + newline/tab
        if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9) {
          current += String.fromCharCode(byte);
        } else {
          if (current.length >= 20) {
            strings.push(current.trim());
          }
          current = '';
        }
      }
      
      if (current.length >= 20) {
        strings.push(current.trim());
      }
      
      return strings;
    } catch {
      return [];
    }
  }

  /**
   * Parse tasks from task.md
   */
  private parseTasks(content: string): string[] {
    const tasks: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^-\s*\[.\]\s*(.+)/);
      if (match) {
        tasks.push(match[1].trim());
      }
    }
    
    return tasks;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): GeminiSession[] {
    const ids = this.getSessionIds();
    const sessions: GeminiSession[] = [];
    
    for (const id of ids) {
      const session = this.getSession(id);
      if (session) {
        sessions.push(session);
      }
    }
    
    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Search across all sessions
   */
  search(query: string): Array<{ sessionId: string; content: string; timestamp: Date }> {
    const results: Array<{ sessionId: string; content: string; timestamp: Date }> = [];
    const q = query.toLowerCase();
    
    for (const session of this.getAllSessions()) {
      for (const msg of session.messages) {
        if (msg.content.toLowerCase().includes(q)) {
          results.push({
            sessionId: session.id,
            content: msg.content.slice(0, 200),
            timestamp: msg.timestamp,
          });
        }
      }
      
      for (const task of session.tasks || []) {
        if (task.toLowerCase().includes(q)) {
          results.push({
            sessionId: session.id,
            content: `Task: ${task}`,
            timestamp: session.createdAt,
          });
        }
      }
    }
    
    return results;
  }
}
