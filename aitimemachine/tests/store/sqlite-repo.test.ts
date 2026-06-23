import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SqliteRepo } from '../../src/store/sqlite_repo.js';

describe('SqliteRepo', () => {
  let repo: SqliteRepo;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-repo-test-'));
    const dbPath = path.join(tmpDir, 'test.sqlite');
    repo = new SqliteRepo(dbPath);
  });

  afterEach(() => {
    try {
      repo.close();
    } catch {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('projects', () => {
    it('inserts and retrieves a project', () => {
      repo.insertProject({
        projectId: 'proj_1',
        rootPath: '/tmp/myproject',
        name: 'My Project',
        ignoreGlobs: ['node_modules', '.git'],
      });

      const project = repo.getProject('proj_1');
      expect(project).not.toBeNull();
      expect(project!.projectId).toBe('proj_1');
      expect(project!.rootPath).toBe('/tmp/myproject');
      expect(project!.name).toBe('My Project');
      expect(project!.ignoreGlobs).toEqual(['node_modules', '.git']);
    });

    it('lists projects', () => {
      repo.insertProject({ projectId: 'p1', rootPath: '/a', name: 'A', ignoreGlobs: [] });
      repo.insertProject({ projectId: 'p2', rootPath: '/b', name: 'B', ignoreGlobs: [] });

      const projects = repo.listProjects();
      expect(projects.length).toBe(2);
    });

    it('returns null for non-existent project', () => {
      expect(repo.getProject('nonexistent')).toBeNull();
    });
  });

  describe('checkpoints', () => {
    beforeEach(() => {
      repo.insertProject({ projectId: 'proj_1', rootPath: '/tmp/p', name: 'P', ignoreGlobs: [] });
    });

    it('inserts and retrieves a checkpoint', () => {
      const checkpoint = repo.insertCheckpoint({
        checkpointId: 'cp_1',
        projectId: 'proj_1',
        name: 'test checkpoint',
        scope: 'full',
        manifestBlobHash: 'abc123',
      });

      expect(checkpoint.checkpointId).toBe('cp_1');
      expect(checkpoint.createdAt).toBeTruthy();

      const fetched = repo.getCheckpoint('proj_1', 'cp_1');
      expect(fetched).not.toBeNull();
      expect(fetched!.name).toBe('test checkpoint');
      expect(fetched!.manifestBlobHash).toBe('abc123');
    });

    it('lists checkpoints newest first', async () => {
      repo.insertCheckpoint({ checkpointId: 'cp_1', projectId: 'proj_1', name: 'first', scope: 'full', manifestBlobHash: 'h1' });
      // Small delay to ensure different created_at timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      repo.insertCheckpoint({ checkpointId: 'cp_2', projectId: 'proj_1', name: 'second', scope: 'full', manifestBlobHash: 'h2' });

      const list = repo.listCheckpointsNewestFirst('proj_1', 10);
      expect(list.length).toBe(2);
      // Newest first
      expect(list[0].checkpointId).toBe('cp_2');
      expect(list[1].checkpointId).toBe('cp_1');
    });

    it('stores and retrieves linkedCheckpointId', () => {
      repo.insertCheckpoint({
        checkpointId: 'cp_before',
        projectId: 'proj_1',
        name: '[before] add feature',
        scope: 'full',
        manifestBlobHash: 'h1',
      });

      repo.insertCheckpoint({
        checkpointId: 'cp_after',
        projectId: 'proj_1',
        name: '[after] add feature',
        scope: 'full',
        manifestBlobHash: 'h2',
        linkedCheckpointId: 'cp_before',
      });

      const afterCp = repo.getCheckpoint('proj_1', 'cp_after');
      expect(afterCp).not.toBeNull();
      expect(afterCp!.linkedCheckpointId).toBe('cp_before');

      const beforeCp = repo.getCheckpoint('proj_1', 'cp_before');
      expect(beforeCp).not.toBeNull();
      expect(beforeCp!.linkedCheckpointId).toBeNull();
    });

    it('returns linkedCheckpointId in list results', () => {
      repo.insertCheckpoint({
        checkpointId: 'cp_a',
        projectId: 'proj_1',
        name: 'linked',
        scope: 'full',
        manifestBlobHash: 'h1',
        linkedCheckpointId: 'cp_parent',
      });

      const list = repo.listCheckpointsNewestFirst('proj_1', 10);
      expect(list[0].linkedCheckpointId).toBe('cp_parent');
    });

    it('searches checkpoints by name', () => {
      repo.insertCheckpoint({ checkpointId: 'cp_1', projectId: 'proj_1', name: 'add auth feature', scope: 'full', manifestBlobHash: 'h1' });
      repo.insertCheckpoint({ checkpointId: 'cp_2', projectId: 'proj_1', name: 'fix bug', scope: 'full', manifestBlobHash: 'h2' });

      const results = repo.searchCheckpoints('proj_1', 'auth');
      expect(results.length).toBe(1);
      expect(results[0].checkpointId).toBe('cp_1');
    });
  });

  describe('events', () => {
    beforeEach(() => {
      repo.insertProject({ projectId: 'proj_1', rootPath: '/tmp/p', name: 'P', ignoreGlobs: [] });
    });

    it('appends and lists events', () => {
      const { eventId } = repo.appendEvent('proj_1', 'chat.message', new Date().toISOString(), {
        role: 'user',
        content: 'Hello',
      });

      expect(eventId).toBeTruthy();

      const events = repo.listEvents('proj_1');
      expect(events.length).toBe(1);
      expect(events[0].payload.role).toBe('user');
      expect(events[0].payload.content).toBe('Hello');
    });

    it('filters events by type', () => {
      repo.appendEvent('proj_1', 'chat.message', new Date().toISOString(), { role: 'user', content: 'hi' });
      repo.appendEvent('proj_1', 'checkpoint.created', new Date().toISOString(), { checkpointId: 'cp_1' });

      const chatEvents = repo.listEvents('proj_1', 'chat.message');
      expect(chatEvents.length).toBe(1);

      const cpEvents = repo.listEvents('proj_1', 'checkpoint.created');
      expect(cpEvents.length).toBe(1);
    });
  });

  describe('stats', () => {
    it('returns correct counts', () => {
      repo.insertProject({ projectId: 'p1', rootPath: '/a', name: 'A', ignoreGlobs: [] });
      repo.insertCheckpoint({ checkpointId: 'cp_1', projectId: 'p1', name: 'cp', scope: 'full', manifestBlobHash: 'h' });
      repo.appendEvent('p1', 'test', new Date().toISOString(), {});

      const stats = repo.getStats();
      expect(stats.projects).toBe(1);
      expect(stats.checkpoints).toBe(1);
      expect(stats.events).toBe(1);
    });
  });

  describe('multi-tenant isolation', () => {
    let dbPath: string;

    beforeEach(() => {
      repo.close();
      dbPath = path.join(tmpDir, 'shared.sqlite');
    });

    it('scopes project/checkpoint/event reads by user context', () => {
      const repoUserA = new SqliteRepo(dbPath, 'user_a');
      const repoUserB = new SqliteRepo(dbPath, 'user_b');

      repoUserA.insertProject({ projectId: 'proj_a', rootPath: '/a', name: 'A', ignoreGlobs: [] });
      repoUserA.insertCheckpoint({
        checkpointId: 'cp_a',
        projectId: 'proj_a',
        name: 'checkpoint-a',
        scope: 'full',
        manifestBlobHash: 'h-a',
      });
      const { eventId } = repoUserA.appendEvent('proj_a', 'chat.message', new Date().toISOString(), {
        role: 'user',
        content: 'from-a',
      });

      expect(repoUserA.getProject('proj_a')).not.toBeNull();
      expect(repoUserA.getCheckpoint('proj_a', 'cp_a')).not.toBeNull();
      expect(repoUserA.getEvent(eventId)).not.toBeNull();

      expect(repoUserB.getProject('proj_a')).toBeNull();
      expect(repoUserB.getCheckpoint('proj_a', 'cp_a')).toBeNull();
      expect(repoUserB.searchCheckpoints('proj_a', 'checkpoint').length).toBe(0);
      expect(repoUserB.listEvents('proj_a').length).toBe(0);
      expect(repoUserB.getEvent(eventId)).toBeNull();

      repoUserA.close();
      repoUserB.close();
    });

    it('prevents cross-tenant checkpoint deletion and scopes stats', () => {
      const repoUserA = new SqliteRepo(dbPath, 'user_a');
      const repoUserB = new SqliteRepo(dbPath, 'user_b');

      repoUserA.insertProject({ projectId: 'proj_a', rootPath: '/a', name: 'A', ignoreGlobs: [] });
      repoUserA.insertCheckpoint({
        checkpointId: 'cp_a',
        projectId: 'proj_a',
        name: 'checkpoint-a',
        scope: 'full',
        manifestBlobHash: 'h-a',
      });
      repoUserA.appendEvent('proj_a', 'checkpoint.created', new Date().toISOString(), { checkpointId: 'cp_a' });

      expect(repoUserA.getStats()).toEqual({ projects: 1, checkpoints: 1, events: 1 });
      expect(repoUserB.getStats()).toEqual({ projects: 0, checkpoints: 0, events: 0 });

      repoUserB.deleteCheckpoint('cp_a');
      expect(repoUserA.getCheckpoint('proj_a', 'cp_a')).not.toBeNull();

      repoUserA.close();
      repoUserB.close();
    });

    it('scopes tree reads and dedup by user context', () => {
      const repoUserA = new SqliteRepo(dbPath, 'user_a');
      const repoUserB = new SqliteRepo(dbPath, 'user_b');

      repoUserA.insertProject({ projectId: 'proj_a', rootPath: '/a', name: 'A', ignoreGlobs: [] });

      const sharedTreeInput = {
        projectId: 'proj_a',
        hash: 'tree_hash_1',
        parentPath: '/',
        entries: [
          { name: 'src', type: 'tree' as const, hash: 'tree_hash_2', mode: 0o040000, size: 0 },
        ],
      };

      const aTree = repoUserA.insertTree(sharedTreeInput);
      expect(repoUserA.getTreeByHash('proj_a', 'tree_hash_1')).not.toBeNull();
      expect(repoUserB.getTreeByHash('proj_a', 'tree_hash_1')).toBeNull();

      const bTree = repoUserB.insertTree(sharedTreeInput);
      expect(aTree.id).not.toBe(bTree.id);

      repoUserA.close();
      repoUserB.close();
    });
  });
});
