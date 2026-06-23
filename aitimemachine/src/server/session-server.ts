import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as http from 'http';
import { assertLicenseCompliance } from '../compliance/license-policy.js';

/**
 * Session - A complete capture of project state at a moment
 */
export interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Trigger info
  trigger: {
    type: 'auto' | 'manual' | 'ai_action' | 'restore';
    tool?: string;
    action?: string;
    description: string;
  };
  
  // Complete file state
  files: SessionFile[];
  
  // All diffs from previous session
  diffs: SessionDiff[];
  
  // Conversation at this point
  conversation: SessionMessage[];
  
  // Metadata
  stats: {
    totalFiles: number;
    totalSize: number;
    addedFiles: number;
    modifiedFiles: number;
    deletedFiles: number;
    messageCount: number;
  };

  // Git state (optional)
  git?: {
    branch?: string;
    commit?: string;
    commitMessage?: string;
    uncommittedChanges: boolean;
    stagedChanges: boolean;
    untrackedFiles: number;
  };

  // Environment state (optional)
  environment?: {
    runtimes: Record<string, string>;
    packageManager?: { name: string; version: string; lockFile?: string };
    dependencies?: { count: number; file: string };
  };
}

export interface SessionFile {
  path: string;
  hash: string;
  size: number;
  mode: number;
  mtime: number;
  type: 'text' | 'binary';
}

export interface SessionDiff {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  oldHash?: string;
  newHash?: string;
  hunks?: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface SessionMessage {
  id: string;
  timestamp: Date;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool?: string;
  metadata?: Record<string, any>;
}

export interface Project {
  id: string;
  path: string;
  name: string;
  createdAt: Date;
  lastSessionAt: Date;
  sessionCount: number;
  totalSize: number;
}

/**
 * Session Server - Stores and serves sessions
 */
export class SessionServer {
  private dataDir: string;
  private sessionsDir: string;
  private blobsDir: string;
  private projectsDir: string;
  private conversationsDir: string;
  private indexPath: string;
  private projectsPath: string;
  private index: Map<string, { projectPath: string; createdAt: string; description: string }> = new Map();
  private projects: Map<string, Project> = new Map();
  private server: http.Server | null = null;

  constructor(dataDir: string = path.join(process.env.HOME || '', '.aitimemachine-server')) {
    this.dataDir = dataDir;
    this.sessionsDir = path.join(dataDir, 'sessions');
    this.blobsDir = path.join(dataDir, 'blobs');
    this.projectsDir = path.join(dataDir, 'projects');
    this.conversationsDir = path.join(dataDir, 'conversations');
    this.indexPath = path.join(dataDir, 'index.json');
    this.projectsPath = path.join(dataDir, 'projects.json');
    this.ensureDirs();
    this.loadIndex();
    this.loadProjects();
  }

  private ensureDirs(): void {
    for (const dir of [this.dataDir, this.sessionsDir, this.blobsDir, this.projectsDir, this.conversationsDir]) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadIndex(): void {
    if (fs.existsSync(this.indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
        this.index = new Map(Object.entries(data));
      } catch {}
    }
  }

  private saveIndex(): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(Object.fromEntries(this.index), null, 2));
  }

  private loadProjects(): void {
    if (fs.existsSync(this.projectsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.projectsPath, 'utf-8'));
        for (const [id, p] of Object.entries(data as Record<string, any>)) {
          this.projects.set(id, {
            ...p,
            createdAt: new Date(p.createdAt),
            lastSessionAt: new Date(p.lastSessionAt),
          });
        }
      } catch {}
    }
  }

  private saveProjects(): void {
    const data: Record<string, any> = {};
    for (const [id, p] of this.projects) {
      data[id] = { ...p, createdAt: p.createdAt.toISOString(), lastSessionAt: p.lastSessionAt.toISOString() };
    }
    fs.writeFileSync(this.projectsPath, JSON.stringify(data, null, 2));
  }

  /**
   * Register or update a project
   */
  registerProject(projectPath: string): Project {
    const resolved = path.resolve(projectPath);
    assertLicenseCompliance(resolved, 'repo_ingest');
    const id = crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 16);
    
    let project = this.projects.get(id);
    if (!project) {
      project = {
        id,
        path: resolved,
        name: path.basename(resolved),
        createdAt: new Date(),
        lastSessionAt: new Date(),
        sessionCount: 0,
        totalSize: 0,
      };
      this.projects.set(id, project);
      this.saveProjects();
    }
    return project;
  }

  /**
   * Get all projects
   */
  getProjects(): Project[] {
    return Array.from(this.projects.values()).sort((a, b) => b.lastSessionAt.getTime() - a.lastSessionAt.getTime());
  }

  /**
   * Get project by path
   */
  getProject(projectPath: string): Project | null {
    const resolved = path.resolve(projectPath);
    const id = crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 16);
    return this.projects.get(id) || null;
  }

  /**
   * Save conversation history for a project (full history, not just session)
   */
  saveConversation(projectPath: string, messages: SessionMessage[]): void {
    const resolved = path.resolve(projectPath);
    const id = crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 16);
    const convPath = path.join(this.conversationsDir, `${id}.jsonl`);
    
    // Append new messages
    const lines = messages.map(m => JSON.stringify({
      ...m,
      timestamp: m.timestamp.toISOString(),
    })).join('\n') + '\n';
    
    fs.appendFileSync(convPath, lines);
  }

  /**
   * Load full conversation history for a project
   */
  loadConversation(projectPath: string): SessionMessage[] {
    const resolved = path.resolve(projectPath);
    const id = crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 16);
    const convPath = path.join(this.conversationsDir, `${id}.jsonl`);
    
    if (!fs.existsSync(convPath)) return [];
    
    const messages: SessionMessage[] = [];
    const lines = fs.readFileSync(convPath, 'utf-8').split('\n').filter(l => l.trim());
    
    for (const line of lines) {
      try {
        const m = JSON.parse(line);
        messages.push({ ...m, timestamp: new Date(m.timestamp) });
      } catch {}
    }
    
    return messages;
  }

  /**
   * Search conversations across all projects
   */
  searchConversations(query: string): Array<{ project: Project; message: SessionMessage; context: string }> {
    const results: Array<{ project: Project; message: SessionMessage; context: string }> = [];
    const queryLower = query.toLowerCase();
    
    for (const project of this.projects.values()) {
      const messages = this.loadConversation(project.path);
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.content.toLowerCase().includes(queryLower)) {
          // Get context (prev + next message)
          const prev = messages[i - 1]?.content.slice(0, 100) || '';
          const next = messages[i + 1]?.content.slice(0, 100) || '';
          results.push({
            project,
            message: m,
            context: `${prev ? '...' + prev + '\n' : ''}>>> ${m.content.slice(0, 200)}${next ? '\n' + next + '...' : ''}`,
          });
        }
      }
    }
    
    return results.sort((a, b) => b.message.timestamp.getTime() - a.message.timestamp.getTime());
  }

  /**
   * Store a blob (file content) by hash
   */
  storeBlob(content: Buffer): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 32);
    const blobPath = path.join(this.blobsDir, hash.slice(0, 2), hash);
    
    if (!fs.existsSync(blobPath)) {
      const dir = path.dirname(blobPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(blobPath, content);
    }
    
    return hash;
  }

  /**
   * Get blob content
   */
  getBlob(hash: string): Buffer | null {
    const blobPath = path.join(this.blobsDir, hash.slice(0, 2), hash);
    return fs.existsSync(blobPath) ? fs.readFileSync(blobPath) : null;
  }

  /**
   * Save a session
   */
  saveSession(session: Session): void {
    const sessionPath = path.join(this.sessionsDir, `${session.id}.json`);
    
    const serialized = {
      ...session,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      conversation: session.conversation.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    };
    
    fs.writeFileSync(sessionPath, JSON.stringify(serialized, null, 2));
    
    this.index.set(session.id, {
      projectPath: session.projectPath,
      createdAt: session.createdAt.toISOString(),
      description: session.trigger.description,
    });
    this.saveIndex();

    // Update project stats
    const project = this.registerProject(session.projectPath);
    project.lastSessionAt = session.createdAt;
    project.sessionCount++;
    project.totalSize += session.stats.totalSize;
    this.saveProjects();

    // Save conversation to full history
    if (session.conversation.length > 0) {
      this.saveConversation(session.projectPath, session.conversation);
    }
  }

  /**
   * Load a session
   */
  loadSession(id: string): Session | null {
    const sessionPath = path.join(this.sessionsDir, `${id}.json`);
    if (!fs.existsSync(sessionPath)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      return {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        conversation: data.conversation.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })),
      };
    } catch {
      return null;
    }
  }

  /**
   * List sessions for a project
   */
  listSessions(projectPath?: string): Array<{ id: string; projectPath: string; createdAt: Date; description: string }> {
    const sessions: Array<{ id: string; projectPath: string; createdAt: Date; description: string }> = [];
    
    for (const [id, meta] of this.index) {
      if (!projectPath || meta.projectPath === projectPath) {
        sessions.push({
          id,
          projectPath: meta.projectPath,
          createdAt: new Date(meta.createdAt),
          description: meta.description,
        });
      }
    }
    
    return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get storage stats
   */
  getStats(): { sessions: number; blobs: number; totalSize: number; projects: number } {
    let blobs = 0;
    let totalSize = 0;
    
    const walkBlobs = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkBlobs(full);
        else {
          blobs++;
          totalSize += fs.statSync(full).size;
        }
      }
    };
    walkBlobs(this.blobsDir);
    
    return {
      sessions: this.index.size,
      blobs,
      totalSize,
      projects: this.projects.size,
    };
  }

  /**
   * Start HTTP server for remote access
   */
  startServer(port = 4444): void {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(port, () => {
      console.log(`\nAITimeMachine Server running on http://localhost:${port}\n`);
    });
  }

  stopServer(): void {
    this.server?.close();
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://localhost`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // GET /sessions - List all sessions
      if (url.pathname === '/sessions' && req.method === 'GET') {
        const projectPath = url.searchParams.get('project') || undefined;
        res.end(JSON.stringify(this.listSessions(projectPath)));
        return;
      }

      // GET /sessions/:id - Get session
      if (url.pathname.startsWith('/sessions/') && req.method === 'GET') {
        const id = url.pathname.split('/')[2];
        const session = this.loadSession(id);
        if (!session) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.end(JSON.stringify(session));
        return;
      }

      // POST /sessions - Create session
      if (url.pathname === '/sessions' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          const session = JSON.parse(body);
          session.createdAt = new Date(session.createdAt);
          session.updatedAt = new Date(session.updatedAt);
          session.conversation = session.conversation.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
          this.saveSession(session);
          res.end(JSON.stringify({ id: session.id }));
        });
        return;
      }

      // GET /blobs/:hash - Get blob
      if (url.pathname.startsWith('/blobs/') && req.method === 'GET') {
        const hash = url.pathname.split('/')[2];
        const blob = this.getBlob(hash);
        if (!blob) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(blob);
        return;
      }

      // PUT /blobs/:hash - Store blob
      if (url.pathname.startsWith('/blobs/') && req.method === 'PUT') {
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
          const content = Buffer.concat(chunks);
          const hash = this.storeBlob(content);
          res.end(JSON.stringify({ hash }));
        });
        return;
      }

      // GET /stats - Get stats
      if (url.pathname === '/stats' && req.method === 'GET') {
        res.end(JSON.stringify(this.getStats()));
        return;
      }

      // GET /projects - List all projects
      if (url.pathname === '/projects' && req.method === 'GET') {
        res.end(JSON.stringify(this.getProjects()));
        return;
      }

      // GET /conversations - Search conversations
      if (url.pathname === '/conversations' && req.method === 'GET') {
        const query = url.searchParams.get('q');
        const projectPath = url.searchParams.get('project');
        
        if (query) {
          res.end(JSON.stringify(this.searchConversations(query)));
        } else if (projectPath) {
          res.end(JSON.stringify(this.loadConversation(projectPath)));
        } else {
          res.end(JSON.stringify([]));
        }
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }
}
