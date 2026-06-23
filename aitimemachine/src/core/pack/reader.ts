import * as fs from 'fs';
import { PackObject, PackIndex, PACK_HEADER_SIZE } from './types.js';
import { DeltaCompressor } from './delta.js';

/**
 * Read objects from pack files
 */
export class PackReader {
  private index: PackIndex;
  private packPath: string;
  private cache = new Map<string, Buffer>();
  
  constructor(packPath: string) {
    this.packPath = packPath;
    this.index = this.loadIndex(packPath.replace('.pack', '.idx'));
  }
  
  /**
   * Load pack index
   */
  private loadIndex(idxPath: string): PackIndex {
    const data = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
    return {
      packHash: data.packHash,
      objects: new Map(Object.entries(data.objects)),
    };
  }
  
  /**
   * Check if pack contains object
   */
  has(hash: string): boolean {
    return this.index.objects.has(hash);
  }
  
  /**
   * Get object from pack
   */
  get(hash: string): Buffer | null {
    // Check cache
    if (this.cache.has(hash)) {
      return this.cache.get(hash)!;
    }
    
    const offset = this.index.objects.get(hash);
    if (offset === undefined) return null;
    
    const obj = this.readObject(offset);
    if (!obj) return null;
    
    let content: Buffer;
    
    if (obj.type === 'delta') {
      // Recursively get base and apply delta
      const base = this.get(obj.baseHash!);
      if (!base) throw new Error(`Base object not found: ${obj.baseHash}`);
      
      const delta = DeltaCompressor.decompress(obj.data!);
      content = DeltaCompressor.applyDelta(base, delta);
    } else {
      content = DeltaCompressor.decompress(obj.data!);
    }
    
    // Cache result
    this.cache.set(hash, content);
    return content;
  }
  
  /**
   * Read object at offset
   */
  private readObject(offset: number): PackObject | null {
    const fd = fs.openSync(this.packPath, 'r');
    
    try {
      // Read object header
      const headerBuf = Buffer.alloc(73); // Max header size
      fs.readSync(fd, headerBuf, 0, 73, offset);
      
      const type = headerBuf.readUInt8(0) === 1 ? 'delta' : 'blob';
      const size = headerBuf.readUInt32BE(1);
      const hash = headerBuf.slice(5, 37).toString('hex');
      
      let headerSize: number;
      let dataLen: number;
      let baseHash: string | undefined;
      
      if (type === 'delta') {
        baseHash = headerBuf.slice(37, 69).toString('hex');
        dataLen = headerBuf.readUInt32BE(69);
        headerSize = 73;
      } else {
        dataLen = headerBuf.readUInt32BE(37);
        headerSize = 41;
      }
      
      // Read compressed data
      const dataBuf = Buffer.alloc(dataLen);
      fs.readSync(fd, dataBuf, 0, dataLen, offset + headerSize);
      
      return { hash, type, size, offset, data: dataBuf, baseHash };
    } finally {
      fs.closeSync(fd);
    }
  }
  
  /**
   * Get all object hashes in pack
   */
  listObjects(): string[] {
    return Array.from(this.index.objects.keys());
  }
}
