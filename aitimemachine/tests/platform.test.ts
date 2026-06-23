import { platform } from '../src/utils/platform';

describe('Platform Utils', () => {
  it('normalizes paths to forward slashes', () => {
    expect(platform.normalize('C:\\Users\\test')).toBe('C:/Users/test');
    expect(platform.normalize('/Users/test')).toBe('/Users/test');
  });

  it('detects absolute paths', () => {
    expect(platform.isAbsolute('/Users/test')).toBe(true);
    expect(platform.isAbsolute('relative/path')).toBe(false);
  });

  it('returns home directory', () => {
    const home = platform.home();
    expect(home).toBeTruthy();
    expect(typeof home).toBe('string');
  });

  it('returns data directory', () => {
    const dataDir = platform.dataDir();
    expect(dataDir).toContain('aitimemachine');
  });

  it('encodes paths for Claude-style directories', () => {
    const encoded = platform.encodePath('/Users/test/project');
    expect(encoded).not.toContain('/');
  });
});
