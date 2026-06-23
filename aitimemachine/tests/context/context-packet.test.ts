import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SqliteRepo } from '../../src/store/sqlite_repo.js';
import { buildContextPacket, buildMinimalContextPacket, extractGoalFromMessages } from '../../src/context/context-packet.js';

describe('context-packet', () => {
  let repo: SqliteRepo;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-ctx-test-'));
    const dbPath = path.join(tmpDir, 'test.sqlite');
    repo = new SqliteRepo(dbPath);

    repo.insertProject({
      projectId: 'proj_1',
      rootPath: '/tmp/testproject',
      name: 'Test Project',
      ignoreGlobs: [],
    });
  });

  afterEach(() => {
    repo.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('buildContextPacket', () => {
    it('generates valid markdown with checkpoint info', async () => {
      repo.insertCheckpoint({
        checkpointId: 'cp_1',
        projectId: 'proj_1',
        name: 'initial state',
        scope: 'full',
        manifestBlobHash: 'fake_hash',
      });

      const packet = await buildContextPacket({
        repo,
        projectId: 'proj_1',
        checkpointId: 'cp_1',
      });

      expect(packet).toContain('# AITM Restored Context');
      expect(packet).toContain('cp_1');
      expect(packet).toContain('initial state');
      expect(packet).toContain('/tmp/testproject');
      expect(packet).toContain('full');
    });

    it('includes conversation messages', async () => {
      repo.insertCheckpoint({
        checkpointId: 'cp_1',
        projectId: 'proj_1',
        name: 'with chat',
        scope: 'full',
        manifestBlobHash: 'fake_hash',
      });

      repo.appendEvent('proj_1', 'chat.message', new Date().toISOString(), {
        role: 'user',
        content: 'Please fix the login bug',
      });

      repo.appendEvent('proj_1', 'chat.message', new Date().toISOString(), {
        role: 'assistant',
        content: 'I found the issue in auth.ts',
      });

      const packet = await buildContextPacket({
        repo,
        projectId: 'proj_1',
        checkpointId: 'cp_1',
        maxMessages: 10,
      });

      expect(packet).toContain('Conversation');
      expect(packet).toContain('Please fix the login bug');
      expect(packet).toContain('I found the issue in auth.ts');
    });

    it('includes linked checkpoint info for after-action checkpoints', async () => {
      repo.insertCheckpoint({
        checkpointId: 'cp_before',
        projectId: 'proj_1',
        name: '[before] add feature',
        scope: 'full',
        manifestBlobHash: 'hash1',
      });

      repo.insertCheckpoint({
        checkpointId: 'cp_after',
        projectId: 'proj_1',
        name: '[after] add feature',
        scope: 'full',
        manifestBlobHash: 'hash2',
        linkedCheckpointId: 'cp_before',
      });

      const packet = await buildContextPacket({
        repo,
        projectId: 'proj_1',
        checkpointId: 'cp_after',
      });

      expect(packet).toContain('Linked Checkpoint');
      expect(packet).toContain('cp_before');
      expect(packet).toContain('AFTER the action');
    });

    it('includes linked checkpoint info for before-action checkpoints', async () => {
      // In this case, a "before" checkpoint that links forward to an after
      repo.insertCheckpoint({
        checkpointId: 'cp_first',
        projectId: 'proj_1',
        name: '[before] refactor',
        scope: 'full',
        manifestBlobHash: 'hash1',
        linkedCheckpointId: 'cp_second',
      });

      repo.insertCheckpoint({
        checkpointId: 'cp_second',
        projectId: 'proj_1',
        name: '[after] refactor',
        scope: 'full',
        manifestBlobHash: 'hash2',
      });

      const packet = await buildContextPacket({
        repo,
        projectId: 'proj_1',
        checkpointId: 'cp_first',
      });

      expect(packet).toContain('Linked Checkpoint');
      expect(packet).toContain('BEFORE the action');
    });

    it('throws for non-existent checkpoint', async () => {
      await expect(
        buildContextPacket({
          repo,
          projectId: 'proj_1',
          checkpointId: 'nonexistent',
        })
      ).rejects.toThrow('Checkpoint not found');
    });
  });

  describe('buildMinimalContextPacket', () => {
    it('generates minimal markdown', () => {
      const packet = buildMinimalContextPacket({
        checkpointId: 'cp_1',
        projectId: 'proj_1',
        name: 'my checkpoint',
        createdAt: '2025-01-01T00:00:00Z',
        scope: 'full',
        manifestBlobHash: 'hash',
      });

      expect(packet).toContain('Restored to Checkpoint');
      expect(packet).toContain('cp_1');
      expect(packet).toContain('my checkpoint');
    });
  });

  describe('extractGoalFromMessages', () => {
    it('finds the most recent substantial user message', () => {
      const messages = [
        { role: 'user' as const, content: 'Please implement the dark mode feature for the app', timestamp: '2025-01-01T00:00:00Z' },
        { role: 'assistant' as const, content: 'Sure, I will implement dark mode', timestamp: '2025-01-01T00:01:00Z' },
        { role: 'user' as const, content: 'yes', timestamp: '2025-01-01T00:02:00Z' },
      ];

      const goal = extractGoalFromMessages(messages);
      expect(goal).toBe('Please implement the dark mode feature for the app');
    });

    it('skips short confirmations', () => {
      const messages = [
        { role: 'user' as const, content: 'Build a REST API endpoint for users', timestamp: '2025-01-01T00:00:00Z' },
        { role: 'user' as const, content: 'ok', timestamp: '2025-01-01T00:01:00Z' },
        { role: 'user' as const, content: 'thanks', timestamp: '2025-01-01T00:02:00Z' },
      ];

      const goal = extractGoalFromMessages(messages);
      expect(goal).toBe('Build a REST API endpoint for users');
    });

    it('returns null for no substantial messages', () => {
      const messages = [
        { role: 'user' as const, content: 'yes', timestamp: '2025-01-01T00:00:00Z' },
        { role: 'user' as const, content: 'ok', timestamp: '2025-01-01T00:01:00Z' },
      ];

      const goal = extractGoalFromMessages(messages);
      expect(goal).toBeNull();
    });
  });
});
