# Git Internals Integration Guide for AITimeMachine

## Executive Summary

This document provides a comprehensive guide for integrating Git's battle-tested algorithms and data structures into AITimeMachine. The goal is to build a **macOS Time Machine for AI Development** that enables:

1. **Go back in time** - Restore files + chat context to any checkpoint
2. **See what changed** - Visual diff with multiple algorithms
3. **Browse timeline** - Time Machine-style UI with 3D visualization
4. **Restore specific files** - Selective restore with conflict resolution

---

## Table of Contents

1. [Git Source Files Reference](#1-git-source-files-reference)
2. [Object Storage System](#2-object-storage-system)
3. [Diff Algorithms](#3-diff-algorithms)
4. [Tree Walking & File Restoration](#4-tree-walking--file-restoration)
5. [Timeline & History](#5-timeline--history)
6. [Bloom Filters for Fast Lookup](#6-bloom-filters-for-fast-lookup)
7. [Pack Files & Compression](#7-pack-files--compression)
8. [Implementation Mapping](#8-implementation-mapping)
9. [Product Integration](#9-product-integration)

---

## 1. Git Source Files Reference

### Core Storage
| Git File | Purpose | AITimeMachine Equivalent |
|----------|---------|--------------------------|
| `object-file.c` | Content-addressable storage | `src/core/cas.ts`, `src/core/content-store.ts` |
| `loose.c` | Individual object storage | `src/core/storage.ts` |
| `pack-objects.c` | Pack file generation | `src/core/pack/` |
| `sha1-file.c` | Hash computation | Built-in crypto module |

### Diff & Comparison
| Git File | Purpose | AITimeMachine Equivalent |
|----------|---------|--------------------------|
| `diff.c` | Main diff interface (7500+ lines) | `src/core/diff-engine.ts` |
| `xdiff/xdiffi.c` | Myers O(ND) algorithm | To be ported |
| `xdiff/xpatience.c` | Patience diff | To be ported |
| `xdiff/xhistogram.c` | Histogram diff | To be ported |
| `diffcore-*.c` | Diff optimizations | To be implemented |

### Tree & Checkout
| Git File | Purpose | AITimeMachine Equivalent |
|----------|---------|--------------------------|
| `tree-walk.c` | Tree traversal | `src/core/file-scanner.ts` |
| `checkout.c` | File checkout | `src/core/selective-restore.ts` |
| `unpack-trees.c` | Tree unpacking | `src/core/restore.ts` |
| `merge-ort.c` | Modern merge algorithm | To be implemented |

### History & Timeline
| Git File | Purpose | AITimeMachine Equivalent |
|----------|---------|--------------------------|
| `revision.c` | Revision walking (4500+ lines) | `src/core/timepoint-manager.ts` |
| `commit-graph.c` | Fast commit access | `src/core/timeline-index.ts` |
| `log-tree.c` | History display | CLI/Extension timeline |

### Search & Indexing
| Git File | Purpose | AITimeMachine Equivalent |
|----------|---------|--------------------------|
| `grep.c` | Content search | `src/core/search-engine.ts` |
| `bloom.c` | Bloom filters | `src/core/bloom-filter.ts` |

---

## 2. Object Storage System

### Git's Approach (from `object-file.c`)

```c
// Git stores objects with SHA-1 hash as the key
// Path structure: .git/objects/ab/cdef1234...
static void fill_loose_path(struct strbuf *buf,
                            const struct object_id *oid,
                            const struct git_hash_algo *algop)
{
    for (size_t i = 0; i < algop->rawsz; i++) {
        static char hex[] = "0123456789abcdef";
        unsigned int val = oid->hash[i];
        strbuf_addch(buf, hex[val >> 4]);
        strbuf_addch(buf, hex[val & 0xf]);
        if (!i)
            strbuf_addch(buf, '/');  // Split after first byte
    }
}
```

### AITimeMachine Implementation

**Current** (`src/core/cas.ts`):
```typescript
// Already using content-addressable storage with SHA-256
export class CasStore {
  put(content: Buffer): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const dir = path.join(this.basePath, hash.slice(0, 2));
    const file = path.join(dir, hash.slice(2));
    // Store with deduplication
  }
}
```

### Enhancements Needed

1. **Streaming Support** (from `odb/streaming.c`)
   - Handle large files without loading into memory
   - Progressive hashing during read

2. **Object Types** (from `object.h`)
   ```typescript
   enum ObjectType {
     BLOB = 'blob',      // File content
     TREE = 'tree',      // Directory structure
     CHECKPOINT = 'checkpoint',  // Like git commit
     CONVERSATION = 'conversation'  // Chat history
   }
   ```

3. **Loose vs Packed** (from `packfile.c`)
   - Store recent objects as loose files (fast write)
   - Pack older objects for efficiency (slow write, fast read, compressed)

---

## 3. Diff Algorithms

### Git's xdiff Library

Git uses the LibXDiff library with multiple algorithms:

#### 3.1 Myers Algorithm (from `xdiff/xdiffi.c`)

The core O(ND) difference algorithm:

```c
/*
 * See "An O(ND) Difference Algorithm and its Variations", by Eugene Myers.
 * Considers a "box" and scans from both forward and backward diagonals.
 * Returns the furthest point of reach.
 */
static long xdl_split(xdfile_t *xdf1, long off1, long lim1,
                      xdfile_t *xdf2, long off2, long lim2,
                      long *kvdf, long *kvdb, int need_min, 
                      xdpsplit_t *spl, xdalgoenv_t *xenv)
{
    // Forward and backward diagonal scanning
    // D-path computation with snake detection
}
```

#### 3.2 Patience Diff (from `xdiff/xpatience.c`)

Better for code with common lines:
- Find unique matching lines first
- Use these as anchors
- Apply Myers between anchors

#### 3.3 Histogram Diff (from `xdiff/xhistogram.c`)

Optimized for large files:
- Build histogram of line occurrences
- Find low-occurrence matches as anchors
- Faster than patience for large files

### AITimeMachine Implementation

**Current** (`src/core/diff-engine.ts`):
```typescript
// Using npm 'diff' package - basic Myers only
import { diffLines } from 'diff';
```

**Enhanced Implementation**:

```typescript
// src/core/diff-engine-v2.ts

export interface DiffAlgorithmOptions {
  algorithm: 'myers' | 'patience' | 'histogram';
  context: number;
  ignoreWhitespace: boolean;
  colorMoved: boolean;  // Git's moved line detection
}

export class AdvancedDiffEngine {
  // Port from xdiff/xdiffi.c
  private myersDiff(oldLines: string[], newLines: string[]): Edit[] {
    const N = oldLines.length;
    const M = newLines.length;
    const MAX = N + M;
    
    // V array for furthest reaching D-paths
    const V = new Int32Array(2 * MAX + 1);
    const offset = MAX;
    V[offset + 1] = 0;
    
    const trace: Int32Array[] = [];
    
    for (let D = 0; D <= MAX; D++) {
      trace.push(V.slice());
      
      for (let k = -D; k <= D; k += 2) {
        let x: number;
        if (k === -D || (k !== D && V[offset + k - 1] < V[offset + k + 1])) {
          x = V[offset + k + 1];  // Move down
        } else {
          x = V[offset + k - 1] + 1;  // Move right
        }
        
        let y = x - k;
        
        // Extend diagonal (snake)
        while (x < N && y < M && oldLines[x] === newLines[y]) {
          x++; y++;
        }
        
        V[offset + k] = x;
        
        if (x >= N && y >= M) {
          return this.backtrack(trace, N, M);
        }
      }
    }
    
    return [];
  }
  
  // Port from xdiff/xpatience.c
  private patienceDiff(oldLines: string[], newLines: string[]): Edit[] {
    // Find unique lines in both files
    const uniqueOld = this.findUniqueLines(oldLines);
    const uniqueNew = this.findUniqueLines(newLines);
    
    // Find longest common subsequence of unique lines
    const anchors = this.longestCommonSubsequence(uniqueOld, uniqueNew);
    
    // Recursively diff between anchors
    return this.diffBetweenAnchors(oldLines, newLines, anchors);
  }
  
  // Port from xdiff/xhistogram.c  
  private histogramDiff(oldLines: string[], newLines: string[]): Edit[] {
    // Build histogram of line occurrences
    const histogram = new Map<string, { oldCount: number, newCount: number }>();
    
    for (const line of oldLines) {
      const entry = histogram.get(line) || { oldCount: 0, newCount: 0 };
      entry.oldCount++;
      histogram.set(line, entry);
    }
    
    for (const line of newLines) {
      const entry = histogram.get(line) || { oldCount: 0, newCount: 0 };
      entry.newCount++;
      histogram.set(line, entry);
    }
    
    // Find lowest occurrence matches as anchors
    // Continue with recursive diff
  }
}
```

### Diff Caching (from `src/core/diff-cache.ts`)

Git caches diff results for performance. Enhance existing implementation:

```typescript
export class DiffCache {
  private cache: LRUCache<string, DiffResult>;
  private packFile?: PackedDiffStore;
  
  async getDiff(
    oldHash: string, 
    newHash: string, 
    options: DiffOptions
  ): Promise<DiffResult> {
    const cacheKey = `${oldHash}:${newHash}:${JSON.stringify(options)}`;
    
    // Check memory cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    // Check pack file cache
    if (this.packFile?.has(cacheKey)) {
      return this.packFile.get(cacheKey);
    }
    
    // Compute and cache
    const result = await this.computeDiff(oldHash, newHash, options);
    this.cache.set(cacheKey, result);
    return result;
  }
}
```

---

## 4. Tree Walking & File Restoration

### Git's Tree Walk (from `tree-walk.c`)

```c
// Decode tree entry - parses mode, path, and object ID
static int decode_tree_entry(struct tree_desc *desc, 
                             const char *buf, 
                             unsigned long size,
                             struct strbuf *err)
{
    // Parse mode (permissions)
    path = parse_mode(buf, &mode);
    
    // Get filename
    len = strlen(path) + 1;
    
    // Store entry info
    desc->entry.path = path;
    desc->entry.mode = canon_mode(mode);
    desc->entry.pathlen = len - 1;
    
    // Read object ID (hash)
    oidread(&desc->entry.oid, (const unsigned char *)path + len, desc->algo);
}
```

### Selective Restore (from `checkout.c` and `unpack-trees.c`)

**Current** (`src/core/selective-restore.ts`):
```typescript
// Already implemented basic selective restore
export class SelectiveRestore {
  matchFiles(manifest: any[], patterns: string[]): any[];
  detectConflicts(files: any[]): Conflict[];
  restore(options: RestoreOptions): RestoreResult;
}
```

**Enhanced Implementation** (based on Git's approach):

```typescript
// src/core/tree-restore.ts

export interface RestoreStrategy {
  type: 'ours' | 'theirs' | 'union' | 'merge-ort';
}

export class TreeRestore {
  // Port from unpack-trees.c - atomic restore
  async restoreTree(
    checkpointId: string,
    patterns: string[],
    options: RestoreOptions
  ): Promise<RestoreResult> {
    
    // 1. Load checkpoint manifest (tree)
    const tree = await this.loadCheckpointTree(checkpointId);
    
    // 2. Filter by patterns (like git checkout -- <paths>)
    const matchedEntries = this.matchPatterns(tree, patterns);
    
    // 3. Create restore plan
    const plan = await this.createRestorePlan(matchedEntries);
    
    // 4. Detect conflicts with current state
    const conflicts = await this.detectConflicts(plan);
    
    // 5. Handle conflicts based on strategy
    if (conflicts.length > 0) {
      if (options.strategy.type === 'merge-ort') {
        return this.threeWayMerge(plan, conflicts, options);
      }
    }
    
    // 6. Create atomic backup
    const backupId = await this.createBackup(plan);
    
    // 7. Perform atomic restore
    try {
      await this.atomicRestore(plan);
      return { success: true, backupId, restored: plan.files };
    } catch (error) {
      await this.rollback(backupId);
      throw error;
    }
  }
  
  // Port from merge-ort.c - modern merge
  private async threeWayMerge(
    plan: RestorePlan,
    conflicts: Conflict[],
    options: RestoreOptions
  ): Promise<RestoreResult> {
    const results: MergeResult[] = [];
    
    for (const conflict of conflicts) {
      // Get three versions: base, ours, theirs
      const base = await this.getBaseVersion(conflict.path);
      const ours = await this.getCurrentVersion(conflict.path);
      const theirs = await this.getCheckpointVersion(conflict.path);
      
      // Three-way merge
      const merged = await this.mergeContent(base, ours, theirs);
      
      if (merged.hasConflicts) {
        results.push({
          path: conflict.path,
          status: 'conflict',
          markers: merged.conflictMarkers
        });
      } else {
        results.push({
          path: conflict.path,
          status: 'merged',
          content: merged.content
        });
      }
    }
    
    return { success: true, mergeResults: results };
  }
}
```

---

## 5. Timeline & History

### Git's Revision Walking (from `revision.c`)

The 4500+ line `revision.c` is the heart of Git's history traversal:

```c
// Core revision walking structure
struct rev_info {
    struct commit_list *commits;
    struct commit_list *pending;
    
    // Filtering options
    const char *path;
    unsigned int after_date;
    unsigned int before_date;
    
    // Graph options
    unsigned reverse:1;
    unsigned topo_order:1;
    unsigned first_parent_only:1;
};
```

### Commit Graph (from `commit-graph.c`)

Git's optimization for fast commit access:

```c
// Chunk-based format for fast loading
#define GRAPH_CHUNKID_OIDFANOUT 0x4f494446  // "OIDF"
#define GRAPH_CHUNKID_OIDLOOKUP 0x4f49444c  // "OIDL"
#define GRAPH_CHUNKID_DATA 0x43444154       // "CDAT"
#define GRAPH_CHUNKID_BLOOMINDEXES 0x42494458
```

### AITimeMachine Implementation

**Enhanced Timeline Index** (`src/core/timeline-index.ts`):

```typescript
// Port concepts from commit-graph.c

interface CheckpointGraphHeader {
  signature: 'CKPT';      // Checkpoint graph
  version: number;
  hashAlgorithm: 'sha256';
  chunkCount: number;
}

interface CheckpointGraphChunks {
  oidFanout: Uint32Array;    // 256 entries for O(1) lookup
  oidLookup: Buffer;          // Sorted checkpoint IDs
  data: Buffer;               // Checkpoint metadata
  bloomIndexes?: Uint32Array; // Bloom filter offsets
  bloomData?: Buffer;         // Bloom filter data
}

export class CheckpointGraph {
  private header: CheckpointGraphHeader;
  private fanout: Uint32Array;
  private checkpoints: Map<string, CheckpointNode>;
  
  // Fast O(1) checkpoint lookup using fanout
  lookup(checkpointId: string): CheckpointNode | null {
    const firstByte = parseInt(checkpointId.slice(0, 2), 16);
    const start = firstByte === 0 ? 0 : this.fanout[firstByte - 1];
    const end = this.fanout[firstByte];
    
    // Binary search in range
    return this.binarySearch(checkpointId, start, end);
  }
  
  // Efficient timeline query with date filtering
  getTimeline(options: TimelineOptions): CheckpointNode[] {
    const results: CheckpointNode[] = [];
    
    // Use date index for range query
    const dateRange = this.dateIndex.range(
      options.after?.getTime() || 0,
      options.before?.getTime() || Date.now()
    );
    
    for (const checkpointId of dateRange) {
      const node = this.lookup(checkpointId);
      if (!node) continue;
      
      // Filter by file path using bloom filter
      if (options.path && !this.bloomContains(node, options.path)) {
        continue;
      }
      
      results.push(node);
    }
    
    return results;
  }
  
  // Port from revision.c - topological sort
  topologicalSort(checkpoints: CheckpointNode[]): CheckpointNode[] {
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();
    
    // Build adjacency list
    for (const cp of checkpoints) {
      if (!inDegree.has(cp.id)) inDegree.set(cp.id, 0);
      if (cp.parentId) {
        const children = graph.get(cp.parentId) || [];
        children.push(cp.id);
        graph.set(cp.parentId, children);
        inDegree.set(cp.id, (inDegree.get(cp.id) || 0) + 1);
      }
    }
    
    // Kahn's algorithm
    const queue: string[] = [];
    const sorted: CheckpointNode[] = [];
    
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(this.lookup(current)!);
      
      for (const child of graph.get(current) || []) {
        inDegree.set(child, inDegree.get(child)! - 1);
        if (inDegree.get(child) === 0) {
          queue.push(child);
        }
      }
    }
    
    return sorted;
  }
}
```

---

## 6. Bloom Filters for Fast Lookup

### Git's Bloom Filter (from `bloom.c`)

Git uses bloom filters to quickly determine if a checkpoint modified a specific file:

```c
// MurmurHash3 for bloom filter hashing
static uint32_t murmur3_seeded_v2(uint32_t seed, const char *data, size_t len)
{
    const uint32_t c1 = 0xcc9e2d51;
    const uint32_t c2 = 0x1b873593;
    // ... hash computation
}

// Bloom filter structure
struct bloom_filter {
    unsigned char *data;
    size_t len;
    int version;
};
```

### AITimeMachine Implementation

**Enhanced Bloom Filter** (`src/core/bloom-filter.ts`):

```typescript
// Port from bloom.c

const BLOOM_HASH_SEED_1 = 0x9747b28c;
const BLOOM_HASH_SEED_2 = 0xbadd00d1;
const BITS_PER_WORD = 8;

export class BloomFilter {
  private data: Uint8Array;
  private numHashes: number;
  private size: number;
  
  constructor(expectedItems: number, falsePositiveRate: number = 0.01) {
    // Calculate optimal size
    const m = Math.ceil(-expectedItems * Math.log(falsePositiveRate) / 
                        (Math.log(2) ** 2));
    this.size = m;
    this.data = new Uint8Array(Math.ceil(m / BITS_PER_WORD));
    this.numHashes = Math.ceil((m / expectedItems) * Math.log(2));
  }
  
  // Port MurmurHash3 from bloom.c
  private murmur3(seed: number, data: string): number {
    const c1 = 0xcc9e2d51;
    const c2 = 0x1b873593;
    let h1 = seed;
    
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    
    for (let i = 0; i < bytes.length - 3; i += 4) {
      let k1 = bytes[i] | (bytes[i + 1] << 8) | 
               (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
      
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      
      h1 ^= k1;
      h1 = (h1 << 13) | (h1 >>> 19);
      h1 = Math.imul(h1, 5) + 0xe6546b64;
    }
    
    // Handle remaining bytes
    // ... finalization
    
    return h1 >>> 0;
  }
  
  // Get bit positions for a path
  private getPositions(path: string): number[] {
    const positions: number[] = [];
    const hash1 = this.murmur3(BLOOM_HASH_SEED_1, path);
    const hash2 = this.murmur3(BLOOM_HASH_SEED_2, path);
    
    for (let i = 0; i < this.numHashes; i++) {
      const combinedHash = (hash1 + i * hash2) >>> 0;
      positions.push(combinedHash % this.size);
    }
    
    return positions;
  }
  
  add(path: string): void {
    for (const pos of this.getPositions(path)) {
      const byteIndex = Math.floor(pos / BITS_PER_WORD);
      const bitIndex = pos % BITS_PER_WORD;
      this.data[byteIndex] |= (1 << bitIndex);
    }
  }
  
  mayContain(path: string): boolean {
    for (const pos of this.getPositions(path)) {
      const byteIndex = Math.floor(pos / BITS_PER_WORD);
      const bitIndex = pos % BITS_PER_WORD;
      if (!(this.data[byteIndex] & (1 << bitIndex))) {
        return false;
      }
    }
    return true;
  }
  
  // Serialize for storage
  serialize(): Buffer {
    const header = Buffer.alloc(12);
    header.writeUInt32LE(this.size, 0);
    header.writeUInt32LE(this.numHashes, 4);
    header.writeUInt32LE(this.data.length, 8);
    return Buffer.concat([header, Buffer.from(this.data)]);
  }
  
  static deserialize(buffer: Buffer): BloomFilter {
    const size = buffer.readUInt32LE(0);
    const numHashes = buffer.readUInt32LE(4);
    const dataLen = buffer.readUInt32LE(8);
    
    const filter = Object.create(BloomFilter.prototype);
    filter.size = size;
    filter.numHashes = numHashes;
    filter.data = new Uint8Array(buffer.slice(12, 12 + dataLen));
    
    return filter;
  }
}

// Use in checkpoint for fast file lookup
export class CheckpointBloom {
  // Build bloom filter when creating checkpoint
  static build(files: string[]): BloomFilter {
    const filter = new BloomFilter(files.length);
    for (const file of files) {
      filter.add(file);
      // Also add parent directories
      let dir = file;
      while ((dir = path.dirname(dir)) !== '.') {
        filter.add(dir + '/');
      }
    }
    return filter;
  }
  
  // Fast check if checkpoint might contain path
  static mightContain(filter: BloomFilter, path: string): boolean {
    return filter.mayContain(path);
  }
}
```

---

## 7. Pack Files & Compression

### Git's Pack Format (from `pack-objects.c`, `packfile.c`)

```c
// Pack file structure
// [header][object entries...][checksum]

// Object entry types
#define OBJ_COMMIT    1
#define OBJ_TREE      2
#define OBJ_BLOB      3
#define OBJ_OFS_DELTA 6  // Delta against offset
#define OBJ_REF_DELTA 7  // Delta against SHA

// Delta compression for similar objects
struct packing_data {
    struct object_entry *objects;
    uint32_t nr_objects;
    uint32_t nr_alloc;
    uint32_t *index;
    uint32_t index_size;
};
```

### AITimeMachine Pack Implementation

```typescript
// src/core/pack/pack-writer.ts

interface PackHeader {
  signature: 'PACK';
  version: 2;
  objectCount: number;
}

interface PackEntry {
  type: 'blob' | 'tree' | 'checkpoint' | 'delta-ofs' | 'delta-ref';
  size: number;
  data: Buffer;
  deltaBase?: string | number;  // Hash or offset
}

export class PackWriter {
  private entries: PackEntry[] = [];
  private index: Map<string, { offset: number, size: number }> = new Map();
  
  // Add object with optional delta compression
  addObject(hash: string, content: Buffer, type: string): void {
    // Check for similar existing object for delta
    const deltaBase = this.findDeltaBase(content);
    
    if (deltaBase) {
      const delta = this.createDelta(deltaBase.content, content);
      if (delta.length < content.length * 0.9) {  // Only if saves space
        this.entries.push({
          type: 'delta-ref',
          size: delta.length,
          data: delta,
          deltaBase: deltaBase.hash
        });
        return;
      }
    }
    
    // Store as full object (compressed)
    const compressed = zlib.deflateSync(content);
    this.entries.push({
      type: type as any,
      size: content.length,
      data: compressed
    });
  }
  
  // Port from diff-delta.c
  private createDelta(base: Buffer, target: Buffer): Buffer {
    // Variable-length encoding for source and target size
    const header = Buffer.alloc(20);
    let pos = 0;
    
    pos = this.writeVarint(header, pos, base.length);
    pos = this.writeVarint(header, pos, target.length);
    
    // Generate delta instructions
    // Copy from base: 0x80 | (offset_bytes | size_bytes)
    // Insert data: length followed by bytes
    
    const instructions: Buffer[] = [header.slice(0, pos)];
    
    // Rabin fingerprinting for finding matches
    const matches = this.findMatches(base, target);
    
    let targetPos = 0;
    for (const match of matches) {
      // Insert any non-matching bytes
      if (match.targetOffset > targetPos) {
        const insert = target.slice(targetPos, match.targetOffset);
        instructions.push(this.encodeInsert(insert));
      }
      
      // Copy from base
      instructions.push(this.encodeCopy(match.baseOffset, match.length));
      targetPos = match.targetOffset + match.length;
    }
    
    // Insert remaining bytes
    if (targetPos < target.length) {
      instructions.push(this.encodeInsert(target.slice(targetPos)));
    }
    
    return Buffer.concat(instructions);
  }
  
  // Write pack file
  write(outputPath: string): void {
    const fd = fs.openSync(outputPath, 'w');
    let offset = 0;
    
    // Write header
    const header = Buffer.alloc(12);
    header.write('PACK', 0, 4);
    header.writeUInt32BE(2, 4);  // Version
    header.writeUInt32BE(this.entries.length, 8);
    fs.writeSync(fd, header);
    offset += 12;
    
    // Write entries and build index
    for (const entry of this.entries) {
      const entryHeader = this.encodeEntryHeader(entry);
      fs.writeSync(fd, entryHeader);
      fs.writeSync(fd, entry.data);
      offset += entryHeader.length + entry.data.length;
    }
    
    // Write SHA-256 of pack
    // Write index file separately
    
    fs.closeSync(fd);
  }
}
```

---

## 8. Implementation Mapping

### Product-to-Git Feature Mapping

| Product Feature | Git Implementation | AITimeMachine File | Priority |
|-----------------|-------------------|-------------------|----------|
| **MCP Server** |
| Create checkpoint | `git commit` | `src/mcp/server.ts` | ✅ Done |
| Restore checkpoint | `git checkout` | `src/mcp/server.ts` | ✅ Done |
| Selective restore | `git checkout -- <path>` | `src/core/selective-restore.ts` | ✅ Done |
| File diff | `git diff` | `src/core/diff-engine.ts` | 🔄 Enhance |
| Timeline query | `git log` | `src/core/timeline-index.ts` | 🔄 Enhance |
| Search | `git grep` | `src/core/search-engine.ts` | 🔄 Enhance |
| **CLI** |
| `aitm checkpoint` | `git commit` | `src/cli.ts` | ✅ Done |
| `aitm restore` | `git checkout` | `src/cli.ts` | ✅ Done |
| `aitm diff` | `git diff` | `src/cli.ts` | ✅ Done |
| `aitm timeline` | `git log` | `src/cli.ts` | 🔄 Enhance |
| `aitm search` | `git grep` | `src/cli.ts` | 🔄 Enhance |
| `aitm gc` | `git gc` | `src/core/gc.ts` | ✅ Done |
| **Extension** |
| Timeline view | `gitk` | `kilocode/src/services/checkpoints/` | ✅ Done |
| Diff view | Native diff editor | VSCode integration | ✅ Done |
| Restore UI | Git GUI | `kilocode/webview-ui/src/components/aitm/` | ✅ Done |
| **API** |
| REST endpoints | `git http-backend` | `src/api-server.ts` | ✅ Done |
| WebSocket | `git upload-pack` streaming | Planned | 📋 TODO |
| **Website** |
| 3D Timeline | Time Machine UI | `website/` | 🔄 Enhance |

### Implementation Phases

#### Phase 1: Core Algorithms (Week 1-2)
```
□ Port Myers diff algorithm from xdiff/xdiffi.c
□ Port patience diff from xdiff/xpatience.c
□ Port histogram diff from xdiff/xhistogram.c
□ Implement diff caching with pack storage
□ Port bloom filter from bloom.c
□ Implement checkpoint graph from commit-graph.c
```

#### Phase 2: Enhanced Restore (Week 3-4)
```
□ Port tree walking from tree-walk.c
□ Implement 3-way merge from merge-ort.c
□ Add conflict markers and resolution
□ Implement atomic restore with rollback
□ Add glob pattern matching for selective restore
```

#### Phase 3: Timeline Optimization (Week 5-6)
```
□ Implement revision walking from revision.c
□ Add date range indexing
□ Add file path indexing with bloom filters
□ Implement topological sort for timeline
□ Add graph visualization data
```

#### Phase 4: Pack File System (Week 7-8)
```
□ Implement pack writer from pack-objects.c
□ Implement delta compression from diff-delta.c
□ Add pack reader and unpacker
□ Implement multi-pack index
□ Add incremental repacking
```

---

## 9. Product Integration

### 9.1 MCP Server Integration

```typescript
// src/mcp/tools-git-enhanced.ts

export const gitEnhancedTools = {
  // Enhanced diff with algorithm selection
  tm_diff_files: {
    description: "Compare files with Git-quality diff",
    inputSchema: {
      type: "object",
      properties: {
        checkpointA: { type: "string" },
        checkpointB: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
        algorithm: { enum: ["myers", "patience", "histogram"] },
        context: { type: "number", default: 3 },
        colorMoved: { type: "boolean", default: true }
      }
    },
    handler: async (params) => {
      const diffEngine = new AdvancedDiffEngine();
      return diffEngine.diffCheckpoints(
        params.checkpointA,
        params.checkpointB,
        { algorithm: params.algorithm, context: params.context }
      );
    }
  },
  
  // Timeline with bloom filter optimization
  tm_timeline_query: {
    description: "Query timeline with Git-level performance",
    inputSchema: {
      type: "object",
      properties: {
        afterDate: { type: "string", format: "date-time" },
        beforeDate: { type: "string", format: "date-time" },
        path: { type: "string" },
        author: { type: "string" },
        message: { type: "string" },
        limit: { type: "number", default: 50 },
        offset: { type: "number", default: 0 },
        order: { enum: ["asc", "desc"], default: "desc" }
      }
    },
    handler: async (params) => {
      const graph = new CheckpointGraph(dataDir);
      return graph.getTimeline({
        after: params.afterDate ? new Date(params.afterDate) : undefined,
        before: params.beforeDate ? new Date(params.beforeDate) : undefined,
        path: params.path,
        limit: params.limit,
        offset: params.offset
      });
    }
  },
  
  // Selective restore with conflict resolution
  tm_restore_selective: {
    description: "Restore specific files with Git-style merge",
    inputSchema: {
      type: "object",
      required: ["checkpointId", "patterns"],
      properties: {
        checkpointId: { type: "string" },
        patterns: { type: "array", items: { type: "string" } },
        strategy: { enum: ["ours", "theirs", "merge", "abort"], default: "abort" },
        dryRun: { type: "boolean", default: false },
        createBackup: { type: "boolean", default: true }
      }
    },
    handler: async (params) => {
      const treeRestore = new TreeRestore(engine);
      return treeRestore.restoreTree(
        params.checkpointId,
        params.patterns,
        { strategy: { type: params.strategy }, dryRun: params.dryRun }
      );
    }
  }
};
```

### 9.2 CLI Enhancement

```typescript
// src/cli-v3.ts - Enhanced with Git features

program
  .command("diff")
  .description("Show changes between checkpoints (Git-quality)")
  .argument("[checkpoint1]", "First checkpoint (default: previous)")
  .argument("[checkpoint2]", "Second checkpoint (default: current)")
  .option("-a, --algorithm <alg>", "Diff algorithm (myers/patience/histogram)", "histogram")
  .option("-c, --context <n>", "Context lines", "3")
  .option("--color-moved", "Highlight moved lines")
  .option("--stat", "Show diffstat summary")
  .option("--name-only", "Show only changed file names")
  .option("-p, --path <pattern>", "Filter by path pattern")
  .action(async (cp1, cp2, options) => {
    const engine = new AdvancedDiffEngine();
    const result = await engine.diffCheckpoints(cp1, cp2, {
      algorithm: options.algorithm,
      context: parseInt(options.context),
      colorMoved: options.colorMoved
    });
    
    if (options.stat) {
      console.log(engine.formatDiffstat(result));
    } else if (options.nameOnly) {
      result.files.forEach(f => console.log(f.path));
    } else {
      console.log(engine.formatColorDiff(result));
    }
  });

program
  .command("timeline")
  .description("Browse checkpoint timeline (Git log-style)")
  .option("--after <date>", "Show checkpoints after date")
  .option("--before <date>", "Show checkpoints before date")
  .option("-p, --path <pattern>", "Filter by file path")
  .option("--graph", "Show ASCII graph")
  .option("--oneline", "Compact format")
  .option("-n, --limit <n>", "Limit results", "50")
  .action(async (options) => {
    const graph = new CheckpointGraph(dataDir);
    const checkpoints = await graph.getTimeline({
      after: options.after ? new Date(options.after) : undefined,
      before: options.before ? new Date(options.before) : undefined,
      path: options.path,
      limit: parseInt(options.limit)
    });
    
    if (options.graph) {
      console.log(formatCheckpointGraph(checkpoints));
    } else if (options.oneline) {
      checkpoints.forEach(cp => {
        console.log(`${cp.id.slice(0, 8)} ${cp.description}`);
      });
    } else {
      checkpoints.forEach(cp => {
        console.log(formatCheckpointFull(cp));
      });
    }
  });

program
  .command("restore")
  .description("Restore files from checkpoint (Git checkout-style)")
  .argument("<checkpoint>", "Checkpoint ID or reference")
  .argument("[paths...]", "File patterns to restore (default: all)")
  .option("-s, --strategy <s>", "Conflict strategy (ours/theirs/merge/abort)", "abort")
  .option("--dry-run", "Show what would be restored")
  .option("--no-backup", "Skip creating backup")
  .option("-f, --force", "Force restore, overwrite conflicts")
  .action(async (checkpoint, paths, options) => {
    const treeRestore = new TreeRestore(engine);
    
    const result = await treeRestore.restoreTree(
      checkpoint,
      paths.length > 0 ? paths : ["**/*"],
      {
        strategy: { type: options.force ? "theirs" : options.strategy },
        dryRun: options.dryRun,
        createBackup: options.backup
      }
    );
    
    if (options.dryRun) {
      console.log("Would restore:");
      result.files.forEach(f => console.log(`  ${f}`));
      if (result.conflicts.length > 0) {
        console.log("\nConflicts:");
        result.conflicts.forEach(c => console.log(`  ${c.path}`));
      }
    } else {
      console.log(`✓ Restored ${result.files.length} files`);
      if (result.backupId) {
        console.log(`  Backup: ${result.backupId}`);
      }
    }
  });
```

### 9.3 Extension Integration

```typescript
// kilocode/src/services/checkpoints/AITimeMachineEnhanced.ts

export class AITimeMachineEnhancedService {
  private checkpointGraph: CheckpointGraph;
  private diffEngine: AdvancedDiffEngine;
  private treeRestore: TreeRestore;
  
  // Timeline with bloom filter optimization
  async getTimeline(options: TimelineOptions): Promise<CheckpointView[]> {
    // Use checkpoint graph for fast queries
    const checkpoints = await this.checkpointGraph.getTimeline(options);
    
    return checkpoints.map(cp => ({
      id: cp.id,
      timestamp: cp.timestamp,
      description: cp.description,
      fileCount: cp.stats.totalFiles,
      changes: cp.changes,
      // Include bloom filter data for client-side filtering
      bloomFilter: cp.bloomFilter?.serialize().toString('base64')
    }));
  }
  
  // Diff with algorithm selection
  async getDiff(
    checkpointA: string,
    checkpointB: string,
    options: DiffOptions
  ): Promise<DiffResult> {
    return this.diffEngine.diffCheckpoints(checkpointA, checkpointB, options);
  }
  
  // Selective restore with preview
  async previewRestore(
    checkpointId: string,
    patterns: string[]
  ): Promise<RestorePreview> {
    return this.treeRestore.preview(checkpointId, patterns);
  }
  
  async executeRestore(
    checkpointId: string,
    patterns: string[],
    strategy: RestoreStrategy
  ): Promise<RestoreResult> {
    return this.treeRestore.restoreTree(checkpointId, patterns, { strategy });
  }
}
```

### 9.4 Website Integration

```typescript
// website/src/lib/timeline3d.ts

export class Timeline3DVisualization {
  private scene: THREE.Scene;
  private checkpointMeshes: Map<string, THREE.Mesh>;
  private checkpointGraph: CheckpointGraph;
  
  // Render checkpoints as 3D objects (Time Machine style)
  async loadTimeline(options: TimelineOptions): Promise<void> {
    const checkpoints = await this.checkpointGraph.getTimeline(options);
    
    // Position checkpoints in 3D space
    const spacing = 2;
    const depth = 5;
    
    checkpoints.forEach((cp, index) => {
      const mesh = this.createCheckpointMesh(cp);
      
      // Position: latest at front, oldest at back
      mesh.position.z = -index * depth;
      mesh.position.x = this.calculateXPosition(cp);
      
      // Scale based on change size
      const scale = Math.log(cp.stats.totalFiles + 1) / 5;
      mesh.scale.set(scale, scale, scale);
      
      this.scene.add(mesh);
      this.checkpointMeshes.set(cp.id, mesh);
    });
  }
  
  // Navigate to checkpoint (zoom/fly animation)
  async flyToCheckpoint(checkpointId: string): Promise<void> {
    const mesh = this.checkpointMeshes.get(checkpointId);
    if (!mesh) return;
    
    // Animate camera to checkpoint
    await this.animateCamera(
      this.camera.position,
      mesh.position.clone().add(new THREE.Vector3(0, 2, 10))
    );
  }
  
  // Show diff between two checkpoints
  async showDiff(cpA: string, cpB: string): Promise<void> {
    const diff = await this.diffEngine.diffCheckpoints(cpA, cpB);
    
    // Visualize changes as particles between checkpoints
    const meshA = this.checkpointMeshes.get(cpA);
    const meshB = this.checkpointMeshes.get(cpB);
    
    diff.files.forEach(file => {
      const particle = this.createDiffParticle(file);
      particle.position.lerpVectors(meshA!.position, meshB!.position, 0.5);
      this.scene.add(particle);
    });
  }
}
```

---

## Summary

This document provides a comprehensive mapping from Git's battle-tested C implementations to TypeScript implementations for AITimeMachine. Key takeaways:

1. **Object Storage**: Already solid, enhance with streaming and pack files
2. **Diff Algorithms**: Port Myers, patience, and histogram from xdiff/
3. **Tree Operations**: Port tree walking and merge algorithms
4. **Timeline**: Build checkpoint graph with bloom filters for O(1) lookups
5. **Pack Files**: Implement delta compression for storage efficiency

The goal is to achieve Git-level performance and reliability while maintaining the unique features of AITimeMachine (conversation tracking, Time Machine UI, AI context).

---

## References

- Git Source: `/Users/arhansubasi/aitimemachine/git/`
- AITimeMachine Core: `/Users/arhansubasi/aitimemachine/src/core/`
- MCP Server: `/Users/arhansubasi/aitimemachine/src/mcp/`
- Extension: `/Users/arhansubasi/aitimemachine/kilocode/`
- Website: `/Users/arhansubasi/aitimemachine/website/`
