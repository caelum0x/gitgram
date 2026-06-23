/**
 * SessionDashboardPanel - Full VS Code webview panel for the AITM session dashboard.
 *
 * Features:
 *  - Recent checkpoints list with restore / export actions
 *  - SVG activity chart (commits-per-day for the last 14 days)
 *  - Quick actions: Checkpoint now, Restore, Export
 *  - Bidirectional messaging: webview ↔ extension ↔ API
 *  - Auto-refreshes every 30 s; manual refresh button also available
 */

import * as vscode from 'vscode';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckpointSummary {
  id: string;
  description: string;
  timestamp: string;
  type: 'auto' | 'manual' | 'before' | 'after';
  stats: {
    totalFiles: number;
    totalSize: number;
    filesChanged?: number;
  };
  metadata?: {
    action?: string;
    status?: string;
  };
}

interface ActivityDay {
  /** ISO date string YYYY-MM-DD */
  date: string;
  count: number;
}

interface DashboardData {
  checkpoints: CheckpointSummary[];
  activityDays: ActivityDay[];
  totalCheckpoints: number;
  sessionName: string;
  lastCheckpointAt: string | null;
}

// Messages from webview → extension
type WebviewMessage =
  | { command: 'checkpointNow'; description?: string }
  | { command: 'restore'; checkpointId: string }
  | { command: 'export'; checkpointId: string }
  | { command: 'diff'; checkpointId: string }
  | { command: 'requestRefresh' };

// Messages from extension → webview
type ExtensionMessage =
  | { command: 'updateData'; data: DashboardData }
  | { command: 'toast'; level: 'info' | 'warn' | 'error'; text: string }
  | { command: 'setLoading'; loading: boolean };

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 30_000;

export class SessionDashboardPanel {
  public static readonly viewType = 'aitm.sessionDashboard';
  private static _instance: SessionDashboardPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _refreshTimer: NodeJS.Timeout | null = null;
  private _data: DashboardData | null = null;

  // ---------------------------------------------------------------------------
  // Static factory
  // ---------------------------------------------------------------------------

  public static open(extensionUri: vscode.Uri): SessionDashboardPanel {
    if (SessionDashboardPanel._instance) {
      SessionDashboardPanel._instance._panel.reveal(vscode.ViewColumn.One);
      return SessionDashboardPanel._instance;
    }

    const panel = vscode.window.createWebviewPanel(
      SessionDashboardPanel.viewType,
      'AITM Session Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    SessionDashboardPanel._instance = new SessionDashboardPanel(panel, extensionUri);
    return SessionDashboardPanel._instance;
  }

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._loadAndRender();
    this._startAutoRefresh();
  }

  // ---------------------------------------------------------------------------
  // Auto-refresh
  // ---------------------------------------------------------------------------

  private _startAutoRefresh(): void {
    this._refreshTimer = setInterval(() => {
      this._loadAndRender();
    }, REFRESH_INTERVAL_MS);
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private _loadAndRender(): void {
    try {
      const data = this._fetchDashboardData();
      this._data = data;
      this._panel.webview.html = this._buildHtml(data);
      this._post({ command: 'updateData', data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!this._data) {
        // First render: show skeleton with error
        this._panel.webview.html = this._buildHtml(this._emptyData());
      }
      this._post({ command: 'toast', level: 'error', text: `Refresh failed: ${message}` });
    }
  }

  private _fetchDashboardData(): DashboardData {
    const raw = execSync('aitm list --json --limit 50 2>/dev/null', {
      encoding: 'utf8',
      timeout: 10_000,
    });
    const checkpoints: CheckpointSummary[] = JSON.parse(raw);
    const activityDays = this._buildActivityDays(checkpoints);

    return {
      checkpoints: checkpoints.slice(0, 20),
      activityDays,
      totalCheckpoints: checkpoints.length,
      sessionName: this._detectSessionName(),
      lastCheckpointAt: checkpoints.length > 0 ? checkpoints[0].timestamp : null,
    };
  }

  private _detectSessionName(): string {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
        encoding: 'utf8',
        timeout: 3_000,
      }).trim();
    } catch {
      return 'unknown';
    }
  }

  private _buildActivityDays(checkpoints: CheckpointSummary[]): ActivityDay[] {
    const days: Map<string, number> = new Map();
    const today = new Date();

    // Pre-fill 14 days with zero counts (immutable approach — build fresh map)
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.set(d.toISOString().slice(0, 10), 0);
    }

    for (const cp of checkpoints) {
      const day = cp.timestamp.slice(0, 10);
      if (days.has(day)) {
        days.set(day, (days.get(day) ?? 0) + 1);
      }
    }

    return Array.from(days.entries()).map(([date, count]) => ({ date, count }));
  }

  private _emptyData(): DashboardData {
    return {
      checkpoints: [],
      activityDays: Array.from({ length: 14 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (13 - i));
        return { date: d.toISOString().slice(0, 10), count: 0 };
      }),
      totalCheckpoints: 0,
      sessionName: '—',
      lastCheckpointAt: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  private async _handleMessage(msg: WebviewMessage): Promise<void> {
    switch (msg.command) {
      case 'checkpointNow':
        await this._runCheckpointNow(msg.description);
        break;

      case 'restore':
        await this._runRestore(msg.checkpointId);
        break;

      case 'export':
        this._runExport(msg.checkpointId);
        break;

      case 'diff':
        vscode.commands.executeCommand('aitm.diff.openPanel', msg.checkpointId, 'HEAD');
        break;

      case 'requestRefresh':
        this._loadAndRender();
        break;
    }
  }

  private async _runCheckpointNow(description?: string): Promise<void> {
    this._post({ command: 'setLoading', loading: true });
    try {
      const desc = description ?? 'Manual checkpoint from dashboard';
      execSync(`aitm checkpoint "${desc.replace(/"/g, '\\"')}" 2>&1`, {
        encoding: 'utf8',
        timeout: 15_000,
      });
      this._post({ command: 'toast', level: 'info', text: 'Checkpoint created.' });
      this._loadAndRender();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({ command: 'toast', level: 'error', text: `Checkpoint failed: ${message}` });
    } finally {
      this._post({ command: 'setLoading', loading: false });
    }
  }

  private async _runRestore(checkpointId: string): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
      `Restore to checkpoint ${checkpointId.slice(0, 8)}? Unsaved changes will be overwritten.`,
      { modal: true },
      'Restore',
    );
    if (answer !== 'Restore') return;

    this._post({ command: 'setLoading', loading: true });
    try {
      execSync(`aitm restore ${checkpointId} 2>&1`, { encoding: 'utf8', timeout: 30_000 });
      this._post({ command: 'toast', level: 'info', text: `Restored to ${checkpointId.slice(0, 8)}.` });
      this._loadAndRender();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({ command: 'toast', level: 'error', text: `Restore failed: ${message}` });
    } finally {
      this._post({ command: 'setLoading', loading: false });
    }
  }

  private _runExport(checkpointId: string): void {
    vscode.window
      .showSaveDialog({
        defaultUri: vscode.Uri.file(`aitm-export-${checkpointId.slice(0, 8)}.tar.gz`),
        filters: { 'Archive': ['tar.gz', 'gz'] },
      })
      .then((uri) => {
        if (!uri) return;
        try {
          execSync(`aitm export ${checkpointId} "${uri.fsPath}" 2>&1`, {
            encoding: 'utf8',
            timeout: 30_000,
          });
          vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Export failed: ${message}`);
        }
      });
  }

  private _post(msg: ExtensionMessage): void {
    this._panel.webview.postMessage(msg);
  }

  // ---------------------------------------------------------------------------
  // HTML generation
  // ---------------------------------------------------------------------------

  private _buildHtml(data: DashboardData): string {
    const nonce = this._nonce();
    const checkpointsHtml = this._renderCheckpointList(data.checkpoints);
    const chartSvg = this._renderActivityChart(data.activityDays);
    const lastAt = data.lastCheckpointAt
      ? this._relativeTime(data.lastCheckpointAt)
      : 'never';

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src 'nonce-${nonce}';
                 script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AITM Session Dashboard</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      min-height: 100vh;
      overflow-y: auto;
    }

    /* ---- Top bar ---- */
    .topbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: var(--vscode-titleBar-activeBackground, #1e1e1e);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .topbar h1 { font-size: 14px; font-weight: 700; flex: 1; }
    .branch-badge {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #fff);
      border-radius: 3px;
      padding: 2px 7px;
    }
    .topbar-actions { display: flex; gap: 6px; }

    /* ---- Buttons ---- */
    .btn {
      border: none;
      border-radius: 3px;
      padding: 5px 12px;
      font-size: 12px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
    }
    .btn-primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
      border: 1px solid var(--vscode-button-border, #555);
    }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
    .btn-icon {
      background: transparent;
      border: none;
      color: var(--vscode-textLink-foreground, #3794ff);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 5px;
    }
    .btn-icon:hover { text-decoration: underline; }
    .btn-icon.danger { color: #f48771; }

    /* ---- Content ---- */
    .content { padding: 16px; display: flex; flex-direction: column; gap: 20px; }

    /* ---- Stats row ---- */
    .stats-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .stat-card {
      flex: 1;
      min-width: 120px;
      background: var(--vscode-sideBar-background, #252526);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px;
      padding: 12px 16px;
    }
    .stat-card .label { font-size: 11px; color: var(--vscode-descriptionForeground, #888); margin-bottom: 4px; }
    .stat-card .value { font-size: 20px; font-weight: 700; }
    .stat-card .sub   { font-size: 11px; color: var(--vscode-descriptionForeground, #888); margin-top: 2px; }

    /* ---- Section ---- */
    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground, #888);
      margin-bottom: 8px;
    }

    /* ---- Activity chart ---- */
    .chart-wrap {
      background: var(--vscode-sideBar-background, #252526);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px;
      padding: 14px;
      overflow-x: auto;
    }
    .chart-wrap svg { display: block; }
    .chart-labels {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #888);
      margin-top: 4px;
    }

    /* ---- Checkpoint list ---- */
    .cp-list {
      background: var(--vscode-sideBar-background, #252526);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px;
      overflow: hidden;
    }
    .cp-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
    }
    .cp-item:last-child { border-bottom: none; }
    .cp-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 5px;
      flex-shrink: 0;
    }
    .cp-dot.auto   { background: #4ec9b0; }
    .cp-dot.manual { background: #dcdcaa; }
    .cp-dot.before { background: #9cdcfe; }
    .cp-dot.after  { background: #c586c0; }
    .cp-body { flex: 1; min-width: 0; }
    .cp-desc { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cp-meta { font-size: 11px; color: var(--vscode-descriptionForeground, #888); margin-top: 2px; }
    .cp-actions { display: flex; gap: 2px; flex-shrink: 0; align-items: center; }
    .cp-empty {
      padding: 20px;
      text-align: center;
      color: var(--vscode-descriptionForeground, #888);
      font-size: 12px;
    }

    /* ---- Quick actions card ---- */
    .quick-actions {
      background: var(--vscode-sideBar-background, #252526);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .qa-row { display: flex; gap: 8px; align-items: center; }
    .qa-label { flex: 1; font-size: 12px; color: var(--vscode-descriptionForeground, #888); }
    .qa-input {
      flex: 2;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #d4d4d4);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 3px;
      padding: 4px 8px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
    }
    .qa-input:focus { outline: 1px solid var(--vscode-focusBorder, #007acc); }

    /* ---- Loading overlay ---- */
    .loading-bar {
      height: 2px;
      background: var(--vscode-progressBar-background, #0e70c0);
      position: fixed;
      top: 0; left: 0; right: 0;
      display: none;
      animation: indeterminate 1.4s infinite linear;
    }
    .loading-bar.visible { display: block; }
    @keyframes indeterminate {
      0%   { transform: translateX(-100%) scaleX(0.5); }
      100% { transform: translateX(200%) scaleX(0.5); }
    }

    /* ---- Toast ---- */
    #toast {
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: var(--vscode-notifications-background, #252526);
      border: 1px solid var(--vscode-notifications-border, #333);
      border-radius: 4px;
      padding: 8px 14px;
      font-size: 12px;
      max-width: 320px;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
      z-index: 100;
    }
    #toast.show { opacity: 1; }
    #toast.info  { border-left: 3px solid #4ec9b0; }
    #toast.warn  { border-left: 3px solid #dcdcaa; }
    #toast.error { border-left: 3px solid #f48771; }
  </style>
</head>
<body>
  <div class="loading-bar" id="loadingBar"></div>

  <div class="topbar">
    <h1>AITM Session Dashboard</h1>
    <span class="branch-badge">${this._escape(data.sessionName)}</span>
    <div class="topbar-actions">
      <button class="btn btn-primary" id="cpNowBtn">⊕ Checkpoint Now</button>
      <button class="btn btn-secondary" id="refreshBtn">↻</button>
    </div>
  </div>

  <div class="content">

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="label">Total Checkpoints</div>
        <div class="value">${data.totalCheckpoints}</div>
      </div>
      <div class="stat-card">
        <div class="label">Last Checkpoint</div>
        <div class="value" style="font-size:14px;margin-top:4px;">${this._escape(lastAt)}</div>
      </div>
      <div class="stat-card">
        <div class="label">Activity (14d)</div>
        <div class="value">${data.activityDays.reduce((s, d) => s + d.count, 0)}</div>
        <div class="sub">checkpoints</div>
      </div>
    </div>

    <!-- Activity chart -->
    <div>
      <div class="section-title">Activity — Last 14 Days</div>
      <div class="chart-wrap">
        ${chartSvg}
        <div class="chart-labels">
          <span>${this._escape(data.activityDays[0]?.date.slice(5) ?? '')}</span>
          <span>${this._escape(data.activityDays[6]?.date.slice(5) ?? '')}</span>
          <span>${this._escape(data.activityDays[13]?.date.slice(5) ?? '')}</span>
        </div>
      </div>
    </div>

    <!-- Quick actions -->
    <div>
      <div class="section-title">Quick Actions</div>
      <div class="quick-actions">
        <div class="qa-row">
          <label class="qa-label" for="cpDesc">Description</label>
          <input class="qa-input" id="cpDesc" type="text" placeholder="Optional description…" />
          <button class="btn btn-primary" id="cpNowBtn2">Checkpoint</button>
        </div>
      </div>
    </div>

    <!-- Checkpoint list -->
    <div>
      <div class="section-title">Recent Checkpoints</div>
      <div class="cp-list" id="cpList">
        ${checkpointsHtml}
      </div>
    </div>

  </div>

  <div id="toast"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // ---- Checkpoint now ----
    function checkpointNow() {
      const desc = document.getElementById('cpDesc').value.trim();
      vscode.postMessage({ command: 'checkpointNow', description: desc || undefined });
    }
    document.getElementById('cpNowBtn').addEventListener('click', checkpointNow);
    document.getElementById('cpNowBtn2').addEventListener('click', checkpointNow);

    // ---- Refresh ----
    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'requestRefresh' });
    });

    // ---- Checkpoint list actions (delegated) ----
    document.getElementById('cpList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!action || !id) return;
      vscode.postMessage({ command: action, checkpointId: id });
    });

    // ---- Messages from extension ----
    window.addEventListener('message', (event) => {
      const msg = event.data;
      switch (msg.command) {
        case 'setLoading':
          document.getElementById('loadingBar').classList.toggle('visible', msg.loading);
          break;
        case 'toast':
          showToast(msg.level, msg.text);
          break;
        case 'updateData':
          // Full re-render is managed server-side (page replaced). No-op here.
          break;
      }
    });

    // ---- Toast helper ----
    let _toastTimer = null;
    function showToast(level, text) {
      const el = document.getElementById('toast');
      el.textContent = text;
      el.className = 'show ' + level;
      if (_toastTimer) clearTimeout(_toastTimer);
      _toastTimer = setTimeout(() => { el.classList.remove('show'); }, 4000);
    }
  </script>
</body>
</html>`;
  }

  // ---------------------------------------------------------------------------
  // HTML helpers
  // ---------------------------------------------------------------------------

  private _renderCheckpointList(checkpoints: CheckpointSummary[]): string {
    if (checkpoints.length === 0) {
      return '<div class="cp-empty">No checkpoints yet. Create your first checkpoint above.</div>';
    }

    return checkpoints
      .map((cp) => {
        const rel = this._relativeTime(cp.timestamp);
        const files = cp.stats.filesChanged ?? cp.stats.totalFiles;
        const meta = `${this._escape(rel)} · ${files} file${files !== 1 ? 's' : ''}`;

        return `<div class="cp-item">
          <span class="cp-dot ${this._escape(cp.type)}"></span>
          <div class="cp-body">
            <div class="cp-desc" title="${this._escape(cp.description)}">${this._escape(cp.description)}</div>
            <div class="cp-meta">${meta}</div>
          </div>
          <div class="cp-actions">
            <button class="btn-icon" data-action="diff" data-id="${this._escape(cp.id)}" title="View diff">Diff</button>
            <button class="btn-icon" data-action="export" data-id="${this._escape(cp.id)}" title="Export">Export</button>
            <button class="btn-icon danger" data-action="restore" data-id="${this._escape(cp.id)}" title="Restore to this checkpoint">Restore</button>
          </div>
        </div>`;
      })
      .join('\n');
  }

  private _renderActivityChart(days: ActivityDay[]): string {
    const W = 560;
    const H = 60;
    const barW = Math.floor((W - (days.length - 1) * 3) / days.length);
    const maxCount = Math.max(...days.map((d) => d.count), 1);

    const bars = days
      .map((day, i) => {
        const barH = Math.max(2, Math.round((day.count / maxCount) * (H - 4)));
        const x = i * (barW + 3);
        const y = H - barH;
        const title = `${day.date}: ${day.count} checkpoint${day.count !== 1 ? 's' : ''}`;
        const fill = day.count > 0 ? '#4ec9b0' : 'var(--vscode-panel-border,#333)';
        return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="1" fill="${fill}"><title>${this._escape(title)}</title></rect>`;
      })
      .join('\n');

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="Checkpoint activity chart">
      ${bars}
    </svg>`;
  }

  private _relativeTime(isoString: string): string {
    const then = new Date(isoString).getTime();
    const now = Date.now();
    const diff = Math.floor((now - then) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  private _escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    SessionDashboardPanel._instance = undefined;
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
 * Register the `aitm.dashboard.open` command.
 * Call this from extension.ts during activation.
 */
export function registerSessionDashboardCommand(
  context: vscode.ExtensionContext,
): void {
  const cmd = vscode.commands.registerCommand('aitm.dashboard.open', () => {
    SessionDashboardPanel.open(context.extensionUri);
  });
  context.subscriptions.push(cmd);
}
