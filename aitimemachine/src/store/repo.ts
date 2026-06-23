import type Database from "better-sqlite3";

export type Project = {
  projectId: string;
  rootPath: string;
  name: string;
  ignoreGlobs: string[];
};

export type CheckpointRow = {
  checkpointId: string;
  projectId: string;
  name: string;
  createdAt: string;
  scope: string;

  manifestBlobHash: string;
  rootTreeHash?: string | null;

  chatHeadEventId?: string | null;
  terminalHeadEventId?: string | null;

  capsuleImageRef?: string | null;
  capsuleImageDigest?: string | null;
  capsuleWorkdir?: string | null;
  capsuleEnvJson?: string | null;

  linkedCheckpointId?: string | null;
};

export type TreeEntryRow = {
  name: string;
  type: 'blob' | 'tree';
  hash: string;
  mode: number;
  size: number;
};

export type TreeRow = {
  id: string;
  projectId: string;
  hash: string;
  parentPath: string;
  entries: TreeEntryRow[];
  createdAt: string;
};

export type EventRow = {
  id?: string;
  eventId: string;
  projectId: string;
  type: string;
  timestamp: string;
  createdAt?: string;
  payload: Record<string, unknown>;
};

// You can back this by sqlite. For wiring demo, just define interface.
export interface Repo {
  /** Access the underlying database (for shared modules like CodeIndexer) */
  getDatabase?(): Database.Database;
  getProject(projectId: string): Project | null;
  insertProject(project: Project): void;
  listProjects(): Project[];

  // store the manifest blob hash + pointers
  insertCheckpoint(input: Omit<CheckpointRow, "createdAt">): CheckpointRow;

  getCheckpoint(projectId: string, checkpointId: string): CheckpointRow | null;

  listCheckpointsNewestFirst(projectId: string, limit: number): CheckpointRow[];

  // search
  searchCheckpoints(projectId: string, query: string): CheckpointRow[];

  // head pointers (optional)
  getChatHeadEventId(projectId: string): string | null;
  getTerminalHeadEventId(projectId: string): string | null;

  // save terminal event (optional)
  appendEvent(projectId: string, type: string, tsIso: string, payload: unknown): { eventId: string };

  // list events
  listEvents(projectId: string, type?: string, limit?: number): EventRow[];

  // tree operations
  insertTree?(tree: Omit<TreeRow, "id" | "createdAt">): TreeRow;
  getTreeByHash?(projectId: string, hash: string): TreeRow | null;
  getTreeAtPath?(projectId: string, rootTreeHash: string, targetPath: string): TreeRow | null;

  // stats
  getStats(): { projects: number; checkpoints: number; events: number };
}
