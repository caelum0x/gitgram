import { TimeMachineEngine } from './engine.js';
import { DiffEngine } from './diff-engine.js';

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  oldHash?: string;
  newHash?: string;
  diff?: string;
}

export class FileComparator {
  private diffEngine = new DiffEngine();

  constructor(private engine: TimeMachineEngine) {}

  compareCheckpoints(fromId: string, toId: string): FileDiff[] {
    const from = this.engine.getTimePoint(fromId);
    const to = this.engine.getTimePoint(toId);

    if (!from || !to) {
      throw new Error('Checkpoint not found');
    }

    const results: FileDiff[] = [];
    const fromFiles = new Map(from.files.map(f => [f.path, f.hash]));
    const toFiles = new Map(to.files.map(f => [f.path, f.hash]));

    // Find added and modified files
    for (const [path, newHash] of toFiles) {
      const oldHash = fromFiles.get(path);
      
      if (!oldHash) {
        results.push({ path, status: 'added', newHash });
      } else if (oldHash !== newHash) {
        const oldContent = this.engine.getFileContent(fromId, path) || '';
        const newContent = this.engine.getFileContent(toId, path) || '';
        const diff = this.diffEngine.diff(oldContent, newContent);
        
        results.push({
          path,
          status: 'modified',
          oldHash,
          newHash,
          diff: this.diffEngine.formatUnified(diff, path, path)
        });
      }
    }

    // Find deleted files
    for (const [path, oldHash] of fromFiles) {
      if (!toFiles.has(path)) {
        results.push({ path, status: 'deleted', oldHash });
      }
    }

    return results;
  }

  getFileDiff(path: string, fromId: string, toId: string): string | null {
    const oldContent = this.engine.getFileContent(fromId, path);
    const newContent = this.engine.getFileContent(toId, path);

    if (!oldContent || !newContent) return null;

    const diff = this.diffEngine.diff(oldContent, newContent);
    return this.diffEngine.formatUnified(diff, path, path);
  }
}
