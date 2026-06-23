import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('E2E: Capture → Restore Flow', () => {
  let testDir: string;
  let cliPath: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-e2e-'));
    cliPath = path.join(process.cwd(), 'lib/cli-v2.js');
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const run = (cmd: string) => execSync(`node ${cliPath} ${cmd}`, { 
    cwd: testDir, 
    encoding: 'utf-8',
    env: { ...process.env, HOME: testDir }
  });

  it('full capture → modify → restore flow', () => {
    // 1. Create initial files
    fs.writeFileSync(path.join(testDir, 'file1.txt'), 'original content');
    fs.writeFileSync(path.join(testDir, 'file2.txt'), 'file two');
    
    // 2. Initialize and capture
    const initOutput = run('init');
    expect(initOutput).toContain('initialized');
    
    // 3. Get the timepoint ID
    const listOutput = run('list');
    const match = listOutput.match(/tp_\d+/);
    expect(match).toBeTruthy();
    const tpId = match![0];
    
    // 4. Modify files
    fs.writeFileSync(path.join(testDir, 'file1.txt'), 'MODIFIED content');
    fs.writeFileSync(path.join(testDir, 'file3.txt'), 'new file');
    fs.unlinkSync(path.join(testDir, 'file2.txt'));
    
    // 5. Verify modifications
    expect(fs.readFileSync(path.join(testDir, 'file1.txt'), 'utf-8')).toBe('MODIFIED content');
    expect(fs.existsSync(path.join(testDir, 'file2.txt'))).toBe(false);
    expect(fs.existsSync(path.join(testDir, 'file3.txt'))).toBe(true);
    
    // 6. Preview restore
    const previewOutput = run(`preview ${tpId}`);
    expect(previewOutput).toContain('file3.txt'); // file3 will be deleted
    
    // 7. Restore
    const restoreOutput = run(`restore ${tpId} --yes`);
    expect(restoreOutput).toContain('Restored');
    
    // 8. Verify restoration
    expect(fs.readFileSync(path.join(testDir, 'file1.txt'), 'utf-8')).toBe('original content');
    expect(fs.readFileSync(path.join(testDir, 'file2.txt'), 'utf-8')).toBe('file two');
    expect(fs.existsSync(path.join(testDir, 'file3.txt'))).toBe(false);
  });

  it('checkpoint and search', () => {
    fs.writeFileSync(path.join(testDir, 'app.ts'), 'const auth = true;');
    
    run('init');
    run('checkpoint "Added authentication feature"');
    
    const searchOutput = run('search auth');
    expect(searchOutput.toLowerCase()).toMatch(/auth|found/);
  });
});
