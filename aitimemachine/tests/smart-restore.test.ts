import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SmartRestore', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-smart-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('matches glob patterns correctly', async () => {
    const { SmartRestore } = await import('../src/server/smart-restore');
    const smart = new SmartRestore();

    // Access private method via any
    const match = (smart as any).matchGlob.bind(smart);

    expect(match('src/auth/login.ts', 'src/auth/*')).toBe(true);
    expect(match('src/auth/login.ts', 'src/**/*.ts')).toBe(true);
    expect(match('src/auth/login.ts', '*.ts')).toBe(false);
    expect(match('package.json', 'package.json')).toBe(true);
    expect(match('src/index.ts', 'src/*.ts')).toBe(true);
    expect(match('src/deep/nested/file.ts', 'src/**/*.ts')).toBe(true);
  });

  it('searches sessions by query', async () => {
    const { SmartRestore } = await import('../src/server/smart-restore');
    const smart = new SmartRestore();

    // Mock listSessions to avoid searching real filesystem (causes timeouts)
    (smart as any).server.listSessions = () => [];

    const results = smart.searchForRestore('test');
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('returns error for partial restore with no matches', async () => {
    const { SmartRestore } = await import('../src/server/smart-restore');
    const smart = new SmartRestore();

    const result = smart.partialRestore('nonexistent', testDir, ['*.xyz'], { dryRun: true });
    expect(result.success).toBe(false);
  });
});
