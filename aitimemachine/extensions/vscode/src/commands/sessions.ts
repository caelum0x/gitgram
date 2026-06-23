/**
 * AITM Session Management Commands
 *
 * Reads AITM_API_URL from workspace config (aitm.apiUrl) or the
 * AITM_API_URL environment variable, falling back to http://localhost:4000.
 *
 * Registered commands:
 *   aitm.sessions.list           - QuickPick of recent sessions from GET /v1/sessions
 *   aitm.sessions.checkpoint     - Create a checkpoint via POST /v1/checkpoint
 *   aitm.sessions.restore        - QuickPick of sessions, then POST /v1/restore/:sessionId
 *   aitm.sessions.openDashboard  - Open AITM_WEBSITE_URL in the default browser
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  title?: string;
  created_at: string;
  updated_at?: string;
  checkpoint_count?: number;
}

interface CheckpointResult {
  checkpointId?: string;
  id?: string;
  description?: string;
  timestamp?: string;
}

interface RestoreResult {
  success?: boolean;
  message?: string;
  restoredAt?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiUrl(): string {
  const configUrl = vscode.workspace
    .getConfiguration('aitm')
    .get<string>('apiUrl');
  return configUrl || process.env['AITM_API_URL'] || 'http://localhost:4000';
}

function getWebsiteUrl(): string {
  const configUrl = vscode.workspace
    .getConfiguration('aitm')
    .get<string>('websiteUrl');
  return configUrl || process.env['AITM_WEBSITE_URL'] || 'https://aitimemachine.io';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function fetchSessions(apiUrl: string): Promise<Session[]> {
  const response = await fetch(`${apiUrl}/v1/sessions`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.status} ${response.statusText}`);
  }

  const body = await response.json() as { data?: Session[] } | Session[];
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) {
    return body.data;
  }
  return [];
}

function formatSessionLabel(session: Session): string {
  const title = session.title || session.id;
  const date = new Date(session.created_at).toLocaleString();
  const checkpoints = session.checkpoint_count != null
    ? ` · ${session.checkpoint_count} checkpoint${session.checkpoint_count !== 1 ? 's' : ''}`
    : '';
  return `${title}${checkpoints} (${date})`;
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

/**
 * aitm.sessions.list
 * Shows a QuickPick with recent sessions fetched from the AITM API.
 */
async function listSessions(): Promise<void> {
  const apiUrl = getApiUrl();

  let sessions: Session[];
  try {
    sessions = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Fetching sessions...',
        cancellable: false,
      },
      () => fetchSessions(apiUrl)
    );
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Failed to fetch sessions — ${getErrorMessage(error)}`);
    return;
  }

  if (sessions.length === 0) {
    vscode.window.showInformationMessage('AITM: No sessions found.');
    return;
  }

  const items: Array<vscode.QuickPickItem & { session: Session }> = sessions.map((s) => ({
    label: s.title || s.id,
    description: new Date(s.created_at).toLocaleString(),
    detail: s.checkpoint_count != null
      ? `${s.checkpoint_count} checkpoint${s.checkpoint_count !== 1 ? 's' : ''} · ID: ${s.id}`
      : `ID: ${s.id}`,
    session: s,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `${sessions.length} session${sessions.length !== 1 ? 's' : ''} — select to view details`,
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (selected) {
    const { session } = selected;
    const updatedAt = session.updated_at
      ? `\nLast updated: ${new Date(session.updated_at).toLocaleString()}`
      : '';
    vscode.window.showInformationMessage(
      `AITM Session: ${session.title || session.id}\nCreated: ${new Date(session.created_at).toLocaleString()}${updatedAt}`
    );
  }
}

/**
 * aitm.sessions.checkpoint
 * Creates a checkpoint via POST /v1/checkpoint.
 */
async function createCheckpoint(): Promise<void> {
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
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Creating checkpoint...',
        cancellable: false,
      },
      async () => {
        const response = await fetch(`${apiUrl}/v1/checkpoint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status} ${response.statusText}: ${text}`);
        }

        return response.json() as Promise<CheckpointResult>;
      }
    );

    const checkpointId = (result as CheckpointResult).checkpointId ?? (result as CheckpointResult).id ?? 'unknown';
    vscode.window.showInformationMessage(
      `AITM: Checkpoint created — "${description}" (${checkpointId})`
    );
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Failed to create checkpoint — ${getErrorMessage(error)}`);
  }
}

/**
 * aitm.sessions.restore
 * Shows a QuickPick of sessions, then restores the selected one via POST /v1/restore/:sessionId.
 */
async function restoreSession(): Promise<void> {
  const apiUrl = getApiUrl();

  let sessions: Session[];
  try {
    sessions = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Fetching sessions...',
        cancellable: false,
      },
      () => fetchSessions(apiUrl)
    );
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Failed to fetch sessions — ${getErrorMessage(error)}`);
    return;
  }

  if (sessions.length === 0) {
    vscode.window.showInformationMessage('AITM: No sessions available to restore.');
    return;
  }

  const items: Array<vscode.QuickPickItem & { session: Session }> = sessions.map((s) => ({
    label: s.title || s.id,
    description: new Date(s.created_at).toLocaleString(),
    detail: s.checkpoint_count != null
      ? `${s.checkpoint_count} checkpoint${s.checkpoint_count !== 1 ? 's' : ''} · ID: ${s.id}`
      : `ID: ${s.id}`,
    session: s,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a session to restore',
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!selected) {
    return;
  }

  const { session } = selected;

  const confirm = await vscode.window.showWarningMessage(
    `Restore to session "${session.title || session.id}"? This will replace your current workspace files.`,
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
        title: `Restoring session "${session.title || session.id}"...`,
        cancellable: false,
      },
      async () => {
        const response = await fetch(`${apiUrl}/v1/restore/${encodeURIComponent(session.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status} ${response.statusText}: ${text}`);
        }

        return response.json() as Promise<RestoreResult>;
      }
    );

    vscode.window.showInformationMessage(
      `AITM: Restored to session "${session.title || session.id}"`
    );
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Restore failed — ${getErrorMessage(error)}`);
  }
}

/**
 * aitm.sessions.openDashboard
 * Opens the AITM website URL in the default external browser.
 */
async function openDashboard(): Promise<void> {
  const url = getWebsiteUrl();
  const uri = vscode.Uri.parse(url);
  const opened = await vscode.env.openExternal(uri);
  if (!opened) {
    vscode.window.showErrorMessage(`AITM: Could not open dashboard URL: ${url}`);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all aitm.sessions.* commands against the extension context.
 */
export function registerSessionCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.sessions.list', listSessions),
    vscode.commands.registerCommand('aitm.sessions.checkpoint', createCheckpoint),
    vscode.commands.registerCommand('aitm.sessions.restore', restoreSession),
    vscode.commands.registerCommand('aitm.sessions.openDashboard', openDashboard)
  );
}
