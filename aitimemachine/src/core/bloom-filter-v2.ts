/**
 * Enhanced Bloom Filter - ported from Git's bloom.c
 * Uses MurmurHash3 for better distribution
 */

const BLOOM_HASH_SEED_1 = 0x9747b28c;
const BLOOM_HASH_SEED_2 = 0xbadd00d1;
const BITS_PER_BYTE = 8;

export class EnhancedBloomFilter {
  private data: Uint8Array;
  private size: number;
  private numHashes: number;

  constructor(expectedItems: number, falsePositiveRate: number = 0.01) {
    // Calculate optimal size: m = -n * ln(p) / (ln(2)^2)
    const m = Math.ceil(-expectedItems * Math.log(falsePositiveRate) / (Math.log(2) ** 2));
    this.size = m;
    this.data = new Uint8Array(Math.ceil(m / BITS_PER_BYTE));
    // Optimal hash count: k = (m/n) * ln(2)
    this.numHashes = Math.max(1, Math.ceil((m / expectedItems) * Math.log(2)));
  }

  /**
   * MurmurHash3 - ported from Git's bloom.c murmur3_seeded_v2
   */
  private murmur3(seed: number, data: string): number {
    const c1 = 0xcc9e2d51;
    const c2 = 0x1b873593;
    let h1 = seed;

    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    const len = bytes.length;
    const nblocks = Math.floor(len / 4);

    // Body - process 4-byte blocks
    for (let i = 0; i < nblocks; i++) {
      let k1 = bytes[i * 4] |
               (bytes[i * 4 + 1] << 8) |
               (bytes[i * 4 + 2] << 16) |
               (bytes[i * 4 + 3] << 24);

      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);

      h1 ^= k1;
      h1 = (h1 << 13) | (h1 >>> 19);
      h1 = Math.imul(h1, 5) + 0xe6546b64;
    }

    // Tail - handle remaining bytes
    let k1 = 0;
    const tailStart = nblocks * 4;
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
        k1 = (k1 << 15) | (k1 >>> 17);
        k1 = Math.imul(k1, c2);
        h1 ^= k1;
    }

    // Finalization
    h1 ^= len;
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;

    return h1 >>> 0;
  }

  /**
   * Get bit positions for a path using double hashing
   */
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

  /**
   * Add item to filter
   */
  add(item: string): void {
    for (const pos of this.getPositions(item)) {
      const byteIndex = Math.floor(pos / BITS_PER_BYTE);
      const bitIndex = pos % BITS_PER_BYTE;
      this.data[byteIndex] |= (1 << bitIndex);
    }
  }

  /**
   * Check if item might be in filter (may have false positives)
   */
  mayContain(item: string): boolean {
    for (const pos of this.getPositions(item)) {
      const byteIndex = Math.floor(pos / BITS_PER_BYTE);
      const bitIndex = pos % BITS_PER_BYTE;
      if (!(this.data[byteIndex] & (1 << bitIndex))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Serialize filter for storage
   */
  serialize(): Buffer {
    const header = Buffer.alloc(12);
    header.writeUInt32LE(this.size, 0);
    header.writeUInt32LE(this.numHashes, 4);
    header.writeUInt32LE(this.data.length, 8);
    return Buffer.concat([header, Buffer.from(this.data)]);
  }

  /**
   * Deserialize filter from storage
   */
  static deserialize(buffer: Buffer): EnhancedBloomFilter {
    const size = buffer.readUInt32LE(0);
    const numHashes = buffer.readUInt32LE(4);
    const dataLen = buffer.readUInt32LE(8);

    const filter = Object.create(EnhancedBloomFilter.prototype) as EnhancedBloomFilter;
    filter.size = size;
    filter.numHashes = numHashes;
    filter.data = new Uint8Array(buffer.slice(12, 12 + dataLen));

    return filter;
  }

  /**
   * Get filter statistics
   */
  getStats(): { size: number; numHashes: number; fillRatio: number } {
    let setBits = 0;
    for (let i = 0; i < this.data.length; i++) {
      let byte = this.data[i];
      while (byte) {
        setBits += byte & 1;
        byte >>>= 1;
      }
    }
    return {
      size: this.size,
      numHashes: this.numHashes,
      fillRatio: setBits / this.size
    };
  }
}

/**
 * Checkpoint bloom filter builder - includes parent directories
 */
export class CheckpointBloom {
  /**
   * Build bloom filter for checkpoint files
   */
  static build(files: string[]): EnhancedBloomFilter {
    const filter = new EnhancedBloomFilter(files.length * 3); // Extra capacity for directories
    
    for (const file of files) {
      filter.add(file);
      // Also add parent directories for directory queries
      let dir = file;
      while (true) {
        const parent = dir.substring(0, dir.lastIndexOf('/'));
        if (!parent || parent === dir) break;
        filter.add(parent + '/');
        dir = parent;
      }
    }
    
    return filter;
  }

  /**
   * Fast check if checkpoint might contain path
   */
  static mightContain(filter: EnhancedBloomFilter, path: string): boolean {
    return filter.mayContain(path);
  }
}
