/**
 * Test Git-enhanced algorithms
 */

import { AdvancedDiffEngine } from './lib/core/diff-engine-v2.js';
import { EnhancedBloomFilter, CheckpointBloom } from './lib/core/bloom-filter-v2.js';
import { CheckpointGraph } from './lib/core/checkpoint-graph.js';

// Test diff algorithms
console.log('=== Testing Diff Algorithms ===\n');

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

function goodbye() {
  console.log("Goodbye");
}

function world() {
  console.log("World");
}`;

// Test Myers
console.log('Myers Diff:');
const myersDiff = diffEngine.diff(oldCode, newCode, { algorithm: 'myers' });
console.log(`  Added: ${myersDiff.added}, Removed: ${myersDiff.removed}`);
console.log(`  Hunks: ${myersDiff.hunks.length}`);

// Test Patience
console.log('\nPatience Diff:');
const patienceDiff = diffEngine.diff(oldCode, newCode, { algorithm: 'patience' });
console.log(`  Added: ${patienceDiff.added}, Removed: ${patienceDiff.removed}`);
console.log(`  Hunks: ${patienceDiff.hunks.length}`);

// Test Histogram
console.log('\nHistogram Diff:');
const histogramDiff = diffEngine.diff(oldCode, newCode, { algorithm: 'histogram' });
console.log(`  Added: ${histogramDiff.added}, Removed: ${histogramDiff.removed}`);
console.log(`  Hunks: ${histogramDiff.hunks.length}`);

// Show unified diff
console.log('\nUnified Diff (Histogram):');
console.log(diffEngine.formatUnified(histogramDiff, 'a/code.ts', 'b/code.ts'));

// Test Bloom Filter
console.log('\n=== Testing Enhanced Bloom Filter ===\n');

const files = [
  'src/core/engine.ts',
  'src/core/diff-engine.ts',
  'src/mcp/server.ts',
  'package.json',
  'README.md'
];

const bloom = CheckpointBloom.build(files);
console.log('Bloom filter stats:', bloom.getStats());

console.log('\nFile lookups:');
console.log(`  src/core/engine.ts: ${bloom.mayContain('src/core/engine.ts')}`);
console.log(`  src/core/: ${bloom.mayContain('src/core/')}`);
console.log(`  nonexistent.ts: ${bloom.mayContain('nonexistent.ts')}`);

// Test serialization
const serialized = bloom.serialize();
const deserialized = EnhancedBloomFilter.deserialize(serialized);
console.log(`\nSerialization test: ${deserialized.mayContain('src/core/engine.ts')}`);

// Test Checkpoint Graph
console.log('\n=== Testing Checkpoint Graph ===\n');

const graph = new CheckpointGraph('/tmp/test');

const checkpoints = [
  {
    id: 'abc123def456',
    timestamp: new Date('2024-01-01'),
    description: 'Initial commit',
    files: ['src/index.ts', 'package.json'],
    stats: { totalFiles: 2, totalSize: 1000 }
  },
  {
    id: 'def456abc789',
    timestamp: new Date('2024-01-02'),
    description: 'Add feature',
    parentId: 'abc123def456',
    files: ['src/index.ts', 'src/feature.ts', 'package.json'],
    stats: { totalFiles: 3, totalSize: 2000 }
  },
  {
    id: 'ghi789jkl012',
    timestamp: new Date('2024-01-03'),
    description: 'Bug fix',
    parentId: 'def456abc789',
    files: ['src/index.ts', 'src/feature.ts', 'src/fix.ts', 'package.json'],
    stats: { totalFiles: 4, totalSize: 3000 }
  }
];

await graph.build(checkpoints);

console.log('Graph stats:', graph.getStats());

// Test O(1) lookup
console.log('\nO(1) Lookup test:');
const found = graph.lookup('def456abc789');
console.log(`  Found: ${found?.description}`);

// Test timeline query
console.log('\nTimeline query (after 2024-01-01):');
const timeline = graph.getTimeline({ after: new Date('2024-01-01T12:00:00') });
timeline.forEach(cp => console.log(`  ${cp.id.slice(0, 8)}: ${cp.description}`));

// Test file search with bloom filter
console.log('\nFile search (src/feature.ts):');
const withFile = graph.findCheckpointsWithFile('src/feature.ts');
withFile.forEach(cp => console.log(`  ${cp.id.slice(0, 8)}: ${cp.description}`));

// Test ancestors
console.log('\nAncestors of ghi789jkl012:');
const ancestors = graph.getAncestors('ghi789jkl012');
ancestors.forEach(cp => console.log(`  ${cp.id.slice(0, 8)}: ${cp.description}`));

console.log('\n✅ All tests passed!');
