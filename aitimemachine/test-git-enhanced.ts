#!/usr/bin/env node
/**
 * Test script for Git-Enhanced features
 * 
 * Tests:
 * 1. AdvancedDiffEngine - Myers, Patience, Histogram algorithms
 * 2. EnhancedBloomFilter - MurmurHash3, serialization
 * 3. CheckpointGraph - O(1) lookup, timeline queries
 */

import { AdvancedDiffEngine } from './src/core/diff-engine-v2.js';
import { EnhancedBloomFilter, CheckpointBloom } from './src/core/bloom-filter-v2.js';
import { CheckpointGraph, CheckpointNode } from './src/core/checkpoint-graph.js';

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function test(name: string, fn: () => boolean | Promise<boolean>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(r => {
        console.log(`${r ? C.green + '✓' : C.red + '✗'} ${name}${C.reset}`);
      }).catch(e => {
        console.log(`${C.red}✗ ${name}: ${e.message}${C.reset}`);
      });
    } else {
      console.log(`${result ? C.green + '✓' : C.red + '✗'} ${name}${C.reset}`);
    }
  } catch (e: any) {
    console.log(`${C.red}✗ ${name}: ${e.message}${C.reset}`);
  }
}

async function runTests() {
  console.log(`\n${C.cyan}=== Git-Enhanced Features Test ===${C.reset}\n`);

  // =========================================================================
  // 1. Diff Engine Tests
  // =========================================================================
  console.log(`${C.yellow}Diff Engine Tests${C.reset}`);
  
  const diffEngine = new AdvancedDiffEngine();
  
  const oldCode = `function hello() {
  console.log("Hello");
  return true;
}

function world() {
  console.log("World");
}`;

  const newCode = `function hello() {
  console.log("Hello, World!");
  return true;
}

function greeting() {
  console.log("Greetings!");
}

function world() {
  console.log("World");
}`;

  // Test Myers
  test('Myers diff detects changes', () => {
    const result = diffEngine.diff(oldCode, newCode, { algorithm: 'myers' });
    return result.added > 0 && result.removed > 0;
  });

  // Test Patience
  test('Patience diff works', () => {
    const result = diffEngine.diff(oldCode, newCode, { algorithm: 'patience' });
    return result.hunks.length > 0;
  });

  // Test Histogram
  test('Histogram diff (fastest)', () => {
    const result = diffEngine.diff(oldCode, newCode, { algorithm: 'histogram' });
    return result.algorithm === 'histogram' && result.hunks.length > 0;
  });

  // Test unified output
  test('Unified diff format', () => {
    const result = diffEngine.diff(oldCode, newCode);
    const unified = diffEngine.formatUnified(result, 'a/test.ts', 'b/test.ts');
    return unified.includes('@@') && unified.includes('---') && unified.includes('+++');
  });

  // Test color-moved detection
  test('Color-moved detection', () => {
    const moved = diffEngine.diff(
      'line A\nline B\nline C\n',
      'line B\nline A\nline C\n',
      { colorMoved: true }
    );
    return moved.hunks.some(h => h.lines.some(l => l.moved));
  });

  // =========================================================================
  // 2. Bloom Filter Tests
  // =========================================================================
  console.log(`\n${C.yellow}Bloom Filter Tests${C.reset}`);

  // Test basic add/contains
  test('Bloom filter add/mayContain', () => {
    const filter = new EnhancedBloomFilter(100);
    filter.add('src/app.ts');
    filter.add('src/index.ts');
    return filter.mayContain('src/app.ts') && filter.mayContain('src/index.ts');
  });

  // Test false negative (should never happen)
  test('No false negatives', () => {
    const filter = new EnhancedBloomFilter(100);
    const items = ['a', 'b', 'c', 'd', 'e'];
    items.forEach(item => filter.add(item));
    return items.every(item => filter.mayContain(item));
  });

  // Test serialization
  test('Serialization round-trip', () => {
    const filter = new EnhancedBloomFilter(100);
    filter.add('test-file.ts');
    filter.add('another-file.js');
    
    const serialized = filter.serialize();
    const restored = EnhancedBloomFilter.deserialize(serialized);
    
    return restored.mayContain('test-file.ts') && restored.mayContain('another-file.js');
  });

  // Test CheckpointBloom with directories
  test('CheckpointBloom includes directories', () => {
    const files = ['src/core/app.ts', 'src/utils/helper.ts'];
    const bloom = CheckpointBloom.build(files);
    
    return bloom.mayContain('src/core/app.ts') && 
           bloom.mayContain('src/core/') &&
           bloom.mayContain('src/');
  });

  // =========================================================================
  // 3. Checkpoint Graph Tests
  // =========================================================================
  console.log(`\n${C.yellow}Checkpoint Graph Tests${C.reset}`);

  const graph = new CheckpointGraph('/tmp/test-aitm');
  
  // Create test checkpoints
  const testCheckpoints: CheckpointNode[] = [
    {
      id: 'cp_abc123def456',
      timestamp: new Date('2024-01-01T10:00:00Z'),
      description: 'Initial commit',
      files: ['src/app.ts', 'package.json'],
      stats: { totalFiles: 2, totalSize: 1000 }
    },
    {
      id: 'cp_def456abc789',
      timestamp: new Date('2024-01-02T10:00:00Z'),
      description: 'Add feature',
      parentId: 'cp_abc123def456',
      files: ['src/app.ts', 'src/feature.ts', 'package.json'],
      stats: { totalFiles: 3, totalSize: 1500 }
    },
    {
      id: 'cp_xyz789abc123',
      timestamp: new Date('2024-01-03T10:00:00Z'),
      description: 'Bug fix',
      parentId: 'cp_def456abc789',
      files: ['src/app.ts', 'src/feature.ts', 'package.json'],
      stats: { totalFiles: 3, totalSize: 1600 }
    }
  ];

  // Build graph
  test('Graph build succeeds', async () => {
    await graph.build(testCheckpoints);
    return true;
  });

  // Test O(1) lookup
  test('O(1) lookup works', () => {
    const found = graph.lookup('cp_abc123def456');
    return found !== null && found.description === 'Initial commit';
  });

  // Test timeline query
  test('Timeline query with filters', () => {
    const timeline = graph.getTimeline({
      after: new Date('2024-01-01T00:00:00Z'),
      before: new Date('2024-01-03T00:00:00Z'),
      limit: 10
    });
    return timeline.length === 2; // Excludes Jan 3rd
  });

  // Test bloom filter file lookup
  test('Bloom filter file lookup', () => {
    const found = graph.findCheckpointsWithFile('src/feature.ts');
    return found.length === 2; // cp_def456 and cp_xyz789
  });

  // Test topological sort
  test('Topological sort', () => {
    const sorted = graph.topologicalSort();
    return sorted.length === 3;
  });

  // Test ancestors
  test('Get ancestors', () => {
    const ancestors = graph.getAncestors('cp_xyz789abc123', 10);
    return ancestors.length === 2;
  });

  // =========================================================================
  // Summary
  // =========================================================================
  console.log(`\n${C.cyan}=== Test Complete ===${C.reset}\n`);
}

runTests().catch(console.error);
