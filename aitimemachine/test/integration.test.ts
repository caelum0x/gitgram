import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TimeMachineEngine } from '../src/core/engine.js';
import { CloudSync } from '../src/cloud-sync.js';

describe('AITimeMachine Integration Tests', () => {
  let testDir: string;
  let engine: TimeMachineEngine;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-test-'));
    fs.writeFileSync(path.join(testDir, 'index.js'), 'console.log("hello");');
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test');
    engine = new TimeMachineEngine(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Core Engine', () => {
    test('capture creates timepoint with files', () => {
      const tp = engine.capture('Initial', { type: 'manual' });
      
      expect(tp.id).toMatch(/^tp_/);
      expect(tp.description).toBe('Initial');
      expect(tp.stats.totalFiles).toBe(2);
      expect(tp.files.length).toBe(2);
      expect(tp.changes.added.length).toBe(2);
    });

    test('capture detects file changes', () => {
      engine.capture('First', { type: 'manual' });
      
      fs.writeFileSync(path.join(testDir, 'index.js'), 'console.log("modified");');
      fs.writeFileSync(path.join(testDir, 'new.txt'), 'new file');
      
      const tp2 = engine.capture('Second', { type: 'manual' });
      
      expect(tp2.changes.added).toContain('new.txt');
      expect(tp2.changes.modified).toContain('index.js');
    });

    test('capture detects file deletions', () => {
      engine.capture('First', { type: 'manual' });
      
      fs.unlinkSync(path.join(testDir, 'README.md'));
      
      const tp2 = engine.capture('Second', { type: 'manual' });
      
      expect(tp2.changes.deleted).toContain('README.md');
    });

    test('restore brings back files', () => {
      const tp1 = engine.capture('Before', { type: 'manual' });
      
      fs.writeFileSync(path.join(testDir, 'index.js'), 'BROKEN');
      fs.writeFileSync(path.join(testDir, 'bad.txt'), 'bad');
      engine.capture('After break', { type: 'manual' });
      
      const result = engine.restore(tp1.id);
      
      expect(result.filesRestored).toBe(2);
      expect(result.filesDeleted).toBe(1);
      expect(fs.readFileSync(path.join(testDir, 'index.js'), 'utf-8')).toBe('console.log("hello");');
      expect(fs.existsSync(path.join(testDir, 'bad.txt'))).toBe(false);
    });

    test('listTimePoints returns all timepoints', () => {
      engine.capture('First', { type: 'manual' });
      engine.capture('Second', { type: 'manual' });
      engine.capture('Third', { type: 'manual' });
      
      const list = engine.listTimePoints();
      
      expect(list.length).toBe(3);
      expect(list[0].description).toBe('First');
      expect(list[2].description).toBe('Third');
    });

    test('findByDescription finds matching timepoint', () => {
      engine.capture('Add authentication', { type: 'manual' });
      engine.capture('Fix bug', { type: 'manual' });
      
      const tp = engine.findByDescription('authentication');
      
      expect(tp).not.toBeNull();
      expect(tp!.description).toBe('Add authentication');
    });

    test('getDiff shows changes between timepoints', () => {
      const tp1 = engine.capture('First', { type: 'manual' });
      
      fs.writeFileSync(path.join(testDir, 'new.txt'), 'new');
      fs.writeFileSync(path.join(testDir, 'index.js'), 'modified');
      fs.unlinkSync(path.join(testDir, 'README.md'));
      
      const tp2 = engine.capture('Second', { type: 'manual' });
      
      const diff = engine.getDiff(tp1.id, tp2.id);
      
      expect(diff.added).toContain('new.txt');
      expect(diff.modified).toContain('index.js');
      expect(diff.deleted).toContain('README.md');
    });
  });

  describe('Conversation Store', () => {
    test('logMessage persists messages', () => {
      engine.logMessage('user', 'Hello');
      engine.logMessage('assistant', 'Hi there');
      
      const convs = engine.getConversations();
      
      expect(convs.length).toBe(2);
      expect(convs[0].role).toBe('user');
      expect(convs[1].content).toBe('Hi there');
    });

    test('searchConversations finds messages', () => {
      engine.logMessage('user', 'Add authentication to API');
      engine.logMessage('assistant', 'I will add JWT auth');
      
      const results = engine.searchConversations('authentication');
      
      expect(results.length).toBe(1);
      expect(results[0].content).toContain('authentication');
    });
  });

  describe('Export/Import', () => {
    test('export and import preserves data', () => {
      engine.capture('Test checkpoint', { type: 'manual' });
      engine.logMessage('user', 'Test message');
      engine.capture('After message', { type: 'manual' });
      
      const sync = new CloudSync(testDir);
      const exportPath = path.join(testDir, 'backup.aitm');
      sync.export(exportPath);
      
      // Create new directory and import
      const newDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-import-'));
      fs.mkdirSync(path.join(newDir, '.aitimemachine'), { recursive: true });
      
      const newSync = new CloudSync(newDir);
      const result = newSync.import(exportPath);
      
      expect(result.timepoints).toBe(2);
      expect(result.conversations).toBe(1);
      
      const newEngine = new TimeMachineEngine(newDir);
      expect(newEngine.listTimePoints().length).toBe(2);
      
      fs.rmSync(newDir, { recursive: true, force: true });
    });
  });

  describe('Performance', () => {
    test('handles many files efficiently', () => {
      // Create 1000 files
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir);
      for (let i = 0; i < 1000; i++) {
        fs.writeFileSync(path.join(srcDir, `file${i}.js`), `// File ${i}`);
      }
      
      const start = Date.now();
      const tp = engine.capture('Many files', { type: 'manual' });
      const duration = Date.now() - start;
      
      expect(tp.stats.totalFiles).toBe(1002); // 1000 + index.js + README.md
      expect(duration).toBeLessThan(5000); // Should complete in under 5s
    });

    test('incremental capture is fast', () => {
      // Create initial files
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir);
      for (let i = 0; i < 500; i++) {
        fs.writeFileSync(path.join(srcDir, `file${i}.js`), `// File ${i}`);
      }
      
      engine.capture('Initial', { type: 'manual' });
      
      // Modify only one file
      fs.writeFileSync(path.join(srcDir, 'file0.js'), '// Modified');
      
      const start = Date.now();
      const tp = engine.capture('One change', { type: 'manual' });
      const duration = Date.now() - start;
      
      expect(tp.changes.modified.length).toBe(1);
      expect(duration).toBeLessThan(2000); // Should be fast due to mtime check
    });
  });
});
