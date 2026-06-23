/**
 * Checkpoint Sync Service
 *
 * Syncs checkpoints and their data to the cloud API.
 * Used by the MCP server after checkpoint creation.
 */

import { CloudSyncClient, createCloudSyncClient } from "./sync-client.js";
import type { CasStore } from "../core/cas.js";
import type { Repo } from "../store/repo.js";
import type { FileEntry } from "../core/manifest.js";

export interface CheckpointSyncResult {
  synced: boolean;
  checkpointId: string;
  blobsSynced: number;
  error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sync a checkpoint and its associated data to the cloud.
 */
export async function syncCheckpointToCloud(opts: {
  projectId: string;
  projectName: string;
  projectRootPath?: string;
  checkpointId: string;
  checkpointName: string;
  checkpointDescription?: string;
  scope: string;
  manifestHash: string;
  manifestContent: Buffer;
  manifestFiles: FileEntry[];
  cas: CasStore;
  triggerType?: string;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}): Promise<CheckpointSyncResult> {
  const client = createCloudSyncClient();
  if (!client) {
    return {
      synced: false,
      checkpointId: opts.checkpointId,
      blobsSynced: 0,
      error: "Cloud sync not configured (missing AITM_API_URL or AITM_API_KEY)",
    };
  }

  try {
    // 1. Sync project first
    await client.syncProject({
      id: opts.projectId,
      name: opts.projectName,
      rootPath: opts.projectRootPath,
    });

    // 2. Check which blobs need to be synced
    const allHashes = [opts.manifestHash, ...opts.manifestFiles.map((f) => f.hash)];
    const { missing } = await client.checkBlobsExist(allHashes);

    // 3. Sync missing blobs
    let blobsSynced = 0;
    for (const hash of missing) {
      try {
        // Check if it's the manifest
        if (hash === opts.manifestHash) {
          await client.syncBlob({
            hash,
            size: opts.manifestContent.length,
            mimeType: "application/json",
            content: opts.manifestContent.toString("base64"),
          });
        } else {
          // It's a file blob
          const content = opts.cas.getBytes(hash);
          await client.syncBlob({
            hash,
            size: content.length,
            mimeType: "application/octet-stream",
            content: content.toString("base64"),
          });
        }
        blobsSynced++;
      } catch (e) {
        console.error(`[CloudSync] Failed to sync blob ${hash}:`, e);
      }
    }

    // 4. Sync the checkpoint
    await client.syncCheckpoint({
      id: opts.checkpointId,
      projectId: opts.projectId,
      name: opts.checkpointName,
      description: opts.checkpointDescription,
      scope: opts.scope,
      manifestHash: opts.manifestHash,
      triggerType: opts.triggerType,
      createdAt: opts.createdAt?.toISOString(),
      metadata: opts.metadata,
    });

    return {
      synced: true,
      checkpointId: opts.checkpointId,
      blobsSynced,
    };
  } catch (error: unknown) {
    return {
      synced: false,
      checkpointId: opts.checkpointId,
      blobsSynced: 0,
      error: errorMessage(error),
    };
  }
}

/**
 * Sync a chat message to the cloud.
 */
export async function syncMessageToCloud(opts: {
  projectId: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  checkpointId?: string;
  isContextInjection?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const client = createCloudSyncClient();
  if (!client) return false;

  try {
    await client.syncMessage({
      projectId: opts.projectId,
      sessionId: opts.sessionId,
      role: opts.role,
      content: opts.content,
      checkpointId: opts.checkpointId,
      isContextInjection: opts.isContextInjection,
      timestamp: new Date().toISOString(),
      metadata: opts.metadata,
    });
    return true;
  } catch (error) {
    console.error("[CloudSync] Failed to sync message:", error);
    return false;
  }
}

/**
 * Start a chat session and sync to cloud.
 */
export async function startCloudSession(opts: {
  projectId: string;
  sessionId: string;
  tool: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const client = createCloudSyncClient();
  if (!client) return false;

  try {
    await client.syncSession({
      id: opts.sessionId,
      projectId: opts.projectId,
      tool: opts.tool,
      startedAt: new Date().toISOString(),
      metadata: opts.metadata,
    });
    return true;
  } catch (error) {
    console.error("[CloudSync] Failed to start session:", error);
    return false;
  }
}

/**
 * Sync a terminal event to cloud.
 */
export async function syncTerminalEventToCloud(opts: {
  projectId: string;
  sessionId?: string;
  eventType: string;
  command?: string;
  exitCode?: number;
  stdoutHash?: string;
  stderrHash?: string;
  stderrPreview?: string;
  cwd?: string;
  durationMs?: number;
}): Promise<boolean> {
  const client = createCloudSyncClient();
  if (!client) return false;

  try {
    await client.syncTerminalEvent({
      projectId: opts.projectId,
      sessionId: opts.sessionId,
      eventType: opts.eventType,
      command: opts.command,
      exitCode: opts.exitCode,
      stdoutHash: opts.stdoutHash,
      stderrHash: opts.stderrHash,
      stderrPreview: opts.stderrPreview,
      cwd: opts.cwd,
      durationMs: opts.durationMs,
      timestamp: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error("[CloudSync] Failed to sync terminal event:", error);
    return false;
  }
}

/**
 * Sync tool call to cloud.
 */
export async function syncToolCallToCloud(opts: {
  projectId: string;
  sessionId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  result?: Record<string, unknown>;
  success?: boolean;
  error?: string;
  checkpointBeforeId?: string;
  checkpointAfterId?: string;
}): Promise<boolean> {
  const client = createCloudSyncClient();
  if (!client) return false;

  try {
    await client.syncToolCall({
      projectId: opts.projectId,
      sessionId: opts.sessionId,
      toolName: opts.toolName,
      arguments: opts.arguments,
      result: opts.result,
      success: opts.success,
      error: opts.error,
      checkpointBeforeId: opts.checkpointBeforeId,
      checkpointAfterId: opts.checkpointAfterId,
      timestamp: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error("[CloudSync] Failed to sync tool call:", error);
    return false;
  }
}

/**
 * Check if cloud sync is available and configured.
 */
export function isCloudSyncEnabled(): boolean {
  return createCloudSyncClient() !== null;
}

/**
 * Get cloud sync status.
 */
export async function getCloudSyncStatus(): Promise<{
  enabled: boolean;
  connected: boolean;
  apiUrl: string | null;
}> {
  const apiUrl = process.env.AITM_API_URL || null;
  const client = createCloudSyncClient();

  if (!client) {
    return { enabled: false, connected: false, apiUrl };
  }

  const connected = await client.healthCheck();
  return { enabled: true, connected, apiUrl };
}
