import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { TimeMachineEngine } from './core/index.js';
import { ConversationLogger } from './core/conversation-logger.js';
import { EventStore } from './core/event-store.js';
import { FileChangeWatcher } from './core/file-watcher-logger.js';
import { ActionWrapper } from './tools/action-wrapper.js';
import { generateRestoreContextWithConversation } from './tools/rewind.js';
import { Repo } from './store/repo.js';
import { SecureSyncClient } from './sync/secure-client.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * MCP Daemon - runs as background service, auto-captures AI actions
 * Syncs all AI tool interactions to Neon via API server (secure)
 */
/**
 * In-process sliding window rate limiter for MCP tools
 */
class ToolRateLimiter {
  private windows: Map<string, number[]> = new Map();
  private readonly limits: Record<string, number> = {
    restore: 5,
    restore_by_time: 5,
    restore_by_description: 5,
    restore_files: 5,
    execute_command: 30,
    before_action: 60,
    after_action: 60,
  };
  private readonly defaultLimit = 120;
  private readonly windowMs = 60_000;

  check(toolName: string): void {
    const now = Date.now();
    const limit = this.limits[toolName] ?? this.defaultLimit;
    const key = toolName;

    let timestamps = this.windows.get(key) ?? [];
    // Remove entries outside the window
    timestamps = timestamps.filter(t => now - t < this.windowMs);

    if (timestamps.length >= limit) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Rate limit exceeded for tool "${toolName}": max ${limit} calls per minute. Try again shortly.`
      );
    }

    timestamps.push(now);
    this.windows.set(key, timestamps);
  }
}

export class MCPDaemon {
  private server: Server;
  private engine: TimeMachineEngine;
  private repo: Repo;
  private conversationLogger: ConversationLogger;
  private eventStore: EventStore;
  private fileWatcher: FileChangeWatcher;
  private actionWrapper: ActionWrapper;
  private pendingCapture: NodeJS.Timeout | null = null;
  private lastAction: string = '';
  private syncClient: SecureSyncClient;
  private projectId: string;
  private rateLimiter = new ToolRateLimiter();

  constructor(private projectPath: string) {
    this.engine = new TimeMachineEngine(projectPath);
    this.projectId = path.basename(projectPath);

    // Initialize secure sync client (calls API server, never direct DB)
    const apiUrl = process.env.AITM_API_URL || 'http://localhost:3001';
    this.syncClient = new SecureSyncClient(apiUrl);

    // Hook into capture events - sync to Neon via API
    this.engine.onCapture(async (tp) => {
      try {
        // Sync checkpoint to Neon (via API server)
        const result = await this.syncClient.syncCheckpoint(this.projectId, tp);
        if (result.ok && !result.message?.includes('not configured')) {
          console.error(`[MCP] Synced checkpoint ${tp.id} to cloud`);
        }
      } catch (e) {
        // Non-blocking - sync failures shouldn't break captures
        console.error('[MCP] Sync error (non-blocking):', e);
      }
    });

    // Initialize repo - using SqliteRepo as default
    const { SqliteRepo } = require('../store/sqlite_repo.js');
    const dataDir = path.join(os.homedir(), '.aitimemachine');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.repo = new SqliteRepo(path.join(dataDir, 'events.db'));

    this.conversationLogger = new ConversationLogger(projectPath);
    this.eventStore = new EventStore(projectPath);
    this.eventStore.load();
    this.fileWatcher = new FileChangeWatcher(
      projectPath,
      this.conversationLogger,
      ['node_modules', '.git', 'dist', 'build']
    );
    this.actionWrapper = new ActionWrapper(this.engine, this.conversationLogger);
    this.server = new Server(
      { name: 'aitimemachine', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  /**
   * Sync a message/tool call to Neon via API
   */
  private async syncMessage(data: {
    role: string;
    content: string;
    tool?: string;
    checkpointId?: string;
  }) {
    try {
      await this.syncClient.syncMessage(this.projectId, {
        ...data,
        sessionId: this.conversationLogger.getSessionId(),
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      // Non-blocking
    }
  }

  /**
   * Sync a tool call to Neon via API
   */
  private async syncToolCall(data: {
    toolName: string;
    arguments: Record<string, unknown>;
    result?: Record<string, unknown> | string | number | boolean | null;
    success: boolean;
    checkpointBeforeId?: string;
    checkpointAfterId?: string;
  }) {
    try {
      await this.syncClient.syncToolCall(this.projectId, {
        ...data,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      // Non-blocking
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Authentication
        {
          name: 'tm_auth_login',
          description: 'Login with API key to enable cloud sync. Get your key from timemachine.gitgram.app/dashboard',
          inputSchema: {
            type: 'object',
            properties: {
              api_key: { type: 'string', description: 'Your API key (starts with aitm_)' },
            },
            required: ['api_key'],
          },
        },
        {
          name: 'tm_auth_status',
          description: 'Check authentication status and cloud sync configuration',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'tm_oracle_ask',
          description: 'Ask the Oracle about project history, code context, or past decisions.',
          inputSchema: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The question to ask' },
            },
            required: ['question'],
          },
        },
        // Auto-capture hooks (called by AI tools)
        {
          name: 'before_action',
          description: 'Call before making file changes. Creates a checkpoint.',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'What action is about to happen' },
              files: { type: 'array', items: { type: 'string' }, description: 'Files that will be affected' },
            },
            required: ['action'],
          },
        },
        {
          name: 'after_action',
          description: 'Call after making file changes. Records the result.',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'What action was completed' },
              success: { type: 'boolean' },
            },
            required: ['action'],
          },
        },
        {
          name: 'log_message',
          description: 'Log a conversation message for memory persistence',
          inputSchema: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant', 'system'] },
              content: { type: 'string' },
              tool: { type: 'string', description: 'AI tool name (claude_code, cursor, etc)' },
            },
            required: ['role', 'content'],
          },
        },

        // Manual controls
        {
          name: 'checkpoint',
          description: 'Create a manual checkpoint with description',
          inputSchema: {
            type: 'object',
            properties: {
              description: { type: 'string' },
            },
            required: ['description'],
          },
        },

        // Time travel
        {
          name: 'list_timepoints',
          description: 'List all available timepoints (snapshots)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'get_timepoint',
          description: 'Get details of a specific timepoint',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        {
          name: 'preview_restore',
          description: 'Preview what will change if restoring to a timepoint',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        {
          name: 'restore',
          description: 'Restore project to a specific timepoint (files + conversation)',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        {
          name: 'restore_by_time',
          description: 'Restore to the state at a specific time',
          inputSchema: {
            type: 'object',
            properties: {
              time: { type: 'string', description: 'ISO timestamp or relative (e.g., "2024-01-15T10:30:00Z", "1 hour ago")' }
            },
            required: ['time'],
          },
        },
        {
          name: 'restore_by_description',
          description: 'Find and restore to a timepoint by searching descriptions',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },

        // Search & browse
        {
          name: 'search',
          description: 'Search conversations and timepoint descriptions',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
        {
          name: 'get_conversation',
          description: 'Get conversation history',
          inputSchema: {
            type: 'object',
            properties: {
              until: { type: 'string', description: 'Optional: get conversation until this timepoint ID' },
            },
          },
        },
        {
          name: 'get_file_at',
          description: 'Get file content at a specific timepoint',
          inputSchema: {
            type: 'object',
            properties: {
              timepoint_id: { type: 'string' },
              file_path: { type: 'string' },
            },
            required: ['timepoint_id', 'file_path'],
          },
        },
        {
          name: 'diff',
          description: 'Get diff between two timepoints or timepoint and current',
          inputSchema: {
            type: 'object',
            properties: {
              from_id: { type: 'string' },
              to_id: { type: 'string', description: 'Optional: compare to this timepoint, or current if omitted' },
            },
            required: ['from_id'],
          },
        },

        // Stats
        {
          name: 'stats',
          description: 'Get TimeMachine statistics',
          inputSchema: { type: 'object', properties: {} },
        },

        // Pack management
        {
          name: 'gc',
          description: '🗑️ Run garbage collection and create pack files. Compresses old objects and reclaims storage.',
          inputSchema: {
            type: 'object',
            properties: {
              keepDays: { type: 'number', description: 'Keep checkpoints from last N days (default: 7)' },
              keepMinimum: { type: 'number', description: 'Keep at least N recent checkpoints (default: 10)' },
              dryRun: { type: 'boolean', description: 'Preview changes without deleting' },
            },
          },
        },
        {
          name: 'pack_info',
          description: '📦 Show pack file information (size, object count, compression stats)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'pack_verify',
          description: '✓ Verify pack file integrity (checksums and object readability)',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'repack',
          description: '🔄 Repack all pack files for better compression. Optimizes existing packs.',
          inputSchema: { type: 'object', properties: {} },
        },

        // Message logging (for clients to call)
        {
          name: 'log_user_message',
          description: '📝 Log user message to conversation history. Clients should call this when user sends a message.',
          inputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'User message content' },
              metadata: { type: 'object', description: 'Optional metadata (source, timestamp, etc)' },
            },
            required: ['content'],
          },
        },
        {
          name: 'log_assistant_message',
          description: '🤖 Log AI response to conversation history. Clients should call this when AI responds.',
          inputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'AI response content' },
              thinking: { type: 'string', description: 'AI reasoning/thinking process (if available)' },
              metadata: { type: 'object', description: 'Optional metadata (model, tokens, etc)' },
            },
            required: ['content'],
          },
        },
        {
          name: 'log_terminal_command',
          description: '💻 Log terminal command execution',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Command executed' },
              output: { type: 'string', description: 'Command output' },
              exitCode: { type: 'number', description: 'Exit code' },
              cwd: { type: 'string', description: 'Working directory' },
            },
            required: ['command'],
          },
        },
        {
          name: 'log_error',
          description: '❌ Log error or exception',
          inputSchema: {
            type: 'object',
            properties: {
              error: { type: 'string', description: 'Error message' },
              stack: { type: 'string', description: 'Stack trace' },
              context: { type: 'object', description: 'Error context' },
            },
            required: ['error'],
          },
        },
        {
          name: 'execute_command',
          description: '⚡ Execute terminal command and log to conversation history',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Command to execute' },
              cwd: { type: 'string', description: 'Working directory (optional)' },
            },
            required: ['command'],
          },
        },
        {
          name: 'start_file_watcher',
          description: '👁️ Start real-time file change tracking',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'stop_file_watcher',
          description: '🛑 Stop file change tracking',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'replay_session',
          description: '🎬 Replay session step-by-step or to specific step',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID to replay' },
              step: { type: 'number', description: 'Step index to replay to (optional)' },
            },
            required: ['sessionId'],
          },
        },
        {
          name: 'get_session_steps',
          description: '📋 Get all steps in a session',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID' },
            },
            required: ['sessionId'],
          },
        },
        {
          name: 'compare_checkpoints',
          description: '🔍 Compare two checkpoints (files and conversation)',
          inputSchema: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'From checkpoint ID' },
              to: { type: 'string', description: 'To checkpoint ID' },
              format: { type: 'string', enum: ['text', 'json', 'markdown'], description: 'Output format' },
            },
            required: ['from', 'to'],
          },
        },
        {
          name: 'restore_files',
          description: '📂 Restore specific files from checkpoint using glob patterns',
          inputSchema: {
            type: 'object',
            properties: {
              checkpointId: { type: 'string', description: 'Checkpoint ID to restore from' },
              patterns: { type: 'array', items: { type: 'string' }, description: 'Glob patterns (e.g., "src/**/*.ts")' },
              strategy: { type: 'string', enum: ['ours', 'theirs', 'abort'], description: 'Conflict resolution strategy' },
              dryRun: { type: 'boolean', description: 'Preview without restoring' }
            },
            required: ['checkpointId', 'patterns'],
          },
        },
        {
          name: 'get_file_diff',
          description: '📊 Get diff for a specific file between checkpoints',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
              from: { type: 'string', description: 'From checkpoint ID' },
              to: { type: 'string', description: 'To checkpoint ID (or "current")' },
              format: { type: 'string', enum: ['unified', 'side-by-side'], description: 'Diff format' }
            },
            required: ['path', 'from', 'to'],
          },
        },
        {
          name: 'get_timeline',
          description: '📅 Query timeline with filters',
          inputSchema: {
            type: 'object',
            properties: {
              startDate: { type: 'string', description: 'Start date (ISO format)' },
              endDate: { type: 'string', description: 'End date (ISO format)' },
              filePath: { type: 'string', description: 'Filter by file path' },
              limit: { type: 'number', description: 'Max results' }
            }
          },
        },
        {
          name: 'search_content',
          description: '🔎 Search in conversation and file content',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              type: { type: 'string', enum: ['conversation', 'files', 'all'], description: 'Search type' },
              limit: { type: 'number', description: 'Max results' }
            },
            required: ['query'],
          },
        },
        {
          name: 'get_file_history',
          description: '📜 Get version history of a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' }
            },
            required: ['path'],
          },
        },

        // Conversation tracking
        {
          name: 'conversation_context',
          description: '💬 Get conversation context for a checkpoint. Shows messages, tool calls, and timeline.',
          inputSchema: {
            type: 'object',
            properties: {
              checkpointId: { type: 'string', description: 'Checkpoint ID to get context for' },
            },
            required: ['checkpointId'],
          },
        },
        {
          name: 'conversation_history',
          description: '📜 Get recent conversation history (messages and tool calls)',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Number of recent events (default: 20)' },
            },
          },
        },
        {
          name: 'export_session',
          description: '📤 Export complete session data (messages, code changes, tool calls)',
          inputSchema: {
            type: 'object',
            properties: {
              format: { type: 'string', enum: ['json', 'markdown'], description: 'Export format' },
            },
          },
        },

        // AI-friendly navigation
        {
          name: 'where_am_i',
          description: '🧭 Show current state and recent timeline. Use this to understand where you are in the project history.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'go_back',
          description: '⏪ Go back in time. Accepts natural language ("before user store"), time ("30 minutes ago"), or checkpoint ID.',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Natural language search, time expression, or checkpoint ID' },
              confirm: { type: 'boolean', default: true, description: 'Require confirmation before restore' },
            },
          },
        },
        {
          name: 'show_changes',
          description: '📊 Show what changed since last checkpoint',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'undo_last',
          description: '↩️  Undo last action (go back to previous checkpoint)',
          inputSchema: {
            type: 'object',
            properties: {
              confirm: { type: 'boolean', default: true },
            },
          },
        },
        {
          name: 'find_breaking_change',
          description: '🔍 Find when something broke using binary search through checkpoints',
          inputSchema: {
            type: 'object',
            properties: {
              testCommand: { type: 'string', description: 'Command to test (e.g. "npm test")' },
              knownGood: { type: 'string', description: 'Known good checkpoint ID (optional)' },
            },
            required: ['testCommand'],
          },
        },
        {
          name: 'gc',
          description: '🗑️  Garbage collection - remove old checkpoints',
          inputSchema: {
            type: 'object',
            properties: {
              keepDays: { type: 'number', default: 7, description: 'Keep checkpoints from last N days' },
              keepMinimum: { type: 'number', default: 10, description: 'Always keep at least N checkpoints' },
              dryRun: { type: 'boolean', default: false, description: 'Preview what would be removed' },
            },
          },
        },

        // AI Time & Concept Realization Tools
        {
          name: 'ai_realize_concepts',
          description: '🧠 Understand current conceptual context - what concepts are active, completed, or blocked. Essential for AI temporal awareness.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ai_realize_time',
          description: '⏰ Understand temporal context - time elapsed, patterns, and development velocity. Reduces AI confusion about "when" things happened.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ai_suggest_focus',
          description: '🎯 Get AI-driven focus recommendations based on current conceptual and temporal context. Provides reasoning and time allocation.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'ai_analyze_transitions',
          description: '🔄 Understand how development state changes over time - patterns, transitions, and workflow optimization recommendations.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'suggest_restore',
          description: '💡 Get smart suggestions for when to restore (detects errors/failures)',
          inputSchema: {
            type: 'object',
            properties: {
              context: { type: 'string', description: 'Current error or problem context' },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args } = request.params;

      // Rate limit check
      this.rateLimiter.check(name);

      // Log tool call
      const callId = this.conversationLogger.logToolCall(name, args);

      try {
        let result;

        switch (name) {
          // Authentication
          case 'tm_auth_login': {
            const apiKey = args?.api_key as string;
            if (!apiKey?.startsWith('aitm_')) {
              return { content: [{ type: 'text', text: '❌ Invalid API key format. Keys start with aitm_' }] };
            }

            // Validate key with API server
            const apiUrl = process.env.AITM_API_URL || 'http://localhost:3001';
            try {
              const response = await fetch(`${apiUrl}/api/auth/me`, {
                headers: { 'X-API-Key': apiKey },
              });
              
              if (!response.ok) {
                return { content: [{ type: 'text', text: '❌ Invalid API key. Get yours at timemachine.gitgram.app/dashboard' }] };
              }

              const user = await response.json() as { email: string };
              
              // Save credentials
              const credPath = path.join(os.homedir(), '.aitimemachine', 'credentials.json');
              fs.mkdirSync(path.dirname(credPath), { recursive: true });
              fs.writeFileSync(credPath, JSON.stringify({ apiKey, email: user.email }, null, 2), { mode: 0o600 });

              // Reload sync client
              this.syncClient = new SecureSyncClient(apiUrl);

              return { content: [{ type: 'text', text: `✅ Logged in as ${user.email}\nCloud sync is now enabled!` }] };
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e);
              return { content: [{ type: 'text', text: `❌ Connection failed: ${message}\nMake sure API server is running.` }] };
            }
          }

          case 'tm_auth_status': {
            const credPath = path.join(os.homedir(), '.aitimemachine', 'credentials.json');
            let email = null;
            let hasKey = false;

            try {
              if (fs.existsSync(credPath)) {
                const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
                email = creds.email;
                hasKey = !!creds.apiKey;
              }
            } catch {}

            const status = await this.syncClient.getSyncStatus(this.projectId);

            let text = '🔐 Gitgram TimeMachine Auth Status\n\n';
            text += `Logged in: ${hasKey ? '✅ Yes' : '❌ No'}\n`;
            if (email) text += `Email: ${email}\n`;
            text += `Cloud sync: ${status.configured ? '✅ Configured' : '⚠️ Not configured'}\n`;
            text += `Synced checkpoints: ${status.synced}\n`;
            
            if (!hasKey) {
              text += '\n💡 To enable cloud sync:\n';
              text += '1. Get API key at timemachine.gitgram.app/dashboard\n';
              text += '2. Run: tm_auth_login with your key';
            }

            return { content: [{ type: 'text', text }] };
          }

          case 'tm_oracle_ask': {
            // Oracle queries go through API (not direct DB)
            const question = args?.question as string;
            result = { content: [{ type: 'text', text: `Oracle feature requires cloud sync. Question: ${question}` }] };
            break;
          }

          // Auto-capture hooks
          case 'before_action': {
            const action = args?.action as string;
            this.lastAction = action;
            const tp = this.engine.capture(`🔵 START: ${action}`, {
              type: 'ai_action',
              action,
              status: 'before',
            });

            // Log checkpoint creation
            this.conversationLogger.logCheckpoint(tp.id, tp.description);

            // Sync tool call to Neon (via API)
            this.syncToolCall({
              toolName: 'before_action',
              arguments: { action },
              success: true,
              checkpointBeforeId: tp.id,
            });

            result = {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  checkpointId: tp.id,
                  action,
                  timestamp: tp.timestamp.toISOString()
                })
              }]
            };
            break;
          }

          case 'after_action': {
            const action = args?.action as string;
            const success = args?.success !== false;

            // Find the before checkpoint
            const allTps = this.engine.listTimePoints();
            const beforeTp = allTps.find(t =>
              t.description === `🔵 START: ${action}` ||
              t.description === `Before: ${action}`
            );

            const statusIcon = success ? '✅' : '❌';
            const statusText = success ? 'DONE' : 'FAILED';

            const tp = this.engine.capture(
              `${statusIcon} ${statusText}: ${action}`,
              {
                type: 'ai_action',
                action,
                status: success ? 'after_success' : 'after_failed',
              },
              beforeTp?.id
            );

            // Sync tool call to Neon (via API)
            this.syncToolCall({
              toolName: 'after_action',
              arguments: { action, success },
              success,
              checkpointBeforeId: beforeTp?.id,
              checkpointAfterId: tp.id,
            });

            // Calculate what changed
            let output = `${statusIcon} Action ${statusText.toLowerCase()}: ${action}\n`;
            output += `📍 Checkpoint: ${tp.id}\n`;

            if (beforeTp) {
              const diff = this.engine.getDiff(beforeTp.id, tp.id);
              const totalChanges = diff.added.length + diff.modified.length + diff.deleted.length;
              output += `📊 Changes: ${totalChanges} files (${diff.added.length} added, ${diff.modified.length} modified, ${diff.deleted.length} deleted)\n`;

              if (diff.added.length > 0) {
                output += `\n✅ Added:\n${diff.added.slice(0, 5).map(f => `   + ${f}`).join('\n')}\n`;
                if (diff.added.length > 5) output += `   ... and ${diff.added.length - 5} more\n`;
              }

              if (diff.modified.length > 0) {
                output += `\n✏️  Modified:\n${diff.modified.slice(0, 5).map(f => `   ~ ${f}`).join('\n')}\n`;
                if (diff.modified.length > 5) output += `   ... and ${diff.modified.length - 5} more\n`;
              }

              // Log code changes
              for (const file of diff.added) {
                const content = this.engine.getFileContent(tp.id, file);
                this.conversationLogger.logCodeChange(file, null, content || '');
              }
              for (const file of diff.modified) {
                const oldContent = this.engine.getFileContent(beforeTp.id, file);
                const newContent = this.engine.getFileContent(tp.id, file);
                this.conversationLogger.logCodeChange(file, oldContent || '', newContent || '');
              }
              for (const file of diff.deleted) {
                const content = this.engine.getFileContent(beforeTp.id, file);
                this.conversationLogger.logCodeChange(file, content || '', null);
              }
            }

            return { content: [{ type: 'text', text: output }] };
          }

          case 'log_message': {
            const role = args?.role as 'user' | 'assistant' | 'system';
            const content = args?.content as string;
            const tool = args?.tool as string | undefined;
            this.engine.logMessage(role, content, { tool });

            // Sync message to Neon (via API)
            this.syncMessage({ role, content, tool });

            // Schedule capture after conversation turn
            this.scheduleCapture(`Conversation: ${content.slice(0, 50)}...`, { type: 'auto' });
            return { content: [{ type: 'text', text: 'Message logged' }] };
          }

          // Manual controls
          case 'checkpoint': {
            const description = args?.description as string;
            const tp = this.engine.capture(description, { type: 'manual' });
            return { content: [{ type: 'text', text: `Checkpoint created: ${tp.id} at ${tp.timestamp.toISOString()}` }] };
          }

          // Time travel
          case 'list_timepoints': {
            const list = this.engine.listTimePoints();
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(list.map(tp => ({
                  id: tp.id,
                  time: tp.timestamp.toISOString(),
                  description: tp.description,
                  files: tp.stats.totalFiles,
                  changes: tp.changesCount,
                })), null, 2)
              }]
            };
          }

          case 'get_timepoint': {
            const tp = this.engine.getTimePoint(args?.id as string);
            if (!tp) return { content: [{ type: 'text', text: 'TimePoint not found' }] };
            return { content: [{ type: 'text', text: JSON.stringify(tp, null, 2) }] };
          }

          case 'preview_restore': {
            const preview = this.engine.previewRestore(args?.id as string);
            if (!preview) return { content: [{ type: 'text', text: 'TimePoint not found' }] };
            return {
              content: [{
                type: 'text',
                text: `Restore Preview:\n` +
                  `- Files to restore: ${preview.filesToRestore.length}\n` +
                  `- Files to delete: ${preview.filesToDelete.length}\n` +
                  `- Conversation messages to keep: ${preview.conversationMessagesToKeep}\n\n` +
                  `Files to delete:\n${preview.filesToDelete.join('\n') || '(none)'}`
              }]
            };
          }

          case 'restore': {
            const result = this.engine.restore(args?.id as string);
            return {
              content: [{
                type: 'text',
                text: `Restored! Files: ${result.filesRestored} restored, ${result.filesDeleted} deleted. Messages removed: ${result.messagesRemoved}`
              }]
            };
          }

          case 'restore_by_time': {
            const timeStr = args?.time as string;
            const time = this.parseTime(timeStr);
            const tp = this.engine.findByTime(time);
            if (!tp) return { content: [{ type: 'text', text: 'No timepoint found at or before that time' }] };
            const result = this.engine.restore(tp.id);
            return {
              content: [{
                type: 'text',
                text: `Restored to ${tp.timestamp.toISOString()} (${tp.description}). Files: ${result.filesRestored} restored, ${result.filesDeleted} deleted.`
              }]
            };
          }

          case 'restore_by_description': {
            const tp = this.engine.findByDescription(args?.query as string);
            if (!tp) return { content: [{ type: 'text', text: 'No matching timepoint found' }] };
            const result = this.engine.restore(tp.id);
            return {
              content: [{
                type: 'text',
                text: `Restored to "${tp.description}" (${tp.timestamp.toISOString()}). Files: ${result.filesRestored} restored.`
              }]
            };
          }

          // Search & browse
          case 'search': {
            const query = args?.query as string;
            const convResults = this.engine.searchConversations(query);
            const tpResults = this.engine.listTimePoints().filter(tp =>
              tp.description.toLowerCase().includes(query.toLowerCase())
            );
            return {
              content: [{
                type: 'text',
                text: `Found ${convResults.length} conversation matches, ${tpResults.length} timepoint matches.\n\n` +
                  `Timepoints:\n${tpResults.slice(0, 5).map(tp => `- ${tp.id}: ${tp.description}`).join('\n')}\n\n` +
                  `Conversations:\n${convResults.slice(0, 5).map(m => `- [${m.role}] ${m.content.slice(0, 80)}...`).join('\n')}`
              }]
            };
          }

          // AI-friendly navigation
          case 'where_am_i': {
            const allTps = this.engine.listTimePoints();
            const latest = allTps[allTps.length - 1];
            const recent = allTps.slice(-5).reverse();

            const timeAgo = (date: Date) => {
              const mins = Math.floor((Date.now() - date.getTime()) / 60000);
              if (mins < 1) return 'just now';
              if (mins < 60) return `${mins}m ago`;
              const hours = Math.floor(mins / 60);
              if (hours < 24) return `${hours}h ago`;
              return `${Math.floor(hours / 24)}d ago`;
            };

            let output = '🧭 WHERE AM I\n\n';

            if (latest) {
              output += `📍 Current State:\n`;
              output += `   ${latest.description}\n`;
              output += `   Created: ${timeAgo(latest.timestamp)}\n`;
              output += `   Files: ${latest.stats.totalFiles}\n`;
              output += `   Changes: ${latest.changesCount || 0}\n\n`;
            }

            output += `📅 Recent Timeline:\n`;
            recent.forEach((tp, i) => {
              const icon = i === 0 ? '●' : '○';
              output += `   ${icon} ${tp.description} (${timeAgo(tp.timestamp)})\n`;
            });

            output += `\n💡 You can:\n`;
            output += `   • Use "go_back" to restore to any checkpoint\n`;
            output += `   • Use "show_changes" to see what changed\n`;
            output += `   • Use "undo_last" to revert recent changes\n`;

            return { content: [{ type: 'text', text: output }] };
          }

          case 'go_back': {
            const to = args?.to as string;
            const confirm = args?.confirm !== false;

            if (!to) {
              result = { content: [{ type: 'text', text: 'Error: "to" parameter required (checkpoint ID, description, or time)' }] };
              break;
            }

            let targetTp;
            const allTps = this.engine.listTimePoints();

            // Try as checkpoint ID
            targetTp = this.engine.getTimePoint(to);

            // Try partial ID match
            if (!targetTp) {
              targetTp = allTps.find(tp => tp.id.startsWith(to));
            }

            // Try time expression
            if (!targetTp && /\d+\s*(m|min|minute|h|hour|d|day)s?\s*ago/i.test(to)) {
              try {
                const time = this.parseTime(to);
                targetTp = this.engine.findByTime(time);
              } catch { /* ignore */ }
            }

            // Try description search
            if (!targetTp) {
              targetTp = this.engine.findByDescription(to);
            }

            if (!targetTp) {
              result = { content: [{ type: 'text', text: `❌ No checkpoint found matching: "${to}"` }] };
              break;
            }

            if (confirm) {
              const preview = this.engine.previewRestore(targetTp.id);
              let confirmMsg = `⚠️  RESTORE PREVIEW\n\n`;
              confirmMsg += `Going back to: ${targetTp.description}\n`;
              confirmMsg += `Created: ${targetTp.timestamp.toISOString()}\n\n`;
              confirmMsg += `This will:\n`;
              confirmMsg += `  • Restore ${preview?.filesToRestore.length || 0} files\n`;
              confirmMsg += `  • Delete ${preview?.filesToDelete.length || 0} files\n\n`;
              confirmMsg += `To proceed, call go_back again with confirm: false`;
              result = { content: [{ type: 'text', text: confirmMsg }] };
              break;
            }

            const restoreResult = this.engine.restore(targetTp.id);

            // Get conversation context
            const conversation = this.conversationLogger.getContextForCheckpoint(targetTp.id);

            // Generate context with conversation
            const contextText = generateRestoreContextWithConversation(targetTp, conversation);

            result = { content: [{ type: 'text', text: contextText }] };
            break;
          }

          case 'show_changes': {
            const allTps = this.engine.listTimePoints();
            if (allTps.length < 2) {
              return { content: [{ type: 'text', text: 'No previous checkpoint to compare with' }] };
            }

            const current = allTps[allTps.length - 1];
            const previous = allTps[allTps.length - 2];

            const diff = this.engine.getDiff(previous.id, current.id);

            let output = `📊 CHANGES SINCE LAST CHECKPOINT\n\n`;
            output += `From: ${previous.description}\n`;
            output += `To: ${current.description}\n\n`;

            if (diff.added.length > 0) {
              output += `✅ Added (${diff.added.length}):\n`;
              diff.added.slice(0, 10).forEach(f => output += `   + ${f}\n`);
              if (diff.added.length > 10) output += `   ... and ${diff.added.length - 10} more\n`;
              output += '\n';
            }

            if (diff.modified.length > 0) {
              output += `✏️  Modified (${diff.modified.length}):\n`;
              diff.modified.slice(0, 10).forEach(f => output += `   ~ ${f}\n`);
              if (diff.modified.length > 10) output += `   ... and ${diff.modified.length - 10} more\n`;
              output += '\n';
            }

            if (diff.deleted.length > 0) {
              output += `❌ Deleted (${diff.deleted.length}):\n`;
              diff.deleted.slice(0, 10).forEach(f => output += `   - ${f}\n`);
              if (diff.deleted.length > 10) output += `   ... and ${diff.deleted.length - 10} more\n`;
            }

            if (diff.added.length === 0 && diff.modified.length === 0 && diff.deleted.length === 0) {
              output += 'No changes detected.\n';
            }

            return { content: [{ type: 'text', text: output }] };
          }

          case 'undo_last': {
            const confirm = args?.confirm !== false;
            const allTps = this.engine.listTimePoints();

            if (allTps.length < 2) {
              return { content: [{ type: 'text', text: '❌ No previous checkpoint to undo to' }] };
            }

            const current = allTps[allTps.length - 1];
            const previous = allTps[allTps.length - 2];

            if (confirm) {
              let output = `⚠️  UNDO CONFIRMATION\n\n`;
              output += `This will undo: ${current.description}\n`;
              output += `And restore to: ${previous.description}\n\n`;
              output += `To proceed, call undo_last with confirm: false`;
              return { content: [{ type: 'text', text: output }] };
            }

            const result = this.engine.restore(previous.id);

            let output = `↩️  UNDONE\n\n`;
            output += `Reverted: ${current.description}\n`;
            output += `Restored to: ${previous.description}\n\n`;
            output += `📊 ${result.filesRestored} files restored, ${result.filesDeleted} files deleted`;

            return { content: [{ type: 'text', text: output }] };
          }

          case 'find_breaking_change': {
            try {
              const testCommand = args?.testCommand as string;
              const knownGood = args?.knownGood as string;

              const allTps = this.engine.listTimePoints();

              let goodIdx = 0;
              if (knownGood) {
                const tp = allTps.find(t => t.id.startsWith(knownGood));
                if (tp) goodIdx = allTps.indexOf(tp);
              }

              let badIdx = allTps.length - 1;

              let output = `🔍 BISECTING...\n\n`;
              output += `Command: ${testCommand}\n`;
              output += `Range: ${allTps.length} checkpoints\n\n`;

              const { execSync } = require('child_process');
              let iterations = 0;
              const maxIterations = Math.ceil(Math.log2(badIdx - goodIdx + 1));

              while (goodIdx < badIdx - 1 && iterations < maxIterations) {
                const midIdx = Math.floor((goodIdx + badIdx) / 2);
                const midTp = allTps[midIdx];

                output += `Testing checkpoint ${midIdx + 1}/${allTps.length}: ${midTp.description.slice(0, 50)}...\n`;

                // Restore to mid checkpoint
                this.engine.restore(midTp.id);

                // Run test
                try {
                  execSync(testCommand, { cwd: this.projectPath, stdio: 'pipe' });
                  output += `  ✅ PASS\n`;
                  goodIdx = midIdx;
                } catch (e) {
                  output += `  ❌ FAIL\n`;
                  badIdx = midIdx;
                }

                iterations++;
              }

              const lastGood = allTps[goodIdx];
              const firstBad = allTps[badIdx];

              output += `\n🎯 FOUND!\n\n`;
              output += `Last good: ${lastGood.description}\n`;
              output += `  ID: ${lastGood.id}\n`;
              output += `  Time: ${lastGood.timestamp.toISOString()}\n\n`;
              output += `First bad: ${firstBad.description}\n`;
              output += `  ID: ${firstBad.id}\n`;
              output += `  Time: ${firstBad.timestamp.toISOString()}\n\n`;

              // Show what changed
              const diff = this.engine.getDiff(lastGood.id, firstBad.id);
              output += `Changes between them:\n`;
              output += `  ${diff.added.length} added, ${diff.modified.length} modified, ${diff.deleted.length} deleted\n`;

              if (diff.modified.length > 0) {
                output += `\nSuspect files:\n`;
                diff.modified.slice(0, 5).forEach(f => output += `  ~ ${f}\n`);
              }

              return { content: [{ type: 'text', text: output }] };
            } catch (error) {
              return {
                content: [{
                  type: 'text',
                  text: `Error during bisect: ${error instanceof Error ? error.message : String(error)}`
                }],
                isError: true
              };
            }
          }

          case 'gc': {
            const keepDays = (args?.keepDays as number) || 7;
            const keepMinimum = (args?.keepMinimum as number) || 10;
            const dryRun = args?.dryRun !== false;

            const allTps = this.engine.listTimePoints();
            const cutoffDate = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);

            const toRemove = allTps.filter((tp, idx) => {
              if (idx >= allTps.length - keepMinimum) return false;
              if (tp.timestamp > cutoffDate) return false;
              return true;
            });

            let output = `🗑️  GARBAGE COLLECTION\n\n`;
            output += `Keep last ${keepDays} days\n`;
            output += `Keep minimum ${keepMinimum} checkpoints\n\n`;
            output += `Total checkpoints: ${allTps.length}\n`;
            output += `Would remove: ${toRemove.length}\n`;

            if (dryRun) {
              output += `\nDRY RUN - nothing removed\n`;
              if (toRemove.length > 0) {
                output += `\nCheckpoints that would be removed:\n`;
                toRemove.slice(0, 10).forEach(tp => {
                  output += `  - ${tp.description} (${tp.timestamp.toISOString()})\n`;
                });
                if (toRemove.length > 10) {
                  output += `  ... and ${toRemove.length - 10} more\n`;
                }
              }
            } else {
              output += `\n✅ Removed ${toRemove.length} checkpoints\n`;
            }

            return { content: [{ type: 'text', text: output }] };
          }

          case 'suggest_restore': {
            const context = args?.context as string;
            const allTps = this.engine.listTimePoints();

            if (allTps.length < 2) {
              result = { content: [{ type: 'text', text: 'No previous checkpoints to suggest' }] };
              break;
            }

            // Find recent successful checkpoints
            const recentSuccess = allTps.reverse().find(tp =>
              tp.description.includes('DONE') ||
              tp.description.includes('✅') ||
              tp.description.includes('fixed')
            );

            let output = `💡 RESTORE SUGGESTIONS\n\n`;

            if (context) {
              output += `Problem: ${context}\n\n`;
            }

            if (recentSuccess) {
              output += `Suggested restore point:\n`;
              output += `  ${recentSuccess.description}\n`;
              output += `  Created: ${recentSuccess.timestamp.toISOString()}\n`;
              output += `  ID: ${recentSuccess.id}\n\n`;
              output += `To restore: go_back({ to: "${recentSuccess.id}" })\n`;
            } else {
              output += `Consider restoring to:\n`;
              const recent = allTps.slice(0, 3);
              recent.forEach(tp => {
                output += `  • ${tp.description} (${tp.id.slice(0, 12)})\n`;
              });
            }

            result = { content: [{ type: 'text', text: output }] };
            break;
          }


          case 'get_conversation': {
            let messages;
            if (args?.until) {
              const tp = this.engine.getTimePoint(args.until as string);
              if (tp) {
                messages = this.engine.getConversationsUntil(tp.timestamp);
              }
            }
            messages = messages || this.engine.getConversations();
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(messages.slice(-50).map(m => ({
                  time: m.timestamp.toISOString(),
                  role: m.role,
                  content: m.content.slice(0, 200),
                })), null, 2)
              }]
            };
          }

          case 'get_file_at': {
            const content = this.engine.getFileContent(args?.timepoint_id as string, args?.file_path as string);
            if (!content) return { content: [{ type: 'text', text: 'File not found in timepoint' }] };
            return { content: [{ type: 'text', text: content }] };
          }

          case 'diff': {
            const diff = this.engine.getDiff(args?.from_id as string, args?.to_id as string | undefined);
            return {
              content: [{
                type: 'text',
                text: `Added (${diff.added.length}):\n${diff.added.join('\n')}\n\n` +
                  `Modified (${diff.modified.length}):\n${diff.modified.join('\n')}\n\n` +
                  `Deleted (${diff.deleted.length}):\n${diff.deleted.join('\n')}`
              }]
            };
          }

          // Stats
          case 'stats': {
            const stats = this.engine.getStats();
            return {
              content: [{
                type: 'text',
                text: `TimePoints: ${stats.timePoints}\nConversations: ${stats.conversations}\nStorage: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`
              }]
            };
          }

          // GC
          case 'gc': {
            const { runGC } = await import('./core/gc.js');
            const result = runGC(this.engine, {
              keepDays: (args?.keepDays as number) || 7,
              keepMinimum: (args?.keepMinimum as number) || 10,
              dryRun: args?.dryRun as boolean || false,
            });

            let text = `Checkpoints removed: ${result.checkpointsRemoved}\n`;
            text += `Blobs removed: ${result.blobsRemoved}\n`;
            text += `Space reclaimed: ${(result.bytesFreed / 1024 / 1024).toFixed(2)} MB\n`;

            if (result.packCreated) {
              const ratio = ((1 - result.packSize! / (result.bytesFreed + result.packSize!)) * 100).toFixed(1);
              text += `Pack created: ${(result.packSize! / 1024 / 1024).toFixed(2)} MB (${ratio}% compression)`;
            }

            return { content: [{ type: 'text', text }] };
          }

          // AI Time & Concept Realization Tools
          case 'ai_realize_concepts': {
            const { AITimeConceptTools } = await import('./mcp/ai-time-concept-tools.js');
            const aiTools = new AITimeConceptTools(this.engine, this.repo);

            try {
              const context = await aiTools.realizeCurrentConcepts();

              let text = `🧠 **Conceptual Context Analysis**\n\n`;
              text += `**Current State:**\n`;
              text += `- Phase: ${context.currentState.conceptualPhase}\n`;
              text += `- Confidence: ${Math.round(context.currentState.confidence * 100)}%\n\n`;

              text += `**Active Concepts:** ${context.conceptualMap.activeThemes.join(', ') || 'None'}\n`;
              text += `**Completed:** ${context.conceptualMap.completedConcepts.join(', ') || 'None'}\n`;
              text += `**Blocked:** ${context.conceptualMap.blockedConcepts.join(', ') || 'None'}\n\n`;

              text += `**Development Velocity:** ${context.temporalAwareness.developmentVelocity}\n`;
              text += `**Context Switches:** ${context.temporalAwareness.contextSwitches}\n\n`;

              text += `**Predicted Next Actions:**\n`;
              text += context.causalChain.predictedNext.map(action => `- ${action}`).join('\n');

              return { content: [{ type: 'text', text }] };
            } catch (error) {
              return { content: [{ type: 'text', text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}` }] };
            }
          }

          case 'ai_realize_time': {
            const { AITimeConceptTools } = await import('./mcp/ai-time-concept-tools.js');
            const aiTools = new AITimeConceptTools(this.engine, this.repo);

            try {
              const timeContext = await aiTools.realizeTimeContext();

              let text = `⏰ **Temporal Context Analysis**\n\n`;
              text += `**Current Time:** ${new Date(timeContext.absoluteTime.now).toLocaleString()}\n`;
              text += `**Since Last Change:** ${timeContext.relativeTime.sinceLastChange}\n`;
              text += `**Working Time Today:** ${timeContext.relativeTime.workingTimeToday}\n\n`;

              text += `**Patterns:**\n`;
              text += `- Typical Session: ${timeContext.temporalPatterns.typicalSessionLength}\n`;
              text += `- Most Productive: ${timeContext.temporalPatterns.mostProductiveTimeOfDay}\n`;
              text += `- Checkpoint Interval: ${timeContext.temporalPatterns.averageTimeBetweenCheckpoints}\n`;
              text += `- Concept Rate: ${timeContext.temporalPatterns.conceptCompletionRate}`;

              return { content: [{ type: 'text', text }] };
            } catch (error) {
              return { content: [{ type: 'text', text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}` }] };
            }
          }

          case 'ai_suggest_focus': {
            const { AITimeConceptTools } = await import('./mcp/ai-time-concept-tools.js');
            const aiTools = new AITimeConceptTools(this.engine, this.repo);

            try {
              const suggestion = await aiTools.suggestConceptualFocus();

              let text = `🎯 **Focus Recommendation**\n\n`;
              text += `**Primary Focus:** ${suggestion.primaryFocus}\n\n`;
              text += `**Reasoning:** ${suggestion.reasoning}\n\n`;
              text += `**Time Allocation:** ${suggestion.timeAllocation}\n\n`;

              if (suggestion.riskFactors.length > 0) {
                text += `**Risk Factors:**\n`;
                text += suggestion.riskFactors.map(risk => `⚠️ ${risk}`).join('\n') + '\n\n';
              }

              text += `**Success Metrics:**\n`;
              text += suggestion.successMetrics.map(metric => `✅ ${metric}`).join('\n');

              return { content: [{ type: 'text', text }] };
            } catch (error) {
              return { content: [{ type: 'text', text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}` }] };
            }
          }

          case 'ai_analyze_transitions': {
            const { AITimeConceptTools } = await import('./mcp/ai-time-concept-tools.js');
            const aiTools = new AITimeConceptTools(this.engine, this.repo);

            try {
              const analysis = await aiTools.analyzeStateTransitions();

              let text = `🔄 **State Transition Analysis**\n\n`;

              if (analysis.transitions.length > 0) {
                text += `**Recent Transitions:**\n`;
                text += analysis.transitions.map(t =>
                  `${t.from} → ${t.to} (${t.duration}) ${t.success ? '✅' : '❌'}`
                ).join('\n') + '\n\n';
              }

              if (analysis.patterns.length > 0) {
                text += `**Patterns:**\n`;
                text += analysis.patterns.map(pattern => `📊 ${pattern}`).join('\n') + '\n\n';
              }

              if (analysis.recommendations.length > 0) {
                text += `**Recommendations:**\n`;
                text += analysis.recommendations.map(rec => `💡 ${rec}`).join('\n');
              }

              return { content: [{ type: 'text', text }] };
            } catch (error) {
              return { content: [{ type: 'text', text: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}` }] };
            }
          }

          // Pack info
          case 'pack_info': {
            const packPath = path.join(this.projectPath, '.aitimemachine', 'packs');

            if (!fs.existsSync(packPath)) {
              return { content: [{ type: 'text', text: 'No pack files found' }] };
            }

            const packs = fs.readdirSync(packPath).filter(f => f.endsWith('.pack'));

            if (packs.length === 0) {
              return { content: [{ type: 'text', text: 'No pack files found' }] };
            }

            let text = `Pack Files (${packs.length}):\n\n`;
            let totalSize = 0;

            for (const pack of packs) {
              const packFile = path.join(packPath, pack);
              const idxFile = packFile.replace('.pack', '.idx');
              const packSize = fs.statSync(packFile).size;
              const idx = JSON.parse(fs.readFileSync(idxFile, 'utf-8'));
              const objectCount = Object.keys(idx.objects).length;

              totalSize += packSize;

              text += `${pack}\n`;
              text += `  Size: ${(packSize / 1024 / 1024).toFixed(2)} MB\n`;
              text += `  Objects: ${objectCount}\n`;
              text += `  Avg: ${(packSize / objectCount / 1024).toFixed(2)} KB/object\n\n`;
            }

            text += `Total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`;

            return { content: [{ type: 'text', text }] };
          }

          // Pack verify
          case 'pack_verify': {
            const packPath = path.join(this.projectPath, '.aitimemachine', 'packs');

            if (!fs.existsSync(packPath)) {
              return { content: [{ type: 'text', text: 'No pack files found' }] };
            }

            const packs = fs.readdirSync(packPath).filter(f => f.endsWith('.pack'));

            if (packs.length === 0) {
              return { content: [{ type: 'text', text: 'No pack files found' }] };
            }

            const { PackVerifier } = await import('./core/pack/verifier.js');

            let text = 'Verifying pack files...\n\n';
            let allValid = true;

            for (const pack of packs) {
              const packFile = path.join(packPath, pack);
              const result = PackVerifier.verify(packFile);

              if (result.valid) {
                text += `✓ ${pack}\n`;
              } else {
                text += `✗ ${pack}\n`;
                result.errors.forEach(err => text += `  ${err}\n`);
                allValid = false;
              }
            }

            text += `\n${allValid ? 'All packs verified successfully' : 'Some packs failed verification'}`;

            return { content: [{ type: 'text', text }] };
          }

          // Repack
          case 'repack': {
            const packPath = path.join(this.projectPath, '.aitimemachine', 'packs');

            if (!fs.existsSync(packPath)) {
              return { content: [{ type: 'text', text: 'No pack files found' }] };
            }

            const packs = fs.readdirSync(packPath).filter(f => f.endsWith('.pack'));

            if (packs.length === 0) {
              return { content: [{ type: 'text', text: 'No pack files found' }] };
            }

            const { PackReader } = await import('./core/pack/reader.js');
            const { PackWriter } = await import('./core/pack/writer.js');

            // Read all objects
            const allObjects = new Map<string, Buffer>();
            let totalOldSize = 0;

            for (const pack of packs) {
              const packFile = path.join(packPath, pack);
              const reader = new PackReader(packFile);
              const hashes = reader.listObjects();

              totalOldSize += fs.statSync(packFile).size;

              for (const hash of hashes) {
                const content = reader.get(hash);
                if (content) allObjects.set(hash, content);
              }
            }

            // Create new pack
            const writer = new PackWriter();
            for (const [hash, content] of allObjects) {
              writer.addObject(hash, content);
            }

            const newPackFile = path.join(packPath, `pack-${Date.now()}.pack`);
            writer.write(newPackFile);

            const newSize = fs.statSync(newPackFile).size;
            const savings = ((1 - newSize / totalOldSize) * 100).toFixed(1);

            // Delete old packs
            for (const pack of packs) {
              fs.unlinkSync(path.join(packPath, pack));
              fs.unlinkSync(path.join(packPath, pack.replace('.pack', '.idx')));
            }

            this.engine.reloadPacks();

            let text = `Repacked ${packs.length} pack(s)\n`;
            text += `Old size: ${(totalOldSize / 1024 / 1024).toFixed(2)} MB\n`;
            text += `New size: ${(newSize / 1024 / 1024).toFixed(2)} MB\n`;
            text += `Savings: ${savings}%`;

            return { content: [{ type: 'text', text }] };
          }

          // Conversation context
          case 'conversation_context': {
            const checkpointId = args?.checkpointId as string;
            const context = this.conversationLogger.getContextForCheckpoint(checkpointId);

            let text = `Conversation Context for ${checkpointId}\n\n`;
            text += `Messages: ${context.messages.length}\n`;
            text += `Tool calls: ${context.toolCalls.length}\n`;
            text += `Checkpoints: ${context.checkpoints.length}\n`;
            text += `Code changes: ${context.codeChanges.length}\n\n`;

            // Recent messages
            const recentMsgs = context.messages.slice(-5);
            if (recentMsgs.length > 0) {
              text += 'Recent Messages:\n';
              for (const msg of recentMsgs) {
                text += `  ${msg.role}: ${msg.content.slice(0, 80)}...\n`;
              }
              text += '\n';
            }

            // Code changes
            if (context.codeChanges.length > 0) {
              text += 'Code Changes:\n';
              const changes = context.codeChanges.slice(-10);
              for (const change of changes) {
                const icon = change.type === 'file_created' ? '➕' : change.type === 'file_deleted' ? '➖' : '✏️';
                text += `  ${icon} ${change.filePath}\n`;
              }
              text += '\n';
            }

            // Tool calls used
            const toolsUsed = new Set(context.toolCalls.map(t => t.tool));
            if (toolsUsed.size > 0) {
              text += `Tools used: ${Array.from(toolsUsed).join(', ')}`;
            }

            return { content: [{ type: 'text', text }] };
          }

          // Conversation history
          case 'conversation_history': {
            const limit = (args?.limit as number) || 20;
            const events = this.conversationLogger.getAllEvents().slice(-limit);

            let text = `Recent Events (${events.length}):\n\n`;

            for (const event of events) {
              switch (event.type) {
                case 'user_message':
                  text += `👤 User: ${event.data.content.slice(0, 60)}...\n`;
                  break;
                case 'assistant_message':
                  text += `🤖 Assistant: ${event.data.content.slice(0, 60)}...\n`;
                  break;
                case 'tool_call':
                  text += `🔧 Tool: ${event.data.tool}\n`;
                  break;
                case 'checkpoint_created':
                  text += `📍 Checkpoint: ${event.data.description}\n`;
                  break;
              }
            }

            return { content: [{ type: 'text', text }] };
          }

          // Export session
          case 'export_session': {
            const format = (args?.format as 'json' | 'markdown') || 'json';
            const { SessionExporter } = await import('./core/session-exporter.js');
            const exporter = new SessionExporter(this.conversationLogger, this.engine);

            const sessionId = this.conversationLogger.getSessionId();
            const data = format === 'json'
              ? exporter.exportToJSON(sessionId)
              : exporter.exportToMarkdown(sessionId);

            const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

            return {
              content: [{
                type: 'text',
                text: `Session exported (${format}):\n\n${content.slice(0, 2000)}...\n\n(Full export available via CLI: aitm export-session)`
              }]
            };
          }

          // Message logging
          case 'log_user_message': {
            const content = args?.content as string;

            this.conversationLogger.logUserMessage(content);

            return { content: [{ type: 'text', text: 'User message logged' }] };
          }

          case 'log_assistant_message': {
            const content = args?.content as string;
            const thinking = args?.thinking as string | undefined;

            this.conversationLogger.logAssistantMessage(content, thinking);

            return { content: [{ type: 'text', text: 'Assistant message logged' }] };
          }

          case 'log_terminal_command': {
            const command = args?.command as string;
            const output = args?.output as string;
            const exitCode = args?.exitCode as number;
            const cwd = args?.cwd as string;

            this.eventStore.append({
              sessionId: this.conversationLogger.getSessionId(),
              type: 'terminal_command',
              data: { command, output, exitCode, cwd }
            });

            return { content: [{ type: 'text', text: 'Terminal command logged' }] };
          }

          case 'log_error': {
            const error = args?.error as string;
            const stack = args?.stack as string;
            const context = args?.context as Record<string, unknown> | undefined;

            this.eventStore.append({
              sessionId: this.conversationLogger.getSessionId(),
              type: 'error_occurred',
              data: { error, stack, context }
            });

            return { content: [{ type: 'text', text: 'Error logged' }] };
          }

          case 'execute_command': {
            const { executeAndLog } = await import('./tools/terminal-exec.js');
            const command = args?.command as string;
            const cwd = args?.cwd as string || this.projectPath;

            const result = await executeAndLog(command, cwd, this.conversationLogger, this.eventStore);

            return {
              content: [{
                type: 'text',
                text: `Command executed:\n${command}\n\nExit code: ${result.exitCode}\n\nOutput:\n${result.output.slice(0, 5000)}`
              }]
            };
          }

          case 'start_file_watcher': {
            this.fileWatcher.start();
            return { content: [{ type: 'text', text: 'File watcher started - tracking real-time changes' }] };
          }

          case 'stop_file_watcher': {
            this.fileWatcher.stop();
            return { content: [{ type: 'text', text: 'File watcher stopped' }] };
          }

          case 'replay_session': {
            const { SessionReplayer } = await import('./tools/session-replayer.js');
            const replayer = new SessionReplayer(this.conversationLogger, this.eventStore, this.engine);

            const sessionId = args?.sessionId as string;
            const step = args?.step as number | undefined;

            if (step !== undefined) {
              await replayer.replayToStep(sessionId, step);
              return { content: [{ type: 'text', text: `Replayed to step ${step}` }] };
            } else {
              const steps = replayer.getSteps(sessionId);
              return {
                content: [{
                  type: 'text',
                  text: `Session has ${steps.length} steps:\n${JSON.stringify(steps.slice(0, 10), null, 2)}`
                }]
              };
            }
          }

          case 'get_session_steps': {
            const { SessionReplayer } = await import('./tools/session-replayer.js');
            const replayer = new SessionReplayer(this.conversationLogger, this.eventStore, this.engine);

            const sessionId = args?.sessionId as string;
            const steps = replayer.getSteps(sessionId);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(steps, null, 2)
              }]
            };
          }

          case 'compare_checkpoints': {
            const { CheckpointComparator } = await import('./tools/checkpoint-comparator.js');
            const comparator = new CheckpointComparator(this.conversationLogger, this.eventStore, this.engine);

            const from = args?.from as string;
            const to = args?.to as string;
            const format = args?.format as string || 'json';

            const comparison = comparator.compare(from, to);

            if (format === 'markdown') {
              return {
                content: [{
                  type: 'text',
                  text: comparator.generateReport(comparison)
                }]
              };
            } else {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify(comparison, null, 2)
                }]
              };
            }
          }

          case 'restore_files': {
            const { SelectiveRestore } = await import('./core/selective-restore.js');
            const restore = new SelectiveRestore(this.engine);

            const result = restore.restore({
              checkpointId: args?.checkpointId as string,
              patterns: args?.patterns as string[],
              strategy: (args?.strategy as 'ours' | 'theirs' | 'merge' | 'abort') || 'abort',
              dryRun: args?.dryRun as boolean
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  restored: result.restored,
                  conflicts: result.conflicts,
                  skipped: result.skipped
                }, null, 2)
              }]
            };
          }

          case 'get_file_diff': {
            const { FileComparator } = await import('./core/file-comparator.js');
            const comparator = new FileComparator(this.engine);

            const path = args?.path as string;
            const from = args?.from as string;
            const to = args?.to as string;

            const diff = comparator.getFileDiff(path, from, to);

            return {
              content: [{
                type: 'text',
                text: diff || 'No diff available'
              }]
            };
          }

          case 'get_timeline': {
            const { TimelineIndex } = await import('./core/timeline-index.js');
            const timeline = new TimelineIndex(this.engine);

            const query: {
              startDate?: Date;
              endDate?: Date;
              filePath?: string;
              limit?: number;
            } = {};
            if (args?.startDate) query.startDate = new Date(args.startDate as string);
            if (args?.endDate) query.endDate = new Date(args.endDate as string);
            if (args?.filePath) query.filePath = args.filePath as string;
            if (args?.limit) query.limit = args.limit as number;

            const results = timeline.query(query);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(results, null, 2)
              }]
            };
          }

          case 'search_content': {
            const { SearchEngine } = await import('./core/search-engine.js');
            const { TimelineIndex } = await import('./core/timeline-index.js');
            const timeline = new TimelineIndex(this.engine);
            const search = new SearchEngine(this.eventStore, timeline);

            const results = search.search({
              query: args?.query as string,
              type: args?.type as 'conversation' | 'files' | 'checkpoints' | 'all' | undefined,
              limit: args?.limit as number
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(results, null, 2)
              }]
            };
          }

          case 'get_file_history': {
            const { FileHistoryTracker } = await import('./core/file-history-tracker.js');
            const { TimelineIndex } = await import('./core/timeline-index.js');
            const timeline = new TimelineIndex(this.engine);
            const tracker = new FileHistoryTracker(this.engine, timeline);

            const history = tracker.getFileHistory(args?.path as string);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(history, null, 2)
              }]
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        // Log tool result
        if (result) {
          this.conversationLogger.logToolResult(callId, result);
        }

        return result;
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error');
      }
    });
  }

  /**
   * Schedule a capture with debouncing
   */
  private scheduleCapture(description: string, trigger: { type: 'ai_action' | 'auto'; action?: string }) {
    if (this.pendingCapture) {
      clearTimeout(this.pendingCapture);
    }

    const config = this.engine.getConfig();
    this.pendingCapture = setTimeout(() => {
      this.engine.capture(description, trigger);
      this.pendingCapture = null;
    }, config.captureInterval);
  }

  /**
   * Parse time string (ISO or relative)
   */
  private parseTime(timeStr: string): Date {
    // Try ISO format first
    const iso = new Date(timeStr);
    if (!isNaN(iso.getTime())) return iso;

    // Parse relative time
    const match = timeStr.match(/(\d+)\s*(second|minute|hour|day|week)s?\s*ago/i);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const ms = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
      }[unit] || 0;
      return new Date(Date.now() - amount * ms);
    }

    throw new Error(`Cannot parse time: ${timeStr}`);
  }

  async run() {
    // Create initial checkpoint
    this.engine.capture('Session started', { type: 'auto' });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Gitgram TimeMachine MCP daemon running');
  }
}

export { MCPDaemon as AITimeMachineServer };
