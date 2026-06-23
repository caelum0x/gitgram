import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PackReader } from './pack/reader.js';
import { PackWriter } from './pack/writer.js';

/**
 * Content-addressable storage - stores file content by hash
 * Supports both loose objects and pack files
 */
export class ContentStore {
  private storePath: string;
  private packPath: string;
  private packs: PackReader[] = [];
  private looseCount = 0;
  private readonly AUTO_PACK_THRESHOLD = 100;

  constructor(basePath: string) {
    this.storePath = path.join(basePath, 'store');
    this.packPath = path.join(basePath, 'packs');
    this.ensureDir(this.storePath);
    this.ensureDir(this.packPath);
    this.loadPacks();
    this.countLooseObjects();
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  /**
   * Load all pack files
   */
  private loadPacks(): void {
    if (!fs.existsSync(this.packPath)) return;

    for (const file of fs.readdirSync(this.packPath)) {
      if (file.endsWith('.pack')) {
        const packFile = path.join(this.packPath, file);
        this.packs.push(new PackReader(packFile));
      }
    }
  }

  private countLooseObjects(): void {
    let count = 0;
    if (fs.existsSync(this.storePath)) {
      for (const dir of fs.readdirSync(this.storePath)) {
        const fullPath = path.join(this.storePath, dir);
        if (fs.statSync(fullPath).isDirectory()) {
          count += fs.readdirSync(fullPath).length;
        }
      }
    }
    this.looseCount = count;
  }

  private getPath(hash: string): string {
    return path.join(this.storePath, hash.slice(0, 2), hash);
  }

  /**
   * Store content, return hash
   */
  put(content: string | Buffer): string {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);

    // Check if already exists (in packs or loose)
    if (this.has(hash)) return hash;

    const filePath = this.getPath(hash);

    if (!fs.existsSync(filePath)) {
      this.ensureDir(path.dirname(filePath));

      // Atomic write: write to .tmp first, then rename
      const tmpPath = filePath + '.tmp';
      try {
        fs.writeFileSync(tmpPath, buffer);
        fs.renameSync(tmpPath, filePath);
      } catch (err: any) {
        // Clean up partial .tmp file on failure
        try { fs.unlinkSync(tmpPath); } catch {}

        if (err.code === 'ENOSPC') {
          throw new Error(`Disk full: cannot store content (hash=${hash}, size=${buffer.length} bytes). Free up disk space and retry.`);
        }
        throw err;
      }

      this.looseCount++;

      if (this.looseCount >= this.AUTO_PACK_THRESHOLD) {
        // Schedule auto-pack (async to not block)
        setTimeout(() => this.autoPack(), 10);
      }
    }

    return hash;
  }

  /**
   * Get content by hash (checks packs first, then loose objects)
   */
  get(hash: string): Buffer | null {
    // Check packs first (faster)
    for (const pack of this.packs) {
      if (pack.has(hash)) {
        return pack.get(hash);
      }
    }

    // Fall back to loose object
    const filePath = this.getPath(hash);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  }

  /**
   * Get content as string
   */
  getString(hash: string): string | null {
    const content = this.get(hash);
    return content ? content.toString('utf-8') : null;
  }

  /**
   * Check if hash exists
   */
  has(hash: string): boolean {
    // Check packs
    for (const pack of this.packs) {
      if (pack.has(hash)) return true;
    }

    // Check loose
    return fs.existsSync(this.getPath(hash));
  }

  /**
   * Get total storage size
   */
  getSize(): number {
    let total = 0;
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else total += fs.statSync(full).size;
      }
    };
    walk(this.storePath);
    walk(this.packPath);
    return total;
  }

  /**
   * Get pack directory path
   */
  getPackPath(): string {
    return this.packPath;
  }

  /**
   * Reload packs (after GC creates new packs)
   */
  reloadPacks(): void {
    this.packs = [];
    this.loadPacks();
  }

  /**
   * Hash content for comparison
   */
  hashContent(content: Buffer | string): string {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  }

  /**
   * Compress loose objects into a pack file
   */
  autoPack(): void {
    if (this.looseCount === 0) return;

    console.log(`[ContentStore] Auto-packing ${this.looseCount} loose objects...`);
    const writer = new PackWriter();
    const looseFiles: string[] = [];

    // 1. Collect all loose objects
    for (const dir of fs.readdirSync(this.storePath)) {
      const dirPath = path.join(this.storePath, dir);
      if (!fs.statSync(dirPath).isDirectory()) continue;

      for (const file of fs.readdirSync(dirPath)) {
        const hash = file; // Filename is the hash
        const fullPath = path.join(dirPath, file);
        const content = fs.readFileSync(fullPath);

        writer.addObject(hash, content);
        looseFiles.push(fullPath);
      }
    }

    // 2. Write pack
    const packName = `pack-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pack`;
    const packPath = path.join(this.packPath, packName);
    writer.write(packPath);

    // 3. Reload packs
    this.reloadPacks();

    // 4. Delete loose files
    for (const file of looseFiles) {
      fs.unlinkSync(file);
    }

    // Clean up empty directories
    for (const dir of fs.readdirSync(this.storePath)) {
      const dirPath = path.join(this.storePath, dir);
      if (fs.readdirSync(dirPath).length === 0) {
        fs.rmdirSync(dirPath);
      }
    }

    this.looseCount = 0;
    console.log(`[ContentStore] Packed ${looseFiles.length} objects into ${packName}`);
  }
}

