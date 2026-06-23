/**
 * Enhanced Bloom Filter - Port of Git's bloom filter implementation
 *
 * Uses MurmurHash3 for better distribution (from bloom.c)
 * Supports serialization for persistent storage
 *
 * @see git/bloom.c
 */

import * as path from 'path';

// ============================================================================
// Constants (from git/bloom.c)
// ============================================================================

const BLOOM_HASH_SEED_1 = 0x9747b28c;
const BLOOM_HASH_SEED_2 = 0xbadd00d1;
const BITS_PER_WORD = 8;
const DEFAULT_FALSE_POSITIVE_RATE = 0.01;

// Bloom filter version for compatibility
const BLOOM_VERSION = 2;

// ============================================================================
// MurmurHash3 Implementation (from git/bloom.c)
// ============================================================================

/**
 * MurmurHash3 32-bit hash function
 *
 * Produces a uniformly distributed hash value.
 * Not considered cryptographically secure.
 *
 * @see git/bloom.c - murmur3_seeded_v2()
 * @see https://en.wikipedia.org/wiki/MurmurHash#Algorithm
 */
function murmur3(seed: number, data: string): number {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const r1 = 15;
  const r2 = 13;
  const m = 5;
  const n = 0xe6546b64;

  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  const len = bytes.length;
  const len4 = Math.floor(len / 4);

  let h1 = seed;

  // Process 4-byte chunks
  for (let i = 0; i < len4; i++) {
    let k =
      bytes[4 * i] |
      (bytes[4 * i + 1] << 8) |
      (bytes[4 * i + 2] << 16) |
      (bytes[4 * i + 3] << 24);

    k = Math.imul(k, c1);
    k = rotateLeft(k, r1);
    k = Math.imul(k, c2);

    h1 ^= k;
    h1 = rotateLeft(h1, r2);
    h1 = Math.imul(h1, m) + n;
  }

  // Process remaining bytes
  let k1 = 0;
  const tailStart = len4 * 4;

  switch (len & 3) {
    case 3:
      k1 ^= bytes[tailStart + 2] << 16;
      // fallthrough
    case 2:
      k1 ^= bytes[tailStart + 1] << 8;
      // fallthrough
    case 1:
      k1 ^= bytes[tailStart];
      k1 = Math.imul(k1, c1);
      k1 = rotateLeft(k1, r1);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
  }

  // Finalization
  h1 ^= len;
  h1 = fmix32(h1);

  return h1 >>> 0; // Convert to unsigned 32-bit
}

/**
 * Rotate left helper
 */
function rotateLeft(value: number, count: number): number {
  const mask = 31; // 32-bit
  count &= mask;
  return ((value << count) | (value >>> (32 - count))) >>> 0;
}

/**
 * Final mix function for MurmurHash3
 */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h;
}

// ============================================================================
// Bloom Filter Class
// ============================================================================

export interface BloomFilterOptions {
  expectedItems: number;
  falsePositiveRate?: number;
}

export interface BloomFilterSerialized {
  version: number;
  size: number;
  numHashes: number;
  dataLength: number;
  data: string; // base64 encoded
}

export class BloomFilter {
  private bits: Uint8Array;
  private size: number;
  private hashCount: number;
  private itemCount: number = 0;

  /**
   * Create a new Bloom filter
   *
   * @param expectedItems - Expected number of items to store
   * @param falsePositiveRate - Desired false positive rate (default: 1%)
   */
  constructor(
    expectedItems: number,
    falsePositiveRate: number = DEFAULT_FALSE_POSITIVE_RATE
  ) {
    if (expectedItems <= 0) {
      expectedItems = 10; // Minimum
    }
    if (falsePositiveRate <= 0 || falsePositiveRate >= 1) {
      falsePositiveRate = DEFAULT_FALSE_POSITIVE_RATE;
    }

    // Calculate optimal size: m = -n * ln(p) / (ln(2)^2)
    const m = Math.ceil(
      (-expectedItems * Math.log(falsePositiveRate)) / (Math.log(2) ** 2)
    );
    this.size = m;

    // Calculate optimal number of hash functions: k = (m/n) * ln(2)
    this.hashCount = Math.max(
      1,
      Math.ceil((m / expectedItems) * Math.log(2))
    );

    // Allocate bit array
    this.bits = new Uint8Array(Math.ceil(m / BITS_PER_WORD));
  }

  /**
   * Create from existing data (for deserialization)
   */
  private static fromRaw(
    size: number,
    hashCount: number,
    bits: Uint8Array
  ): BloomFilter {
    const filter = Object.create(BloomFilter.prototype);
    filter.size = size;
    filter.hashCount = hashCount;
    filter.bits = bits;
    filter.itemCount = 0;
    return filter;
  }

  /**
   * Add an item to the filter
   */
  add(item: string): void {
    const positions = this.getPositions(item);
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / BITS_PER_WORD);
      const bitIndex = pos % BITS_PER_WORD;
      this.bits[byteIndex] |= (1 << bitIndex);
    }
    this.itemCount++;
  }

  /**
   * Check if an item might be in the filter
   *
   * @returns true if the item might be in the filter (may have false positives)
   * @returns false if the item is definitely not in the filter
   */
  has(item: string): boolean {
    const positions = this.getPositions(item);
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / BITS_PER_WORD);
      const bitIndex = pos % BITS_PER_WORD;
      if (!(this.bits[byteIndex] & (1 << bitIndex))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Alias for has()
   */
  mayContain(item: string): boolean {
    return this.has(item);
  }

  /**
   * Get bit positions for an item using MurmurHash3 double hashing
   *
   * Uses the technique: h(i) = h1 + i * h2
   * This gives us k hash functions from just 2 hash computations
   */
  private getPositions(item: string): number[] {
    const positions: number[] = [];
    const hash1 = murmur3(BLOOM_HASH_SEED_1, item);
    const hash2 = murmur3(BLOOM_HASH_SEED_2, item);

    for (let i = 0; i < this.hashCount; i++) {
      const combinedHash = (hash1 + i * hash2) >>> 0;
      positions.push(combinedHash % this.size);
    }

    return positions;
  }

  /**
   * Get approximate number of items in the filter
   */
  getItemCount(): number {
    return this.itemCount;
  }

  /**
   * Get the size of the filter in bits
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Get the number of hash functions used
   */
  getHashCount(): number {
    return this.hashCount;
  }

  /**
   * Calculate current fill ratio
   */
  getFillRatio(): number {
    let setBits = 0;
    for (let i = 0; i < this.bits.length; i++) {
      let byte = this.bits[i];
      while (byte) {
        setBits += byte & 1;
        byte >>= 1;
      }
    }
    return setBits / this.size;
  }

  /**
   * Estimate current false positive rate
   */
  estimateFalsePositiveRate(): number {
    const fillRatio = this.getFillRatio();
    return Math.pow(fillRatio, this.hashCount);
  }

  /**
   * Merge another bloom filter into this one (OR operation)
   */
  merge(other: BloomFilter): void {
    if (this.size !== other.size || this.hashCount !== other.hashCount) {
      throw new Error('Cannot merge bloom filters with different parameters');
    }
    for (let i = 0; i < this.bits.length; i++) {
      this.bits[i] |= other.bits[i];
    }
  }

  /**
   * Clear all bits
   */
  clear(): void {
    this.bits.fill(0);
    this.itemCount = 0;
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Serialize to Buffer (binary format)
   *
   * Format:
   * - 4 bytes: version
   * - 4 bytes: size (bits)
   * - 4 bytes: hashCount
   * - 4 bytes: data length (bytes)
   * - N bytes: data
   */
  serialize(): Buffer {
    const headerSize = 16;
    const buffer = Buffer.alloc(headerSize + this.bits.length);

    buffer.writeUInt32LE(BLOOM_VERSION, 0);
    buffer.writeUInt32LE(this.size, 4);
    buffer.writeUInt32LE(this.hashCount, 8);
    buffer.writeUInt32LE(this.bits.length, 12);
    buffer.set(this.bits, headerSize);

    return buffer;
  }

  /**
   * Deserialize from Buffer
   */
  static deserialize(buffer: Buffer): BloomFilter {
    if (buffer.length < 16) {
      throw new Error('Invalid bloom filter data: too short');
    }

    const version = buffer.readUInt32LE(0);
    if (version !== BLOOM_VERSION) {
      throw new Error(`Unsupported bloom filter version: ${version}`);
    }

    const size = buffer.readUInt32LE(4);
    const hashCount = buffer.readUInt32LE(8);
    const dataLength = buffer.readUInt32LE(12);

    if (buffer.length < 16 + dataLength) {
      throw new Error('Invalid bloom filter data: truncated');
    }

    const bits = new Uint8Array(buffer.slice(16, 16 + dataLength));

    return BloomFilter.fromRaw(size, hashCount, bits);
  }

  /**
   * Serialize to JSON-compatible object
   */
  toJSON(): BloomFilterSerialized {
    return {
      version: BLOOM_VERSION,
      size: this.size,
      numHashes: this.hashCount,
      dataLength: this.bits.length,
      data: Buffer.from(this.bits).toString('base64'),
    };
  }

  /**
   * Create from JSON object
   */
  static fromJSON(json: BloomFilterSerialized): BloomFilter {
    if (json.version !== BLOOM_VERSION) {
      throw new Error(`Unsupported bloom filter version: ${json.version}`);
    }

    const bits = new Uint8Array(Buffer.from(json.data, 'base64'));
    return BloomFilter.fromRaw(json.size, json.numHashes, bits);
  }
}

// ============================================================================
// Checkpoint Bloom Filter Helper
// ============================================================================

/**
 * Helper class for creating and using bloom filters with checkpoints
 *
 * Includes parent directories in the filter for path prefix queries
 */
export class CheckpointBloom {
  /**
   * Build a bloom filter from a list of file paths
   */
  static build(
    files: string[],
    falsePositiveRate: number = 0.01
  ): BloomFilter {
    // Estimate total items (files + parent directories)
    const estimatedItems = files.length * 3; // Rough estimate for average depth
    const filter = new BloomFilter(
      Math.max(estimatedItems, 10),
      falsePositiveRate
    );

    for (const file of files) {
      // Add the file itself
      filter.add(file);

      // Add all parent directories (for prefix queries)
      let dir = path.dirname(file);
      while (dir && dir !== '.' && dir !== '/') {
        filter.add(dir + '/'); // Trailing slash to distinguish directories
        dir = path.dirname(dir);
      }
    }

    return filter;
  }

  /**
   * Quick check if a checkpoint might contain a path
   */
  static mightContain(filter: BloomFilter, filePath: string): boolean {
    return filter.mayContain(filePath);
  }

  /**
   * Check if a checkpoint might contain any file in a directory
   */
  static mightContainDirectory(filter: BloomFilter, dirPath: string): boolean {
    const normalizedDir = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    return filter.mayContain(normalizedDir);
  }
}
