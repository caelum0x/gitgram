import * as fs from 'fs';
import * as path from 'path';
import { TimeMachineEngine } from './engine.js';
import { PackWriter } from './pack/writer.js';
import {
  evaluateRetentionSla,
  getRetentionSlaThresholds,
  recordRetentionSla,
  type RetentionSlaMetrics,
} from './retention-sla.js';

export interface GCOptions {
  keepDays?: number;
  keepMinimum?: number;
  dryRun?: boolean;
  createPacks?: boolean;
}

export interface GCResult {
  checkpointsRemoved: number;
  blobsRemoved: number;
  bytesFreed: number;
  packCreated?: boolean;
  packSize?: number;
  sla?: RetentionSlaMetrics;
}

export function runGC(engine: TimeMachineEngine, options: GCOptions = {}): GCResult {
  const startedAt = Date.now();
  const keepDays = options.keepDays || 7;
  const keepMinimum = options.keepMinimum || 10;
  const dryRun = options.dryRun || false;
  const createPacks = options.createPacks !== false; // Default true

  const allTps = engine.listTimePoints();
  const cutoffDate = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);

  // Find checkpoints to remove
  const toRemove = allTps.filter((tp, idx) => {
    if (idx >= allTps.length - keepMinimum) return false;
    if (tp.timestamp > cutoffDate) return false;
    return true;
  });

  if (dryRun) {
    const result: GCResult = {
      checkpointsRemoved: toRemove.length,
      blobsRemoved: 0,
      bytesFreed: 0,
    };
    result.sla = evaluateAndRecordSla(engine, {
      keepDays,
      keepMinimum,
      dryRun,
      runDurationMs: Date.now() - startedAt,
      totalCheckpoints: allTps.length,
      eligibleForDeletion: toRemove.length,
      checkpointsRemoved: result.checkpointsRemoved,
      staleRetainedCheckpoints: allTps.filter((tp) => tp.timestamp <= cutoffDate).length,
      bytesFreed: result.bytesFreed,
    });
    return result;
  }

  // Mark phase: collect all hashes still in use
  const usedHashes = new Set<string>();
  const keepTps = allTps.filter(tp => !toRemove.includes(tp));
  
  for (const tp of keepTps) {
    const fullTp = engine.getTimePoint(tp.id);
    if (fullTp) {
      for (const file of fullTp.files) {
        usedHashes.add(file.hash);
      }
    }
  }

  // Pack phase: create pack file from loose objects
  let packCreated = false;
  let packSize = 0;
  const packedHashes = new Set<string>();
  
  if (createPacks && usedHashes.size > 100) {
    const result = createPackFile(engine, usedHashes);
    packCreated = result.created;
    packSize = result.size;
    
    // Mark all packed hashes
    for (const hash of usedHashes) {
      packedHashes.add(hash);
    }
  }

  // Sweep phase: remove unused loose objects AND packed objects
  let blobsRemoved = 0;
  let bytesFreed = 0;

  const storePath = engine.getStorePath();
  const allBlobs = collectAllBlobs(storePath);
  
  for (const hash of allBlobs) {
    // Remove if unused OR if packed
    if (!usedHashes.has(hash) || packedHashes.has(hash)) {
      const blobPath = getBlobPath(storePath, hash);
      try {
        const size = fs.statSync(blobPath).size;
        fs.unlinkSync(blobPath);
        blobsRemoved++;
        bytesFreed += size;
      } catch { /* ignore */ }
    }
  }

  // Remove old checkpoints
  for (const tp of toRemove) {
    engine.deleteTimePoint(tp.id);
  }

  const result: GCResult = {
    checkpointsRemoved: toRemove.length,
    blobsRemoved,
    bytesFreed,
    packCreated,
    packSize,
  };
  result.sla = evaluateAndRecordSla(engine, {
    keepDays,
    keepMinimum,
    dryRun,
    runDurationMs: Date.now() - startedAt,
    totalCheckpoints: allTps.length,
    eligibleForDeletion: toRemove.length,
    checkpointsRemoved: result.checkpointsRemoved,
    staleRetainedCheckpoints: keepTps.filter((tp) => tp.timestamp <= cutoffDate).length,
    bytesFreed: result.bytesFreed,
  });
  return result;
}

function createPackFile(engine: TimeMachineEngine, hashes: Set<string>): { created: boolean; size: number } {
  const packWriter = new PackWriter();
  const storePath = engine.getStorePath();
  
  // Add all used objects to pack
  for (const hash of hashes) {
    const blobPath = getBlobPath(storePath, hash);
    if (fs.existsSync(blobPath)) {
      const content = fs.readFileSync(blobPath);
      packWriter.addObject(hash, content);
    }
  }
  
  // Write pack file
  const packPath = path.join(engine.getPackPath(), `pack-${Date.now()}.pack`);
  packWriter.write(packPath);
  
  const size = fs.statSync(packPath).size;
  
  // Reload packs in content store
  engine.reloadPacks();
  
  return { created: true, size };
}

function collectAllBlobs(storePath: string): string[] {
  const blobs: string[] = [];
  
  if (!fs.existsSync(storePath)) return blobs;
  
  for (const dir1 of fs.readdirSync(storePath)) {
    const dir1Path = path.join(storePath, dir1);
    if (!fs.statSync(dir1Path).isDirectory()) continue;
    
    for (const file of fs.readdirSync(dir1Path)) {
      const filePath = path.join(dir1Path, file);
      if (fs.statSync(filePath).isFile()) {
        // File is the full hash (starts with dir1 prefix)
        blobs.push(file);
      }
    }
  }
  
  return blobs;
}

function getBlobPath(storePath: string, hash: string): string {
  return path.join(storePath, hash.slice(0, 2), hash);
}

export function runGarbageCollection(engine: TimeMachineEngine, options: GCOptions = {}): GCResult {
  return runGC(engine, options);
}

function evaluateAndRecordSla(
  engine: TimeMachineEngine,
  input: {
    keepDays: number;
    keepMinimum: number;
    dryRun: boolean;
    runDurationMs: number;
    totalCheckpoints: number;
    eligibleForDeletion: number;
    checkpointsRemoved: number;
    staleRetainedCheckpoints: number;
    bytesFreed: number;
  }
): RetentionSlaMetrics {
  const sla = evaluateRetentionSla(
    {
      keepDays: input.keepDays,
      keepMinimum: input.keepMinimum,
      dryRun: input.dryRun,
      runDurationMs: input.runDurationMs,
      totalCheckpoints: input.totalCheckpoints,
      eligibleForDeletion: input.eligibleForDeletion,
      checkpointsRemoved: input.checkpointsRemoved,
      staleRetainedCheckpoints: input.staleRetainedCheckpoints,
      bytesFreed: input.bytesFreed,
    },
    getRetentionSlaThresholds()
  );

  recordRetentionSla(engine.getProjectPath(), sla);
  return sla;
}
