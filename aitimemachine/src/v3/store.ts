import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DATA_DIR = process.env.TM_DATA_DIR ?? path.join(process.env.HOME || '', '.aitimemachine-v3');
const DB_PATH = path.join(DATA_DIR, 'events.db');
const BLOBS_DIR = path.join(DATA_DIR, 'blobs');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BLOBS_DIR, { recursive: true });

const db: DatabaseType = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

type DbEventRow = {
  event_id: string;
  project_id: string;
  ts: string;
  type: string;
  payload_json: string;
};

type DbManifestHashRow = {
  manifest_blob_hash: string;
};

// Initialize schema
db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_root_path ON projects(root_path);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_event_id TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id)
);
CREATE INDEX IF NOT EXISTS idx_events_project_ts ON events(project_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_project_type ON events(project_id, type);

CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manifests (
  manifest_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  manifest_blob_hash TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(project_id)
);
CREATE INDEX IF NOT EXISTS idx_manifests_project_created ON manifests(project_id, created_at);

CREATE TABLE IF NOT EXISTS checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  manifest_id TEXT NOT NULL,
  chat_head_event_id TEXT,
  terminal_head_event_id TEXT,
  capsule_image_ref TEXT,
  capsule_image_digest TEXT,
  capsule_workdir TEXT,
  capsule_env_json TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id),
  FOREIGN KEY(manifest_id) REFERENCES manifests(manifest_id)
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_project_created ON checkpoints(project_id, created_at);

CREATE TABLE IF NOT EXISTS terminal_sessions (
  session_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  label TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id)
);
`);

export interface Project {
  project_id: string;
  name: string;
  root_path: string;
  created_at: string;
}

export interface Event {
  event_id: string;
  project_id: string;
  ts: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface Checkpoint {
  checkpoint_id: string;
  project_id: string;
  name: string;
  created_at: string;
  scope: string;
  manifest_id: string;
  chat_head_event_id?: string;
  terminal_head_event_id?: string;
  capsule_image_ref?: string;
  capsule_image_digest?: string;
}

export interface ManifestFile {
  path: string;
  hash: string;
  size: number;
  mode: number;
  mtimeMs: number;
}

export interface Manifest {
  version: number;
  rootPath: string;
  capturedAt: string;
  files: ManifestFile[];
  ignore: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function uuid(): string {
  return crypto.randomUUID();
}

// Blob operations
export function putBlob(data: Buffer, mimeType = 'application/octet-stream'): string {
  const hash = sha256(data);
  const sub = path.join(BLOBS_DIR, hash.slice(0, 2), hash.slice(2, 4));
  const filePath = path.join(sub, hash);
  
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(filePath, data);
  }
  
  db.prepare(`INSERT OR IGNORE INTO blobs(hash, size_bytes, mime_type, created_at) VALUES(?,?,?,?)`)
    .run(hash, data.length, mimeType, nowIso());
  
  return hash;
}

export function getBlob(hash: string): Buffer | null {
  const filePath = path.join(BLOBS_DIR, hash.slice(0, 2), hash.slice(2, 4), hash);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

// Project operations
export function createProject(projectId: string, name: string, rootPath: string): Project {
  const created_at = nowIso();
  db.prepare(`INSERT OR REPLACE INTO projects(project_id, name, root_path, created_at) VALUES(?,?,?,?)`)
    .run(projectId, name, rootPath, created_at);
  return { project_id: projectId, name, root_path: rootPath, created_at };
}

export function getProject(projectId: string): Project | null {
  return db.prepare(`SELECT * FROM projects WHERE project_id = ?`).get(projectId) as Project | null;
}

export function listProjects(): Project[] {
  return db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all() as Project[];
}

// Event operations
export function appendEvent(projectId: string, type: string, payload: Record<string, unknown>, blobs?: Array<{ mimeType: string; data: Buffer }>): string {
  const eventId = uuid();
  const ts = nowIso();
  
  const blobRefs: string[] = [];
  if (blobs) {
    for (const b of blobs) {
      blobRefs.push(putBlob(b.data, b.mimeType));
    }
  }
  
  const fullPayload = blobRefs.length > 0 ? { ...payload, blobRefs } : payload;
  
  db.prepare(`INSERT INTO events(event_id, project_id, ts, type, payload_json) VALUES(?,?,?,?,?)`)
    .run(eventId, projectId, ts, type, JSON.stringify(fullPayload));
  
  return eventId;
}

export function getEvents(projectId: string, options?: { type?: string; from?: string; to?: string; limit?: number }): Event[] {
  let sql = `SELECT * FROM events WHERE project_id = ?`;
  const params: Array<string | number> = [projectId];
  
  if (options?.type) {
    sql += ` AND type = ?`;
    params.push(options.type);
  }
  if (options?.from) {
    sql += ` AND ts >= ?`;
    params.push(options.from);
  }
  if (options?.to) {
    sql += ` AND ts <= ?`;
    params.push(options.to);
  }
  
  sql += ` ORDER BY ts ASC`;
  
  if (options?.limit) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
  }
  
  return (db.prepare(sql).all(...params) as DbEventRow[]).map((row) => ({
    event_id: row.event_id,
    project_id: row.project_id,
    ts: row.ts,
    type: row.type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  }));
}

export function getLatestEvent(projectId: string, type?: string): Event | null {
  let sql = `SELECT * FROM events WHERE project_id = ?`;
  const params: Array<string | number> = [projectId];
  
  if (type) {
    sql += ` AND type = ?`;
    params.push(type);
  }
  
  sql += ` ORDER BY ts DESC LIMIT 1`;
  
  const row = db.prepare(sql).get(...params) as DbEventRow | undefined;
  if (!row) return null;
  
  return {
    event_id: row.event_id,
    project_id: row.project_id,
    ts: row.ts,
    type: row.type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  };
}

// Manifest operations
export function createManifest(projectId: string, rootPath: string, files: ManifestFile[], ignore: string[]): string {
  const manifestId = uuid();
  const manifest: Manifest = {
    version: 1,
    rootPath,
    capturedAt: nowIso(),
    files,
    ignore,
  };
  
  const manifestBlob = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
  const manifestHash = putBlob(manifestBlob, 'application/json');
  
  db.prepare(`INSERT INTO manifests(manifest_id, project_id, root_path, created_at, manifest_blob_hash) VALUES(?,?,?,?,?)`)
    .run(manifestId, projectId, rootPath, nowIso(), manifestHash);
  
  return manifestId;
}

export function getManifest(manifestId: string): Manifest | null {
  const row = db.prepare(`SELECT manifest_blob_hash FROM manifests WHERE manifest_id = ?`).get(manifestId) as DbManifestHashRow | undefined;
  if (!row) return null;
  
  const blob = getBlob(row.manifest_blob_hash);
  if (!blob) return null;
  
  return JSON.parse(blob.toString('utf-8'));
}

// Checkpoint operations
export function createCheckpoint(
  projectId: string,
  name: string,
  scope: 'files' | 'files+chat' | 'files+chat+terminal' | 'full',
  manifestId: string,
  options?: {
    chatHeadEventId?: string;
    terminalHeadEventId?: string;
    capsuleImageRef?: string;
    capsuleImageDigest?: string;
    capsuleWorkdir?: string;
    capsuleEnv?: Record<string, string>;
  }
): string {
  const checkpointId = uuid();
  
  db.prepare(`
    INSERT INTO checkpoints(
      checkpoint_id, project_id, name, created_at, scope, manifest_id,
      chat_head_event_id, terminal_head_event_id,
      capsule_image_ref, capsule_image_digest, capsule_workdir, capsule_env_json
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    checkpointId, projectId, name, nowIso(), scope, manifestId,
    options?.chatHeadEventId ?? null,
    options?.terminalHeadEventId ?? null,
    options?.capsuleImageRef ?? null,
    options?.capsuleImageDigest ?? null,
    options?.capsuleWorkdir ?? null,
    options?.capsuleEnv ? JSON.stringify(options.capsuleEnv) : null
  );
  
  // Emit checkpoint event
  appendEvent(projectId, 'checkpoint.created', { checkpointId, name, scope, manifestId });
  
  return checkpointId;
}

export function getCheckpoint(checkpointId: string): Checkpoint | null {
  return db.prepare(`SELECT * FROM checkpoints WHERE checkpoint_id = ?`).get(checkpointId) as Checkpoint | null;
}

export function listCheckpoints(projectId: string, limit = 100): Checkpoint[] {
  return db.prepare(`SELECT * FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(projectId, limit) as Checkpoint[];
}

export { db, DATA_DIR, BLOBS_DIR };
