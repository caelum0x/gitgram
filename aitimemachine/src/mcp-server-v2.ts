import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { SessionDaemon } from './server/index.js';

/**
 * MCP Server v2 - Uses SessionDaemon for complete session capture
 */
export class MCPServerV2 {
  private server: Server;
  private daemon: SessionDaemon;
  private projectPath: string;
  private shuttingDown = false;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.daemon = new SessionDaemon();
    this.server = new Server(
      { name: 'aitimemachine', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Session capture
        {
          name: 'before_action',
          description: 'Call BEFORE making any file changes. Creates a complete session snapshot.',
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
          description: 'Call AFTER making file changes. Records the completed action.',
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
          description: 'Log a conversation message for persistent memory',
          inputSchema: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant', 'system'] },
              content: { type: 'string' },
              tool: { type: 'string' },
            },
            required: ['role', 'content'],
          },
        },
        {
          name: 'checkpoint',
          description: 'Create a manual checkpoint with description',
          inputSchema: {
            type: 'object',
            properties: { description: { type: 'string' } },
            required: ['description'],
          },
        },

        // Session browsing
        {
          name: 'list_sessions',
          description: 'List all captured sessions for this project',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'get_session',
          description: 'Get details of a specific session including files and diffs',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        {
          name: 'get_session_diff',
          description: 'Get the diff (changes) from a session',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        {
          name: 'get_file_at_session',
          description: 'Get file content as it was at a specific session',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string' },
              file_path: { type: 'string' },
            },
            required: ['session_id', 'file_path'],
          },
        },

        // Time travel
        {
          name: 'restore_session',
          description: 'Restore project to a specific session state (files + conversation)',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
          },
        },
        {
          name: 'search_sessions',
          description: 'Search sessions by description or conversation content',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },

        // Stats
        {
          name: 'stats',
          description: 'Get storage and session statistics',
          inputSchema: { type: 'object', properties: {} },
        },

        // Git state
        {
          name: 'get_git_state',
          description: 'Get current git state (branch, uncommitted changes, etc)',
          inputSchema: { type: 'object', properties: {} },
        },

        // Compare sessions
        {
          name: 'compare_sessions',
          description: 'Compare two sessions to see what changed between them',
          inputSchema: {
            type: 'object',
            properties: {
              from_id: { type: 'string', description: 'Earlier session ID' },
              to_id: { type: 'string', description: 'Later session ID' },
            },
            required: ['from_id', 'to_id'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'before_action': {
            const session = this.daemon.beforeAction(
              this.projectPath,
              args?.action as string,
              'claude_code'
            );
            return {
              content: [{
                type: 'text',
                text: session
                  ? `Session captured: ${session.id}\nFiles: ${session.stats.totalFiles}\nChanges: ${session.stats.addedFiles} added, ${session.stats.modifiedFiles} modified, ${session.stats.deletedFiles} deleted`
                  : 'No changes to capture'
              }]
            };
          }

          case 'after_action': {
            this.daemon.afterAction(this.projectPath, args?.action as string, 'claude_code');
            return { content: [{ type: 'text', text: 'Action recorded, session will be captured' }] };
          }

          case 'log_message': {
            this.daemon.logMessage(
              this.projectPath,
              args?.role as 'user' | 'assistant' | 'system',
              args?.content as string,
              args?.tool as string
            );
            return { content: [{ type: 'text', text: 'Message logged' }] };
          }

          case 'checkpoint': {
            const session = this.daemon.checkpoint(this.projectPath, args?.description as string);
            return {
              content: [{
                type: 'text',
                text: session
                  ? `Checkpoint created: ${session.id}\n${session.stats.totalFiles} files, ${session.diffs.length} changes`
                  : 'No changes to checkpoint'
              }]
            };
          }

          case 'list_sessions': {
            const sessions = this.daemon.getSessions(this.projectPath);
            return {
              content: [{
                type: 'text',
                text: sessions.length === 0
                  ? 'No sessions yet'
                  : sessions.slice(0, 20).map(s =>
                      `${s.id.slice(0, 20)} | ${s.createdAt.toISOString()} | ${s.description}`
                    ).join('\n')
              }]
            };
          }

          case 'get_session': {
            const session = this.daemon.getSession(args?.id as string);
            if (!session) return { content: [{ type: 'text', text: 'Session not found' }] };
            
            return {
              content: [{
                type: 'text',
                text: `Session: ${session.id}
Created: ${session.createdAt.toISOString()}
Description: ${session.trigger.description}
Files: ${session.stats.totalFiles} (${(session.stats.totalSize / 1024 / 1024).toFixed(2)} MB)
Changes: +${session.stats.addedFiles} ~${session.stats.modifiedFiles} -${session.stats.deletedFiles}
Messages: ${session.stats.messageCount}

Recent files:
${session.files.slice(0, 10).map(f => `  ${f.path} (${f.size} bytes)`).join('\n')}`
              }]
            };
          }

          case 'get_session_diff': {
            const session = this.daemon.getSession(args?.id as string);
            if (!session) return { content: [{ type: 'text', text: 'Session not found' }] };

            const diffText = session.diffs.map(d => {
              let text = `${d.type === 'added' ? '+' : d.type === 'deleted' ? '-' : '~'} ${d.path}`;
              if (d.hunks && d.hunks.length > 0) {
                text += '\n' + d.hunks.map(h => h.lines.join('\n')).join('\n---\n');
              }
              return text;
            }).join('\n\n');

            return { content: [{ type: 'text', text: diffText || 'No changes in this session' }] };
          }

          case 'get_file_at_session': {
            const content = this.daemon.getFileContent(args?.session_id as string, args?.file_path as string);
            if (!content) return { content: [{ type: 'text', text: 'File not found in session' }] };
            return { content: [{ type: 'text', text: content.toString('utf-8') }] };
          }

          case 'restore_session': {
            const result = this.daemon.restore(args?.id as string);
            const missingNote = result.filesMissing > 0 ? `, ${result.filesMissing} files missing content` : '';
            return {
              content: [{
                type: 'text',
                text: `Restored! ${result.filesRestored} files restored, ${result.filesDeleted} files deleted${missingNote}`
              }]
            };
          }

          case 'search_sessions': {
            const query = (args?.query as string).toLowerCase();
            const sessions = this.daemon.getSessions(this.projectPath);
            const matches = sessions.filter(s => s.description.toLowerCase().includes(query));
            
            return {
              content: [{
                type: 'text',
                text: matches.length === 0
                  ? 'No matching sessions'
                  : matches.slice(0, 10).map(s =>
                      `${s.id.slice(0, 20)} | ${s.createdAt.toISOString()} | ${s.description}`
                    ).join('\n')
              }]
            };
          }

          case 'stats': {
            const stats = this.daemon.getStats();
            return {
              content: [{
                type: 'text',
                text: `Sessions: ${stats.sessions}
Blobs: ${stats.blobs}
Storage: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB
Watched Projects: ${stats.watchedProjects}`
              }]
            };
          }

          case 'get_git_state': {
            const { GitCollector } = await import('./collectors/index.js');
            const git = new GitCollector(this.projectPath);
            const state = git.capture();
            
            if (!state.isRepo) return { content: [{ type: 'text', text: 'Not a git repository' }] };
            
            return {
              content: [{
                type: 'text',
                text: `Branch: ${state.branch}
Commit: ${state.commit?.slice(0, 8)} - ${state.commitMessage}
Uncommitted: ${state.uncommittedChanges}
Staged: ${state.stagedChanges}
Untracked: ${state.untrackedFiles} files
Stashes: ${state.stashCount}`
              }]
            };
          }

          case 'compare_sessions': {
            const from = this.daemon.getSession(args?.from_id as string);
            const to = this.daemon.getSession(args?.to_id as string);
            
            if (!from || !to) return { content: [{ type: 'text', text: 'Session not found' }] };
            
            const fromFiles = new Map(from.files.map(f => [f.path, f.hash]));
            const toFiles = new Map(to.files.map(f => [f.path, f.hash]));
            
            const added: string[] = [];
            const deleted: string[] = [];
            const modified: string[] = [];
            
            for (const [path, hash] of toFiles) {
              if (!fromFiles.has(path)) added.push(path);
              else if (fromFiles.get(path) !== hash) modified.push(path);
            }
            for (const path of fromFiles.keys()) {
              if (!toFiles.has(path)) deleted.push(path);
            }
            
            return {
              content: [{
                type: 'text',
                text: `Changes from ${from.id.slice(0, 12)} to ${to.id.slice(0, 12)}:
Added (${added.length}): ${added.slice(0, 5).join(', ')}${added.length > 5 ? '...' : ''}
Modified (${modified.length}): ${modified.slice(0, 5).join(', ')}${modified.length > 5 ? '...' : ''}
Deleted (${deleted.length}): ${deleted.slice(0, 5).join(', ')}${deleted.length > 5 ? '...' : ''}`
              }]
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error');
      }
    });
  }

  async run() {
    // Start watching the project
    this.daemon.watchProject(this.projectPath);

    const shutdown = async () => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      await this.daemon.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => { void shutdown(); });
    process.on('SIGINT', () => { void shutdown(); });
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AITimeMachine MCP Server v2 running');
  }
}
