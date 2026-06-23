import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Information about a detected error
 */
interface ErrorInfo {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: vscode.DiagnosticSeverity;
  source?: string;
  code?: string | number;
  firstSeenCheckpoint?: string;
  firstSeenTimestamp?: string;
  relatedCheckpoint?: string;
  hash: string; // Unique identifier for error deduplication
}

/**
 * Snapshot of error state at a specific checkpoint
 */
interface CheckpointErrorState {
  checkpointId: string;
  checkpointDescription?: string;
  timestamp: string;
  errorCount: number;
  errorHashes: Set<string>;
  errors: ErrorInfo[];
}

/**
 * Correlation between an error and the checkpoint where it first appeared
 */
interface ErrorCheckpointCorrelation {
  errorHash: string;
  error: ErrorInfo;
  firstSeenCheckpoint: string;
  firstSeenCheckpointDescription?: string;
  firstSeenTimestamp: string;
  lastGoodCheckpoint?: string;
  lastGoodCheckpointDescription?: string;
}

/**
 * Suggestion for fixing an error by restoring to a checkpoint
 */
interface RestoreSuggestion {
  checkpointId: string;
  checkpointDescription: string;
  timestamp: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Result of a CLI bisect operation
 */
interface BisectResult {
  lastGoodCheckpoint: string;
  lastGoodCheckpointDescription?: string;
  firstBadCheckpoint: string;
  firstBadCheckpointDescription?: string;
  timestamp: string;
}

/**
 * ErrorDetectionProvider - Monitors VSCode diagnostics and correlates errors with checkpoints
 *
 * Features:
 * - Real-time error monitoring
 * - Error-to-checkpoint correlation
 * - "This error appeared after checkpoint X" messages
 * - Quick actions to restore to before an error appeared
 * - Binary search to find when errors were introduced
 */
export class ErrorDetectionProvider implements vscode.Disposable {
  private _disposables: vscode.Disposable[] = [];
  private _errorHistory: Map<string, ErrorCheckpointCorrelation> = new Map();
  private _checkpointStates: CheckpointErrorState[] = [];
  private _statusBarItem: vscode.StatusBarItem;
  private _diagnosticCollection: vscode.DiagnosticCollection;
  private _lastCheckpointId: string | null = null;
  private _lastCheckpointDescription: string | null = null;
  private _lastCheckpointTimestamp: string | null = null;
  private _debounceTimer: NodeJS.Timeout | undefined;
  private _outputChannel: vscode.OutputChannel;
  private _isInitialized = false;
  private _lastBisectResult: BisectResult | null = null;

  constructor() {
    // Create output channel for logging
    this._outputChannel = vscode.window.createOutputChannel('AITimeMachine Error Tracker');
    this._disposables.push(this._outputChannel);

    // Create status bar item for error tracking
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this._statusBarItem.command = 'aitm.showErrorAnalysis';
    this._statusBarItem.tooltip = 'AITimeMachine Error Tracker - Click to analyze errors';
    this._disposables.push(this._statusBarItem);

    // Create diagnostic collection for our checkpoint hints
    this._diagnosticCollection = vscode.languages.createDiagnosticCollection('aitm-error-hints');
    this._disposables.push(this._diagnosticCollection);

    // Watch for diagnostic changes
    this._disposables.push(
      vscode.languages.onDidChangeDiagnostics(this._onDiagnosticsChanged.bind(this))
    );

    // Initialize asynchronously
    this._initialize();

    // Register commands
    this._registerCommands();

    this._log('ErrorDetectionProvider initialized');
  }

  /**
   * Log message to output channel
   */
  private _log(message: string) {
    const timestamp = new Date().toISOString();
    this._outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  /**
   * Initialize the provider by loading checkpoint state
   */
  private async _initialize() {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        this._log('No workspace root found');
        return;
      }

      // Get latest checkpoint
      const checkpoints = this._getCheckpoints(1);
      if (checkpoints.length > 0) {
        const latest = checkpoints[0];
        this._lastCheckpointId = latest.id || latest.checkpointId;
        this._lastCheckpointDescription = latest.description || latest.name || 'Unknown';
        this._lastCheckpointTimestamp = latest.timestamp || latest.createdAt || new Date().toISOString();
        this._log(`Latest checkpoint: ${this._lastCheckpointId} - ${this._lastCheckpointDescription}`);
      }

      // Capture initial error state
      this._captureCurrentErrors();
      this._updateStatusBar();
      this._isInitialized = true;

    } catch (error: any) {
      this._log(`Initialization error: ${error.message}`);
    }
  }

  /**
   * Register all commands for error detection
   */
  private _registerCommands() {
    this._disposables.push(
      // Show error analysis panel
      vscode.commands.registerCommand('aitm.showErrorAnalysis', () => {
        this._showErrorAnalysis();
      }),

      // Find when errors started (bisect)
      vscode.commands.registerCommand('aitm.findWhenBroke', async () => {
        await this._findWhenBroke();
      }),

      // Restore to last known good state
      vscode.commands.registerCommand('aitm.restoreToLastGreen', async () => {
        await this._restoreToLastGreen();
      }),

      // Show error checkpoint correlation
      vscode.commands.registerCommand('aitm.showErrorCheckpointInfo', async (errorHash?: string) => {
        await this._showErrorCheckpointInfo(errorHash);
      }),

      // Suggest fix for specific error
      vscode.commands.registerCommand('aitm.suggestErrorFix', async (error: ErrorInfo) => {
        await this._suggestFix(error);
      }),

      // Refresh error tracking
      vscode.commands.registerCommand('aitm.refreshErrorTracking', () => {
        this._captureCurrentErrors();
        this._updateStatusBar();
        vscode.window.showInformationMessage('Error tracking refreshed');
      }),

      // Show error timeline
      vscode.commands.registerCommand('aitm.showErrorTimeline', () => {
        this._showErrorTimeline();
      })
    );
  }

  /**
   * Handler for diagnostic changes
   */
  private _onDiagnosticsChanged(event: vscode.DiagnosticChangeEvent) {
    const config = vscode.workspace.getConfiguration('aitm');
    if (!config.get('showErrorTracking', true)) return;

    // Debounce to avoid too many updates
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(() => {
      const newErrors = this._captureCurrentErrors();
      this._analyzeNewErrors(event.uris, newErrors);
      this._updateStatusBar();
    }, 500);
  }

  /**
   * Generate a hash for an error to identify it uniquely
   */
  private _hashError(file: string, line: number, message: string): string {
    // Normalize the message to handle minor variations
    const normalizedMessage = message
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/['"]/g, '') // Remove quotes
      .substring(0, 100); // Limit length
    return `${file}:${line}:${normalizedMessage}`;
  }

  /**
   * Capture all current errors from VSCode diagnostics
   */
  private _captureCurrentErrors(): ErrorInfo[] {
    const errors: ErrorInfo[] = [];
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    vscode.languages.getDiagnostics().forEach(([uri, diagnostics]) => {
      const relativePath = workspaceRoot
        ? path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/')
        : uri.fsPath;

      // Skip node_modules and other ignored paths
      if (relativePath.includes('node_modules') ||
          relativePath.startsWith('.') ||
          relativePath.includes('dist/') ||
          relativePath.includes('build/')) {
        return;
      }

      diagnostics.forEach(diag => {
        if (diag.severity === vscode.DiagnosticSeverity.Error) {
          const hash = this._hashError(relativePath, diag.range.start.line, diag.message);

          // Check if we've seen this error before
          const existing = this._errorHistory.get(hash);

          const errorInfo: ErrorInfo = {
            file: relativePath,
            line: diag.range.start.line + 1,
            column: diag.range.start.character + 1,
            message: diag.message,
            severity: diag.severity,
            source: diag.source,
            code: typeof diag.code === 'object' ? diag.code.value : diag.code,
            firstSeenCheckpoint: existing?.firstSeenCheckpoint || this._lastCheckpointId || undefined,
            firstSeenTimestamp: existing?.firstSeenTimestamp || this._lastCheckpointTimestamp || undefined,
            relatedCheckpoint: this._lastCheckpointId || undefined,
            hash
          };

          errors.push(errorInfo);

          // Track in error history if new
          if (!existing) {
            this._errorHistory.set(hash, {
              errorHash: hash,
              error: errorInfo,
              firstSeenCheckpoint: this._lastCheckpointId || 'unknown',
              firstSeenCheckpointDescription: this._lastCheckpointDescription || undefined,
              firstSeenTimestamp: this._lastCheckpointTimestamp || new Date().toISOString()
            });
            this._log(`New error detected: ${errorInfo.file}:${errorInfo.line} - ${errorInfo.message.substring(0, 50)}...`);
          }
        }
      });
    });

    return errors;
  }

  /**
   * Analyze newly detected errors
   */
  private _analyzeNewErrors(changedUris: readonly vscode.Uri[], currentErrors: ErrorInfo[]) {
    const newErrors: ErrorInfo[] = [];
    const resolvedErrors: string[] = [];

    // Find new errors
    for (const error of currentErrors) {
      const correlation = this._errorHistory.get(error.hash);
      if (correlation && !correlation.firstSeenCheckpoint) {
        newErrors.push(error);
      }
    }

    // Find resolved errors
    const currentHashes = new Set(currentErrors.map(e => e.hash));
    for (const [hash, correlation] of this._errorHistory) {
      if (!currentHashes.has(hash)) {
        resolvedErrors.push(hash);
      }
    }

    // Clean up resolved errors
    for (const hash of resolvedErrors) {
      this._errorHistory.delete(hash);
      this._log(`Error resolved: ${hash}`);
    }

    // Show notification for new errors with checkpoint context
    if (newErrors.length > 0 && this._isInitialized) {
      this._showNewErrorNotification(newErrors);
    }
  }

  /**
   * Show notification for new errors with checkpoint correlation
   */
  private _showNewErrorNotification(errors: ErrorInfo[]) {
    if (errors.length === 0) return;

    const firstError = errors[0];
    const checkpointInfo = this._lastCheckpointDescription
      ? ` (after "${this._lastCheckpointDescription}")`
      : '';

    const message = errors.length === 1
      ? `New error in ${firstError.file}:${firstError.line}${checkpointInfo}`
      : `${errors.length} new errors detected${checkpointInfo}`;

    vscode.window.showWarningMessage(
      message,
      'Analyze',
      'Find When Broke',
      'Restore Last Green'
    ).then(selection => {
      if (selection === 'Analyze') {
        this._showErrorAnalysis();
      } else if (selection === 'Find When Broke') {
        this._findWhenBroke();
      } else if (selection === 'Restore Last Green') {
        this._restoreToLastGreen();
      }
    });
  }

  /**
   * Update status bar with current error count
   */
  private _updateStatusBar() {
    const errors = Array.from(this._errorHistory.values());
    const errorCount = errors.length;

    if (errorCount === 0) {
      this._statusBarItem.text = '$(check) No errors';
      this._statusBarItem.backgroundColor = undefined;
      this._statusBarItem.tooltip = 'AITimeMachine: No errors detected';
    } else {
      this._statusBarItem.text = `$(error) ${errorCount} error${errorCount > 1 ? 's' : ''}`;
      this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

      // Add checkpoint context to tooltip
      const oldestError = errors.reduce((oldest, curr) => {
        if (!oldest.firstSeenTimestamp) return curr;
        if (!curr.firstSeenTimestamp) return oldest;
        return new Date(curr.firstSeenTimestamp) < new Date(oldest.firstSeenTimestamp) ? curr : oldest;
      });

      if (oldestError.firstSeenCheckpointDescription) {
        this._statusBarItem.tooltip = `${errorCount} error(s) - Oldest from "${oldestError.firstSeenCheckpointDescription}"\nClick to analyze`;
      } else {
        this._statusBarItem.tooltip = `${errorCount} error(s) detected\nClick to analyze`;
      }
    }

    this._statusBarItem.show();
  }

  /**
   * Show detailed error analysis panel
   */
  private async _showErrorAnalysis() {
    const config = vscode.workspace.getConfiguration('aitm');
    if (!config.get('showErrorTracking', true)) return;

    const correlations = Array.from(this._errorHistory.values());

    if (correlations.length === 0) {
      vscode.window.showInformationMessage('No errors currently detected. Your code is clean!');
      return;
    }

    // Group errors by checkpoint where they first appeared
    const byCheckpoint = new Map<string, ErrorCheckpointCorrelation[]>();
    for (const correlation of correlations) {
      const cpKey = correlation.firstSeenCheckpointDescription || correlation.firstSeenCheckpoint || 'Unknown';
      const existing = byCheckpoint.get(cpKey) || [];
      existing.push(correlation);
      byCheckpoint.set(cpKey, existing);
    }

    // Get diff stats for each checkpoint group
    const checkpointDiffStats = new Map<string, string>();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      for (const correlation of correlations) {
        const cpId = correlation.firstSeenCheckpoint;
        if (cpId && cpId !== 'unknown' && !checkpointDiffStats.has(cpId)) {
          try {
            const diffOutput = execSync(
              `aitm diff ${cpId} --stats --json 2>/dev/null || echo "{}"`,
              { cwd: workspaceRoot, encoding: 'utf-8', timeout: 10000 }
            );
            const diffResult = JSON.parse(diffOutput);
            const filesChanged = diffResult.filesChanged ?? diffResult.files_changed ?? diffResult.totalFiles ?? null;
            if (filesChanged !== null && filesChanged !== undefined) {
              checkpointDiffStats.set(cpId, `${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed`);
            }
          } catch {
            // CLI command not available or failed, skip gracefully
          }
        }
      }
    }

    // Build quick pick items
    const items: vscode.QuickPickItem[] = [];

    // Add action items
    items.push({
      label: '$(lightbulb) Find when errors started',
      description: 'Binary search through checkpoints',
      alwaysShow: true
    });
    items.push({
      label: '$(history) Restore to last green state',
      description: 'Go back to when there were no errors',
      alwaysShow: true
    });
    items.push({
      label: '$(timeline-view-icon) Show error timeline',
      description: 'View errors over time',
      alwaysShow: true
    });
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

    // Add errors grouped by checkpoint
    for (const [checkpoint, checkpointErrors] of byCheckpoint) {
      // Find the checkpoint ID to look up diff stats
      const cpId = checkpointErrors[0]?.firstSeenCheckpoint;
      const diffStat = cpId ? checkpointDiffStats.get(cpId) : undefined;
      const errorCountLabel = `${checkpointErrors.length} error${checkpointErrors.length > 1 ? 's' : ''}`;
      const descParts = [errorCountLabel];
      if (diffStat) {
        descParts.push(diffStat);
      }

      items.push({
        label: `$(git-commit) Errors from "${checkpoint}"`,
        description: descParts.join(' | '),
        alwaysShow: true
      });

      for (const correlation of checkpointErrors) {
        const error = correlation.error;
        const timeInfo = correlation.firstSeenTimestamp
          ? this._getTimeAgo(new Date(correlation.firstSeenTimestamp))
          : '';

        items.push({
          label: `   $(error) ${error.file}:${error.line}`,
          description: error.message.substring(0, 60) + (error.message.length > 60 ? '...' : ''),
          detail: `First appeared ${timeInfo} after checkpoint "${correlation.firstSeenCheckpointDescription || 'Unknown'}"`,
          alwaysShow: false
        });
      }
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: `Error Analysis (${correlations.length} errors)`,
      placeHolder: 'Select an action or error to investigate',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      if (selected.label.includes('Find when errors started')) {
        await this._findWhenBroke();
      } else if (selected.label.includes('Restore to last green')) {
        await this._restoreToLastGreen();
      } else if (selected.label.includes('Show error timeline')) {
        this._showErrorTimeline();
      } else if (selected.label.startsWith('   $(error)')) {
        // Navigate to error
        const match = selected.label.match(/\s+\$\(error\)\s+(.+):(\d+)/);
        if (match) {
          const file = match[1];
          const line = parseInt(match[2], 10) - 1;
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            const uri = vscode.Uri.file(path.join(workspaceRoot, file));
            try {
              const doc = await vscode.workspace.openTextDocument(uri);
              await vscode.window.showTextDocument(doc, {
                selection: new vscode.Range(line, 0, line, 0)
              });
            } catch (e) {
              this._log(`Failed to open file: ${uri.fsPath}`);
            }
          }
        }
      }
    }
  }

  /**
   * Show information about a specific error's checkpoint correlation
   */
  private async _showErrorCheckpointInfo(errorHash?: string) {
    let correlation: ErrorCheckpointCorrelation | undefined;

    if (errorHash) {
      correlation = this._errorHistory.get(errorHash);
    } else {
      // Get the first error if no hash specified
      const correlations = Array.from(this._errorHistory.values());
      if (correlations.length > 0) {
        correlation = correlations[0];
      }
    }

    if (!correlation) {
      vscode.window.showInformationMessage('No error correlation information available.');
      return;
    }

    const timeAgo = correlation.firstSeenTimestamp
      ? this._getTimeAgo(new Date(correlation.firstSeenTimestamp))
      : 'unknown time';

    const message = `This error appeared ${timeAgo} after checkpoint "${correlation.firstSeenCheckpointDescription || correlation.firstSeenCheckpoint}"`;

    const result = await vscode.window.showInformationMessage(
      message,
      'Restore to Before',
      'Show Checkpoint Diff',
      'View Details'
    );

    if (result === 'Restore to Before') {
      if (correlation.lastGoodCheckpoint) {
        await this._restoreToCheckpoint(correlation.lastGoodCheckpoint);
      } else {
        await this._findAndRestoreToGood(correlation.firstSeenCheckpoint);
      }
    } else if (result === 'Show Checkpoint Diff') {
      vscode.commands.executeCommand('aitm.showDiff', {
        id: correlation.firstSeenCheckpoint,
        label: correlation.firstSeenCheckpointDescription || correlation.firstSeenCheckpoint
      });
    } else if (result === 'View Details') {
      this._outputChannel.show();
    }
  }

  /**
   * Show error timeline view
   */
  private _showErrorTimeline() {
    const config = vscode.workspace.getConfiguration('aitm');
    if (!config.get('showErrorTracking', true)) return;

    const panel = vscode.window.createWebviewPanel(
      'aitmErrorTimeline',
      'Error Timeline',
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    const correlations = Array.from(this._errorHistory.values());

    // Sort by first seen timestamp
    correlations.sort((a, b) => {
      const timeA = a.firstSeenTimestamp ? new Date(a.firstSeenTimestamp).getTime() : 0;
      const timeB = b.firstSeenTimestamp ? new Date(b.firstSeenTimestamp).getTime() : 0;
      return timeB - timeA;
    });

    panel.webview.html = this._getErrorTimelineHtml(correlations);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      async (message: { command: string; file?: string; line?: number; checkpointId?: string }) => {
        switch (message.command) {
          case 'navigateToError': {
            if (message.file && message.line !== undefined) {
              const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (workspaceRoot) {
                const uri = vscode.Uri.file(path.join(workspaceRoot, message.file));
                try {
                  const doc = await vscode.workspace.openTextDocument(uri);
                  await vscode.window.showTextDocument(doc, {
                    selection: new vscode.Range(message.line - 1, 0, message.line - 1, 0),
                    viewColumn: vscode.ViewColumn.One
                  });
                } catch (e) {
                  this._log(`Failed to open file: ${uri.fsPath}`);
                }
              }
            }
            break;
          }
          case 'restoreCheckpoint': {
            if (message.checkpointId) {
              const confirm = await vscode.window.showWarningMessage(
                `Restore to checkpoint "${message.checkpointId}"?`,
                { modal: true },
                'Restore'
              );
              if (confirm) {
                await this._restoreToCheckpoint(message.checkpointId);
              }
            }
            break;
          }
          case 'showCheckpointDiff': {
            if (message.checkpointId) {
              vscode.commands.executeCommand('aitm.showDiff', {
                id: message.checkpointId,
                label: message.checkpointId
              });
            }
            break;
          }
        }
      },
      undefined,
      this._disposables
    );
  }

  /**
   * Generate HTML for error timeline
   */
  private _getErrorTimelineHtml(correlations: ErrorCheckpointCorrelation[]): string {
    // Group by checkpoint for the timeline view
    const byCheckpoint = new Map<string, ErrorCheckpointCorrelation[]>();
    for (const c of correlations) {
      const cpKey = c.firstSeenCheckpoint || 'unknown';
      const existing = byCheckpoint.get(cpKey) || [];
      existing.push(c);
      byCheckpoint.set(cpKey, existing);
    }

    const checkpointSections = Array.from(byCheckpoint.entries()).map(([cpId, cpCorrelations]) => {
      const cpDesc = cpCorrelations[0]?.firstSeenCheckpointDescription || cpId;
      const timeAgo = cpCorrelations[0]?.firstSeenTimestamp
        ? this._getTimeAgo(new Date(cpCorrelations[0].firstSeenTimestamp))
        : 'unknown';

      const errorItems = cpCorrelations.map(c => {
        const escapedFile = this._escapeHtml(c.error.file);
        const escapedMessage = this._escapeHtml(c.error.message);
        return `
          <div class="error-item" data-file="${escapedFile}" data-line="${c.error.line}">
            <div class="error-header">
              <span class="error-icon">&#x26A0;</span>
              <a href="#" class="error-file-link" onclick="navigateToError('${this._escapeHtml(c.error.file.replace(/'/g, "\\'"))}', ${c.error.line}); return false;">
                ${escapedFile}:${c.error.line}
              </a>
            </div>
            <div class="error-message">${escapedMessage}</div>
          </div>
        `;
      }).join('');

      const escapedCpId = this._escapeHtml(cpId.replace(/'/g, "\\'"));

      return `
        <div class="checkpoint-group">
          <div class="checkpoint-header">
            <div class="checkpoint-info">
              <span class="checkpoint-icon">&#x1F4CC;</span>
              <strong>${this._escapeHtml(cpDesc)}</strong>
              <span class="checkpoint-time">${timeAgo}</span>
              <span class="error-count">${cpCorrelations.length} error${cpCorrelations.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="checkpoint-actions">
              <button class="btn btn-secondary" onclick="showDiff('${escapedCpId}')">Diff</button>
              <button class="btn btn-primary" onclick="restoreCheckpoint('${escapedCpId}')">Restore</button>
            </div>
          </div>
          ${errorItems}
        </div>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    h2 { margin-top: 0; }
    .checkpoint-group {
      margin: 20px 0;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      overflow: hidden;
    }
    .checkpoint-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .checkpoint-info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .checkpoint-icon { font-size: 1.1em; }
    .checkpoint-time {
      opacity: 0.7;
      font-size: 0.85em;
    }
    .error-count {
      background: var(--vscode-errorForeground);
      color: var(--vscode-editor-background);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.8em;
      font-weight: bold;
    }
    .checkpoint-actions {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 4px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85em;
      font-family: var(--vscode-font-family);
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .error-item {
      margin: 0;
      padding: 10px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
    }
    .error-item:last-child {
      border-bottom: none;
    }
    .error-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .error-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .error-icon { color: var(--vscode-errorForeground); }
    .error-file-link {
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    .error-file-link:hover {
      text-decoration: underline;
    }
    .error-message {
      margin: 4px 0 0 24px;
      padding: 6px 8px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 0.85em;
    }
    .empty {
      text-align: center;
      padding: 40px;
      opacity: 0.6;
    }
    .summary {
      margin-bottom: 16px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <h2>Error Timeline</h2>
  ${correlations.length === 0
    ? '<div class="empty">No errors tracked</div>'
    : `<div class="summary">${correlations.length} error(s) across ${byCheckpoint.size} checkpoint${byCheckpoint.size !== 1 ? 's' : ''}</div>${checkpointSections}`
  }
  <script>
    const vscode = acquireVsCodeApi();

    function navigateToError(file, line) {
      vscode.postMessage({ command: 'navigateToError', file: file, line: line });
    }

    function restoreCheckpoint(checkpointId) {
      vscode.postMessage({ command: 'restoreCheckpoint', checkpointId: checkpointId });
    }

    function showDiff(checkpointId) {
      vscode.postMessage({ command: 'showCheckpointDiff', checkpointId: checkpointId });
    }

    // Also allow clicking on the error-item row itself
    document.querySelectorAll('.error-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.error-file-link')) return; // let the link handler do it
        var file = item.getAttribute('data-file');
        var line = parseInt(item.getAttribute('data-line'), 10);
        if (file && !isNaN(line)) {
          navigateToError(file, line);
        }
      });
    });
  </script>
</body>
</html>`;
  }

  /**
   * Binary search through checkpoints to find when errors started
   */
  private async _findWhenBroke() {
    const config = vscode.workspace.getConfiguration('aitm');
    if (!config.get('showErrorTracking', true)) return;

    const errors = this._captureCurrentErrors();

    if (errors.length === 0) {
      vscode.window.showInformationMessage('No errors to investigate. All clear!');
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    // Ask the user for a test command to use with CLI bisect
    const testCommand = await vscode.window.showInputBox({
      prompt: 'Enter a test command to verify each checkpoint (e.g., npm test, make check)',
      placeHolder: 'npm test',
      value: 'npm test',
      ignoreFocusOut: true
    });

    if (testCommand === undefined) {
      // User cancelled
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Finding when errors started...',
      cancellable: true
    }, async (progress, token) => {
      try {
        // Try CLI bisect first if a test command was provided
        if (testCommand.trim()) {
          progress.report({ message: 'Running CLI bisect...' });

          try {
            const bisectOutput = execSync(
              `aitm bisect --test "${testCommand.replace(/"/g, '\\"')}" --json`,
              { cwd: workspaceRoot, encoding: 'utf-8', timeout: 120000 }
            );

            const bisectResult = JSON.parse(bisectOutput);

            if (bisectResult.lastGoodCheckpoint && bisectResult.firstBadCheckpoint) {
              const lastGoodId = bisectResult.lastGoodCheckpoint;
              const firstBadId = bisectResult.firstBadCheckpoint;
              const lastGoodDesc = bisectResult.lastGoodDescription || bisectResult.lastGoodCheckpointDescription || lastGoodId;
              const firstBadDesc = bisectResult.firstBadDescription || bisectResult.firstBadCheckpointDescription || firstBadId;

              // Store bisect result for later use
              this._lastBisectResult = {
                lastGoodCheckpoint: lastGoodId,
                lastGoodCheckpointDescription: lastGoodDesc,
                firstBadCheckpoint: firstBadId,
                firstBadCheckpointDescription: firstBadDesc,
                timestamp: new Date().toISOString()
              };

              const result = await vscode.window.showInformationMessage(
                `Errors appeared after "${lastGoodDesc}" and before "${firstBadDesc}"`,
                { modal: false },
                'Show Diff',
                'Restore to Good',
                'View Details'
              );

              if (result === 'Show Diff') {
                vscode.commands.executeCommand('aitm.showDiff', { id: firstBadId, label: firstBadDesc });
              } else if (result === 'Restore to Good') {
                await this._restoreToCheckpoint(lastGoodId);
              } else if (result === 'View Details') {
                this._outputChannel.appendLine('\n=== Bisect Results (CLI) ===');
                this._outputChannel.appendLine(`Test command: ${testCommand}`);
                this._outputChannel.appendLine(`Last Good: ${lastGoodDesc} (${lastGoodId})`);
                this._outputChannel.appendLine(`First Bad: ${firstBadDesc} (${firstBadId})`);
                this._outputChannel.show();
              }

              // Update error correlations with this information
              for (const [_hash, correlation] of this._errorHistory) {
                if (!correlation.lastGoodCheckpoint) {
                  correlation.lastGoodCheckpoint = lastGoodId;
                  correlation.lastGoodCheckpointDescription = lastGoodDesc;
                }
              }

              return;
            }
          } catch (cliError: any) {
            this._log(`CLI bisect failed, falling back to heuristic: ${cliError.message}`);
            progress.report({ message: 'CLI bisect failed, using heuristic fallback...' });
          }
        }

        // Fallback: heuristic-based binary search
        const checkpoints = this._getCheckpoints(20);

        if (checkpoints.length < 2) {
          vscode.window.showWarningMessage('Not enough checkpoints to analyze. Create more checkpoints to use this feature.');
          return;
        }

        let left = 0;
        let right = checkpoints.length - 1;
        let lastGood: any = null;
        let firstBad: any = checkpoints[0];

        while (left <= right && !token.isCancellationRequested) {
          const mid = Math.floor((left + right) / 2);
          const cp = checkpoints[mid];
          const cpId = cp.id || cp.checkpointId;
          const cpDesc = cp.description || cp.name || cpId;

          progress.report({
            message: `Checking "${cpDesc}" (${mid + 1}/${checkpoints.length})...`
          });

          const hasErrors = await this._checkCheckpointForErrors(cpId, workspaceRoot);

          if (hasErrors) {
            firstBad = cp;
            left = mid + 1;
          } else {
            lastGood = cp;
            right = mid - 1;
          }
        }

        if (token.isCancellationRequested) {
          this._log('Bisect cancelled by user');
          return;
        }

        // Show result
        if (lastGood && firstBad) {
          const lastGoodDesc = lastGood.description || lastGood.name || lastGood.id;
          const firstBadDesc = firstBad.description || firstBad.name || firstBad.id;
          const lastGoodId = lastGood.id || lastGood.checkpointId;
          const firstBadId = firstBad.id || firstBad.checkpointId;

          // Store bisect result for later use
          this._lastBisectResult = {
            lastGoodCheckpoint: lastGoodId,
            lastGoodCheckpointDescription: lastGoodDesc,
            firstBadCheckpoint: firstBadId,
            firstBadCheckpointDescription: firstBadDesc,
            timestamp: new Date().toISOString()
          };

          const result = await vscode.window.showInformationMessage(
            `Errors appeared after "${lastGoodDesc}" and before "${firstBadDesc}"`,
            { modal: false },
            'Show Diff',
            'Restore to Good',
            'View Details'
          );

          if (result === 'Show Diff') {
            vscode.commands.executeCommand('aitm.showDiff', { id: firstBadId, label: firstBadDesc });
          } else if (result === 'Restore to Good') {
            await this._restoreToCheckpoint(lastGoodId);
          } else if (result === 'View Details') {
            this._outputChannel.appendLine('\n=== Bisect Results (Heuristic) ===');
            this._outputChannel.appendLine(`Last Good: ${lastGoodDesc} (${lastGoodId})`);
            this._outputChannel.appendLine(`First Bad: ${firstBadDesc} (${firstBadId})`);
            this._outputChannel.show();
          }

          // Update error correlations with this information
          for (const [_hash, correlation] of this._errorHistory) {
            if (!correlation.lastGoodCheckpoint) {
              correlation.lastGoodCheckpoint = lastGoodId;
              correlation.lastGoodCheckpointDescription = lastGoodDesc;
            }
          }

        } else {
          vscode.window.showInformationMessage(
            'Could not determine when errors started. They may have existed from the beginning.'
          );
        }

      } catch (error: any) {
        vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
        this._log(`Bisect failed: ${error.message}`);
      }
    });
  }

  /**
   * Check if a checkpoint has errors (heuristic-based for now)
   */
  private async _checkCheckpointForErrors(checkpointId: string, workspaceRoot: string): Promise<boolean> {
    try {
      const output = execSync(
        `aitm get-checkpoint ${checkpointId} --json 2>/dev/null || echo "{}"`,
        { cwd: workspaceRoot, encoding: 'utf-8', timeout: 10000 }
      );
      const checkpoint = JSON.parse(output);

      // Check if checkpoint name/description indicates test failure
      const name = (checkpoint.name || checkpoint.description || '').toLowerCase();

      // Patterns that indicate failure
      if (/fail|error|broke|red|bug|broken|crash/.test(name)) {
        return true;
      }

      // Patterns that indicate success
      if (/pass|green|success|fixed|working|ok/.test(name)) {
        return false;
      }

      // Check metadata
      if (checkpoint.metadata?.status === 'failed' || checkpoint.metadata?.testsPassing === false) {
        return true;
      }
      if (checkpoint.metadata?.status === 'success' || checkpoint.metadata?.testsPassing === true) {
        return false;
      }

      // Default: assume older checkpoints are more likely to be good
      return false;
    } catch (error: any) {
      this._log(`Error checking checkpoint ${checkpointId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Restore to last known green state
   */
  private async _restoreToLastGreen() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    try {
      // First, check if we have a bisect result from a previous _findWhenBroke run
      if (this._lastBisectResult) {
        const bisect = this._lastBisectResult;
        const desc = bisect.lastGoodCheckpointDescription || bisect.lastGoodCheckpoint;
        const confirm = await vscode.window.showWarningMessage(
          `Restore to last known good checkpoint from bisect: "${desc}"?`,
          { modal: true },
          'Restore'
        );

        if (confirm) {
          await this._restoreToCheckpoint(bisect.lastGoodCheckpoint);
        }
        return;
      }

      // Then try the CLI's find-green command
      try {
        const output = execSync(
          'aitm find-green --json 2>/dev/null',
          { cwd: workspaceRoot, encoding: 'utf-8', timeout: 10000 }
        );

        const result = JSON.parse(output);

        if (result.checkpointId) {
          const desc = result.name || result.description || result.checkpointId;
          const confirm = await vscode.window.showWarningMessage(
            `Restore to last green state: "${desc}"?`,
            { modal: true },
            'Restore'
          );

          if (confirm) {
            await this._restoreToCheckpoint(result.checkpointId);
          }
          return;
        }
      } catch {
        // Command not available, fall back to search
      }

      // Search for "green" or "pass" checkpoints
      const checkpoints = this._getCheckpoints(50);
      const greenPatterns = /green|pass|success|working|fixed|ok|good/i;

      const greenCheckpoints = checkpoints.filter((cp: any) =>
        greenPatterns.test(cp.description || cp.name || '')
      );

      if (greenCheckpoints.length > 0) {
        const latest = greenCheckpoints[0];
        const desc = latest.description || latest.name || latest.id;
        const confirm = await vscode.window.showWarningMessage(
          `Restore to: "${desc}"?`,
          { modal: true },
          'Restore'
        );

        if (confirm) {
          await this._restoreToCheckpoint(latest.id || latest.checkpointId);
        }
      } else {
        // No green checkpoints found, suggest the user find one
        const result = await vscode.window.showWarningMessage(
          'No "green" checkpoints found. Tip: Name checkpoints like "Tests passing" or "Build green"',
          'Search Checkpoints',
          'Find When Broke'
        );

        if (result === 'Search Checkpoints') {
          vscode.commands.executeCommand('aitm.smartSearch');
        } else if (result === 'Find When Broke') {
          await this._findWhenBroke();
        }
      }

    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to find green state: ${error.message}`);
      this._log(`Find green failed: ${error.message}`);
    }
  }

  /**
   * Find and restore to a good checkpoint before the given checkpoint
   */
  private async _findAndRestoreToGood(afterCheckpointId: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    try {
      const checkpoints = this._getCheckpoints(50);

      // Find the checkpoint and get the one before it
      let foundTarget = false;
      for (const cp of checkpoints) {
        const cpId = cp.id || cp.checkpointId;
        if (foundTarget) {
          // This is the checkpoint before the target
          await this._restoreToCheckpoint(cpId);
          return;
        }
        if (cpId === afterCheckpointId) {
          foundTarget = true;
        }
      }

      vscode.window.showWarningMessage('Could not find a checkpoint to restore to.');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Restore failed: ${error.message}`);
    }
  }

  /**
   * Restore to a specific checkpoint
   */
  private async _restoreToCheckpoint(checkpointId: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    try {
      execSync(`aitm restore ${checkpointId}`, {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        timeout: 30000
      });

      vscode.window.showInformationMessage(`Restored to checkpoint: ${checkpointId}`);
      this._log(`Restored to checkpoint: ${checkpointId}`);

      // Clear error history since we restored
      this._errorHistory.clear();

      // Refresh the window
      vscode.commands.executeCommand('workbench.action.reloadWindow');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Restore failed: ${error.message}`);
      this._log(`Restore failed: ${error.message}`);
    }
  }

  /**
   * Suggest a fix for the given error
   */
  private async _suggestFix(error: ErrorInfo) {
    const correlation = this._errorHistory.get(error.hash);

    const suggestions: RestoreSuggestion[] = [];

    // If we have checkpoint correlation info
    if (correlation?.lastGoodCheckpoint) {
      suggestions.push({
        checkpointId: correlation.lastGoodCheckpoint,
        checkpointDescription: correlation.lastGoodCheckpointDescription || correlation.lastGoodCheckpoint,
        timestamp: correlation.firstSeenTimestamp || '',
        reason: 'Last known working state before this error',
        confidence: 'high'
      });
    }

    // Build suggestion message
    let message = `Error in ${error.file}:${error.line}\n\n`;

    if (correlation?.firstSeenCheckpointDescription) {
      message += `This error appeared after checkpoint "${correlation.firstSeenCheckpointDescription}"\n\n`;
    }

    message += 'Suggested actions:';

    const result = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      'Show Error in Context',
      'View Checkpoint History',
      'Find When Broke'
    );

    if (result === 'Show Error in Context') {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const uri = vscode.Uri.file(path.join(workspaceRoot, error.file));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
          selection: new vscode.Range(error.line - 1, 0, error.line - 1, 0)
        });
      }
    } else if (result === 'View Checkpoint History') {
      vscode.commands.executeCommand('aitm.showFileHistory',
        vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', error.file))
      );
    } else if (result === 'Find When Broke') {
      await this._findWhenBroke();
    }
  }

  /**
   * Get checkpoints from CLI
   */
  private _getCheckpoints(limit: number = 10): any[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];

    try {
      const output = execSync(`aitm list --json --limit ${limit} 2>/dev/null || echo "[]"`, {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        timeout: 10000
      });
      return JSON.parse(output);
    } catch {
      return [];
    }
  }

  /**
   * Get human-readable time ago string
   */
  private _getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  /**
   * Escape HTML for safe display
   */
  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Provide code actions for errors (used by ErrorCodeActionProvider)
   */
  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Check if there are errors on this line
    const errors = context.diagnostics.filter(
      d => d.severity === vscode.DiagnosticSeverity.Error
    );

    if (errors.length === 0) return actions;

    // Get workspace info
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return actions;

    const relativePath = path.relative(workspaceRoot, document.uri.fsPath).replace(/\\/g, '/');
    const lineNumber = range.start.line + 1;

    // Find correlation info for this error
    for (const diag of errors) {
      const hash = this._hashError(relativePath, diag.range.start.line, diag.message);
      const correlation = this._errorHistory.get(hash);

      // Add "Find when this error started" action
      const findAction = new vscode.CodeAction(
        correlation?.firstSeenCheckpointDescription
          ? `Find when "${diag.message.substring(0, 30)}..." started`
          : 'Find when this error started (AITimeMachine)',
        vscode.CodeActionKind.QuickFix
      );
      findAction.command = {
        title: 'Find when broke',
        command: 'aitm.findWhenBroke'
      };
      findAction.isPreferred = false;
      actions.push(findAction);

      // Add info action if we have correlation data
      if (correlation?.firstSeenCheckpointDescription) {
        const infoAction = new vscode.CodeAction(
          `Error appeared after "${correlation.firstSeenCheckpointDescription}"`,
          vscode.CodeActionKind.QuickFix
        );
        infoAction.command = {
          title: 'Show error checkpoint info',
          command: 'aitm.showErrorCheckpointInfo',
          arguments: [hash]
        };
        infoAction.isPreferred = false;
        actions.push(infoAction);
      }

      // Add "Restore to last green state" action
      const restoreAction = new vscode.CodeAction(
        'Restore to last green state (AITimeMachine)',
        vscode.CodeActionKind.QuickFix
      );
      restoreAction.command = {
        title: 'Restore to last green',
        command: 'aitm.restoreToLastGreen'
      };
      restoreAction.isPreferred = false;
      actions.push(restoreAction);

      // Only add actions for the first error to avoid too many items
      break;
    }

    return actions;
  }

  /**
   * Notify the provider that a new checkpoint was created
   */
  public onCheckpointCreated(checkpointId: string, description?: string) {
    this._lastCheckpointId = checkpointId;
    this._lastCheckpointDescription = description || null;
    this._lastCheckpointTimestamp = new Date().toISOString();
    this._log(`New checkpoint registered: ${checkpointId} - ${description}`);
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._disposables.forEach(d => d.dispose());
    this._log('ErrorDetectionProvider disposed');
  }
}

/**
 * CodeActionProvider wrapper for ErrorDetectionProvider
 */
export class ErrorCodeActionProvider implements vscode.CodeActionProvider {
  private _errorDetector: ErrorDetectionProvider;

  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix
  ];

  constructor(errorDetector: ErrorDetectionProvider) {
    this._errorDetector = errorDetector;
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    return this._errorDetector.provideCodeActions(document, range, context);
  }
}
