/**
 * MCP Cloud Handler - Neon Database Integration
 * 
 * Exposes cloud storage features via MCP tools:
 * - tm_cloud_connect: Connect to Neon database
 * - tm_cloud_sync: Sync local data with cloud
 * - tm_cloud_status: Get connection status
 * - tm_cloud_search: Full-text search on messages
 * - tm_cloud_timeline: Get unified timeline
 * - tm_cloud_branch: Create branch point
 * - tm_cloud_stats: Get storage statistics
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HybridStore, SyncResult } from '../cloud/hybrid-store.js';
import { initializeNeonStore, getNeonStore, NeonStore, DbMessage } from '../cloud/neon-store.js';

// Config storage
const CONFIG_PATH = path.join(os.homedir(), '.aitimemachine', 'cloud-config.json');

interface CloudConfig {
  neonConnectionString?: string;
  syncEnabled?: boolean;
  syncInterval?: number;
  lastSyncAt?: string;
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

// Cached store instance
let hybridStore: HybridStore | null = null;

async function getHybridStore(projectPath: string): Promise<HybridStore | null> {
  const config = loadConfig();
  if (!config.neonConnectionString) {
    return null;
  }

  if (!hybridStore) {
    hybridStore = new HybridStore(projectPath, {
      neonConnectionString: config.neonConnectionString,
      syncInterval: config.syncInterval || 5 * 60 * 1000,
    });
    await hybridStore.initialize();
  }

  return hybridStore;
}

// =============================================================================
// MCP Tool Definitions
// =============================================================================

export const cloudTools = [
  {
    name: 'tm_cloud_connect',
    description: 'Connect to Neon cloud database for cross-device sync and full-text search. Get your connection string from neon.tech console.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionString: {
          type: 'string',
          description: 'Neon PostgreSQL connection string (postgres://user:pass@xxx.neon.tech/neondb?sslmode=require)'
        },
        syncEnabled: {
          type: 'boolean',
          description: 'Enable automatic background sync (default: true)',
          default: true
        },
        syncInterval: {
          type: 'number',
          description: 'Sync interval in minutes (default: 5)',
          default: 5
        }
      },
      required: ['connectionString']
    }
  },
  {
    name: 'tm_cloud_disconnect',
    description: 'Disconnect from Neon cloud database and disable sync',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'tm_cloud_sync',
    description: 'Manually sync local data with Neon cloud. Pushes local changes and pulls remote changes.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['both', 'push', 'pull'],
          description: 'Sync direction (default: both)',
          default: 'both'
        }
      },
      required: []
    }
  },
  {
    name: 'tm_cloud_status',
    description: 'Get cloud connection status, sync state, and storage statistics',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'tm_cloud_search',
    description: 'Full-text search across all conversation messages stored in cloud. Uses PostgreSQL full-text search for fast, relevant results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (supports natural language)'
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 20)',
          default: 20
        },
        sessionId: {
          type: 'string',
          description: 'Filter by session ID (optional)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'tm_cloud_timeline',
    description: 'Get unified timeline of all activity (checkpoints, messages, events) from cloud storage',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum items to return (default: 50)',
          default: 50
        },
        startDate: {
          type: 'string',
          description: 'Filter from date (ISO format)'
        },
        endDate: {
          type: 'string',
          description: 'Filter to date (ISO format)'
        },
        includeMessages: {
          type: 'boolean',
          description: 'Include conversation messages (default: true)',
          default: true
        },
        includeEvents: {
          type: 'boolean',
          description: 'Include events (default: true)',
          default: true
        }
      },
      required: []
    }
  },
  {
    name: 'tm_cloud_branch',
    description: 'Create a branch point in the timeline for "what if" scenarios. Can be used with Neon database branching to explore different development paths.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Branch name (e.g., "before-refactor", "experiment-v1")'
        },
        description: {
          type: 'string',
          description: 'Description of the branch point'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'tm_cloud_stats',
    description: 'Get detailed storage statistics from both local and cloud storage',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'tm_cloud_save_message',
    description: 'Save a conversation message to cloud storage (usually called automatically)',
    inputSchema: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          enum: ['user', 'assistant', 'system'],
          description: 'Message role'
        },
        content: {
          type: 'string',
          description: 'Message content'
        },
        sessionId: {
          type: 'string',
          description: 'Session ID'
        },
        tool: {
          type: 'string',
          description: 'AI tool that generated this message (optional)'
        }
      },
      required: ['role', 'content', 'sessionId']
    }
  },
  {
    name: 'tm_cloud_projects',
    description: 'List all projects stored in cloud database',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'tm_cloud_export',
    description: 'Export cloud data to JSON for backup or analysis',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start date (ISO format, optional)'
        },
        endDate: {
          type: 'string',
          description: 'End date (ISO format, optional)'
        },
        includeBlobs: {
          type: 'boolean',
          description: 'Include file content blobs (default: false)',
          default: false
        }
      },
      required: []
    }
  },
  {
    name: 'tm_cloud_get_messages',
    description: 'Get conversation messages from cloud storage',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Filter by session ID (optional)'
        },
        limit: {
          type: 'number',
          description: 'Maximum messages to return (default: 50)',
          default: 50
        }
      },
      required: []
    }
  }
];

// =============================================================================
// MCP Tool Handlers
// =============================================================================

export async function handleCloudTool(
  name: string,
  args: Record<string, unknown>,
  projectPath: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  
  const respond = (text: string) => ({
    content: [{ type: 'text', text }]
  });

  try {
    switch (name) {
      case 'tm_cloud_connect':
        return await handleConnect(args as { connectionString: string; syncEnabled?: boolean; syncInterval?: number }, projectPath);

      case 'tm_cloud_disconnect':
        return await handleDisconnect();

      case 'tm_cloud_sync':
        return await handleSync(args as { direction?: string }, projectPath);

      case 'tm_cloud_status':
        return await handleStatus(projectPath);

      case 'tm_cloud_search':
        return await handleSearch(args as { query: string; limit?: number; sessionId?: string }, projectPath);

      case 'tm_cloud_timeline':
        return await handleTimeline(args as { limit?: number; startDate?: string; endDate?: string; includeMessages?: boolean; includeEvents?: boolean }, projectPath);

      case 'tm_cloud_branch':
        return await handleBranch(args as { name: string; description?: string }, projectPath);

      case 'tm_cloud_stats':
        return await handleStats(projectPath);

      case 'tm_cloud_save_message':
        return await handleSaveMessage(args as { role: string; content: string; sessionId: string; tool?: string }, projectPath);

      case 'tm_cloud_projects':
        return await handleListProjects();

      case 'tm_cloud_export':
        return await handleExport(args as { startDate?: string; endDate?: string; includeBlobs?: boolean }, projectPath);

      case 'tm_cloud_get_messages':
        return await handleGetMessages(args as { sessionId?: string; limit?: number }, projectPath);

      default:
        return respond(`Unknown cloud tool: ${name}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return respond(`Error: ${message}`);
  }
}

// =============================================================================
// Handler Implementations
// =============================================================================

async function handleConnect(
  args: { connectionString: string; syncEnabled?: boolean; syncInterval?: number },
  projectPath: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { connectionString, syncEnabled = true, syncInterval = 5 } = args;

  // Test connection
  try {
    const neon = await initializeNeonStore(connectionString);
    
    // Get or create project
    const projectName = path.basename(projectPath);
    const project = await neon.getOrCreateProject(projectPath, projectName);

    // Save config
    const config = loadConfig();
    config.neonConnectionString = connectionString;
    config.syncEnabled = syncEnabled;
    config.syncInterval = syncInterval * 60 * 1000;
    saveConfig(config);

    // Reset cached store
    hybridStore = null;

    return {
      content: [{
        type: 'text',
        text: `✅ Connected to Neon cloud database

**Project:** ${projectName}
**Project ID:** ${project.id}
**Sync:** ${syncEnabled ? `Enabled (every ${syncInterval} min)` : 'Disabled'}

The following features are now available:
- Cross-device sync of checkpoints and history
- Full-text search across all conversations
- Timeline queries with SQL
- Neon branching for "what if" scenarios

Use \`tm_cloud_sync\` to push existing data to cloud.`
      }]
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text',
        text: `❌ Failed to connect to Neon: ${message}

**Troubleshooting:**
1. Check your connection string format
2. Ensure the database exists in Neon Console
3. Verify your IP is not blocked

Connection string format:
\`postgres://user:password@xxx.neon.tech/dbname?sslmode=require\``
      }]
    };
  }
}

async function handleDisconnect(): Promise<{ content: Array<{ type: string; text: string }> }> {
  const config = loadConfig();
  delete config.neonConnectionString;
  config.syncEnabled = false;
  saveConfig(config);
  hybridStore = null;

  return {
    content: [{
      type: 'text',
      text: `✅ Disconnected from Neon cloud database

Local storage continues to work normally.
Use \`tm_cloud_connect\` to reconnect.`
    }]
  };
}

async function handleSync(
  args: { direction?: string },
  projectPath: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const store = await getHybridStore(projectPath);
  
  if (!store) {
    return {
      content: [{
        type: 'text',
        text: `❌ Not connected to Neon cloud.

Use \`tm_cloud_connect\` with your Neon connection string first.`
      }]
    };
  }

  const result = await store.sync();
  
  const statusIcon = result.success ? '✅' : '⚠️';
  
  let text = `${statusIcon} Sync ${result.success ? 'completed' : 'completed with errors'} in ${result.duration}ms

**Pushed to cloud:**
- Checkpoints: ${result.pushed.timepoints}
- Events: ${result.pushed.events}
- Messages: ${result.pushed.messages}
- Blobs: ${result.pushed.blobs}

**Pulled from cloud:**
- Checkpoints: ${result.pulled.timepoints}
- Events: ${result.pulled.events}
- Messages: ${result.pulled.messages}`;

  if (result.errors.length > 0) {
    text += `\n\n**Errors:**\n${result.errors.map(e => `- ${e}`).join('\n')}`;
  }

  // Update last sync time
  const config = loadConfig();
  config.lastSyncAt = new Date().toISOString();
  saveConfig(config);

  return { content: [{ type: 'text', text }] };
}

async function handleStatus(projectPath: string): Promise<{ content: Array<{ type: string; text: string }> }> {
  const config = loadConfig();
  
  if (!config.neonConnectionString) {
    return {
      content: [{
        type: 'text',
        text: `**Cloud Status:** Not connected

Use \`tm_cloud_connect\` with your Neon connection string to enable:
- Cross-device sync
- Full-text search
- Cloud backup
- Neon branching`
      }]
    };
  }

  const store = await getHybridStore(projectPath);
  const connected = store?.isConnected() ?? false;

  let text = `**Cloud Status:** ${connected ? '🟢 Connected' : '🔴 Disconnected'}
**Sync:** ${config.syncEnabled ? 'Enabled' : 'Disabled'}`;

  if (config.lastSyncAt) {
    text += `\n**Last Sync:** ${new Date(config.lastSyncAt).toLocaleString()}`;
  }

  if (store) {
    try {
      const stats = await store.getStats();
      text += `\n
**Local Storage:**
- Checkpoints: ${stats.local.timepoints}
- Events: ${stats.local.events}`;

      if (stats.remote) {
        text += `\n
**Cloud Storage:**
- Checkpoints: ${stats.remote.timepoints}
- Events: ${stats.remote.events}
- Messages: ${stats.remote.messages}
- Size: ${formatBytes(stats.remote.storageSize)}`;
      }
    } catch {}
  }

  return { content: [{ type: 'text', text }] };
}

async function handleSearch(
  args: { query: string; limit?: number; sessionId?: string },
  projectPath: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const { query, limit = 20 } = args;
  
  const store = await getHybridStore(projectPath);
  
  if (!store || !store.isConnected()) {
    return {
      content: [{
        type: 'text',
        text: `❌ Not connected to Neon cloud.

Full-text search requires cloud connection. Use \`tm_cloud_connect\` first.`
      }]
    };
  }

  const results = await store.searchMessages(query, limit);
  
  if (results.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No messages found matching "${query}"`
      }]
    };
  }

  let text = `**Search Results for "${query}"** (${results.length} found)\n\n`;
  
  for (const msg of results) {
    const date = new Date(msg.timestamp).toLocaleString();
    const preview = msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : '');
    text += `---\n**[${date}] ${msg.role}${msg.tool ? ` (${msg.tool})` : ''}:**\n${preview}\n\n`;
  }

  return { content: [{ type: 'text', text }] };
}

async function handleTimeline(
  args: { limit?: number; startDate?: string; endDate?: string; includeMessages?: boolean; includeEvents?: boolean },
  projectPath: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const config = loadConfig();
  
  if (!config.neonConnectionString) {
    return {
      content: [{
        type: 'text',
        text: `❌ Not connected to Neon cloud. Use \`tm_cloud_connect\` first.`
      }]
    };
  }

  const neon = await initializeNeonStore(config.neonConnectionString);
  const project = await neon.getProjectByPath(projectPath);
  
  if (!project) {
    return {
      content: [{
        type: 'text',
        text: `Project not found in cloud. Run \`tm_cloud_sync\` first.`
      }]
    };
  }

  const timeline = await neon.getTimeline(project.id, {
    limit: args.limit || 50,
    startDate: args.startDate ? new Date(args.startDate) : undefined,
    endDate: args.endDate ? new Date(args.endDate) : undefined,
    includeMessages: args.includeMessages ?? true,
    includeEvents: args.includeEvents ?? true,
  });

  if (timeline.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No timeline items found for the specified range.`
      }]
    };
  }

  let text = `**Timeline** (${timeline.length} items)\n\n`;
  
  for (const item of timeline.slice(0, 30)) {
    const date = new Date(item.timestamp).toLocaleString();
    const icon = item.type === 'timepoint' ? '📍' : item.type === 'message' ? '💬' : '⚡';
    const data = item.data as Record<string, unknown>;
    
    if (item.type === 'timepoint') {
      text += `${icon} **[${date}]** Checkpoint: ${String(data.description ?? '')}\n`;
    } else if (item.type === 'message') {
      const content = String(data.content ?? '');
      const preview = content.slice(0, 100);
      text += `${icon} **[${date}]** ${String(data.role ?? 'unknown')}: ${preview}...\n`;
    } else {
      text += `${icon} **[${date}]** Event: ${String(data.type ?? 'unknown')}\n`;
    }
  }

  if (timeline.length > 30) {
    text += `\n... and ${timeline.length - 30} more items`;
  }

  return { content: [{ type: 'text', text }] };
}

async function handleBranch(
  args: { name: string; description?: string },
  projectPath: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const config = loadConfig();
  
  if (!config.neonConnectionString) {
    return {
      content: [{
        type: 'text',
        text: `❌ Not connected to Neon cloud. Use \`tm_cloud_connect\` first.`
      }]
    };
  }

  const neon = await initializeNeonStore(config.neonConnectionString);
  const project = await neon.getProjectByPath(projectPath);
  
  if (!project) {
    return {
      content: [{
        type: 'text',
        text: `Project not found in cloud. Run \`tm_cloud_sync\` first.`
      }]
    };
  }

  const branchId = await neon.createBranchPoint(project.id, args.name, args.description);

  return {
    content: [{
      type: 'text',
      text: `✅ Branch point created: **${args.name}**

**Branch ID:** ${branchId}
**Description:** ${args.description || 'No description'}

**To create an actual Neon database branch:**
1. Go to [Neon Console](https://console.neon.tech)
2. Select your project
3. Create a new branch from this timestamp
4. Use the new branch's connection string for experiments

This allows you to:
- Explore alternative development paths
- Test risky changes safely
- Compare timelines between branches`
    }]
  };
}

async function handleStats(projectPath: string): Promise<{ content: Array<{ type: string; text: string }> }> {
  const config = loadConfig();
  
  if (!config.neonConnectionString) {
    return {
      content: [{
        type: 'text',
        text: `❌ Not connected to Neon cloud. Use \`tm_cloud_connect\` first.`
      }]
    };
  }

  const neon = await initializeNeonStore(config.neonConnectionString);
  const project = await neon.getProjectByPath(projectPath);
  
  if (!project) {
    return {
      content: [{
        type: 'text',
        text: `Project not found in cloud. Run \`tm_cloud_sync\` first.`
      }]
    };
  }

  const stats = await neon.getStats(project.id);

  return {
    content: [{
      type: 'text',
      text: `**Cloud Storage Statistics**

**Project:** ${project.name}
**Path:** ${project.path}

**Data:**
- Checkpoints: ${stats.totalTimepoints}
- Messages: ${stats.totalMessages}
- Events: ${stats.totalEvents}
- Unique Files: ${stats.totalFiles}

**Storage:** ${formatBytes(stats.storageSize)}

**Activity:**
- First: ${stats.firstActivity ? new Date(stats.firstActivity).toLocaleString() : 'N/A'}
- Last: ${stats.lastActivity ? new Date(stats.lastActivity).toLocaleString() : 'N/A'}`
    }]
  };
}

async function handleSaveMessage(
  args: { role: string; content: string; sessionId: string; tool?: string },
  projectPath: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const config = loadConfig();
  
  if (!config.neonConnectionString) {
    return {
      content: [{
        type: 'text',
        text: `Not connected to cloud - message stored locally only.`
      }]
    };
  }

  const neon = await initializeNeonStore(config.neonConnectionString);
  const project = await neon.getOrCreateProject(projectPath, path.basename(projectPath));

  await neon.saveMessage({
    id: `msg_${Date.now()}`,
    project_id: project.id,
    session_id: args.sessionId,
    timestamp: new Date(),
    role: args.role as 'user' | 'assistant' | 'system',
    content: args.content,
    tool: args.tool,
  });

  return {
    content: [{
      type: 'text',
      text: `Message saved to cloud.`
    }]
  };
}

async function handleListProjects(): Promise<{ content: Array<{ type: string; text: string }> }> {
  const config = loadConfig();
  
  if (!config.neonConnectionString) {
    return {
      content: [{
        type: 'text',
        text: `❌ Not connected to Neon cloud. Use \`tm_cloud_connect\` first.`
      }]
    };
  }

  const neon = await initializeNeonStore(config.neonConnectionString);
  const projects = await neon.listProjects();
  
  if (projects.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No projects found in cloud storage.`
      }]
    };
  }

  let text = `**Cloud Projects** (${projects.length} total)\n\n`;
  
  for (const project of projects) {
    const updatedDate = new Date(project.updated_at).toLocaleString();
    text += `📁 **${project.name}**\n`;
    text += `   Path: ${project.path}\n`;
    text += `   ID: ${project.id}\n`;
    text += `   Last Updated: ${updatedDate}\n\n`;
  }

  return { content: [{ type: 'text', text }] };
}

async function handleExport(
  args: { startDate?: string; endDate?: string; includeBlobs?: boolean },
  projectPath: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const config = loadConfig();
  
  if (!config.neonConnectionString) {
    return {
      content: [{
        type: 'text',
        text: `❌ Not connected to Neon cloud. Use \`tm_cloud_connect\` first.`
      }]
    };
  }

  const neon = await initializeNeonStore(config.neonConnectionString);
  const project = await neon.getProjectByPath(projectPath);
  
  if (!project) {
    return {
      content: [{
        type: 'text',
        text: `Project not found in cloud. Run \`tm_cloud_sync\` first.`
      }]
    };
  }

  // Get timeline data
  const timeline = await neon.getTimeline(project.id, {
    startDate: args.startDate ? new Date(args.startDate) : undefined,
    endDate: args.endDate ? new Date(args.endDate) : undefined,
    includeMessages: true,
    includeEvents: true,
    limit: 1000,
  });

  const stats = await neon.getStats(project.id);

  const exportData = {
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      path: project.path,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
    stats,
    timeline: timeline.map(item => ({
      type: item.type,
      timestamp: item.timestamp,
      data: item.data,
    })),
  };

  return {
    content: [{
      type: 'text',
      text: `**Export Data**

\`\`\`json
${JSON.stringify(exportData, null, 2).slice(0, 3000)}${JSON.stringify(exportData).length > 3000 ? '\n... (truncated)' : ''}
\`\`\`

**Summary:**
- Project: ${project.name}
- Timeline Items: ${timeline.length}
- Timepoints: ${stats.totalTimepoints}
- Messages: ${stats.totalMessages}
- Events: ${stats.totalEvents}`
    }]
  };
}

async function handleGetMessages(
  args: { sessionId?: string; limit?: number },
  projectPath: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const config = loadConfig();
  
  if (!config.neonConnectionString) {
    return {
      content: [{
        type: 'text',
        text: `❌ Not connected to Neon cloud. Use \`tm_cloud_connect\` first.`
      }]
    };
  }

  const neon = await initializeNeonStore(config.neonConnectionString);
  const project = await neon.getProjectByPath(projectPath);
  
  if (!project) {
    return {
      content: [{
        type: 'text',
        text: `Project not found in cloud. Run \`tm_cloud_sync\` first.`
      }]
    };
  }

  const messages = await neon.getMessages(
    project.id,
    args.sessionId,
    args.limit || 50
  );

  if (messages.length === 0) {
    return {
      content: [{
        type: 'text',
        text: args.sessionId 
          ? `No messages found for session ${args.sessionId}`
          : `No messages found in cloud storage.`
      }]
    };
  }

  let text = `**Messages** (${messages.length} found)\n\n`;
  
  for (const msg of messages.slice(0, 20)) {
    const date = new Date(msg.timestamp).toLocaleString();
    const roleIcon = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️';
    const preview = msg.content.slice(0, 150) + (msg.content.length > 150 ? '...' : '');
    text += `${roleIcon} **[${date}]** ${msg.role}${msg.tool ? ` (${msg.tool})` : ''}\n`;
    text += `   ${preview}\n\n`;
  }

  if (messages.length > 20) {
    text += `\n... and ${messages.length - 20} more messages`;
  }

  return { content: [{ type: 'text', text }] };
}

// =============================================================================
// Helpers
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// =============================================================================
// Check if cloud tool
// =============================================================================

export function isCloudTool(name: string): boolean {
  return name.startsWith('tm_cloud_');
}
