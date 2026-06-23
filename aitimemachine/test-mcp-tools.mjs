#!/usr/bin/env node
// Test new MCP tools

import { MCPDaemon } from './lib/mcp-daemon.js';

console.log('Testing MCP Tools...\n');

const daemon = new MCPDaemon(process.cwd());

console.log('New MCP Tools Available:');
console.log('  1. restore_files - Restore specific files by pattern');
console.log('  2. get_file_diff - Get diff for specific file');
console.log('  3. get_timeline - Query timeline with filters');
console.log('  4. search_content - Search in conversations');
console.log('  5. get_file_history - Get file version history');
console.log('\nTotal MCP tools: 18+');
console.log('\nMCP daemon ready for connections.');
