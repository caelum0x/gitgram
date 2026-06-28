import axios from 'axios';

// ---- Types ----

export interface AitmProject {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  checkpointCount?: number;
}

export interface AitmCheckpoint {
  id: string;
  projectId: string;
  label?: string;
  message?: string;
  createdAt: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface AitmFileDiff {
  filePath: string;
  changeType: 'added' | 'removed' | 'modified';
  linesAdded: number;
  linesRemoved: number;
  patch?: string; // unified diff for the file (first N lines)
}

export interface AitmDiffResult {
  fromCheckpointId: string;
  toCheckpointId: string;
  summary: {
    added: number;
    removed: number;
    modified: number;
    totalFilesChanged: number;
    totalLinesAdded: number;
    totalLinesRemoved: number;
  };
  files: AitmFileDiff[];
}

export interface AitmConversationContext {
  checkpointId: string;
  messages: { role: string; content: string }[];
  summary?: string;
}

// ---- Same-origin proxy client ----
//
// The AITM bearer token is stored server-side in an httpOnly cookie and is
// never exposed to client JavaScript. All AITM read calls go through the
// Next.js route handlers under /api/aitm/*, which attach the token on the
// server. `withCredentials` ensures the httpOnly cookie is sent.

const proxy = axios.create({
  baseURL: '/api/aitm',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 20000,
});

// ---- Credential management (server-side) ----

/**
 * Persist an AITM API key server-side after validation. The key is sent once
 * to the proxy, which validates it and stores it in an httpOnly cookie.
 * Returns true if the key was accepted and stored.
 */
export async function connectAitm(apiKey: string): Promise<boolean> {
  try {
    const { data } = await proxy.post<{ connected: boolean }>('/credential', { apiKey });
    return !!data.connected;
  } catch {
    return false;
  }
}

/** Remove the stored AITM credential (clears the httpOnly cookie). */
export async function disconnectAitm(): Promise<void> {
  try {
    await proxy.delete('/credential');
  } catch {
    // Ignore — disconnect is best-effort.
  }
}

/** Report whether an AITM credential is currently connected. */
export async function isAitmConnected(): Promise<boolean> {
  try {
    const { data } = await proxy.get<{ connected: boolean }>('/credential');
    return !!data.connected;
  } catch {
    return false;
  }
}

// ---- API ----

export const aitmService = {
  /** List all AITM projects accessible by the connected credential. */
  async getProjects(): Promise<AitmProject[]> {
    const { data } = await proxy.get('/projects');
    return data.projects || data || [];
  },

  /** List checkpoints for a given AITM project. */
  async getCheckpoints(projectId: string): Promise<AitmCheckpoint[]> {
    const { data } = await proxy.get(`/projects/${encodeURIComponent(projectId)}/checkpoints`);
    return data.checkpoints || data || [];
  },

  /** Get the diff between two checkpoints. */
  async getDiff(
    projectId: string,
    fromCheckpointId: string,
    toCheckpointId: string
  ): Promise<AitmDiffResult> {
    const { data } = await proxy.get('/diff', {
      params: { projectId, fromCheckpointId, toCheckpointId },
    });
    // Normalize AITM response to our interface
    return {
      fromCheckpointId,
      toCheckpointId,
      summary: data.summary || {
        added: 0,
        removed: 0,
        modified: 0,
        totalFilesChanged: data.fileCount || 0,
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
      files: (data.files || []).map(
        (f: { filePath: string; stats?: { added?: number; removed?: number }; diffContent?: string }) => ({
          filePath: f.filePath,
          changeType:
            (f.stats?.added ?? 0) > 0 && (f.stats?.removed ?? 0) === 0
              ? 'added'
              : (f.stats?.removed ?? 0) > 0 && (f.stats?.added ?? 0) === 0
                ? 'removed'
                : 'modified',
          linesAdded: f.stats?.added || 0,
          linesRemoved: f.stats?.removed || 0,
          patch: f.diffContent,
        })
      ),
    };
  },

  /** Get the conversation context for a checkpoint. */
  async getContext(checkpointId: string): Promise<AitmConversationContext> {
    const { data } = await proxy.get(`/context/${encodeURIComponent(checkpointId)}`);
    return data;
  },

  /**
   * Validate and store an API key. Returns true if the key works and was
   * persisted server-side.
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    return connectAitm(apiKey);
  },
};

export default aitmService;
