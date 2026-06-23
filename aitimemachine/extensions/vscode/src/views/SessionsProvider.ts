import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  title?: string;
  project?: string;
  created_at: string;
  updated_at?: string;
  checkpoint_count?: number;
}

interface SessionCheckpoint {
  id: string;
  description: string;
  timestamp: string;
  stats?: {
    totalFiles: number;
    totalSize: number;
  };
}

type SessionTreeItem = SessionGroupItem | SessionItem | CheckpointItem;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiUrl(): string {
  const configUrl = vscode.workspace
    .getConfiguration('aitm')
    .get<string>('apiUrl');
  return configUrl || process.env['AITM_API_URL'] || 'http://localhost:4000';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function groupSessionsByDate(sessions: Session[]): Map<string, Session[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const groups = new Map<string, Session[]>([
    ['Today', []],
    ['Yesterday', []],
    ['Older', []],
  ]);

  for (const session of sessions) {
    const date = new Date(session.created_at);
    if (date >= todayStart) {
      groups.get('Today')!.push(session);
    } else if (date >= yesterdayStart) {
      groups.get('Yesterday')!.push(session);
    } else {
      groups.get('Older')!.push(session);
    }
  }

  // Remove empty groups
  for (const [key, value] of groups) {
    if (value.length === 0) {
      groups.delete(key);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Tree items
// ---------------------------------------------------------------------------

export class SessionGroupItem extends vscode.TreeItem {
  readonly itemType = 'group' as const;

  constructor(
    public readonly groupLabel: string,
    public readonly sessions: Session[],
  ) {
    super(groupLabel, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`;
    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'sessionGroup';
  }
}

export class SessionItem extends vscode.TreeItem {
  readonly itemType = 'session' as const;

  constructor(public readonly session: Session) {
    const shortId = session.id.slice(-8);
    const label = session.title || `Session ${shortId}`;
    super(
      label,
      session.checkpoint_count && session.checkpoint_count > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    const date = new Date(session.created_at);
    this.description = getTimeAgo(date);
    this.tooltip = new vscode.MarkdownString(
      [
        `**${label}**`,
        ``,
        `ID: \`${session.id}\``,
        `Created: ${date.toLocaleString()}`,
        session.project ? `Project: ${session.project}` : '',
        session.checkpoint_count != null
          ? `Checkpoints: ${session.checkpoint_count}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    this.iconPath = new vscode.ThemeIcon(
      'history',
      new vscode.ThemeColor('charts.blue'),
    );
    this.contextValue = 'session';

    // Clicking a session opens its detail webview
    this.command = {
      command: 'aitm.sessions.openDetail',
      title: 'Open Session Detail',
      arguments: [this.session],
    };
  }
}

export class CheckpointItem extends vscode.TreeItem {
  readonly itemType = 'checkpoint' as const;

  constructor(
    public readonly checkpoint: SessionCheckpoint,
    public readonly sessionId: string,
  ) {
    super(checkpoint.description, vscode.TreeItemCollapsibleState.None);

    const date = new Date(checkpoint.timestamp);
    this.description = getTimeAgo(date);
    this.tooltip = new vscode.MarkdownString(
      [
        `**${checkpoint.description}**`,
        ``,
        `ID: \`${checkpoint.id}\``,
        `Time: ${date.toLocaleString()}`,
        checkpoint.stats
          ? `Files: ${checkpoint.stats.totalFiles}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );

    this.iconPath = new vscode.ThemeIcon('save');
    this.contextValue = 'sessionCheckpoint';
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class SessionsProvider
  implements vscode.TreeDataProvider<SessionTreeItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<SessionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _sessions: Session[] = [];
  private _checkpointCache = new Map<string, SessionCheckpoint[]>();
  private _isLoading = false;
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this._registerCommands();
    this._startAutoRefresh();
    // Initial load
    this.refresh();
  }

  // ---------------------------------------------------------------------------
  // TreeDataProvider implementation
  // ---------------------------------------------------------------------------

  getTreeItem(element: SessionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
    if (!element) {
      return this._getRootItems();
    }

    if (element instanceof SessionGroupItem) {
      return element.sessions.map((s) => new SessionItem(s));
    }

    if (element instanceof SessionItem) {
      return this._getCheckpointItems(element.session.id);
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  refresh(): void {
    this._loadSessions();
  }

  dispose(): void {
    if (this._refreshTimer !== undefined) {
      clearInterval(this._refreshTimer);
    }
    for (const d of this._disposables) {
      d.dispose();
    }
    this._onDidChangeTreeData.dispose();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _getRootItems(): SessionTreeItem[] {
    if (this._isLoading && this._sessions.length === 0) {
      const loading = new vscode.TreeItem('Loading sessions...');
      loading.iconPath = new vscode.ThemeIcon('loading~spin');
      // Cast via unknown for the loading placeholder — not a real tree node type
      return [loading as unknown as SessionTreeItem];
    }

    if (this._sessions.length === 0) {
      const empty = new vscode.TreeItem('No sessions found');
      empty.iconPath = new vscode.ThemeIcon('info');
      empty.description = 'Create a checkpoint to start';
      return [empty as unknown as SessionTreeItem];
    }

    const groups = groupSessionsByDate(this._sessions);
    const items: SessionTreeItem[] = [];
    for (const [groupLabel, sessions] of groups) {
      items.push(new SessionGroupItem(groupLabel, sessions));
    }
    return items;
  }

  private async _getCheckpointItems(
    sessionId: string,
  ): Promise<SessionTreeItem[]> {
    const cached = this._checkpointCache.get(sessionId);
    if (cached) {
      return cached.map((cp) => new CheckpointItem(cp, sessionId));
    }

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(
        `${apiUrl}/v1/sessions/${sessionId}/checkpoints`,
      );
      if (!response.ok) {
        return [];
      }

      const body = (await response.json()) as
        | SessionCheckpoint[]
        | { data?: SessionCheckpoint[] };
      const checkpoints = Array.isArray(body)
        ? body
        : (body as { data?: SessionCheckpoint[] }).data ?? [];

      this._checkpointCache.set(sessionId, checkpoints);
      return checkpoints.map((cp) => new CheckpointItem(cp, sessionId));
    } catch {
      return [];
    }
  }

  private async _loadSessions(): Promise<void> {
    this._isLoading = true;
    this._onDidChangeTreeData.fire();

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/v1/sessions`);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText}`,
        );
      }

      const body = (await response.json()) as
        | Session[]
        | { data?: Session[] };
      this._sessions = Array.isArray(body)
        ? body
        : (body as { data?: Session[] }).data ?? [];

      // Invalidate checkpoint cache on full refresh
      this._checkpointCache.clear();
    } catch (error: unknown) {
      // Silently swallow in auto-refresh; show error only on manual refresh
      if (!this._refreshTimer) {
        vscode.window.showErrorMessage(
          `AITM Sessions: ${getErrorMessage(error)}`,
        );
      }
    } finally {
      this._isLoading = false;
      this._onDidChangeTreeData.fire();
    }
  }

  private _startAutoRefresh(): void {
    this._refreshTimer = setInterval(() => {
      this._loadSessions();
    }, 30_000);
  }

  private _registerCommands(): void {
    this._disposables.push(
      vscode.commands.registerCommand(
        'aitm.sessions.refreshView',
        () => this.refresh(),
      ),

      vscode.commands.registerCommand(
        'aitm.sessions.openDetail',
        (session: Session) => {
          SessionDetailPanel.show(this.context.extensionUri, session);
        },
      ),

      vscode.commands.registerCommand(
        'aitm.sessions.restoreSession',
        async (item: SessionItem) => {
          await this._restoreSession(item.session);
        },
      ),

      vscode.commands.registerCommand(
        'aitm.sessions.createCheckpointHere',
        async (item: SessionItem) => {
          await this._createCheckpoint(item.session.id);
        },
      ),

      vscode.commands.registerCommand(
        'aitm.sessions.copyId',
        (item: SessionItem | CheckpointItem) => {
          const id =
            item instanceof SessionItem
              ? item.session.id
              : item.checkpoint.id;
          vscode.env.clipboard.writeText(id);
          vscode.window.showInformationMessage(`Copied ID: ${id}`);
        },
      ),

      vscode.commands.registerCommand(
        'aitm.sessions.restoreCheckpoint',
        async (item: CheckpointItem) => {
          await this._restoreCheckpoint(item.checkpoint, item.sessionId);
        },
      ),
    );
  }

  private async _restoreSession(session: Session): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Restore session "${session.title || session.id}"? This will replace current files.`,
      { modal: true },
      'Restore',
    );
    if (confirm !== 'Restore') {
      return;
    }

    const apiUrl = getApiUrl();
    try {
      const response = await fetch(
        `${apiUrl}/v1/restore/${session.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      vscode.window.showInformationMessage(
        `Restored session: ${session.title || session.id}`,
      );
      this.refresh();
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        `Failed to restore session: ${getErrorMessage(error)}`,
      );
    }
  }

  private async _restoreCheckpoint(
    checkpoint: SessionCheckpoint,
    sessionId: string,
  ): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Restore to checkpoint "${checkpoint.description}"?`,
      { modal: true },
      'Restore',
    );
    if (confirm !== 'Restore') {
      return;
    }

    const apiUrl = getApiUrl();
    try {
      const response = await fetch(
        `${apiUrl}/v1/sessions/${sessionId}/restore/${checkpoint.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      vscode.window.showInformationMessage(
        `Restored to: ${checkpoint.description}`,
      );
      this.refresh();
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        `Failed to restore checkpoint: ${getErrorMessage(error)}`,
      );
    }
  }

  private async _createCheckpoint(sessionId: string): Promise<void> {
    const description = await vscode.window.showInputBox({
      prompt: 'Checkpoint description',
      placeHolder: 'e.g., Before refactoring auth module',
      ignoreFocusOut: true,
    });
    if (!description) {
      return;
    }

    const apiUrl = getApiUrl();
    try {
      const response = await fetch(`${apiUrl}/v1/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, sessionId }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      vscode.window.showInformationMessage(`Checkpoint created: ${description}`);
      this._checkpointCache.delete(sessionId);
      this.refresh();
    } catch (error: unknown) {
      vscode.window.showErrorMessage(
        `Failed to create checkpoint: ${getErrorMessage(error)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Session detail webview panel
// ---------------------------------------------------------------------------

export class SessionDetailPanel {
  private static _current: SessionDetailPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;

  static show(extensionUri: vscode.Uri, session: Session): void {
    if (SessionDetailPanel._current) {
      SessionDetailPanel._current._update(session);
      SessionDetailPanel._current._panel.reveal(vscode.ViewColumn.Two);
      return;
    }
    SessionDetailPanel._current = new SessionDetailPanel(extensionUri, session);
  }

  private constructor(extensionUri: vscode.Uri, session: Session) {
    this._panel = vscode.window.createWebviewPanel(
      'aitmSessionDetail',
      `Session: ${session.title || session.id.slice(-8)}`,
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this._update(session);
    this._panel.onDidDispose(() => {
      SessionDetailPanel._current = undefined;
    });
  }

  private _update(session: Session): void {
    this._panel.title = `Session: ${session.title || session.id.slice(-8)}`;
    this._panel.webview.html = this._getHtml(session);
  }

  private _getHtml(session: Session): string {
    const shortId = session.id.slice(-8);
    const date = new Date(session.created_at).toLocaleString();
    const updatedAt = session.updated_at
      ? new Date(session.updated_at).toLocaleString()
      : '—';
    const checkpoints = session.checkpoint_count ?? 0;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Session Detail</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    h2 { margin: 0 0 4px; font-size: 16px; }
    .subtitle { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 20px; }
    .card {
      background: var(--vscode-list-inactiveSelectionBackground);
      border-radius: 6px;
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    .row { display: flex; gap: 8px; margin-bottom: 6px; font-size: 13px; }
    .label { color: var(--vscode-descriptionForeground); min-width: 100px; }
    .actions { display: flex; gap: 8px; margin-top: 16px; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    button.secondary {
      background: transparent;
      border: 1px solid var(--vscode-panel-border);
      color: var(--vscode-foreground);
    }
    button:hover { opacity: 0.85; }
    code {
      background: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h2>${escapeForHtml(session.title || `Session ${shortId}`)}</h2>
  <div class="subtitle">ID: <code>${escapeForHtml(session.id)}</code></div>

  <div class="card">
    <div class="row"><span class="label">Created</span><span>${escapeForHtml(date)}</span></div>
    <div class="row"><span class="label">Last updated</span><span>${escapeForHtml(updatedAt)}</span></div>
    ${session.project ? `<div class="row"><span class="label">Project</span><span>${escapeForHtml(session.project)}</span></div>` : ''}
    <div class="row"><span class="label">Checkpoints</span><span>${checkpoints}</span></div>
  </div>

  <div class="actions">
    <button onclick="restore()">Restore Session</button>
    <button class="secondary" onclick="copyId()">Copy ID</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function restore() {
      vscode.postMessage({ type: 'restore', sessionId: '${escapeForHtml(session.id)}' });
    }
    function copyId() {
      vscode.postMessage({ type: 'copyId', id: '${escapeForHtml(session.id)}' });
    }
  </script>
</body>
</html>`;
  }
}

function escapeForHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
