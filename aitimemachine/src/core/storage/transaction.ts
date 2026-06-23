import { DatabaseManager } from './db.js';
import { ContentAddressableStorage } from './cas.js';

export class TransactionManager {
    private db: DatabaseManager;
    private cas: ContentAddressableStorage;

    constructor(db: DatabaseManager, cas: ContentAddressableStorage) {
        this.db = db;
        this.cas = cas;
    }

    /**
     * Execute a unit of work atomically.
     * If any error occurs, the DB transaction is rolled back.
     * Note: CAS writes are not rolled back (orphaned files are cleaned up by GC).
     */
    public async execute<T>(work: (ctx: { db: DatabaseManager, cas: ContentAddressableStorage }) => Promise<T>): Promise<T> {
        return await this.db.transaction(async () => {
            return await work({
                db: this.db,
                cas: this.cas
            });
        });
    }
}
