/**
 * MCPClient - Model Context Protocol client for AITimeMachine VS Code extension
 *
 * Handles JSON-RPC 2.0 communication with the AITimeMachine MCP server over stdio.
 * Provides methods for connecting, calling tools, and managing the connection lifecycle.
 */

import * as vscode from 'vscode';
import { spawn, execSync, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface MCPToolIntent {
  tool: string;
  args: Record<string, any>;
}

export interface MCPClientOptions {
  workspaceRoot: string;
  maxReconnectAttempts?: number;
  requestTimeout?: number;
}

interface PendingRequest {
  resolve: (value: string | null) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class MCPClient extends EventEmitter {
  private _process: ChildProcess | null = null;
  private _connected = false;
  private _requestId = 0;
  private _buffer = '';
  private _pendingRequests = new Map<number, PendingRequest>();
  private _reconnectAttempts = 0;
  private _maxReconnectAttempts: number;
  private _requestTimeout: number;
  private _workspaceRoot: string;
  private _disposed = false;

  constructor(options: MCPClientOptions) {
    super();
    this._workspaceRoot = options.workspaceRoot;
    this._maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
    this._requestTimeout = options.requestTimeout ?? 30000;
  }

  get isConnected(): boolean {
    return this._connected && this._process !== null;
  }

  private _resolveAitmBinary(): string {
    // 1. Check VS Code setting
    const configPath = vscode.workspace.getConfiguration('aitm').get<string>('cliPath');
    if (configPath && fs.existsSync(configPath)) {
      return configPath;
    }

    // 2. Check if aitm is in PATH
    try {
      const which = execSync('which aitm 2>/dev/null || where aitm 2>nul', { encoding: 'utf-8' }).trim();
      if (which) {
        return 'aitm';
      }
    } catch { /* not in PATH */ }

    // 3. Check npm global prefix
    try {
      const npmPrefix = execSync('npm prefix -g', { encoding: 'utf-8' }).trim();
      const globalBin = path.join(npmPrefix, 'bin', 'aitm');
      if (fs.existsSync(globalBin)) {
        return globalBin;
      }
    } catch { /* npm not available */ }

    // 4. Check common locations
    const homeDir = os.homedir();
    const candidates = [
      path.join(homeDir, '.npm-global', 'bin', 'aitm'),
      '/usr/local/bin/aitm',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }

    // 5. npx fallback
    return 'npx --yes @gitgram/timemachine';
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<boolean> {
    if (this._disposed) {
      return false;
    }

    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.log('MCPClient: Max reconnect attempts reached');
      return false;
    }

    try {
      // Clean up existing process
      this._cleanup();

      // Start MCP server as a child process with stdio transport
      const binaryPath = this._resolveAitmBinary();
      if (binaryPath.includes(' ')) {
        // npx fallback - use shell
        this._process = spawn(binaryPath, ['mcp'], {
          cwd: this._workspaceRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
          env: { ...process.env, AITM_MCP_STDIO: '1' }
        });
      } else {
        this._process = spawn(binaryPath, ['mcp'], {
          cwd: this._workspaceRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, AITM_MCP_STDIO: '1' }
        });
      }

      this._setupProcessHandlers();

      // Wait for process to start
      await new Promise(resolve => setTimeout(resolve, 500));

      // Send MCP initialize request
      const initResult = await this._sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vscode-aitm', version: '1.0.0' }
      });

      if (initResult) {
        this._connected = true;
        this._reconnectAttempts = 0;
        console.log('MCPClient: Connected successfully');

        // Send initialized notification
        this._sendNotification('notifications/initialized', {});
        this.emit('connected');
        return true;
      }

      return false;
    } catch (error) {
      console.error('MCPClient: Connection failed:', error);
      this._connected = false;
      this._reconnectAttempts++;
      return false;
    }
  }

  /**
   * Call an MCP tool by name with arguments
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<string | null> {
    if (!this._connected || !this._process) {
      const connected = await this.connect();
      if (!connected) {
        return null;
      }
    }

    try {
      // Add project context if not present
      const argsWithProject = {
        ...args,
        projectPath: args.projectPath || this._workspaceRoot
      };

      const result = await this._sendRequest('tools/call', {
        name: toolName,
        arguments: argsWithProject
      });

      return result;
    } catch (error) {
      console.error('MCPClient: Tool call failed:', error);
      this._connected = false;
      return null;
    }
  }

  /**
   * Call a tool based on parsed intent
   */
  async executeIntent(intent: MCPToolIntent): Promise<string | null> {
    return this.callTool(intent.tool, intent.args);
  }

  /**
   * Parse natural language content into a tool intent
   */
  parseIntent(content: string): MCPToolIntent {
    const lower = content.toLowerCase();

    // Checkpoint creation
    if (/create|make|save/.test(lower) && /checkpoint|snapshot|backup/.test(lower)) {
      const nameMatch = content.match(/(?:called?|named?|")\s*([^"]+)/i);
      return {
        tool: 'tm_checkpoint_create',
        args: { description: nameMatch?.[1] || 'User checkpoint' }
      };
    }

    // Restore/go back
    if (/restore|go back|revert|undo|back to/.test(lower)) {
      // Natural language time queries
      if (/hour|minute|day|ago|yesterday|when|before/.test(lower)) {
        return {
          tool: 'tm_go_back',
          args: { query: content }
        };
      }
      // Checkpoint ID
      const idMatch = content.match(/(?:cp_|tp_|checkpoint\s*)[a-f0-9_]+/i);
      if (idMatch) {
        return {
          tool: 'tm_checkpoint_restore',
          args: { checkpointId: idMatch[0] }
        };
      }
    }

    // List checkpoints
    if (/list|show|what|history/.test(lower) && /checkpoint|snapshot|backup/.test(lower)) {
      return {
        tool: 'tm_checkpoint_list',
        args: { limit: 10 }
      };
    }

    // Diff/changes
    if (/diff|change|what changed|compare/.test(lower)) {
      return {
        tool: 'tm_diff',
        args: { fromCheckpointId: 'latest' }
      };
    }

    // Search
    if (/search|find|when did|where/.test(lower)) {
      return {
        tool: 'tm_search',
        args: { query: content }
      };
    }

    // Find when broke
    if (/when.*broke|when.*fail|find.*error|bisect/.test(lower)) {
      return {
        tool: 'tm_find_when_broke',
        args: { description: content }
      };
    }

    // File history
    if (/history of|changes to|versions of/.test(lower)) {
      const fileMatch = content.match(/(?:file|to)\s+([^\s]+)/i);
      if (fileMatch) {
        return {
          tool: 'tm_file_history',
          args: { filePath: fileMatch[1] }
        };
      }
    }

    // Default: search
    return {
      tool: 'tm_search',
      args: { query: content }
    };
  }

  /**
   * Process natural language input and call appropriate tool
   */
  async processNaturalLanguage(content: string): Promise<string | null> {
    const intent = this.parseIntent(content);
    return this.executeIntent(intent);
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<any[] | null> {
    if (!this._connected || !this._process) {
      const connected = await this.connect();
      if (!connected) return null;
    }

    try {
      const result = await this._sendRequest('tools/list', {});
      if (result) {
        const parsed = JSON.parse(result);
        return parsed.tools || [];
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  disconnect(): void {
    this._cleanup();
    this._connected = false;
    this.emit('disconnected');
  }

  /**
   * Dispose of the client
   */
  dispose(): void {
    this._disposed = true;
    this.disconnect();
    this.removeAllListeners();
  }

  private _setupProcessHandlers(): void {
    if (!this._process) return;

    this._process.on('error', (err) => {
      console.error('MCPClient: Process error:', err);
      this._connected = false;
      this._rejectAllPending(new Error('MCP process error'));
      this._process = null;
      this.emit('error', err);
    });

    this._process.on('exit', (code) => {
      console.log(`MCPClient: Process exited with code ${code}`);
      this._connected = false;
      this._rejectAllPending(new Error(`MCP process exited with code ${code}`));
      this._process = null;
      this.emit('exit', code);
    });

    // Handle stdout data with proper JSON-RPC framing
    this._process.stdout?.on('data', (data: Buffer) => {
      this._handleData(data);
    });

    // Log stderr for debugging
    this._process.stderr?.on('data', (data: Buffer) => {
      console.log('MCPClient stderr:', data.toString());
    });
  }

  private _handleData(data: Buffer): void {
    this._buffer += data.toString();

    // Try to parse complete JSON-RPC messages (newline-delimited)
    while (true) {
      const newlineIndex = this._buffer.indexOf('\n');
      if (newlineIndex === -1) break;

      const line = this._buffer.substring(0, newlineIndex).trim();
      this._buffer = this._buffer.substring(newlineIndex + 1);

      if (!line) continue;

      try {
        const message = JSON.parse(line);
        this._handleMessage(message);
      } catch (e) {
        console.error('MCPClient: Failed to parse message:', line);
      }
    }
  }

  private _handleMessage(message: any): void {
    // Handle response to our request
    if (message.id !== undefined && this._pendingRequests.has(message.id)) {
      const pending = this._pendingRequests.get(message.id)!;
      this._pendingRequests.delete(message.id);
      clearTimeout(pending.timeout);

      if (message.error) {
        console.error('MCPClient: Error response:', message.error);
        pending.resolve(null);
      } else if (message.result?.content?.[0]?.text) {
        pending.resolve(message.result.content[0].text);
      } else if (message.result) {
        pending.resolve(JSON.stringify(message.result, null, 2));
      } else {
        pending.resolve(null);
      }
    }

    // Handle notifications from server
    if (message.method && !message.id) {
      this.emit('notification', message.method, message.params);
    }
  }

  private async _sendRequest(method: string, params: any): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (!this._process?.stdin) {
        resolve(null);
        return;
      }

      const id = ++this._requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      // Set up timeout
      const timeout = setTimeout(() => {
        this._pendingRequests.delete(id);
        resolve(null);
      }, this._requestTimeout);

      this._pendingRequests.set(id, {
        resolve,
        reject,
        timeout
      });

      // Send request with newline delimiter
      this._process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  private _sendNotification(method: string, params: any): void {
    if (!this._process?.stdin) return;

    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    this._process.stdin.write(JSON.stringify(notification) + '\n');
  }

  private _rejectAllPending(error: Error): void {
    for (const [id, pending] of this._pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this._pendingRequests.clear();
  }

  private _cleanup(): void {
    if (this._process) {
      try {
        this._process.kill();
      } catch {}
      this._process = null;
    }
    this._buffer = '';
    this._rejectAllPending(new Error('Client cleanup'));
  }
}

/**
 * Singleton MCPClient manager for the extension
 */
let _sharedClient: MCPClient | null = null;

export function getSharedMCPClient(): MCPClient | null {
  return _sharedClient;
}

export function createSharedMCPClient(workspaceRoot: string): MCPClient {
  if (_sharedClient) {
    _sharedClient.dispose();
  }
  _sharedClient = new MCPClient({ workspaceRoot });
  return _sharedClient;
}

export function disposeSharedMCPClient(): void {
  if (_sharedClient) {
    _sharedClient.dispose();
    _sharedClient = null;
  }
}
