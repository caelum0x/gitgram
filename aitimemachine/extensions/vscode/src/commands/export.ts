/**
 * AITM Export Commands
 *
 * Reads AITM_API_URL from workspace config (aitm.apiUrl) or the
 * AITM_API_URL environment variable, falling back to http://localhost:4000.
 *
 * Registered commands:
 *   aitm.export.json         - Export sessions as a JSON file (save dialog)
 *   aitm.export.markdown     - Export sessions as markdown files (folder picker)
 *   aitm.export.openReport   - Generate and open an activity report webview
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportJsonResult {
  sessions?: unknown[];
  [key: string]: unknown;
}

interface MarkdownFile {
  filename: string;
  content: string;
}

interface MarkdownExportResult {
  files?: MarkdownFile[];
  [key: string]: unknown;
}

interface ReportResult {
  html?: string;
  title?: string;
  generated_at?: string;
  [key: string]: unknown;
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function buildReportHtml(report: ReportResult): string {
  if (report.html) {
    return report.html;
  }

  const title = report.title ?? 'AITM Activity Report';
  const generatedAt = report.generated_at
    ? new Date(report.generated_at).toLocaleString()
    : new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 24px 32px;
      margin: 0;
    }
    h1 { font-size: 1.3em; margin-bottom: 4px; }
    .meta { color: var(--vscode-descriptionForeground); margin-bottom: 20px; font-size: 0.9em; }
    pre {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      padding: 16px;
      border-radius: 4px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">Generated: ${generatedAt}</p>
  <pre>${JSON.stringify(report, null, 2)}</pre>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

/**
 * aitm.export.json
 * Calls GET /v1/export/json, opens a save dialog, then writes the file.
 */
async function exportJson(): Promise<void> {
  const apiUrl = getApiUrl();

  const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri
    ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'aitm-sessions.json')
    : undefined;

  const saveUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { JSON: ['json'] },
    saveLabel: 'Export',
    title: 'Export AITM Sessions as JSON',
  });

  if (!saveUri) {
    return;
  }

  let exportData: ExportJsonResult;
  try {
    exportData = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting sessions as JSON...',
        cancellable: false,
      },
      async () => {
        const response = await fetch(`${apiUrl}/v1/export/json`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status} ${response.statusText}: ${text}`);
        }

        return response.json() as Promise<ExportJsonResult>;
      }
    );
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Export failed — ${getErrorMessage(error)}`);
    return;
  }

  try {
    fs.writeFileSync(saveUri.fsPath, JSON.stringify(exportData, null, 2), 'utf8');
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Could not write file — ${getErrorMessage(error)}`);
    return;
  }

  const sessionCount = Array.isArray(exportData.sessions) ? exportData.sessions.length : '?';
  const open = await vscode.window.showInformationMessage(
    `AITM: Exported ${sessionCount} session${sessionCount !== 1 ? 's' : ''} to ${path.basename(saveUri.fsPath)}`,
    'Open File'
  );

  if (open === 'Open File') {
    await vscode.window.showTextDocument(saveUri);
  }
}

/**
 * aitm.export.markdown
 * Opens a folder picker, calls GET /v1/export/markdown, writes each returned file.
 */
async function exportMarkdown(): Promise<void> {
  const apiUrl = getApiUrl();

  const folderUris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select Export Folder',
    title: 'Export AITM Sessions as Markdown',
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });

  if (!folderUris || folderUris.length === 0) {
    return;
  }

  const folderPath = folderUris[0].fsPath;

  let result: MarkdownExportResult;
  try {
    result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting sessions as Markdown...',
        cancellable: false,
      },
      async () => {
        const response = await fetch(`${apiUrl}/v1/export/markdown`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status} ${response.statusText}: ${text}`);
        }

        return response.json() as Promise<MarkdownExportResult>;
      }
    );
  } catch (error: unknown) {
    vscode.window.showErrorMessage(`AITM: Markdown export failed — ${getErrorMessage(error)}`);
    return;
  }

  const files = result.files ?? [];
  if (files.length === 0) {
    vscode.window.showInformationMessage('AITM: No markdown files returned by server.');
    return;
  }

  const writeErrors: string[] = [];
  for (const file of files) {
    try {
      const filePath = path.join(folderPath, file.filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content, 'utf8');
    } catch (error: unknown) {
      writeErrors.push(`${file.filename}: ${getErrorMessage(error)}`);
    }
  }

  if (writeErrors.length > 0) {
    vscode.window.showWarningMessage(
      `AITM: ${files.length - writeErrors.length} of ${files.length} files written. Errors: ${writeErrors.join('; ')}`
    );
    return;
  }

  const open = await vscode.window.showInformationMessage(
    `AITM: Exported ${files.length} markdown file${files.length !== 1 ? 's' : ''} to ${folderPath}`,
    'Open Folder'
  );

  if (open === 'Open Folder') {
    await vscode.commands.executeCommand('revealFileInOS', folderUris[0]);
  }
}

/**
 * aitm.export.openReport
 * Calls GET /v1/export/report, then renders the result in a VS Code webview.
 */
async function openReport(): Promise<void> {
  const apiUrl = getApiUrl();

  const panel = vscode.window.createWebviewPanel(
    'aitm.activityReport',
    'AITM Activity Report',
    vscode.ViewColumn.Active,
    { enableScripts: false }
  );

  panel.webview.html = '<html><body><p>Generating report...</p></body></html>';

  let report: ReportResult;
  try {
    report = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Generating activity report...',
        cancellable: false,
      },
      async () => {
        const response = await fetch(`${apiUrl}/v1/export/report`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`${response.status} ${response.statusText}: ${text}`);
        }

        return response.json() as Promise<ReportResult>;
      }
    );
  } catch (error: unknown) {
    panel.dispose();
    vscode.window.showErrorMessage(`AITM: Report generation failed — ${getErrorMessage(error)}`);
    return;
  }

  panel.webview.html = buildReportHtml(report);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all aitm.export.* commands against the extension context.
 */
export function registerExportCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aitm.export.json', exportJson),
    vscode.commands.registerCommand('aitm.export.markdown', exportMarkdown),
    vscode.commands.registerCommand('aitm.export.openReport', openReport)
  );
}
