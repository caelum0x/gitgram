#!/usr/bin/env node
/**
 * Simple MCP Client for testing AI Time Machine server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as readline from 'readline';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const serverPath = process.argv[2] || path.resolve(__dirname, 'index.js');
  
  console.log('Connecting to MCP server...');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
  });

  const client = new Client({ name: 'aitm-test-client', version: '1.0.0' }, { capabilities: {} });
  
  // Set timeout for connection
  const timeout = setTimeout(() => {
    console.error('Connection timeout - server may be slow to start');
  }, 10000);

  await client.connect(transport);
  clearTimeout(timeout);
  
  const { tools } = await client.listTools();
  console.log(`\n✓ Connected! ${tools.length} tools available\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () => {
    rl.question('> ', async (input) => {
      const [cmd, ...rest] = input.trim().split(' ');
      
      if (!cmd || cmd === 'quit' || cmd === 'exit') {
        await client.close();
        rl.close();
        process.exit(0);
      }
      
      if (cmd === 'list' || cmd === 'tools') {
        tools.forEach(t => console.log(`  ${t.name}`));
        prompt(); return;
      }
      
      if (cmd === 'call' && rest[0]) {
        const toolName = rest[0];
        let args = {};
        if (rest[1]) {
          try { args = JSON.parse(rest.slice(1).join(' ')); } 
          catch { console.log('Invalid JSON'); prompt(); return; }
        }
        try {
          const result = await client.callTool({ name: toolName, arguments: args });
          console.log(JSON.stringify(result, null, 2));
        } catch (e: any) { console.log('Error:', e.message); }
        prompt(); return;
      }

      // Shortcuts
      if (cmd === 'stats') {
        const r = await client.callTool({ name: 'tm_stats', arguments: {} });
        console.log(JSON.stringify(r, null, 2));
        prompt(); return;
      }

      console.log('Commands: list, call <tool> [json], stats, quit');
      prompt();
    });
  };

  prompt();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
