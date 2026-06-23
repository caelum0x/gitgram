import Database from "better-sqlite3";

type TableInfoRow = { name: string };

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return rows.some((col) => col.name === columnName);
}

/**
 * Add user_id column to all tables for multi-tenant data isolation
 */
export function migrateAddUserId(db: Database.Database): void {
  // Check if migration already applied
  const hasUserCol = hasColumn(db, "projects", "user_id");
  
  if (hasUserCol) return;

  db.exec(`
    -- Add user_id to projects
    ALTER TABLE projects ADD COLUMN user_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

    -- Add user_id to checkpoints  
    ALTER TABLE checkpoints ADD COLUMN user_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_checkpoints_user ON checkpoints(user_id, created_at DESC);

    -- Add user_id to events
    ALTER TABLE events ADD COLUMN user_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, timestamp DESC);
  `);
}

/**
 * Create users table if not exists
 */
export function migrateCreateUsersTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      api_key_hash TEXT,
      role TEXT DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key_hash);
  `);
}

/**
 * Add linked_checkpoint_id column to checkpoints table for before/after action pairing
 */
export function migrateAddLinkedCheckpointId(db: Database.Database): void {
  const hasCol = hasColumn(db, "checkpoints", "linked_checkpoint_id");

  if (hasCol) return;

  db.exec(`
    ALTER TABLE checkpoints ADD COLUMN linked_checkpoint_id TEXT;
  `);
}

/**
 * Add root_tree_hash column to checkpoints and create trees table
 */
export function migrateAddTreesSupport(db: Database.Database): void {
  // Add root_tree_hash to checkpoints if not present
  const hasRootTreeHash = hasColumn(db, "checkpoints", "root_tree_hash");

  if (!hasRootTreeHash) {
    db.exec(`
      ALTER TABLE checkpoints ADD COLUMN root_tree_hash TEXT;
    `);
  }

  // Create trees table
  db.exec(`
    CREATE TABLE IF NOT EXISTS trees (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      hash TEXT NOT NULL,
      parent_path TEXT NOT NULL,
      entries TEXT NOT NULL, -- JSON array of tree entries
      user_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(project_id)
    );

    CREATE INDEX IF NOT EXISTS idx_trees_project_hash
      ON trees(project_id, hash);

    CREATE INDEX IF NOT EXISTS idx_trees_hash
      ON trees(hash);

    CREATE INDEX IF NOT EXISTS idx_trees_parent_path
      ON trees(project_id, parent_path);

    CREATE INDEX IF NOT EXISTS idx_trees_user_hash
      ON trees(user_id, project_id, hash);
  `);

  const hasTreesUserId = hasColumn(db, "trees", "user_id");

  if (!hasTreesUserId) {
    db.exec(`
      ALTER TABLE trees ADD COLUMN user_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_trees_user_hash
        ON trees(user_id, project_id, hash);
    `);
  }
}

/**
 * Run all migrations
 */
export function runMigrations(db: Database.Database): void {
  migrateCreateUsersTable(db);
  migrateAddUserId(db);
  migrateAddLinkedCheckpointId(db);
  migrateAddTreesSupport(db);
}
