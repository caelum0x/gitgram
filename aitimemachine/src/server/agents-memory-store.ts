/**
 * Agents + Memory Store (bundled `aitm serve`)
 *
 * A single SQLite-backed store powering:
 *   - `aitm agents *`  (beads DAG task tracker)  -> tasks table
 *   - `aitm memory *`  (unified memory layer)    -> contexts table
 *
 * Lives at ~/.aitimemachine/server.sqlite so it persists across `aitm serve`
 * restarts. This is real persistence — no in-memory fakes — so the CLI command
 * groups have a working backend out of the box from the product's own server.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import crypto from 'crypto';

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'ready' | 'done';
  deps: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ContextEntry {
  id: string;
  projectId: string | null;
  name: string;
  description: string | null;
  tool: string | null;
  source: string;
  tags: string[];
  messages: Array<{ role: string; content: string; timestamp?: string }>;
  createdAt: string;
  updatedAt: string;
}

interface DbTaskRow {
  id: string;
  title: string;
  status: string;
  deps: string;
  created_at: string;
  updated_at: string;
}

interface DbContextRow {
  id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  tool: string | null;
  source: string;
  tags: string;
  messages: string;
  created_at: string;
  updated_at: string;
}

function genId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export class AgentsMemoryStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolved = dbPath ?? path.join(os.homedir(), '.aitimemachine', 'server.sqlite');
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        deps TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contexts (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        tool TEXT,
        source TEXT NOT NULL DEFAULT 'conversation',
        tags TEXT NOT NULL DEFAULT '[]',
        messages TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contexts_source ON contexts(source, created_at DESC);
    `);
  }

  // ── Tasks (beads) ───────────────────────────────────────────────────────────

  private mapTask(row: DbTaskRow): Task {
    return {
      id: row.id,
      title: row.title,
      status: (row.status as Task['status']) ?? 'pending',
      deps: JSON.parse(row.deps) as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listTasks(): Task[] {
    const rows = this.db
      .prepare(`SELECT * FROM tasks ORDER BY created_at ASC`)
      .all() as DbTaskRow[];
    return rows.map((r) => this.mapTask(r));
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as
      | DbTaskRow
      | undefined;
    return row ? this.mapTask(row) : null;
  }

  createTask(title: string, deps: string[] = []): Task {
    const now = new Date().toISOString();
    const id = genId('task');
    // A task with unmet dependencies starts pending; otherwise ready.
    const unmet = deps.some((d) => {
      const dep = this.getTask(d);
      return !dep || dep.status !== 'done';
    });
    const status: Task['status'] = deps.length === 0 || !unmet ? 'ready' : 'pending';
    this.db
      .prepare(
        `INSERT INTO tasks (id, title, status, deps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, title, status, JSON.stringify(deps), now, now);
    return this.getTask(id)!;
  }

  setTaskStatus(id: string, status: Task['status']): Task | null {
    const existing = this.getTask(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, id);

    // When a task is done, promote dependents whose deps are now all satisfied.
    if (status === 'done') {
      for (const t of this.listTasks()) {
        if (t.status === 'pending' && t.deps.includes(id)) {
          const allDone = t.deps.every((d) => this.getTask(d)?.status === 'done');
          if (allDone) {
            this.db
              .prepare(`UPDATE tasks SET status = 'ready', updated_at = ? WHERE id = ?`)
              .run(now, t.id);
          }
        }
      }
    }
    return this.getTask(id);
  }

  // ── Contexts (memory) ─────────────────────────────────────────────────────────

  private mapContext(row: DbContextRow): ContextEntry {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description,
      tool: row.tool,
      source: row.source,
      tags: JSON.parse(row.tags) as string[],
      messages: JSON.parse(row.messages) as ContextEntry['messages'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listContexts(opts: { source?: string; limit: number; offset?: number }): {
    data: ContextEntry[];
    hasMore: boolean;
  } {
    const offset = opts.offset ?? 0;
    const limitPlusOne = opts.limit + 1;
    const rows = opts.source
      ? (this.db
          .prepare(
            `SELECT * FROM contexts WHERE source = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          )
          .all(opts.source, limitPlusOne, offset) as DbContextRow[])
      : (this.db
          .prepare(`SELECT * FROM contexts ORDER BY created_at DESC LIMIT ? OFFSET ?`)
          .all(limitPlusOne, offset) as DbContextRow[]);
    const hasMore = rows.length > opts.limit;
    return {
      data: rows.slice(0, opts.limit).map((r) => this.mapContext(r)),
      hasMore,
    };
  }

  getContext(id: string): ContextEntry | null {
    const row = this.db.prepare(`SELECT * FROM contexts WHERE id = ?`).get(id) as
      | DbContextRow
      | undefined;
    return row ? this.mapContext(row) : null;
  }

  searchContexts(query: string, limit: number): ContextEntry[] {
    const like = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM contexts
         WHERE name LIKE ? OR description LIKE ? OR messages LIKE ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(like, like, like, limit) as DbContextRow[];
    return rows.map((r) => this.mapContext(r));
  }

  createContext(input: {
    projectId?: string | null;
    name: string;
    description?: string | null;
    tool?: string | null;
    source?: string;
    tags?: string[];
    messages?: ContextEntry['messages'];
  }): ContextEntry {
    const now = new Date().toISOString();
    const id = genId('ctx');
    this.db
      .prepare(
        `INSERT INTO contexts (id, project_id, name, description, tool, source, tags, messages, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId ?? null,
        input.name,
        input.description ?? null,
        input.tool ?? null,
        input.source ?? 'conversation',
        JSON.stringify(input.tags ?? []),
        JSON.stringify(input.messages ?? []),
        now,
        now,
      );
    return this.getContext(id)!;
  }
}
