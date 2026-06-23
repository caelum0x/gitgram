#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({
  name: 'test-client',
  version: '1.0.0',
}, {
  capabilities: {},
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['./lib/mcp-daemon.js', process.cwd()],
});

await client.connect(transport);

console.log('🧪 Testing MCP pack tools...\n');

// List tools
const tools = await client.listTools();
const packTools = tools.tools.filter(t => 
  t.name === 'gc' || 
  t.name === 'pack_info' || 
  t.name === 'pack_verify' || 
  t.name === 'repack'
);

console.log(`Found ${packTools.length} pack tools:`);
packTools.forEach(t => console.log(`  - ${t.name}: ${t.description}`));
console.log();

// Test pack_info
console.log('📦 Testing pack_info...');
try {
  const result = await client.callTool({ name: 'pack_info', arguments: {} });
  console.log(result.content[0].text);
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n✨ MCP pack tools test complete!');

await client.close();
process.exit(0);
