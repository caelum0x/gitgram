/**
 * Timeline Visualization - export data for UI rendering
 * Supports Time Machine-style 3D visualization
 */

import { CheckpointGraph, CheckpointNode } from './checkpoint-graph.js';

export interface TimelineNode {
  id: string;
  timestamp: number;
  description: string;
  parentId?: string;
  depth: number;  // For 3D z-position
  fileCount: number;
  totalSize: number;
  changes?: {
    added: number;
    modified: number;
    deleted: number;
  };
}

export interface TimelineEdge {
  from: string;
  to: string;
}

export interface TimelineVisualization {
  nodes: TimelineNode[];
  edges: TimelineEdge[];
  stats: {
    totalCheckpoints: number;
    dateRange: { start: number; end: number };
    maxDepth: number;
  };
}

export class TimelineVisualizer {
  constructor(private graph: CheckpointGraph) {}

  /**
   * Export timeline data for visualization
   */
  export(options: { limit?: number; after?: Date; before?: Date } = {}): TimelineVisualization {
    const checkpoints = this.graph.getTimeline({
      limit: options.limit || 100,
      after: options.after,
      before: options.before
    });

    const nodes: TimelineNode[] = [];
    const edges: TimelineEdge[] = [];
    let maxDepth = 0;

    // Build nodes with depth calculation
    const depthMap = new Map<string, number>();
    
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      
      // Calculate depth (distance from root)
      let depth = 0;
      if (cp.parentId && depthMap.has(cp.parentId)) {
        depth = depthMap.get(cp.parentId)! + 1;
      }
      depthMap.set(cp.id, depth);
      maxDepth = Math.max(maxDepth, depth);

      nodes.push({
        id: cp.id,
        timestamp: cp.timestamp.getTime(),
        description: cp.description,
        parentId: cp.parentId,
        depth,
        fileCount: cp.stats.totalFiles,
        totalSize: cp.stats.totalSize
      });

      // Add edge to parent
      if (cp.parentId) {
        edges.push({ from: cp.parentId, to: cp.id });
      }
    }

    // Calculate date range
    const timestamps = nodes.map(n => n.timestamp);
    const dateRange = {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps)
    };

    return {
      nodes,
      edges,
      stats: {
        totalCheckpoints: nodes.length,
        dateRange,
        maxDepth
      }
    };
  }

  /**
   * Export as JSON for web visualization
   */
  toJSON(options?: { limit?: number }): string {
    return JSON.stringify(this.export(options), null, 2);
  }

  /**
   * Export for Three.js 3D visualization
   */
  toThreeJS(options?: { limit?: number }): {
    positions: number[];  // [x, y, z, x, y, z, ...]
    colors: number[];     // [r, g, b, r, g, b, ...]
    sizes: number[];
    labels: string[];
    connections: number[]; // [fromIdx, toIdx, ...]
  } {
    const data = this.export(options);
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];
    const labels: string[] = [];
    const connections: number[] = [];
    const idToIndex = new Map<string, number>();

    // Position nodes in 3D space
    const timeRange = data.stats.dateRange.end - data.stats.dateRange.start || 1;
    
    data.nodes.forEach((node, i) => {
      idToIndex.set(node.id, i);
      
      // X: time-based (0 to 10)
      const x = ((node.timestamp - data.stats.dateRange.start) / timeRange) * 10;
      // Y: slight variation based on hash
      const y = (parseInt(node.id.slice(0, 2), 16) / 255) * 2 - 1;
      // Z: depth (negative = further back in time)
      const z = -node.depth * 2;
      
      positions.push(x, y, z);
      
      // Color based on size (green = small, red = large)
      const sizeRatio = Math.min(node.totalSize / 1000000, 1);
      colors.push(sizeRatio, 1 - sizeRatio, 0.3);
      
      // Size based on file count
      sizes.push(Math.log(node.fileCount + 1) * 0.5 + 0.5);
      
      labels.push(node.description.slice(0, 30));
    });

    // Build connections
    for (const edge of data.edges) {
      const fromIdx = idToIndex.get(edge.from);
      const toIdx = idToIndex.get(edge.to);
      if (fromIdx !== undefined && toIdx !== undefined) {
        connections.push(fromIdx, toIdx);
      }
    }

    return { positions, colors, sizes, labels, connections };
  }
}
