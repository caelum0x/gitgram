/**
 * AITM Cloud Sync Commands
 *
 * Reads AITM_API_URL from workspace config (aitm.apiUrl) or the
 * AITM_API_URL environment variable, falling back to http://localhost:4000.
 *
 * Registered commands:
 *   aitm.sync.push             - Push current project state to cloud
 *   aitm.sync.pull             - Pull latest checkpoint from cloud (QuickPick)
 *   aitm.sync.status           - Open webview panel showing local vs remote state
 *   aitm.sync.enableAutoSync   - Toggle workspace setting aitm.sync.enabled
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RemoteCheckpoint {
  id: string;
  description?: string;
  created_at: string;
  size_bytes?: number;
  is_latest?: boolean;
}

interface PushResult {
  checkpointId?: string;
  id?: string;
  description?: string;
  timestamp?: string;
}

interface PullResult {
  success?: boolean;
  message?: string;
  restoredAt?: string;
}

interface SyncStatus {
  local_checkpoint?: string;
  remote_checkpoint?: string;
  last_sync_at?: string;
  pending_changes?: number;
  in_sync?: boolean;
}

// ---------------------------------------------------------------------------
// Module-level status bar item (created lazily, disposed on deactivation)
// ---------------------------------------------------------------------------

let autoSyncStatusBarItem: vscode.StatusBarItem | undefined;

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchRemoteCheckpoints(apiUrl: string): Promise<RemoteCheckpoint[]> {
  const response = await fetch(`${apiUrl}/v1/sync/checkpoints`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch remote checkpoints: ${response.status} ${response.statusText}`);
  }

  const body = await response.json() as { data?: RemoteCheckpoint[] } | RemoteCheckpoint[];
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) {
    return body.data;
  }
  return [];
}

async function fetchSyncStatus(apiUrl: string): Promise<SyncStatus> {
  const response = await fetch(`${apiUrl}/v1/sync/status`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sync status: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<SyncStatus>;
}

function buildStatusHtml(status: SyncStatus): string {
  const lastSync = status.last_sync_at
    ? new Date(status.last_sync_at).toLocaleString()
    : 'Never';

  const pendingCount = status.pending_changes ?? 0;
  const inSync = status.in_sync ?? false;

  const syncBadge = inSync
    ? '<span class="badge badge-ok">In Sync</span>'
    : '<span class="badge badge-warn">Out of Sync</span>';

  const pendingRow = pendingCount > 0
    ? `<tr><td>Pending changes</td><td class="warn">${pendingCount}</td></tr>`
    : `<tr><td>Pending changes</td><td>0</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AITM Sync Status</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 24px 32px;
      margin: 0;
    }
    h1 { font-size: 1.3em; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; max-width: 520px; }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-widget-border, #333);
    }
    td:first-child { color: var(--vscode-descriptionForeground); width: 50%; }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 600;
    }
    .badge-ok { background: #1a7340; color: #a8f0c6; }
    .badge-warn { background: #7a4d00; color: #ffd080; }
    .warn { color: var(--vscode-charts-orange, #d89028); font-weight: 600; }
    .mono { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.92em; }
  </style>
</head>
<body>
  <h1>AITM Cloud Sync Status</h1>
  <table>
    <tr><td>Status</td><td>${syncBadge}</td></tr>
    <tr><td>Local checkpoint</td><td class="mono">${status.local_checkpoint ?? '—'}</td></tr>
    <tr><td>Remote checkpoint</td><td class="mono">${status.remote_checkpoint ?? '—'}</td></tr>
    <tr><td>Last sync</td><td>${lastSync}</td></tr>
    ${pendingRow}
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

/**
 * aitm.sync.push
 * Pushes the current project state to the cloud as a new checkpoint.
 */
async function syncPush(): Promise<void> {
  const apiUrl = getApiUrl();

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Pushing state to cloud...',
        cancellable: false,
      },
      async () => {
        const response = await fetch(`${apiUrl}/v1/sync/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status} ${response.statusText}: ${text}`);
        }

        return response.json() as Promise<PushResult>;
      }
    );

    const checkpointId = result.checkpointId ?? result.id ?? 'unknown';
    vscode.window.showInformationMessage(
      `AITM: Pushed checkpoint ${checkpointId} to cloud`
    );
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Push failed — ${getErrorMessage(error)}`);
  }
}

/**
 * aitm.sync.pull
 * Shows a QuickPick of available remote checkpoints, then restores the selected one.
 */
async function syncPull(): Promise<void> {
  const apiUrl = getApiUrl();

  let checkpoints: RemoteCheckpoint[];
  try {
    checkpoints = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Fetching remote checkpoints...',
        cancellable: false,
      },
      () => fetchRemoteCheckpoints(apiUrl)
    );
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Failed to fetch remote checkpoints — ${getErrorMessage(error)}`);
    return;
  }

  if (checkpoints.length === 0) {
    vscode.window.showInformationMessage('AITM: No remote checkpoints available.');
    return;
  }

  const items: Array<vscode.QuickPickItem & { checkpoint: RemoteCheckpoint }> = checkpoints.map((c) => {
    const sizeLabel = c.size_bytes != null ? ` · ${formatBytes(c.size_bytes)}` : '';
    const latestLabel = c.is_latest ? ' $(check) latest' : '';
    return {
      label: c.description ?? c.id,
      description: new Date(c.created_at).toLocaleString() + latestLabel,
      detail: `ID: ${c.id}${sizeLabel}`,
      checkpoint: c,
    };
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `${checkpoints.length} remote checkpoint${checkpoints.length !== 1 ? 's' : ''} — select to restore`,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    return;
  }

  const { checkpoint } = selected;

  const confirm = await vscode.window.showWarningMessage(
    `Restore to remote checkpoint "${checkpoint.description ?? checkpoint.id}"? This will replace your current workspace files.`,
    { modal: true },
    'Restore'
  );

  if (confirm !== 'Restore') {
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Pulling checkpoint "${checkpoint.description ?? checkpoint.id}"...`,
        cancellable: false,
      },
      async () => {
        const response = await fetch(
          `${apiUrl}/v1/sync/pull/${encodeURIComponent(checkpoint.id)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status} ${response.statusText}: ${text}`);
        }

        return response.json() as Promise<PullResult>;
      }
    );

    vscode.window.showInformationMessage(
      `AITM: Restored to remote checkpoint "${checkpoint.description ?? checkpoint.id}"`
    );
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Pull failed — ${getErrorMessage(error)}`);
  }
}

/**
 * aitm.sync.status
 * Opens a webview panel showing local vs remote state comparison.
 */
async function syncStatus(): Promise<void> {
  const apiUrl = getApiUrl();

  const panel = vscode.window.createWebviewPanel(
    'aitm.syncStatus',
    'AITM Sync Status',
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );

  panel.webview.html = '<html><body><p>Loading sync status...</p></body></html>';

  let status: SyncStatus;
  try {
    status = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Fetching sync status...',
        cancellable: false,
      },
      () => fetchSyncStatus(apiUrl)
    );
  } catch (error: unknown) {
    panel.dispose();
    vscode.window.showErrorMessage(`AITM: Failed to fetch sync status — ${getErrorMessage(error)}`);
    return;
  }

  panel.webview.html = buildStatusHtml(status);
}

/**
 * aitm.sync.enableAutoSync
 * Toggles the workspace setting aitm.sync.enabled and updates the status bar item.
 */
async function enableAutoSync(): Promise<void> {
  const config = vscode.workspace.getConfiguration('aitm');
  const current = config.get<boolean>('sync.enabled', false);
  const next = !current;

  try {
    await config.update('sync.enabled', next, vscode.ConfigurationTarget.Workspace);
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Failed to update setting — ${getErrorMessage(error)}`);
    return;
  }

  if (next) {
    if (!autoSyncStatusBarItem) {
      autoSyncStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        90
      );
      autoSyncStatusBarItem.command = 'aitm.sync.enableAutoSync';
      autoSyncStatusBarItem.tooltip = 'AITM auto-sync is ON — click to disable';
    }
    autoSyncStatusBarItem.text = '$(cloud-upload) AITM Sync';
    autoSyncStatusBarItem.show();
    vscode.window.showInformationMessage('AITM: Auto-sync enabled.');
  } else {
    autoSyncStatusBarItem?.hide();
    vscode.window.showInformationMessage('AITM: Auto-sync disabled.');
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all aitm.sync.* commands against the extension context.
 * The auto-sync status bar item is also pushed to context.subscriptions
 * so it is disposed when the extension is deactivated.
 */
export function registerSyncCommands(context: vscode.ExtensionContext): void {
  // Reflect persisted setting on startup
  const enabled = vscode.workspace
    .getConfiguration('aitm')
    .get<boolean>('sync.enabled', false);

  if (enabled) {
    autoSyncStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      90
    );
    autoSyncStatusBarItem.command = 'aitm.sync.enableAutoSync';
    autoSyncStatusBarItem.tooltip = 'AITM auto-sync is ON — click to disable';
    autoSyncStatusBarItem.text = '$(cloud-upload) AITM Sync';
    autoSyncStatusBarItem.show();
    context.subscriptions.push(autoSyncStatusBarItem);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.sync.push', syncPush),
    vscode.commands.registerCommand('aitm.sync.pull', syncPull),
    vscode.commands.registerCommand('aitm.sync.status', syncStatus),
    vscode.commands.registerCommand('aitm.sync.enableAutoSync', enableAutoSync)
  );
}
