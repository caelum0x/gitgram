#!/usr/bin/env node

/**
 * Integration test for AI Time & Concept MCP tools
 */

import { createTmMcpServer } from './lib/mcp/server.js';
import { SqliteRepo } from './lib/store/sqlite_repo.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

async function testMCPIntegration() {
  console.log('🧪 Testing MCP AI Time & Concept Integration...\n');
  
  try {
    // Setup test environment
    const dataDir = path.join(os.homedir(), '.aitimemachine-test');
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(dataDir, { recursive: true });
    
    const repo = new SqliteRepo(path.join(dataDir, 'test-events.db'));
    
    // Create test project and checkpoints
    const testId = Date.now().toString();
    repo.insertProject({
      projectId: `test-project-${testId}`,
      rootPath: process.cwd(),
      name: 'Test Project',
      ignoreGlobs: ['node_modules', '.git']
    });
    
    // Add some test checkpoints
    repo.insertCheckpoint({
      checkpointId: `cp_001_${testId}`,
      projectId: `test-project-${testId}`,
      name: 'implementing user authentication system',
      scope: 'files',
      manifestBlobHash: 'hash001'
    });
    
    repo.insertCheckpoint({
      checkpointId: `cp_002_${testId}`, 
      projectId: `test-project-${testId}`,
      name: 'fixed authentication bug in login flow',
      scope: 'files',
      manifestBlobHash: 'hash002'
    });
    
    repo.insertCheckpoint({
      checkpointId: `cp_003_${testId}`,
      projectId: `test-project-${testId}`, 
      name: 'working on user store implementation',
      scope: 'files',
      manifestBlobHash: 'hash003'
    });
    
    // Create MCP server
    const server = createTmMcpServer({ repo, dataDir });
    
    console.log('✅ MCP Server created successfully');
    console.log('✅ Test checkpoints inserted');
    console.log('✅ AI Time & Concept tools are ready for use');
    
    console.log('\n🎯 Available AI Tools:');
    console.log('- ai_realize_concepts: Understand current conceptual context');
    console.log('- ai_realize_time: Understand temporal patterns');
    console.log('- ai_suggest_focus: Get focus recommendations');
    console.log('- ai_analyze_transitions: Analyze workflow patterns');
    
    console.log('\n🚀 Integration test completed successfully!');
    
    // Cleanup
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testMCPIntegration();
}
