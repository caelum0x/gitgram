import * as vscode from 'vscode';
import { execSync } from 'child_process';

interface TimelineCheckpoint {
  id: string;
  name: string;
  description?: string;
  timestamp: string;
  type: 'auto' | 'manual' | 'before' | 'after';
  stats: {
    totalFiles: number;
    totalSize: number;
    filesChanged?: number;
    filesAdded?: number;
    filesDeleted?: number;
  };
  parentId?: string;
  chatMessages?: number;
  terminalCommands?: number;
  testResult?: 'passed' | 'failed' | 'unknown';
  branch?: string;
  tags?: string[];
}

interface TimelineNode {
  checkpoint: TimelineCheckpoint;
  x: number;
  y: number;
  branch: number;
  connections: string[]; // IDs of connected checkpoints
  lane: number; // For multi-branch visualization
}

interface DiffSummary {
  added: string[];
  modified: string[];
  deleted: string[];
  totalChanges: number;
}

interface HoverPreview {
  checkpointId: string;
  files: { path: string; status: 'added' | 'modified' | 'deleted'; preview?: string }[];
  summary: string;
}

export class TimelineGraphProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aitm.timelineGraph';

  private _view?: vscode.WebviewView;
  private _panel?: vscode.WebviewPanel;
  private _checkpoints: TimelineCheckpoint[] = [];
  private _selectedCheckpoint: string | null = null;
  private _compareCheckpoint: string | null = null;
  private _dragStartCheckpoint: string | null = null;
  private _diffCache: Map<string, DiffSummary> = new Map();
  private _hoverCache: Map<string, HoverPreview> = new Map();
  private _branches: Map<string, number> = new Map();

  constructor(private readonly _extensionUri: vscode.Uri) {}

  // Open as a full panel (for better visualization)
  public openFullPanel() {
    if (this._panel) {
      this._panel.reveal();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'aitm.timelineGraphPanel',
      'AI Time Machine - Timeline',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this._extensionUri]
      }
    );

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, true);
    this._setupMessageHandlers(this._panel.webview);

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });

    // Initial refresh
    setTimeout(() => this._refreshCheckpoints(), 100);
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

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, false);
    this._setupMessageHandlers(webviewView.webview);

    // Refresh on file save
    vscode.workspace.onDidSaveTextDocument(() => {
      this._refreshCheckpoints();
    });
  }

  private _setupMessageHandlers(webview: vscode.Webview) {
    webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'ready':
          this._refreshCheckpoints();
          break;
        case 'selectCheckpoint':
          this._selectedCheckpoint = data.id;
          await this._showCheckpointDetails(data.id);
          break;
        case 'restore':
          await this._restoreCheckpoint(data.id);
          break;
        case 'compare':
          this._compareCheckpoint = data.id;
          this._sendState();
          break;
        case 'showDiff':
          await this._showDiff(data.fromId, data.toId);
          break;
        case 'createCheckpoint':
          await this._createManualCheckpoint();
          break;
        case 'search':
          await this._searchCheckpoints(data.query);
          break;
        case 'filter':
          this._filterCheckpoints(data.filter);
          break;
        case 'jumpToTime':
          await this._jumpToTime(data.query);
          break;
        case 'hover':
          await this._handleHover(data.id);
          break;
        case 'hoverEnd':
          // Clear hover state if needed
          break;
        case 'dragStart':
          this._dragStartCheckpoint = data.id;
          break;
        case 'dragEnd':
          if (this._dragStartCheckpoint && data.id && this._dragStartCheckpoint !== data.id) {
            await this._showDiff(this._dragStartCheckpoint, data.id);
          }
          this._dragStartCheckpoint = null;
          break;
        case 'previewFiles':
          await this._getFilePreview(data.checkpointId, data.filePath);
          break;
        case 'openInFullPanel':
          this.openFullPanel();
          break;
        case 'restoreFile':
          await this._restoreSingleFile(data.checkpointId, data.filePath);
          break;
        case 'viewFileAtCheckpoint':
          await this._viewFileAtCheckpoint(data.checkpointId, data.filePath);
          break;
      }
    });
  }

  private _refreshCheckpoints() {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const output = execSync('aitm list --json --limit 100 2>/dev/null || echo "[]"', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });

      const raw = JSON.parse(output);
      this._checkpoints = raw.map((cp: any, index: number) => ({
        id: cp.id || cp.checkpointId,
        name: cp.name || cp.description || 'Checkpoint',
        description: cp.description,
        timestamp: cp.timestamp || cp.createdAt,
        type: this._inferType(cp.name || ''),
        stats: cp.stats || { totalFiles: 0, totalSize: 0 },
        parentId: cp.parentId || (index > 0 ? raw[index - 1]?.id : undefined),
        chatMessages: cp.chatMessages,
        terminalCommands: cp.terminalCommands,
        testResult: this._inferTestResult(cp.name || ''),
        branch: cp.branch || 'main',
        tags: cp.tags || []
      }));

      // Build branch mapping for visualization
      this._buildBranchMap();

      // Pre-fetch diff summaries for recent checkpoints
      this._prefetchDiffs();

      this._sendState();
    } catch {
      this._checkpoints = [];
      this._sendState();
    }
  }

  private _buildBranchMap() {
    this._branches.clear();
    let laneIndex = 0;

    for (const cp of this._checkpoints) {
      const branch = cp.branch || 'main';
      if (!this._branches.has(branch)) {
        this._branches.set(branch, laneIndex++);
      }
    }
  }

  private async _prefetchDiffs() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    // Only prefetch for last 10 checkpoints
    const recentCheckpoints = this._checkpoints.slice(0, 10);

    for (let i = 0; i < recentCheckpoints.length - 1; i++) {
      const fromId = recentCheckpoints[i + 1].id;
      const toId = recentCheckpoints[i].id;
      const cacheKey = `${fromId}:${toId}`;

      if (!this._diffCache.has(cacheKey)) {
        try {
          const diffOutput = execSync(
            `aitm diff ${fromId} ${toId} --json 2>/dev/null || echo "{}"`,
            { cwd: workspaceRoot, encoding: 'utf-8', timeout: 5000 }
          );
          const diff = JSON.parse(diffOutput);
          this._diffCache.set(cacheKey, {
            added: diff.added || [],
            modified: diff.modified || [],
            deleted: diff.deleted || [],
            totalChanges: (diff.added?.length || 0) + (diff.modified?.length || 0) + (diff.deleted?.length || 0)
          });
        } catch {
          // Ignore prefetch errors
        }
      }
    }
  }

  private _inferType(name: string): TimelineCheckpoint['type'] {
    const lower = name.toLowerCase();
    if (lower.includes('before:') || lower.includes('before ')) return 'before';
    if (lower.includes('after:') || lower.includes('after ')) return 'after';
    if (lower.includes('auto') || lower.includes('automatic')) return 'auto';
    return 'manual';
  }

  private _inferTestResult(name: string): TimelineCheckpoint['testResult'] {
    const lower = name.toLowerCase();
    if (/tests?\s*(passed|green|passing)/i.test(lower)) return 'passed';
    if (/tests?\s*(failed|red|failing)/i.test(lower)) return 'failed';
    return 'unknown';
  }

  private _sendState() {
    const webview = this._view?.webview || this._panel?.webview;
    if (webview) {
      const nodes = this._buildTimelineNodes();
      webview.postMessage({
        type: 'state',
        nodes,
        checkpoints: this._checkpoints,
        selectedCheckpoint: this._selectedCheckpoint,
        compareCheckpoint: this._compareCheckpoint,
        branches: Array.from(this._branches.keys()),
        diffCache: Object.fromEntries(this._diffCache)
      });
    }
  }

  private _buildTimelineNodes(): TimelineNode[] {
    const nodes: TimelineNode[] = [];
    let y = 0;

    for (const cp of this._checkpoints) {
      const branch = cp.branch || 'main';
      const lane = this._branches.get(branch) || 0;

      nodes.push({
        checkpoint: cp,
        x: lane * 30, // 30px per lane
        y: y++,
        branch: lane,
        connections: cp.parentId ? [cp.parentId] : [],
        lane
      });
    }

    return nodes;
  }

  private async _handleHover(checkpointId: string) {
    const webview = this._view?.webview || this._panel?.webview;
    if (!webview) return;

    // Check cache first
    if (this._hoverCache.has(checkpointId)) {
      webview.postMessage({
        type: 'hoverPreview',
        preview: this._hoverCache.get(checkpointId)
      });
      return;
    }

    const cp = this._checkpoints.find(c => c.id === checkpointId);
    if (!cp) return;

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      // Find previous checkpoint for diff
      const cpIndex = this._checkpoints.findIndex(c => c.id === checkpointId);
      const prevCp = this._checkpoints[cpIndex + 1];

      let files: HoverPreview['files'] = [];
      let summary = '';

      if (prevCp) {
        const cacheKey = `${prevCp.id}:${checkpointId}`;
        let diff: DiffSummary | undefined = this._diffCache.get(cacheKey);

        if (!diff) {
          try {
            const diffOutput = execSync(
              `aitm diff ${prevCp.id} ${checkpointId} --json 2>/dev/null || echo "{}"`,
              { cwd: workspaceRoot, encoding: 'utf-8', timeout: 5000 }
            );
            const parsed = JSON.parse(diffOutput) as { added?: string[]; modified?: string[]; deleted?: string[] };
            diff = {
              added: parsed.added || [],
              modified: parsed.modified || [],
              deleted: parsed.deleted || [],
              totalChanges: (parsed.added?.length || 0) + (parsed.modified?.length || 0) + (parsed.deleted?.length || 0)
            };
            this._diffCache.set(cacheKey, diff);
          } catch {
            diff = { added: [], modified: [], deleted: [], totalChanges: 0 };
          }
        }

        files = [
          ...diff.added.slice(0, 5).map((f: string) => ({ path: f, status: 'added' as const })),
          ...diff.modified.slice(0, 5).map((f: string) => ({ path: f, status: 'modified' as const })),
          ...diff.deleted.slice(0, 5).map((f: string) => ({ path: f, status: 'deleted' as const }))
        ];

        summary = `+${diff.added.length} added, ~${diff.modified.length} modified, -${diff.deleted.length} deleted`;
      }

      const preview: HoverPreview = {
        checkpointId,
        files,
        summary
      };

      this._hoverCache.set(checkpointId, preview);

      webview.postMessage({
        type: 'hoverPreview',
        preview
      });
    } catch {
      // Ignore hover errors
    }
  }

  private async _showCheckpointDetails(checkpointId: string) {
    const cp = this._checkpoints.find(c => c.id === checkpointId);
    if (!cp) return;

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      // Get diff from previous checkpoint
      const cpIndex = this._checkpoints.findIndex(c => c.id === checkpointId);
      const prevCp = this._checkpoints[cpIndex + 1];

      let diffSummary = '';
      let changedFiles: { path: string; status: string }[] = [];

      if (prevCp) {
        const cacheKey = `${prevCp.id}:${checkpointId}`;
        let diff: DiffSummary | undefined = this._diffCache.get(cacheKey);

        if (!diff) {
          try {
            const diffOutput = execSync(
              `aitm diff ${prevCp.id} ${checkpointId} --json 2>/dev/null || echo "{}"`,
              { cwd: workspaceRoot, encoding: 'utf-8' }
            );
            const parsed = JSON.parse(diffOutput) as { added?: string[]; modified?: string[]; deleted?: string[] };
            diff = {
              added: parsed.added || [],
              modified: parsed.modified || [],
              deleted: parsed.deleted || [],
              totalChanges: (parsed.added?.length || 0) + (parsed.modified?.length || 0) + (parsed.deleted?.length || 0)
            };
            this._diffCache.set(cacheKey, diff);
          } catch {
            diff = { added: [], modified: [], deleted: [], totalChanges: 0 };
          }
        }

        diffSummary = `+${diff.added.length} -${diff.deleted.length} ~${diff.modified.length}`;
        changedFiles = [
          ...diff.added.map((f: string) => ({ path: f, status: 'added' })),
          ...diff.modified.map((f: string) => ({ path: f, status: 'modified' })),
          ...diff.deleted.map((f: string) => ({ path: f, status: 'deleted' }))
        ];
      }

      const webview = this._view?.webview || this._panel?.webview;
      webview?.postMessage({
        type: 'checkpointDetails',
        checkpoint: cp,
        diffSummary,
        changedFiles,
        prevCheckpointId: prevCp?.id
      });

    } catch (error) {
      vscode.window.showErrorMessage(`Failed to get checkpoint details: ${error}`);
    }
  }

  private async _restoreCheckpoint(checkpointId: string) {
    const confirm = await vscode.window.showWarningMessage(
      'Restore to this checkpoint? Current changes will be backed up automatically.',
      { modal: true },
      'Restore'
    );

    if (confirm) {
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        execSync(`aitm restore ${checkpointId}`, {
          cwd: workspaceRoot,
          encoding: 'utf-8'
        });

        vscode.window.showInformationMessage(`Restored to checkpoint: ${checkpointId}`);
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      } catch (error: any) {
        vscode.window.showErrorMessage(`Restore failed: ${error.message}`);
      }
    }
  }

  private async _restoreSingleFile(checkpointId: string, filePath: string) {
    const confirm = await vscode.window.showWarningMessage(
      `Restore ${filePath} from checkpoint?`,
      { modal: true },
      'Restore'
    );

    if (confirm) {
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        execSync(`aitm restore-files ${checkpointId} --patterns "${filePath}"`, {
          cwd: workspaceRoot,
          encoding: 'utf-8'
        });

        vscode.window.showInformationMessage(`Restored: ${filePath}`);

        // Refresh the file in editor
        const uri = vscode.Uri.file(`${workspaceRoot}/${filePath}`);
        const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === uri.fsPath);
        if (doc) {
          vscode.commands.executeCommand('workbench.action.files.revert', uri);
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`Restore failed: ${error.message}`);
      }
    }
  }

  private async _viewFileAtCheckpoint(checkpointId: string, filePath: string) {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const output = execSync(
        `aitm get-file-at ${checkpointId} "${filePath}" 2>/dev/null`,
        { cwd: workspaceRoot, encoding: 'utf-8' }
      );

      // Open in a new untitled document
      const doc = await vscode.workspace.openTextDocument({
        content: output,
        language: this._getLanguageId(filePath)
      });

      await vscode.window.showTextDocument(doc, { preview: true });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to view file: ${error.message}`);
    }
  }

  private _getLanguageId(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescriptreact',
      'js': 'javascript',
      'jsx': 'javascriptreact',
      'json': 'json',
      'md': 'markdown',
      'py': 'python',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp',
      'css': 'css',
      'scss': 'scss',
      'html': 'html',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'sh': 'shellscript',
      'bash': 'shellscript'
    };
    return langMap[ext || ''] || 'plaintext';
  }

  private async _showDiff(fromId: string, toId: string) {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const cacheKey = `${fromId}:${toId}`;
      let diff: DiffSummary | undefined = this._diffCache.get(cacheKey);

      if (!diff) {
        const output = execSync(
          `aitm diff ${fromId} ${toId} --json 2>/dev/null || echo "{}"`,
          { cwd: workspaceRoot, encoding: 'utf-8' }
        );
        const parsed = JSON.parse(output) as { added?: string[]; modified?: string[]; deleted?: string[] };
        diff = {
          added: parsed.added || [],
          modified: parsed.modified || [],
          deleted: parsed.deleted || [],
          totalChanges: (parsed.added?.length || 0) + (parsed.modified?.length || 0) + (parsed.deleted?.length || 0)
        };
        this._diffCache.set(cacheKey, diff);
      }

      // Show quick pick with changed files
      const items: vscode.QuickPickItem[] = [
        ...diff.added.map((f: string) => ({ label: `$(add) ${f}`, description: 'Added', detail: f })),
        ...diff.modified.map((f: string) => ({ label: `$(edit) ${f}`, description: 'Modified', detail: f })),
        ...diff.deleted.map((f: string) => ({ label: `$(trash) ${f}`, description: 'Deleted', detail: f }))
      ];

      if (items.length === 0) {
        vscode.window.showInformationMessage('No changes between these checkpoints');
        return;
      }

      const selected = await vscode.window.showQuickPick(items, {
        title: `Changes: ${fromId.substring(0, 8)} -> ${toId.substring(0, 8)}`,
        placeHolder: 'Select a file to see diff'
      });

      if (selected && selected.detail) {
        vscode.commands.executeCommand('aitm.showFileDiff', fromId, toId, selected.detail);
      }

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to show diff: ${error.message}`);
    }
  }

  private async _createManualCheckpoint() {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter checkpoint name',
      placeHolder: 'My checkpoint'
    });

    if (name) {
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        execSync(`aitm checkpoint "${name}"`, {
          cwd: workspaceRoot,
          encoding: 'utf-8'
        });

        vscode.window.showInformationMessage(`Checkpoint created: ${name}`);
        this._refreshCheckpoints();
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to create checkpoint: ${error.message}`);
      }
    }
  }

  private async _searchCheckpoints(query: string) {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const output = execSync(
        `aitm search "${query}" --json 2>/dev/null || echo "[]"`,
        { cwd: workspaceRoot, encoding: 'utf-8' }
      );

      const results = JSON.parse(output);

      const webview = this._view?.webview || this._panel?.webview;
      webview?.postMessage({
        type: 'searchResults',
        results,
        query
      });

    } catch (error) {
      const webview = this._view?.webview || this._panel?.webview;
      webview?.postMessage({
        type: 'searchResults',
        results: [],
        query,
        error: 'Search failed'
      });
    }
  }

  private _filterCheckpoints(filter: { type?: string; dateRange?: string; hasTests?: boolean; branch?: string }) {
    let filtered = [...this._checkpoints];

    if (filter.type && filter.type !== 'all') {
      filtered = filtered.filter(cp => cp.type === filter.type);
    }

    if (filter.hasTests) {
      filtered = filtered.filter(cp => cp.testResult !== 'unknown');
    }

    if (filter.branch && filter.branch !== 'all') {
      filtered = filtered.filter(cp => cp.branch === filter.branch);
    }

    const webview = this._view?.webview || this._panel?.webview;
    webview?.postMessage({
      type: 'filteredCheckpoints',
      checkpoints: filtered
    });
  }

  private async _jumpToTime(query: string) {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      // Use natural language to find checkpoint
      const output = execSync(
        `aitm back-to "${query}" --dry-run --json 2>/dev/null || echo "{}"`,
        { cwd: workspaceRoot, encoding: 'utf-8' }
      );

      const result = JSON.parse(output);

      if (result.checkpointId) {
        this._selectedCheckpoint = result.checkpointId;
        this._sendState();

        const restore = await vscode.window.showInformationMessage(
          `Found checkpoint: ${result.name || result.checkpointId}`,
          'Restore', 'Cancel'
        );

        if (restore === 'Restore') {
          await this._restoreCheckpoint(result.checkpointId);
        }
      } else {
        vscode.window.showWarningMessage('No matching checkpoint found');
      }

    } catch (error: any) {
      vscode.window.showErrorMessage(`Jump failed: ${error.message}`);
    }
  }

  private async _getFilePreview(checkpointId: string, filePath: string) {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const output = execSync(
        `aitm get-file-at ${checkpointId} "${filePath}" 2>/dev/null | head -50`,
        { cwd: workspaceRoot, encoding: 'utf-8' }
      );

      const webview = this._view?.webview || this._panel?.webview;
      webview?.postMessage({
        type: 'filePreview',
        checkpointId,
        filePath,
        content: output
      });
    } catch {
      // Ignore preview errors
    }
  }

  public refresh() {
    this._refreshCheckpoints();
  }

  private _getHtmlForWebview(webview: vscode.Webview, isFullPanel: boolean): string {
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Timeline Graph</title>
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
      --success: #22c55e;
      --error: #ef4444;
      --warning: #f59e0b;
      --info: #3b82f6;
      --hover-bg: var(--vscode-list-hoverBackground);
      --selection-bg: var(--vscode-list-activeSelectionBackground);
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
      overflow: hidden;
    }

    /* Toolbar */
    .toolbar {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      background: var(--bg);
    }

    .toolbar input {
      flex: 1;
      min-width: 150px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--fg);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
    }

    .toolbar input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .toolbar button {
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .toolbar button:hover {
      opacity: 0.9;
    }

    .toolbar select {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--fg);
      padding: 6px;
      border-radius: 4px;
      font-size: 12px;
    }

    /* Compare Bar */
    .compare-bar {
      padding: 8px 12px;
      background: var(--info);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
    }

    .compare-bar button {
      background: rgba(255,255,255,0.2);
      border: none;
      color: inherit;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
    }

    /* Search Results */
    .search-results {
      padding: 8px;
      background: var(--input-bg);
      border-bottom: 1px solid var(--border);
      max-height: 200px;
      overflow-y: auto;
    }

    .search-results .result-item {
      padding: 6px 8px;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .search-results .result-item:hover {
      background: var(--hover-bg);
    }

    /* Main Timeline Container */
    .timeline-container {
      flex: 1;
      overflow: auto;
      padding: 12px;
      position: relative;
    }

    /* SVG Canvas for Branch Lines */
    .timeline-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 0;
    }

    .timeline-svg path {
      fill: none;
      stroke-width: 2;
    }

    .timeline-svg .branch-main { stroke: var(--accent); }
    .timeline-svg .branch-1 { stroke: var(--success); }
    .timeline-svg .branch-2 { stroke: var(--warning); }
    .timeline-svg .branch-3 { stroke: var(--error); }

    /* Timeline Nodes */
    .timeline {
      position: relative;
      min-height: 100%;
      z-index: 1;
    }

    .checkpoint-node {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 8px;
      cursor: pointer;
      position: relative;
      border-radius: 6px;
      transition: background 0.15s;
      margin-bottom: 2px;
    }

    .checkpoint-node:hover {
      background: var(--hover-bg);
    }

    .checkpoint-node.selected {
      background: var(--selection-bg);
    }

    .checkpoint-node.compare-target {
      border: 2px dashed var(--info);
    }

    .checkpoint-node.drag-over {
      background: var(--info);
      opacity: 0.3;
    }

    /* Node Dot with Branch Visualization */
    .node-dot-container {
      position: relative;
      width: 40px;
      min-width: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .node-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--accent);
      border: 2px solid var(--bg);
      position: relative;
      z-index: 2;
      transition: transform 0.15s;
    }

    .checkpoint-node:hover .node-dot {
      transform: scale(1.2);
    }

    .node-dot.auto { background: #6b7280; }
    .node-dot.manual { background: var(--info); }
    .node-dot.before { background: var(--warning); }
    .node-dot.after { background: var(--success); }

    .node-dot.test-passed {
      box-shadow: 0 0 0 3px var(--success), 0 0 8px var(--success);
    }
    .node-dot.test-failed {
      box-shadow: 0 0 0 3px var(--error), 0 0 8px var(--error);
    }

    /* Linked pair indicator - connects before/after checkpoints */
    .checkpoint-node.linked-before {
      border-left: 3px solid var(--warning);
      margin-bottom: 0;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }

    .checkpoint-node.linked-after {
      border-left: 3px solid var(--success);
      margin-top: 0;
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }

    .linked-pair-bracket {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      border-radius: 2px;
    }

    .linked-pair-bracket.before-bracket { background: var(--warning); }
    .linked-pair-bracket.after-bracket { background: var(--success); }

    /* Change count badges */
    .change-counts {
      display: inline-flex;
      gap: 6px;
      margin-left: 8px;
      font-size: 10px;
      font-weight: 500;
    }

    .change-count {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 1px 5px;
      border-radius: 3px;
    }

    .change-count.added { background: rgba(34, 197, 94, 0.15); color: var(--success); }
    .change-count.modified { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .change-count.deleted { background: rgba(239, 68, 68, 0.15); color: var(--error); }

    /* Type color stripe on the left of each node */
    .checkpoint-node.type-before { border-left: 3px solid var(--warning); }
    .checkpoint-node.type-after { border-left: 3px solid var(--success); }
    .checkpoint-node.type-manual { border-left: 3px solid var(--info); }
    .checkpoint-node.type-auto { border-left: 3px solid #6b7280; }

    /* Branch Line */
    .branch-line {
      position: absolute;
      width: 2px;
      background: var(--border);
      top: 0;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1;
    }

    .checkpoint-node:first-child .branch-line {
      top: 50%;
    }

    .checkpoint-node:last-child .branch-line {
      bottom: 50%;
    }

    /* Node Content */
    .node-content {
      flex: 1;
      min-width: 0;
    }

    .node-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .node-name {
      font-weight: 500;
      font-size: 13px;
      line-height: 1.4;
      word-break: break-word;
    }

    .node-time {
      font-size: 11px;
      opacity: 0.7;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .node-meta {
      font-size: 11px;
      opacity: 0.6;
      margin-top: 4px;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .node-meta span {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 500;
      margin-left: 6px;
      text-transform: uppercase;
    }

    .badge.passed { background: var(--success); color: white; }
    .badge.failed { background: var(--error); color: white; }
    .badge.auto { background: #6b7280; color: white; }
    .badge.manual { background: var(--accent); color: white; }
    .badge.before { background: var(--warning); color: black; }
    .badge.after { background: var(--success); color: white; }

    /* Node Actions */
    .node-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.15s;
      flex-shrink: 0;
    }

    .checkpoint-node:hover .node-actions {
      opacity: 1;
    }

    .node-actions button {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      white-space: nowrap;
    }

    .node-actions button:hover {
      background: var(--button-bg);
      color: var(--button-fg);
      border-color: var(--button-bg);
    }

    /* Hover Preview Tooltip */
    .hover-preview {
      position: fixed;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      max-width: 350px;
      min-width: 250px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 1000;
      font-size: 12px;
      display: none;
    }

    .hover-preview.visible {
      display: block;
    }

    .hover-preview-header {
      font-weight: 600;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    .hover-preview-files {
      max-height: 150px;
      overflow-y: auto;
    }

    .hover-preview-file {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 0;
      cursor: pointer;
    }

    .hover-preview-file:hover {
      color: var(--accent);
    }

    .hover-preview-file.added { color: var(--success); }
    .hover-preview-file.modified { color: var(--warning); }
    .hover-preview-file.deleted { color: var(--error); text-decoration: line-through; }

    .hover-preview-summary {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
      opacity: 0.7;
    }

    /* Details Panel */
    .details-panel {
      border-top: 1px solid var(--border);
      background: var(--input-bg);
      max-height: ${isFullPanel ? '300px' : '250px'};
      overflow-y: auto;
    }

    .details-header {
      padding: 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      background: var(--input-bg);
    }

    .details-title {
      font-weight: 600;
      font-size: 14px;
    }

    .details-id {
      font-size: 11px;
      opacity: 0.6;
      font-family: monospace;
    }

    .details-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid var(--border);
    }

    .stat-item {
      background: var(--bg);
      padding: 10px;
      border-radius: 6px;
      text-align: center;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 600;
    }

    .stat-value.added { color: var(--success); }
    .stat-value.deleted { color: var(--error); }
    .stat-value.modified { color: var(--warning); }

    .stat-label {
      font-size: 10px;
      opacity: 0.7;
      text-transform: uppercase;
      margin-top: 2px;
    }

    /* Changed Files List */
    .changed-files {
      padding: 12px;
    }

    .changed-files-header {
      font-weight: 500;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .changed-file {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }

    .changed-file:hover {
      background: var(--hover-bg);
    }

    .changed-file-info {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .changed-file-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .changed-file-status.added { background: var(--success); }
    .changed-file-status.modified { background: var(--warning); }
    .changed-file-status.deleted { background: var(--error); }

    .changed-file-path {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .changed-file-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .changed-file:hover .changed-file-actions {
      opacity: 1;
    }

    .changed-file-actions button {
      background: transparent;
      border: none;
      color: var(--fg);
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 10px;
    }

    .changed-file-actions button:hover {
      background: var(--button-bg);
      color: var(--button-fg);
    }

    /* Details Actions */
    .details-actions {
      display: flex;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid var(--border);
      position: sticky;
      bottom: 0;
      background: var(--input-bg);
    }

    .details-actions button {
      flex: 1;
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      padding: 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    }

    .details-actions button:hover {
      opacity: 0.9;
    }

    .details-actions button.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      opacity: 0.6;
    }

    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state-title {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .empty-state-desc {
      font-size: 12px;
      max-width: 300px;
      margin: 0 auto;
    }

    /* Drag Indicator */
    .drag-indicator {
      position: fixed;
      background: var(--info);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      z-index: 1001;
      display: none;
    }

    .drag-indicator.visible {
      display: block;
    }

    /* Expand Button (for sidebar view) */
    ${!isFullPanel ? `
    .expand-button {
      position: absolute;
      top: 8px;
      right: 8px;
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      z-index: 10;
    }
    ` : ''}

    /* Scrollbar Styling */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--fg);
      opacity: 0.5;
    }
  </style>
</head>
<body>
  ${!isFullPanel ? '<button class="expand-button" onclick="openFullPanel()">Expand</button>' : ''}

  <div class="toolbar">
    <input type="text" id="search" placeholder="Search checkpoints or jump to time..." />
    <select id="filter-type">
      <option value="all">All Types</option>
      <option value="manual">Manual</option>
      <option value="auto">Auto</option>
      <option value="before">Before</option>
      <option value="after">After</option>
    </select>
    <select id="filter-branch" style="display: none;">
      <option value="all">All Branches</option>
    </select>
    <button onclick="createCheckpoint()">+ Checkpoint</button>
  </div>

  <div id="compare-bar" class="compare-bar" style="display: none;">
    <span id="compare-text">Drag to another checkpoint to compare</span>
    <button onclick="cancelCompare()">Cancel</button>
  </div>

  <div id="search-results" class="search-results" style="display: none;"></div>

  <div class="timeline-container">
    <svg class="timeline-svg" id="timeline-svg"></svg>
    <div id="timeline" class="timeline"></div>
  </div>

  <div id="details-panel" class="details-panel" style="display: none;"></div>

  <div id="hover-preview" class="hover-preview"></div>
  <div id="drag-indicator" class="drag-indicator"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    let state = {
      nodes: [],
      checkpoints: [],
      selectedCheckpoint: null,
      compareCheckpoint: null,
      branches: [],
      diffCache: {}
    };

    let dragState = {
      isDragging: false,
      startId: null,
      startY: 0
    };

    let hoverTimeout = null;

    // Message Handler
    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'state':
          state = { ...state, ...msg };
          render();
          break;
        case 'checkpointDetails':
          showDetails(msg.checkpoint, msg.diffSummary, msg.changedFiles, msg.prevCheckpointId);
          break;
        case 'searchResults':
          showSearchResults(msg.results, msg.query);
          break;
        case 'filteredCheckpoints':
          state.checkpoints = msg.checkpoints;
          renderNodes();
          break;
        case 'hoverPreview':
          showHoverPreview(msg.preview);
          break;
        case 'filePreview':
          // Could show inline file preview if needed
          break;
      }
    });

    function render() {
      renderNodes();
      renderBranchLines();
      updateCompareBar();
      updateBranchFilter();
    }

    function renderNodes() {
      const container = document.getElementById('timeline');

      if (state.checkpoints.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="empty-state-icon">&#9200;</div>
            <div class="empty-state-title">No checkpoints yet</div>
            <div class="empty-state-desc">Create your first checkpoint to start tracking your project's history</div>
          </div>
        \`;
        return;
      }

      // Build linked pairs map: detect before/after checkpoint pairs
      const linkedPairs = new Map();
      for (let i = 0; i < state.checkpoints.length - 1; i++) {
        const current = state.checkpoints[i];
        const next = state.checkpoints[i + 1];
        // If current is "after" and next is "before" (they are in reverse chronological order),
        // or current is "before" and previous is "after", link them
        if (current.type === 'after' && next.type === 'before') {
          linkedPairs.set(current.id, 'linked-after');
          linkedPairs.set(next.id, 'linked-before');
        }
      }

      container.innerHTML = state.checkpoints.map((cp, index) => {
        const isSelected = cp.id === state.selectedCheckpoint;
        const isCompareTarget = state.compareCheckpoint && state.compareCheckpoint !== cp.id;
        const prevCp = state.checkpoints[index + 1];
        const cacheKey = prevCp ? prevCp.id + ':' + cp.id : null;
        const diff = cacheKey ? state.diffCache[cacheKey] : null;

        const addedCount = diff?.added?.length || 0;
        const modifiedCount = diff?.modified?.length || 0;
        const deletedCount = diff?.deleted?.length || 0;
        const totalChanges = addedCount + modifiedCount + deletedCount;

        const dotClasses = [
          'node-dot',
          cp.type,
          cp.testResult === 'passed' ? 'test-passed' : '',
          cp.testResult === 'failed' ? 'test-failed' : ''
        ].filter(Boolean).join(' ');

        const linkedClass = linkedPairs.get(cp.id) || '';

        const nodeClasses = [
          'checkpoint-node',
          'type-' + cp.type,
          isSelected ? 'selected' : '',
          isCompareTarget ? 'compare-target' : '',
          linkedClass
        ].filter(Boolean).join(' ');

        // Build change count badges HTML
        let changeBadges = '';
        if (totalChanges > 0) {
          changeBadges = '<span class="change-counts">';
          if (addedCount > 0) changeBadges += '<span class="change-count added">+' + addedCount + '</span>';
          if (modifiedCount > 0) changeBadges += '<span class="change-count modified">~' + modifiedCount + '</span>';
          if (deletedCount > 0) changeBadges += '<span class="change-count deleted">-' + deletedCount + '</span>';
          changeBadges += '</span>';
        }

        return \`
          <div class="\${nodeClasses}"
               data-id="\${cp.id}"
               onclick="selectCheckpoint('\${cp.id}')"
               onmouseenter="handleMouseEnter(event, '\${cp.id}')"
               onmouseleave="handleMouseLeave()"
               onmousedown="handleDragStart(event, '\${cp.id}')"
               draggable="true">
            <div class="node-dot-container">
              <div class="branch-line"></div>
              <div class="\${dotClasses}"></div>
            </div>
            <div class="node-content">
              <div class="node-header">
                <span class="node-name">
                  \${escapeHtml(cp.name)}
                  \${cp.type !== 'manual' ? '<span class="badge ' + cp.type + '">' + cp.type + '</span>' : ''}
                  \${cp.testResult === 'passed' ? '<span class="badge passed">PASS</span>' : ''}
                  \${cp.testResult === 'failed' ? '<span class="badge failed">FAIL</span>' : ''}
                  \${changeBadges}
                </span>
                <span class="node-time">\${timeAgo(cp.timestamp)}</span>
              </div>
              <div class="node-meta">
                <span>\${cp.stats?.totalFiles || 0} files</span>
                \${totalChanges > 0 ? '<span>' + totalChanges + ' changes</span>' : ''}
                \${cp.chatMessages ? '<span>' + cp.chatMessages + ' messages</span>' : ''}
                \${cp.terminalCommands ? '<span>' + cp.terminalCommands + ' commands</span>' : ''}
              </div>
            </div>
            <div class="node-actions">
              <button onclick="event.stopPropagation(); restore('\${cp.id}')">Restore</button>
              <button onclick="event.stopPropagation(); startCompare('\${cp.id}')">Compare</button>
            </div>
          </div>
        \`;
      }).join('');
    }

    function renderBranchLines() {
      const svg = document.getElementById('timeline-svg');
      const container = document.querySelector('.timeline-container');
      if (!svg || !container) return;

      const nodes = document.querySelectorAll('.checkpoint-node');
      if (nodes.length === 0) {
        svg.innerHTML = '';
        return;
      }

      // Simple vertical line connecting all nodes
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const dot1 = firstNode.querySelector('.node-dot');
      const dot2 = lastNode.querySelector('.node-dot');

      if (!dot1 || !dot2) return;

      const containerRect = container.getBoundingClientRect();
      const rect1 = dot1.getBoundingClientRect();
      const rect2 = dot2.getBoundingClientRect();

      const x = rect1.left - containerRect.left + rect1.width / 2 + container.scrollLeft;
      const y1 = rect1.top - containerRect.top + rect1.height / 2 + container.scrollTop;
      const y2 = rect2.top - containerRect.top + rect2.height / 2 + container.scrollTop;

      svg.innerHTML = \`
        <path class="branch-main" d="M \${x} \${y1} L \${x} \${y2}" />
      \`;
    }

    function updateCompareBar() {
      const bar = document.getElementById('compare-bar');
      const text = document.getElementById('compare-text');

      if (state.compareCheckpoint) {
        bar.style.display = 'flex';
        text.textContent = 'Click another checkpoint to see changes';
      } else if (dragState.isDragging) {
        bar.style.display = 'flex';
        text.textContent = 'Drop on another checkpoint to compare';
      } else {
        bar.style.display = 'none';
      }
    }

    function updateBranchFilter() {
      const select = document.getElementById('filter-branch');
      if (state.branches && state.branches.length > 1) {
        select.style.display = 'block';
        select.innerHTML = '<option value="all">All Branches</option>' +
          state.branches.map(b => '<option value="' + b + '">' + b + '</option>').join('');
      } else {
        select.style.display = 'none';
      }
    }

    // Event Handlers
    function selectCheckpoint(id) {
      if (state.compareCheckpoint && state.compareCheckpoint !== id) {
        vscode.postMessage({ type: 'showDiff', fromId: state.compareCheckpoint, toId: id });
        state.compareCheckpoint = null;
        updateCompareBar();
        renderNodes();
      } else {
        vscode.postMessage({ type: 'selectCheckpoint', id });
      }
    }

    function restore(id) {
      vscode.postMessage({ type: 'restore', id });
    }

    function startCompare(id) {
      state.compareCheckpoint = id;
      updateCompareBar();
      renderNodes();
    }

    function cancelCompare() {
      state.compareCheckpoint = null;
      dragState = { isDragging: false, startId: null, startY: 0 };
      updateCompareBar();
      renderNodes();
      document.getElementById('drag-indicator').classList.remove('visible');
    }

    function createCheckpoint() {
      vscode.postMessage({ type: 'createCheckpoint' });
    }

    function openFullPanel() {
      vscode.postMessage({ type: 'openInFullPanel' });
    }

    // Hover Handling
    function handleMouseEnter(event, id) {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        vscode.postMessage({ type: 'hover', id });
        positionHoverPreview(event);
      }, 300);
    }

    function handleMouseLeave() {
      clearTimeout(hoverTimeout);
      hideHoverPreview();
      vscode.postMessage({ type: 'hoverEnd' });
    }

    function showHoverPreview(preview) {
      if (!preview || !preview.files || preview.files.length === 0) return;

      const el = document.getElementById('hover-preview');
      el.innerHTML = \`
        <div class="hover-preview-header">Changes in this checkpoint</div>
        <div class="hover-preview-files">
          \${preview.files.map(f => \`
            <div class="hover-preview-file \${f.status}"
                 onclick="event.stopPropagation(); viewFile('\${preview.checkpointId}', '\${f.path}')">
              <span>\${f.status === 'added' ? '+' : f.status === 'deleted' ? '-' : '~'}</span>
              <span>\${escapeHtml(f.path)}</span>
            </div>
          \`).join('')}
        </div>
        <div class="hover-preview-summary">\${preview.summary}</div>
      \`;
      el.classList.add('visible');
    }

    function hideHoverPreview() {
      document.getElementById('hover-preview').classList.remove('visible');
    }

    function positionHoverPreview(event) {
      const el = document.getElementById('hover-preview');
      const x = Math.min(event.clientX + 20, window.innerWidth - 370);
      const y = Math.min(event.clientY + 10, window.innerHeight - 200);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }

    // Drag Handling
    function handleDragStart(event, id) {
      if (event.button !== 0) return;

      dragState = {
        isDragging: true,
        startId: id,
        startY: event.clientY
      };

      vscode.postMessage({ type: 'dragStart', id });

      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
    }

    function handleDragMove(event) {
      if (!dragState.isDragging) return;

      const indicator = document.getElementById('drag-indicator');
      indicator.style.left = (event.clientX + 10) + 'px';
      indicator.style.top = (event.clientY + 10) + 'px';
      indicator.textContent = 'Release to compare';
      indicator.classList.add('visible');

      // Highlight drop target
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const node = target?.closest('.checkpoint-node');

      document.querySelectorAll('.checkpoint-node').forEach(n => {
        n.classList.remove('drag-over');
      });

      if (node && node.dataset.id !== dragState.startId) {
        node.classList.add('drag-over');
      }
    }

    function handleDragEnd(event) {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);

      const indicator = document.getElementById('drag-indicator');
      indicator.classList.remove('visible');

      document.querySelectorAll('.checkpoint-node').forEach(n => {
        n.classList.remove('drag-over');
      });

      const target = document.elementFromPoint(event.clientX, event.clientY);
      const node = target?.closest('.checkpoint-node');

      if (node && node.dataset.id && node.dataset.id !== dragState.startId) {
        vscode.postMessage({
          type: 'dragEnd',
          id: node.dataset.id,
          fromId: dragState.startId
        });
      }

      dragState = { isDragging: false, startId: null, startY: 0 };
      updateCompareBar();
    }

    // Details Panel
    function showDetails(checkpoint, diffSummary, changedFiles, prevCheckpointId) {
      const panel = document.getElementById('details-panel');
      panel.style.display = 'block';

      const added = changedFiles?.filter(f => f.status === 'added') || [];
      const modified = changedFiles?.filter(f => f.status === 'modified') || [];
      const deleted = changedFiles?.filter(f => f.status === 'deleted') || [];

      panel.innerHTML = \`
        <div class="details-header">
          <span class="details-title">\${escapeHtml(checkpoint.name)}</span>
          <span class="details-id">\${checkpoint.id.substring(0, 12)}</span>
        </div>

        <div class="details-stats">
          <div class="stat-item">
            <div class="stat-value">\${checkpoint.stats?.totalFiles || 0}</div>
            <div class="stat-label">Files</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">\${formatSize(checkpoint.stats?.totalSize)}</div>
            <div class="stat-label">Size</div>
          </div>
          <div class="stat-item">
            <div class="stat-value added">+\${added.length}</div>
            <div class="stat-label">Added</div>
          </div>
          <div class="stat-item">
            <div class="stat-value modified">~\${modified.length}</div>
            <div class="stat-label">Modified</div>
          </div>
          <div class="stat-item">
            <div class="stat-value deleted">-\${deleted.length}</div>
            <div class="stat-label">Deleted</div>
          </div>
        </div>

        \${changedFiles && changedFiles.length > 0 ? \`
          <div class="changed-files">
            <div class="changed-files-header">
              <span>Changed Files (\${changedFiles.length})</span>
            </div>
            \${changedFiles.slice(0, 20).map(f => \`
              <div class="changed-file" onclick="viewFile('\${checkpoint.id}', '\${f.path}')">
                <div class="changed-file-info">
                  <div class="changed-file-status \${f.status}"></div>
                  <span class="changed-file-path">\${escapeHtml(f.path)}</span>
                </div>
                <div class="changed-file-actions">
                  <button onclick="event.stopPropagation(); viewFile('\${checkpoint.id}', '\${f.path}')" title="View">View</button>
                  \${f.status !== 'deleted' ? \`
                    <button onclick="event.stopPropagation(); restoreFile('\${checkpoint.id}', '\${f.path}')" title="Restore">Restore</button>
                  \` : ''}
                </div>
              </div>
            \`).join('')}
            \${changedFiles.length > 20 ? '<div style="padding: 8px; opacity: 0.6; font-size: 11px;">... and ' + (changedFiles.length - 20) + ' more files</div>' : ''}
          </div>
        \` : ''}

        <div class="details-actions">
          <button onclick="restore('\${checkpoint.id}')">Restore All</button>
          <button class="secondary" onclick="startCompare('\${checkpoint.id}')">Compare</button>
          \${prevCheckpointId ? \`
            <button class="secondary" onclick="showDiffWith('\${prevCheckpointId}', '\${checkpoint.id}')">View Diff</button>
          \` : ''}
        </div>
      \`;
    }

    function viewFile(checkpointId, filePath) {
      vscode.postMessage({ type: 'viewFileAtCheckpoint', checkpointId, filePath });
    }

    function restoreFile(checkpointId, filePath) {
      vscode.postMessage({ type: 'restoreFile', checkpointId, filePath });
    }

    function showDiffWith(fromId, toId) {
      vscode.postMessage({ type: 'showDiff', fromId, toId });
    }

    // Search
    function showSearchResults(results, query) {
      const container = document.getElementById('search-results');

      if (!results || results.length === 0) {
        container.style.display = 'block';
        container.innerHTML = '<div style="padding: 8px; opacity: 0.7;">No results for "' + escapeHtml(query) + '"</div>';
        setTimeout(() => { container.style.display = 'none'; }, 3000);
        return;
      }

      container.style.display = 'block';
      container.innerHTML = results.slice(0, 10).map(r => \`
        <div class="result-item" onclick="selectCheckpoint('\${r.id}')">
          <div>
            <div style="font-weight: 500;">\${escapeHtml(r.name || r.description || 'Checkpoint')}</div>
            <div style="font-size: 11px; opacity: 0.7;">\${timeAgo(r.timestamp)}</div>
          </div>
          <span style="font-size: 10px; opacity: 0.5;">\${r.id?.substring(0, 8) || ''}</span>
        </div>
      \`).join('');
    }

    // Input Handlers
    const searchInput = document.getElementById('search');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = e.target.value.trim();
        if (query.length > 2) {
          if (/ago|yesterday|hour|minute|day|week|month/i.test(query)) {
            vscode.postMessage({ type: 'jumpToTime', query });
          } else {
            vscode.postMessage({ type: 'search', query });
          }
        } else {
          document.getElementById('search-results').style.display = 'none';
        }
      }, 300);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query) {
          vscode.postMessage({ type: 'jumpToTime', query });
        }
      }
      if (e.key === 'Escape') {
        searchInput.value = '';
        document.getElementById('search-results').style.display = 'none';
      }
    });

    document.getElementById('filter-type').addEventListener('change', (e) => {
      vscode.postMessage({ type: 'filter', filter: { type: e.target.value } });
    });

    document.getElementById('filter-branch').addEventListener('change', (e) => {
      vscode.postMessage({ type: 'filter', filter: { branch: e.target.value } });
    });

    // Utility Functions
    function timeAgo(timestamp) {
      if (!timestamp) return '';
      const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
      return new Date(timestamp).toLocaleDateString();
    }

    function formatSize(bytes) {
      if (!bytes) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let i = 0;
      while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
      }
      return bytes.toFixed(1) + ' ' + units[i];
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c] || c));
    }

    // Initialize
    vscode.postMessage({ type: 'ready' });

    // Re-render on resize for branch lines
    window.addEventListener('resize', () => {
      requestAnimationFrame(renderBranchLines);
    });
  </script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
