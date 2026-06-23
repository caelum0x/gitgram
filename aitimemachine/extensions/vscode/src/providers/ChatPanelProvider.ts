import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync, spawn, ChildProcess } from 'child_process';
import {
  commandRegistry,
  CommandContext,
  CommandMessage,
  CheckpointInfo,
  TaskHistoryData,
  TaskHistoryFilters,
  AitmConfig,
} from '../commands';
import { MCPClient, MCPToolIntent, createSharedMCPClient, getSharedMCPClient, disposeSharedMCPClient } from '../mcp';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  checkpointId?: string;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  name: string;
  arguments: any;
  result?: any;
  success?: boolean;
  status?: 'pending' | 'running' | 'completed' | 'error';
  duration?: number;
}

interface StreamingState {
  isStreaming: boolean;
  currentContent: string;
  toolCalls: ToolCall[];
  checkpointCreated?: string;
}

interface Checkpoint {
  id: string;
  name: string;
  description?: string;
  timestamp: string;
  stats: {
    totalFiles: number;
    totalSize: number;
  };
  metadata?: any;
}

interface Session {
  id: string;
  name: string;
  createdAt: string;
  lastActive: string;
  messageCount: number;
}

interface MentionSuggestion {
  type: 'file' | 'symbol' | 'checkpoint' | 'url';
  value: string;
  display: string;
  description: string;
  icon: string;
}

interface TaskHistoryItem {
  id: string;
  task: string;
  ts: number;
  totalCost: number;
  tokensIn: number;
  tokensOut: number;
  isFavorited: boolean;
}

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aitm.chatView';
  private static instance: ChatPanelProvider | undefined;

  private _view?: vscode.WebviewView;
  private _messages: Message[] = [];
  private _checkpoints: Checkpoint[] = [];
  private _sessions: Session[] = [];
  private _isProcessing = false;
  private _currentSessionId: string | null = null;
  private _showSettings = false;

  // MCP Client integration
  private _mcpClient: MCPClient | null = null;
  private _mcpConnectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';

  // Streaming state for real-time responses
  private _streamingState: StreamingState = {
    isStreaming: false,
    currentContent: '',
    toolCalls: [],
  };

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context?: vscode.ExtensionContext
  ) {
    ChatPanelProvider.instance = this;
    if (this._context) {
      this._loadHistory();
    }
    // Initialize MCP client
    this._initializeMCPClient();
  }

  /**
   * Initialize the MCP client connection
   */
  private async _initializeMCPClient(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      console.log('ChatPanelProvider: No workspace root, skipping MCP initialization');
      return;
    }

    try {
      this._mcpConnectionStatus = 'connecting';
      this._mcpClient = createSharedMCPClient(workspaceRoot);

      // Set up event listeners
      this._mcpClient.on('connected', () => {
        this._mcpConnectionStatus = 'connected';
        console.log('ChatPanelProvider: MCP client connected');
        this._sendState();
      });

      this._mcpClient.on('disconnected', () => {
        this._mcpConnectionStatus = 'disconnected';
        console.log('ChatPanelProvider: MCP client disconnected');
        this._sendState();
      });

      this._mcpClient.on('error', (err: Error) => {
        this._mcpConnectionStatus = 'error';
        console.error('ChatPanelProvider: MCP client error:', err);
        this._sendState();
      });

      this._mcpClient.on('notification', (method: string, params: any) => {
        this._handleMCPNotification(method, params);
      });

      // Connect
      const connected = await this._mcpClient.connect();
      if (connected) {
        this._mcpConnectionStatus = 'connected';
      } else {
        this._mcpConnectionStatus = 'disconnected';
      }
    } catch (error) {
      console.error('ChatPanelProvider: Failed to initialize MCP client:', error);
      this._mcpConnectionStatus = 'error';
    }
  }

  /**
   * Handle notifications from the MCP server
   */
  private _handleMCPNotification(method: string, params: any): void {
    console.log('MCP Notification:', method, params);

    // Handle checkpoint created notifications
    if (method === 'checkpoint/created' || method === 'notifications/checkpoint') {
      const checkpointId = params?.checkpointId || params?.id;
      if (checkpointId) {
        this._streamingState.checkpointCreated = checkpointId;
        this._refreshCheckpoints();
        // Send checkpoint badge to webview
        if (this._view) {
          this._view.webview.postMessage({
            type: 'checkpointCreated',
            checkpointId,
            description: params?.description || 'Auto checkpoint'
          });
        }
      }
    }

    // Handle progress/streaming notifications
    if (method === 'notifications/progress' || method === 'progress') {
      if (this._view) {
        this._view.webview.postMessage({
          type: 'progress',
          progress: params?.progress,
          message: params?.message
        });
      }
    }
  }

  public static getInstance(): ChatPanelProvider | undefined {
    return ChatPanelProvider.instance;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'ready':
          this._sendState();
          break;
        case 'sendMessage':
          await this._handleUserMessage(data.message);
          break;
        case 'createCheckpoint':
          await this._createCheckpoint(data.name);
          break;
        case 'restore':
          await this._restoreCheckpoint(data.checkpointId);
          break;
        case 'undo':
          await this._undoLastAction();
          break;
        case 'clearHistory':
          this._messages = [];
          this._saveHistory();
          this._sendState();
          break;
        case 'openFile':
          this._openFile(data.path);
          break;
        case 'showDiff':
          this._showDiff(data.checkpointId, data.filePath);
          break;
        case 'executeCommand':
          await this._executeCommand(data.command);
          break;
        case 'runInTerminal':
          this._runInTerminal(data.command);
          break;
        case 'getSessions':
          this._refreshSessions();
          break;
        case 'selectSession':
          await this._selectSession(data.sessionId);
          break;
        case 'createSession':
          await this._createSession(data.name);
          break;
        case 'deleteSession':
          await this._deleteSession(data.sessionId);
          break;
        case 'renameSession':
          await this._renameSession(data.sessionId, data.name);
          break;
        case 'getMentionSuggestions':
          await this._getMentionSuggestions(data.query);
          break;
        case 'getTaskHistory':
          await this._fetchTaskHistory();
          this._sendState();
          break;
        case 'toggleSettings':
          this._showSettings = !this._showSettings;
          this._sendState();
          break;
        case 'updateSettings':
          await this._updateSettings(data.settings);
          break;
      }
    });

    // Load checkpoints and sessions
    this._refreshCheckpoints();
    this._refreshSessions();
  }

  private _sendState() {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'state',
        messages: this._messages,
        checkpoints: this._checkpoints,
        sessions: this._sessions,
        currentSessionId: this._currentSessionId,
        isProcessing: this._isProcessing,
        isAuthenticated: this._isAuthenticated(),
        projectName: this._getProjectName(),
        showSettings: this._showSettings,
        taskHistoryData: this._taskHistoryData,
        taskHistoryLoading: this._taskHistoryLoading,
        config: this._getConfig(),
        // New MCP-related state
        mcpStatus: this._mcpConnectionStatus,
        streaming: this._streamingState
      });
    }
  }

  /**
   * Send streaming update to webview for real-time response display
   */
  private _sendStreamingUpdate(content: string, toolCalls?: ToolCall[], checkpointId?: string) {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'streamingUpdate',
        content,
        toolCalls: toolCalls || this._streamingState.toolCalls,
        checkpointId
      });
    }
  }

  private async _handleUserMessage(content: string) {
    if (this._isProcessing) return;

    const userMessage: Message = {
      id: this._generateId(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    this._messages.push(userMessage);
    this._isProcessing = true;
    this._sendState();

    try {
      // Check for special commands
      if (content.startsWith('/')) {
        await this._handleCommand(content);
      } else {
        // Process with AI (call MCP or local processing)
        await this._processWithAI(content);
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: this._generateId(),
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date()
      };
      this._messages.push(errorMessage);
    }

    this._isProcessing = false;
    this._saveHistory();
    this._sendState();
  }

  private async _handleCommand(input: string) {
    // Check if the command registry handles this command
    if (commandRegistry.isCommand(input)) {
      const context = this._createCommandContext();
      await commandRegistry.execute(input, context);
      return;
    }

    // Fallback to legacy commands
    const [command, ...args] = input.slice(1).split(' ');

    switch (command.toLowerCase()) {
      case 'save':
        const name = args.join(' ') || 'Manual checkpoint';
        await this._createCheckpoint(name);
        break;

      case 'rewind':
        if (args[0]) {
          await this._restoreCheckpoint(args[0]);
        } else {
          this._addAssistantMessage('Usage: /restore <checkpoint-id>');
        }
        break;

      case 'undo':
        await this._undoLastAction();
        break;

      case 'list':
        this._listCheckpoints();
        break;

      case 'diff':
        if (args[0]) {
          await this._showDiffSummary(args[0]);
        }
        break;

      case 'sync':
        await this._syncToCloud();
        break;

      default:
        this._addAssistantMessage(`Unknown command: /${command}. Type /help for available commands.`);
    }
  }

  /**
   * Create command context for the command registry
   */
  private _createCommandContext(): CommandContext {
    return {
      args: [],
      chatMessages: this._messages.map(m => ({
        id: m.id,
        type: m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system',
        content: m.content,
        ts: m.timestamp.getTime(),
      })) as CommandMessage[],
      addMessage: (message: CommandMessage) => {
        this._messages.push({
          id: message.id,
          role: message.type === 'user' ? 'user' : message.type === 'error' ? 'assistant' : 'assistant',
          content: message.content,
          timestamp: new Date(message.ts),
        });
        this._saveHistory();
        this._sendState();
      },
      replaceMessages: (messages: CommandMessage[]) => {
        this._messages = messages.map(m => ({
          id: m.id,
          role: m.type === 'user' ? 'user' : m.type === 'error' ? 'assistant' : 'assistant',
          content: m.content,
          timestamp: new Date(m.ts),
        }));
        this._saveHistory();
        this._sendState();
      },
      refreshTerminal: async () => {
        // Refresh terminal if needed
      },
      sendWebviewMessage: async (message: any) => {
        if (this._view) {
          this._view.webview.postMessage(message);
        }
      },
      currentSessionId: this._currentSessionId || undefined,
      checkpoints: this._checkpoints.map(cp => ({
        id: cp.id,
        description: cp.name,
        timestamp: new Date(cp.timestamp).getTime(),
        type: 'manual' as const,
        stats: cp.stats,
      })) as CheckpointInfo[],
      config: this._getConfig(),
      taskHistoryData: this._taskHistoryData,
      taskHistoryLoading: this._taskHistoryLoading,
      taskHistoryError: this._taskHistoryError,
      fetchTaskHistory: async () => {
        await this._fetchTaskHistory();
      },
      updateTaskHistoryFilters: async (filters: Partial<TaskHistoryFilters>) => {
        return this._updateTaskHistoryFilters(filters);
      },
      changeTaskHistoryPage: async (page: number) => {
        return this._changeTaskHistoryPage(page);
      },
      nextTaskHistoryPage: async () => {
        return this._nextTaskHistoryPage();
      },
      previousTaskHistoryPage: async () => {
        return this._previousTaskHistoryPage();
      },
    };
  }

  /**
   * Get current configuration
   */
  private _getConfig(): AitmConfig {
    const config = vscode.workspace.getConfiguration('aitm');
    return {
      autoCheckpoint: config.get<boolean>('autoCheckpoint', true),
      checkpointOnSave: config.get<boolean>('checkpointOnSave', false),
      cloudSync: config.get<boolean>('cloudSync', false),
      showCodeLens: config.get<boolean>('showCodeLens', true),
      showFunctionLens: config.get<boolean>('showFunctionLens', true),
      showErrorTracking: config.get<boolean>('showErrorTracking', true),
      maxConversationHistory: config.get<number>('maxConversationHistory', 100),
      currentMode: config.get<string>('currentMode', 'code'),
      customModes: config.get<any[]>('customModes', []),
      autoApproval: {
        read: { enabled: true, outside: false },
        write: { enabled: false, outside: false, protected: true },
        execute: { allowed: [], denied: [] },
        browser: { enabled: false },
        mcp: { enabled: true },
        mode: { enabled: true },
        subtasks: { enabled: true },
        retry: { enabled: true, delay: 1000 },
      },
    };
  }

  // Task history state
  private _taskHistoryData: TaskHistoryData | undefined;
  private _taskHistoryLoading = false;
  private _taskHistoryError: string | undefined;
  private _taskHistoryFilters: TaskHistoryFilters = {};
  private _taskHistoryPage = 0;

  private async _fetchTaskHistory(): Promise<void> {
    this._taskHistoryLoading = true;
    this._taskHistoryError = undefined;

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        throw new Error('No workspace folder');
      }

      const output = execSync('aitm tasks --json', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
      });

      const tasks = JSON.parse(output);
      this._taskHistoryData = {
        historyItems: tasks.map((t: any) => ({
          id: t.id,
          task: t.description || t.task || 'Unknown task',
          ts: new Date(t.timestamp || t.ts).getTime(),
          totalCost: t.cost || 0,
          tokensIn: t.tokensIn || 0,
          tokensOut: t.tokensOut || 0,
          isFavorited: t.favorited || false,
        })),
        pageIndex: 0,
        pageCount: 1,
        totalItems: tasks.length,
      };
    } catch (error: any) {
      this._taskHistoryError = error.message;
      this._taskHistoryData = {
        historyItems: [],
        pageIndex: 0,
        pageCount: 0,
        totalItems: 0,
      };
    } finally {
      this._taskHistoryLoading = false;
    }
  }

  private async _updateTaskHistoryFilters(filters: Partial<TaskHistoryFilters>): Promise<TaskHistoryData> {
    this._taskHistoryFilters = { ...this._taskHistoryFilters, ...filters };
    await this._fetchTaskHistory();
    return this._taskHistoryData!;
  }

  private async _changeTaskHistoryPage(page: number): Promise<TaskHistoryData> {
    this._taskHistoryPage = page;
    await this._fetchTaskHistory();
    return this._taskHistoryData!;
  }

  private async _nextTaskHistoryPage(): Promise<TaskHistoryData> {
    this._taskHistoryPage++;
    await this._fetchTaskHistory();
    return this._taskHistoryData!;
  }

  private async _previousTaskHistoryPage(): Promise<TaskHistoryData> {
    this._taskHistoryPage = Math.max(0, this._taskHistoryPage - 1);
    await this._fetchTaskHistory();
    return this._taskHistoryData!;
  }

  private async _processWithAI(content: string) {
    // Reset streaming state
    this._streamingState = {
      isStreaming: true,
      currentContent: '',
      toolCalls: [],
    };
    this._sendState();

    // Create auto-checkpoint before AI action
    const beforeCheckpoint = await this._createAutoCheckpoint('before', `Before: ${content.substring(0, 50)}...`);
    if (beforeCheckpoint) {
      this._streamingState.checkpointCreated = beforeCheckpoint;
      this._sendStreamingUpdate('', [], beforeCheckpoint);
    }

    try {
      // Process with AI using real MCP integration with streaming
      const response = await this._callAIWithStreaming(content);

      // Create the assistant message with tool calls
      const assistantMessage: Message = {
        id: this._generateId(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        checkpointId: this._streamingState.checkpointCreated,
        toolCalls: this._streamingState.toolCalls.length > 0 ? [...this._streamingState.toolCalls] : undefined
      };
      this._messages.push(assistantMessage);

      // Check if any files were modified and create after checkpoint
      const afterCheckpoint = await this._createAutoCheckpoint('after', `After: ${content.substring(0, 50)}...`);
      if (afterCheckpoint) {
        assistantMessage.checkpointId = afterCheckpoint;
      }

    } catch (error: any) {
      this._addAssistantMessage(`I encountered an error: ${error.message}`);
    } finally {
      this._streamingState.isStreaming = false;
      this._sendState();
    }
  }

  /**
   * Call AI with streaming support for real-time response display
   */
  private async _callAIWithStreaming(content: string): Promise<string> {
    // Try MCP client first
    if (this._mcpClient?.isConnected) {
      const intent = this._mcpClient.parseIntent(content);

      // Add tool call to streaming state
      const toolCall: ToolCall = {
        name: intent.tool,
        arguments: intent.args,
        status: 'running'
      };
      this._streamingState.toolCalls.push(toolCall);
      this._sendStreamingUpdate(`Calling ${intent.tool}...`, this._streamingState.toolCalls);

      const startTime = Date.now();
      const result = await this._mcpClient.executeIntent(intent);
      const duration = Date.now() - startTime;

      // Update tool call status
      toolCall.status = result ? 'completed' : 'error';
      toolCall.result = result;
      toolCall.duration = duration;

      if (result) {
        this._sendStreamingUpdate(result, this._streamingState.toolCalls);
        return result;
      }
    }

    // Fall back to regular AI call
    return this._callAI(content);
  }

  private async _callAI(content: string): Promise<string> {
    // Try multiple approaches in order of preference

    // 1. Try MCP client (already tried in streaming call, but fallback here)
    if (this._mcpClient?.isConnected) {
      const intent = this._mcpClient.parseIntent(content);

      // Add tool call to streaming state if not already added
      if (!this._streamingState.toolCalls.some(tc => tc.name === intent.tool)) {
        const toolCall: ToolCall = {
          name: intent.tool,
          arguments: intent.args,
          status: 'running'
        };
        this._streamingState.toolCalls.push(toolCall);
        this._sendStreamingUpdate(`Calling ${intent.tool}...`, this._streamingState.toolCalls);

        const startTime = Date.now();
        const result = await this._mcpClient.callTool(intent.tool, intent.args);
        const duration = Date.now() - startTime;

        toolCall.status = result ? 'completed' : 'error';
        toolCall.result = result;
        toolCall.duration = duration;

        if (result) {
          this._sendStreamingUpdate(result, this._streamingState.toolCalls);
          return result;
        }
      }
    }

    // 2. Try CLI MCP call
    try {
      const output = this._execAitm(`mcp-call "${content.replace(/"/g, '\\"')}"`);
      if (output && output.trim()) return output;
    } catch {}

    // 3. Parse for time machine specific intents
    const intentResult = await this._handleTimeMachineIntent(content);
    if (intentResult) return intentResult;

    // 4. Fallback response with helpful guidance
    return this._getFallbackResponse(content);
  }

  /**
   * Call MCP tool directly with streaming updates
   */
  private async _callMCPToolDirect(toolName: string, args: Record<string, any>): Promise<string | null> {
    if (!this._mcpClient?.isConnected) {
      // Try to reconnect
      await this._initializeMCPClient();
    }

    if (!this._mcpClient?.isConnected) {
      return null;
    }

    // Add tool call to streaming state
    const toolCall: ToolCall = {
      name: toolName,
      arguments: args,
      status: 'running'
    };
    this._streamingState.toolCalls.push(toolCall);
    this._sendStreamingUpdate(`Executing ${toolName}...`, this._streamingState.toolCalls);

    const startTime = Date.now();

    try {
      const result = await this._mcpClient.callTool(toolName, args);
      const duration = Date.now() - startTime;

      toolCall.status = result ? 'completed' : 'error';
      toolCall.result = result;
      toolCall.duration = duration;
      toolCall.success = !!result;

      this._sendStreamingUpdate(result || 'No result', this._streamingState.toolCalls);

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      toolCall.status = 'error';
      toolCall.result = error.message;
      toolCall.duration = duration;
      toolCall.success = false;

      this._sendStreamingUpdate(`Error: ${error.message}`, this._streamingState.toolCalls);

      return null;
    }
  }

  private async _handleTimeMachineIntent(content: string): Promise<string | null> {
    const lower = content.toLowerCase();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return null;

    try {
      // Handle specific time machine intents via CLI
      if (/go back|restore|undo/.test(lower)) {
        // Natural language restore
        if (/hour|minute|ago|yesterday|before|when/.test(lower)) {
          const output = execSync(
            `aitm back-to "${content}" --dry-run --json 2>/dev/null || echo "{}"`,
            { cwd: workspaceRoot, encoding: 'utf-8' }
          );
          const result = JSON.parse(output);
          if (result.checkpointId) {
            return `Found checkpoint: **${result.name || result.checkpointId}**\n\nCreated: ${result.timestamp || 'Unknown'}\n\nWould you like me to restore to this checkpoint? Use \`/restore ${result.checkpointId}\` to confirm.`;
          }
        }
      }

      // Handle "when did" queries
      if (/when did|when was/.test(lower)) {
        const output = execSync(
          `aitm search "${content}" --json 2>/dev/null || echo "[]"`,
          { cwd: workspaceRoot, encoding: 'utf-8' }
        );
        const results = JSON.parse(output);
        if (results.length > 0) {
          const formatted = results.slice(0, 5).map((r: any) =>
            `- **${r.name}** (${new Date(r.timestamp).toLocaleString()})\n  ID: \`${r.checkpointId || r.id}\``
          ).join('\n\n');
          return `Found ${results.length} matching checkpoints:\n\n${formatted}`;
        }
      }

      // Handle "what changed" queries
      if (/what changed|what's different|diff/.test(lower)) {
        const output = execSync(
          `aitm diff --json 2>/dev/null || echo "{}"`,
          { cwd: workspaceRoot, encoding: 'utf-8' }
        );
        const diff = JSON.parse(output);
        let response = '**Changes since last checkpoint:**\n\n';
        if (diff.added?.length) response += `Added: ${diff.added.length} files\n`;
        if (diff.modified?.length) response += `Modified: ${diff.modified.length} files\n`;
        if (diff.deleted?.length) response += `Deleted: ${diff.deleted.length} files\n`;
        if (!diff.added?.length && !diff.modified?.length && !diff.deleted?.length) {
          response += 'No changes detected.';
        }
        return response;
      }

      return null;
    } catch {
      return null;
    }
  }

  private _getFallbackResponse(content: string): string {
    const lower = content.toLowerCase();

    // Provide contextual help based on what user might be asking
    if (/help|how|what can/.test(lower)) {
      return this._getHelpText();
    }

    if (/checkpoint|save|backup/.test(lower)) {
      return `To create a checkpoint, use:\n\`/checkpoint <name>\`\n\nOr click the "+ Checkpoint" button above.`;
    }

    if (/restore|go back|undo/.test(lower)) {
      return `To restore, you can:\n- Use \`/restore <checkpoint-id>\`\n- Use \`/undo\` to revert to the previous checkpoint\n- Say "go back 30 minutes" or "restore to when tests passed"`;
    }

    return `I understand you want to: "${content}"\n\nI can help with:\n- **Time travel**: "go back 30 minutes", "restore to when tests passed"\n- **Checkpoints**: /checkpoint, /restore, /undo\n- **History**: /list, "what changed", "when did X happen"\n\nFor full AI assistance, ensure the AITimeMachine MCP server is configured in your AI tool (Claude, Cursor, etc).`;
  }

  private _getHelpText(): string {
    return `**AITimeMachine Commands:**

**Checkpoints:**
- \`/checkpoint <name>\` - Create a checkpoint
- \`/restore <id>\` - Restore to checkpoint
- \`/undo\` - Undo last action
- \`/list\` - List recent checkpoints
- \`/diff <id>\` - Show changes since checkpoint

**Natural Language:**
- "go back 30 minutes"
- "restore to when tests passed"
- "what changed since yesterday"
- "when did the login function break"

**Cloud:**
- \`/sync\` - Sync to cloud

**Other:**
- \`/clear\` - Clear chat history
- \`/help\` - Show this help`;
  }

  private async _createCheckpoint(name: string) {
    try {
      const output = this._execAitm(`checkpoint "${name}"`);
      this._addAssistantMessage(`✓ Checkpoint created: ${name}`);
      this._refreshCheckpoints();
    } catch (error: any) {
      this._addAssistantMessage(`Failed to create checkpoint: ${error.message}`);
    }
  }

  private async _createAutoCheckpoint(type: 'before' | 'after', name: string): Promise<string | null> {
    try {
      const output = this._execAitm(`checkpoint "${name}" --type ${type} --auto`);
      this._refreshCheckpoints();
      const match = output.match(/checkpoint[:\s]+(\S+)/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private async _restoreCheckpoint(checkpointId: string) {
    const confirm = await vscode.window.showWarningMessage(
      'Restore to this checkpoint? Current changes will be backed up.',
      { modal: true },
      'Restore'
    );

    if (confirm) {
      try {
        const output = this._execAitm(`restore ${checkpointId}`);
        this._addAssistantMessage(`✓ Restored to checkpoint: ${checkpointId}`);
        this._refreshCheckpoints();

        // Reload window to refresh files
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      } catch (error: any) {
        this._addAssistantMessage(`Failed to restore: ${error.message}`);
      }
    }
  }

  private async _undoLastAction() {
    if (this._checkpoints.length < 2) {
      this._addAssistantMessage('No previous checkpoint to undo to.');
      return;
    }

    const prev = this._checkpoints[1];
    await this._restoreCheckpoint(prev.id);
  }

  private _listCheckpoints() {
    if (this._checkpoints.length === 0) {
      this._addAssistantMessage('No checkpoints yet. Create one with /checkpoint <name>');
      return;
    }

    const list = this._checkpoints.slice(0, 10).map((cp, i) => {
      const time = this._timeAgo(new Date(cp.timestamp));
      return `${i + 1}. **${cp.name}** (${time})\n   ID: \`${cp.id}\``;
    }).join('\n\n');

    this._addAssistantMessage(`**Recent Checkpoints:**\n\n${list}`);
  }

  private async _showDiffSummary(checkpointId: string) {
    try {
      const output = this._execAitm(`diff ${checkpointId} --json`);
      const diff = JSON.parse(output);

      let summary = `**Changes since checkpoint ${checkpointId}:**\n\n`;
      if (diff.added?.length) summary += `✅ Added: ${diff.added.length} files\n`;
      if (diff.modified?.length) summary += `✏️ Modified: ${diff.modified.length} files\n`;
      if (diff.deleted?.length) summary += `🗑️ Deleted: ${diff.deleted.length} files\n`;

      this._addAssistantMessage(summary);
    } catch (error: any) {
      this._addAssistantMessage(`Failed to get diff: ${error.message}`);
    }
  }

  private async _syncToCloud() {
    try {
      this._addAssistantMessage('Syncing to cloud...');
      const output = this._execAitm('sync');
      this._addAssistantMessage(`✓ ${output}`);
    } catch (error: any) {
      this._addAssistantMessage(`Sync failed: ${error.message}`);
    }
  }

  private _showHelp() {
    const help = `**AITimeMachine Commands:**

**Checkpoints:**
- \`/checkpoint <name>\` - Create a checkpoint
- \`/restore <id>\` - Restore to checkpoint
- \`/undo\` - Undo last action
- \`/list\` - List recent checkpoints
- \`/diff <id>\` - Show changes since checkpoint

**Cloud:**
- \`/sync\` - Sync to cloud

**Other:**
- \`/clear\` - Clear chat history
- \`/help\` - Show this help

You can also just type naturally and I'll help you with your code!`;

    this._addAssistantMessage(help);
  }

  private async _executeCommand(command: string) {
    try {
      const output = this._execAitm(command);
      this._addAssistantMessage(`\`\`\`\n${output}\n\`\`\``);
    } catch (error: any) {
      this._addAssistantMessage(`Command failed: ${error.message}`);
    }
  }

  private _runInTerminal(command: string) {
    const terminal = vscode.window.createTerminal('AITimeMachine');
    terminal.show();
    terminal.sendText(command);
  }

  private _openFile(filePath: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workspaceRoot, filePath);
      vscode.window.showTextDocument(vscode.Uri.file(fullPath));
    }
  }

  private async _showDiff(checkpointId: string, filePath: string) {
    try {
      const output = this._execAitm(`get-file ${checkpointId} "${filePath}"`);

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const tempDir = path.join(workspaceRoot, '.aitm', 'tmp');
      fs.mkdirSync(tempDir, { recursive: true });

      const tempFile = path.join(tempDir, `${checkpointId}_${path.basename(filePath)}`);
      fs.writeFileSync(tempFile, output);

      const currentUri = vscode.Uri.file(path.join(workspaceRoot, filePath));
      const checkpointUri = vscode.Uri.file(tempFile);

      await vscode.commands.executeCommand('vscode.diff',
        checkpointUri,
        currentUri,
        `${path.basename(filePath)} (checkpoint vs current)`
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to show diff: ${error.message}`);
    }
  }

  private _refreshCheckpoints() {
    try {
      const output = this._execAitm('list --json');
      this._checkpoints = JSON.parse(output);
    } catch {
      this._checkpoints = [];
    }
    this._sendState();
  }

  private _addAssistantMessage(content: string) {
    const message: Message = {
      id: this._generateId(),
      role: 'assistant',
      content,
      timestamp: new Date()
    };
    this._messages.push(message);
  }

  private _execAitm(command: string): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error('No workspace folder open');
    }
    return execSync(`aitm ${command}`, { cwd: workspaceRoot, encoding: 'utf-8' });
  }

  private _isAuthenticated(): boolean {
    try {
      const credPath = path.join(os.homedir(), '.aitimemachine', 'credentials.json');
      if (!fs.existsSync(credPath)) return false;
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      return !!(creds.apiKey || creds.token);
    } catch {
      return false;
    }
  }

  private _getProjectName(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
    return workspaceRoot?.name || 'Unknown Project';
  }

  private _loadHistory() {
    try {
      if (this._context) {
        const history = this._context.globalState.get<Message[]>('chatHistory', []);
        this._messages = history;
      }
    } catch {
      this._messages = [];
    }
  }

  private _saveHistory() {
    if (this._context) {
      // Keep only last 100 messages
      const toSave = this._messages.slice(-100);
      this._context.globalState.update('chatHistory', toSave);
    }
  }

  private _generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private _timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  // Session management methods
  private _refreshSessions() {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        this._sessions = [];
        return;
      }

      const output = execSync('aitm sessions --json 2>/dev/null || echo "[]"', {
        cwd: workspaceRoot,
        encoding: 'utf-8'
      });

      const sessions = JSON.parse(output);
      this._sessions = sessions.map((s: any) => ({
        id: s.id,
        name: s.name || `Session ${s.id.substring(0, 8)}`,
        createdAt: s.createdAt || s.created || new Date().toISOString(),
        lastActive: s.lastActive || s.updated || new Date().toISOString(),
        messageCount: s.messageCount || 0
      }));

      // Set current session if not set
      if (!this._currentSessionId && this._sessions.length > 0) {
        this._currentSessionId = this._sessions[0].id;
      }
    } catch {
      this._sessions = [];
    }
    this._sendState();
  }

  private async _selectSession(sessionId: string) {
    this._currentSessionId = sessionId;
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        execSync(`aitm session select ${sessionId}`, { cwd: workspaceRoot });
        // Load messages for this session
        const output = execSync(`aitm session messages ${sessionId} --json 2>/dev/null || echo "[]"`, {
          cwd: workspaceRoot,
          encoding: 'utf-8'
        });
        const messages = JSON.parse(output);
        this._messages = messages.map((m: any) => ({
          id: m.id || this._generateId(),
          role: m.role || 'assistant',
          content: m.content,
          timestamp: new Date(m.timestamp || m.ts)
        }));
      }
    } catch {}
    this._sendState();
  }

  private async _createSession(name?: string) {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const sessionName = name || `Session ${new Date().toLocaleString()}`;
        const output = execSync(`aitm session new "${sessionName}" --json`, {
          cwd: workspaceRoot,
          encoding: 'utf-8'
        });
        const session = JSON.parse(output);
        this._currentSessionId = session.id;
        this._messages = [];
        this._refreshSessions();
      }
    } catch (error: any) {
      this._addAssistantMessage(`Failed to create session: ${error.message}`);
    }
  }

  private async _deleteSession(sessionId: string) {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        execSync(`aitm session delete ${sessionId}`, { cwd: workspaceRoot });
        if (this._currentSessionId === sessionId) {
          this._currentSessionId = null;
          this._messages = [];
        }
        this._refreshSessions();
      }
    } catch (error: any) {
      this._addAssistantMessage(`Failed to delete session: ${error.message}`);
    }
  }

  private async _renameSession(sessionId: string, name: string) {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        execSync(`aitm session rename ${sessionId} "${name}"`, { cwd: workspaceRoot });
        this._refreshSessions();
      }
    } catch (error: any) {
      this._addAssistantMessage(`Failed to rename session: ${error.message}`);
    }
  }

  // Mention suggestions
  private async _getMentionSuggestions(query: string) {
    const suggestions: MentionSuggestion[] = [];
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    try {
      // File suggestions
      if (query.length > 0) {
        const files = await vscode.workspace.findFiles(`**/*${query}*`, '**/node_modules/**', 10);
        for (const file of files) {
          const relativePath = vscode.workspace.asRelativePath(file);
          suggestions.push({
            type: 'file',
            value: relativePath,
            display: path.basename(relativePath),
            description: relativePath,
            icon: '📄'
          });
        }
      }

      // Symbol suggestions
      if (query.length >= 2) {
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          'vscode.executeWorkspaceSymbolProvider',
          query
        );
        if (symbols) {
          for (const symbol of symbols.slice(0, 5)) {
            suggestions.push({
              type: 'symbol',
              value: symbol.name,
              display: symbol.name,
              description: `${vscode.SymbolKind[symbol.kind]} in ${vscode.workspace.asRelativePath(symbol.location.uri)}`,
              icon: symbol.kind === vscode.SymbolKind.Function ? '⚡' :
                    symbol.kind === vscode.SymbolKind.Class ? '🏷️' : '🔹'
            });
          }
        }
      }

      // Checkpoint suggestions
      for (const cp of this._checkpoints.slice(0, 5)) {
        if (cp.name.toLowerCase().includes(query.toLowerCase()) || cp.id.includes(query)) {
          suggestions.push({
            type: 'checkpoint',
            value: cp.id,
            display: cp.name,
            description: `Checkpoint from ${this._timeAgo(new Date(cp.timestamp))}`,
            icon: '📍'
          });
        }
      }
    } catch {}

    if (this._view) {
      this._view.webview.postMessage({
        type: 'mentionSuggestions',
        suggestions
      });
    }
  }

  // Settings update
  private async _updateSettings(settings: any) {
    const config = vscode.workspace.getConfiguration('aitm');

    for (const [key, value] of Object.entries(settings)) {
      await config.update(key, value, vscode.ConfigurationTarget.Workspace);
    }

    this._addAssistantMessage('Settings updated successfully.');
    this._showSettings = false;
    this._sendState();
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Time Machine</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --input-bg: var(--vscode-input-background);
      --input-border: var(--vscode-input-border);
      --button-bg: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-focusBorder);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      padding: 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header h1 {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .header-actions button {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .header-actions button:hover {
      background: var(--button-bg);
      color: var(--button-fg);
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .message {
      padding: 10px 12px;
      border-radius: 8px;
      max-width: 90%;
      line-height: 1.5;
    }

    .message.user {
      background: var(--button-bg);
      color: var(--button-fg);
      align-self: flex-end;
      border-bottom-right-radius: 2px;
    }

    .message.assistant {
      background: var(--input-bg);
      align-self: flex-start;
      border-bottom-left-radius: 2px;
    }

    .message-header {
      font-size: 11px;
      opacity: 0.7;
      margin-bottom: 4px;
    }

    .message-content {
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .message-content code {
      background: rgba(0,0,0,0.2);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }

    .message-content pre {
      background: rgba(0,0,0,0.2);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
    }

    /* Tool calls inline styling */
    .tool-calls {
      margin: 8px 0;
      border-left: 2px solid var(--accent);
      padding-left: 12px;
    }

    .tool-call {
      background: rgba(0,0,0,0.15);
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 6px;
      font-size: 12px;
    }

    .tool-call.running {
      border-left: 2px solid #f59e0b;
    }

    .tool-call.completed {
      border-left: 2px solid #22c55e;
    }

    .tool-call.error {
      border-left: 2px solid #ef4444;
    }

    .tool-call-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }

    .tool-call-icon {
      font-size: 14px;
    }

    .tool-call-name {
      font-family: var(--vscode-editor-font-family);
      color: var(--accent);
    }

    .tool-call-duration {
      font-size: 10px;
      opacity: 0.7;
      margin-left: auto;
    }

    .tool-call-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-left: auto;
    }

    .tool-call-args {
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.8;
    }

    .tool-call-args code {
      display: block;
      white-space: pre-wrap;
      font-size: 10px;
      max-height: 80px;
      overflow: auto;
    }

    .tool-call-result {
      margin-top: 6px;
      font-size: 11px;
      opacity: 0.9;
      padding: 6px;
      background: rgba(0,0,0,0.1);
      border-radius: 4px;
      max-height: 60px;
      overflow: auto;
    }

    /* Checkpoint badges */
    .checkpoint-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
      border: 1px solid rgba(99, 102, 241, 0.3);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .checkpoint-badge:hover {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3));
      border-color: rgba(99, 102, 241, 0.5);
    }

    .checkpoint-badge-icon {
      font-size: 12px;
    }

    .checkpoint-badge-text {
      font-family: var(--vscode-editor-font-family);
    }

    /* Streaming message */
    .message.streaming {
      opacity: 0.9;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.9; }
      50% { opacity: 0.7; }
    }

    /* Typing indicator */
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 8px 0;
    }

    .typing-indicator span {
      width: 8px;
      height: 8px;
      background: var(--fg);
      border-radius: 50%;
      opacity: 0.4;
      animation: typing 1.4s infinite;
    }

    .typing-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .typing-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typing {
      0%, 60%, 100% { opacity: 0.4; transform: scale(1); }
      30% { opacity: 1; transform: scale(1.2); }
    }

    /* MCP status indicator */
    .mcp-status {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .mcp-status.connected {
      background: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }

    .mcp-status.disconnected {
      background: rgba(156, 163, 175, 0.2);
      color: #9ca3af;
    }

    .mcp-status.connecting {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
    }

    .mcp-status.error {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    /* Checkpoint toast notification */
    .checkpoint-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.95), rgba(139, 92, 246, 0.95));
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 3000;
      animation: slideIn 0.3s ease-out;
    }

    .checkpoint-toast.fade-out {
      animation: slideOut 0.3s ease-in forwards;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }

    .input-area {
      padding: 12px;
      border-top: 1px solid var(--border);
    }

    .input-container {
      display: flex;
      gap: 8px;
    }

    .input-container textarea {
      flex: 1;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--fg);
      padding: 10px;
      border-radius: 6px;
      resize: none;
      font-family: inherit;
      font-size: inherit;
      min-height: 40px;
      max-height: 120px;
    }

    .input-container textarea:focus {
      outline: none;
      border-color: var(--accent);
    }

    .input-container button {
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      padding: 10px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
    }

    .input-container button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .quick-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
      flex-wrap: wrap;
    }

    .quick-actions button {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 4px 10px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 11px;
    }

    .quick-actions button:hover {
      background: var(--input-bg);
    }

    .checkpoints-panel {
      border-top: 1px solid var(--border);
      max-height: 200px;
      overflow-y: auto;
    }

    .checkpoints-header {
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      background: var(--input-bg);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .checkpoint-item {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .checkpoint-item:hover {
      background: var(--input-bg);
    }

    .checkpoint-name {
      font-size: 12px;
      font-weight: 500;
    }

    .checkpoint-time {
      font-size: 11px;
      opacity: 0.7;
    }

    .checkpoint-actions {
      display: flex;
      gap: 4px;
    }

    .checkpoint-actions button {
      background: transparent;
      border: none;
      color: var(--fg);
      cursor: pointer;
      padding: 2px 6px;
      font-size: 11px;
      opacity: 0.7;
    }

    .checkpoint-actions button:hover {
      opacity: 1;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      opacity: 0.6;
    }

    .empty-state .icon {
      font-size: 32px;
      margin-bottom: 12px;
    }

    .processing {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      font-size: 12px;
      opacity: 0.7;
    }

    .processing .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .status-bar {
      padding: 6px 12px;
      font-size: 11px;
      background: var(--input-bg);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
    }

    .status-dot.offline {
      background: #ef4444;
    }

    /* Autocomplete styles */
    .autocomplete-container {
      position: relative;
    }

    .autocomplete-dropdown {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      max-height: 200px;
      overflow-y: auto;
      margin-bottom: 4px;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.2);
      z-index: 100;
    }

    .autocomplete-item {
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--border);
    }

    .autocomplete-item:last-child {
      border-bottom: none;
    }

    .autocomplete-item:hover,
    .autocomplete-item.selected {
      background: var(--button-bg);
      color: var(--button-fg);
    }

    .autocomplete-item .command {
      font-weight: 600;
      font-family: var(--vscode-editor-font-family);
    }

    .autocomplete-item .description {
      font-size: 11px;
      opacity: 0.7;
      flex: 1;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }

    .autocomplete-item .shortcut {
      font-size: 10px;
      padding: 2px 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
    }

    .mode-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: var(--input-bg);
      border-radius: 4px;
      font-size: 11px;
    }

    .mode-indicator .mode-icon {
      font-size: 14px;
    }

    /* Session dropdown styles */
    .session-dropdown {
      position: relative;
      display: inline-block;
    }

    .session-button {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--input-bg);
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .session-button:hover {
      background: var(--button-bg);
      color: var(--button-fg);
    }

    .session-menu {
      position: absolute;
      top: 100%;
      left: 0;
      min-width: 200px;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 1000;
      margin-top: 4px;
    }

    .session-menu-header {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      opacity: 0.7;
    }

    .session-item {
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .session-item:hover {
      background: var(--button-bg);
      color: var(--button-fg);
    }

    .session-item.active {
      background: var(--accent);
      color: var(--button-fg);
    }

    .session-item-info {
      flex: 1;
      overflow: hidden;
    }

    .session-name {
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-meta {
      font-size: 10px;
      opacity: 0.7;
    }

    .session-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
    }

    .session-item:hover .session-actions {
      opacity: 1;
    }

    .session-new {
      padding: 8px 12px;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 12px;
    }

    .session-new:hover {
      background: var(--button-bg);
      color: var(--button-fg);
    }

    /* Task history panel */
    .task-history-panel {
      border-top: 1px solid var(--border);
      max-height: 250px;
      overflow-y: auto;
    }

    .task-history-header {
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      background: var(--input-bg);
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .task-item {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
    }

    .task-item:hover {
      background: var(--input-bg);
    }

    .task-title {
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .task-meta {
      display: flex;
      gap: 12px;
      font-size: 10px;
      opacity: 0.7;
    }

    .task-stat {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Settings modal */
    .settings-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }

    .settings-modal {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      width: 90%;
      max-width: 400px;
      max-height: 80vh;
      overflow-y: auto;
    }

    .settings-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .settings-header h2 {
      font-size: 14px;
      font-weight: 600;
    }

    .settings-close {
      background: transparent;
      border: none;
      color: var(--fg);
      cursor: pointer;
      font-size: 18px;
      opacity: 0.7;
    }

    .settings-close:hover {
      opacity: 1;
    }

    .settings-content {
      padding: 16px;
    }

    .settings-section {
      margin-bottom: 20px;
    }

    .settings-section-title {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 10px;
      text-transform: uppercase;
      opacity: 0.7;
    }

    .settings-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }

    .settings-item-label {
      font-size: 12px;
    }

    .settings-item-description {
      font-size: 10px;
      opacity: 0.7;
      margin-top: 2px;
    }

    .settings-toggle {
      width: 40px;
      height: 22px;
      background: var(--border);
      border-radius: 11px;
      position: relative;
      cursor: pointer;
    }

    .settings-toggle.active {
      background: var(--accent);
    }

    .settings-toggle::after {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      background: white;
      border-radius: 50%;
      top: 2px;
      left: 2px;
      transition: left 0.2s;
    }

    .settings-toggle.active::after {
      left: 20px;
    }

    /* Mention autocomplete */
    .mention-dropdown {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      max-height: 200px;
      overflow-y: auto;
      margin-bottom: 4px;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.2);
      z-index: 100;
    }

    .mention-item {
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mention-item:hover,
    .mention-item.selected {
      background: var(--button-bg);
      color: var(--button-fg);
    }

    .mention-icon {
      font-size: 14px;
    }

    .mention-info {
      flex: 1;
      overflow: hidden;
    }

    .mention-display {
      font-weight: 500;
      font-size: 12px;
    }

    .mention-description {
      font-size: 10px;
      opacity: 0.7;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mention-type {
      font-size: 10px;
      padding: 2px 6px;
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
    }

    /* Tabs for panels */
    .panel-tabs {
      display: flex;
      border-top: 1px solid var(--border);
      background: var(--input-bg);
    }

    .panel-tab {
      flex: 1;
      padding: 8px;
      text-align: center;
      font-size: 11px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
    }

    .panel-tab:hover {
      background: rgba(255,255,255,0.05);
    }

    .panel-tab.active {
      border-bottom-color: var(--accent);
    }

    .panel-content {
      max-height: 200px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display: flex; align-items: center; gap: 12px;">
      <h1>🕐 AI Time Machine</h1>
      <div class="session-dropdown">
        <button class="session-button" onclick="toggleSessionMenu()">
          <span>📂</span>
          <span id="current-session-name">Session</span>
          <span>▼</span>
        </button>
        <div id="session-menu" class="session-menu" style="display: none;">
          <div class="session-menu-header">Sessions</div>
          <div id="session-list"></div>
          <div class="session-new" onclick="createNewSession()">
            <span>+</span>
            <span>New Session</span>
          </div>
        </div>
      </div>
    </div>
    <div class="header-actions">
      <button onclick="createCheckpoint()">+ Checkpoint</button>
      <button onclick="toggleSettings()">⚙</button>
      <button onclick="showHelp()">?</button>
    </div>
  </div>

  <!-- Settings Modal -->
  <div id="settings-overlay" class="settings-overlay" style="display: none;">
    <div class="settings-modal">
      <div class="settings-header">
        <h2>Settings</h2>
        <button class="settings-close" onclick="toggleSettings()">×</button>
      </div>
      <div class="settings-content">
        <div class="settings-section">
          <div class="settings-section-title">Auto Approval</div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Auto-approve reads</div>
              <div class="settings-item-description">Allow reading files without confirmation</div>
            </div>
            <div id="toggle-read" class="settings-toggle active" onclick="toggleSetting('autoApproval.read.enabled')"></div>
          </div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Auto-approve writes</div>
              <div class="settings-item-description">Allow writing files without confirmation</div>
            </div>
            <div id="toggle-write" class="settings-toggle" onclick="toggleSetting('autoApproval.write.enabled')"></div>
          </div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Auto-approve MCP tools</div>
              <div class="settings-item-description">Allow MCP tool calls without confirmation</div>
            </div>
            <div id="toggle-mcp" class="settings-toggle active" onclick="toggleSetting('autoApproval.mcp.enabled')"></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Checkpoints</div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Auto checkpoint</div>
              <div class="settings-item-description">Create checkpoints automatically</div>
            </div>
            <div id="toggle-autocp" class="settings-toggle active" onclick="toggleSetting('autoCheckpoint')"></div>
          </div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Checkpoint on save</div>
              <div class="settings-item-description">Create checkpoint when saving files</div>
            </div>
            <div id="toggle-onsave" class="settings-toggle" onclick="toggleSetting('checkpointOnSave')"></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Cloud</div>
          <div class="settings-item">
            <div>
              <div class="settings-item-label">Cloud sync</div>
              <div class="settings-item-description">Sync checkpoints to cloud</div>
            </div>
            <div id="toggle-cloud" class="settings-toggle" onclick="toggleSetting('cloudSync')"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="messages" class="messages">
    <div class="empty-state">
      <div class="icon">🚀</div>
      <div>Welcome to AI Time Machine!</div>
      <div style="margin-top: 8px; font-size: 12px;">Type a message or use /help for commands</div>
    </div>
  </div>

  <div id="processing" class="processing" style="display: none;">
    <div class="spinner"></div>
    <span>Thinking...</span>
  </div>

  <!-- Tabbed Panel for Checkpoints & Task History -->
  <div id="bottom-panel" style="display: none;">
    <div class="panel-tabs">
      <div id="tab-checkpoints" class="panel-tab active" onclick="switchTab('checkpoints')">📍 Checkpoints</div>
      <div id="tab-tasks" class="panel-tab" onclick="switchTab('tasks')">📊 Tasks</div>
    </div>
    <div id="panel-checkpoints" class="panel-content">
      <div id="checkpoints-list"></div>
    </div>
    <div id="panel-tasks" class="panel-content" style="display: none;">
      <div id="task-history-list"></div>
      <div id="task-loading" class="processing" style="display: none;">
        <div class="spinner"></div>
        <span>Loading tasks...</span>
      </div>
    </div>
  </div>

  <div class="input-area">
    <div class="autocomplete-container">
      <div id="autocomplete-dropdown" class="autocomplete-dropdown" style="display: none;"></div>
      <div id="mention-dropdown" class="mention-dropdown" style="display: none;"></div>
      <div class="input-container">
        <textarea
          id="input"
          placeholder="Ask me anything or type / for commands..."
          rows="1"
          onkeydown="handleKeyDown(event)"
          oninput="handleInput(this)"
        ></textarea>
        <button id="send-btn" onclick="sendMessage()">Send</button>
      </div>
    </div>
    <div class="quick-actions">
      <button onclick="quickCommand('/checkpoint create')">💾 Save</button>
      <button onclick="quickCommand('/checkpoint restore')">↩ Undo</button>
      <button onclick="quickCommand('/checkpoint list')">📋 List</button>
      <button onclick="quickCommand('/session')">📂 Sessions</button>
      <button onclick="quickCommand('/tasks')">📊 Tasks</button>
      <button onclick="quickCommand('/mode')">⚙️ Mode</button>
    </div>
  </div>

  <div class="status-bar">
    <div class="status-indicator">
      <div id="status-dot" class="status-dot"></div>
      <span id="status-text">Ready</span>
    </div>
    <div id="mcp-status" class="mcp-status disconnected">
      <span id="mcp-status-icon">○</span>
      <span id="mcp-status-text">MCP</span>
    </div>
    <div id="mode-indicator" class="mode-indicator" onclick="quickCommand('/mode')">
      <span class="mode-icon">💻</span>
      <span id="mode-name">Code</span>
    </div>
    <span id="project-name">-</span>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let state = {
      messages: [],
      checkpoints: [],
      sessions: [],
      currentSessionId: null,
      isProcessing: false,
      currentMode: 'code',
      showSettings: false,
      taskHistoryData: null,
      taskHistoryLoading: false,
      config: {},
      mcpStatus: 'disconnected',
      streaming: { isStreaming: false, currentContent: '', toolCalls: [] }
    };
    let checkpointsExpanded = true;
    let sessionMenuVisible = false;
    let activeTab = 'checkpoints';
    let autocompleteVisible = false;
    let autocompleteItems = [];
    let autocompleteIndex = 0;
    let mentionVisible = false;
    let mentionItems = [];
    let mentionIndex = 0;
    let mentionQuery = '';
    let settingsState = {};

    // Available commands for autocomplete
    const commands = [
      { name: '/checkpoint', aliases: ['/cp'], description: 'Manage checkpoints', subcommands: ['list', 'create', 'restore', 'diff', 'preview'] },
      { name: '/session', aliases: ['/s'], description: 'Manage sessions', subcommands: ['show', 'list', 'new', 'select', 'rename', 'delete'] },
      { name: '/tasks', aliases: ['/t', '/history'], description: 'View task history', subcommands: ['list', 'search', 'stats'] },
      { name: '/mode', aliases: ['/m'], description: 'Switch modes', subcommands: ['show', 'list', 'switch', 'code', 'architect', 'debug'] },
      { name: '/help', aliases: ['/h', '/?'], description: 'Show help' },
      { name: '/clear', aliases: ['/cls'], description: 'Clear conversation' },
      { name: '/new', aliases: ['/n'], description: 'Start new session' },
      { name: '/config', aliases: ['/cfg'], description: 'View/edit settings' },
      { name: '/newtask', aliases: ['/nt', '/task'], description: 'Create new task' },
      { name: '/reportbug', aliases: ['/bug', '/issue'], description: 'Report a bug' },
      { name: '/newrule', aliases: ['/rule', '/workflow'], description: 'Create workflow rule' },
    ];

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'state') {
        state = msg;
        render();
      } else if (msg.type === 'modeChanged') {
        state.currentMode = msg.mode;
        updateStatus();
      } else if (msg.type === 'mentionSuggestions') {
        mentionItems = msg.suggestions || [];
        mentionIndex = 0;
        renderMentions();
      } else if (msg.type === 'streamingUpdate') {
        // Handle real-time streaming updates
        state.streaming = {
          isStreaming: true,
          currentContent: msg.content || '',
          toolCalls: msg.toolCalls || [],
          checkpointCreated: msg.checkpointId
        };
        renderMessages();
      } else if (msg.type === 'checkpointCreated') {
        // Show checkpoint notification
        showCheckpointNotification(msg.checkpointId, msg.description);
      } else if (msg.type === 'progress') {
        // Handle progress updates
        updateProgress(msg.progress, msg.message);
      }
    });

    function showCheckpointNotification(checkpointId, description) {
      // Briefly show a toast notification for checkpoint creation
      const toast = document.createElement('div');
      toast.className = 'checkpoint-toast';
      toast.innerHTML = '<span>📍</span> Checkpoint created: ' + escapeHtml(description || checkpointId.substring(0, 12));
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
      }, 2000);
    }

    function updateProgress(progress, message) {
      const processingEl = document.getElementById('processing');
      const processingText = processingEl?.querySelector('span');
      if (processingText && message) {
        processingText.textContent = message;
      }
    }

    function render() {
      renderMessages();
      renderCheckpoints();
      renderSessions();
      renderTaskHistory();
      renderSettings();
      updateStatus();
    }

    function renderMessages() {
      const container = document.getElementById('messages');

      if (state.messages.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="icon">🚀</div>
            <div>Welcome to AI Time Machine!</div>
            <div style="margin-top: 8px; font-size: 12px;">Type a message or use /help for commands</div>
          </div>
        \`;
        return;
      }

      container.innerHTML = state.messages.map(m => {
        let html = '<div class="message ' + m.role + '">';

        // Checkpoint badge if this message created a checkpoint
        if (m.checkpointId) {
          html += '<div class="checkpoint-badge" onclick="restore(\\'' + m.checkpointId + '\\')">' +
                  '<span class="checkpoint-badge-icon">📍</span>' +
                  '<span class="checkpoint-badge-text">Checkpoint: ' + escapeHtml(m.checkpointId.substring(0, 12)) + '...</span>' +
                  '</div>';
        }

        html += '<div class="message-header">' + (m.role === 'user' ? '👤 You' : '🤖 Assistant') + ' · ' + formatTime(m.timestamp) + '</div>';

        // Tool calls inline (if present)
        if (m.toolCalls && m.toolCalls.length > 0) {
          html += '<div class="tool-calls">';
          m.toolCalls.forEach(function(tc) {
            const statusIcon = tc.status === 'completed' ? '✓' : tc.status === 'error' ? '✗' : tc.status === 'running' ? '⟳' : '○';
            const statusClass = tc.status || 'pending';
            html += '<div class="tool-call ' + statusClass + '">' +
                    '<div class="tool-call-header">' +
                    '<span class="tool-call-icon">' + statusIcon + '</span>' +
                    '<span class="tool-call-name">' + escapeHtml(tc.name) + '</span>' +
                    (tc.duration ? '<span class="tool-call-duration">' + tc.duration + 'ms</span>' : '') +
                    '</div>';
            if (tc.arguments && Object.keys(tc.arguments).length > 0) {
              html += '<div class="tool-call-args"><code>' + escapeHtml(JSON.stringify(tc.arguments, null, 2)) + '</code></div>';
            }
            if (tc.result && tc.status === 'completed') {
              const resultPreview = typeof tc.result === 'string' ? tc.result.substring(0, 200) : JSON.stringify(tc.result).substring(0, 200);
              html += '<div class="tool-call-result">' + escapeHtml(resultPreview) + (resultPreview.length >= 200 ? '...' : '') + '</div>';
            }
            html += '</div>';
          });
          html += '</div>';
        }

        html += '<div class="message-content">' + formatContent(m.content) + '</div>';
        html += '</div>';
        return html;
      }).join('');

      // Add streaming message if active
      if (state.streaming && state.streaming.isStreaming) {
        let streamingHtml = '<div class="message assistant streaming">';
        streamingHtml += '<div class="message-header">🤖 Assistant · typing...</div>';

        // Show streaming tool calls
        if (state.streaming.toolCalls && state.streaming.toolCalls.length > 0) {
          streamingHtml += '<div class="tool-calls">';
          state.streaming.toolCalls.forEach(function(tc) {
            const statusIcon = tc.status === 'completed' ? '✓' : tc.status === 'error' ? '✗' : tc.status === 'running' ? '⟳' : '○';
            const statusClass = tc.status || 'pending';
            streamingHtml += '<div class="tool-call ' + statusClass + '">' +
                            '<div class="tool-call-header">' +
                            '<span class="tool-call-icon">' + statusIcon + '</span>' +
                            '<span class="tool-call-name">' + escapeHtml(tc.name) + '</span>' +
                            (tc.status === 'running' ? '<span class="tool-call-spinner"></span>' : '') +
                            '</div>';
            streamingHtml += '</div>';
          });
          streamingHtml += '</div>';
        }

        if (state.streaming.currentContent) {
          streamingHtml += '<div class="message-content">' + formatContent(state.streaming.currentContent) + '</div>';
        } else {
          streamingHtml += '<div class="message-content typing-indicator"><span></span><span></span><span></span></div>';
        }
        streamingHtml += '</div>';
        container.innerHTML += streamingHtml;
      }

      container.scrollTop = container.scrollHeight;
    }

    function renderCheckpoints() {
      const panel = document.getElementById('bottom-panel');
      const list = document.getElementById('checkpoints-list');

      // Show panel if we have checkpoints or task history
      const hasContent = (state.checkpoints && state.checkpoints.length > 0) ||
                         (state.taskHistoryData && state.taskHistoryData.historyItems && state.taskHistoryData.historyItems.length > 0);
      panel.style.display = hasContent ? 'block' : 'none';

      if (!state.checkpoints || state.checkpoints.length === 0) {
        list.innerHTML = '<div style="padding: 16px; text-align: center; opacity: 0.6;">No checkpoints yet</div>';
        return;
      }

      list.innerHTML = state.checkpoints.slice(0, 10).map(cp => \`
        <div class="checkpoint-item">
          <div>
            <div class="checkpoint-name">\${escapeHtml(cp.name || 'Checkpoint')}</div>
            <div class="checkpoint-time">\${timeAgo(cp.timestamp)} · \${cp.stats?.totalFiles || 0} files</div>
          </div>
          <div class="checkpoint-actions">
            <button onclick="restore('\${cp.id}')" title="Restore">↩</button>
            <button onclick="showDiff('\${cp.id}')" title="Diff">⇄</button>
          </div>
        </div>
      \`).join('');
    }

    function renderSessions() {
      const sessionList = document.getElementById('session-list');
      const currentSessionName = document.getElementById('current-session-name');

      if (!state.sessions || state.sessions.length === 0) {
        sessionList.innerHTML = '<div style="padding: 12px; text-align: center; opacity: 0.6; font-size: 11px;">No sessions yet</div>';
        currentSessionName.textContent = 'New Session';
        return;
      }

      // Update current session name
      const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
      currentSessionName.textContent = currentSession?.name || 'Select Session';

      sessionList.innerHTML = state.sessions.map(s => \`
        <div class="session-item \${s.id === state.currentSessionId ? 'active' : ''}" onclick="selectSession('\${s.id}')">
          <div class="session-item-info">
            <div class="session-name">\${escapeHtml(s.name)}</div>
            <div class="session-meta">\${timeAgo(s.lastActive)} · \${s.messageCount || 0} messages</div>
          </div>
          <div class="session-actions">
            <button onclick="event.stopPropagation(); renameSession('\${s.id}')" title="Rename">✏</button>
            <button onclick="event.stopPropagation(); deleteSession('\${s.id}')" title="Delete">🗑</button>
          </div>
        </div>
      \`).join('');
    }

    function renderTaskHistory() {
      const list = document.getElementById('task-history-list');
      const loading = document.getElementById('task-loading');

      if (state.taskHistoryLoading) {
        loading.style.display = 'flex';
        list.innerHTML = '';
        return;
      }

      loading.style.display = 'none';

      if (!state.taskHistoryData || !state.taskHistoryData.historyItems || state.taskHistoryData.historyItems.length === 0) {
        list.innerHTML = '<div style="padding: 16px; text-align: center; opacity: 0.6;">No task history</div>';
        return;
      }

      list.innerHTML = state.taskHistoryData.historyItems.slice(0, 10).map(task => \`
        <div class="task-item" onclick="quickCommand('/tasks show \${task.id}')">
          <div class="task-title">\${escapeHtml(task.task)}</div>
          <div class="task-meta">
            <span class="task-stat">📅 \${timeAgo(task.ts)}</span>
            <span class="task-stat">📝 \${task.tokensIn + task.tokensOut} tokens</span>
            \${task.totalCost > 0 ? '<span class="task-stat">💰 $' + task.totalCost.toFixed(4) + '</span>' : ''}
            \${task.isFavorited ? '<span class="task-stat">⭐</span>' : ''}
          </div>
        </div>
      \`).join('');
    }

    function renderSettings() {
      const overlay = document.getElementById('settings-overlay');
      overlay.style.display = state.showSettings ? 'flex' : 'none';

      if (state.config) {
        // Update toggle states based on config
        updateToggle('toggle-read', state.config.autoApproval?.read?.enabled);
        updateToggle('toggle-write', state.config.autoApproval?.write?.enabled);
        updateToggle('toggle-mcp', state.config.autoApproval?.mcp?.enabled);
        updateToggle('toggle-autocp', state.config.autoCheckpoint);
        updateToggle('toggle-onsave', state.config.checkpointOnSave);
        updateToggle('toggle-cloud', state.config.cloudSync);
      }
    }

    function updateToggle(id, value) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('active', !!value);
      }
    }

    function renderMentions() {
      const dropdown = document.getElementById('mention-dropdown');

      if (!mentionVisible || mentionItems.length === 0) {
        dropdown.style.display = 'none';
        return;
      }

      dropdown.style.display = 'block';
      dropdown.innerHTML = mentionItems.map((item, index) => \`
        <div class="mention-item \${index === mentionIndex ? 'selected' : ''}"
             onclick="selectMention(\${index})">
          <span class="mention-icon">\${item.icon}</span>
          <div class="mention-info">
            <div class="mention-display">\${escapeHtml(item.display)}</div>
            <div class="mention-description">\${escapeHtml(item.description)}</div>
          </div>
          <span class="mention-type">\${item.type}</span>
        </div>
      \`).join('');
    }

    function updateStatus() {
      const dot = document.getElementById('status-dot');
      const text = document.getElementById('status-text');
      const project = document.getElementById('project-name');
      const processing = document.getElementById('processing');
      const sendBtn = document.getElementById('send-btn');
      const modeIcon = document.querySelector('.mode-icon');
      const modeName = document.getElementById('mode-name');
      const mcpStatusEl = document.getElementById('mcp-status');
      const mcpStatusIcon = document.getElementById('mcp-status-icon');
      const mcpStatusText = document.getElementById('mcp-status-text');

      if (state.isProcessing) {
        processing.style.display = 'flex';
        sendBtn.disabled = true;
        text.textContent = 'Processing...';
      } else {
        processing.style.display = 'none';
        sendBtn.disabled = false;
        text.textContent = state.isAuthenticated ? 'Connected' : 'Local only';
        dot.classList.toggle('offline', !state.isAuthenticated);
      }

      project.textContent = state.projectName || '-';

      // Update mode indicator
      const modeIcons = { code: '💻', architect: '📐', debug: '🐛', ask: '❓' };
      const modeNames = { code: 'Code', architect: 'Architect', debug: 'Debug', ask: 'Ask' };
      const mode = state.currentMode || 'code';
      if (modeIcon) modeIcon.textContent = modeIcons[mode] || '💻';
      if (modeName) modeName.textContent = modeNames[mode] || mode.charAt(0).toUpperCase() + mode.slice(1);

      // Update MCP status indicator
      if (mcpStatusEl) {
        mcpStatusEl.className = 'mcp-status ' + (state.mcpStatus || 'disconnected');
        const statusIcons = { connected: '●', connecting: '◐', disconnected: '○', error: '✗' };
        const statusTexts = { connected: 'MCP', connecting: 'MCP...', disconnected: 'MCP', error: 'MCP!' };
        if (mcpStatusIcon) mcpStatusIcon.textContent = statusIcons[state.mcpStatus] || '○';
        if (mcpStatusText) mcpStatusText.textContent = statusTexts[state.mcpStatus] || 'MCP';
      }
    }

    function sendMessage() {
      const input = document.getElementById('input');
      const message = input.value.trim();
      if (!message || state.isProcessing) return;

      hideAutocomplete();
      vscode.postMessage({ type: 'sendMessage', message });
      input.value = '';
      autoResize(input);
    }

    function showAutocomplete(input) {
      const parts = input.split(' ');
      const cmdPart = parts[0].toLowerCase();
      const subPart = parts[1]?.toLowerCase() || '';

      // Find matching commands
      if (parts.length === 1) {
        // Matching main commands
        autocompleteItems = commands
          .filter(cmd => cmd.name.startsWith(cmdPart) || cmd.aliases.some(a => a.startsWith(cmdPart)))
          .map(cmd => ({
            value: cmd.name,
            display: cmd.name,
            description: cmd.description,
            aliases: cmd.aliases.join(', ')
          }));
      } else if (parts.length === 2) {
        // Matching subcommands
        const cmd = commands.find(c => c.name === cmdPart || c.aliases.includes(cmdPart));
        if (cmd?.subcommands) {
          autocompleteItems = cmd.subcommands
            .filter(sub => sub.startsWith(subPart))
            .map(sub => ({
              value: cmd.name + ' ' + sub,
              display: sub,
              description: 'Subcommand'
            }));
        } else {
          autocompleteItems = [];
        }
      } else {
        autocompleteItems = [];
      }

      autocompleteIndex = 0;

      if (autocompleteItems.length > 0) {
        autocompleteVisible = true;
        renderAutocomplete();
      } else {
        hideAutocomplete();
      }
    }

    function renderAutocomplete() {
      const dropdown = document.getElementById('autocomplete-dropdown');
      if (!autocompleteVisible || autocompleteItems.length === 0) {
        dropdown.style.display = 'none';
        return;
      }

      dropdown.style.display = 'block';
      dropdown.innerHTML = autocompleteItems.map((item, index) => \`
        <div class="autocomplete-item \${index === autocompleteIndex ? 'selected' : ''}"
             onclick="selectAutocompleteItem(\${index})">
          <span class="command">\${escapeHtml(item.display)}</span>
          <span class="description">\${escapeHtml(item.description)}</span>
          \${item.aliases ? '<span class="shortcut">' + escapeHtml(item.aliases) + '</span>' : ''}
        </div>
      \`).join('');
    }

    function selectAutocompleteItem(index) {
      const item = autocompleteItems[index];
      if (item) {
        const input = document.getElementById('input');
        input.value = item.value + ' ';
        input.focus();
        hideAutocomplete();
      }
    }

    function hideAutocomplete() {
      autocompleteVisible = false;
      autocompleteItems = [];
      autocompleteIndex = 0;
      document.getElementById('autocomplete-dropdown').style.display = 'none';
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    function createCheckpoint() {
      const name = prompt('Checkpoint name:', 'Manual checkpoint');
      if (name) {
        vscode.postMessage({ type: 'createCheckpoint', name });
      }
    }

    function restore(id) {
      vscode.postMessage({ type: 'restore', checkpointId: id });
    }

    function showDiff(id) {
      vscode.postMessage({ type: 'sendMessage', message: '/diff ' + id });
    }

    function quickCommand(cmd) {
      if (cmd === '/checkpoint') {
        createCheckpoint();
      } else {
        vscode.postMessage({ type: 'sendMessage', message: cmd });
      }
    }

    function showHelp() {
      vscode.postMessage({ type: 'sendMessage', message: '/help' });
    }

    function toggleCheckpoints() {
      checkpointsExpanded = !checkpointsExpanded;
      renderCheckpoints();
    }

    function formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString();
    }

    function timeAgo(timestamp) {
      const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      return Math.floor(seconds / 86400) + 'd ago';
    }

    function formatContent(content) {
      // Basic markdown-like formatting
      return escapeHtml(content)
        .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre>$1</pre>')
        .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
        .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\n/g, '<br>');
    }

    function escapeHtml(str) {
      return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // Session management functions
    function toggleSessionMenu() {
      sessionMenuVisible = !sessionMenuVisible;
      document.getElementById('session-menu').style.display = sessionMenuVisible ? 'block' : 'none';
      if (sessionMenuVisible) {
        vscode.postMessage({ type: 'getSessions' });
      }
    }

    function selectSession(sessionId) {
      vscode.postMessage({ type: 'selectSession', sessionId });
      toggleSessionMenu();
    }

    function createNewSession() {
      const name = prompt('Session name:', 'New Session');
      if (name) {
        vscode.postMessage({ type: 'createSession', name });
      }
      toggleSessionMenu();
    }

    function renameSession(sessionId) {
      const name = prompt('New name:');
      if (name) {
        vscode.postMessage({ type: 'renameSession', sessionId, name });
      }
    }

    function deleteSession(sessionId) {
      if (confirm('Delete this session?')) {
        vscode.postMessage({ type: 'deleteSession', sessionId });
      }
    }

    // Tab switching
    function switchTab(tab) {
      activeTab = tab;
      document.getElementById('tab-checkpoints').classList.toggle('active', tab === 'checkpoints');
      document.getElementById('tab-tasks').classList.toggle('active', tab === 'tasks');
      document.getElementById('panel-checkpoints').style.display = tab === 'checkpoints' ? 'block' : 'none';
      document.getElementById('panel-tasks').style.display = tab === 'tasks' ? 'block' : 'none';

      if (tab === 'tasks' && (!state.taskHistoryData || state.taskHistoryData.historyItems.length === 0)) {
        vscode.postMessage({ type: 'getTaskHistory' });
      }
    }

    // Settings functions
    function toggleSettings() {
      vscode.postMessage({ type: 'toggleSettings' });
    }

    function toggleSetting(key) {
      const el = document.getElementById('toggle-' + key.split('.').pop());
      const newValue = el ? !el.classList.contains('active') : true;
      vscode.postMessage({ type: 'updateSettings', settings: { [key]: newValue } });
    }

    // Mention functions
    function handleMentions(value) {
      // Check for @ mention trigger
      const lastAt = value.lastIndexOf('@');
      if (lastAt !== -1) {
        const afterAt = value.substring(lastAt + 1);
        // Check if we're still typing the mention (no space after @)
        if (!afterAt.includes(' ') && afterAt.length > 0) {
          mentionQuery = afterAt;
          mentionVisible = true;
          vscode.postMessage({ type: 'getMentionSuggestions', query: mentionQuery });
          return;
        }
      }
      hideMentions();
    }

    function selectMention(index) {
      const item = mentionItems[index];
      if (item) {
        const input = document.getElementById('input');
        const value = input.value;
        const lastAt = value.lastIndexOf('@');
        if (lastAt !== -1) {
          input.value = value.substring(0, lastAt) + '@' + item.value + ' ';
          input.focus();
        }
      }
      hideMentions();
    }

    function hideMentions() {
      mentionVisible = false;
      mentionItems = [];
      mentionIndex = 0;
      document.getElementById('mention-dropdown').style.display = 'none';
    }

    // Enhanced input handler for mentions
    const originalHandleInput = handleInput;
    function handleInput(el) {
      autoResize(el);
      const value = el.value;

      // Check for slash commands
      if (value.startsWith('/')) {
        showAutocomplete(value);
        hideMentions();
      } else if (value.includes('@')) {
        handleMentions(value);
        hideAutocomplete();
      } else {
        hideAutocomplete();
        hideMentions();
      }
    }

    // Enhanced key handler for mentions
    function handleKeyDown(e) {
      if (mentionVisible && mentionItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          mentionIndex = Math.min(mentionIndex + 1, mentionItems.length - 1);
          renderMentions();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          mentionIndex = Math.max(mentionIndex - 1, 0);
          renderMentions();
        } else if (e.key === 'Tab' || e.key === 'Enter') {
          e.preventDefault();
          selectMention(mentionIndex);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          hideMentions();
        }
        return;
      }

      if (autocompleteVisible) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          autocompleteIndex = Math.min(autocompleteIndex + 1, autocompleteItems.length - 1);
          renderAutocomplete();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          autocompleteIndex = Math.max(autocompleteIndex - 1, 0);
          renderAutocomplete();
        } else if (e.key === 'Tab' || (e.key === 'Enter' && autocompleteItems.length > 0)) {
          e.preventDefault();
          selectAutocompleteItem(autocompleteIndex);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          hideAutocomplete();
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }

    // Close session menu when clicking outside
    document.addEventListener('click', function(e) {
      const sessionDropdown = document.querySelector('.session-dropdown');
      if (sessionDropdown && !sessionDropdown.contains(e.target) && sessionMenuVisible) {
        sessionMenuVisible = false;
        document.getElementById('session-menu').style.display = 'none';
      }
    });

    // Initialize
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }

  // Public methods for external access
  public addMessage(role: 'user' | 'assistant' | 'system', content: string) {
    const message: Message = {
      id: this._generateId(),
      role,
      content,
      timestamp: new Date()
    };
    this._messages.push(message);
    this._saveHistory();
    this._sendState();
  }

  public refresh() {
    this._refreshCheckpoints();
    this._sendState();
  }

  public clearHistory() {
    this._messages = [];
    this._saveHistory();
    this._sendState();
  }

  /**
   * Reconnect to MCP server
   */
  public async reconnectMCP(): Promise<boolean> {
    this._mcpConnectionStatus = 'connecting';
    this._sendState();

    if (this._mcpClient) {
      this._mcpClient.disconnect();
    }

    await this._initializeMCPClient();
    // Check the actual connection status after initialization
    const isConnected = this._mcpClient?.isConnected ?? false;
    return isConnected;
  }

  /**
   * Get MCP connection status
   */
  public getMCPStatus(): string {
    return this._mcpConnectionStatus;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this._mcpClient) {
      this._mcpClient.dispose();
      this._mcpClient = null;
    }
    disposeSharedMCPClient();
  }
}
