import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SessionServer } from './server/index.js';

interface SyncConfig {
  endpoint: string;
  apiKey: string;
  projectId?: string;
}

interface SyncState {
  lastSync: string;
  syncedSessions: string[];
  syncedBlobs: string[];
}

/**
 * Cloud Sync - Sync sessions to remote server or S3
 */
export class CloudSync {
  private server: SessionServer;
  private configPath: string;
  private statePath: string;

  constructor() {
    this.server = new SessionServer();
    const dataDir = path.join(process.env.HOME || '', '.aitimemachine-server');
    this.configPath = path.join(dataDir, 'sync-config.json');
    this.statePath = path.join(dataDir, 'sync-state.json');
  }

  /**
   * Configure sync endpoint
   */
  configure(endpoint: string, apiKey: string, projectId?: string) {
    const config: SyncConfig = { endpoint, apiKey, projectId };
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Get sync config
   */
  getConfig(): SyncConfig | null {
    if (!fs.existsSync(this.configPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Get sync state
   */
  private getState(): SyncState {
    if (!fs.existsSync(this.statePath)) {
      return { lastSync: '', syncedSessions: [], syncedBlobs: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
    } catch {
      return { lastSync: '', syncedSessions: [], syncedBlobs: [] };
    }
  }

  /**
   * Save sync state
   */
  private saveState(state: SyncState) {
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Push local sessions to remote
   */
  async push(): Promise<{ sessions: number; blobs: number; errors: string[] }> {
    const config = this.getConfig();
    if (!config) throw new Error('Sync not configured. Run: aitm sync-config <endpoint> <apiKey>');

    const state = this.getState();
    const errors: string[] = [];
    let sessionsPushed = 0;
    let blobsPushed = 0;

    // Get all local sessions
    const sessions = this.server.listSessions();
    const newSessions = sessions.filter(s => !state.syncedSessions.includes(s.id));

    for (const sessionMeta of newSessions) {
      const session = this.server.loadSession(sessionMeta.id);
      if (!session) continue;

      try {
        // Push blobs first
        for (const file of session.files) {
          if (state.syncedBlobs.includes(file.hash)) continue;
          
          const blob = this.server.getBlob(file.hash);
          if (!blob) continue;

          const res = await fetch(`${config.endpoint}/api/blobs`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              content: blob.toString('base64'),
              encoding: 'base64',
            }),
          });

          if (res.ok) {
            state.syncedBlobs.push(file.hash);
            blobsPushed++;
          }
        }

        // Push session
        const res = await fetch(`${config.endpoint}/api/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(session),
        });

        if (res.ok) {
          state.syncedSessions.push(session.id);
          sessionsPushed++;
        } else {
          errors.push(`Failed to push session ${session.id}: ${res.status}`);
        }
      } catch (err) {
        errors.push(`Error pushing session ${session.id}: ${(err as Error).message}`);
      }
    }

    state.lastSync = new Date().toISOString();
    this.saveState(state);

    return { sessions: sessionsPushed, blobs: blobsPushed, errors };
  }

  /**
   * Pull remote sessions to local
   */
  async pull(): Promise<{ sessions: number; blobs: number; errors: string[] }> {
    const config = this.getConfig();
    if (!config) throw new Error('Sync not configured');

    const state = this.getState();
    const errors: string[] = [];
    let sessionsPulled = 0;
    let blobsPulled = 0;

    try {
      // Get remote sessions
      const res = await fetch(`${config.endpoint}/api/sessions`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      });

      if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);

      const remoteSessions = await res.json() as Array<{ id: string }>;
      const localSessionIds = new Set(this.server.listSessions().map(s => s.id));

      for (const remote of remoteSessions) {
        if (localSessionIds.has(remote.id)) continue;

        // Fetch full session
        const sessionRes = await fetch(`${config.endpoint}/api/sessions/${remote.id}`, {
          headers: { 'Authorization': `Bearer ${config.apiKey}` },
        });

        if (!sessionRes.ok) continue;

        const session = await sessionRes.json() as any;

        // Fetch blobs
        for (const file of session.files || []) {
          if (this.server.getBlob(file.hash)) continue;

          const blobRes = await fetch(`${config.endpoint}/api/blobs/${file.hash}`, {
            headers: { 'Authorization': `Bearer ${config.apiKey}` },
          });

          if (blobRes.ok) {
            const blobData = await blobRes.json() as any;
            const content = Buffer.from(blobData.content, blobData.encoding || 'base64');
            this.server.storeBlob(content);
            blobsPulled++;
          }
        }

        // Save session
        session.createdAt = new Date(session.createdAt);
        session.updatedAt = new Date(session.updatedAt);
        session.conversation = (session.conversation || []).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        this.server.saveSession(session as any);
        sessionsPulled++;
      }
    } catch (err) {
      errors.push(`Pull error: ${(err as Error).message}`);
    }

    state.lastSync = new Date().toISOString();
    this.saveState(state);

    return { sessions: sessionsPulled, blobs: blobsPulled, errors };
  }

  /**
   * Full sync (push + pull)
   */
  async sync(): Promise<{ pushed: { sessions: number; blobs: number }; pulled: { sessions: number; blobs: number }; errors: string[] }> {
    const pushResult = await this.push();
    const pullResult = await this.pull();

    return {
      pushed: { sessions: pushResult.sessions, blobs: pushResult.blobs },
      pulled: { sessions: pullResult.sessions, blobs: pullResult.blobs },
      errors: [...pushResult.errors, ...pullResult.errors],
    };
  }

  /**
   * Get sync status
   */
  getStatus(): { configured: boolean; lastSync: string | null; syncedSessions: number; syncedBlobs: number } {
    const config = this.getConfig();
    const state = this.getState();

    return {
      configured: !!config,
      lastSync: state.lastSync || null,
      syncedSessions: state.syncedSessions.length,
      syncedBlobs: state.syncedBlobs.length,
    };
  }
}
