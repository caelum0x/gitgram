import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FastScanner } from '../src/utils/fast-scanner';

describe('FastScanner', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-test-'));
    fs.writeFileSync(path.join(testDir, 'file1.txt'), 'hello');
    fs.writeFileSync(path.join(testDir, 'file2.js'), 'const x = 1;');
    fs.mkdirSync(path.join(testDir, 'subdir'));
    fs.writeFileSync(path.join(testDir, 'subdir', 'nested.ts'), 'export {}');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('scans all files', () => {
    const scanner = new FastScanner(testDir);
    const { files, stats } = scanner.scan();
    
    expect(files.length).toBe(3);
    expect(stats.total).toBe(3);
    expect(stats.hashed).toBe(3);
    expect(stats.cached).toBe(0);
  });

  it('uses cache on second scan', () => {
    const scanner = new FastScanner(testDir);
    scanner.scan();
    const { stats } = scanner.scan();
    
    expect(stats.cached).toBe(3);
    expect(stats.hashed).toBe(0);
  });

  it('detects file changes', () => {
    const scanner = new FastScanner(testDir);
    scanner.scan();
    
    // Modify a file
    fs.writeFileSync(path.join(testDir, 'file1.txt'), 'changed');
    
    const { changed, changedFiles } = scanner.quickScan();
    expect(changed).toBe(true);
    expect(changedFiles).toContain('file1.txt');
  });

  it('excludes node_modules', () => {
    fs.mkdirSync(path.join(testDir, 'node_modules'));
    fs.writeFileSync(path.join(testDir, 'node_modules', 'pkg.js'), 'module');
    
    const scanner = new FastScanner(testDir);
    const { files } = scanner.scan();
    
    expect(files.find(f => f.path.includes('node_modules'))).toBeUndefined();
  });

  it('excludes .git', () => {
    fs.mkdirSync(path.join(testDir, '.git'));
    fs.writeFileSync(path.join(testDir, '.git', 'config'), 'git');
    
    const scanner = new FastScanner(testDir);
    const { files } = scanner.scan();
    
    expect(files.find(f => f.path.includes('.git'))).toBeUndefined();
  });
});
