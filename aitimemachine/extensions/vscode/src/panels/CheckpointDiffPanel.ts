/**
 * CheckpointDiffPanel - VS Code webview panel for displaying diffs between checkpoints.
 * Opens beside the current editor (ViewColumn.Beside) via command aitm.diff.openPanel.
 */

import * as vscode from 'vscode';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckpointInfo {
  id: string;
  description: string;
  timestamp: string;
  stats: {
    totalFiles: number;
    totalSize: number;
  };
}

interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  /** Unified diff lines (null when binary or unavailable). */
  lines: DiffLine[] | null;
  additions: number;
  deletions: number;
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'header';
  content: string;
  lineNumberFrom: number | null;
  lineNumberTo: number | null;
}

interface CheckpointDiff {
  fromCheckpoint: CheckpointInfo;
  toCheckpoint: CheckpointInfo;
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
}

// Messages sent from the webview to the extension host.
type WebviewToExtensionMessage =
  | { command: 'selectFile'; filePath: string }
  | { command: 'requestRefresh' }
  | { command: 'openFileInEditor'; filePath: string };

// Messages sent from the extension host to the webview.
type ExtensionToWebviewMessage =
  | { command: 'updateDiff'; diff: CheckpointDiff }
  | { command: 'updateSelectedFile'; filePath: string }
  | { command: 'error'; message: string };

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export class CheckpointDiffPanel {
  public static readonly viewType = 'aitm.checkpointDiff';
  private static _instance: CheckpointDiffPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private _fromId: string;
  private _toId: string;
  private _diff: CheckpointDiff | null = null;
  private _selectedFile: string | null = null;
  private _refreshTimer: NodeJS.Timeout | null = null;

  // ---------------------------------------------------------------------------
  // Static factory
  // ---------------------------------------------------------------------------

  /**
   * Open (or reveal) the diff panel for the given checkpoint pair.
   * Re-uses an existing panel when only the checkpoint IDs change.
   */
  public static open(
    extensionUri: vscode.Uri,
    fromId: string,
    toId: string,
  ): CheckpointDiffPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (CheckpointDiffPanel._instance) {
      CheckpointDiffPanel._instance._updateCheckpoints(fromId, toId);
      CheckpointDiffPanel._instance._panel.reveal(column);
      return CheckpointDiffPanel._instance;
    }

    const panel = vscode.window.createWebviewPanel(
      CheckpointDiffPanel.viewType,
      'AITM: Checkpoint Diff',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    CheckpointDiffPanel._instance = new CheckpointDiffPanel(
      panel,
      extensionUri,
      fromId,
      toId,
    );
    return CheckpointDiffPanel._instance;
  }

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    fromId: string,
    toId: string,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._fromId = fromId;
    this._toId = toId;

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtensionMessage) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._loadAndRender();
  }

  // ---------------------------------------------------------------------------
  // Public helpers
  // ---------------------------------------------------------------------------

  /** Reload data when checkpoints change externally (live-reload support). */
  public refreshDiff(): void {
    this._loadAndRender();
  }

  // ---------------------------------------------------------------------------
  // Private – data loading
  // ---------------------------------------------------------------------------

  private _updateCheckpoints(fromId: string, toId: string): void {
    const changed = this._fromId !== fromId || this._toId !== toId;
    this._fromId = fromId;
    this._toId = toId;
    this._panel.title = `AITM: Diff ${fromId.slice(0, 8)} → ${toId.slice(0, 8)}`;
    if (changed) {
      this._loadAndRender();
    }
  }

  private _loadAndRender(): void {
    try {
      const diff = this._fetchDiff(this._fromId, this._toId);
      this._diff = diff;
      if (!this._selectedFile && diff.files.length > 0) {
        this._selectedFile = diff.files[0].path;
      }
      this._panel.webview.html = this._buildHtml();
      this._post({ command: 'updateDiff', diff });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._panel.webview.html = this._buildHtml();
      this._post({ command: 'error', message });
    }
  }

  private _fetchDiff(fromId: string, toId: string): CheckpointDiff {
    const raw = execSync(
      `aitm diff ${fromId} ${toId} --json 2>/dev/null`,
      { encoding: 'utf8', timeout: 15_000 },
    );
    const parsed = JSON.parse(raw) as CheckpointDiff;
    return parsed;
  }

  // ---------------------------------------------------------------------------
  // Private – message handling
  // ---------------------------------------------------------------------------

  private _handleMessage(msg: WebviewToExtensionMessage): void {
    switch (msg.command) {
      case 'selectFile':
        this._selectedFile = msg.filePath;
        this._post({ command: 'updateSelectedFile', filePath: msg.filePath });
        break;

      case 'requestRefresh':
        this._loadAndRender();
        break;

      case 'openFileInEditor': {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
          const uri = vscode.Uri.joinPath(folders[0].uri, msg.filePath);
          vscode.window.showTextDocument(uri, { preview: true }).then(
            undefined,
            () => vscode.window.showWarningMessage(`Cannot open: ${msg.filePath}`),
          );
        }
        break;
      }
    }
  }

  private _post(msg: ExtensionToWebviewMessage): void {
    this._panel.webview.postMessage(msg);
  }

  // ---------------------------------------------------------------------------
  // Private – HTML generation
  // ---------------------------------------------------------------------------

  private _buildHtml(): string {
    const diff = this._diff;
    const nonce = this._nonce();

    const statsHtml = diff
      ? `<span class="stat add">+${diff.totalAdditions}</span>
         <span class="stat del">-${diff.totalDeletions}</span>
         <span class="stat files">${diff.files.length} file${diff.files.length !== 1 ? 's' : ''}</span>`
      : '<span class="stat">Loading…</span>';

    const fileListHtml = diff
      ? diff.files
          .map((f) => {
            const icon = f.status === 'added' ? '✚' : f.status === 'deleted' ? '✖' : '●';
            const cls = f.status;
            const sel = f.path === this._selectedFile ? ' selected' : '';
            return `<li class="file-item ${cls}${sel}" data-path="${this._escape(f.path)}" title="${this._escape(f.path)}">
                      <span class="file-icon">${icon}</span>
                      <span class="file-name">${this._escape(this._basename(f.path))}</span>
                      <span class="file-stats">
                        <span class="add">+${f.additions}</span>
                        <span class="del">-${f.deletions}</span>
                      </span>
                    </li>`;
          })
          .join('\n')
      : '<li class="loading">Loading files…</li>';

    const activeDiff = diff?.files.find((f) => f.path === this._selectedFile);
    const diffBodyHtml = activeDiff
      ? this._renderFileDiff(activeDiff)
      : diff
      ? '<div class="empty-diff">Select a file to view its diff.</div>'
      : '<div class="loading-diff">Fetching diff data…</div>';

    const fromLabel = diff ? diff.fromCheckpoint.id.slice(0, 8) : this._fromId.slice(0, 8);
    const toLabel = diff ? diff.toCheckpoint.id.slice(0, 8) : this._toId.slice(0, 8);

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src 'nonce-${nonce}';
                 script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AITM Checkpoint Diff</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ---- Header ---- */
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      background: var(--vscode-titleBar-activeBackground, #1e1e1e);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      flex-shrink: 0;
    }
    .header h1 { font-size: 13px; font-weight: 600; flex: 1; }
    .checkpoint-badge {
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      border-radius: 3px;
      padding: 2px 6px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
    }
    .arrow { color: var(--vscode-descriptionForeground, #888); font-size: 14px; }

    /* ---- Stats bar ---- */
    .stats-bar {
      display: flex;
      gap: 12px;
      padding: 5px 14px;
      background: var(--vscode-sideBar-background, #252526);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      flex-shrink: 0;
      align-items: center;
    }
    .stat { font-size: 12px; }
    .stat.add { color: #4ec9b0; }
    .stat.del { color: #f48771; }
    .stat.files { color: var(--vscode-descriptionForeground, #888); }
    .refresh-btn {
      margin-left: auto;
      background: transparent;
      border: 1px solid var(--vscode-button-border, #444);
      color: var(--vscode-button-foreground, #ccc);
      border-radius: 3px;
      padding: 2px 8px;
      cursor: pointer;
      font-size: 11px;
    }
    .refresh-btn:hover { background: var(--vscode-button-hoverBackground, #333); }

    /* ---- Layout ---- */
    .layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* ---- File list sidebar ---- */
    .file-list {
      width: 240px;
      min-width: 160px;
      flex-shrink: 0;
      overflow-y: auto;
      border-right: 1px solid var(--vscode-panel-border, #333);
      background: var(--vscode-sideBar-background, #252526);
    }
    .file-list ul { list-style: none; }
    .file-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 12px;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
    }
    .file-item:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
    .file-item.selected { background: var(--vscode-list-activeSelectionBackground, #094771); color: var(--vscode-list-activeSelectionForeground, #fff); }
    .file-icon { font-size: 10px; flex-shrink: 0; }
    .file-item.added .file-icon   { color: #4ec9b0; }
    .file-item.modified .file-icon { color: #dcdcaa; }
    .file-item.deleted .file-icon  { color: #f48771; }
    .file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
    .file-stats { font-size: 10px; flex-shrink: 0; }
    .file-stats .add { color: #4ec9b0; }
    .file-stats .del { color: #f48771; }

    /* ---- Diff viewer ---- */
    .diff-viewer {
      flex: 1;
      overflow: auto;
      padding: 0;
    }
    .diff-table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      font-size: 12px;
      line-height: 1.5;
      table-layout: fixed;
    }
    .diff-table col.ln { width: 44px; }
    .diff-table col.code { width: auto; }
    td.ln {
      width: 44px;
      min-width: 44px;
      padding: 0 6px;
      text-align: right;
      color: var(--vscode-editorLineNumber-foreground, #5a5a5a);
      background: var(--vscode-editor-background);
      user-select: none;
      border-right: 1px solid var(--vscode-panel-border, #333);
      white-space: nowrap;
    }
    td.code {
      padding: 0 8px;
      white-space: pre;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    tr.added   td { background: rgba(70, 149, 74, 0.18); }
    tr.added   td.code::before { content: '+'; color: #4ec9b0; margin-right: 4px; }
    tr.removed td { background: rgba(200, 60, 60, 0.18); }
    tr.removed td.code::before { content: '-'; color: #f48771; margin-right: 4px; }
    tr.header  td { background: var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d); color: var(--vscode-descriptionForeground, #888); font-weight: 600; }
    tr.header  td.code { font-family: var(--vscode-font-family); }

    .empty-diff, .loading-diff {
      padding: 20px;
      color: var(--vscode-descriptionForeground, #888);
      font-style: italic;
    }
    .loading { padding: 8px 10px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .open-file-btn {
      float: right;
      background: transparent;
      border: none;
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      font-size: 11px;
      padding: 0 6px;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Checkpoint Diff</h1>
    <span class="checkpoint-badge">${this._escape(fromLabel)}</span>
    <span class="arrow">→</span>
    <span class="checkpoint-badge">${this._escape(toLabel)}</span>
  </div>

  <div class="stats-bar">
    ${statsHtml}
    <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
  </div>

  <div class="layout">
    <nav class="file-list" id="fileList">
      <ul>${fileListHtml}</ul>
    </nav>
    <main class="diff-viewer" id="diffViewer">
      ${diffBodyHtml}
    </main>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ---- File list click handler ----
    document.getElementById('fileList').addEventListener('click', (e) => {
      const item = e.target.closest('.file-item');
      if (!item) return;
      const path = item.dataset.path;
      if (!path) return;
      document.querySelectorAll('.file-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      vscode.postMessage({ command: 'selectFile', filePath: path });
    });

    // ---- Refresh button ----
    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'requestRefresh' });
    });

    // ---- Open-in-editor buttons (delegated) ----
    document.getElementById('diffViewer').addEventListener('click', (e) => {
      const btn = e.target.closest('.open-file-btn');
      if (!btn) return;
      vscode.postMessage({ command: 'openFileInEditor', filePath: btn.dataset.path });
    });

    // ---- Messages from extension host ----
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.command) {
        case 'updateDiff':
          // Full re-render is handled server-side; page will be replaced.
          break;
        case 'updateSelectedFile':
          document.querySelectorAll('.file-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.path === msg.filePath);
          });
          break;
        case 'error':
          document.getElementById('diffViewer').innerHTML =
            '<div class="empty-diff">Error: ' + escapeHtml(msg.message) + '</div>';
          break;
      }
    });

    function escapeHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
  </script>
</body>
</html>`;
  }

  private _renderFileDiff(file: FileDiff): string {
    const openBtn = `<button class="open-file-btn" data-path="${this._escape(file.path)}">Open file</button>`;
    const heading = `<div style="padding:6px 10px;background:var(--vscode-editorGroupHeader-tabsBackground,#2d2d2d);font-size:12px;border-bottom:1px solid var(--vscode-panel-border,#333);">
      <strong>${this._escape(file.path)}</strong>${openBtn}
    </div>`;

    if (!file.lines) {
      return heading + '<div class="empty-diff">Binary file or diff unavailable.</div>';
    }

    const rows = file.lines
      .map((line) => {
        const cls =
          line.type === 'added'
            ? 'added'
            : line.type === 'removed'
            ? 'removed'
            : line.type === 'header'
            ? 'header'
            : 'context';
        const lnFrom = line.lineNumberFrom !== null ? String(line.lineNumberFrom) : '';
        const lnTo = line.lineNumberTo !== null ? String(line.lineNumberTo) : '';
        return `<tr class="${cls}">
          <td class="ln">${this._escape(lnFrom)}</td>
          <td class="ln">${this._escape(lnTo)}</td>
          <td class="code">${this._escape(line.content)}</td>
        </tr>`;
      })
      .join('\n');

    return (
      heading +
      `<table class="diff-table">
        <colgroup><col class="ln"/><col class="ln"/><col class="code"/></colgroup>
        <tbody>${rows}</tbody>
      </table>`
    );
  }

  // ---------------------------------------------------------------------------
  // Private – utilities
  // ---------------------------------------------------------------------------

  private _escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private _basename(filePath: string): string {
    return filePath.split('/').pop() ?? filePath;
  }

  private _nonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  private _dispose(): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
    CheckpointDiffPanel._instance = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `aitm.diff.openPanel` command.
 * Call this from extension.ts during activation.
 */
export function registerCheckpointDiffCommand(
  context: vscode.ExtensionContext,
): void {
  const cmd = vscode.commands.registerCommand(
    'aitm.diff.openPanel',
    (fromId?: string, toId?: string) => {
      const from = fromId ?? 'HEAD~1';
      const to = toId ?? 'HEAD';
      CheckpointDiffPanel.open(context.extensionUri, from, to);
    },
  );
  context.subscriptions.push(cmd);
}
