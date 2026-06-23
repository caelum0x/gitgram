#!/usr/bin/env node

/**
 * Test pack file creation
 */

import { PackWriter } from './lib/core/pack/writer.js';
import { PackReader } from './lib/core/pack/reader.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const testDir = '/tmp/aitm-pack-test';
const packPath = path.join(testDir, 'test.pack');

// Clean up
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true });
}
fs.mkdirSync(testDir, { recursive: true });

console.log('🧪 Testing pack files...\n');

// Create test data
const testData = {
  'file1.txt': Buffer.from('Hello World'),
  'file2.txt': Buffer.from('Hello World Again'), // Similar to file1
  'file3.txt': Buffer.from('Completely different content'),
};

// Write pack
console.log('📦 Creating pack file...');
const writer = new PackWriter();
for (const [name, content] of Object.entries(testData)) {
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 32);
  writer.addObject(hash, content);
  console.log(`  Added: ${name} (${hash.slice(0, 8)}...)`);
}

const packHash = writer.write(packPath);
console.log(`✅ Pack created: ${packHash.slice(0, 16)}...\n`);

// Check file sizes
const packSize = fs.statSync(packPath).size;
const idxSize = fs.statSync(packPath.replace('.pack', '.idx')).size;
const totalOriginal = Object.values(testData).reduce((sum, buf) => sum + buf.length, 0);

console.log('📊 Compression stats:');
console.log(`  Original size: ${totalOriginal} bytes`);
console.log(`  Pack size: ${packSize} bytes`);
console.log(`  Index size: ${idxSize} bytes`);
console.log(`  Compression ratio: ${((1 - packSize / totalOriginal) * 100).toFixed(1)}%\n`);

// Read pack
console.log('📖 Reading from pack...');
const reader = new PackReader(packPath);

for (const [name, originalContent] of Object.entries(testData)) {
  const hash = crypto.createHash('sha256').update(originalContent).digest('hex').slice(0, 32);
  const readContent = reader.get(hash);
  
  if (!readContent) {
    console.log(`  ❌ ${name}: Not found`);
  } else if (readContent.equals(originalContent)) {
    console.log(`  ✅ ${name}: Content matches`);
  } else {
    console.log(`  ❌ ${name}: Content mismatch`);
  }
}

console.log('\n✨ Pack test complete!');

// Clean up
fs.rmSync(testDir, { recursive: true });
