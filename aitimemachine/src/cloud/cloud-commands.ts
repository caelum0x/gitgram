/**
 * Cloud CLI Commands
 * 
 * Commands for Neon database integration
 */

import { Command } from 'commander';
import { HybridStore } from './hybrid-store.js';
import { initializeNeonStore, getNeonStore } from './neon-store.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { assertConsent } from '../auth/consent-policy.js';

const CONFIG_PATH = path.join(os.homedir(), '.aitimemachine', 'cloud-config.json');

interface CloudConfig {
  neonConnectionString?: string;
  syncEnabled?: boolean;
  syncInterval?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadConfig(): CloudConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(config: CloudConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function registerCloudCommands(program: Command): void {
  const cloud = program
    .command('cloud')
    .description('Cloud storage and sync commands (Neon)');

  // Configure Neon connection
  cloud
    .command('connect')
    .description('Connect to Neon database')
    .argument('<connection-string>', 'Neon connection string (postgres://...)')
    .action(async (connectionString: string) => {
      try {
        console.log('Testing connection...');
        
        // Test connection
        const store = await initializeNeonStore(connectionString);
        console.log('✓ Connected to Neon successfully');

        // Save config
        const config = loadConfig();
        config.neonConnectionString = connectionString;
        config.syncEnabled = true;
        saveConfig(config);
        
        console.log('✓ Configuration saved');
        console.log('\nYou can now use cloud sync features:');
        console.log('  tm cloud sync     - Sync local data to cloud');
        console.log('  tm cloud status   - Check sync status');
        console.log('  tm cloud search   - Search across all data');
        
        process.exit(0);
      } catch (error: unknown) {
        console.error('✗ Failed to connect:', errorMessage(error));
        process.exit(1);
      }
    });

  // Disconnect
  cloud
    .command('disconnect')
    .description('Disconnect from Neon and disable sync')
    .action(async () => {
      const config = loadConfig();
      delete config.neonConnectionString;
      config.syncEnabled = false;
      saveConfig(config);
      console.log('✓ Disconnected from Neon');
    });

  // Sync
  cloud
    .command('sync')
    .description('Sync local data with Neon')
    .option('--full', 'Full sync (ignore last sync time)')
    .action(async (options) => {
      const config = loadConfig();
      if (!config.neonConnectionString) {
        console.error('Not connected to Neon. Run: tm cloud connect <connection-string>');
        process.exit(1);
      }

      try {
        const store = new HybridStore(process.cwd(), {
          neonConnectionString: config.neonConnectionString,
        });
        
        console.log('Initializing...');
        await store.initialize();
        
        console.log('Syncing...');
        const result = await store.sync();
        
        if (result.success) {
          console.log('\n✓ Sync completed in', result.duration, 'ms');
          console.log('\nPushed:');
          console.log(`  Timepoints: ${result.pushed.timepoints}`);
          console.log(`  Events: ${result.pushed.events}`);
          console.log(`  Messages: ${result.pushed.messages}`);
          console.log(`  Blobs: ${result.pushed.blobs}`);
          console.log('\nPulled:');
          console.log(`  Timepoints: ${result.pulled.timepoints}`);
          console.log(`  Events: ${result.pulled.events}`);
          console.log(`  Messages: ${result.pulled.messages}`);
        } else {
          console.error('\n✗ Sync failed:');
          for (const error of result.errors) {
            console.error(`  - ${error}`);
          }
        }
        
        process.exit(result.success ? 0 : 1);
      } catch (error: unknown) {
        console.error('Sync error:', errorMessage(error));
        process.exit(1);
      }
    });

  // Status
  cloud
    .command('status')
    .description('Show cloud sync status')
    .action(async () => {
      const config = loadConfig();
      
      console.log('Cloud Status:');
      console.log('─'.repeat(40));
      
      if (!config.neonConnectionString) {
        console.log('Status: Not connected');
        console.log('\nRun: tm cloud connect <neon-connection-string>');
        return;
      }

      console.log('Status: Connected');
      console.log(`Sync: ${config.syncEnabled ? 'Enabled' : 'Disabled'}`);
      
      try {
        const store = new HybridStore(process.cwd(), {
          neonConnectionString: config.neonConnectionString,
        });
        await store.initialize();
        
        const stats = await store.getStats();
        
        console.log('\nLocal:');
        console.log(`  Timepoints: ${stats.local.timepoints}`);
        console.log(`  Events: ${stats.local.events}`);
        
        if (stats.remote) {
          console.log('\nRemote (Neon):');
          console.log(`  Timepoints: ${stats.remote.timepoints}`);
          console.log(`  Events: ${stats.remote.events}`);
          console.log(`  Messages: ${stats.remote.messages}`);
          console.log(`  Storage: ${formatBytes(stats.remote.storageSize)}`);
        }
      } catch (error: unknown) {
        console.error('\nFailed to get status:', errorMessage(error));
      }
    });

  // Search
  cloud
    .command('search <query>')
    .description('Search messages in cloud storage')
    .option('-l, --limit <n>', 'Max results', '20')
    .action(async (query: string, options) => {
      const config = loadConfig();
      if (!config.neonConnectionString) {
        console.error('Not connected to Neon. Run: tm cloud connect <connection-string>');
        process.exit(1);
      }

      try {
        const store = new HybridStore(process.cwd(), {
          neonConnectionString: config.neonConnectionString,
        });
        await store.initialize();
        
        const results = await store.searchMessages(query, parseInt(options.limit));
        
        console.log(`Found ${results.length} messages:\n`);
        
        for (const msg of results) {
          console.log(`[${msg.timestamp.toISOString()}] ${msg.role}:`);
          console.log(`  ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}`);
          console.log();
        }
      } catch (error: unknown) {
        console.error('Search error:', errorMessage(error));
        process.exit(1);
      }
    });

  // Branch (Neon branching support)
  cloud
    .command('branch <name>')
    .description('Create a branch point (for what-if scenarios)')
    .option('-d, --description <text>', 'Branch description')
    .action(async (name: string, options) => {
      const config = loadConfig();
      if (!config.neonConnectionString) {
        console.error('Not connected to Neon. Run: tm cloud connect <connection-string>');
        process.exit(1);
      }

      try {
        const neon = await initializeNeonStore(config.neonConnectionString);
        const project = await neon.getProjectByPath(process.cwd());
        
        if (!project) {
          console.error('Project not found in Neon. Run: tm cloud sync first');
          process.exit(1);
        }

        const branchId = await neon.createBranchPoint(project.id, name, options.description);
        
        console.log('✓ Branch point created:', branchId);
        console.log('\nTo create an actual Neon database branch:');
        console.log('  1. Go to Neon Console');
        console.log('  2. Create branch from this point');
        console.log('  3. Use new connection string for experiments');
      } catch (error: unknown) {
        console.error('Branch error:', errorMessage(error));
        process.exit(1);
      }
    });

  // Export
  cloud
    .command('export')
    .description('Export cloud data to JSON')
    .option('-o, --output <file>', 'Output file', 'aitm-export.json')
    .option('--start <date>', 'Start date (ISO format)')
    .option('--end <date>', 'End date (ISO format)')
    .action(async (options) => {
      assertConsent(process.cwd(), 'export_operational', {
        source: 'cloud.cloud-commands.export',
        resource: options.output,
      });

      const config = loadConfig();
      if (!config.neonConnectionString) {
        console.error('Not connected to Neon. Run: tm cloud connect <connection-string>');
        process.exit(1);
      }

      try {
        const neon = await initializeNeonStore(config.neonConnectionString);
        const project = await neon.getProjectByPath(process.cwd());
        
        if (!project) {
          console.error('Project not found in Neon');
          process.exit(1);
        }

        console.log('Exporting timeline...');
        const timeline = await neon.getTimeline(project.id, {
          startDate: options.start ? new Date(options.start) : undefined,
          endDate: options.end ? new Date(options.end) : undefined,
          includeMessages: true,
          includeEvents: true,
          limit: 10000,
        });

        const stats = await neon.getStats(project.id);

        const exportData = {
          project: {
            id: project.id,
            name: project.name,
            path: project.path,
          },
          stats,
          timeline,
          exportedAt: new Date().toISOString(),
        };

        fs.writeFileSync(options.output, JSON.stringify(exportData, null, 2));
        console.log(`✓ Exported ${timeline.length} items to ${options.output}`);
      } catch (error: unknown) {
        console.error('Export error:', errorMessage(error));
        process.exit(1);
      }
    });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
