/**
 * Pack file optimization - incremental repacking
 * Based on Git's repack strategy
 */

import * as fs from 'fs';
import * as path from 'path';
import { PackWriter } from './pack/writer.js';
import { PackReader } from './pack/reader.js';
import { CasStore } from './cas.js';

export interface RepackOptions {
  aggressive?: boolean;  // Repack everything into single pack
  maxPackSize?: number;  // Max pack size in bytes (default 50MB)
  minLooseObjects?: number; // Min loose objects before repacking (default 100)
}

export interface RepackResult {
  packsCreated: number;
  objectsPacked: number;
  bytesBeforeRepack: number;
  bytesAfterRepack: number;
  savings: number;
}

export class PackOptimizer {
  constructor(private dataDir: string) {}

  /**
   * Repack loose objects into pack files
   */
  async repack(options: RepackOptions = {}): Promise<RepackResult> {
    const maxPackSize = options.maxPackSize || 50 * 1024 * 1024; // 50MB
    const minLoose = options.minLooseObjects || 100;

    const blobsDir = path.join(this.dataDir, 'blobs');
    const packsDir = path.join(this.dataDir, 'packs');
    
    fs.mkdirSync(packsDir, { recursive: true });

    // Collect loose objects
    const looseObjects = this.collectLooseObjects(blobsDir);
    
    if (looseObjects.length < minLoose && !options.aggressive) {
      return {
        packsCreated: 0,
        objectsPacked: 0,
        bytesBeforeRepack: 0,
        bytesAfterRepack: 0,
        savings: 0
      };
    }

    let bytesBeforeRepack = 0;
    let bytesAfterRepack = 0;
    let packsCreated = 0;
    let objectsPacked = 0;

    // Create packs
    let currentPack = new PackWriter();
    let currentSize = 0;

    for (const obj of looseObjects) {
      const content = fs.readFileSync(obj.path);
      bytesBeforeRepack += content.length;

      currentPack.addObject(obj.hash, content);
      currentSize += content.length;
      objectsPacked++;

      // Write pack if size exceeded
      if (currentSize >= maxPackSize) {
        const packPath = path.join(packsDir, `pack-${Date.now()}-${packsCreated}.pack`);
        currentPack.write(packPath);
        bytesAfterRepack += fs.statSync(packPath).size;
        packsCreated++;
        
        currentPack = new PackWriter();
        currentSize = 0;
      }
    }

    // Write remaining objects
    if (currentSize > 0) {
      const packPath = path.join(packsDir, `pack-${Date.now()}-${packsCreated}.pack`);
      currentPack.write(packPath);
      bytesAfterRepack += fs.statSync(packPath).size;
      packsCreated++;
    }

    // Remove loose objects that are now packed
    if (packsCreated > 0) {
      for (const obj of looseObjects) {
        try { fs.unlinkSync(obj.path); } catch {}
      }
      // Clean empty directories
      this.cleanEmptyDirs(blobsDir);
    }

    return {
      packsCreated,
      objectsPacked,
      bytesBeforeRepack,
      bytesAfterRepack,
      savings: bytesBeforeRepack - bytesAfterRepack
    };
  }

  private collectLooseObjects(blobsDir: string): Array<{ hash: string; path: string }> {
    const objects: Array<{ hash: string; path: string }> = [];
    
    if (!fs.existsSync(blobsDir)) return objects;

    for (const prefix of fs.readdirSync(blobsDir)) {
      const prefixPath = path.join(blobsDir, prefix);
      if (!fs.statSync(prefixPath).isDirectory()) continue;
      
      for (const file of fs.readdirSync(prefixPath)) {
        const hash = prefix + file;
        objects.push({
          hash,
          path: path.join(prefixPath, file)
        });
      }
    }

    return objects;
  }

  private cleanEmptyDirs(dir: string): void {
    if (!fs.existsSync(dir)) return;
    
    for (const entry of fs.readdirSync(dir)) {
      const entryPath = path.join(dir, entry);
      if (fs.statSync(entryPath).isDirectory()) {
        this.cleanEmptyDirs(entryPath);
        try {
          if (fs.readdirSync(entryPath).length === 0) {
            fs.rmdirSync(entryPath);
          }
        } catch {}
      }
    }
  }

  /**
   * Get pack statistics
   */
  getStats(): { packs: number; totalSize: number; objects: number } {
    const packsDir = path.join(this.dataDir, 'packs');
    if (!fs.existsSync(packsDir)) {
      return { packs: 0, totalSize: 0, objects: 0 };
    }

    let packs = 0;
    let totalSize = 0;
    let objects = 0;

    for (const file of fs.readdirSync(packsDir)) {
      if (file.endsWith('.pack')) {
        packs++;
        totalSize += fs.statSync(path.join(packsDir, file)).size;
      }
      if (file.endsWith('.idx')) {
        const idx = JSON.parse(fs.readFileSync(path.join(packsDir, file), 'utf8'));
        objects += Object.keys(idx.objects || {}).length;
      }
    }

    return { packs, totalSize, objects };
  }
}
