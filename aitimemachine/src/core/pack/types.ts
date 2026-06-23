/**
 * Pack file format - inspired by Git's pack files
 * 
 * Structure:
 * - Header: signature + version + object count
 * - Objects: type + size + data (optionally delta-compressed)
 * - Index: SHA-256 -> offset mapping
 * - Trailer: pack checksum
 */

export interface PackHeader {
  signature: string; // 'AITM'
  version: number;   // 1
  objectCount: number;
}

export interface PackObject {
  hash: string;      // SHA-256 of content
  type: 'blob' | 'delta';
  size: number;      // Uncompressed size
  offset: number;    // Offset in pack file
  data?: Buffer;     // Compressed data
  baseHash?: string; // For delta objects
}

export interface PackIndex {
  packHash: string;  // SHA-256 of pack file
  objects: Map<string, number>; // hash -> offset
}

export const PACK_SIGNATURE = 'AITM';
export const PACK_VERSION = 1;
export const PACK_HEADER_SIZE = 12; // 4 + 4 + 4 bytes
