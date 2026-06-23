export * from './types.js';
export * from './content-store.js';
export * from './timepoint-manager.js';
export * from './conversation-store.js';
export * from './file-scanner.js';
export * from './engine.js';
export * from './selective-restore.js';
export * from './conflict-resolver.js';
export * from './diff-engine.js';
export * from './diff-cache.js';
export * from './timeline-index.js';
export * from './search-engine.js';
export * from './bloom-filter.js';
export * from './file-comparator.js';
export * from './file-history-tracker.js';
export * from './file-watcher.js';
export * from './smart-auto-checkpoint.js';
export * from './annotation-store.js';
export * from './checkpoint-report.js';
export * from './enhanced-error-watcher.js';

// Git-enhanced modules (v2) - use explicit exports to avoid conflicts
export { 
  AdvancedDiffEngine, 
  DiffAlgorithm,
  Edit,
  DiffHunk as AdvancedDiffHunk,
  DiffResult as AdvancedDiffResult,
  DiffOptions as AdvancedDiffOptions
} from './diff-engine-v2.js';

export { 
  EnhancedBloomFilter, 
  CheckpointBloom as EnhancedCheckpointBloom 
} from './bloom-filter-v2.js';

export { 
  CheckpointGraph, 
  type CheckpointNode, 
  type TimelineOptions as GraphTimelineOptions 
} from './checkpoint-graph.js';

export {
  ThreeWayMerge,
  MergeInput,
  MergeResult as ThreeWayMergeResult,
  ConflictRegion,
  mergeFiles
} from './three-way-merge.js';

export { PackOptimizer, RepackOptions, RepackResult } from './pack-optimizer.js';
export { TimelineVisualizer, TimelineVisualization, TimelineNode } from './timeline-visualizer.js';
