/**
 * GitNexus Code Intelligence Commands
 *
 * Proxies all operations to GITNEXUS_URL (config: aitm.gitnexusUrl, default http://localhost:3001)
 * using JSON-RPC 2.0 via POST /message.
 *
 * Registered commands:
 *   aitm.gitnexus.query          - Natural-language query against the indexed codebase
 *   aitm.gitnexus.impact         - Impact analysis for the selected symbol
 *   aitm.gitnexus.context        - 360° context for the symbol under the cursor
 *   aitm.gitnexus.detectChanges  - Detect changes in the current workspace
 *   aitm.gitnexus.analyze        - Index / analyse the current workspace
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!_outputChannel) {
    _outputChannel = vscode.window.createOutputChannel('GitNexus');
  }
  return _outputChannel;
}

function getGitNexusUrl(): string {
  const config = vscode.workspace.getConfiguration('aitm');
  return config.get<string>('gitnexusUrl', 'http://localhost:3001');
}

let _rpcId = 1;

async function callGitNexus<T = unknown>(
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  const url = `${getGitNexusUrl()}/message`;
  const body: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: _rpcId++,
    method,
    params,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`GitNexus server returned HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as JsonRpcResponse<T>;

  if (json.error) {
    throw new Error(`GitNexus RPC error [${json.error.code}]: ${json.error.message}`);
  }

  return json.result as T;
}

function getWorkspaceRoot(): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    throw new Error('No workspace folder is open.');
  }
  return root;
}

function getSymbolUnderCursor(editor: vscode.TextEditor): string | undefined {
  const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
  return wordRange ? editor.document.getText(wordRange) : undefined;
}

function formatResultForOutput(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  return JSON.stringify(result, null, 2);
}

// ---------------------------------------------------------------------------
// Command: aitm.gitnexus.query
// ---------------------------------------------------------------------------

async function commandQuery(): Promise<void> {
  const query = await vscode.window.showInputBox({
    prompt: 'Enter a natural-language query for GitNexus',
    placeHolder: 'e.g. where is authentication handled?',
    ignoreFocusOut: true,
  });

  if (!query) {
    return;
  }

  const channel = getOutputChannel();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'GitNexus: querying...',
      cancellable: false,
    },
    async () => {
      try {
        const result = await callGitNexus('query', { query });

        channel.show(true);
        channel.appendLine('');
        channel.appendLine(`=== GitNexus Query: ${query} ===`);
        channel.appendLine(formatResultForOutput(result));
        channel.appendLine('');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`GitNexus query failed: ${message}`);
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Command: aitm.gitnexus.impact
// ---------------------------------------------------------------------------

async function commandImpact(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  let symbolName: string | undefined;

  if (editor) {
    symbolName = getSymbolUnderCursor(editor);
  }

  if (!symbolName) {
    symbolName = await vscode.window.showInputBox({
      prompt: 'Enter the symbol name to analyse impact for',
      placeHolder: 'e.g. UserService',
      ignoreFocusOut: true,
    });
  }

  if (!symbolName) {
    return;
  }

  const filePath = editor?.document.uri.fsPath;

  const channel = getOutputChannel();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `GitNexus: analysing impact of "${symbolName}"...`,
      cancellable: false,
    },
    async () => {
      try {
        const params: Record<string, unknown> = { symbol: symbolName };
        if (filePath) {
          params['filePath'] = filePath;
        }

        const result = await callGitNexus('impact_analysis', params);

        channel.show(true);
        channel.appendLine('');
        channel.appendLine(`=== GitNexus Impact Analysis: ${symbolName} ===`);
        channel.appendLine(formatResultForOutput(result));
        channel.appendLine('');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`GitNexus impact analysis failed: ${message}`);
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Command: aitm.gitnexus.context
// ---------------------------------------------------------------------------

async function commandContext(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage('GitNexus: no active editor — open a file first.');
    return;
  }

  const symbolName = getSymbolUnderCursor(editor);

  if (!symbolName) {
    vscode.window.showInformationMessage(
      'GitNexus: place the cursor on a symbol to retrieve its 360° context.'
    );
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const line = editor.selection.active.line + 1; // 1-based
  const column = editor.selection.active.character + 1;

  const channel = getOutputChannel();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `GitNexus: loading context for "${symbolName}"...`,
      cancellable: false,
    },
    async () => {
      try {
        const result = await callGitNexus('get_context', {
          symbol: symbolName,
          filePath,
          line,
          column,
        });

        channel.show(true);
        channel.appendLine('');
        channel.appendLine(`=== GitNexus 360° Context: ${symbolName} (${filePath}:${line}) ===`);
        channel.appendLine(formatResultForOutput(result));
        channel.appendLine('');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`GitNexus context failed: ${message}`);
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Command: aitm.gitnexus.detectChanges
// ---------------------------------------------------------------------------

async function commandDetectChanges(): Promise<void> {
  let workspaceRoot: string;
  try {
    workspaceRoot = getWorkspaceRoot();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`GitNexus: ${message}`);
    return;
  }

  const channel = getOutputChannel();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'GitNexus: detecting changes...',
      cancellable: false,
    },
    async () => {
      try {
        const result = await callGitNexus('detect_changes', {
          workspaceRoot,
        });

        channel.show(true);
        channel.appendLine('');
        channel.appendLine('=== GitNexus Change Detection Report ===');
        channel.appendLine(`Workspace: ${workspaceRoot}`);
        channel.appendLine(formatResultForOutput(result));
        channel.appendLine('');

        vscode.window.showInformationMessage(
          'GitNexus: change detection complete — see Output panel for the report.'
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`GitNexus detect changes failed: ${message}`);
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Command: aitm.gitnexus.analyze
// ---------------------------------------------------------------------------

async function commandAnalyze(): Promise<void> {
  let workspaceRoot: string;
  try {
    workspaceRoot = getWorkspaceRoot();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`GitNexus: ${message}`);
    return;
  }

  const channel = getOutputChannel();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'GitNexus: indexing workspace...',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: workspaceRoot });
      try {
        const result = await callGitNexus('analyze', {
          workspaceRoot,
        });

        channel.show(true);
        channel.appendLine('');
        channel.appendLine('=== GitNexus Workspace Analysis ===');
        channel.appendLine(`Workspace: ${workspaceRoot}`);
        channel.appendLine(formatResultForOutput(result));
        channel.appendLine('');

        vscode.window.showInformationMessage(
          'GitNexus: workspace indexing complete — see Output panel for details.'
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`GitNexus analyze failed: ${message}`);
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all GitNexus commands with the VS Code extension context.
 *
 * Call this from the extension's `activate` function:
 *
 *   import { registerGitNexusCommands } from './commands/gitnexus';
 *   registerGitNexusCommands(context);
 */
export function registerGitNexusCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.gitnexus.query', commandQuery),
    vscode.commands.registerCommand('aitm.gitnexus.impact', commandImpact),
    vscode.commands.registerCommand('aitm.gitnexus.context', commandContext),
    vscode.commands.registerCommand('aitm.gitnexus.detectChanges', commandDetectChanges),
    vscode.commands.registerCommand('aitm.gitnexus.analyze', commandAnalyze)
  );

  // Dispose the shared output channel when the extension is deactivated.
  context.subscriptions.push({
    dispose: () => {
      _outputChannel?.dispose();
      _outputChannel = undefined;
    },
  });
}
