import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

export class AitmFileDecorationProvider implements vscode.FileDecorationProvider {
  private static instance: AitmFileDecorationProvider;
  private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private _changedFiles: Map<string, FileChange> = new Map();
  private _trackedFiles: Set<string> = new Set();
  private _lastCheckpointTime: Date | null = null;

  constructor() {
    AitmFileDecorationProvider.instance = this;
    this._updateTrackedFiles();

    // Watch for file changes
    vscode.workspace.onDidSaveTextDocument(() => {
      this._updateTrackedFiles();
    });
  }

  public static getInstance(): AitmFileDecorationProvider {
    return AitmFileDecorationProvider.instance;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return undefined;

    const relativePath = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/');

    // Check if file has changed since last checkpoint
    const change = this._changedFiles.get(relativePath);
    if (change) {
      switch (change.status) {
        case 'added':
          return {
            badge: '+',
            color: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
            tooltip: 'Added since last checkpoint'
          };
        case 'modified':
          return {
            badge: '~',
            color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
            tooltip: 'Modified since last checkpoint'
          };
        case 'deleted':
          return {
            badge: '-',
            color: new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
            tooltip: 'Deleted since last checkpoint'
          };
      }
    }

    // Show if file is tracked by AITimeMachine
    if (this._trackedFiles.has(relativePath)) {
      return {
        badge: '✓',
        color: new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'),
        tooltip: 'Tracked by AI Time Machine'
      };
    }

    return undefined;
  }

  private _updateTrackedFiles() {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      // Get diff from last checkpoint
      const output = execSync('aitm diff --json 2>/dev/null || echo "[]"', {
        cwd: workspaceRoot,
        encoding: 'utf-8'
      });

      this._changedFiles.clear();

      try {
        const diff = JSON.parse(output);

        if (diff.added) {
          for (const file of diff.added) {
            this._changedFiles.set(file, { path: file, status: 'added' });
          }
        }

        if (diff.modified) {
          for (const file of diff.modified) {
            this._changedFiles.set(file, { path: file, status: 'modified' });
          }
        }

        if (diff.deleted) {
          for (const file of diff.deleted) {
            this._changedFiles.set(file, { path: file, status: 'deleted' });
          }
        }
      } catch {
        // Ignore parse errors
      }

      // Trigger decoration update
      this._onDidChangeFileDecorations.fire(undefined);
    } catch {
      // Ignore errors
    }
  }

  public refresh() {
    this._updateTrackedFiles();
  }
}
