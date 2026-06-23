import { db } from '../neon/client.js';
import { sql } from 'drizzle-orm';
import { EventEmitter } from 'events';

export interface DatabaseConfig {
    // Config is now handled via env vars for Neon
}

export class DatabaseManager extends EventEmitter {
    constructor(config?: DatabaseConfig) {
        super();
    }

    /**
     * Initialize/Migrate database
     */
    async init() {
        // Create tables if they don't exist
        // Note: In production, use Drizzle Kit for migrations.
        // This is a lightweight auto-schema for the demo.

        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS checkpoints (
                id TEXT PRIMARY KEY,
                timestamp TIMESTAMP NOT NULL,
                description TEXT,
                parent_id TEXT,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS files (
                hash TEXT PRIMARY KEY,
                size INTEGER NOT NULL,
                compressed_size INTEGER,
                compression_method TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS checkpoint_files (
                checkpoint_id TEXT,
                file_path TEXT,
                file_hash TEXT,
                mode INTEGER,
                PRIMARY KEY (checkpoint_id, file_path)
            );
        `);

        // Indexes
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp ON checkpoints(timestamp);`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_checkpoint_files_hash ON checkpoint_files(file_hash);`);
    }

    public getDb() {
        return db;
    }

    public async close() {
        // Neon connection is managed by the pool, usually no explicit close needed for serverless
    }

    // Transaction helper
    public async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
        return await db.transaction(fn);
    }
}
