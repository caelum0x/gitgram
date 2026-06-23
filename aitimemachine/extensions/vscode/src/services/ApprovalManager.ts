/**
 * ApprovalManager - Manages approval workflow for actions
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface ApprovalConfig {
  read: {
    enabled: boolean;
    outsideWorkspace: boolean;
    maxFileSize: number;
  };
  write: {
    enabled: boolean;
    outsideWorkspace: boolean;
    protectedPaths: string[];
  };
  execute: {
    allowedCommands: string[];
    deniedCommands: string[];
    requireConfirmation: boolean;
  };
  browser: {
    enabled: boolean;
    allowedDomains: string[];
  };
  mcp: {
    enabled: boolean;
    allowedTools: string[];
  };
  notifications: {
    showApprovalPopups: boolean;
    logApprovals: boolean;
  };
}

export interface ApprovalRequest {
  id: string;
  type: 'read' | 'write' | 'execute' | 'browser' | 'mcp';
  action: string;
  path?: string;
  command?: string;
  toolName?: string;
  timestamp: Date;
  autoApproved?: boolean;
  userApproved?: boolean;
  denied?: boolean;
}

export interface ApprovalResult {
  approved: boolean;
  reason?: string;
  autoApproved?: boolean;
}

export class ApprovalManager {
  private static instance: ApprovalManager;
  private _config: ApprovalConfig;
  private _history: ApprovalRequest[] = [];
  private _onApprovalRequested = new vscode.EventEmitter<ApprovalRequest>();
  private _onApprovalResult = new vscode.EventEmitter<{ request: ApprovalRequest; result: ApprovalResult }>();

  public readonly onApprovalRequested = this._onApprovalRequested.event;
  public readonly onApprovalResult = this._onApprovalResult.event;

  private constructor() {
    this._config = this._loadConfig();
    this._watchConfigChanges();
  }

  public static getInstance(): ApprovalManager {
    if (!ApprovalManager.instance) {
      ApprovalManager.instance = new ApprovalManager();
    }
    return ApprovalManager.instance;
  }

  /**
   * Get current configuration
   */
  public getConfig(): ApprovalConfig {
    return { ...this._config };
  }

  /**
   * Update configuration
   */
  public async updateConfig(updates: Partial<ApprovalConfig>): Promise<void> {
    const config = vscode.workspace.getConfiguration('aitm.autoApproval');

    for (const [key, value] of Object.entries(updates)) {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    }

    this._config = this._loadConfig();
  }

  /**
   * Request approval for a read operation
   */
  public async requestReadApproval(filePath: string): Promise<ApprovalResult> {
    const request = this._createRequest('read', `Read file: ${filePath}`, { path: filePath });

    // Check auto-approval
    if (this._config.read.enabled) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      // Check if outside workspace
      if (workspaceRoot && !filePath.startsWith(workspaceRoot)) {
        if (!this._config.read.outsideWorkspace) {
          return this._deny(request, 'Reading files outside workspace is not allowed');
        }
      }

      // Check file size
      try {
        const fs = require('fs');
        const stats = fs.statSync(filePath);
        if (stats.size > this._config.read.maxFileSize) {
          return this._deny(request, `File exceeds max size limit (${this._formatSize(this._config.read.maxFileSize)})`);
        }
      } catch {
        // File doesn't exist or can't read stats
      }

      return this._approve(request, true);
    }

    return this._requestUserApproval(request);
  }

  /**
   * Request approval for a write operation
   */
  public async requestWriteApproval(filePath: string): Promise<ApprovalResult> {
    const request = this._createRequest('write', `Write file: ${filePath}`, { path: filePath });

    // Check auto-approval
    if (this._config.write.enabled) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      // Check if outside workspace
      if (workspaceRoot && !filePath.startsWith(workspaceRoot)) {
        if (!this._config.write.outsideWorkspace) {
          return this._deny(request, 'Writing files outside workspace is not allowed');
        }
      }

      // Check protected paths
      const relativePath = workspaceRoot ? path.relative(workspaceRoot, filePath) : filePath;
      for (const protected_pattern of this._config.write.protectedPaths) {
        if (this._matchPattern(relativePath, protected_pattern)) {
          return this._requestUserApproval(request, `File matches protected pattern: ${protected_pattern}`);
        }
      }

      return this._approve(request, true);
    }

    return this._requestUserApproval(request);
  }

  /**
   * Request approval for command execution
   */
  public async requestExecuteApproval(command: string): Promise<ApprovalResult> {
    const request = this._createRequest('execute', `Execute: ${command}`, { command });

    // Check denied commands first
    const commandBase = command.split(' ')[0];
    for (const denied of this._config.execute.deniedCommands) {
      if (this._matchPattern(commandBase, denied) || this._matchPattern(command, denied)) {
        return this._deny(request, `Command matches denied pattern: ${denied}`);
      }
    }

    // Check allowed commands
    for (const allowed of this._config.execute.allowedCommands) {
      if (this._matchPattern(commandBase, allowed) || this._matchPattern(command, allowed)) {
        if (!this._config.execute.requireConfirmation) {
          return this._approve(request, true);
        }
      }
    }

    return this._requestUserApproval(request);
  }

  /**
   * Request approval for MCP tool call
   */
  public async requestMcpApproval(toolName: string): Promise<ApprovalResult> {
    const request = this._createRequest('mcp', `MCP Tool: ${toolName}`, { toolName });

    if (this._config.mcp.enabled) {
      // Check if tool is in allowed list
      if (this._config.mcp.allowedTools.length === 0 ||
          this._config.mcp.allowedTools.some(t => this._matchPattern(toolName, t))) {
        return this._approve(request, true);
      }
    }

    return this._requestUserApproval(request);
  }

  /**
   * Request approval for browser action
   */
  public async requestBrowserApproval(url: string): Promise<ApprovalResult> {
    const request = this._createRequest('browser', `Open URL: ${url}`, { path: url });

    if (this._config.browser.enabled) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // Check allowed domains
        if (this._config.browser.allowedDomains.length === 0 ||
            this._config.browser.allowedDomains.some(d => this._matchPattern(domain, d))) {
          return this._approve(request, true);
        }
      } catch {
        // Invalid URL
      }
    }

    return this._requestUserApproval(request);
  }

  /**
   * Get approval history
   */
  public getHistory(): ApprovalRequest[] {
    return [...this._history];
  }

  /**
   * Clear history
   */
  public clearHistory(): void {
    this._history = [];
  }

  // Private methods

  private _loadConfig(): ApprovalConfig {
    const config = vscode.workspace.getConfiguration('aitm.autoApproval');

    return {
      read: {
        enabled: config.get<boolean>('read.enabled', true),
        outsideWorkspace: config.get<boolean>('read.outsideWorkspace', false),
        maxFileSize: config.get<number>('read.maxFileSize', 10 * 1024 * 1024), // 10MB default
      },
      write: {
        enabled: config.get<boolean>('write.enabled', false),
        outsideWorkspace: config.get<boolean>('write.outsideWorkspace', false),
        protectedPaths: config.get<string[]>('write.protectedPaths', [
          '.env*',
          '*.key',
          '*.pem',
          'credentials*',
          'secrets*',
          '.git/**',
        ]),
      },
      execute: {
        allowedCommands: config.get<string[]>('execute.allowedCommands', [
          'npm *',
          'node *',
          'npx *',
          'yarn *',
          'pnpm *',
          'git status',
          'git diff*',
          'git log*',
          'git branch*',
          'ls*',
          'cat*',
          'echo*',
        ]),
        deniedCommands: config.get<string[]>('execute.deniedCommands', [
          'rm -rf *',
          'sudo *',
          'chmod 777 *',
          'curl * | sh',
          'curl * | bash',
        ]),
        requireConfirmation: config.get<boolean>('execute.requireConfirmation', true),
      },
      browser: {
        enabled: config.get<boolean>('browser.enabled', false),
        allowedDomains: config.get<string[]>('browser.allowedDomains', [
          'github.com',
          'stackoverflow.com',
          'npmjs.com',
          'docs.*',
        ]),
      },
      mcp: {
        enabled: config.get<boolean>('mcp.enabled', true),
        allowedTools: config.get<string[]>('mcp.allowedTools', []),
      },
      notifications: {
        showApprovalPopups: config.get<boolean>('notifications.showApprovalPopups', true),
        logApprovals: config.get<boolean>('notifications.logApprovals', true),
      },
    };
  }

  private _watchConfigChanges(): void {
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aitm.autoApproval')) {
        this._config = this._loadConfig();
      }
    });
  }

  private _createRequest(
    type: ApprovalRequest['type'],
    action: string,
    extra: Partial<ApprovalRequest>
  ): ApprovalRequest {
    const request: ApprovalRequest = {
      id: `approval_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      type,
      action,
      timestamp: new Date(),
      ...extra,
    };

    this._history.push(request);
    this._onApprovalRequested.fire(request);

    return request;
  }

  private _approve(request: ApprovalRequest, autoApproved: boolean): ApprovalResult {
    request.autoApproved = autoApproved;
    request.userApproved = !autoApproved;

    const result: ApprovalResult = {
      approved: true,
      autoApproved,
    };

    if (this._config.notifications.logApprovals) {
      console.log(`[Approval] ${autoApproved ? 'Auto-' : ''}Approved: ${request.action}`);
    }

    this._onApprovalResult.fire({ request, result });
    return result;
  }

  private _deny(request: ApprovalRequest, reason: string): ApprovalResult {
    request.denied = true;

    const result: ApprovalResult = {
      approved: false,
      reason,
    };

    if (this._config.notifications.logApprovals) {
      console.log(`[Approval] Denied: ${request.action} - ${reason}`);
    }

    this._onApprovalResult.fire({ request, result });
    return result;
  }

  private async _requestUserApproval(
    request: ApprovalRequest,
    message?: string
  ): Promise<ApprovalResult> {
    if (!this._config.notifications.showApprovalPopups) {
      return this._deny(request, 'Manual approval required but popups disabled');
    }

    const displayMessage = message || request.action;

    const result = await vscode.window.showWarningMessage(
      `AI Time Machine: ${displayMessage}`,
      { modal: true },
      'Approve',
      'Approve All Similar',
      'Deny'
    );

    if (result === 'Approve') {
      return this._approve(request, false);
    }

    if (result === 'Approve All Similar') {
      // Add to auto-approval list based on type
      await this._addToAutoApproval(request);
      return this._approve(request, true);
    }

    return this._deny(request, 'User denied');
  }

  private async _addToAutoApproval(request: ApprovalRequest): Promise<void> {
    const config = vscode.workspace.getConfiguration('aitm.autoApproval');

    switch (request.type) {
      case 'execute':
        if (request.command) {
          const commandBase = request.command.split(' ')[0];
          const allowed = [...this._config.execute.allowedCommands, `${commandBase} *`];
          await config.update('execute.allowedCommands', allowed, vscode.ConfigurationTarget.Global);
        }
        break;
      case 'mcp':
        if (request.toolName) {
          const allowed = [...this._config.mcp.allowedTools, request.toolName];
          await config.update('mcp.allowedTools', allowed, vscode.ConfigurationTarget.Global);
        }
        break;
    }
  }

  private _matchPattern(value: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.')
      .replace(/{{DOUBLE_STAR}}/g, '.*');

    try {
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(value);
    } catch {
      return value.includes(pattern.replace(/\*/g, ''));
    }
  }

  private _formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// Export singleton accessor
export function getApprovalManager(): ApprovalManager {
  return ApprovalManager.getInstance();
}
