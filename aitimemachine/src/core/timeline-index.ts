import { TimeMachineEngine } from './engine.js';
import { BloomFilter } from './bloom-filter.js';

export interface TimelineQuery {
  startDate?: Date;
  endDate?: Date;
  filePath?: string;
  filePattern?: string; // glob pattern support
  content?: string;
  trigger?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'changes' | 'files';
  sortOrder?: 'asc' | 'desc';
}

export interface IndexedCheckpoint {
  id: string;
  timestamp: Date;
  description: string;
  files: string[];
  changesCount?: number;
  trigger?: { type: string; action?: string };
}

export class TimelineIndex {
  private checkpoints: IndexedCheckpoint[] = [];
  private fileIndex = new Map<string, Set<string>>(); // file -> checkpoint IDs
  private dirIndex = new Map<string, Set<string>>(); // directory -> checkpoint IDs
  private dateIndex = new Map<string, string[]>(); // date -> checkpoint IDs
  private bloomFilters = new Map<string, BloomFilter>(); // checkpoint ID -> bloom filter

  constructor(private engine: TimeMachineEngine) {
    this.buildIndexes();
  }

  buildIndexes(): void {
    this.checkpoints = [];
    this.fileIndex.clear();
    this.dirIndex.clear();
    this.dateIndex.clear();
    this.bloomFilters.clear();

    const timepoints = this.engine.listTimePoints();
    
    for (const tp of timepoints) {
      const fullTp = this.engine.getTimePoint(tp.id);
      if (!fullTp) continue;
      
      const indexed: IndexedCheckpoint = {
        id: tp.id,
        timestamp: tp.timestamp,
        description: tp.description,
        files: fullTp.files.map((f: any) => f.path),
        changesCount: tp.changesCount,
        trigger: tp.trigger
      };
      
      this.checkpoints.push(indexed);

      // Build bloom filter for fast file lookup
      const bloom = new BloomFilter(Math.max(indexed.files.length, 10));
      for (const file of indexed.files) {
        bloom.add(file);
        
        // Index by file
        if (!this.fileIndex.has(file)) {
          this.fileIndex.set(file, new Set());
        }
        this.fileIndex.get(file)!.add(tp.id);

        // Index by directory
        const parts = file.split('/');
        for (let i = 1; i <= parts.length - 1; i++) {
          const dir = parts.slice(0, i).join('/');
          if (!this.dirIndex.has(dir)) {
            this.dirIndex.set(dir, new Set());
          }
          this.dirIndex.get(dir)!.add(tp.id);
        }
      }
      this.bloomFilters.set(tp.id, bloom);

      // Index by date
      const dateKey = tp.timestamp.toISOString().split('T')[0];
      if (!this.dateIndex.has(dateKey)) {
        this.dateIndex.set(dateKey, []);
      }
      this.dateIndex.get(dateKey)!.push(tp.id);
    }

    // Sort by timestamp descending
    this.checkpoints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  query(query: TimelineQuery): IndexedCheckpoint[] {
    let results = [...this.checkpoints];

    // Filter by date range
    if (query.startDate) {
      results = results.filter(cp => cp.timestamp >= query.startDate!);
    }
    if (query.endDate) {
      results = results.filter(cp => cp.timestamp <= query.endDate!);
    }

    // Filter by exact file path
    if (query.filePath) {
      const checkpointIds = this.fileIndex.get(query.filePath);
      if (checkpointIds) {
        results = results.filter(cp => checkpointIds.has(cp.id));
      } else {
        results = [];
      }
    }

    // Filter by file pattern (glob-like)
    if (query.filePattern) {
      const pattern = query.filePattern;
      results = results.filter(cp => {
        // Use bloom filter for quick rejection
        const bloom = this.bloomFilters.get(cp.id);
        if (!bloom) return false;
        
        // Check if any file matches pattern
        return cp.files.some(f => this.matchPattern(f, pattern));
      });
    }

    // Filter by content (description search)
    if (query.content) {
      const lower = query.content.toLowerCase();
      results = results.filter(cp => 
        cp.description.toLowerCase().includes(lower)
      );
    }

    // Filter by trigger type
    if (query.trigger) {
      results = results.filter(cp => 
        cp.trigger?.type === query.trigger || cp.trigger?.action?.includes(query.trigger!)
      );
    }

    // Sort
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    if (query.sortBy === 'changes') {
      results.sort((a, b) => ((b.changesCount || 0) - (a.changesCount || 0)) * sortOrder);
    } else if (query.sortBy === 'files') {
      results.sort((a, b) => (b.files.length - a.files.length) * sortOrder);
    } else {
      results.sort((a, b) => (b.timestamp.getTime() - a.timestamp.getTime()) * sortOrder);
    }

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    
    return results.slice(offset, offset + limit);
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    // Simple glob matching: * matches any chars, ** matches any path
    const regex = pattern
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(filePath);
  }

  getCheckpointsByFile(filePath: string): IndexedCheckpoint[] {
    const checkpointIds = this.fileIndex.get(filePath);
    if (!checkpointIds) return [];
    return this.checkpoints.filter(cp => checkpointIds.has(cp.id));
  }

  getCheckpointsByDirectory(dirPath: string): IndexedCheckpoint[] {
    const checkpointIds = this.dirIndex.get(dirPath);
    if (!checkpointIds) return [];
    return this.checkpoints.filter(cp => checkpointIds.has(cp.id));
  }

  getCheckpointsByDate(date: Date): IndexedCheckpoint[] {
    const dateKey = date.toISOString().split('T')[0];
    const checkpointIds = this.dateIndex.get(dateKey);
    if (!checkpointIds) return [];
    return this.checkpoints.filter(cp => checkpointIds.includes(cp.id));
  }

  getCheckpointsByDateRange(start: Date, end: Date): IndexedCheckpoint[] {
    return this.checkpoints.filter(cp => 
      cp.timestamp >= start && cp.timestamp <= end
    );
  }

  hasFile(checkpointId: string, filePath: string): boolean {
    const bloom = this.bloomFilters.get(checkpointId);
    if (!bloom) return false;
    return bloom.has(filePath);
  }

  getAllCheckpoints(): IndexedCheckpoint[] {
    return this.checkpoints;
  }

  refresh(): void {
    this.buildIndexes();
  }
}
