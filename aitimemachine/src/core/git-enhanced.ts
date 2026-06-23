/**
 * Git-Enhanced Module Exports
 * 
 * Core algorithms ported from Git:
 * - AdvancedDiffEngine: Myers, Patience, Histogram diff algorithms
 * - EnhancedBloomFilter: MurmurHash3-based bloom filter
 * - CheckpointGraph: O(1) lookup with fanout table
 * - ThreeWayMerge: merge-ort algorithm with conflict detection
 * - DeltaCompressor: Git-style delta compression
 * - TimelineVisualizer: 3D visualization export for Time Machine UI
 */

// Core algorithms
export { AdvancedDiffEngine, type DiffAlgorithm, type DiffOptions, type DiffResult, type DiffHunk, type Edit } from './diff-engine-v2.js';
export { EnhancedBloomFilter, CheckpointBloom } from './bloom-filter-v2.js';
export { CheckpointGraph, type CheckpointNode, type TimelineOptions } from './checkpoint-graph.js';
export { 
  ThreeWayMerge, 
  ConflictResolver, 
  FileMerge,
  mergeFiles,
  type MergeInput,
  type MergeResult,
  type MergeOptions,
  type MergeStats,
  type ConflictRegion,
  type ConflictType,
  type MergeStrategy,
  type ConflictResolution
} from './three-way-merge.js';

// Pack file operations
export { DeltaCompressor, DeltaChain, type DeltaOptions, type DeltaResult } from './pack/delta.js';
export { PackWriter } from './pack/writer.js';
export { PackReader } from './pack/reader.js';

// Timeline visualization
export { TimelineVisualizer, type TimelineNode, type TimelineEdge, type TimelineVisualization } from './timeline-visualizer.js';

// Re-export from original modules for compatibility
export * from './diff-engine.js';
export * from './bloom-filter.js';
