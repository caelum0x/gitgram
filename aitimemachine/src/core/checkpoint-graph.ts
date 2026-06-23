/**
 * Checkpoint Graph - ported from Git's commit-graph.c
 * Provides O(1) checkpoint lookup using fanout table
 */

import * as fs from 'fs';
import * as path from 'path';
import { EnhancedBloomFilter, CheckpointBloom } from './bloom-filter-v2.js';

export interface CheckpointNode {
  id: string;
  timestamp: Date;
  description: string;
  parentId?: string;
  files: string[];
  stats: {
    totalFiles: number;
    totalSize: number;
  };
  bloomFilter?: EnhancedBloomFilter;
}

export interface TimelineOptions {
  after?: Date;
  before?: Date;
  path?: string;
  author?: string;
  limit?: number;
  offset?: number;
}

interface GraphHeader {
  signature: string;
  version: number;
  checkpointCount: number;
}

/**
 * Checkpoint Graph with O(1) lookup using fanout table
 * Based on Git's commit-graph format
 */
export class CheckpointGraph {
  private header: GraphHeader;
  private fanout: Uint32Array; // 256 entries for first byte lookup
  private checkpoints: Map<string, CheckpointNode>;
  private sortedIds: string[]; // Sorted by hash for binary search
  private dateIndex: Map<string, string[]>; // date -> checkpoint IDs
  private bloomFilters: Map<string, EnhancedBloomFilter>;

  constructor(private dataDir: string) {
    this.header = { signature: 'CKPT', version: 1, checkpointCount: 0 };
    this.fanout = new Uint32Array(256);
    this.checkpoints = new Map();
    this.sortedIds = [];
    this.dateIndex = new Map();
    this.bloomFilters = new Map();
  }

  /**
   * Build graph from checkpoint data
   */
  async build(checkpoints: CheckpointNode[]): Promise<void> {
    this.checkpoints.clear();
    this.sortedIds = [];
    this.dateIndex.clear();
    this.bloomFilters.clear();

    // Sort checkpoints by ID for binary search
    checkpoints.sort((a, b) => a.id.localeCompare(b.id));

    for (const cp of checkpoints) {
      this.checkpoints.set(cp.id, cp);
      this.sortedIds.push(cp.id);

      // Build date index
      const dateKey = cp.timestamp.toISOString().split('T')[0];
      if (!this.dateIndex.has(dateKey)) {
        this.dateIndex.set(dateKey, []);
      }
      this.dateIndex.get(dateKey)!.push(cp.id);

      // Build bloom filter for file lookup
      const bloom = CheckpointBloom.build(cp.files);
      this.bloomFilters.set(cp.id, bloom);
      cp.bloomFilter = bloom;
    }

    // Build fanout table for O(1) lookup
    this.buildFanout();
    this.header.checkpointCount = checkpoints.length;
  }

  /**
   * Build fanout table - ported from commit-graph.c
   * fanout[i] = count of checkpoints with first byte <= i
   */
  private buildFanout(): void {
    this.fanout.fill(0);

    for (const id of this.sortedIds) {
      const firstByte = parseInt(id.slice(0, 2), 16);
      for (let i = firstByte; i < 256; i++) {
        this.fanout[i]++;
      }
    }
  }

  /**
   * O(1) checkpoint lookup using fanout table
   */
  lookup(checkpointId: string): CheckpointNode | null {
    if (this.sortedIds.length === 0) return null;

    const firstByte = parseInt(checkpointId.slice(0, 2), 16);
    const start = firstByte === 0 ? 0 : this.fanout[firstByte - 1];
    const end = this.fanout[firstByte];

    // Binary search in range
    let lo = start, hi = end;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const cmp = this.sortedIds[mid].localeCompare(checkpointId);
      if (cmp === 0) {
        return this.checkpoints.get(this.sortedIds[mid]) || null;
      } else if (cmp < 0) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    return null;
  }

  /**
   * Query timeline with filters
   */
  getTimeline(options: TimelineOptions = {}): CheckpointNode[] {
    let results: CheckpointNode[] = [];

    // If path filter, use bloom filters for fast pre-filtering
    if (options.path) {
      this.bloomFilters.forEach((bloom, id) => {
        if (bloom.mayContain(options.path!)) {
          const cp = this.checkpoints.get(id);
          if (cp) results.push(cp);
        }
      });
    } else {
      results = Array.from(this.checkpoints.values());
    }

    // Filter by date range
    if (options.after) {
      results = results.filter(cp => cp.timestamp >= options.after!);
    }
    if (options.before) {
      results = results.filter(cp => cp.timestamp <= options.before!);
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 50;
    return results.slice(offset, offset + limit);
  }

  /**
   * Fast file lookup using bloom filter
   */
  checkpointMightContainFile(checkpointId: string, filePath: string): boolean {
    const bloom = this.bloomFilters.get(checkpointId);
    if (!bloom) return false;
    return bloom.mayContain(filePath);
  }

  /**
   * Get checkpoints that might contain a file
   */
  findCheckpointsWithFile(filePath: string): CheckpointNode[] {
    const results: CheckpointNode[] = [];
    
    this.bloomFilters.forEach((bloom, id) => {
      if (bloom.mayContain(filePath)) {
        const cp = this.checkpoints.get(id);
        if (cp && cp.files.includes(filePath)) {
          results.push(cp);
        }
      }
    });

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Topological sort - ported from revision.c
   */
  topologicalSort(): CheckpointNode[] {
    const inDegree = new Map<string, number>();
    const children = new Map<string, string[]>();

    // Build adjacency list
    this.checkpoints.forEach((cp) => {
      if (!inDegree.has(cp.id)) inDegree.set(cp.id, 0);
      if (cp.parentId) {
        const childList = children.get(cp.parentId) || [];
        childList.push(cp.id);
        children.set(cp.parentId, childList);
        inDegree.set(cp.id, (inDegree.get(cp.id) || 0) + 1);
      }
    });

    // Kahn's algorithm
    const queue: string[] = [];
    const sorted: CheckpointNode[] = [];

    inDegree.forEach((degree, id) => {
      if (degree === 0) queue.push(id);
    });

    while (queue.length > 0) {
      const current = queue.shift()!;
      const cp = this.checkpoints.get(current);
      if (cp) sorted.push(cp);

      for (const child of children.get(current) || []) {
        inDegree.set(child, inDegree.get(child)! - 1);
        if (inDegree.get(child) === 0) {
          queue.push(child);
        }
      }
    }

    return sorted;
  }

  /**
   * Get ancestors of a checkpoint
   */
  getAncestors(checkpointId: string, limit: number = 100): CheckpointNode[] {
    const ancestors: CheckpointNode[] = [];
    let current = this.lookup(checkpointId);

    while (current && ancestors.length < limit) {
      if (current.parentId) {
        const parent = this.lookup(current.parentId);
        if (parent) {
          ancestors.push(parent);
          current = parent;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Serialize graph to file
   */
  async save(graphPath: string): Promise<void> {
    const data = {
      header: this.header,
      fanout: Array.from(this.fanout),
      checkpoints: Array.from(this.checkpoints.entries()).map(([id, cp]) => ({
        ...cp,
        timestamp: cp.timestamp.toISOString(),
        bloomFilter: cp.bloomFilter?.serialize().toString('base64')
      }))
    };
    await fs.promises.writeFile(graphPath, JSON.stringify(data));
  }

  /**
   * Load graph from file
   */
  async load(graphPath: string): Promise<void> {
    const content = await fs.promises.readFile(graphPath, 'utf-8');
    const data = JSON.parse(content);

    this.header = data.header;
    this.fanout = new Uint32Array(data.fanout);
    this.checkpoints.clear();
    this.sortedIds = [];
    this.bloomFilters.clear();

    for (const cpData of data.checkpoints) {
      const cp: CheckpointNode = {
        ...cpData,
        timestamp: new Date(cpData.timestamp),
        bloomFilter: cpData.bloomFilter 
          ? EnhancedBloomFilter.deserialize(Buffer.from(cpData.bloomFilter, 'base64'))
          : undefined
      };
      this.checkpoints.set(cp.id, cp);
      this.sortedIds.push(cp.id);
      if (cp.bloomFilter) {
        this.bloomFilters.set(cp.id, cp.bloomFilter);
      }
    }

    this.sortedIds.sort();
  }

  /**
   * Get graph statistics
   */
  getStats(): { checkpointCount: number; totalFiles: number; totalSize: number } {
    let totalFiles = 0;
    let totalSize = 0;

    this.checkpoints.forEach((cp) => {
      totalFiles += cp.stats.totalFiles;
      totalSize += cp.stats.totalSize;
    });

    return {
      checkpointCount: this.checkpoints.size,
      totalFiles,
      totalSize
    };
  }
}
