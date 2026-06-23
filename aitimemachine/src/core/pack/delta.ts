import * as crypto from 'crypto';
import * as zlib from 'zlib';

/**
 * Delta compression - Git-style optimized for code files
 * 
 * Implements multiple delta strategies:
 * 1. Sliding window (Git's default)
 * 2. Line-based diff (good for code)
 * 3. Common prefix (fast for similar files)
 * 
 * Delta instruction format:
 * - Copy: 1OOOOSSS where O=offset bits, S=size bits, followed by offset/size bytes
 * - Insert: 0SSSSSSS followed by S bytes of literal data
 */

// Delta instruction types
const DELTA_COPY = 0x80;    // Copy from base
const DELTA_INSERT = 0x00;  // Insert literal data

export interface DeltaOptions {
  strategy?: 'auto' | 'sliding' | 'line' | 'prefix';
  windowSize?: number;      // For sliding window
  maxDeltaSize?: number;    // Max delta size as ratio of target
  hashBits?: number;        // Bits for rolling hash
}

export interface DeltaResult {
  delta: Buffer;
  strategy: string;
  ratio: number;  // delta size / target size
}

/**
 * Delta compression - optimized for code files
 */
export class DeltaCompressor {
  private static DEFAULT_WINDOW_SIZE = 16 * 1024 * 1024;  // 16 MB
  private static DEFAULT_MAX_DELTA_RATIO = 0.9;

  /**
   * Create delta from base to target (optimized for code)
   */
  static createDelta(base: Buffer, target: Buffer, options: DeltaOptions = {}): Buffer | null {
    if (target.length < 10) return null; // Too small
    if (base.length === 0) return null;  // No base
    
    const maxRatio = options.maxDeltaSize ?? this.DEFAULT_MAX_DELTA_RATIO;
    
    // Try multiple strategies and pick best
    const strategies: Array<() => DeltaResult | null> = [];
    
    const strategy = options.strategy ?? 'auto';
    if (strategy === 'auto' || strategy === 'sliding') {
      strategies.push(() => this.slidingWindowDelta(base, target, options));
    }
    if (strategy === 'auto' || strategy === 'line') {
      strategies.push(() => this.lineDiffDelta(base, target));
    }
    if (strategy === 'auto' || strategy === 'prefix') {
      strategies.push(() => this.commonPrefixDelta(base, target));
    }
    
    let bestResult: DeltaResult | null = null;
    
    for (const tryStrategy of strategies) {
      const result = tryStrategy();
      if (result && result.ratio < maxRatio) {
        if (!bestResult || result.ratio < bestResult.ratio) {
          bestResult = result;
        }
      }
    }
    
    return bestResult?.delta ?? null;
  }

  /**
   * Git-style sliding window delta (best compression)
   */
  private static slidingWindowDelta(
    base: Buffer,
    target: Buffer,
    options: DeltaOptions
  ): DeltaResult | null {
    const windowSize = options.windowSize ?? this.DEFAULT_WINDOW_SIZE;
    const hashBits = options.hashBits ?? 16;
    
    // Build hash table for base (chunk -> positions)
    const chunkSize = 16;  // 16-byte chunks
    const hashTable = new Map<number, number[]>();
    
    for (let i = 0; i <= base.length - chunkSize; i++) {
      const hash = this.hashChunk(base, i, chunkSize, hashBits);
      if (!hashTable.has(hash)) {
        hashTable.set(hash, []);
      }
      hashTable.get(hash)!.push(i);
    }
    
    // Build delta instructions
    const instructions: Array<{ type: 'copy'; offset: number; length: number } | { type: 'insert'; data: Buffer }> = [];
    let targetPos = 0;
    let pendingInsert: number[] = [];
    
    const flushInsert = () => {
      if (pendingInsert.length > 0) {
        instructions.push({ type: 'insert', data: Buffer.from(pendingInsert) });
        pendingInsert = [];
      }
    };

    while (targetPos < target.length) {
      let bestMatch: { offset: number; length: number } | null = null;
      
      // Try to find a match in base
      if (targetPos <= target.length - chunkSize) {
        const hash = this.hashChunk(target, targetPos, chunkSize, hashBits);
        const candidates = hashTable.get(hash) || [];
        
        // Find longest match
        for (const basePos of candidates) {
          if (Math.abs(basePos - targetPos) > windowSize) continue;
          
          // Extend match
          let matchLen = 0;
          while (targetPos + matchLen < target.length &&
                 basePos + matchLen < base.length &&
                 target[targetPos + matchLen] === base[basePos + matchLen] &&
                 matchLen < 0xFFFF) {
            matchLen++;
          }
          
          // Require minimum match length
          if (matchLen >= chunkSize && (!bestMatch || matchLen > bestMatch.length)) {
            bestMatch = { offset: basePos, length: matchLen };
          }
        }
      }
      
      if (bestMatch && bestMatch.length >= chunkSize) {
        flushInsert();
        instructions.push({ type: 'copy', offset: bestMatch.offset, length: bestMatch.length });
        targetPos += bestMatch.length;
      } else {
        pendingInsert.push(target[targetPos]);
        targetPos++;
      }
    }
    
    flushInsert();
    
    // Encode delta
    const delta = this.encodeDelta(base.length, target.length, instructions);
    
    return {
      delta,
      strategy: 'sliding',
      ratio: delta.length / target.length
    };
  }

  /**
   * Encode delta instructions into Git format
   */
  private static encodeDelta(
    baseSize: number,
    targetSize: number,
    instructions: Array<{ type: 'copy'; offset: number; length: number } | { type: 'insert'; data: Buffer }>
  ): Buffer {
    const parts: Buffer[] = [];
    
    // Header: base size (varint) + target size (varint)
    parts.push(this.encodeVarint(baseSize));
    parts.push(this.encodeVarint(targetSize));
    
    // Instructions
    for (const inst of instructions) {
      if (inst.type === 'copy') {
        parts.push(this.encodeCopyInstruction(inst.offset, inst.length));
      } else {
        // Insert: split into chunks of max 127 bytes
        let pos = 0;
        while (pos < inst.data.length) {
          const chunkLen = Math.min(127, inst.data.length - pos);
          parts.push(Buffer.from([chunkLen]));
          parts.push(inst.data.slice(pos, pos + chunkLen));
          pos += chunkLen;
        }
      }
    }
    
    return Buffer.concat(parts);
  }

  /**
   * Encode a copy instruction in Git delta format
   */
  private static encodeCopyInstruction(offset: number, length: number): Buffer {
    let cmd = DELTA_COPY;
    const parts: number[] = [];
    
    // Encode offset (up to 4 bytes)
    if (offset & 0xFF) { cmd |= 0x01; parts.push(offset & 0xFF); }
    if (offset & 0xFF00) { cmd |= 0x02; parts.push((offset >> 8) & 0xFF); }
    if (offset & 0xFF0000) { cmd |= 0x04; parts.push((offset >> 16) & 0xFF); }
    if (offset & 0xFF000000) { cmd |= 0x08; parts.push((offset >> 24) & 0xFF); }
    
    // Encode length (up to 3 bytes, 0 means 0x10000)
    if (length === 0x10000) {
      // Special case: 0 means 65536
    } else {
      if (length & 0xFF) { cmd |= 0x10; parts.push(length & 0xFF); }
      if (length & 0xFF00) { cmd |= 0x20; parts.push((length >> 8) & 0xFF); }
      if (length & 0xFF0000) { cmd |= 0x40; parts.push((length >> 16) & 0xFF); }
    }
    
    return Buffer.from([cmd, ...parts]);
  }

  /**
   * Encode a varint (7-bit encoding with continuation bit)
   */
  private static encodeVarint(value: number): Buffer {
    const bytes: number[] = [];
    bytes.push(value & 0x7F);
    value >>= 7;
    
    while (value > 0) {
      bytes[bytes.length - 1] |= 0x80;
      bytes.push(value & 0x7F);
      value >>= 7;
    }
    
    return Buffer.from(bytes);
  }

  /**
   * Decode a varint from buffer
   */
  private static decodeVarint(buf: Buffer, offset: number): { value: number; bytesRead: number } {
    let value = 0;
    let shift = 0;
    let bytesRead = 0;
    
    while (true) {
      const byte = buf[offset + bytesRead];
      bytesRead++;
      value |= (byte & 0x7F) << shift;
      if (!(byte & 0x80)) break;
      shift += 7;
    }
    
    return { value, bytesRead };
  }

  /**
   * Hash a chunk for the hash table
   */
  private static hashChunk(buf: Buffer, offset: number, length: number, bits: number): number {
    let hash = 0x811c9dc5;  // FNV-1a offset basis
    const mask = (1 << bits) - 1;
    
    for (let i = 0; i < length && offset + i < buf.length; i++) {
      hash ^= buf[offset + i];
      hash = Math.imul(hash, 0x01000193);  // FNV-1a prime
    }
    
    return hash & mask;
  }

  /**
   * Common prefix delta (original algorithm)
   */
  private static commonPrefixDelta(base: Buffer, target: Buffer): DeltaResult | null {
    let commonLen = 0;
    const minLen = Math.min(base.length, target.length);
    for (let i = 0; i < minLen; i++) {
      if (base[i] !== target[i]) break;
      commonLen++;
    }
    
    const savings = commonLen / target.length;
    if (savings < 0.2) return null;
    
    const diffData = target.slice(commonLen);
    const delta = Buffer.alloc(13 + diffData.length);
    delta.writeUInt8(1, 0); // Type: prefix
    delta.writeUInt32BE(base.length, 1);
    delta.writeUInt32BE(target.length, 5);
    delta.writeUInt32BE(commonLen, 9);
    diffData.copy(delta, 13);
    
    return {
      delta,
      strategy: 'prefix',
      ratio: delta.length / target.length
    };
  }
  
  /**
   * Line-based diff delta (better for code)
   */
  private static lineDiffDelta(base: Buffer, target: Buffer): DeltaResult | null {
    const baseLines = base.toString('utf-8').split('\n');
    const targetLines = target.toString('utf-8').split('\n');
    
    // Find matching lines
    const baseSet = new Set(baseLines);
    const matchingLines = targetLines.filter(line => baseSet.has(line));
    const matchRatio = matchingLines.length / targetLines.length;
    
    if (matchRatio < 0.5) return null; // Not enough similarity
    
    // Store only non-matching lines with positions
    const ops: Array<{type: 'keep' | 'add', line?: string, count?: number}> = [];
    let i = 0, j = 0;
    
    while (i < targetLines.length) {
      if (j < baseLines.length && targetLines[i] === baseLines[j]) {
        // Count consecutive matches
        let count = 0;
        while (i < targetLines.length && j < baseLines.length && targetLines[i] === baseLines[j]) {
          count++;
          i++;
          j++;
        }
        ops.push({type: 'keep', count});
      } else {
        // New line
        ops.push({type: 'add', line: targetLines[i]});
        i++;
      }
    }
    
    // Encode operations
    const opsJson = JSON.stringify(ops);
    const delta = Buffer.alloc(13 + opsJson.length);
    delta.writeUInt8(2, 0); // Type: line-diff
    delta.writeUInt32BE(base.length, 1);
    delta.writeUInt32BE(target.length, 5);
    delta.writeUInt32BE(opsJson.length, 9);
    delta.write(opsJson, 13);
    
    return {
      delta,
      strategy: 'line',
      ratio: delta.length / target.length
    };
  }
  
  /**
   * Apply delta to base to reconstruct target
   */
  static applyDelta(base: Buffer, delta: Buffer): Buffer {
    // Check delta type
    const type = delta.readUInt8(0);
    
    if (type === 1) {
      return this.applyPrefixDelta(base, delta);
    } else if (type === 2) {
      return this.applyLineDelta(base, delta);
    } else if (type >= 0x80 || (delta[0] & 0x7F) <= 127) {
      // Git-style delta (starts with varint)
      return this.applyGitDelta(base, delta);
    }
    
    throw new Error(`Unknown delta type: ${type}`);
  }

  /**
   * Apply Git-style delta
   */
  private static applyGitDelta(base: Buffer, delta: Buffer): Buffer {
    let pos = 0;
    
    // Read base size
    const baseSize = this.decodeVarint(delta, pos);
    pos += baseSize.bytesRead;
    
    // Read target size
    const targetSize = this.decodeVarint(delta, pos);
    pos += targetSize.bytesRead;
    
    // Verify base size
    if (base.length !== baseSize.value) {
      throw new Error(`Base size mismatch: expected ${baseSize.value}, got ${base.length}`);
    }
    
    // Build target
    const target = Buffer.alloc(targetSize.value);
    let targetPos = 0;
    
    while (pos < delta.length) {
      const cmd = delta[pos++];
      
      if (cmd & DELTA_COPY) {
        // Copy instruction
        let offset = 0;
        let length = 0;
        
        if (cmd & 0x01) offset |= delta[pos++];
        if (cmd & 0x02) offset |= delta[pos++] << 8;
        if (cmd & 0x04) offset |= delta[pos++] << 16;
        if (cmd & 0x08) offset |= delta[pos++] << 24;
        
        if (cmd & 0x10) length |= delta[pos++];
        if (cmd & 0x20) length |= delta[pos++] << 8;
        if (cmd & 0x40) length |= delta[pos++] << 16;
        
        if (length === 0) length = 0x10000;
        
        base.copy(target, targetPos, offset, offset + length);
        targetPos += length;
      } else if (cmd) {
        // Insert instruction
        delta.copy(target, targetPos, pos, pos + cmd);
        targetPos += cmd;
        pos += cmd;
      } else {
        throw new Error('Invalid delta: zero-length insert');
      }
    }
    
    if (targetPos !== targetSize.value) {
      throw new Error(`Target size mismatch: expected ${targetSize.value}, got ${targetPos}`);
    }
    
    return target;
  }
  
  private static applyPrefixDelta(base: Buffer, delta: Buffer): Buffer {
    const baseLen = delta.readUInt32BE(1);
    const targetLen = delta.readUInt32BE(5);
    const commonLen = delta.readUInt32BE(9);
    
    if (base.length !== baseLen) {
      throw new Error('Base length mismatch');
    }
    
    const target = Buffer.alloc(targetLen);
    base.copy(target, 0, 0, commonLen);
    delta.copy(target, commonLen, 13);
    
    return target;
  }
  
  private static applyLineDelta(base: Buffer, delta: Buffer): Buffer {
    const opsLen = delta.readUInt32BE(9);
    const opsJson = delta.toString('utf-8', 13, 13 + opsLen);
    const ops = JSON.parse(opsJson);
    
    const baseLines = base.toString('utf-8').split('\n');
    const targetLines: string[] = [];
    let baseIdx = 0;
    
    for (const op of ops) {
      if (op.type === 'keep') {
        for (let i = 0; i < op.count; i++) {
          targetLines.push(baseLines[baseIdx++]);
        }
      } else {
        targetLines.push(op.line);
      }
    }
    
    return Buffer.from(targetLines.join('\n'), 'utf-8');
  }
  
  /**
   * Compress buffer with zlib
   */
  static compress(data: Buffer): Buffer {
    return zlib.deflateSync(data, { level: 9 });
  }
  
  /**
   * Decompress buffer with zlib
   */
  static decompress(data: Buffer): Buffer {
    return zlib.inflateSync(data);
  }

  /**
   * Estimate delta size without fully computing it
   */
  static estimateDeltaRatio(base: Buffer, target: Buffer): number {
    // Quick estimate based on common bytes
    const baseSet = new Set<number>();
    for (let i = 0; i < base.length; i++) {
      baseSet.add(base[i] | (base[i + 1] << 8) | (base[i + 2] << 16) | (base[i + 3] << 24));
    }
    
    let matches = 0;
    for (let i = 0; i < target.length - 3; i++) {
      const key = target[i] | (target[i + 1] << 8) | (target[i + 2] << 16) | (target[i + 3] << 24);
      if (baseSet.has(key)) matches++;
    }
    
    const estimatedCopyRatio = matches / (target.length - 3);
    return 1 - estimatedCopyRatio * 0.9;  // Rough estimate
  }
}

/**
 * Delta chain for multi-level delta compression
 */
export class DeltaChain {
  private chain: Array<{ hash: string; delta: Buffer | null; base?: string }> = [];
  private maxDepth = 50;  // Git default

  /**
   * Add object to chain
   */
  add(hash: string, content: Buffer, potentialBases: Map<string, Buffer>): { isDelta: boolean; base?: string; data: Buffer } {
    let bestDelta: Buffer | null = null;
    let bestBase: string | undefined;
    let bestRatio = 1.0;

    // Try each potential base
    for (const [baseHash, baseContent] of potentialBases) {
      // Check chain depth
      const depth = this.getChainDepth(baseHash);
      if (depth >= this.maxDepth) continue;

      // Quick estimate first
      const estimate = DeltaCompressor.estimateDeltaRatio(baseContent, content);
      if (estimate > 0.8) continue;

      // Full delta computation
      const delta = DeltaCompressor.createDelta(baseContent, content);
      if (delta) {
        const ratio = delta.length / content.length;
        if (ratio < bestRatio && ratio < 0.9) {
          bestDelta = delta;
          bestBase = baseHash;
          bestRatio = ratio;
        }
      }
    }

    if (bestDelta && bestBase) {
      this.chain.push({ hash, delta: bestDelta, base: bestBase });
      return { isDelta: true, base: bestBase, data: bestDelta };
    } else {
      this.chain.push({ hash, delta: null });
      return { isDelta: false, data: content };
    }
  }

  /**
   * Get chain depth for a hash
   */
  private getChainDepth(hash: string): number {
    let depth = 0;
    let current = hash;

    while (true) {
      const entry = this.chain.find(e => e.hash === current);
      if (!entry || !entry.base) break;
      depth++;
      current = entry.base;
    }

    return depth;
  }
}
