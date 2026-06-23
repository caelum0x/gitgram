import { DatabaseManager } from '../src/core/storage/db.js';
import { ContentAddressableStorage } from '../src/core/storage/cas.js';
import { TransactionManager } from '../src/core/storage/transaction.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

const testDir = path.join(os.tmpdir(), 'aitm-storage-test-' + Date.now());
const dbPath = path.join(testDir, 'db.sqlite');
const storageDir = path.join(testDir, 'store');

console.log(`Setting up test environment in ${testDir}`);

try {
    // Setup
    const db = new DatabaseManager({ path: dbPath });
    const cas = new ContentAddressableStorage(storageDir, db);
    const tm = new TransactionManager(db, cas);

    // Test 1: Store and Retrieve
    console.log('Test 1: Store and Retrieve');
    const content1 = Buffer.from('Hello World');
    const hash1 = cas.store(content1);
    const retrieved1 = cas.get(hash1);

    if (retrieved1?.toString() === 'Hello World') {
        console.log('  ✅ Content matches');
    } else {
        console.error('  ❌ Content mismatch');
        process.exit(1);
    }

    // Test 2: Deduplication
    console.log('Test 2: Deduplication');
    const hash2 = cas.store(Buffer.from('Hello World')); // Same content
    if (hash1 === hash2) {
        console.log('  ✅ Hashes match (deduplicated)');
    } else {
        console.error('  ❌ Hashes do not match');
        process.exit(1);
    }

    // Test 3: Transaction
    console.log('Test 3: Transaction');
    try {
        tm.execute(({ db }) => {
            db.getDb().prepare('INSERT INTO checkpoints (id, timestamp, description) VALUES (?, ?, ?)').run('cp1', Date.now(), 'Test Checkpoint');
            throw new Error('Rollback');
        });
    } catch (e) {
        console.log('  ✅ Transaction rolled back (expected error)');
    }

    const cp = db.getDb().prepare('SELECT * FROM checkpoints WHERE id = ?').get('cp1');
    if (!cp) {
        console.log('  ✅ Checkpoint not found (rollback successful)');
    } else {
        console.error('  ❌ Checkpoint found (rollback failed)');
        process.exit(1);
    }

    console.log('\nAll tests passed!');

} catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
} finally {
    fs.removeSync(testDir);
}
