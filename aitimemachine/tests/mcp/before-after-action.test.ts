import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import crypto from 'crypto';
import { SqliteRepo } from '../../src/store/sqlite_repo.js';

/**
 * Tests for the before_action / after_action MCP tool flow.
 * These tests validate the data layer behavior (checkpoint creation, linking, events)
 * without spinning up the full MCP server.
 */
describe('before_action / after_action flow', () => {
  let repo: SqliteRepo;
  let tmpDir: string;
  let projectId: string;
  const projectPath = '/tmp/test-project';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-ba-test-'));
    const dbPath = path.join(tmpDir, 'test.sqlite');
    repo = new SqliteRepo(dbPath);

    // Create a project (mimics what before_action does)
    projectId = crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
    repo.insertProject({
      projectId,
      rootPath: projectPath,
      name: 'test-project',
      ignoreGlobs: [],
    });
  });

  afterEach(() => {
    repo.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('before_action creates a [before] checkpoint', () => {
    const action = 'add authentication module';
    const checkpoint = repo.insertCheckpoint({
      checkpointId: `cp_before_${Date.now()}`,
      projectId,
      name: `[before] ${action}`,
      scope: 'full',
      manifestBlobHash: 'manifest_hash_before',
    });

    expect(checkpoint.name).toBe('[before] add authentication module');
    expect(checkpoint.createdAt).toBeTruthy();
    expect(checkpoint.linkedCheckpointId).toBeFalsy();
  });

  it('after_action creates a [after] checkpoint linked to before', () => {
    const beforeCp = repo.insertCheckpoint({
      checkpointId: 'cp_before_1',
      projectId,
      name: '[before] add auth',
      scope: 'full',
      manifestBlobHash: 'hash_before',
    });

    const afterCp = repo.insertCheckpoint({
      checkpointId: 'cp_after_1',
      projectId,
      name: '[after] add auth',
      scope: 'full',
      manifestBlobHash: 'hash_after',
      linkedCheckpointId: beforeCp.checkpointId,
    });

    expect(afterCp.linkedCheckpointId).toBe('cp_before_1');

    // Verify by fetching
    const fetched = repo.getCheckpoint(projectId, 'cp_after_1');
    expect(fetched!.linkedCheckpointId).toBe('cp_before_1');
  });

  it('checkpoint.created events are logged for before and after', () => {
    const beforeCheckpointId = 'cp_before_evt';
    const afterCheckpointId = 'cp_after_evt';

    // Simulate what the MCP handler does
    repo.insertCheckpoint({
      checkpointId: beforeCheckpointId,
      projectId,
      name: '[before] refactor api',
      scope: 'full',
      manifestBlobHash: 'h1',
    });

    repo.appendEvent(projectId, 'checkpoint.created', new Date().toISOString(), {
      checkpointId: beforeCheckpointId,
      name: '[before] refactor api',
      scope: 'full',
      trigger: 'before_action',
    });

    repo.insertCheckpoint({
      checkpointId: afterCheckpointId,
      projectId,
      name: '[after] refactor api',
      scope: 'full',
      manifestBlobHash: 'h2',
      linkedCheckpointId: beforeCheckpointId,
    });

    repo.appendEvent(projectId, 'checkpoint.created', new Date().toISOString(), {
      checkpointId: afterCheckpointId,
      name: '[after] refactor api',
      scope: 'full',
      trigger: 'after_action',
      linkedCheckpointId: beforeCheckpointId,
    });

    const events = repo.listEvents(projectId, 'checkpoint.created');
    expect(events.length).toBe(2);

    const afterEvent = events.find(e => e.payload.trigger === 'after_action');
    expect(afterEvent).toBeTruthy();
    expect(afterEvent!.payload.linkedCheckpointId).toBe(beforeCheckpointId);
  });

  it('before/after pairs can be found by searching checkpoint names', () => {
    repo.insertCheckpoint({ checkpointId: 'cp_b1', projectId, name: '[before] update login', scope: 'full', manifestBlobHash: 'h1' });
    repo.insertCheckpoint({ checkpointId: 'cp_a1', projectId, name: '[after] update login', scope: 'full', manifestBlobHash: 'h2', linkedCheckpointId: 'cp_b1' });
    repo.insertCheckpoint({ checkpointId: 'cp_b2', projectId, name: '[before] fix bug', scope: 'full', manifestBlobHash: 'h3' });

    const loginResults = repo.searchCheckpoints(projectId, 'login');
    expect(loginResults.length).toBe(2);

    const beforeResults = repo.searchCheckpoints(projectId, '[before]');
    expect(beforeResults.length).toBe(2);
  });

  it('after_action without before_action stores null linkedCheckpointId', () => {
    const cp = repo.insertCheckpoint({
      checkpointId: 'cp_orphan',
      projectId,
      name: '[after] quick fix',
      scope: 'full',
      manifestBlobHash: 'h_orphan',
      // No linkedCheckpointId
    });

    expect(cp.linkedCheckpointId).toBeFalsy();
    const fetched = repo.getCheckpoint(projectId, 'cp_orphan');
    expect(fetched!.linkedCheckpointId).toBeNull();
  });

  it('context packet includes linked checkpoint info', async () => {
    const { buildContextPacket } = await import('../../src/context/context-packet.js');

    repo.insertCheckpoint({
      checkpointId: 'cp_b',
      projectId,
      name: '[before] deploy v2',
      scope: 'full',
      manifestBlobHash: 'hb',
    });

    repo.insertCheckpoint({
      checkpointId: 'cp_a',
      projectId,
      name: '[after] deploy v2',
      scope: 'full',
      manifestBlobHash: 'ha',
      linkedCheckpointId: 'cp_b',
    });

    // Log a chat message for context
    repo.appendEvent(projectId, 'chat.message', new Date().toISOString(), {
      role: 'user',
      content: 'Deploy version 2 to production',
    });

    const packet = await buildContextPacket({
      repo,
      projectId,
      checkpointId: 'cp_a',
    });

    expect(packet).toContain('Linked Checkpoint');
    expect(packet).toContain('cp_b');
    expect(packet).toContain('Deploy version 2 to production');
  });
});
