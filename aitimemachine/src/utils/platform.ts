import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Cross-platform utilities for Windows/macOS/Linux
 */
export const platform = {
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',

  home(): string {
    return process.env.HOME || process.env.USERPROFILE || os.homedir();
  },

  dataDir(): string {
    if (this.isWindows) {
      return path.join(process.env.APPDATA || this.home(), 'aitimemachine');
    }
    return path.join(this.home(), '.aitimemachine-server');
  },

  ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  },

  // Normalize to forward slashes (for storage consistency)
  normalize(p: string): string {
    return p.replace(/\\/g, '/');
  },

  // Convert to OS-native path
  toNative(p: string): string {
    return this.isWindows ? p.replace(/\//g, '\\') : p;
  },

  // Safe path join that handles mixed separators
  join(...parts: string[]): string {
    return path.join(...parts.map(p => this.toNative(p)));
  },

  relative(from: string, to: string): string {
    return this.normalize(path.relative(this.toNative(from), this.toNative(to)));
  },

  resolve(...parts: string[]): string {
    return this.normalize(path.resolve(...parts.map(p => this.toNative(p))));
  },

  dirname(p: string): string {
    return path.dirname(p);
  },

  basename(p: string): string {
    return path.basename(p);
  },

  isAbsolute(p: string): boolean {
    if (this.isWindows) {
      return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');
    }
    return p.startsWith('/');
  },

  // Config paths for AI tools
  claudeConfig(): string {
    if (this.isWindows) {
      return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
    }
    return path.join(this.home(), '.claude.json');
  },

  claudeProjectsDir(): string {
    if (this.isWindows) {
      return path.join(process.env.APPDATA || '', 'Claude', 'projects');
    }
    return path.join(this.home(), '.claude', 'projects');
  },

  cursorStorage(): string {
    if (this.isWindows) {
      return path.join(process.env.APPDATA || '', 'Cursor', 'User', 'workspaceStorage');
    }
    if (this.isMac) {
      return path.join(this.home(), 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage');
    }
    return path.join(this.home(), '.config', 'Cursor', 'User', 'workspaceStorage');
  },

  vscodeStorage(): string {
    if (this.isWindows) {
      return path.join(process.env.APPDATA || '', 'Code', 'User', 'workspaceStorage');
    }
    if (this.isMac) {
      return path.join(this.home(), 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage');
    }
    return path.join(this.home(), '.config', 'Code', 'User', 'workspaceStorage');
  },

  tmpDir(): string {
    return os.tmpdir();
  },

  geminiDir(): string {
    return path.join(this.home(), '.gemini');
  },

  // Encode path for Claude-style directory names
  encodePath(p: string): string {
    const normalized = this.normalize(p);
    if (this.isWindows) {
      // C:/Users/name/project -> C-Users-name-project
      return normalized.replace(/:/g, '').replace(/\//g, '-');
    }
    // /Users/name/project -> -Users-name-project
    return normalized.replace(/\//g, '-');
  },

  // Decode Claude-style directory name back to path
  decodePath(encoded: string): string | null {
    const parts = encoded.replace(/^-/, '').split('-');
    let reconstructed = '';

    for (const part of parts) {
      // Try with slash first
      const withSlash = reconstructed ? reconstructed + '/' + part : (this.isWindows ? part + ':' : '/' + part);
      const withHyphen = reconstructed + '-' + part;

      if (fs.existsSync(this.toNative(withSlash))) {
        reconstructed = withSlash;
      } else if (reconstructed && fs.existsSync(this.toNative(withHyphen))) {
        reconstructed = withHyphen;
      } else if (!reconstructed) {
        reconstructed = this.isWindows ? part + ':' : '/' + part;
      } else {
        reconstructed = withSlash;
      }
    }

    const native = this.toNative(reconstructed);
    return fs.existsSync(native) ? native : null;
  },
};

export default platform;
