import axios, { AxiosInstance } from 'axios';

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

// ---- Local storage helpers ----

const AITM_KEY_STORAGE = 'gitgram_aitm_key';

/** Simple XOR-based obfuscation for localStorage. Not true encryption, but prevents casual reading. */
function obfuscate(value: string): string {
  const key = 'gitgram-aitm-obfuscation-key';
  let result = '';
  for (let i = 0; i < value.length; i++) {
    result += String.fromCharCode(value.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(result);
}

function deobfuscate(encoded: string): string {
  const key = 'gitgram-aitm-obfuscation-key';
  const decoded = atob(encoded);
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

export function saveAitmApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AITM_KEY_STORAGE, obfuscate(apiKey));
}

export function loadAitmApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(AITM_KEY_STORAGE);
  if (!stored) return null;
  try {
    return deobfuscate(stored);
  } catch {
    return null;
  }
}

export function clearAitmApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AITM_KEY_STORAGE);
}

// ---- API Client ----

const AITM_BASE_URL = process.env.NEXT_PUBLIC_AITM_API_URL || 'https://timemachine-api.gitgram.app/v1';

function createAitmClient(apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: AITM_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 15000,
  });
}

export const aitmService = {
  /**
   * List all AITM projects accessible by this API key.
   */
  async getProjects(apiKey: string): Promise<AitmProject[]> {
    const client = createAitmClient(apiKey);
    const { data } = await client.get('/restore/projects');
    return data.projects || data || [];
  },

  /**
   * List checkpoints for a given AITM project.
   */
  async getCheckpoints(apiKey: string, projectId: string): Promise<AitmCheckpoint[]> {
    const client = createAitmClient(apiKey);
    const { data } = await client.get(`/restore/projects/${projectId}/checkpoints`);
    return data.checkpoints || data || [];
  },

  /**
   * Get the diff between two checkpoints.
   */
  async getDiff(
    apiKey: string,
    projectId: string,
    fromCheckpointId: string,
    toCheckpointId: string
  ): Promise<AitmDiffResult> {
    const client = createAitmClient(apiKey);
    const { data } = await client.get('/time/diff', {
      params: { projectId, fromCheckpointId, toCheckpointId },
    });
    // Normalize AITM response to our interface
    return {
      fromCheckpointId,
      toCheckpointId,
      summary: data.summary || { added: 0, removed: 0, modified: 0, totalFilesChanged: data.fileCount || 0, totalLinesAdded: 0, totalLinesRemoved: 0 },
      files: (data.files || []).map((f: { filePath: string; stats?: { added?: number; removed?: number }; diffContent?: string }) => ({
        filePath: f.filePath,
        changeType: (f.stats?.added ?? 0) > 0 && (f.stats?.removed ?? 0) === 0 ? 'added' : (f.stats?.removed ?? 0) > 0 && (f.stats?.added ?? 0) === 0 ? 'removed' : 'modified',
        linesAdded: f.stats?.added || 0,
        linesRemoved: f.stats?.removed || 0,
        patch: f.diffContent,
      })),
    };
  },

  /**
   * Get the conversation context for a checkpoint.
   */
  async getContext(apiKey: string, checkpointId: string): Promise<AitmConversationContext> {
    const client = createAitmClient(apiKey);
    const { data } = await client.get(`/context/${checkpointId}`);
    return data;
  },

  /**
   * Validate that an API key is functional by listing projects.
   * Returns true if the key works, false otherwise.
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      await this.getProjects(apiKey);
      return true;
    } catch {
      return false;
    }
  },
};

export default aitmService;
