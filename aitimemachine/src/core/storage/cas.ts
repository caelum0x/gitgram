import fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { sql } from 'drizzle-orm';
import { DatabaseManager } from './db.js';

export class ContentAddressableStorage {
    private storageDir: string;
    private db: DatabaseManager;

    constructor(storageDir: string, db: DatabaseManager) {
        this.storageDir = storageDir;
        this.db = db;
        fs.ensureDirSync(this.storageDir);
    }

    /**
     * Store content and return its hash.
     * Deduplicates automatically.
     */
    public async store(content: Buffer): Promise<string> {
        // 1. Calculate Hash
        const hash = crypto.createHash('sha256').update(content).digest('hex');

        // 2. Check if exists in DB
        // Use raw SQL for simplicity with the dynamic schema setup in db.ts
        const result = await this.db.getDb().execute(sql`
            SELECT hash FROM files WHERE hash = ${hash}
        `);

        if (result.rows.length > 0) {
            return hash;
        }

        // 3. Compress (Brotli)
        const compressed = zlib.brotliCompressSync(content);

        // 4. Write to disk (sharded by first 2 chars)
        const shard = hash.slice(0, 2);
        const fileDir = path.join(this.storageDir, shard);
        const filePath = path.join(fileDir, hash.slice(2));

        fs.ensureDirSync(fileDir);

        // Atomic write
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, compressed);
        fs.renameSync(tempPath, filePath);

        // 5. Record in DB
        await this.db.getDb().execute(sql`
            INSERT INTO files (hash, size, compressed_size, compression_method)
            VALUES (${hash}, ${content.length}, ${compressed.length}, 'brotli')
            ON CONFLICT DO NOTHING
        `);

        return hash;
    }

    /**
     * Retrieve content by hash.
     */
    public get(hash: string): Buffer | null {
        const shard = hash.slice(0, 2);
        const filePath = path.join(this.storageDir, shard, hash.slice(2));

        if (!fs.existsSync(filePath)) {
            return null;
        }

        const compressed = fs.readFileSync(filePath);

        // Decompress
        try {
            return zlib.brotliDecompressSync(compressed);
        } catch (e) {
            console.error(`Failed to decompress ${hash}:`, e);
            return null;
        }
    }

    /**
     * Verify integrity of a file.
     */
    public verify(hash: string): boolean {
        const content = this.get(hash);
        if (!content) return false;

        const calculatedHash = crypto.createHash('sha256').update(content).digest('hex');
        return calculatedHash === hash;
    }
}
