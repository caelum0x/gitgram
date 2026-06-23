import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock SessionServer to use test directory
describe('SessionServer', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-server-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('stores blobs with content-addressable hashing', async () => {
    const { SessionServer } = await import('../src/server/session-server');
    
    // Create server with custom data dir
    const server = new (SessionServer as any)();
    (server as any).dataDir = testDir;
    (server as any).sessionsDir = path.join(testDir, 'sessions');
    (server as any).blobsDir = path.join(testDir, 'blobs');
    fs.mkdirSync((server as any).sessionsDir, { recursive: true });
    fs.mkdirSync((server as any).blobsDir, { recursive: true });

    const content = Buffer.from('test content');
    const hash = server.storeBlob(content);
    
    expect(hash).toHaveLength(32);
    
    const retrieved = server.getBlob(hash);
    expect(retrieved?.toString()).toBe('test content');
  });

  it('deduplicates identical content', async () => {
    const { SessionServer } = await import('../src/server/session-server');
    
    const server = new (SessionServer as any)();
    (server as any).dataDir = testDir;
    (server as any).blobsDir = path.join(testDir, 'blobs');
    fs.mkdirSync((server as any).blobsDir, { recursive: true });

    const content = Buffer.from('same content');
    const hash1 = server.storeBlob(content);
    const hash2 = server.storeBlob(content);
    
    expect(hash1).toBe(hash2);
  });
});
