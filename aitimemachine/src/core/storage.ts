import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Represents a complete point-in-time state
 */
export interface TimePoint {
  id: string;
  timestamp: Date;
  description: string;
  trigger: 'auto' | 'manual' | 'ai_action';
  
  // AI context
  aiTool?: string;  // 'claude_code' | 'cursor' | 'gemini' etc
  aiAction?: string; // What the AI was doing
  conversation: ConversationMessage[];
  
  // File system state
  files: FileState[];
  fileTree: string[]; // List of all file paths
  
  // Metadata
  stats: {
    totalFiles: number;
    totalSize: number;
    changedFiles: number;
  };
}

export interface ConversationMessage {
  id: string;
  timestamp: Date;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: string[]; // What tools/actions AI invoked
}

export interface FileState {
  path: string;        // Relative path from project root
  hash: string;        // Content hash for deduplication
  size: number;
  modifiedAt: Date;
  content?: string;    // Only stored if changed from previous
}

export interface FileContent {
  hash: string;
  content: string;
}

/**
 * Core storage engine - stores files by content hash for deduplication
 */
export class ContentStore {
  private storePath: string;
  
  constructor(projectPath: string) {
    this.storePath = path.join(projectPath, '.aitimemachine', 'store');
    this.ensureDir(this.storePath);
  }
  
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  /**
   * Store content and return hash
   */
  store(content: string): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    const filePath = path.join(this.storePath, hash.slice(0, 2), hash);
    
    if (!fs.existsSync(filePath)) {
      this.ensureDir(path.dirname(filePath));
      fs.writeFileSync(filePath, content);
    }
    
    return hash;
  }
  
  /**
   * Retrieve content by hash
   */
  retrieve(hash: string): string | null {
    const filePath = path.join(this.storePath, hash.slice(0, 2), hash);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
  }
  
  /**
   * Check if content exists
   */
  exists(hash: string): boolean {
    const filePath = path.join(this.storePath, hash.slice(0, 2), hash);
    return fs.existsSync(filePath);
  }
}

/**
 * Manages time points (snapshots)
 */
export class TimePointStore {
  private storePath: string;
  private indexPath: string;
  private index: { id: string; timestamp: string; description: string }[] = [];
  
  constructor(projectPath: string) {
    this.storePath = path.join(projectPath, '.aitimemachine', 'timepoints');
    this.indexPath = path.join(projectPath, '.aitimemachine', 'index.json');
    this.ensureDir(this.storePath);
    this.loadIndex();
  }
  
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  private loadIndex(): void {
    if (fs.existsSync(this.indexPath)) {
      try {
        this.index = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      } catch { this.index = []; }
    }
  }
  
  private saveIndex(): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2));
  }
  
  save(timePoint: TimePoint): void {
    const filePath = path.join(this.storePath, `${timePoint.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(timePoint, null, 2));
    
    // Update index
    this.index.push({
      id: timePoint.id,
      timestamp: timePoint.timestamp.toISOString(),
      description: timePoint.description
    });
    this.saveIndex();
  }
  
  load(id: string): TimePoint | null {
    const filePath = path.join(this.storePath, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return {
      ...data,
      timestamp: new Date(data.timestamp),
      conversation: data.conversation.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp)
      })),
      files: data.files.map((f: any) => ({
        ...f,
        modifiedAt: new Date(f.modifiedAt)
      }))
    };
  }
  
  list(): { id: string; timestamp: Date; description: string }[] {
    return this.index.map(i => ({
      ...i,
      timestamp: new Date(i.timestamp)
    }));
  }
  
  getLatest(): TimePoint | null {
    if (this.index.length === 0) return null;
    return this.load(this.index[this.index.length - 1].id);
  }
  
  findByTime(targetTime: Date): TimePoint | null {
    // Find the timepoint just before or at the target time
    const sorted = [...this.index].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    let closest: typeof sorted[0] | null = null;
    for (const tp of sorted) {
      if (new Date(tp.timestamp) <= targetTime) {
        closest = tp;
      } else {
        break;
      }
    }
    
    return closest ? this.load(closest.id) : null;
  }
  
  findByDescription(query: string): TimePoint | null {
    const lower = query.toLowerCase();
    for (let i = this.index.length - 1; i >= 0; i--) {
      if (this.index[i].description.toLowerCase().includes(lower)) {
        return this.load(this.index[i].id);
      }
    }
    return null;
  }
}

/**
 * Conversation store - persists all AI conversations
 */
export class ConversationStore {
  private storePath: string;
  private messages: ConversationMessage[] = [];
  
  constructor(projectPath: string) {
    this.storePath = path.join(projectPath, '.aitimemachine', 'conversations.json');
    this.load();
  }
  
  private load(): void {
    if (fs.existsSync(this.storePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
        this.messages = data.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
      } catch { this.messages = []; }
    }
  }
  
  private save(): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.messages, null, 2));
  }
  
  add(role: 'user' | 'assistant' | 'system', content: string, toolCalls?: string[]): ConversationMessage {
    const msg: ConversationMessage = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      role,
      content,
      toolCalls
    };
    this.messages.push(msg);
    this.save();
    return msg;
  }
  
  getAll(): ConversationMessage[] {
    return [...this.messages];
  }
  
  getUntil(timestamp: Date): ConversationMessage[] {
    return this.messages.filter(m => m.timestamp <= timestamp);
  }
  
  search(query: string): ConversationMessage[] {
    const lower = query.toLowerCase();
    return this.messages.filter(m => m.content.toLowerCase().includes(lower));
  }
  
  clear(): void {
    this.messages = [];
    this.save();
  }
  
  restoreTo(messages: ConversationMessage[]): void {
    this.messages = messages;
    this.save();
  }
}
