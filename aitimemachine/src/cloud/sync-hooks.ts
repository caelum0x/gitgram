/**
 * Cloud Sync Hooks
 *
 * Hooks that automatically sync data to the cloud when local events occur.
 * Can be enabled/disabled via configuration.
 */

import { CloudSyncClient, createCloudSyncClient } from "./sync-client.js";
import type { Repo } from "../store/repo.js";
import type { CasStore } from "../core/cas.js";

export interface SyncHooksConfig {
  enabled: boolean;
  apiUrl?: string;
  apiKey?: string;
  syncCheckpoints?: boolean;
  syncMessages?: boolean;
  syncTerminalEvents?: boolean;
  syncToolCalls?: boolean;
}

export class CloudSyncHooks {
  private client: CloudSyncClient | null = null;
  private config: SyncHooksConfig;
  private projectId: string;
  private sessionId: string | null = null;

  constructor(projectId: string, config: SyncHooksConfig) {
    this.projectId = projectId;
    this.config = config;

    if (config.enabled) {
      this.client = createCloudSyncClient({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
      });
    }
  }

  isEnabled(): boolean {
    return this.config.enabled && this.client !== null;
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Sync project metadata to cloud.
   */
  async syncProject(name: string, rootPath?: string): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await this.client!.syncProject({
        id: this.projectId,
        name,
        rootPath,
      });
    } catch (error) {
      console.error("[CloudSync] Failed to sync project:", error);
    }
  }

  /**
   * Sync a checkpoint and its manifest to cloud.
   */
  async syncCheckpoint(
    checkpoint: {
      id: string;
      parentId?: string;
      name: string;
      description?: string;
      scope?: string;
      manifestHash: string;
      triggerType?: string;
      linkedCheckpointId?: string;
      createdAt?: Date;
      metadata?: Record<string, unknown>;
    },
    manifestContent: Buffer
  ): Promise<void> {
    if (!this.isEnabled() || this.config.syncCheckpoints === false) return;

    try {
      // First sync the manifest blob
      const manifestBase64 = manifestContent.toString("base64");
      await this.client!.syncBlob({
        hash: checkpoint.manifestHash,
        size: manifestContent.length,
        mimeType: "application/json",
        content: manifestBase64,
      });

      // Then sync the checkpoint
      await this.client!.syncCheckpoint({
        id: checkpoint.id,
        projectId: this.projectId,
        parentId: checkpoint.parentId,
        name: checkpoint.name,
        description: checkpoint.description,
        scope: checkpoint.scope,
        manifestHash: checkpoint.manifestHash,
        triggerType: checkpoint.triggerType,
        linkedCheckpointId: checkpoint.linkedCheckpointId,
        createdAt: checkpoint.createdAt?.toISOString(),
        metadata: checkpoint.metadata,
      });
    } catch (error) {
      console.error("[CloudSync] Failed to sync checkpoint:", error);
    }
  }

  /**
   * Sync file blobs that are part of a checkpoint.
   */
  async syncBlobs(blobs: Array<{ hash: string; content: Buffer; mimeType?: string }>): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      // Check which blobs already exist
      const hashes = blobs.map((b) => b.hash);
      const { missing } = await this.client!.checkBlobsExist(hashes);

      // Only upload missing blobs
      for (const blob of blobs) {
        if (missing.includes(blob.hash)) {
          await this.client!.syncBlob({
            hash: blob.hash,
            size: blob.content.length,
            mimeType: blob.mimeType,
            content: blob.content.toString("base64"),
          });
        }
      }
    } catch (error) {
      console.error("[CloudSync] Failed to sync blobs:", error);
    }
  }

  /**
   * Start a new chat session and sync it.
   */
  async startSession(sessionId: string, tool: string, metadata?: Record<string, unknown>): Promise<void> {
    this.sessionId = sessionId;
    if (!this.isEnabled()) return;

    try {
      await this.client!.syncSession({
        id: sessionId,
        projectId: this.projectId,
        tool,
        startedAt: new Date().toISOString(),
        metadata,
      });
    } catch (error) {
      console.error("[CloudSync] Failed to sync session:", error);
    }
  }

  /**
   * End a chat session.
   */
  async endSession(): Promise<void> {
    if (!this.isEnabled() || !this.sessionId) return;

    try {
      await this.client!.syncSession({
        id: this.sessionId,
        projectId: this.projectId,
        tool: "unknown", // Will be updated if already exists
        endedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[CloudSync] Failed to end session:", error);
    }
  }

  /**
   * Sync a chat message.
   */
  async syncMessage(message: {
    role: "user" | "assistant" | "system";
    content: string;
    checkpointId?: string;
    isContextInjection?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.isEnabled() || this.config.syncMessages === false) return;
    if (!this.sessionId) {
      console.error("[CloudSync] Cannot sync message without session");
      return;
    }

    try {
      await this.client!.syncMessage({
        sessionId: this.sessionId,
        projectId: this.projectId,
        checkpointId: message.checkpointId,
        role: message.role,
        content: message.content,
        isContextInjection: message.isContextInjection,
        timestamp: new Date().toISOString(),
        metadata: message.metadata,
      });
    } catch (error) {
      console.error("[CloudSync] Failed to sync message:", error);
    }
  }

  /**
   * Sync a tool call.
   */
  async syncToolCall(toolCall: {
    toolName: string;
    arguments?: Record<string, unknown>;
    result?: Record<string, unknown>;
    success?: boolean;
    error?: string;
    checkpointBeforeId?: string;
    checkpointAfterId?: string;
  }): Promise<void> {
    if (!this.isEnabled() || this.config.syncToolCalls === false) return;
    if (!this.sessionId) return;

    try {
      await this.client!.syncToolCall({
        sessionId: this.sessionId,
        projectId: this.projectId,
        toolName: toolCall.toolName,
        arguments: toolCall.arguments,
        result: toolCall.result,
        success: toolCall.success,
        error: toolCall.error,
        checkpointBeforeId: toolCall.checkpointBeforeId,
        checkpointAfterId: toolCall.checkpointAfterId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[CloudSync] Failed to sync tool call:", error);
    }
  }

  /**
   * Sync a terminal event.
   */
  async syncTerminalEvent(event: {
    eventType: string;
    command?: string;
    exitCode?: number;
    stdoutHash?: string;
    stderrHash?: string;
    stderrPreview?: string;
    cwd?: string;
    durationMs?: number;
  }): Promise<void> {
    if (!this.isEnabled() || this.config.syncTerminalEvents === false) return;

    try {
      await this.client!.syncTerminalEvent({
        sessionId: this.sessionId || undefined,
        projectId: this.projectId,
        eventType: event.eventType,
        command: event.command,
        exitCode: event.exitCode,
        stdoutHash: event.stdoutHash,
        stderrHash: event.stderrHash,
        stderrPreview: event.stderrPreview,
        cwd: event.cwd,
        durationMs: event.durationMs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[CloudSync] Failed to sync terminal event:", error);
    }
  }

  /**
   * Sync a generic event.
   */
  async syncEvent(eventType: string, payload?: Record<string, unknown>): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await this.client!.syncEvent({
        projectId: this.projectId,
        eventType,
        payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[CloudSync] Failed to sync event:", error);
    }
  }
}

/**
 * Create sync hooks from environment variables.
 */
export function createSyncHooks(projectId: string): CloudSyncHooks {
  const enabled = process.env.AITM_CLOUD_SYNC === "true";
  const apiUrl = process.env.AITM_API_URL;
  const apiKey = process.env.AITM_API_KEY;

  return new CloudSyncHooks(projectId, {
    enabled: enabled && !!apiUrl && !!apiKey,
    apiUrl,
    apiKey,
    syncCheckpoints: true,
    syncMessages: true,
    syncTerminalEvents: true,
    syncToolCalls: true,
  });
}
