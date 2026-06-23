/**
 * Secure Sync Client - calls API server instead of direct DB access
 * This keeps DATABASE_URL on server-side only
 *
 * Used by: CLI, MCP daemon
 * Never connects directly to Neon - always goes through API
 */

import { TimePoint } from '../core/types.js';

type SyncResponse = { ok: boolean; error?: string; message?: string };
type SyncStatusResponse = { ok: boolean; data?: { synced: number; pending: number; configured: boolean } };

/** Minimal shape returned by the remote list-checkpoints endpoint. */
export interface RemoteCheckpointSummary {
  id: string;
  description: string;
  timestamp: string;
  stats?: { totalFiles?: number; totalSize?: number };
}

type ListCheckpointsResponse = {
  ok: boolean;
  data?: RemoteCheckpointSummary[];
  error?: string;
};

type PullCheckpointResponse = {
  ok: boolean;
  checkpoint?: TimePoint;
  error?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class SecureSyncClient {
  private apiUrl: string;
  private apiKey: string | null = null;

  constructor(apiUrl: string = 'http://localhost:3001') {
    this.apiUrl = apiUrl;
    this.loadCredentials();
  }

  private loadCredentials() {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const credPath = path.join(os.homedir(), '.aitimemachine', 'credentials.json');
      if (fs.existsSync(credPath)) {
        const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8')) as { apiKey?: unknown };
        this.apiKey = typeof creds.apiKey === "string" ? creds.apiKey : null;
      }
    } catch {}
  }

  private async request(endpoint: string, data: unknown): Promise<unknown> {
    if (!this.apiKey) return { ok: false, error: 'Not authenticated' };

    try {
      const response = await fetch(`${this.apiUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(data),
      });
      return response.json();
    } catch (error: unknown) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /**
   * Sync a checkpoint to cloud (via API server)
   */
  async syncCheckpoint(projectId: string, checkpoint: TimePoint): Promise<{ ok: boolean; error?: string; message?: string }> {
    return this.request('/api/sync/checkpoint', { projectId, checkpoint }) as Promise<SyncResponse>;
  }

  /**
   * Sync blob metadata to cloud (content stays local)
   */
  async syncBlob(hash: string, size: number, language?: string): Promise<{ ok: boolean; error?: string }> {
    return this.request('/api/sync/blob', { hash, size, language }) as Promise<SyncResponse>;
  }

  /**
   * Sync a chat message to cloud (from AI tools like Cursor, Claude Code)
   */
  async syncMessage(projectId: string, message: {
    sessionId: string;
    role: string;
    content: string;
    tool?: string;
    checkpointId?: string;
    timestamp: string;
  }): Promise<{ ok: boolean; error?: string }> {
    return this.request('/api/sync/message', { projectId, message }) as Promise<SyncResponse>;
  }

  /**
   * Sync a tool call to cloud (AI tool actions)
   */
  async syncToolCall(projectId: string, toolCall: {
    toolName: string;
    arguments: Record<string, unknown>;
    result?: unknown;
    success: boolean;
    checkpointBeforeId?: string;
    checkpointAfterId?: string;
    timestamp: string;
  }): Promise<{ ok: boolean; error?: string }> {
    return this.request('/api/sync/tool-call', { projectId, toolCall }) as Promise<SyncResponse>;
  }

  /**
   * Get sync status
   */
  async getSyncStatus(projectId: string): Promise<{ synced: number; pending: number; configured: boolean }> {
    const result = await this.request('/api/sync/status', { projectId }) as SyncStatusResponse;
    return result.ok && result.data ? result.data : { synced: 0, pending: 0, configured: false };
  }

  /**
   * List checkpoints available on the remote server for a project.
   * Throws if the server returns an error or is not reachable.
   */
  async listRemoteCheckpoints(projectId: string): Promise<RemoteCheckpointSummary[]> {
    const result = await this.request('/api/sync/checkpoints', { projectId }) as ListCheckpointsResponse;
    if (!result.ok) {
      throw new Error(result.error ?? 'Failed to list remote checkpoints');
    }
    return result.data ?? [];
  }

  /**
   * Pull a single checkpoint by id from the remote server and return it.
   * The caller is responsible for persisting the checkpoint locally.
   * Throws if the checkpoint is not found or the server returns an error.
   */
  async pullCheckpoint(projectId: string, checkpointId: string): Promise<TimePoint> {
    const result = await this.request('/api/sync/checkpoint/pull', { projectId, checkpointId }) as PullCheckpointResponse;
    if (!result.ok || !result.checkpoint) {
      throw new Error(result.error ?? `Checkpoint not found on remote: ${checkpointId}`);
    }
    return result.checkpoint;
  }
}
