import * as fs from 'fs';
import * as path from 'path';
import { SessionServer, Session, SessionMessage } from './session-server.js';
import { SessionCapture } from './session-capture.js';

/**
 * Session Daemon - Background service that captures sessions automatically
 */
export class SessionDaemon {
  private server: SessionServer;
  private captures: Map<string, SessionCapture> = new Map();
  private conversations: Map<string, SessionMessage[]> = new Map();
  private lastSessions: Map<string, Session> = new Map();
  private watchers: Map<string, fs.FSWatcher[]> = new Map();
  private pendingCaptures: Map<string, { timeout: NodeJS.Timeout; description: string; trigger: Session['trigger'] }> = new Map();
  private debounceMs = 3000;
  private shuttingDown = false;
  private stopResolver: (() => void) | null = null;

  constructor(dataDir?: string) {
    this.server = new SessionServer(dataDir);
  }

  /**
   * Run daemon for a single project and keep process alive
   */
  async run(projectPath: string, options?: { recovery?: boolean }): Promise<void> {
    this.watchProject(projectPath);
    if (options?.recovery) {
      this.captureRecovery(projectPath);
    }
    await new Promise<void>((resolve) => {
      this.stopResolver = resolve;
    });
  }

  /**
   * Start watching a project
   */
  watchProject(projectPath: string): void {
    const resolved = path.resolve(projectPath);
    
    if (this.captures.has(resolved)) {
      console.log(`Already watching ${resolved}`);
      return;
    }

    const capture = new SessionCapture(resolved);
    this.captures.set(resolved, capture);
    this.conversations.set(resolved, []);

    // Create initial session
    const { session, blobs } = capture.capture(
      'Session started',
      { type: 'auto', description: 'Session started' }
    );
    
    for (const [hash, content] of blobs) {
      this.server.storeBlob(content);
    }
    this.server.saveSession(session);
    this.lastSessions.set(resolved, session);

    // Start file watching
    this.startFileWatcher(resolved);
    
    console.log(`Watching ${resolved} (${session.stats.totalFiles} files)`);
  }

  /**
   * Force a recovery capture for a watched project
   */
  captureRecovery(projectPath: string): Session | null {
    const resolved = path.resolve(projectPath);
    return this.captureNow(resolved, 'Recovery capture', { type: 'manual', description: 'Recovery capture' });
  }

  /**
   * Stop watching a project
   */
  unwatchProject(projectPath: string): void {
    const resolved = path.resolve(projectPath);
    
    const watchers = this.watchers.get(resolved);
    if (watchers) {
      for (const w of watchers) w.close();
      this.watchers.delete(resolved);
    }
    
    this.captures.delete(resolved);
    this.conversations.delete(resolved);
    
    const pending = this.pendingCaptures.get(resolved);
    if (pending) clearTimeout(pending.timeout);
    this.pendingCaptures.delete(resolved);
    
    console.log(`Stopped watching ${resolved}`);
  }

  /**
   * Log a conversation message
   */
  logMessage(projectPath: string, role: 'user' | 'assistant' | 'system', content: string, tool?: string): void {
    const resolved = path.resolve(projectPath);
    const conv = this.conversations.get(resolved);
    if (!conv) return;

    conv.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(),
      role,
      content,
      tool,
    });

    // Trigger capture after conversation
    this.scheduleCapture(resolved, `Conversation: ${content.slice(0, 50)}...`);
  }

  /**
   * Manual checkpoint
   */
  checkpoint(projectPath: string, description: string): Session | null {
    const resolved = path.resolve(projectPath);
    return this.captureNow(resolved, description, { type: 'manual', description });
  }

  /**
   * Capture before AI action
   */
  beforeAction(projectPath: string, action: string, tool?: string): Session | null {
    const resolved = path.resolve(projectPath);
    return this.captureNow(resolved, `Before: ${action}`, {
      type: 'ai_action',
      tool,
      action,
      description: `Before: ${action}`,
    });
  }

  /**
   * Capture after AI action
   */
  afterAction(projectPath: string, action: string, tool?: string): void {
    const resolved = path.resolve(projectPath);
    this.scheduleCapture(resolved, `After: ${action}`, {
      type: 'ai_action',
      tool,
      action,
      description: `After: ${action}`,
    });
  }

  /**
   * Get sessions for a project
   */
  getSessions(projectPath?: string): ReturnType<SessionServer['listSessions']> {
    return this.server.listSessions(projectPath ? path.resolve(projectPath) : undefined);
  }

  /**
   * Get a specific session
   */
  getSession(id: string): Session | null {
    return this.server.loadSession(id);
  }

  /**
   * Get file content from a session
   */
  getFileContent(sessionId: string, filePath: string): Buffer | null {
    const session = this.server.loadSession(sessionId);
    if (!session) return null;

    const file = session.files.find(f => f.path === filePath);
    if (!file) return null;

    return this.server.getBlob(file.hash);
  }

  /**
   * Restore to a session
   */
  restore(sessionId: string): { filesRestored: number; filesDeleted: number; filesMissing: number } {
    const session = this.server.loadSession(sessionId);
    if (!session) throw new Error('Session not found');

    const projectPath = session.projectPath;
    
    // Create backup session first
    this.captureNow(projectPath, `Before restore to ${session.trigger.description}`, {
      type: 'restore',
      description: `Before restore to ${session.trigger.description}`,
    });

    // Get current files
    const currentFiles = new Set<string>();
    const walkDir = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === '.aitimemachine' || entry.name === 'node_modules' || entry.name === '.git') continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walkDir(full);
          else currentFiles.add(path.relative(projectPath, full));
        }
      } catch {}
    };
    walkDir(projectPath);

    const sessionFiles = new Set(session.files.map(f => f.path));
    let filesRestored = 0;
    let filesDeleted = 0;
    let filesMissing = 0;

    // Delete files not in session
    for (const filePath of currentFiles) {
      if (!sessionFiles.has(filePath)) {
        const fullPath = path.join(projectPath, filePath);
        try {
          fs.unlinkSync(fullPath);
          filesDeleted++;
        } catch {}
      }
    }

    // Restore files from session
    for (const file of session.files) {
      const content = this.server.getBlob(file.hash);
      if (!content) {
        filesMissing++;
        continue;
      }

      const fullPath = path.join(projectPath, file.path);
      const dir = path.dirname(fullPath);
      
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, content);
      try { fs.chmodSync(fullPath, file.mode); } catch {}
      filesRestored++;
    }

    // Update last session
    this.lastSessions.set(projectPath, session);

    if (filesMissing > 0) {
      console.warn(`[!] ${filesMissing} files missing content during restore`);
    }

    return { filesRestored, filesDeleted, filesMissing };
  }

  /**
   * Start HTTP server
   */
  startServer(port = 4444): void {
    this.server.startServer(port);
  }

  /**
   * Get stats
   */
  getStats(): ReturnType<SessionServer['getStats']> & { watchedProjects: number } {
    return {
      ...this.server.getStats(),
      watchedProjects: this.captures.size,
    };
  }

  private startFileWatcher(projectPath: string): void {
    // Use polling instead of fs.watch to avoid blocking
    const checkInterval = 2000; // 2 seconds
    const fileHashes = new Map<string, { mtime: number; size: number }>();
    
    const scanForChanges = () => {
      let hasChanges = false;
      const currentFiles = new Set<string>();
      
      const walkDir = (dir: string) => {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['node_modules', '.git', '.aitimemachine', 'dist', 'build', '.next'].includes(entry.name)) continue;
            
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkDir(full);
            } else {
              const rel = path.relative(projectPath, full);
              currentFiles.add(rel);
              
              try {
                const stat = fs.statSync(full);
                const prev = fileHashes.get(rel);
                
                if (!prev || prev.mtime !== stat.mtimeMs || prev.size !== stat.size) {
                  fileHashes.set(rel, { mtime: stat.mtimeMs, size: stat.size });
                  if (prev) hasChanges = true; // Only trigger if not first scan
                }
              } catch {}
            }
          }
        } catch {}
      };
      
      walkDir(projectPath);
      
      // Check for deleted files
      for (const [rel] of fileHashes) {
        if (!currentFiles.has(rel)) {
          fileHashes.delete(rel);
          hasChanges = true;
        }
      }
      
      if (hasChanges) {
        this.scheduleCapture(projectPath, 'File changes detected');
      }
    };
    
    // Initial scan
    scanForChanges();
    
    // Periodic check
    const interval = setInterval(scanForChanges, checkInterval);
    this.watchers.set(projectPath, [{ close: () => clearInterval(interval) } as any]);
  }

  private scheduleCapture(projectPath: string, description: string, trigger?: Session['trigger']): void {
    const existing = this.pendingCaptures.get(projectPath);
    if (existing) clearTimeout(existing.timeout);

    const effectiveTrigger = trigger || { type: 'auto', description };
    const timeout = setTimeout(() => {
      this.captureNow(projectPath, description, effectiveTrigger);
      this.pendingCaptures.delete(projectPath);
    }, this.debounceMs);

    this.pendingCaptures.set(projectPath, { timeout, description, trigger: effectiveTrigger });
  }

  private captureNow(projectPath: string, description: string, trigger: Session['trigger']): Session | null {
    const capture = this.captures.get(projectPath);
    if (!capture) return null;

    const conversation = this.conversations.get(projectPath) || [];
    const previousSession = this.lastSessions.get(projectPath);

    const { session, blobs } = capture.capture(description, trigger, previousSession, [...conversation]);

    // Only save if there are changes
    if (session.diffs.length === 0 && conversation.length === (previousSession?.conversation.length || 0)) {
      return null;
    }

    for (const [hash, content] of blobs) {
      this.server.storeBlob(content);
    }
    this.server.saveSession(session);
    this.lastSessions.set(projectPath, session);

    console.log(`[+] Session: ${session.id.slice(0, 20)} - ${description}`);
    return session;
  }

  /**
   * Flush pending captures and stop watchers
   */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    for (const [projectPath, pending] of this.pendingCaptures) {
      clearTimeout(pending.timeout);
      this.captureNow(projectPath, pending.description, pending.trigger);
    }
    this.pendingCaptures.clear();

    for (const projectPath of this.captures.keys()) {
      this.captureNow(projectPath, 'Shutdown flush', { type: 'auto', description: 'Shutdown flush' });
    }

    for (const [projectPath, watchers] of this.watchers) {
      for (const watcher of watchers) watcher.close();
      this.watchers.delete(projectPath);
    }

    this.captures.clear();
    this.conversations.clear();
    this.lastSessions.clear();

    if (this.stopResolver) {
      this.stopResolver();
      this.stopResolver = null;
    }
  }
}
