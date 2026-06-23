import type { CasStore, BlobRef } from "./cas.js";

export type ChunkedBlobRef = {
  type: "chunked";
  chunkSize: number;
  chunks: string[]; // array of chunk hashes
  totalSize: number;
  mimeType: string;
};

export type FileRef = BlobRef | ChunkedBlobRef;

/**
 * Default chunk size: 4MB
 */
export const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

/**
 * Threshold to enable chunking: 25MB
 */
export const CHUNKING_THRESHOLD = 25 * 1024 * 1024;

/**
 * Store a large file as chunked blobs
 */
export function putChunked(
  cas: CasStore,
  mimeType: string,
  data: Buffer,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): ChunkedBlobRef {
  const chunks: string[] = [];
  let offset = 0;

  // Split into chunks and store each
  while (offset < data.length) {
    const chunkData = data.slice(offset, offset + chunkSize);
    const chunkBlob = cas.putBytes(mimeType, chunkData);
    chunks.push(chunkBlob.hash);
    offset += chunkSize;
  }

  return {
    type: "chunked",
    chunkSize,
    chunks,
    totalSize: data.length,
    mimeType,
  };
}

/**
 * Retrieve a chunked blob and reassemble
 */
export function getChunked(cas: CasStore, ref: ChunkedBlobRef): Buffer {
  const buffers: Buffer[] = [];

  for (const chunkHash of ref.chunks) {
    const chunkData = cas.getBytes(chunkHash);
    buffers.push(chunkData);
  }

  return Buffer.concat(buffers);
}

/**
 * Smart put: automatically chunk if file is large
 */
export function putSmart(
  cas: CasStore,
  mimeType: string,
  data: Buffer,
  options: {
    chunkingThreshold?: number;
    chunkSize?: number;
  } = {}
): FileRef {
  const threshold = options.chunkingThreshold ?? CHUNKING_THRESHOLD;

  if (data.length >= threshold) {
    // Use chunked storage for large files
    return putChunked(cas, mimeType, data, options.chunkSize);
  } else {
    // Use regular blob storage for small files
    return cas.putBytes(mimeType, data);
  }
}

/**
 * Smart get: handle both regular and chunked refs
 */
export function getSmart(cas: CasStore, ref: FileRef): Buffer {
  if (isChunkedRef(ref)) {
    return getChunked(cas, ref);
  } else {
    return cas.getBytes(ref.hash);
  }
}

/**
 * Type guard for ChunkedBlobRef
 */
export function isChunkedRef(ref: FileRef): ref is ChunkedBlobRef {
  return (ref as ChunkedBlobRef).type === "chunked";
}

/**
 * Get all blob hashes referenced by a FileRef (for GC marking)
 */
export function getReferencedHashes(ref: FileRef): string[] {
  if (isChunkedRef(ref)) {
    return ref.chunks;
  } else {
    return [ref.hash];
  }
}

/**
 * Calculate storage efficiency for chunked vs non-chunked
 */
export function analyzeChunkingEfficiency(
  totalSize: number,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): {
  numChunks: number;
  overhead: number;
  efficiency: number;
} {
  const numChunks = Math.ceil(totalSize / chunkSize);

  // Overhead: metadata for chunk list (assume ~100 bytes per hash reference)
  const overhead = numChunks * 100;

  // Efficiency: how much space we save via deduplication potential
  // (This is theoretical - actual depends on content similarity)
  const efficiency = 1 - overhead / totalSize;

  return { numChunks, overhead, efficiency };
}
