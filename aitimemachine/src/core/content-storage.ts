import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

/**
 * Content storage for large data (messages, code, diffs)
 * Stores full content separately from events
 */
export class ContentStorage {
  private basePath: string;

  constructor(projectPath: string) {
    this.basePath = path.join(projectPath, '.aitimemachine', 'content');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = ['messages', 'code', 'diffs', 'outputs'];
    for (const dir of dirs) {
      const dirPath = path.join(this.basePath, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  /**
   * Store message content
   */
  storeMessage(content: string): string {
    const id = `msg_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const filePath = path.join(this.basePath, 'messages', `${id}.txt`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return `content/messages/${id}.txt`;
  }

  /**
   * Store code content
   */
  storeCode(content: string, language?: string): string {
    const id = `code_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const ext = language || 'txt';
    const filePath = path.join(this.basePath, 'code', `${id}.${ext}`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return `content/code/${id}.${ext}`;
  }

  /**
   * Store diff
   */
  storeDiff(diff: string): string {
    const id = `diff_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const filePath = path.join(this.basePath, 'diffs', `${id}.patch`);
    fs.writeFileSync(filePath, diff, 'utf-8');
    return `content/diffs/${id}.patch`;
  }

  /**
   * Store tool output
   */
  storeOutput(output: string): string {
    const id = `out_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const filePath = path.join(this.basePath, 'outputs', `${id}.txt`);
    fs.writeFileSync(filePath, output, 'utf-8');
    return `content/outputs/${id}.txt`;
  }

  /**
   * Retrieve content by reference
   */
  getContent(ref: string): string | null {
    const filePath = path.join(this.basePath, '..', ref);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Get storage size
   */
  getSize(): number {
    let total = 0;
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else total += fs.statSync(full).size;
      }
    };
    walk(this.basePath);
    return total;
  }
}
