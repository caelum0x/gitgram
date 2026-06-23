import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Providers
import { ChatPanelProvider } from './providers/ChatPanelProvider';
import { AitmFileDecorationProvider } from './providers/FileDecorationProvider';
import { AitmCodeLensProvider, FunctionChangeCodeLensProvider, registerFunctionCommands } from './providers/CodeLensProvider';
import { AitmTerminalProvider, ChangesTreeProvider } from './providers/TerminalProvider';
import { ConversationViewProvider } from './providers/ConversationViewProvider';
import { TimelineGraphProvider } from './providers/TimelineGraphProvider';
import { ErrorDetectionProvider, ErrorCodeActionProvider } from './providers/ErrorDetectionProvider';

// Services
import {
  getSessionManager,
  getApprovalManager,
  getGhostService,
  getCommitMessageGenerator,
  getMentionsProvider,
} from './services';

// Commands
import { registerAllCommands } from './commands';
import { registerGitNexusCommands } from './commands/gitnexus';
import { registerSessionCommands } from './commands/sessions';

interface Checkpoint {
  id: string;
  description: string;
  timestamp: string;
  stats: {
    totalFiles: number;
    totalSize: number;
  };
  changes?: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  metadata?: {
    type?: string;
    action?: string;
    status?: string;
    beforeCheckpoint?: string;
  };
}

interface AuthStatus {
  authenticated: boolean;
  user?: { email: string; id: string };
  cloudSync?: boolean;
}

// Auth helpers
function getAuthStatus(): AuthStatus {
  try {
    const output = execAitm('whoami --json');
    return JSON.parse(output);
  } catch {
    return { authenticated: false };
  }
}

function getCredentialsPath(): string {
  return path.join(os.homedir(), '.aitimemachine', 'credentials.json');
}

function isAuthenticated(): boolean {
  try {
    const credPath = getCredentialsPath();
    if (!fs.existsSync(credPath)) return false;
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    return !!(creds.apiKey || creds.token);
  } catch {
    return false;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Time Machine extension activated');

  // ========================================
  // SERVICES INITIALIZATION
  // ========================================

  // Initialize Session Manager
  const sessionManager = getSessionManager(context);
  context.subscriptions.push({ dispose: () => sessionManager.dispose() });

  // Initialize Approval Manager
  const approvalManager = getApprovalManager();

  // Initialize Ghost Service (inline suggestions)
  const ghostService = getGhostService();
  context.subscriptions.push(ghostService);

  // Initialize Commit Message Generator
  const commitMessageGenerator = getCommitMessageGenerator();
  context.subscriptions.push(commitMessageGenerator);

  // Initialize Mentions Provider
  const mentionsProvider = getMentionsProvider();
  context.subscriptions.push(mentionsProvider);

  // Register all slash commands
  registerAllCommands();

  // Register GitNexus code-intelligence commands
  registerGitNexusCommands(context);

  // Register session management commands (API-based)
  registerSessionCommands(context);

  // ========================================
  // GHOST SERVICE COMMANDS
  // ========================================
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.ghost.generateSuggestions', () => {
      ghostService.generateSuggestions();
    }),
    vscode.commands.registerCommand('aitm.ghost.applyCurrentSuggestion', () => {
      ghostService.applyCurrentSuggestion();
    }),
    vscode.commands.registerCommand('aitm.ghost.applyAllSuggestions', async () => {
      // Apply all suggestions one by one
      while (ghostService.hasSuggestions()) {
        await ghostService.applyCurrentSuggestion();
      }
    }),
    vscode.commands.registerCommand('aitm.ghost.nextSuggestion', () => {
      ghostService.goToNextSuggestion();
    }),
    vscode.commands.registerCommand('aitm.ghost.previousSuggestion', () => {
      ghostService.goToPreviousSuggestion();
    }),
    vscode.commands.registerCommand('aitm.ghost.cancelSuggestions', () => {
      ghostService.cancelSuggestions();
    }),
    vscode.commands.registerCommand('aitm.ghost.toggleSuggestions', () => {
      ghostService.toggle();
    })
  );

  // ========================================
  // COMMIT MESSAGE COMMANDS
  // ========================================
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.generateCommitMessage', async () => {
      await commitMessageGenerator.generateAndInsert();
    }),
    vscode.commands.registerCommand('aitm.generateCommitMessagePreview', async () => {
      const message = await commitMessageGenerator.generateCommitMessage();
      if (message) {
        const result = await vscode.window.showInformationMessage(
          `Generated: ${message.title}`,
          { modal: true, detail: message.body || '' },
          'Use This',
          'Regenerate'
        );
        if (result === 'Use This') {
          await commitMessageGenerator.generateAndInsert();
        } else if (result === 'Regenerate') {
          vscode.commands.executeCommand('aitm.generateCommitMessagePreview');
        }
      }
    })
  );

  // ========================================
  // PROVIDERS
  // ========================================

  // Timeline provider (tree view)
  const timelineProvider = new TimelineProvider();
  vscode.window.registerTreeDataProvider('aitm.timelineView', timelineProvider);

  // Chat panel provider (webview in sidebar)
  const chatProvider = new ChatPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatPanelProvider.viewType, chatProvider)
  );

  // Conversation view provider (panel)
  const conversationProvider = new ConversationViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ConversationViewProvider.viewType, conversationProvider)
  );

  // File decoration provider
  const fileDecorationProvider = new AitmFileDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(fileDecorationProvider)
  );

  // CodeLens provider
  const codeLensProvider = new AitmCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider)
  );

  // Function-level CodeLens provider
  const functionCodeLensProvider = new FunctionChangeCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'typescript' },
      functionCodeLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'javascript' },
      functionCodeLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'typescriptreact' },
      functionCodeLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'javascriptreact' },
      functionCodeLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'python' },
      functionCodeLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'go' },
      functionCodeLensProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file', language: 'rust' },
      functionCodeLensProvider
    )
  );

  // Register function-level commands
  registerFunctionCommands(context);

  // Timeline Graph provider (visual timeline webview)
  const timelineGraphProvider = new TimelineGraphProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TimelineGraphProvider.viewType, timelineGraphProvider)
  );

  // Error Detection provider (smart error tracking)
  const errorDetectionProvider = new ErrorDetectionProvider();
  context.subscriptions.push(errorDetectionProvider);

  // Error code actions
  const errorCodeActionProvider = new ErrorCodeActionProvider(errorDetectionProvider);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      errorCodeActionProvider,
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  // Terminal provider
  const terminalProvider = new AitmTerminalProvider();
  context.subscriptions.push({ dispose: () => terminalProvider.dispose() });

  // Changes tree provider (pending changes view)
  const changesProvider = new ChangesTreeProvider();
  vscode.window.registerTreeDataProvider('aitm.changesView', changesProvider);

  // ========================================
  // STATUS BAR
  // ========================================

  // Status bar - shows auth status and last checkpoint time
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'aitm.showQuickActions';
  context.subscriptions.push(statusBar);

  // Quick actions command - main entry point via status bar click
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.showQuickActions', async () => {
      const items: vscode.QuickPickItem[] = [
        { label: '$(save) Create Checkpoint', description: 'Save current state' },
        { label: '$(history) View Timeline', description: 'Browse checkpoint history' },
        { label: '$(search) Search History', description: 'Search through changes' },
        { label: '$(discard) Restore Previous', description: 'Go back to a checkpoint' },
        { label: '$(diff) View Changes', description: 'See what changed since last checkpoint' },
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'AITimeMachine Actions',
      });

      if (!selected) return;

      switch (selected.label) {
        case '$(save) Create Checkpoint':
          vscode.commands.executeCommand('aitm.createCheckpoint');
          break;
        case '$(history) View Timeline':
          vscode.commands.executeCommand('aitm.showTimeline');
          break;
        case '$(search) Search History':
          vscode.commands.executeCommand('aitm.smartSearch');
          break;
        case '$(discard) Restore Previous':
          vscode.commands.executeCommand('aitm.goBack');
          break;
        case '$(diff) View Changes':
          vscode.commands.executeCommand('aitm.showDiff', undefined);
          break;
      }
    })
  );

  // Update status bar with auth info and last checkpoint time
  const updateAuthStatus = () => {
    const auth = isAuthenticated();
    if (auth) {
      const checkpoints = getCheckpoints();
      const count = checkpoints.length;
      if (count > 0) {
        const latest = checkpoints[0];
        const ago = getTimeAgo(new Date(latest.timestamp));
        statusBar.text = `$(shield) AITM: ${ago}`;
        statusBar.tooltip = `Last checkpoint: ${latest.description}\n${ago}\nClick for actions`;
      } else {
        statusBar.text = '$(shield) AITM';
        statusBar.tooltip = 'AI Time Machine - No checkpoints yet. Click for actions';
      }
    } else {
      statusBar.text = '$(shield) AITM $(warning)';
      statusBar.tooltip = 'AI Time Machine - Not logged in. Click for actions.';
    }
    statusBar.show();
  };
  updateAuthStatus();

  // Auth commands
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.login', async () => {
      const choice = await vscode.window.showQuickPick([
        { label: '$(key) Login with API Key', value: 'apikey' },
        { label: '$(globe) Login with Browser', value: 'browser' }
      ], { placeHolder: 'Choose login method' });

      if (!choice) return;

      if (choice.value === 'apikey') {
        const apiKey = await vscode.window.showInputBox({
          prompt: 'Enter your API key',
          placeHolder: 'aitm_xxxxxxxxxxxxxxxx',
          password: true
        });
        if (apiKey) {
          try {
            execAitm(`login --api-key ${apiKey}`);
            vscode.window.showInformationMessage('✓ Logged in successfully');
            updateAuthStatus();
            timelineProvider.refresh();
          } catch (error) {
            vscode.window.showErrorMessage(`Login failed: ${error}`);
          }
        }
      } else {
        try {
          execAitm('login');
          vscode.window.showInformationMessage('✓ Browser login initiated');
        } catch (error) {
          vscode.window.showErrorMessage(`Login failed: ${error}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.logout', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Logout from AI Time Machine?', { modal: true }, 'Logout'
      );
      if (confirm) {
        try {
          execAitm('logout');
          vscode.window.showInformationMessage('✓ Logged out');
          updateAuthStatus();
        } catch (error) {
          vscode.window.showErrorMessage(`Logout failed: ${error}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.whoami', async () => {
      try {
        const status = getAuthStatus();
        if (status.authenticated && status.user) {
          vscode.window.showInformationMessage(
            `Logged in as: ${status.user.email}${status.cloudSync ? ' (Cloud sync enabled)' : ''}`
          );
        } else {
          const login = await vscode.window.showWarningMessage(
            'Not logged in', 'Login'
          );
          if (login) {
            vscode.commands.executeCommand('aitm.login');
          }
        }
      } catch {
        vscode.window.showWarningMessage('Not logged in');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.syncStatus', async () => {
      try {
        const output = execAitm('sync-status');
        vscode.window.showInformationMessage(output.trim());
      } catch (error) {
        vscode.window.showErrorMessage(`Sync status failed: ${error}`);
      }
    })
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.createCheckpoint', async () => {
      const description = await vscode.window.showInputBox({
        prompt: 'Checkpoint description',
        placeHolder: 'e.g., Before refactoring user store'
      });

      if (description) {
        try {
          execAitm(`checkpoint "${description}"`);
          vscode.window.showInformationMessage(`✓ Checkpoint created: ${description}`);
          timelineProvider.refresh();
          updateAuthStatus();
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to create checkpoint: ${error}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.init', async () => {
      try {
        execAitm('init');
        vscode.window.showInformationMessage('✓ AI Time Machine initialized in this project');
        timelineProvider.refresh();
        updateAuthStatus();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to initialize: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.setup', async () => {
      try {
        execAitm('setup');
        vscode.window.showInformationMessage('✓ Project setup complete (MCP config added)');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to setup: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.showTimeline', () => {
      showTimelinePanel(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.restore', async (checkpoint: CheckpointItem) => {
      const confirm = await vscode.window.showWarningMessage(
        `Restore to: ${checkpoint.label}?\n\nThis will replace current files.`,
        { modal: true },
        'Restore', 'Preview'
      );

      if (confirm === 'Preview') {
        showPreview(checkpoint.id);
        return;
      }

      if (confirm === 'Restore') {
        try {
          const output = execAitm(`restore ${checkpoint.id}`);
          vscode.window.showInformationMessage(`✓ Restored to: ${checkpoint.label}`);
          
          // Show context
          const context = getRestoreContext(checkpoint.id);
          if (context) {
            showContextPanel(context, context.extensionUri);
          }

          timelineProvider.refresh();
          updateStatusBar(statusBar);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to restore: ${error}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.showConversation', async (checkpoint: CheckpointItem) => {
      const conversation = getConversation(checkpoint.id);
      showConversationPanel(conversation, context.extensionUri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.showDiff', async (checkpoint: CheckpointItem) => {
      showDiffView(checkpoint.id);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.showFileDiff', async (checkpointId: string, filePath: string) => {
      try {
        // Get file content at checkpoint
        const output = execAitm(`get-file ${checkpointId} "${filePath}"`);
        
        // Create temp file with checkpoint content
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;
        
        const tempDir = path.join(workspaceRoot, '.tm_internal', 'tmp_diff');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        
        const tempFile = path.join(tempDir, path.basename(filePath));
        fs.writeFileSync(tempFile, output);
        
        // Show diff
        const currentUri = vscode.Uri.file(path.join(workspaceRoot, filePath));
        const checkpointUri = vscode.Uri.file(tempFile);
        
        await vscode.commands.executeCommand('vscode.diff', 
          checkpointUri, 
          currentUri, 
          `${path.basename(filePath)} (checkpoint vs current)`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to show diff: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.undo', async () => {
      const checkpoints = getCheckpoints();
      if (checkpoints.length < 2) {
        vscode.window.showInformationMessage('No previous checkpoint to undo to');
        return;
      }
      
      const prev = checkpoints[1]; // Second checkpoint (first is current)
      const confirm = await vscode.window.showWarningMessage(
        `Undo to: ${prev.description}?`, { modal: true }, 'Undo'
      );
      
      if (confirm) {
        try {
          execAitm(`restore ${prev.id}`);
          vscode.window.showInformationMessage(`✓ Undone to: ${prev.description}`);
          timelineProvider.refresh();
          updateStatusBar(statusBar);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to undo: ${error}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.stash', async () => {
      const message = await vscode.window.showInputBox({
        prompt: 'Stash message (optional)',
        placeHolder: 'WIP: work in progress'
      });
      
      try {
        const cmd = message ? `stash "${message}"` : 'stash';
        execAitm(cmd);
        vscode.window.showInformationMessage('✓ Changes stashed');
        timelineProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to stash: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.stashPop', async () => {
      try {
        execAitm('stash pop');
        vscode.window.showInformationMessage('✓ Stash applied');
        timelineProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to pop stash: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.refresh', () => {
      timelineProvider.refresh();
      updateStatusBar(statusBar);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.goBack', async () => {
      const checkpoints = getCheckpoints();
      if (checkpoints.length === 0) {
        vscode.window.showInformationMessage('No checkpoints available');
        return;
      }

      const items = checkpoints.slice(0, 10).map(cp => ({
        label: cp.description,
        description: new Date(cp.timestamp).toLocaleString(),
        checkpoint: cp
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select checkpoint to restore'
      });

      if (selected) {
        vscode.commands.executeCommand('aitm.restore', new CheckpointItem(
          selected.checkpoint.description,
          selected.checkpoint.id,
          selected.checkpoint.timestamp,
          selected.checkpoint.stats
        ));
      }
    })
  );

  // ========================================
  // NEW COMMANDS
  // ========================================

  // Open Chat
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.openChat', () => {
      vscode.commands.executeCommand('aitm.chatView.focus');
    })
  );

  // Clear chat history
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.clearChat', () => {
      chatProvider.clearHistory();
      vscode.window.showInformationMessage('Chat history cleared');
    })
  );

  // Send message to chat
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.sendMessage', async (message?: string) => {
      if (!message) {
        message = await vscode.window.showInputBox({
          prompt: 'Enter a message to send to AITimeMachine chat',
          placeHolder: 'Type your message...',
        });
      }
      if (!message) {
        return;
      }
      // Focus the chat panel so the user can see the response
      await vscode.commands.executeCommand('aitm.chatView.focus');
      // Forward the message to the chat provider for processing
      (chatProvider as any)._handleUserMessage(message);
    })
  );

  // Toggle auto checkpoint
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.toggleAutoCheckpoint', async () => {
      const config = vscode.workspace.getConfiguration('aitm');
      const current = config.get('autoCheckpoint', true);
      await config.update('autoCheckpoint', !current, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage(`Auto checkpoint: ${!current ? 'enabled' : 'disabled'}`);
    })
  );

  // Show file history
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.showFileHistory', async (uri?: vscode.Uri) => {
      const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const relativePath = path.relative(workspaceRoot, fileUri.fsPath);

      try {
        const output = execAitm(`file-history "${relativePath}" --json`);
        const history = JSON.parse(output);

        if (history.length === 0) {
          vscode.window.showInformationMessage('No checkpoint history for this file');
          return;
        }

        const items: Array<vscode.QuickPickItem & { checkpointId: string }> = history.map((h: any) => ({
          label: h.description,
          description: `${h.changeType} - ${new Date(h.timestamp).toLocaleString()}`,
          detail: `Checkpoint: ${h.checkpointId}`,
          checkpointId: h.checkpointId
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select checkpoint to view or restore'
        });

        if (selected) {
          const action = await vscode.window.showQuickPick([
            { label: 'View diff', value: 'diff' },
            { label: 'Restore this version', value: 'restore' }
          ], { placeHolder: 'What would you like to do?' });

          if (action?.value === 'diff') {
            vscode.commands.executeCommand('aitm.showFileDiff', (selected as any).checkpointId, relativePath);
          } else if (action?.value === 'restore') {
            vscode.commands.executeCommand('aitm.restoreFile', fileUri, (selected as any).checkpointId);
          }
        }
      } catch {
        vscode.window.showErrorMessage('Failed to get file history');
      }
    })
  );

  // Restore specific file from checkpoint
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.restoreFile', async (uri?: vscode.Uri, checkpointId?: string) => {
      const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const relativePath = path.relative(workspaceRoot, fileUri.fsPath);

      // If no checkpoint specified, let user choose
      if (!checkpointId) {
        try {
          const output = execAitm(`file-history "${relativePath}" --json`);
          const history = JSON.parse(output);

          if (history.length === 0) {
            vscode.window.showInformationMessage('No checkpoint history for this file');
            return;
          }

          const items: Array<vscode.QuickPickItem & { checkpointId: string }> = history.map((h: any) => ({
            label: h.description,
            description: new Date(h.timestamp).toLocaleString(),
            checkpointId: h.checkpointId
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select version to restore'
          });

          if (!selected) return;
          checkpointId = (selected as any).checkpointId;
        } catch {
          vscode.window.showErrorMessage('Failed to get file history');
          return;
        }
      }

      const confirm = await vscode.window.showWarningMessage(
        `Restore ${path.basename(fileUri.fsPath)} from checkpoint?`,
        { modal: true },
        'Restore'
      );

      if (confirm) {
        try {
          execAitm(`restore-file ${checkpointId} "${relativePath}"`);
          vscode.window.showInformationMessage(`File restored from checkpoint`);

          // Refresh decorations
          fileDecorationProvider.refresh();
          changesProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to restore file: ${error}`);
        }
      }
    })
  );

  // Compare file with checkpoint
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.compareWithCheckpoint', async (uri?: vscode.Uri, checkpointId?: string) => {
      const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const relativePath = path.relative(workspaceRoot, fileUri.fsPath);

      // If no checkpoint, show latest
      if (!checkpointId) {
        const checkpoints = getCheckpoints();
        if (checkpoints.length === 0) {
          vscode.window.showInformationMessage('No checkpoints available');
          return;
        }
        checkpointId = checkpoints[0].id;
      }

      vscode.commands.executeCommand('aitm.showFileDiff', checkpointId, relativePath);
    })
  );

  // Bisect (find breaking change)
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.bisect', async () => {
      const testCommand = await vscode.window.showInputBox({
        prompt: 'Enter test command (must return 0 on success)',
        placeHolder: 'npm test',
        ignoreFocusOut: true
      });

      if (!testCommand) return;

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Bisecting...',
        cancellable: true
      }, async (progress, token) => {
        try {
          const output = execAitm(`bisect --test "${testCommand}"`);
          const result = JSON.parse(output);

          if (result.found) {
            const action = await vscode.window.showInformationMessage(
              `Found breaking change: ${result.checkpoint.description}`,
              'View Diff', 'Restore Before'
            );

            if (action === 'View Diff') {
              showDiffView(result.checkpoint.id);
            } else if (action === 'Restore Before') {
              execAitm(`restore ${result.previousCheckpoint.id}`);
              vscode.window.showInformationMessage('Restored to last good state');
              timelineProvider.refresh();
            }
          } else {
            vscode.window.showInformationMessage('Could not find breaking change');
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Bisect failed: ${error}`);
        }
      });
    })
  );

  // Export conversation
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.exportConversation', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      try {
        const output = execAitm('conversation --format markdown');

        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(`${workspaceRoot}/conversation-${Date.now()}.md`),
          filters: {
            'Markdown': ['md'],
            'JSON': ['json']
          }
        });

        if (uri) {
          fs.writeFileSync(uri.fsPath, output);
          vscode.window.showInformationMessage(`Conversation exported to ${uri.fsPath}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export: ${error}`);
      }
    })
  );

  // Run command with capture
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.runWithCapture', async () => {
      await terminalProvider.promptAndRun();
    })
  );

  // ========================================
  // KILOCODE-INSPIRED FEATURES
  // ========================================

  // Code Intelligence Provider
  const { CodeIntelligenceProvider, AitmHoverProvider } = require('./providers/CodeIntelligenceProvider');
  const codeIntelligence = new CodeIntelligenceProvider();

  // Register hover provider for function history
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'javascriptreact' },
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'go' },
        { scheme: 'file', language: 'rust' },
      ],
      new AitmHoverProvider()
    )
  );

  // Natural language search for checkpoints
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.smartSearch', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Search checkpoints with natural language',
        placeHolder: 'e.g., "when tests started failing" or "before auth changes"',
      });

      if (!query) return;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Searching...',
        },
        async () => {
          const results = await codeIntelligence.naturalLanguageSearch(query);

          if (results.length === 0) {
            vscode.window.showInformationMessage(`No results for: "${query}"`);
            return;
          }

          const items = results.map((r: any) => ({
            label: r.title,
            description: new Date(r.timestamp).toLocaleString(),
            detail: r.snippet || '',
            result: r,
          }));

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Found ${results.length} results`,
          });

          if (selected) {
            const action = await vscode.window.showQuickPick(
              [
                { label: 'Restore to this checkpoint', value: 'restore' },
                { label: 'View diff', value: 'diff' },
                { label: 'Show conversation', value: 'conversation' },
              ],
              { placeHolder: 'What would you like to do?' }
            );

            if (action?.value === 'restore') {
              vscode.commands.executeCommand('aitm.restore', new CheckpointItem(
                (selected as any).result.title,
                (selected as any).result.id,
                (selected as any).result.timestamp,
                { totalFiles: 0, totalSize: 0 }
              ));
            } else if (action?.value === 'diff') {
              showDiffView((selected as any).result.id);
            } else if (action?.value === 'conversation') {
              const conv = getConversation((selected as any).result.id);
              showConversationPanel(conv, context.extensionUri);
            }
          }
        }
      );
    })
  );

  // Show symbol/function history
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.showSymbolHistory', async (args?: { symbol: string; file: string }) => {
      let symbolName: string | undefined;
      let filePath: string | undefined;

      if (args?.symbol && args?.file) {
        symbolName = args.symbol;
        filePath = args.file;
      } else {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage('No active editor');
          return;
        }

        filePath = editor.document.uri.fsPath;
        const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
        symbolName = wordRange ? editor.document.getText(wordRange) : undefined;

        if (!symbolName) {
          symbolName = await vscode.window.showInputBox({
            prompt: 'Enter symbol name',
            placeHolder: 'e.g., handleSubmit, UserService',
          });
        }
      }

      if (!symbolName || !filePath) return;

      const history = await codeIntelligence.getSymbolHistory(filePath, symbolName);

      if (history.length === 0) {
        vscode.window.showInformationMessage(`No history found for: ${symbolName}`);
        return;
      }

      const items = history.map((h: any) => ({
        label: `${h.changeType === 'added' ? '+' : h.changeType === 'deleted' ? '-' : '~'} ${h.description}`,
        description: new Date(h.timestamp).toLocaleString(),
        detail: `Checkpoint: ${h.checkpointId}`,
        entry: h,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `History of ${symbolName} (${history.length} changes)`,
      });

      if (selected) {
        const action = await vscode.window.showQuickPick(
          [
            { label: 'View code at this checkpoint', value: 'view' },
            { label: 'Compare with current', value: 'compare' },
            { label: 'Restore this version', value: 'restore' },
          ],
          { placeHolder: 'What would you like to do?' }
        );

        const entry = (selected as any).entry;

        if (action?.value === 'view') {
          const code = await codeIntelligence.getCodeAtCheckpoint(entry.checkpointId, filePath);
          if (code) {
            const doc = await vscode.workspace.openTextDocument({
              content: code,
              language: path.extname(filePath).slice(1),
            });
            await vscode.window.showTextDocument(doc, { preview: true });
          }
        } else if (action?.value === 'compare') {
          vscode.commands.executeCommand('aitm.showFileDiff', entry.checkpointId, entry.filePath);
        } else if (action?.value === 'restore') {
          const confirm = await vscode.window.showWarningMessage(
            `Restore ${path.basename(filePath)} from this checkpoint?`,
            { modal: true },
            'Restore'
          );
          if (confirm) {
            execAitm(`restore-file ${entry.checkpointId} "${entry.filePath}"`);
            vscode.window.showInformationMessage('File restored');
          }
        }
      }
    })
  );

  // Smart checkpoint with suggested description
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.smartCheckpoint', async () => {
      const suggested = await codeIntelligence.suggestCheckpointDescription();

      const description = await vscode.window.showInputBox({
        prompt: 'Checkpoint description',
        value: suggested,
        placeHolder: 'Description of changes',
      });

      if (description) {
        try {
          execAitm(`checkpoint "${description}"`);
          vscode.window.showInformationMessage(`Checkpoint created: ${description}`);
          timelineProvider.refresh();
          updateAuthStatus();
        } catch (error) {
          vscode.window.showErrorMessage(`Failed: ${error}`);
        }
      }
    })
  );

  // Find when code broke
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.findWhenBroke', async () => {
      const options = [
        { label: 'Tests started failing', value: 'tests' },
        { label: 'Build started failing', value: 'build' },
        { label: 'Custom command', value: 'custom' },
      ];

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'What broke?',
      });

      if (!selected) return;

      let testCommand: string;
      if (selected.value === 'tests') {
        testCommand = 'npm test';
      } else if (selected.value === 'build') {
        testCommand = 'npm run build';
      } else {
        const custom = await vscode.window.showInputBox({
          prompt: 'Enter test command (returns 0 on success)',
          placeHolder: 'npm test',
        });
        if (!custom) return;
        testCommand = custom;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Finding breaking change...',
          cancellable: true,
        },
        async (progress, token) => {
          try {
            const output = execAitm(`bisect --test "${testCommand}" --json`);
            const result = JSON.parse(output);

            if (result.found) {
              const action = await vscode.window.showWarningMessage(
                `Found! Breaking change in: ${result.checkpoint?.description || result.checkpointId}`,
                'View Changes',
                'Restore Before',
                'Show Conversation'
              );

              if (action === 'View Changes') {
                showDiffView(result.checkpointId);
              } else if (action === 'Restore Before' && result.previousCheckpointId) {
                execAitm(`restore ${result.previousCheckpointId}`);
                vscode.window.showInformationMessage('Restored to last working state');
                timelineProvider.refresh();
              } else if (action === 'Show Conversation') {
                const conv = getConversation(result.checkpointId);
                showConversationPanel(conv, context.extensionUri);
              }
            } else {
              vscode.window.showInformationMessage('Could not find breaking change in history');
            }
          } catch (error) {
            vscode.window.showErrorMessage(`Bisect failed: ${error}`);
          }
        }
      );
    })
  );

  // Quick restore to last green
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.restoreLastGreen', async () => {
      try {
        const output = execAitm('search "green" --json');
        const checkpoints = JSON.parse(output);

        // Find checkpoints with "green", "passed", "success"
        const greenPatterns = /green|passed|success|working/i;
        const greenCheckpoints = checkpoints.filter((cp: any) =>
          greenPatterns.test(cp.description || cp.name || '')
        );

        if (greenCheckpoints.length === 0) {
          vscode.window.showInformationMessage(
            'No "green" checkpoints found. Tip: Name checkpoints like "Tests green" or "Build passed"'
          );
          return;
        }

        const latest = greenCheckpoints[0];
        const confirm = await vscode.window.showWarningMessage(
          `Restore to: ${latest.description || latest.name}?`,
          { modal: true },
          'Restore'
        );

        if (confirm) {
          execAitm(`restore ${latest.id || latest.checkpointId}`);
          vscode.window.showInformationMessage('Restored to last green state');
          timelineProvider.refresh();
          updateAuthStatus();
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed: ${error}`);
      }
    })
  );

  // Compare file across checkpoints
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.compareFileVersions', async (uri?: vscode.Uri) => {
      const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) {
        vscode.window.showErrorMessage('No file selected');
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const relativePath = path.relative(workspaceRoot, fileUri.fsPath);

      try {
        const output = execAitm(`file-history "${relativePath}" --json`);
        const history = JSON.parse(output);

        if (history.length < 2) {
          vscode.window.showInformationMessage('Need at least 2 versions to compare');
          return;
        }

        // Select "from" version
        const fromItems = history.map((h: any, i: number) => ({
          label: h.description,
          description: new Date(h.timestamp).toLocaleString(),
          index: i,
          checkpointId: h.checkpointId,
        }));

        const fromSelected = await vscode.window.showQuickPick(fromItems, {
          placeHolder: 'Select older version (FROM)',
        });

        if (!fromSelected) return;

        // Select "to" version
        const toItems = [
          { label: '(Current)', description: 'Working directory', checkpointId: null },
          ...fromItems.filter((item: any) => item.index < (fromSelected as any).index),
        ];

        const toSelected = await vscode.window.showQuickPick(toItems, {
          placeHolder: 'Select newer version (TO)',
        });

        if (!toSelected) return;

        // Show diff
        const fromId = (fromSelected as any).checkpointId;
        const toId = (toSelected as any).checkpointId;

        if (toId) {
          // Diff between two checkpoints
          const fromCode = await codeIntelligence.getCodeAtCheckpoint(fromId, fileUri.fsPath);
          const toCode = await codeIntelligence.getCodeAtCheckpoint(toId, fileUri.fsPath);

          if (fromCode && toCode) {
            const fromDoc = await vscode.workspace.openTextDocument({ content: fromCode });
            const toDoc = await vscode.workspace.openTextDocument({ content: toCode });

            await vscode.commands.executeCommand(
              'vscode.diff',
              fromDoc.uri,
              toDoc.uri,
              `${path.basename(fileUri.fsPath)} (${(fromSelected as any).label} vs ${(toSelected as any).label})`
            );
          }
        } else {
          // Diff with current
          vscode.commands.executeCommand('aitm.showFileDiff', fromId, relativePath);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed: ${error}`);
      }
    })
  );

  // Jump to checkpoint by time
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.jumpToTime', async () => {
      const options = [
        { label: '5 minutes ago', minutes: 5 },
        { label: '15 minutes ago', minutes: 15 },
        { label: '30 minutes ago', minutes: 30 },
        { label: '1 hour ago', minutes: 60 },
        { label: '2 hours ago', minutes: 120 },
        { label: 'Yesterday', minutes: 1440 },
        { label: 'Custom time...', minutes: -1 },
      ];

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Jump to a checkpoint from...',
      });

      if (!selected) return;

      let targetTime: Date;
      if (selected.minutes === -1) {
        const input = await vscode.window.showInputBox({
          prompt: 'Enter time (e.g., "2 hours ago", "yesterday")',
          placeHolder: '1 hour ago',
        });
        if (!input) return;
        // Simple parsing
        const match = input.match(/(\d+)\s*(minutes?|hours?|days?)/i);
        if (match) {
          const amount = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          targetTime = new Date();
          if (unit.startsWith('minute')) {
            targetTime.setMinutes(targetTime.getMinutes() - amount);
          } else if (unit.startsWith('hour')) {
            targetTime.setHours(targetTime.getHours() - amount);
          } else if (unit.startsWith('day')) {
            targetTime.setDate(targetTime.getDate() - amount);
          }
        } else {
          targetTime = new Date(Date.now() - 60 * 60 * 1000); // Default 1 hour
        }
      } else {
        targetTime = new Date(Date.now() - selected.minutes * 60 * 1000);
      }

      // Find checkpoint closest to target time
      const checkpoints = getCheckpoints();
      const targetTimestamp = targetTime.getTime();

      let closest: any = null;
      let closestDiff = Infinity;

      for (const cp of checkpoints) {
        const cpTime = new Date(cp.timestamp).getTime();
        const diff = Math.abs(cpTime - targetTimestamp);
        if (diff < closestDiff) {
          closestDiff = diff;
          closest = cp;
        }
      }

      if (!closest) {
        vscode.window.showInformationMessage('No checkpoints found');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Jump to: ${closest.description}\n(${new Date(closest.timestamp).toLocaleString()})`,
        { modal: true },
        'Restore',
        'Preview'
      );

      if (confirm === 'Restore') {
        execAitm(`restore ${closest.id}`);
        vscode.window.showInformationMessage('Restored');
        timelineProvider.refresh();
      } else if (confirm === 'Preview') {
        showPreview(closest.id);
      }
    })
  );

  // ========================================
  // AUTO FEATURES
  // ========================================

  // Auto-checkpoint on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const config = vscode.workspace.getConfiguration('aitm');
      if (config.get('checkpointOnSave', false)) {
        try {
          const relativePath = vscode.workspace.asRelativePath(document.uri);
          execAitm(`checkpoint "Auto-save: ${relativePath}"`);
          timelineProvider.refresh();
          changesProvider.refresh();
        } catch {
          // Ignore errors for auto-checkpoint
        }
      }
      // Always refresh decorations on save
      fileDecorationProvider.refresh();
      changesProvider.refresh();
    })
  );

  // Auto-checkpoint interval
  const autoCheckpointInterval = vscode.workspace.getConfiguration('aitm').get('checkpointInterval', 0);
  if (autoCheckpointInterval > 0) {
    setInterval(() => {
      try {
        execAitm('checkpoint "Auto-interval checkpoint"');
        timelineProvider.refresh();
      } catch {
        // Ignore
      }
    }, autoCheckpointInterval * 60 * 1000);
  }

  // Auto-refresh all providers every 30 seconds
  setInterval(() => {
    timelineProvider.refresh();
    changesProvider.refresh();
    fileDecorationProvider.refresh();
    codeLensProvider.refresh();
    updateStatusBar(statusBar);
  }, 30000);

  // Initial status update
  updateStatusBar(statusBar);

  // Show welcome message if first activation
  const hasShownWelcome = context.globalState.get('aitm.welcomeShown', false);
  if (!hasShownWelcome) {
    vscode.window.showInformationMessage(
      'AI Time Machine is ready! Create checkpoints to save your progress.',
      'Create Checkpoint', 'Open Timeline'
    ).then((action) => {
      if (action === 'Create Checkpoint') {
        vscode.commands.executeCommand('aitm.createCheckpoint');
      } else if (action === 'Open Timeline') {
        vscode.commands.executeCommand('aitm.showTimeline');
      }
    });
    context.globalState.update('aitm.welcomeShown', true);
  }
}

class TimelineProvider implements vscode.TreeDataProvider<CheckpointItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CheckpointItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: CheckpointItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CheckpointItem): Thenable<CheckpointItem[]> {
    if (element) {
      return Promise.resolve([]);
    }

    try {
      const checkpoints = getCheckpoints();
      
      return Promise.resolve(
        checkpoints.map(cp => new CheckpointItem(
          cp.description,
          cp.id,
          cp.timestamp,
          cp.stats,
          cp.metadata
        ))
      );
    } catch (error) {
      return Promise.resolve([]);
    }
  }
}

class CheckpointItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly id: string,
    public readonly timestamp: string,
    public readonly stats: any,
    public readonly metadata?: any
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    
    const date = new Date(timestamp);
    const timeAgo = getTimeAgo(date);
    
    this.tooltip = `${label}\n${date.toLocaleString()}\n${stats.totalFiles} files`;
    this.description = timeAgo;
    this.contextValue = 'checkpoint';
    
    // Icon based on type
    if (metadata?.status === 'before') {
      this.iconPath = new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.blue'));
    } else if (metadata?.status === 'after') {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    } else if (metadata?.status === 'failed') {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    } else {
      this.iconPath = new vscode.ThemeIcon('history');
    }
    
    this.command = {
      command: 'aitm.restore',
      title: 'Restore',
      arguments: [this]
    };
  }
}

function getCheckpoints(): Checkpoint[] {
  try {
    const output = execAitm('list --json');
    return JSON.parse(output);
  } catch {
    return [];
  }
}

let _resolvedCliBinary: string | null = null;

function resolveAitmBinary(): string {
  if (_resolvedCliBinary) {
    return _resolvedCliBinary;
  }

  // 1. Check VS Code setting
  const configPath = vscode.workspace.getConfiguration('aitm').get<string>('cliPath');
  if (configPath && fs.existsSync(configPath)) {
    _resolvedCliBinary = configPath;
    return _resolvedCliBinary;
  }

  // 2. Check if aitm is in PATH
  try {
    const which = execSync('which aitm 2>/dev/null || where aitm 2>nul', { encoding: 'utf-8' }).trim();
    if (which) {
      _resolvedCliBinary = 'aitm';
      return _resolvedCliBinary;
    }
  } catch { /* not in PATH */ }

  // 3. Check npm global prefix
  try {
    const npmPrefix = execSync('npm prefix -g', { encoding: 'utf-8' }).trim();
    const globalBin = path.join(npmPrefix, 'bin', 'aitm');
    if (fs.existsSync(globalBin)) {
      _resolvedCliBinary = globalBin;
      return _resolvedCliBinary;
    }
  } catch { /* npm not available */ }

  // 4. Check well-known install locations
  const homeDir = os.homedir();
  const candidates = [
    path.join(homeDir, '.npm-global', 'bin', 'aitm'),
    path.join(homeDir, '.nvm', 'versions', 'node', `v${process.versions.node}`, 'bin', 'aitm'),
    '/usr/local/bin/aitm',
    '/usr/bin/aitm',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      _resolvedCliBinary = candidate;
      return _resolvedCliBinary;
    }
  }

  // 5. Use npx as last resort (slower but always works if package is published)
  _resolvedCliBinary = 'npx --yes @gitgram/timemachine';
  return _resolvedCliBinary;
}

function execAitm(command: string): string {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    throw new Error('No workspace folder open');
  }

  const binary = resolveAitmBinary();
  return execSync(`${binary} ${command}`, {
    cwd: workspaceRoot,
    encoding: 'utf-8',
    timeout: 30000,
  });
}

function getRestoreContext(checkpointId: string): any {
  try {
    const output = execAitm(`conversation --checkpoint ${checkpointId} --format json`);
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function getConversation(checkpointId: string): any {
  try {
    const output = execAitm(`conversation --checkpoint ${checkpointId} --format json`);
    return JSON.parse(output);
  } catch {
    return { messages: [] };
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function updateStatusBar(statusBar: vscode.StatusBarItem) {
  try {
    const checkpoints = getCheckpoints();
    if (checkpoints.length > 0) {
      const latest = checkpoints[0];
      const ago = getTimeAgo(new Date(latest.timestamp));
      statusBar.text = `$(shield) AITM: ${ago}`;
      statusBar.tooltip = `Last checkpoint: ${latest.description}\n${ago}\nClick for actions`;
    } else {
      statusBar.text = '$(shield) AITM';
      statusBar.tooltip = 'No checkpoints yet. Click for actions';
    }
  } catch {
    statusBar.text = '$(shield) AITM';
  }
}

function showPreview(checkpointId: string) {
  try {
    const output = execAitm(`preview ${checkpointId}`);
    const panel = vscode.window.createWebviewPanel(
      'aitmPreview',
      'Restore Preview',
      vscode.ViewColumn.Two,
      {}
    );

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: var(--vscode-font-family); padding: 20px; }
          pre { background: var(--vscode-editor-background); padding: 10px; }
        </style>
      </head>
      <body>
        <h2>Restore Preview</h2>
        <pre>${output}</pre>
      </body>
      </html>
    `;
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to preview: ${error}`);
  }
}

function showDiffView(checkpointId: string) {
  try {
    const output = execAitm(`diff ${checkpointId}`);
    const panel = vscode.window.createWebviewPanel(
      'aitmDiff',
      'Checkpoint Diff',
      vscode.ViewColumn.Two,
      {}
    );

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: var(--vscode-font-family); padding: 20px; }
          .added { color: var(--vscode-gitDecoration-addedResourceForeground); }
          .modified { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
          .deleted { color: var(--vscode-gitDecoration-deletedResourceForeground); }
        </style>
      </head>
      <body>
        <h2>File Changes</h2>
        <pre>${output}</pre>
      </body>
      </html>
    `;
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to show diff: ${error}`);
  }
}

function showContextPanel(context: any, extensionUri: vscode.Uri) {
  const panel = vscode.window.createWebviewPanel(
    'aitmContext',
    'Restore Context',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  panel.webview.html = getContextHtml(context);
}

function showConversationPanel(conversation: any, extensionUri: vscode.Uri) {
  const panel = vscode.window.createWebviewPanel(
    'aitmConversation',
    'Conversation History',
    vscode.ViewColumn.Two,
    { enableScripts: true }
  );

  panel.webview.html = getConversationHtml(conversation);
}

function getContextHtml(context: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          font-family: var(--vscode-font-family); 
          padding: 20px;
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
        }
        h2 { color: var(--vscode-foreground); margin-top: 0; }
        .section { margin: 20px 0; padding: 15px; background: var(--vscode-editor-background); border-radius: 5px; }
        .message { 
          margin: 10px 0; 
          padding: 10px; 
          background: var(--vscode-input-background);
          border-radius: 3px;
        }
        .user { border-left: 3px solid var(--vscode-charts-green); }
        .assistant { border-left: 3px solid var(--vscode-charts-blue); }
        .file-list { list-style: none; padding: 0; }
        .file-list li { padding: 5px 0; }
        .added { color: var(--vscode-gitDecoration-addedResourceForeground); }
        .modified { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
        .deleted { color: var(--vscode-gitDecoration-deletedResourceForeground); }
      </style>
    </head>
    <body>
      <h2>📍 Restore Context</h2>
      
      <div class="section">
        <h3>Recent Conversation</h3>
        ${context.messages?.map((m: any) => `
          <div class="message ${m.role}">
            <strong>${m.role === 'user' ? '👤 User' : '🤖 Assistant'}</strong>
            <p>${escapeHtml(m.content)}</p>
          </div>
        `).join('') || '<p>No messages</p>'}
      </div>
      
      <div class="section">
        <h3>Files Changed</h3>
        <ul class="file-list">
          ${context.filesChanged?.map((f: string) => `<li class="modified">~ ${escapeHtml(f)}</li>`).join('') || '<li>None</li>'}
        </ul>
      </div>

      ${context.goal ? `
      <div class="section">
        <h3>Goal</h3>
        <p>${escapeHtml(context.goal)}</p>
      </div>
      ` : ''}
    </body>
    </html>
  `;
}

function getConversationHtml(conversation: any): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { 
          font-family: var(--vscode-font-family); 
          padding: 20px;
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
        }
        h2 { margin-top: 0; }
        .message { 
          margin: 15px 0; 
          padding: 12px; 
          background: var(--vscode-input-background);
          border-radius: 3px;
        }
        .user { border-left: 3px solid var(--vscode-charts-green); }
        .assistant { border-left: 3px solid var(--vscode-charts-blue); }
        .timestamp { 
          color: var(--vscode-descriptionForeground); 
          font-size: 0.9em; 
          margin-left: 10px;
        }
        .content { margin-top: 8px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <h2>💬 Conversation History</h2>
      ${conversation.messages?.map((m: any) => `
        <div class="message ${m.role}">
          <strong>${m.role === 'user' ? '👤 User' : '🤖 Assistant'}</strong>
          <span class="timestamp">${new Date(m.timestamp).toLocaleString()}</span>
          <div class="content">${escapeHtml(m.content)}</div>
        </div>
      `).join('') || '<p>No messages</p>'}
    </body>
    </html>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showTimelinePanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'aitmTimeline',
    'AI Time Machine',
    vscode.ViewColumn.Two,
    { 
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist')]
    }
  );

  // Try to use React webview, fallback to inline HTML
  const webviewDistPath = path.join(context.extensionPath, 'webview-ui', 'dist');
  const useReactWebview = fs.existsSync(path.join(webviewDistPath, 'main.js'));

  if (useReactWebview) {
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist', 'main.js'));
    const styleUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist', 'index.css'));
    
    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>AI Time Machine</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  } else {
    panel.webview.html = getTimelineHtml();
  }

  // Send checkpoints to webview
  const sendCheckpoints = () => {
    const checkpoints = getCheckpoints();
    panel.webview.postMessage({ type: 'checkpoints', data: checkpoints });
    // Also send auth status
    const auth = getAuthStatus();
    panel.webview.postMessage({ type: 'authStatus', data: auth });
  };

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.type) {
      case 'ready':
        sendCheckpoints();
        break;
      case 'login':
        vscode.commands.executeCommand('aitm.login');
        break;
      case 'createCheckpoint':
        const desc = await vscode.window.showInputBox({ prompt: 'Checkpoint description' });
        if (desc) {
          execAitm(`checkpoint "${desc}"`);
          sendCheckpoints();
          vscode.window.showInformationMessage(`✓ Checkpoint: ${desc}`);
        }
        break;
      case 'restore':
      case 'aitmRestore': {
        const cpId = msg.id || msg.checkpointId;
        const confirm = await vscode.window.showWarningMessage(
          'Restore to this checkpoint?', { modal: true }, 'Restore'
        );
        if (confirm) {
          execAitm(`restore ${cpId}`);
          sendCheckpoints();
          vscode.window.showInformationMessage('✓ Restored');
        }
        break;
      }
      case 'preview': {
        showPreview(msg.id);
        break;
      }
      case 'diff':
      case 'aitmDiff': {
        const fromId = msg.fromId;
        const toId = msg.toId === 'current' ? '' : msg.toId;
        try {
          const cmd = toId ? `diff ${fromId} ${toId} --json` : `diff ${fromId} --json`;
          const output = execAitm(cmd);
          panel.webview.postMessage({ type: 'diff', data: JSON.parse(output) });
        } catch {
          panel.webview.postMessage({ type: 'diff', data: {} });
        }
        break;
      }
      case 'fileDiff': {
        vscode.commands.executeCommand('aitm.showFileDiff', msg.checkpointId, msg.filePath);
        break;
      }
      case 'undo': {
        vscode.commands.executeCommand('aitm.undo');
        break;
      }
      case 'conversation':
        const conv = getConversation(msg.id);
        showConversationPanel(conv, context.extensionUri);
        break;
    }
  });

  // Refresh every 30s
  const interval = setInterval(sendCheckpoints, 30000);
  panel.onDidDispose(() => clearInterval(interval));
}

function getTimelineHtml(): string {
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
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-button-background);
      --hover: var(--vscode-list-hoverBackground);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); background: var(--bg); color: var(--fg); padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
    .header h1 { font-size: 16px; font-weight: 600; }
    .btn { background: var(--accent); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .btn:hover { opacity: 0.9; }
    .timeline { display: flex; flex-direction: column; gap: 12px; }
    .checkpoint { background: var(--vscode-list-inactiveSelectionBackground); border-radius: 8px; padding: 14px; cursor: pointer; border-left: 4px solid transparent; transition: all 0.15s; }
    .checkpoint:hover { background: var(--hover); transform: translateX(2px); }
    .checkpoint.before { border-left-color: #3b82f6; }
    .checkpoint.after { border-left-color: #22c55e; }
    .checkpoint.failed { border-left-color: #ef4444; }
    .checkpoint-header { display: flex; justify-content: space-between; align-items: start; }
    .checkpoint-title { font-weight: 500; font-size: 13px; line-height: 1.4; }
    .checkpoint-time { font-size: 11px; opacity: 0.7; white-space: nowrap; margin-left: 12px; }
    .checkpoint-meta { font-size: 11px; opacity: 0.6; margin-top: 6px; }
    .checkpoint-actions { display: flex; gap: 8px; margin-top: 10px; }
    .checkpoint-actions button { font-size: 11px; padding: 5px 10px; background: transparent; border: 1px solid var(--border); color: var(--fg); border-radius: 4px; cursor: pointer; transition: all 0.15s; }
    .checkpoint-actions button:hover { background: var(--accent); color: white; border-color: var(--accent); }
    .empty { text-align: center; padding: 60px 20px; opacity: 0.6; }
    .empty-icon { font-size: 48px; margin-bottom: 16px; }
    .diff-panel { margin-top: 20px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .diff-header { padding: 10px 14px; border-bottom: 1px solid var(--border); font-weight: 500; font-size: 13px; background: var(--vscode-list-inactiveSelectionBackground); display: flex; justify-content: space-between; }
    .diff-close { cursor: pointer; opacity: 0.7; }
    .diff-close:hover { opacity: 1; }
    .diff-content { padding: 14px; font-family: var(--vscode-editor-font-family); font-size: 12px; max-height: 300px; overflow: auto; }
    .diff-add { color: #22c55e; }
    .diff-del { color: #ef4444; }
    .diff-mod { color: #f59e0b; }
    .diff-file { opacity: 0.7; margin: 12px 0 6px; font-weight: 500; }
    .diff-file:first-child { margin-top: 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🕐 AI Time Machine</h1>
    <button class="btn" onclick="createCheckpoint()">+ New Checkpoint</button>
  </div>
  
  <div id="timeline" class="timeline">
    <div class="empty">
      <div class="empty-icon">⏳</div>
      Loading checkpoints...
    </div>
  </div>
  
  <div id="diff-panel" class="diff-panel" style="display: none;">
    <div class="diff-header">
      <span>📊 Changes</span>
      <span class="diff-close" onclick="closeDiff()">✕</span>
    </div>
    <div id="diff-content" class="diff-content"></div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let checkpoints = [];

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'checkpoints') {
        checkpoints = msg.data;
        renderTimeline();
      } else if (msg.type === 'diff') {
        showDiff(msg.data);
      }
    });

    function renderTimeline() {
      const el = document.getElementById('timeline');
      if (!checkpoints.length) {
        el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>No checkpoints yet.<br><br>Click "+ New Checkpoint" to start tracking!</div>';
        return;
      }
      
      el.innerHTML = checkpoints.map((cp, i) => {
        const status = cp.metadata?.status || '';
        const statusClass = status === 'before' ? 'before' : status.includes('after') ? 'after' : status === 'failed' ? 'failed' : '';
        const time = timeAgo(new Date(cp.timestamp));
        const icon = status === 'before' ? '🔵' : status.includes('after') ? '✅' : status === 'failed' ? '❌' : '📍';
        
        return \`
          <div class="checkpoint \${statusClass}" data-id="\${cp.id}">
            <div class="checkpoint-header">
              <div class="checkpoint-title">\${icon} \${escapeHtml(cp.description)}</div>
              <div class="checkpoint-time">\${time}</div>
            </div>
            <div class="checkpoint-meta">\${cp.stats.totalFiles.toLocaleString()} files · \${formatSize(cp.stats.totalSize)}</div>
            <div class="checkpoint-actions">
              <button onclick="restore('\${cp.id}')">↩ Restore</button>
              <button onclick="showDiffFor('\${cp.id}', '\${checkpoints[i+1]?.id || ''}')" \${!checkpoints[i+1] ? 'disabled style="opacity:0.5"' : ''}>⇄ Diff</button>
              <button onclick="showConversation('\${cp.id}')">💬 Chat</button>
            </div>
          </div>
        \`;
      }).join('');
    }

    function createCheckpoint() { vscode.postMessage({ type: 'createCheckpoint' }); }
    function restore(id) { vscode.postMessage({ type: 'restore', id }); }
    function showDiffFor(toId, fromId) { if (fromId) vscode.postMessage({ type: 'diff', fromId, toId }); }
    function showConversation(id) { vscode.postMessage({ type: 'conversation', id }); }
    function closeDiff() { document.getElementById('diff-panel').style.display = 'none'; }

    function showDiff(data) {
      const panel = document.getElementById('diff-panel');
      const content = document.getElementById('diff-content');
      
      let html = '';
      if (data.added?.length) {
        html += '<div class="diff-file">✅ Added (' + data.added.length + ')</div>';
        html += data.added.slice(0,10).map(f => '<div class="diff-add">+ ' + f + '</div>').join('');
        if (data.added.length > 10) html += '<div class="diff-add">... and ' + (data.added.length - 10) + ' more</div>';
      }
      if (data.modified?.length) {
        html += '<div class="diff-file">✏️ Modified (' + data.modified.length + ')</div>';
        html += data.modified.slice(0,10).map(f => '<div class="diff-mod">~ ' + f + '</div>').join('');
        if (data.modified.length > 10) html += '<div class="diff-mod">... and ' + (data.modified.length - 10) + ' more</div>';
      }
      if (data.deleted?.length) {
        html += '<div class="diff-file">🗑️ Deleted (' + data.deleted.length + ')</div>';
        html += data.deleted.slice(0,10).map(f => '<div class="diff-del">- ' + f + '</div>').join('');
        if (data.deleted.length > 10) html += '<div class="diff-del">... and ' + (data.deleted.length - 10) + ' more</div>';
      }
      
      content.innerHTML = html || '<div style="opacity:0.6">No changes between these checkpoints</div>';
      panel.style.display = 'block';
    }

    function timeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      return Math.floor(seconds / 86400) + 'd ago';
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function escapeHtml(str) {
      return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

export function deactivate() {}
