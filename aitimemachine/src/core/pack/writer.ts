import * as fs from 'fs';
import * as crypto from 'crypto';
import { PackHeader, PackObject, PACK_SIGNATURE, PACK_VERSION, PACK_HEADER_SIZE } from './types.js';
import { DeltaCompressor } from './delta.js';

/**
 * Write pack files - combine multiple objects into single compressed file
 */
export class PackWriter {
  private objects: PackObject[] = [];
  private objectMap = new Map<string, Buffer>(); // hash -> content
  
  /**
   * Add object to pack
   */
  addObject(hash: string, content: Buffer): void {
    this.objectMap.set(hash, content);
  }
  
  /**
   * Build pack with delta compression
   */
  private buildPack(): void {
    // Sort by hash to group similar files together
    const hashes = Array.from(this.objectMap.keys()).sort();
    
    // Group by file extension for better delta compression
    const groups = new Map<string, string[]>();
    for (const hash of hashes) {
      const content = this.objectMap.get(hash)!;
      // Try to detect file type from content
      const ext = this.detectFileType(content);
      if (!groups.has(ext)) groups.set(ext, []);
      groups.get(ext)!.push(hash);
    }
    
    // Process each group
    for (const [ext, groupHashes] of groups) {
      for (let i = 0; i < groupHashes.length; i++) {
        const hash = groupHashes[i];
        const content = this.objectMap.get(hash)!;
        
        // Try delta compression against previous 3 objects in same group
        let bestDelta: Buffer | null = null;
        let baseHash: string | undefined;
        let bestSize = content.length;
        
        for (let j = Math.max(0, i - 3); j < i; j++) {
          const prevHash = groupHashes[j];
          const prevContent = this.objectMap.get(prevHash)!;
          const delta = DeltaCompressor.createDelta(prevContent, content);
          
          if (delta && delta.length < bestSize * 0.8) {
            bestDelta = delta;
            baseHash = prevHash;
            bestSize = delta.length;
          }
        }
        
        // Store as delta or full object
        if (bestDelta) {
          this.objects.push({
            hash,
            type: 'delta',
            size: content.length,
            offset: 0,
            data: DeltaCompressor.compress(bestDelta),
            baseHash,
          });
        } else {
          this.objects.push({
            hash,
            type: 'blob',
            size: content.length,
            offset: 0,
            data: DeltaCompressor.compress(content),
          });
        }
      }
    }
  }
  
  /**
   * Detect file type from content
   */
  private detectFileType(content: Buffer): string {
    const text = content.toString('utf-8', 0, Math.min(100, content.length));
    
    // Check for common patterns
    if (text.includes('import ') || text.includes('export ')) return 'js';
    if (text.includes('<?php')) return 'php';
    if (text.includes('<!DOCTYPE') || text.includes('<html')) return 'html';
    if (text.includes('{') && text.includes('"')) return 'json';
    if (text.includes('def ') || text.includes('import ')) return 'py';
    
    return 'other';
  }
  
  /**
   * Write pack file to disk
   */
  write(packPath: string): string {
    this.buildPack();
    
    const fd = fs.openSync(packPath, 'w');
    let offset = 0;
    
    // Write header
    const header = Buffer.alloc(PACK_HEADER_SIZE);
    header.write(PACK_SIGNATURE, 0, 4);
    header.writeUInt32BE(PACK_VERSION, 4);
    header.writeUInt32BE(this.objects.length, 8);
    fs.writeSync(fd, header);
    offset += PACK_HEADER_SIZE;
    
    // Write objects
    for (const obj of this.objects) {
      obj.offset = offset;
      
      // Object header: type(1) + size(4) + hash(32) + [baseHash(32)] + dataLen(4)
      const headerSize = obj.type === 'delta' ? 73 : 41;
      const objHeader = Buffer.alloc(headerSize);
      objHeader.writeUInt8(obj.type === 'delta' ? 1 : 0, 0);
      objHeader.writeUInt32BE(obj.size, 1);
      Buffer.from(obj.hash, 'hex').copy(objHeader, 5);
      
      if (obj.type === 'delta' && obj.baseHash) {
        Buffer.from(obj.baseHash, 'hex').copy(objHeader, 37);
        objHeader.writeUInt32BE(obj.data!.length, 69);
      } else {
        objHeader.writeUInt32BE(obj.data!.length, 37);
      }
      
      fs.writeSync(fd, objHeader);
      fs.writeSync(fd, obj.data!);
      offset += headerSize + obj.data!.length;
    }
    
    fs.closeSync(fd);
    
    // Compute hash of pack file (without trailer)
    const packHash = this.computePackHash(packPath);
    
    // Append trailer
    const trailer = Buffer.from(packHash, 'hex');
    fs.appendFileSync(packPath, trailer);
    
    // Write index file
    this.writeIndex(packPath.replace('.pack', '.idx'), packHash);
    
    return packHash;
  }
  
  /**
   * Compute SHA-256 of pack file
   */
  private computePackHash(packPath: string): string {
    const content = fs.readFileSync(packPath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  
  /**
   * Write pack index file
   */
  private writeIndex(idxPath: string, packHash: string): void {
    const index = {
      packHash,
      objects: Object.fromEntries(
        this.objects.map(obj => [obj.hash, obj.offset])
      ),
    };
    fs.writeFileSync(idxPath, JSON.stringify(index));
  }
}
