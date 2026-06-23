import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Checkpoint {
  id: string;
  description: string;
  timestamp: string;
}

class TimelineProvider implements vscode.TreeDataProvider<CheckpointItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CheckpointItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  async getChildren(): Promise<CheckpointItem[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];
    
    try {
      const { stdout } = await execAsync('node lib/cli-v2.js list --json', {
        cwd: workspaceRoot
      });
      const checkpoints: Checkpoint[] = JSON.parse(stdout.trim());
      return checkpoints.map(cp => new CheckpointItem(cp));
    } catch (error) {
      console.error('Failed to load checkpoints:', error);
      return [];
    }
  }

  getTreeItem(element: CheckpointItem): vscode.TreeItem {
    return element;
  }
}

class CheckpointItem extends vscode.TreeItem {
  constructor(public checkpoint: Checkpoint) {
    super(checkpoint.description, vscode.TreeItemCollapsibleState.None);
    this.tooltip = new Date(checkpoint.timestamp).toLocaleString();
    this.description = new Date(checkpoint.timestamp).toLocaleString();
    this.contextValue = 'checkpoint';
    this.iconPath = new vscode.ThemeIcon('bookmark');
  }
}

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage('AI Time Machine: No workspace folder open');
    return;
  }

  const provider = new TimelineProvider();
  vscode.window.registerTreeDataProvider('aitm.timelineView', provider);

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.createCheckpoint', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;
      
      const desc = await vscode.window.showInputBox({ 
        prompt: 'Checkpoint description',
        placeHolder: 'e.g., Before refactoring user store'
      });
      if (!desc) return;
      
      try {
        await execAsync(`node lib/cli-v2.js checkpoint "${desc}"`, { cwd: workspaceRoot });
        vscode.window.showInformationMessage(`Checkpoint created: ${desc}`);
        provider.refresh();
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to create checkpoint: ${e.message}`);
      }
    }),

    vscode.commands.registerCommand('aitm.restore', async (item: CheckpointItem) => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;
      
      const confirm = await vscode.window.showWarningMessage(
        `Restore to "${item.checkpoint.description}"?\n\nThis will replace current files with checkpoint state.`,
        { modal: true },
        'Restore', 'Cancel'
      );
      if (confirm !== 'Restore') return;
      
      try {
        await execAsync(`node lib/cli-v2.js restore ${item.checkpoint.id}`, { cwd: workspaceRoot });
        vscode.window.showInformationMessage(`Restored to: ${item.checkpoint.description}`);
        provider.refresh();
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to restore: ${e.message}`);
      }
    }),

    vscode.commands.registerCommand('aitm.showDiff', async (item: CheckpointItem) => {
      try {
        const { stdout } = await execAsync(`node lib/cli-v2.js diff ${item.checkpoint.id}`, {
          cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath
        });
        const doc = await vscode.workspace.openTextDocument({ content: stdout, language: 'diff' });
        await vscode.window.showTextDocument(doc);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed: ${e.message}`);
      }
    }),

    vscode.commands.registerCommand('aitm.showTimeline', () => {
      vscode.commands.executeCommand('aitm.timelineView.focus');
    }),

    vscode.commands.registerCommand('aitm.goBack', async () => {
      const query = await vscode.window.showInputBox({ prompt: 'Go back to (description or time)' });
      if (!query) return;
      try {
        await execAsync(`node lib/cli-v2.js back "${query}"`, {
          cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath
        });
        vscode.window.showInformationMessage('Restored successfully');
        provider.refresh();
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed: ${e.message}`);
      }
    }),

    vscode.commands.registerCommand('aitm.refresh', () => provider.refresh()),

    vscode.commands.registerCommand('aitm.showConversation', async (item: CheckpointItem) => {
      try {
        const { stdout } = await execAsync(`node lib/cli-v2.js show ${item.checkpoint.id}`, {
          cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath
        });
        const doc = await vscode.workspace.openTextDocument({ content: stdout, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed: ${e.message}`);
      }
    })
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBar.text = '$(history) Time Machine';
  statusBar.command = 'aitm.showTimeline';
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate() {}
