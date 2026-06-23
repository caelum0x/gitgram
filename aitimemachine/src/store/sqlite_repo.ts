import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { Repo, Project, CheckpointRow, TreeRow, EventRow } from "./repo.js";
import { runMigrations } from "./migrations.js";

type SqlParam = string | number | null;
type SqlParams = SqlParam[];

type DbProjectRow = {
  project_id: string;
  root_path: string;
  name: string;
  ignore_globs: string | null;
};

type DbCheckpointRow = {
  checkpoint_id: string;
  project_id: string;
  name: string;
  created_at: string;
  scope: string;
  manifest_blob_hash: string;
  root_tree_hash: string | null;
  chat_head_event_id: string | null;
  terminal_head_event_id: string | null;
  capsule_image_ref: string | null;
  capsule_image_digest: string | null;
  capsule_workdir: string | null;
  capsule_env_json: string | null;
  linked_checkpoint_id: string | null;
};

type DbEventRow = {
  event_id: string;
  project_id: string;
  type: string;
  timestamp: string;
  payload: string;
};

type DbTreeRow = {
  id: string;
  project_id: string;
  hash: string;
  parent_path: string;
  entries: string;
  created_at: string;
};

type DbCountRow = { count: number };

export class SqliteRepo implements Repo {
  private db: Database.Database;
  private userId?: string; // Current user context for multi-tenant queries

  /** Expose underlying database for shared access (e.g., CodeIndexer) */
  getDatabase(): Database.Database {
    return this.db;
  }

  constructor(dbPath: string, userId?: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
    runMigrations(this.db);
    this.userId = userId;
  }

  // Set user context for queries
  setUserId(userId: string | undefined): void {
    this.userId = userId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  private readScopeClause(tableAlias?: string): string {
    if (!this.userId) return "";
    const prefix = tableAlias ? `${tableAlias}.` : "";
    return ` AND (${prefix}user_id = ? OR ${prefix}user_id IS NULL)`;
  }

  private strictWriteScopeClause(tableAlias?: string): string {
    if (!this.userId) return "";
    const prefix = tableAlias ? `${tableAlias}.` : "";
    return ` AND ${prefix}user_id = ?`;
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL,
        name TEXT NOT NULL,
        ignore_globs TEXT, -- JSON array
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        checkpoint_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        scope TEXT NOT NULL,
        manifest_blob_hash TEXT NOT NULL,
        chat_head_event_id TEXT,
        terminal_head_event_id TEXT,
        capsule_image_ref TEXT,
        capsule_image_digest TEXT,
        capsule_workdir TEXT,
        capsule_env_json TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
      );

      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        payload TEXT NOT NULL, -- JSON
        FOREIGN KEY (project_id) REFERENCES projects(project_id)
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_project
        ON checkpoints(project_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_events_project
        ON events(project_id, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_events_type
        ON events(type, timestamp DESC);
    `);
  }

  private mapProjectRow(row: DbProjectRow): Project {
    return {
      projectId: row.project_id,
      rootPath: row.root_path,
      name: row.name,
      ignoreGlobs: row.ignore_globs ? (JSON.parse(row.ignore_globs) as string[]) : [],
    };
  }

  private mapCheckpointRow(row: DbCheckpointRow): CheckpointRow {
    return {
      checkpointId: row.checkpoint_id,
      projectId: row.project_id,
      name: row.name,
      createdAt: row.created_at,
      scope: row.scope,
      manifestBlobHash: row.manifest_blob_hash,
      rootTreeHash: row.root_tree_hash || null,
      chatHeadEventId: row.chat_head_event_id,
      terminalHeadEventId: row.terminal_head_event_id,
      capsuleImageRef: row.capsule_image_ref,
      capsuleImageDigest: row.capsule_image_digest,
      capsuleWorkdir: row.capsule_workdir,
      capsuleEnvJson: row.capsule_env_json,
      linkedCheckpointId: row.linked_checkpoint_id || null,
    };
  }

  private mapEventRow(row: DbEventRow): {
    eventId: string;
    projectId: string;
    type: string;
    timestamp: string;
    createdAt: string;
    payload: Record<string, unknown>;
  } {
    const parsed = JSON.parse(row.payload) as unknown;
    const payload = parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};

    return {
      eventId: row.event_id,
      projectId: row.project_id,
      type: row.type,
      timestamp: row.timestamp,
      createdAt: row.timestamp,
      payload,
    };
  }

  private mapTreeRow(row: DbTreeRow): TreeRow {
    return {
      id: row.id,
      projectId: row.project_id,
      hash: row.hash,
      parentPath: row.parent_path,
      entries: JSON.parse(row.entries),
      createdAt: row.created_at,
    };
  }

  // Project methods
  getProject(projectId: string): Project | null {
    let query = `
      SELECT project_id, root_path, name, ignore_globs
      FROM projects
      WHERE project_id = ?
    `;
    const params: SqlParams = [projectId];
    if (this.userId) {
      query += this.readScopeClause();
      params.push(this.userId);
    }
    const row = this.db.prepare(query).get(...params) as DbProjectRow | undefined;

    if (!row) return null;

    return this.mapProjectRow(row);
  }

  insertProject(project: Project): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO projects (project_id, root_path, name, ignore_globs, user_id, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      project.projectId,
      project.rootPath,
      project.name,
      JSON.stringify(project.ignoreGlobs || []),
      this.userId || null
    );
  }

  listProjects(): Project[] {
    const query = this.userId
      ? `SELECT project_id, root_path, name, ignore_globs FROM projects WHERE user_id = ? OR user_id IS NULL ORDER BY updated_at DESC`
      : `SELECT project_id, root_path, name, ignore_globs FROM projects ORDER BY updated_at DESC`;
    
    const rows = this.userId
      ? this.db.prepare(query).all(this.userId) as DbProjectRow[]
      : this.db.prepare(query).all() as DbProjectRow[];

    return rows.map((row) => this.mapProjectRow(row));
  }

  // Checkpoint methods
  insertCheckpoint(input: Omit<CheckpointRow, "createdAt">): CheckpointRow {
    const createdAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO checkpoints (
        checkpoint_id, project_id, name, created_at, scope,
        manifest_blob_hash, root_tree_hash, chat_head_event_id, terminal_head_event_id,
        capsule_image_ref, capsule_image_digest, capsule_workdir, capsule_env_json,
        user_id, linked_checkpoint_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.checkpointId,
      input.projectId,
      input.name,
      createdAt,
      input.scope,
      input.manifestBlobHash,
      input.rootTreeHash || null,
      input.chatHeadEventId || null,
      input.terminalHeadEventId || null,
      input.capsuleImageRef || null,
      input.capsuleImageDigest || null,
      input.capsuleWorkdir || null,
      input.capsuleEnvJson || null,
      this.userId || null,
      input.linkedCheckpointId || null
    );

    return {
      ...input,
      createdAt,
    };
  }

  getCheckpoint(projectId: string, checkpointId: string): CheckpointRow | null {
    let query = `
      SELECT * FROM checkpoints
      WHERE project_id = ? AND checkpoint_id = ?
    `;
    const params: SqlParams = [projectId, checkpointId];
    if (this.userId) {
      query += this.readScopeClause();
      params.push(this.userId);
    }
    const row = this.db.prepare(query).get(...params) as DbCheckpointRow | undefined;

    if (!row) return null;

    return this.mapCheckpointRow(row);
  }

  listCheckpointsNewestFirst(projectId: string, limit: number): CheckpointRow[] {
    const query = this.userId
      ? `SELECT * FROM checkpoints WHERE project_id = ? AND (user_id = ? OR user_id IS NULL) ORDER BY created_at DESC LIMIT ?`
      : `SELECT * FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`;
    
    const rows = this.userId
      ? this.db.prepare(query).all(projectId, this.userId, limit) as DbCheckpointRow[]
      : this.db.prepare(query).all(projectId, limit) as DbCheckpointRow[];

    return rows.map((row) => this.mapCheckpointRow(row));
  }

  listAllCheckpoints(projectId: string): CheckpointRow[] {
    return this.listCheckpointsNewestFirst(projectId, 10000);
  }

  deleteCheckpoint(checkpointId: string): void {
    if (this.userId) {
      this.db.prepare(`
        DELETE FROM checkpoints WHERE checkpoint_id = ?${this.strictWriteScopeClause()}
      `).run(checkpointId, this.userId);
      return;
    }

    this.db.prepare(`DELETE FROM checkpoints WHERE checkpoint_id = ?`).run(checkpointId);
  }

  // Event methods
  appendEvent(projectId: string, type: string, tsIso: string, payload: unknown): { eventId: string } {
    const eventId = `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    this.db.prepare(`
      INSERT INTO events (event_id, project_id, type, timestamp, payload, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      projectId,
      type,
      tsIso,
      JSON.stringify(payload),
      this.userId || null
    );

    return { eventId };
  }

  getEvent(eventId: string): {
    eventId: string;
    projectId: string;
    type: string;
    timestamp: string;
    createdAt: string;
    payload: unknown;
  } | null {
    let query = `SELECT * FROM events WHERE event_id = ?`;
    const params: SqlParams = [eventId];
    if (this.userId) {
      query += this.readScopeClause();
      params.push(this.userId);
    }

    const row = this.db.prepare(query).get(...params) as DbEventRow | undefined;

    if (!row) return null;

    return this.mapEventRow(row);
  }

  listEvents(projectId: string, type?: string, limit: number = 100): EventRow[] {
    let query = `
      SELECT * FROM events
      WHERE project_id = ?
    `;
    const params: SqlParams = [projectId];

    if (type) {
      query += ` AND type = ?`;
      params.push(type);
    }

    if (this.userId) {
      query += this.readScopeClause();
      params.push(this.userId);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as DbEventRow[];

    return rows.map((row) => this.mapEventRow(row));
  }

  // Head pointer methods
  getChatHeadEventId(projectId: string): string | null {
    const events = this.listEvents(projectId, "chat.message", 1);
    return events.length > 0 ? events[0].eventId : null;
  }

  getTerminalHeadEventId(projectId: string): string | null {
    const events = this.listEvents(projectId, "term.exit", 1);
    return events.length > 0 ? events[0].eventId : null;
  }

  // Search methods
  searchCheckpoints(projectId: string, query: string): CheckpointRow[] {
    let sql = `
      SELECT * FROM checkpoints
      WHERE project_id = ? AND name LIKE ?
      ORDER BY created_at DESC
      LIMIT 50
    `;
    const params: SqlParams = [projectId, `%${query}%`];
    if (this.userId) {
      sql = `
        SELECT * FROM checkpoints
        WHERE project_id = ? AND name LIKE ?${this.readScopeClause()}
        ORDER BY created_at DESC
        LIMIT 50
      `;
      params.push(this.userId);
    }
    const rows = this.db.prepare(sql).all(...params) as DbCheckpointRow[];

    return rows.map((row) => this.mapCheckpointRow(row));
  }

  // Tree methods
  insertTree(tree: Omit<TreeRow, "id" | "createdAt">): TreeRow {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // Check if tree already exists (content-addressed dedup)
    let existingQuery = `
      SELECT id, project_id, hash, parent_path, entries, created_at
      FROM trees
      WHERE project_id = ? AND hash = ?
    `;
    const existingParams: SqlParams = [tree.projectId, tree.hash];
    if (this.userId) {
      existingQuery += this.readScopeClause();
      existingParams.push(this.userId);
    }
    const existing = this.db.prepare(existingQuery).get(...existingParams) as DbTreeRow | undefined;

    if (existing) {
      return this.mapTreeRow(existing);
    }

    this.db.prepare(`
      INSERT INTO trees (id, project_id, hash, parent_path, entries, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tree.projectId,
      tree.hash,
      tree.parentPath,
      JSON.stringify(tree.entries),
      createdAt,
      this.userId || null
    );

    return {
      id,
      projectId: tree.projectId,
      hash: tree.hash,
      parentPath: tree.parentPath,
      entries: tree.entries,
      createdAt,
    };
  }

  getTreeByHash(projectId: string, hash: string): TreeRow | null {
    let query = `
      SELECT id, project_id, hash, parent_path, entries, created_at
      FROM trees
      WHERE project_id = ? AND hash = ?
    `;
    const params: SqlParams = [projectId, hash];
    if (this.userId) {
      query += this.readScopeClause();
      params.push(this.userId);
    }
    const row = this.db.prepare(query).get(...params) as DbTreeRow | undefined;

    if (!row) return null;

    return this.mapTreeRow(row);
  }

  getTreeAtPath(projectId: string, rootTreeHash: string, targetPath: string): TreeRow | null {
    const normalized = targetPath === "/" || targetPath === "" ? "/" : targetPath;

    // Get root tree
    const rootTree = this.getTreeByHash(projectId, rootTreeHash);
    if (!rootTree) return null;

    if (normalized === "/") {
      return rootTree;
    }

    // Walk path segments
    const cleanPath = normalized.replace(/^\//, "").replace(/\/$/, "");
    const segments = cleanPath.split("/");

    let currentTree = rootTree;
    for (const segment of segments) {
      const entry = currentTree.entries.find(
        (e) => e.name === segment && e.type === "tree"
      );
      if (!entry) return null;

      const nextTree = this.getTreeByHash(projectId, entry.hash);
      if (!nextTree) return null;

      currentTree = nextTree;
    }

    return currentTree;
  }

  // Stats
  getStats(): { projects: number; checkpoints: number; events: number } {
    const projects = this.userId
      ? this.db.prepare(`SELECT COUNT(*) as count FROM projects WHERE user_id = ? OR user_id IS NULL`).get(this.userId) as DbCountRow
      : this.db.prepare(`SELECT COUNT(*) as count FROM projects`).get() as DbCountRow;
    const checkpoints = this.userId
      ? this.db.prepare(`SELECT COUNT(*) as count FROM checkpoints WHERE user_id = ? OR user_id IS NULL`).get(this.userId) as DbCountRow
      : this.db.prepare(`SELECT COUNT(*) as count FROM checkpoints`).get() as DbCountRow;
    const events = this.userId
      ? this.db.prepare(`SELECT COUNT(*) as count FROM events WHERE user_id = ? OR user_id IS NULL`).get(this.userId) as DbCountRow
      : this.db.prepare(`SELECT COUNT(*) as count FROM events`).get() as DbCountRow;

    return {
      projects: projects.count,
      checkpoints: checkpoints.count,
      events: events.count,
    };
  }

  close() {
    this.db.close();
  }
}
