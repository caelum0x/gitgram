import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { TimePoint, TimePointSummary, FileEntry } from './types.js';

/**
 * Manages TimePoints - complete snapshots of project state
 */
export class TimePointManager {
  private basePath: string;
  private indexPath: string;
  private index: Map<string, { timestamp: string; description: string }> = new Map();

  constructor(basePath: string) {
    this.basePath = path.join(basePath, 'timepoints');
    this.indexPath = path.join(basePath, 'index.json');
    this.ensureDir(this.basePath);
    this.loadIndex();
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private loadIndex(): void {
    if (fs.existsSync(this.indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
        this.index = new Map(Object.entries(data));
      } catch { /* ignore */ }
    }
  }

  private saveIndex(): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(Object.fromEntries(this.index), null, 2));
  }

  /**
   * Generate unique ID for timepoint
   */
  generateId(): string {
    return `tp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Save a timepoint
   */
  save(tp: TimePoint): void {
    const filePath = path.join(this.basePath, `${tp.id}.json`);
    
    // Serialize with dates as ISO strings
    const serialized = {
      ...tp,
      timestamp: tp.timestamp.toISOString(),
    };
    
    fs.writeFileSync(filePath, JSON.stringify(serialized, null, 2));
    
    this.index.set(tp.id, {
      timestamp: tp.timestamp.toISOString(),
      description: tp.description,
    });
    this.saveIndex();
  }

  /**
   * Load a timepoint by ID
   */
  load(id: string): TimePoint | null {
    const filePath = path.join(this.basePath, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        ...data,
        timestamp: new Date(data.timestamp),
      };
    } catch {
      return null;
    }
  }

  /**
   * List all timepoints (summaries only)
   */
  list(): TimePointSummary[] {
    const summaries: TimePointSummary[] = [];
    
    for (const [id, meta] of this.index) {
      const tp = this.load(id);
      if (tp) {
        summaries.push({
          id: tp.id,
          timestamp: tp.timestamp,
          description: tp.description,
          trigger: tp.trigger,
          stats: tp.stats,
          changesCount: tp.changes.added.length + tp.changes.modified.length + tp.changes.deleted.length,
        });
      }
    }

    return summaries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Get the latest timepoint
   */
  getLatest(): TimePoint | null {
    const list = this.list();
    if (list.length === 0) return null;
    return this.load(list[list.length - 1].id);
  }

  /**
   * Find timepoint by timestamp (closest before or at)
   */
  findByTime(target: Date): TimePoint | null {
    const list = this.list();
    let closest: TimePointSummary | null = null;

    for (const tp of list) {
      if (tp.timestamp <= target) {
        closest = tp;
      } else {
        break;
      }
    }

    return closest ? this.load(closest.id) : null;
  }

  /**
   * Find timepoint by description search
   */
  findByDescription(query: string): TimePoint | null {
    const lower = query.toLowerCase();
    const list = this.list().reverse(); // Most recent first

    for (const tp of list) {
      if (tp.description.toLowerCase().includes(lower)) {
        return this.load(tp.id);
      }
    }

    return null;
  }

  /**
   * Delete old timepoints beyond max count
   */
  cleanup(maxCount: number): number {
    const list = this.list();
    if (list.length <= maxCount) return 0;

    const toDelete = list.slice(0, list.length - maxCount);
    let deleted = 0;

    for (const tp of toDelete) {
      const filePath = path.join(this.basePath, `${tp.id}.json`);
      try {
        fs.unlinkSync(filePath);
        this.index.delete(tp.id);
        deleted++;
      } catch { /* ignore */ }
    }

    this.saveIndex();
    return deleted;
  }

  /**
   * Delete specific timepoint
   */
  delete(id: string): void {
    const filePath = path.join(this.basePath, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.index.delete(id);
      this.saveIndex();
    }
  }

  /**
   * Get count of timepoints
   */
  count(): number {
    return this.index.size;
  }
}
