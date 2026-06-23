/**
 * Time Machine Experience Tests
 * 
 * Tests for macOS Time Machine-like features:
 * - Undo last action
 * - Find before action
 * - Find error point
 * - Change summary
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TimeMachineEngine } from '../src/core/engine.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Time Machine Experience', () => {
  let engine: TimeMachineEngine;
  let testDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-test-'));
    engine = new TimeMachineEngine(testDir);
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('undoLast', () => {
    it('should undo the last action', () => {
      // Create initial file
      const filePath = path.join(testDir, 'test.txt');
      fs.writeFileSync(filePath, 'initial content');
      engine.capture('Initial state', { type: 'manual' });

      // Make a change
      fs.writeFileSync(filePath, 'modified content');
      engine.capture('Modified file', { type: 'manual' });

      // Verify modified
      expect(fs.readFileSync(filePath, 'utf8')).toBe('modified content');

      // Undo
      const result = engine.undoLast(1);

      expect(result.success).toBe(true);
      expect(result.stepsUndone).toBe(1);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('initial content');
    });

    it('should undo multiple steps', () => {
      const filePath = path.join(testDir, 'test.txt');
      
      // Create 3 states
      fs.writeFileSync(filePath, 'v1');
      engine.capture('Version 1', { type: 'manual' });
      
      fs.writeFileSync(filePath, 'v2');
      engine.capture('Version 2', { type: 'manual' });
      
      fs.writeFileSync(filePath, 'v3');
      engine.capture('Version 3', { type: 'manual' });

      // Undo 2 steps
      const result = engine.undoLast(2);

      expect(result.success).toBe(true);
      expect(result.stepsUndone).toBe(2);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('v1');
    });

    it('should throw if not enough history', () => {
      engine.capture('Only checkpoint', { type: 'manual' });

      expect(() => engine.undoLast(5)).toThrow(/Not enough history/);
    });
  });

  describe('findBeforeAction', () => {
    it('should find checkpoint before matching action', () => {
      const filePath = path.join(testDir, 'api.ts');
      
      fs.writeFileSync(filePath, 'v1');
      engine.capture('Initial setup', { type: 'manual' });
      
      fs.writeFileSync(filePath, 'v2');
      engine.capture('Added Docker config', { type: 'manual' });
      
      fs.writeFileSync(filePath, 'v3');
      engine.capture('Fixed Docker issue', { type: 'manual' });

      const result = engine.findBeforeAction('docker');

      expect(result.found).toBe(true);
      expect(result.action?.description).toContain('Docker');
      // findBeforeAction finds the LAST matching action (most recent)
      // So "Fixed Docker issue" is found, and stateBefore is "Added Docker config"
      expect(result.stateBefore?.description).toBe('Added Docker config');
    });

    it('should return not found for non-matching query', () => {
      engine.capture('Some action', { type: 'manual' });
      engine.capture('Another action', { type: 'manual' });

      const result = engine.findBeforeAction('kubernetes');

      expect(result.found).toBe(false);
    });
  });

  describe('findErrorPoint', () => {
    it('should find error based on indicators', () => {
      engine.capture('Working state', { type: 'manual' });
      engine.capture('Added feature', { type: 'manual' });
      engine.capture('Fix broken test', { type: 'manual' });
      engine.capture('Another fix', { type: 'manual' });

      const result = engine.findErrorPoint({ lookbackMinutes: 60 });

      expect(result.found).toBe(true);
      expect(result.errorInfo).toContain('error indicator');
    });

    it('should find error based on pattern', () => {
      engine.capture('Good state', { type: 'manual' });
      engine.capture('Database migration', { type: 'manual' });
      engine.capture('More changes', { type: 'manual' });

      const result = engine.findErrorPoint({ 
        errorPattern: 'database',
        lookbackMinutes: 60 
      });

      expect(result.found).toBe(true);
      expect(result.errorInfo).toContain('database');
    });

    it('should return not found if no errors', () => {
      engine.capture('Good state 1', { type: 'manual' });
      engine.capture('Good state 2', { type: 'manual' });

      const result = engine.findErrorPoint({ lookbackMinutes: 60 });

      expect(result.found).toBe(false);
    });
  });

  describe('getChangeSummary', () => {
    it('should return correct change counts', () => {
      // Initial state
      fs.writeFileSync(path.join(testDir, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(testDir, 'file2.txt'), 'content2');
      const tp1 = engine.capture('Initial', { type: 'manual' });

      // Make changes
      fs.writeFileSync(path.join(testDir, 'file1.txt'), 'modified1');
      fs.writeFileSync(path.join(testDir, 'file3.txt'), 'new file');
      fs.unlinkSync(path.join(testDir, 'file2.txt'));

      const summary = engine.getChangeSummary(tp1.id);

      expect(summary.modified).toBe(1); // file1.txt
      expect(summary.added).toBe(1);    // file3.txt
      expect(summary.deleted).toBe(1);  // file2.txt
    });
  });
});

describe('Time Machine CLI Integration', () => {
  // These tests would require spawning the CLI
  // For now, we just verify the engine methods work

  it('should support the full undo workflow', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-cli-test-'));
    const engine = new TimeMachineEngine(testDir);

    try {
      // Simulate AI making changes
      const file = path.join(testDir, 'app.ts');
      
      fs.writeFileSync(file, 'const app = express();');
      engine.capture('Created Express app', { type: 'manual' });
      
      fs.writeFileSync(file, 'const app = koa();'); // AI made wrong choice
      engine.capture('Changed to Koa', { type: 'manual' });

      // User says "go back to express"
      const beforeAction = engine.findBeforeAction('koa');
      expect(beforeAction.found).toBe(true);

      // Restore
      if (beforeAction.stateBefore) {
        engine.restore(beforeAction.stateBefore.id);
        expect(fs.readFileSync(file, 'utf8')).toBe('const app = express();');
      }
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
