/**
 * Neon Database Store for AITimeMachine
 * 
 * Stores code snapshots, chat history, and events in Neon (serverless Postgres)
 * 
 * Features:
 * - Cloud sync across devices
 * - SQL queries for timeline/search
 * - Neon branching for "what if" scenarios
 * - Automatic schema migrations
 */

import { Pool } from 'pg';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface NeonConfig {
  connectionString: string;  // Neon connection string
  poolSize?: number;
  ssl?: boolean;
}

export interface DbTimePoint {
  id: string;
  project_id: string;
  timestamp: Date;
  description: string;
  trigger_type: string;
  trigger_tool?: string;
  trigger_action?: string;
  parent_id?: string;
  session_id: string;
  message_count: number;
  total_files: number;
  total_size: number;
  metadata?: Record<string, unknown>;
}

export interface DbFile {
  id: string;
  timepoint_id: string;
  path: string;
  hash: string;
  size: number;
  mode: number;
  mtime: Date;
  change_type?: 'added' | 'modified' | 'deleted' | 'unchanged';
}

export interface DbBlob {
  hash: string;
  content: Buffer;
  size: number;
  content_type: string;
  created_at: Date;
}

export interface DbEvent {
  id: string;
  project_id: string;
  session_id: string;
  timestamp: Date;
  type: string;
  data: Record<string, unknown>;
  timepoint_id?: string;
}

export interface DbMessage {
  id: string;
  project_id: string;
  session_id: string;
  timestamp: Date;
  role: 'user' | 'assistant' | 'system';
  content: string;
  content_hash?: string;  // For large messages stored as blobs
  tool?: string;
  metadata?: Record<string, unknown>;
}

export interface DbProject {
  id: string;
  path: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  last_sync_at?: Date;
  settings?: Record<string, unknown>;
}

type DbRow = Record<string, unknown>;
type TimelineEntry = { type: string; timestamp: Date; data: Record<string, unknown> };

// ============================================================================
// Schema
// ============================================================================

const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_sync_at TIMESTAMP WITH TIME ZONE,
  settings JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(updated_at DESC);

-- Blobs (content-addressable storage)
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,
  content BYTEA NOT NULL,
  size INTEGER NOT NULL,
  content_type TEXT DEFAULT 'application/octet-stream',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Deduplicate blobs by hash
CREATE INDEX IF NOT EXISTS idx_blobs_size ON blobs(size);

-- TimePoints (snapshots)
CREATE TABLE IF NOT EXISTS timepoints (
  id TEXT PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_tool TEXT,
  trigger_action TEXT,
  parent_id TEXT REFERENCES timepoints(id),
  session_id TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  total_files INTEGER DEFAULT 0,
  total_size BIGINT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- For fast timeline queries
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timepoints_project ON timepoints(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_timepoints_session ON timepoints(session_id);
CREATE INDEX IF NOT EXISTS idx_timepoints_trigger ON timepoints(trigger_type, trigger_tool);
CREATE INDEX IF NOT EXISTS idx_timepoints_parent ON timepoints(parent_id);

-- Files in each timepoint
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timepoint_id TEXT REFERENCES timepoints(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  hash TEXT REFERENCES blobs(hash),
  size INTEGER NOT NULL,
  mode INTEGER DEFAULT 33188,
  mtime TIMESTAMP WITH TIME ZONE,
  change_type TEXT,  -- 'added', 'modified', 'deleted', 'unchanged'
  
  UNIQUE(timepoint_id, path)
);

CREATE INDEX IF NOT EXISTS idx_files_timepoint ON files(timepoint_id);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);

-- Events (append-only log)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  timepoint_id TEXT REFERENCES timepoints(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_project_time ON events(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timepoint ON events(timepoint_id);

-- Messages (conversation history)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  content_hash TEXT REFERENCES blobs(hash),  -- For large messages
  tool TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_project_time ON messages(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);

-- Full-text search on messages
CREATE INDEX IF NOT EXISTS idx_messages_content_search 
  ON messages USING gin(to_tsvector('english', content));

-- Diffs (for efficient storage)
CREATE TABLE IF NOT EXISTS diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timepoint_id TEXT REFERENCES timepoints(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  diff_type TEXT NOT NULL,  -- 'added', 'modified', 'deleted'
  old_hash TEXT REFERENCES blobs(hash),
  new_hash TEXT REFERENCES blobs(hash),
  hunks JSONB,  -- Diff hunks for display
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diffs_timepoint ON diffs(timepoint_id);
CREATE INDEX IF NOT EXISTS idx_diffs_path ON diffs(file_path);

-- Sessions (for grouping related activity)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  tool TEXT,  -- Which AI tool was used
  summary TEXT,
  message_count INTEGER DEFAULT 0,
  file_changes INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_tool ON sessions(tool);

-- Sync tracking (for offline support)
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- 'timepoint', 'event', 'message', etc.
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,  -- 'insert', 'update', 'delete'
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  client_id TEXT,
  
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_log_time ON sync_log(synced_at DESC);
`;

// ============================================================================
// NeonStore Class
// ============================================================================

export class NeonStore {
  private pool: Pool;
  private initialized = false;

  constructor(config: NeonConfig) {
    this.pool = new Pool({
      connectionString: config.connectionString,
      max: config.poolSize || 10,
      ssl: config.ssl !== false ? { rejectUnauthorized: false } : undefined,
    });
  }

  /**
   * Initialize schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const client = await this.pool.connect();
    try {
      // Check schema version
      const versionResult = await client.query(`
        SELECT version FROM schema_version ORDER BY version DESC LIMIT 1
      `).catch(() => ({ rows: [] }));

      const currentVersion = versionResult.rows[0]?.version || 0;

      if (currentVersion < SCHEMA_VERSION) {
        console.log(`Migrating schema from v${currentVersion} to v${SCHEMA_VERSION}...`);
        await client.query(SCHEMA_SQL);
        await client.query(`
          INSERT INTO schema_version (version) VALUES ($1)
          ON CONFLICT (version) DO NOTHING
        `, [SCHEMA_VERSION]);
        console.log('Schema migration complete.');
      }

      this.initialized = true;
    } finally {
      client.release();
    }
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  // ==========================================================================
  // Projects
  // ==========================================================================

  async getOrCreateProject(path: string, name: string): Promise<DbProject> {
    const result = await this.pool.query(`
      INSERT INTO projects (path, name)
      VALUES ($1, $2)
      ON CONFLICT (path) DO UPDATE SET updated_at = NOW()
      RETURNING *
    `, [path, name]);
    return this.rowToProject(result.rows[0]);
  }

  async getProject(id: string): Promise<DbProject | null> {
    const result = await this.pool.query(`
      SELECT * FROM projects WHERE id = $1
    `, [id]);
    return result.rows[0] ? this.rowToProject(result.rows[0]) : null;
  }

  async getProjectByPath(path: string): Promise<DbProject | null> {
    const result = await this.pool.query(`
      SELECT * FROM projects WHERE path = $1
    `, [path]);
    return result.rows[0] ? this.rowToProject(result.rows[0]) : null;
  }

  async listProjects(): Promise<DbProject[]> {
    const result = await this.pool.query(`
      SELECT * FROM projects ORDER BY updated_at DESC
    `);
    return result.rows.map((r: DbRow) => this.rowToProject(r));
  }

  // ==========================================================================
  // Blobs (Content-Addressable Storage)
  // ==========================================================================

  async putBlob(content: Buffer | string): Promise<string> {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);

    await this.pool.query(`
      INSERT INTO blobs (hash, content, size, content_type)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (hash) DO NOTHING
    `, [hash, buffer, buffer.length, this.detectContentType(buffer)]);

    return hash;
  }

  async getBlob(hash: string): Promise<Buffer | null> {
    const result = await this.pool.query(`
      SELECT content FROM blobs WHERE hash = $1
    `, [hash]);
    return result.rows[0]?.content || null;
  }

  async getBlobString(hash: string): Promise<string | null> {
    const content = await this.getBlob(hash);
    return content ? content.toString('utf-8') : null;
  }

  async hasBlob(hash: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT 1 FROM blobs WHERE hash = $1
    `, [hash]);
    return result.rows.length > 0;
  }

  // ==========================================================================
  // TimePoints
  // ==========================================================================

  async saveTimePoint(tp: DbTimePoint, files: DbFile[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert timepoint
      await client.query(`
        INSERT INTO timepoints (
          id, project_id, timestamp, description, trigger_type, trigger_tool,
          trigger_action, parent_id, session_id, message_count, total_files,
          total_size, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          description = EXCLUDED.description,
          metadata = EXCLUDED.metadata
      `, [
        tp.id, tp.project_id, tp.timestamp, tp.description, tp.trigger_type,
        tp.trigger_tool, tp.trigger_action, tp.parent_id, tp.session_id,
        tp.message_count, tp.total_files, tp.total_size,
        JSON.stringify(tp.metadata || {})
      ]);

      // Insert files (batch)
      if (files.length > 0) {
        const values: unknown[] = [];
        const placeholders: string[] = [];
        let idx = 1;

        for (const file of files) {
          placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
          values.push(tp.id, file.path, file.hash, file.size, file.mode, file.mtime, file.change_type);
        }

        await client.query(`
          INSERT INTO files (timepoint_id, path, hash, size, mode, mtime, change_type)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (timepoint_id, path) DO UPDATE SET
            hash = EXCLUDED.hash,
            size = EXCLUDED.size,
            mtime = EXCLUDED.mtime,
            change_type = EXCLUDED.change_type
        `, values);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getTimePoint(id: string): Promise<DbTimePoint | null> {
    const result = await this.pool.query(`
      SELECT * FROM timepoints WHERE id = $1
    `, [id]);
    return result.rows[0] ? this.rowToTimePoint(result.rows[0]) : null;
  }

  async getTimePointFiles(timepointId: string): Promise<DbFile[]> {
    const result = await this.pool.query(`
      SELECT * FROM files WHERE timepoint_id = $1 ORDER BY path
    `, [timepointId]);
    return result.rows.map((r: DbRow) => this.rowToFile(r));
  }

  async listTimePoints(projectId: string, options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    triggerType?: string;
    sessionId?: string;
  }): Promise<DbTimePoint[]> {
    const conditions: string[] = ['project_id = $1'];
    const values: unknown[] = [projectId];
    let idx = 2;

    if (options?.startDate) {
      conditions.push(`timestamp >= $${idx++}`);
      values.push(options.startDate);
    }
    if (options?.endDate) {
      conditions.push(`timestamp <= $${idx++}`);
      values.push(options.endDate);
    }
    if (options?.triggerType) {
      conditions.push(`trigger_type = $${idx++}`);
      values.push(options.triggerType);
    }
    if (options?.sessionId) {
      conditions.push(`session_id = $${idx++}`);
      values.push(options.sessionId);
    }

    const result = await this.pool.query(`
      SELECT * FROM timepoints
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...values, options?.limit || 100, options?.offset || 0]);

    return result.rows.map((r: DbRow) => this.rowToTimePoint(r));
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  async appendEvent(event: DbEvent): Promise<void> {
    await this.pool.query(`
      INSERT INTO events (id, project_id, session_id, timestamp, type, data, timepoint_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      event.id, event.project_id, event.session_id, event.timestamp,
      event.type, JSON.stringify(event.data), event.timepoint_id
    ]);
  }

  async getEvents(projectId: string, options?: {
    sessionId?: string;
    type?: string;
    limit?: number;
    afterTimestamp?: Date;
  }): Promise<DbEvent[]> {
    const conditions: string[] = ['project_id = $1'];
    const values: unknown[] = [projectId];
    let idx = 2;

    if (options?.sessionId) {
      conditions.push(`session_id = $${idx++}`);
      values.push(options.sessionId);
    }
    if (options?.type) {
      conditions.push(`type = $${idx++}`);
      values.push(options.type);
    }
    if (options?.afterTimestamp) {
      conditions.push(`timestamp > $${idx++}`);
      values.push(options.afterTimestamp);
    }

    const result = await this.pool.query(`
      SELECT * FROM events
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT $${idx}
    `, [...values, options?.limit || 100]);

    return result.rows.map((r: DbRow) => this.rowToEvent(r));
  }

  // ==========================================================================
  // Messages (Conversation History)
  // ==========================================================================

  async saveMessage(msg: DbMessage): Promise<void> {
    // Store large content as blob
    let contentHash: string | undefined;
    let content = msg.content;

    if (msg.content.length > 5000) {
      contentHash = await this.putBlob(msg.content);
      content = msg.content.slice(0, 500) + '...'; // Store preview
    }

    await this.pool.query(`
      INSERT INTO messages (project_id, session_id, timestamp, role, content, content_hash, tool, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      msg.project_id, msg.session_id, msg.timestamp, msg.role,
      content, contentHash, msg.tool, JSON.stringify(msg.metadata || {})
    ]);
  }

  async getMessages(projectId: string, sessionId?: string, limit = 100): Promise<DbMessage[]> {
    const query = sessionId
      ? `SELECT * FROM messages WHERE project_id = $1 AND session_id = $2 ORDER BY timestamp DESC LIMIT $3`
      : `SELECT * FROM messages WHERE project_id = $1 ORDER BY timestamp DESC LIMIT $2`;
    
    const values = sessionId ? [projectId, sessionId, limit] : [projectId, limit];
    const result = await this.pool.query(query, values);
    return result.rows.map((r: DbRow) => this.rowToMessage(r));
  }

  async searchMessages(projectId: string, query: string, limit = 50): Promise<DbMessage[]> {
    const result = await this.pool.query(`
      SELECT *, ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2)) as rank
      FROM messages
      WHERE project_id = $1 AND to_tsvector('english', content) @@ plainto_tsquery('english', $2)
      ORDER BY rank DESC, timestamp DESC
      LIMIT $3
    `, [projectId, query, limit]);
    return result.rows.map((r: DbRow) => this.rowToMessage(r));
  }

  // ==========================================================================
  // Sessions
  // ==========================================================================

  async startSession(projectId: string, sessionId: string, tool?: string): Promise<void> {
    await this.pool.query(`
      INSERT INTO sessions (id, project_id, started_at, tool)
      VALUES ($1, $2, NOW(), $3)
      ON CONFLICT (id) DO UPDATE SET tool = EXCLUDED.tool
    `, [sessionId, projectId, tool]);
  }

  async endSession(sessionId: string, summary?: string): Promise<void> {
    await this.pool.query(`
      UPDATE sessions SET
        ended_at = NOW(),
        summary = COALESCE($2, summary),
        message_count = (SELECT COUNT(*) FROM messages WHERE session_id = $1),
        file_changes = (SELECT COUNT(*) FROM events WHERE session_id = $1 AND type IN ('file_created', 'file_modified', 'file_deleted'))
      WHERE id = $1
    `, [sessionId, summary]);
  }

  // ==========================================================================
  // Timeline Queries
  // ==========================================================================

  async getTimeline(projectId: string, options?: {
    startDate?: Date;
    endDate?: Date;
    includeMessages?: boolean;
    includeEvents?: boolean;
    limit?: number;
  }): Promise<TimelineEntry[]> {
    const results: TimelineEntry[] = [];
    const limit = options?.limit || 100;

    // Get timepoints
    const timepoints = await this.listTimePoints(projectId, {
      startDate: options?.startDate,
      endDate: options?.endDate,
      limit
    });
    
    for (const tp of timepoints) {
      results.push({ type: 'timepoint', timestamp: tp.timestamp, data: tp as unknown as Record<string, unknown> });
    }

    // Get messages if requested
    if (options?.includeMessages) {
      const messages = await this.getMessages(projectId, undefined, limit);
      for (const msg of messages) {
        if ((!options.startDate || msg.timestamp >= options.startDate) &&
            (!options.endDate || msg.timestamp <= options.endDate)) {
          results.push({ type: 'message', timestamp: msg.timestamp, data: msg as unknown as Record<string, unknown> });
        }
      }
    }

    // Get events if requested
    if (options?.includeEvents) {
      const events = await this.getEvents(projectId, { limit });
      for (const event of events) {
        if ((!options.startDate || event.timestamp >= options.startDate) &&
            (!options.endDate || event.timestamp <= options.endDate)) {
          results.push({ type: 'event', timestamp: event.timestamp, data: event as unknown as Record<string, unknown> });
        }
      }
    }

    // Sort by timestamp
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return results.slice(0, limit);
  }

  // ==========================================================================
  // Sync Support
  // ==========================================================================

  async getChangesSince(timestamp: Date): Promise<{
    timepoints: DbTimePoint[];
    events: DbEvent[];
    messages: DbMessage[];
  }> {
    const [timepoints, events, messages] = await Promise.all([
      this.pool.query(`SELECT * FROM timepoints WHERE created_at > $1`, [timestamp]),
      this.pool.query(`SELECT * FROM events WHERE created_at > $1`, [timestamp]),
      this.pool.query(`SELECT * FROM messages WHERE created_at > $1`, [timestamp]),
    ]);

    return {
      timepoints: timepoints.rows.map((r: DbRow) => this.rowToTimePoint(r)),
      events: events.rows.map((r: DbRow) => this.rowToEvent(r)),
      messages: messages.rows.map((r: DbRow) => this.rowToMessage(r)),
    };
  }

  async markSynced(entityType: string, entityId: string, clientId: string): Promise<void> {
    await this.pool.query(`
      INSERT INTO sync_log (entity_type, entity_id, client_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        synced_at = NOW(),
        client_id = EXCLUDED.client_id
    `, [entityType, entityId, clientId]);
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  async getStats(projectId: string): Promise<{
    totalTimepoints: number;
    totalMessages: number;
    totalEvents: number;
    totalFiles: number;
    storageSize: number;
    firstActivity: Date | null;
    lastActivity: Date | null;
  }> {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM timepoints WHERE project_id = $1) as total_timepoints,
        (SELECT COUNT(*) FROM messages WHERE project_id = $1) as total_messages,
        (SELECT COUNT(*) FROM events WHERE project_id = $1) as total_events,
        (SELECT COUNT(DISTINCT f.path) FROM files f 
         JOIN timepoints t ON f.timepoint_id = t.id WHERE t.project_id = $1) as total_files,
        (SELECT COALESCE(SUM(size), 0) FROM blobs WHERE hash IN (
          SELECT DISTINCT hash FROM files f
          JOIN timepoints t ON f.timepoint_id = t.id WHERE t.project_id = $1
        )) as storage_size,
        (SELECT MIN(timestamp) FROM timepoints WHERE project_id = $1) as first_activity,
        (SELECT MAX(timestamp) FROM timepoints WHERE project_id = $1) as last_activity
    `, [projectId]);

    const row = result.rows[0];
    return {
      totalTimepoints: parseInt(row.total_timepoints),
      totalMessages: parseInt(row.total_messages),
      totalEvents: parseInt(row.total_events),
      totalFiles: parseInt(row.total_files),
      storageSize: parseInt(row.storage_size),
      firstActivity: row.first_activity,
      lastActivity: row.last_activity,
    };
  }

  // ==========================================================================
  // Neon Branching Support
  // ==========================================================================

  /**
   * Create a logical branch point for "what if" scenarios
   * Note: Actual Neon branching is done via Neon API/Console
   * This creates a marker in the data for correlation
   */
  async createBranchPoint(projectId: string, name: string, description?: string): Promise<string> {
    const branchId = `branch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    await this.pool.query(`
      INSERT INTO timepoints (
        id, project_id, timestamp, description, trigger_type, trigger_action,
        session_id, metadata
      ) VALUES ($1, $2, NOW(), $3, 'branch', $4, $5, $6)
    `, [
      branchId, projectId, description || `Branch: ${name}`, name,
      `branch_${branchId}`,
      JSON.stringify({ branch_name: name, is_branch_point: true })
    ]);

    return branchId;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private detectContentType(buffer: Buffer): string {
    // Simple content type detection
    const str = buffer.slice(0, 100).toString('utf-8');
    if (str.startsWith('{') || str.startsWith('[')) return 'application/json';
    if (str.includes('<!DOCTYPE') || str.includes('<html')) return 'text/html';
    if (str.includes('function') || str.includes('const ') || str.includes('import ')) return 'text/javascript';
    return 'text/plain';
  }

  private rowToProject(row: DbRow): DbProject {
    return {
      id: String(row.id),
      path: String(row.path),
      name: String(row.name),
      created_at: new Date(String(row.created_at)),
      updated_at: new Date(String(row.updated_at)),
      last_sync_at: row.last_sync_at ? new Date(String(row.last_sync_at)) : undefined,
      settings: (row.settings as Record<string, unknown> | undefined),
    };
  }

  private rowToTimePoint(row: DbRow): DbTimePoint {
    return {
      id: String(row.id),
      project_id: String(row.project_id),
      timestamp: new Date(String(row.timestamp)),
      description: String(row.description ?? ""),
      trigger_type: String(row.trigger_type),
      trigger_tool: row.trigger_tool ? String(row.trigger_tool) : undefined,
      trigger_action: row.trigger_action ? String(row.trigger_action) : undefined,
      parent_id: row.parent_id ? String(row.parent_id) : undefined,
      session_id: String(row.session_id),
      message_count: Number(row.message_count ?? 0),
      total_files: Number(row.total_files ?? 0),
      total_size: Number(row.total_size ?? 0),
      metadata: (row.metadata as Record<string, unknown> | undefined),
    };
  }

  private rowToFile(row: DbRow): DbFile {
    return {
      id: String(row.id),
      timepoint_id: String(row.timepoint_id),
      path: String(row.path),
      hash: String(row.hash),
      size: Number(row.size ?? 0),
      mode: Number(row.mode ?? 33188),
      mtime: row.mtime ? new Date(String(row.mtime)) : new Date(),
      change_type: row.change_type as DbFile["change_type"],
    };
  }

  private rowToEvent(row: DbRow): DbEvent {
    return {
      id: String(row.id),
      project_id: String(row.project_id),
      session_id: String(row.session_id),
      timestamp: new Date(String(row.timestamp)),
      type: String(row.type),
      data: (row.data as Record<string, unknown>) || {},
      timepoint_id: row.timepoint_id ? String(row.timepoint_id) : undefined,
    };
  }

  private rowToMessage(row: DbRow): DbMessage {
    return {
      id: String(row.id),
      project_id: String(row.project_id),
      session_id: String(row.session_id),
      timestamp: new Date(String(row.timestamp)),
      role: row.role as DbMessage["role"],
      content: String(row.content),
      content_hash: row.content_hash ? String(row.content_hash) : undefined,
      tool: row.tool ? String(row.tool) : undefined,
      metadata: (row.metadata as Record<string, unknown> | undefined),
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let globalNeonStore: NeonStore | null = null;

export function getNeonStore(): NeonStore | null {
  return globalNeonStore;
}

export async function initializeNeonStore(connectionString: string): Promise<NeonStore> {
  if (globalNeonStore) {
    return globalNeonStore;
  }

  globalNeonStore = new NeonStore({ connectionString });
  await globalNeonStore.initialize();
  return globalNeonStore;
}

export async function closeNeonStore(): Promise<void> {
  if (globalNeonStore) {
    await globalNeonStore.close();
    globalNeonStore = null;
  }
}
