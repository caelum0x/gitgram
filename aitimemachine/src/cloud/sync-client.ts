/**
 * Cloud Sync Client
 *
 * Client for syncing data between local AITimeMachine and the cloud API.
 * Used by MCP server and CLI to push/pull data.
 */

import crypto from "crypto";

type JsonRecord = Record<string, unknown>;
type JsonList = JsonRecord[];

export interface CloudProject extends JsonRecord {
  id: string;
  name: string;
  rootPath?: string;
  updatedAt?: string;
}

export interface CloudCheckpoint extends JsonRecord {
  id: string;
  name: string;
  createdAt: string;
  scope?: string;
}

export interface CloudMessage extends JsonRecord {
  role?: string;
  timestamp: string;
  content: string;
}

export interface CloudBlobPayload extends JsonRecord {
  content: string;
  mimeType?: string;
}

export interface SemanticSearchItem extends JsonRecord {
  name?: string;
  similarity?: number;
  description?: string;
  project_id?: string;
  scope?: string;
  trigger_type?: string;
  created_at?: string;
}

export interface KnowledgeBaseFileItem extends JsonRecord {
  file_path?: string;
  language?: string;
  repository_id?: string;
  snippet?: string;
}

export interface KnowledgeBaseArtifactItem extends JsonRecord {
  id?: string;
  type?: string;
  format?: string;
  storage?: string;
  stats?: unknown;
}

export interface KnowledgeBaseEmbeddingItem extends JsonRecord {
  id?: string;
  symbol?: string;
  symbol_type?: string;
  file_path?: string;
  repository_id?: string;
  snippet?: string;
}

export interface UnifiedKnowledgeBaseSearchResponse extends JsonRecord {
  files: KnowledgeBaseFileItem[];
  artifacts: KnowledgeBaseArtifactItem[];
  embeddings: KnowledgeBaseEmbeddingItem[];
}

export interface SemanticSearchResponse extends JsonRecord {
  data?: {
    results?: SemanticSearchItem[];
    model?: string;
  };
  results?: SemanticSearchItem[];
  model?: string;
}

export interface CloudSyncConfig {
  apiUrl: string;
  apiKey: string;
}

export interface SyncProject {
  id: string;
  name: string;
  rootPath?: string;
}

export interface SyncCheckpoint {
  id: string;
  projectId: string;
  parentId?: string;
  name: string;
  description?: string;
  scope?: string;
  manifestHash: string;
  triggerType?: string;
  linkedCheckpointId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncBlob {
  hash: string;
  size: number;
  mimeType?: string;
  content: string; // Base64 encoded
}

export interface SyncSession {
  id: string;
  projectId: string;
  tool: string;
  startedAt?: string;
  endedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncMessage {
  id?: string;
  sessionId: string;
  projectId: string;
  checkpointId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  contentHash?: string;
  isContextInjection?: boolean;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncToolCall {
  id?: string;
  messageId?: string;
  sessionId: string;
  projectId: string;
  checkpointBeforeId?: string;
  checkpointAfterId?: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  result?: Record<string, unknown>;
  success?: boolean;
  error?: string;
  timestamp?: string;
}

export interface SyncTerminalEvent {
  id?: string;
  sessionId?: string;
  projectId: string;
  eventType: string;
  command?: string;
  exitCode?: number;
  stdoutHash?: string;
  stderrHash?: string;
  stderrPreview?: string;
  cwd?: string;
  durationMs?: number;
  timestamp?: string;
}

export interface SyncEvent {
  projectId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

export class CloudSyncClient {
  private config: CloudSyncConfig;

  constructor(config: CloudSyncConfig) {
    this.config = config;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": this.config.apiKey,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Unknown error" })) as { error?: string; message?: string };
      throw new Error(`API error ${response.status}: ${errorBody.error || errorBody.message || "Unknown error"}`);
    }

    return response.json() as Promise<T>;
  }

  // ============================================
  // SYNC OPERATIONS (Push to cloud)
  // ============================================

  async syncProject(project: SyncProject): Promise<{ success: boolean; projectId: string }> {
    return this.request("POST", "/api/sync/projects", project);
  }

  // ============================================
  // KNOWLEDGE BASE (Read-only)
  // ============================================

  async listKnowledgeBaseRepositories(): Promise<JsonRecord> {
    return this.request("GET", "/v1/knowledge-base/repositories");
  }

  async searchKnowledgeBase(query: string, options: { repositoryId?: string; limit?: number } = {}): Promise<JsonRecord> {
    const params = new URLSearchParams();
    params.set("query", query);
    if (options.repositoryId) params.set("repositoryId", options.repositoryId);
    if (options.limit) params.set("limit", String(options.limit));
    return this.request("GET", `/v1/knowledge-base/search?${params.toString()}`);
  }

  async getKnowledgeBaseFile(repositoryId: string, filePath: string): Promise<JsonRecord> {
    const params = new URLSearchParams();
    params.set("path", filePath);
    return this.request("GET", `/v1/knowledge-base/repositories/${repositoryId}/file?${params.toString()}`);
  }

  async listKnowledgeBaseArtifacts(type?: string): Promise<JsonRecord> {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    return this.request("GET", `/v1/knowledge-base/artifacts?${params.toString()}`);
  }

  async getKnowledgeBaseArtifact(id: string): Promise<JsonRecord> {
    return this.request("GET", `/v1/knowledge-base/artifacts/${id}`);
  }

  async unifiedKnowledgeBaseSearch(
    query: string,
    options: { repositoryId?: string; projectId?: string; limit?: number } = {}
  ): Promise<UnifiedKnowledgeBaseSearchResponse> {
    const params = new URLSearchParams();
    params.set("query", query);
    if (options.repositoryId) params.set("repository_id", options.repositoryId);
    if (options.projectId) params.set("project_id", options.projectId);
    if (options.limit) params.set("limit", String(options.limit));
    return this.request("GET", `/v1/knowledge-base/unified-search?${params.toString()}`);
  }

  async syncCheckpoint(checkpoint: SyncCheckpoint): Promise<{ success: boolean; checkpointId: string }> {
    return this.request("POST", "/api/sync/checkpoints", checkpoint);
  }

  async syncCheckpointsBatch(checkpoints: SyncCheckpoint[]): Promise<{ success: boolean; synced: number; total: number }> {
    return this.request("POST", "/api/sync/checkpoints/batch", { checkpoints });
  }

  async syncBlob(blob: SyncBlob): Promise<{ success: boolean; exists: boolean; hash: string }> {
    return this.request("POST", "/api/sync/blobs", blob);
  }

  async checkBlobsExist(hashes: string[]): Promise<{ existing: string[]; missing: string[] }> {
    return this.request("POST", "/api/sync/blobs/check", { hashes });
  }

  async syncSession(session: SyncSession): Promise<{ success: boolean; sessionId: string }> {
    return this.request("POST", "/api/sync/sessions", session);
  }

  async syncMessage(message: SyncMessage): Promise<{ success: boolean; messageId: string }> {
    return this.request("POST", "/api/sync/messages", message);
  }

  async syncMessagesBatch(messages: SyncMessage[]): Promise<{ success: boolean; synced: number; total: number }> {
    return this.request("POST", "/api/sync/messages/batch", { messages });
  }

  async syncToolCall(toolCall: SyncToolCall): Promise<{ success: boolean; toolCallId: string }> {
    return this.request("POST", "/api/sync/tool-calls", toolCall);
  }

  async syncTerminalEvent(event: SyncTerminalEvent): Promise<{ success: boolean; eventId: string }> {
    return this.request("POST", "/api/sync/terminal-events", event);
  }

  async syncEvent(event: SyncEvent): Promise<{ success: boolean; eventId: string }> {
    return this.request("POST", "/api/sync/events", event);
  }

  // ============================================
  // RESTORE OPERATIONS (Pull from cloud)
  // ============================================

  async getProjects(): Promise<{ projects: CloudProject[] }> {
    return this.request("GET", "/api/restore/projects");
  }

  async getProject(projectId: string): Promise<{ project: CloudProject }> {
    return this.request("GET", `/api/restore/projects/${projectId}`);
  }

  async getCheckpoints(projectId: string, opts?: { limit?: number; offset?: number }): Promise<{ checkpoints: CloudCheckpoint[]; project: CloudProject }> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.offset) params.set("offset", String(opts.offset));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request("GET", `/api/restore/projects/${projectId}/checkpoints${query}`);
  }

  async getCheckpoint(projectId: string, checkpointId: string): Promise<{ checkpoint: CloudCheckpoint }> {
    return this.request("GET", `/api/restore/projects/${projectId}/checkpoints/${checkpointId}`);
  }

  async getCheckpointManifest(projectId: string, checkpointId: string): Promise<{ checkpoint: CloudCheckpoint; manifest: string }> {
    return this.request("GET", `/api/restore/projects/${projectId}/checkpoints/${checkpointId}/manifest`);
  }

  async getCheckpointFull(projectId: string, checkpointId: string, opts?: { includeMessages?: boolean; messageLimit?: number }): Promise<{
    checkpoint: CloudCheckpoint;
    manifest: string | null;
    messages: CloudMessage[];
    terminalEvents: JsonList;
  }> {
    const params = new URLSearchParams();
    if (opts?.includeMessages !== undefined) params.set("includeMessages", String(opts.includeMessages));
    if (opts?.messageLimit) params.set("messageLimit", String(opts.messageLimit));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request("GET", `/api/restore/projects/${projectId}/checkpoints/${checkpointId}/full${query}`);
  }

  async getLastGreenCheckpoint(projectId: string): Promise<{ checkpoint: CloudCheckpoint }> {
    return this.request("GET", `/api/restore/projects/${projectId}/checkpoints/last-green`);
  }

  async getBlob(hash: string): Promise<{ blob: CloudBlobPayload }> {
    return this.request("GET", `/api/restore/blobs/${hash}`);
  }

  async getBlobsBatch(hashes: string[]): Promise<{ blobs: CloudBlobPayload[] }> {
    return this.request("POST", "/api/restore/blobs/batch", { hashes });
  }

  async getSessions(projectId: string, opts?: { limit?: number }): Promise<{ sessions: JsonList }> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request("GET", `/api/restore/projects/${projectId}/sessions${query}`);
  }

  async getSessionMessages(projectId: string, sessionId: string, opts?: { limit?: number }): Promise<{ messages: JsonList }> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request("GET", `/api/restore/projects/${projectId}/sessions/${sessionId}/messages${query}`);
  }

  async getProjectMessages(projectId: string, opts?: { limit?: number }): Promise<{ messages: CloudMessage[] }> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request("GET", `/api/restore/projects/${projectId}/messages${query}`);
  }

  async getToolCalls(projectId: string, opts?: { limit?: number; sessionId?: string }): Promise<{ toolCalls: JsonList }> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.sessionId) params.set("sessionId", opts.sessionId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request("GET", `/api/restore/projects/${projectId}/tool-calls${query}`);
  }

  async getTerminalEvents(projectId: string, opts?: { limit?: number }): Promise<{ events: JsonList }> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request("GET", `/api/restore/projects/${projectId}/terminal-events${query}`);
  }

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Sync a file's content as a blob.
   * Returns the hash of the blob.
   */
  async syncFileContent(content: Buffer, mimeType?: string): Promise<string> {
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const base64Content = content.toString("base64");

    await this.syncBlob({
      hash,
      size: content.length,
      mimeType,
      content: base64Content,
    });

    return hash;
  }

  /**
   * Check if connected and authenticated.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request("GET", "/health");
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // SEMANTIC SEARCH
  // ============================================

  async semanticSearch(query: string, options: { projectId?: string; maxResults?: number } = {}): Promise<SemanticSearchResponse> {
    return this.request("POST", "/v1/search/semantic", {
      query,
      project_id: options.projectId,
      max_results: options.maxResults || 10,
    });
  }

  async embedCheckpoints(projectId?: string): Promise<JsonRecord> {
    return this.request("POST", "/v1/search/checkpoints/embed", {
      project_id: projectId,
    });
  }
}

/**
 * Create a cloud sync client from environment variables or config.
 */
export function createCloudSyncClient(opts?: {
  apiUrl?: string;
  apiKey?: string;
}): CloudSyncClient | null {
  const apiUrl = opts?.apiUrl || process.env.AITM_API_URL;
  const apiKey = opts?.apiKey || process.env.AITM_API_KEY;

  if (!apiUrl || !apiKey) {
    return null;
  }

  return new CloudSyncClient({ apiUrl, apiKey });
}
