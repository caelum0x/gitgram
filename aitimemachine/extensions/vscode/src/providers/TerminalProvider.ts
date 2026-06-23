import * as vscode from 'vscode';
import { execSync, spawn } from 'child_process';

interface TerminalSession {
  terminal: vscode.Terminal;
  pid?: number;
  startTime: Date;
  commands: string[];
}

export class AitmTerminalProvider {
  private static instance: AitmTerminalProvider;
  private _sessions = new Map<string, TerminalSession>();
  private _outputChannel: vscode.OutputChannel;
  private _statusBarItem: vscode.StatusBarItem;

  constructor() {
    AitmTerminalProvider.instance = this;
    this._outputChannel = vscode.window.createOutputChannel('AI Time Machine Terminal');
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this._statusBarItem.text = '$(terminal) AITM';
    this._statusBarItem.tooltip = 'AI Time Machine - Terminal capture active';

    // Track terminal creation
    vscode.window.onDidOpenTerminal((terminal) => {
      this._trackTerminal(terminal);
    });

    // Track terminal close
    vscode.window.onDidCloseTerminal((terminal) => {
      const sessionId = this._getSessionId(terminal);
      if (sessionId) {
        this._sessions.delete(sessionId);
      }
    });

    // Track existing terminals
    vscode.window.terminals.forEach((terminal) => {
      this._trackTerminal(terminal);
    });
  }

  public static getInstance(): AitmTerminalProvider {
    return AitmTerminalProvider.instance;
  }

  private _getSessionId(terminal: vscode.Terminal): string {
    return `terminal_${terminal.name}_${terminal.processId}`;
  }

  private async _trackTerminal(terminal: vscode.Terminal) {
    const config = vscode.workspace.getConfiguration('aitm');
    if (!config.get('terminalCapture', true)) {
      return;
    }

    const pid = await terminal.processId;
    const sessionId = this._getSessionId(terminal);

    this._sessions.set(sessionId, {
      terminal,
      pid: pid ?? undefined,
      startTime: new Date(),
      commands: []
    });

    this._statusBarItem.show();
    this._outputChannel.appendLine(`[AITM] Tracking terminal: ${terminal.name} (PID: ${pid})`);
  }

  // Run command with capture and auto-checkpoint
  public async runWithCapture(command: string, options?: { autoCheckpoint?: boolean; checkpointOnSuccess?: boolean }) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const opts = {
      autoCheckpoint: true,
      checkpointOnSuccess: true,
      ...options
    };

    this._outputChannel.appendLine(`[AITM] Running: ${command}`);
    this._outputChannel.show();

    // Create checkpoint before running
    if (opts.autoCheckpoint) {
      try {
        execSync(`aitm checkpoint "Before: ${command}"`, {
          cwd: workspaceRoot,
          encoding: 'utf-8'
        });
        this._outputChannel.appendLine(`[AITM] Created pre-command checkpoint`);
      } catch (error) {
        this._outputChannel.appendLine(`[AITM] Warning: Could not create checkpoint`);
      }
    }

    // Run the command
    return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
      let stdout = '';
      let stderr = '';

      const child = spawn('sh', ['-c', command], {
        cwd: workspaceRoot,
        env: process.env
      });

      child.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        this._outputChannel.append(str);
      });

      child.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        this._outputChannel.append(str);
      });

      child.on('close', async (code) => {
        const exitCode = code ?? 1;
        this._outputChannel.appendLine(`\n[AITM] Command finished with exit code: ${exitCode}`);

        // Log to AITM
        try {
          const logCmd = `aitm log-command "${command.replace(/"/g, '\\"')}" --exit-code ${exitCode}`;
          execSync(logCmd, { cwd: workspaceRoot, encoding: 'utf-8' });
        } catch {
          // Ignore logging errors
        }

        // Create checkpoint on success
        if (opts.checkpointOnSuccess && exitCode === 0) {
          try {
            // Detect test/build success patterns
            let checkpointName = `After: ${command}`;
            if (/\b(test|spec|jest|mocha|vitest)\b/i.test(command)) {
              checkpointName = 'Tests green';
            } else if (/\b(build|compile|tsc|webpack|vite)\b/i.test(command)) {
              checkpointName = 'Build green';
            }

            execSync(`aitm checkpoint "${checkpointName}"`, {
              cwd: workspaceRoot,
              encoding: 'utf-8'
            });
            this._outputChannel.appendLine(`[AITM] Created success checkpoint: ${checkpointName}`);
            vscode.window.showInformationMessage(`Checkpoint created: ${checkpointName}`);
          } catch {
            // Ignore
          }
        }

        resolve({ exitCode, stdout, stderr });
      });
    });
  }

  // Prompt user for command and run with capture
  public async promptAndRun() {
    const command = await vscode.window.showInputBox({
      prompt: 'Enter command to run with capture',
      placeHolder: 'npm test',
      ignoreFocusOut: true
    });

    if (command) {
      await this.runWithCapture(command);
    }
  }

  // Create a new terminal with AITM integration
  public createTrackedTerminal(name?: string): vscode.Terminal {
    const terminal = vscode.window.createTerminal({
      name: name || 'AITM Terminal',
      env: {
        ...process.env,
        AITM_TERMINAL: '1'
      }
    });

    terminal.show();

    // Send welcome message
    terminal.sendText('# AI Time Machine terminal - commands are being tracked');
    terminal.sendText('# Use "aitm run <command>" for auto-checkpointing');
    terminal.sendText('');

    return terminal;
  }

  public dispose() {
    this._outputChannel.dispose();
    this._statusBarItem.dispose();
  }
}

// Pending changes tree provider
export class ChangesTreeProvider implements vscode.TreeDataProvider<ChangeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChangeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor() {
    // Refresh on file save
    vscode.workspace.onDidSaveTextDocument(() => {
      this.refresh();
    });

    // Refresh on file create/delete
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidCreate(() => this.refresh());
    watcher.onDidDelete(() => this.refresh());
  }

  public refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ChangeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<ChangeItem[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];

    try {
      const output = execSync('aitm diff --json 2>/dev/null || echo "{}"', {
        cwd: workspaceRoot,
        encoding: 'utf-8'
      });

      const diff = JSON.parse(output);
      const items: ChangeItem[] = [];

      if (diff.added) {
        for (const file of diff.added) {
          items.push(new ChangeItem(file, 'added', workspaceRoot));
        }
      }

      if (diff.modified) {
        for (const file of diff.modified) {
          items.push(new ChangeItem(file, 'modified', workspaceRoot));
        }
      }

      if (diff.deleted) {
        for (const file of diff.deleted) {
          items.push(new ChangeItem(file, 'deleted', workspaceRoot));
        }
      }

      return items;
    } catch {
      return [];
    }
  }
}

class ChangeItem extends vscode.TreeItem {
  constructor(
    public readonly filePath: string,
    public readonly changeType: 'added' | 'modified' | 'deleted',
    public readonly workspaceRoot: string
  ) {
    super(filePath, vscode.TreeItemCollapsibleState.None);

    this.tooltip = `${changeType}: ${filePath}`;
    this.description = changeType;

    // Set icon based on change type
    switch (changeType) {
      case 'added':
        this.iconPath = new vscode.ThemeIcon('add', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
        break;
      case 'modified':
        this.iconPath = new vscode.ThemeIcon('edit', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
        break;
      case 'deleted':
        this.iconPath = new vscode.ThemeIcon('trash', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
        break;
    }

    // Click to open file
    if (changeType !== 'deleted') {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(`${workspaceRoot}/${filePath}`)]
      };
    }

    this.contextValue = `change_${changeType}`;
  }
}
