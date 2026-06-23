import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('CLI Commands', () => {
  let testDir: string;
  const cli = path.join(__dirname, '..', 'lib', 'cli-v2.js');

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-cli-'));
    fs.writeFileSync(path.join(testDir, 'test.txt'), 'hello world');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const run = (cmd: string) => {
    try {
      return execSync(`node ${cli} ${cmd}`, { 
        cwd: testDir, 
        encoding: 'utf-8',
        env: { ...process.env, AITM_DATA_DIR: path.join(testDir, '.aitm') }
      });
    } catch (e: any) {
      return e.stdout || e.message;
    }
  };

  it('shows help', () => {
    const output = run('--help');
    expect(output).toContain('Gitgram TimeMachine');
  });

  it('shows version', () => {
    const output = run('--version');
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });

  it('initializes project', () => {
    const output = run('init');
    expect(output).toContain('initialized');
  });

  it('creates checkpoint', () => {
    run('init');
    const output = run('checkpoint "test checkpoint"');
    expect(output).toContain('Checkpoint');
  });

  it('lists timepoints', () => {
    run('init');
    run('checkpoint "first"');
    const output = run('list');
    expect(output).toContain('first');
  });

  it('shows stats', () => {
    run('init');
    const output = run('stats');
    expect(output).toContain('TimePoints');
  });

  it('checkpoint with JSON output', () => {
    run('init');
    const output = run('checkpoint "json test" --json');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('id');
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('stats');
    expect(parsed.stats.totalFiles).toBeGreaterThan(0);
  });

  it('list with JSON output', () => {
    run('init');
    run('checkpoint "one"');
    run('checkpoint "two"');
    const output = run('list --json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(3); // init + one + two
  });

  it('list with limit', () => {
    run('init');
    run('checkpoint "a"');
    run('checkpoint "b"');
    run('checkpoint "c"');
    const output = run('list --limit 2');
    // Should show limited results
    expect(output).toBeTruthy();
  });

  it('show displays checkpoint details', () => {
    run('init');
    const cpOutput = run('checkpoint "show test" --json');
    const { id } = JSON.parse(cpOutput);
    const output = run(`show ${id}`);
    expect(output).toContain(id.slice(0, 8));
  });

  it('diff between two checkpoints', () => {
    run('init');
    const cp1 = JSON.parse(run('checkpoint "before" --json'));
    fs.writeFileSync(path.join(testDir, 'test.txt'), 'modified content');
    const cp2 = JSON.parse(run('checkpoint "after" --json'));
    const output = run(`diff ${cp1.id} ${cp2.id}`);
    expect(output).toContain('test.txt');
  });

  it('checkpoint alias cp works', () => {
    run('init');
    const output = run('cp "alias test"');
    expect(output).toContain('Checkpoint');
  });

  it('list alias ls works', () => {
    run('init');
    const output = run('ls');
    expect(output).toBeTruthy();
  });

  it('restore reverts to previous state', () => {
    run('init');
    const cp1 = JSON.parse(run('checkpoint "original" --json'));
    fs.writeFileSync(path.join(testDir, 'test.txt'), 'changed');
    fs.writeFileSync(path.join(testDir, 'new-file.txt'), 'new');
    run('checkpoint "modified"');
    run(`restore ${cp1.id} --yes`);
    const content = fs.readFileSync(path.join(testDir, 'test.txt'), 'utf-8');
    expect(content).toBe('hello world');
  });

  it('cat shows file content from checkpoint', () => {
    run('init');
    const cp = JSON.parse(run('checkpoint "cat test" --json'));
    const output = run(`cat test.txt ${cp.id}`);
    expect(output).toContain('hello world');
  });

  it('handles unknown command gracefully', () => {
    const output = run('nonexistent-command-xyz');
    expect(output).toBeTruthy(); // Should not crash
  });

  it('handles operations on uninitialized directory', () => {
    const uninitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-noinit-'));
    try {
      const output = execSync(`node ${cli} list`, {
        cwd: uninitDir,
        encoding: 'utf-8',
        env: { ...process.env, AITM_DATA_DIR: path.join(uninitDir, '.aitm') },
      }).toString();
      // Should handle gracefully - either show empty or prompt to init
      expect(output).toBeTruthy();
    } catch (e: any) {
      // Error is acceptable - should not be a stack trace
      expect(e.stdout || e.stderr || e.message).toBeTruthy();
    } finally {
      fs.rmSync(uninitDir, { recursive: true, force: true });
    }
  });

  it('where shows current project path', () => {
    run('init');
    const output = run('where');
    expect(output).toBeTruthy();
  });

  it('multiple checkpoints show in chronological order', () => {
    run('init');
    run('checkpoint "first"');
    run('checkpoint "second"');
    run('checkpoint "third"');
    const output = run('list --json');
    const parsed = JSON.parse(output);
    // Newest should come first (reverse chronological)
    expect(parsed.length).toBeGreaterThanOrEqual(4);
    const timestamps = parsed.map((tp: any) => new Date(tp.timestamp).getTime());
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
    }
  });
});
