/**
 * CommitMessageGenerator - AI-powered commit message generation
 * Analyzes staged changes and generates meaningful commit messages
 */

import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as path from 'path';

export interface CommitMessageConfig {
  enabled: boolean;
  style: 'conventional' | 'simple' | 'detailed';
  includeScope: boolean;
  includeBody: boolean;
  maxLength: number;
}

export interface GeneratedCommitMessage {
  title: string;
  body?: string;
  type?: string;
  scope?: string;
  breaking?: boolean;
}

export interface StagedChange {
  file: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  diff?: string;
}

export class CommitMessageGenerator implements vscode.Disposable {
  private static instance: CommitMessageGenerator;
  private _config: CommitMessageConfig;
  private _disposables: vscode.Disposable[] = [];
  private _onMessageGenerated = new vscode.EventEmitter<GeneratedCommitMessage>();

  public readonly onMessageGenerated = this._onMessageGenerated.event;

  private constructor() {
    this._config = this._loadConfig();

    // Watch config changes
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('aitm.commitMessage')) {
          this._config = this._loadConfig();
        }
      })
    );

    // Register commands
    this._registerCommands();
  }

  public static getInstance(): CommitMessageGenerator {
    if (!CommitMessageGenerator.instance) {
      CommitMessageGenerator.instance = new CommitMessageGenerator();
    }
    return CommitMessageGenerator.instance;
  }

  /**
   * Get configuration
   */
  public getConfig(): CommitMessageConfig {
    return { ...this._config };
  }

  /**
   * Generate commit message for staged changes
   */
  public async generateCommitMessage(): Promise<GeneratedCommitMessage | null> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('No workspace folder open');
      return null;
    }

    try {
      // Get staged changes
      const stagedChanges = this._getStagedChanges(workspaceRoot);

      if (stagedChanges.length === 0) {
        vscode.window.showInformationMessage('No staged changes to generate commit message for');
        return null;
      }

      // Generate message based on changes
      const message = await this._analyzeAndGenerate(stagedChanges, workspaceRoot);

      this._onMessageGenerated.fire(message);

      return message;
    } catch (error) {
      console.error('Commit message generation error:', error);
      vscode.window.showErrorMessage(`Failed to generate commit message: ${error}`);
      return null;
    }
  }

  /**
   * Generate and insert commit message into Git SCM input
   */
  public async generateAndInsert(): Promise<void> {
    const message = await this.generateCommitMessage();
    if (!message) return;

    const fullMessage = this._formatMessage(message);

    // Try to insert into Git SCM input
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (gitExtension) {
      const api = gitExtension.getAPI(1);
      const repository = api.repositories[0];

      if (repository) {
        repository.inputBox.value = fullMessage;
        vscode.window.showInformationMessage('Commit message generated and inserted!');
        return;
      }
    }

    // Fallback: show in quick pick and copy to clipboard
    const action = await vscode.window.showInformationMessage(
      'Generated commit message:',
      { modal: true, detail: fullMessage },
      'Copy to Clipboard',
      'Edit'
    );

    if (action === 'Copy to Clipboard') {
      await vscode.env.clipboard.writeText(fullMessage);
      vscode.window.showInformationMessage('Commit message copied to clipboard!');
    } else if (action === 'Edit') {
      const edited = await vscode.window.showInputBox({
        value: fullMessage,
        prompt: 'Edit commit message',
        ignoreFocusOut: true,
      });

      if (edited) {
        await vscode.env.clipboard.writeText(edited);
        vscode.window.showInformationMessage('Edited commit message copied to clipboard!');
      }
    }
  }

  /**
   * Dispose
   */
  public dispose(): void {
    this._onMessageGenerated.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  // Private methods

  private _loadConfig(): CommitMessageConfig {
    const config = vscode.workspace.getConfiguration('aitm.commitMessage');

    return {
      enabled: config.get<boolean>('enabled', true),
      style: config.get<'conventional' | 'simple' | 'detailed'>('style', 'conventional'),
      includeScope: config.get<boolean>('includeScope', true),
      includeBody: config.get<boolean>('includeBody', true),
      maxLength: config.get<number>('maxLength', 72),
    };
  }

  private _registerCommands(): void {
    this._disposables.push(
      vscode.commands.registerCommand('aitm.generateCommitMessage', () => {
        this.generateAndInsert();
      }),
      vscode.commands.registerCommand('aitm.generateCommitMessagePreview', async () => {
        const message = await this.generateCommitMessage();
        if (message) {
          const formatted = this._formatMessage(message);
          vscode.window.showInformationMessage(formatted);
        }
      })
    );
  }

  private _getStagedChanges(workspaceRoot: string): StagedChange[] {
    try {
      // Get list of staged files
      const stagedOutput = execSync('git diff --cached --name-status', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
      });

      const changes: StagedChange[] = [];

      for (const line of stagedOutput.split('\n').filter(Boolean)) {
        const [status, ...fileParts] = line.split('\t');
        const file = fileParts.join('\t');

        let changeStatus: StagedChange['status'];
        switch (status[0]) {
          case 'A':
            changeStatus = 'added';
            break;
          case 'M':
            changeStatus = 'modified';
            break;
          case 'D':
            changeStatus = 'deleted';
            break;
          case 'R':
            changeStatus = 'renamed';
            break;
          default:
            changeStatus = 'modified';
        }

        // Get diff for the file (limited)
        let diff: string | undefined;
        if (changeStatus !== 'deleted') {
          try {
            diff = execSync(`git diff --cached --no-color "${file}" | head -50`, {
              cwd: workspaceRoot,
              encoding: 'utf-8',
            });
          } catch {
            // Ignore diff errors
          }
        }

        changes.push({ file, status: changeStatus, diff });
      }

      return changes;
    } catch (error) {
      console.error('Failed to get staged changes:', error);
      return [];
    }
  }

  private async _analyzeAndGenerate(
    changes: StagedChange[],
    workspaceRoot: string
  ): Promise<GeneratedCommitMessage> {
    // Analyze changes to determine commit type and scope
    const analysis = this._analyzeChanges(changes);

    // Generate message based on style
    switch (this._config.style) {
      case 'conventional':
        return this._generateConventional(analysis, changes);
      case 'detailed':
        return this._generateDetailed(analysis, changes);
      default:
        return this._generateSimple(analysis, changes);
    }
  }

  private _analyzeChanges(changes: StagedChange[]): {
    type: string;
    scope: string;
    isBreaking: boolean;
    primaryAction: string;
  } {
    // Determine primary directories affected
    const directories = new Set<string>();
    const extensions = new Set<string>();

    for (const change of changes) {
      const dir = path.dirname(change.file).split(path.sep)[0] || 'root';
      directories.add(dir);
      extensions.add(path.extname(change.file));
    }

    // Determine scope
    let scope = '';
    if (directories.size === 1) {
      scope = [...directories][0];
    } else if (directories.size <= 3) {
      scope = [...directories].join(',');
    }

    // Determine type based on changes
    let type = 'chore';
    let primaryAction = 'update';

    const allFiles = changes.map(c => c.file.toLowerCase());
    const allDiffs = changes.map(c => c.diff || '').join('\n').toLowerCase();

    // Check for specific patterns
    if (allFiles.some(f => f.includes('test') || f.includes('spec'))) {
      type = 'test';
      primaryAction = 'add tests for';
    } else if (allFiles.some(f => f.includes('readme') || f.includes('doc'))) {
      type = 'docs';
      primaryAction = 'document';
    } else if (allFiles.some(f => f.includes('.config') || f.includes('config'))) {
      type = 'chore';
      primaryAction = 'configure';
    } else if (allDiffs.includes('fix') || allDiffs.includes('bug') || allDiffs.includes('error')) {
      type = 'fix';
      primaryAction = 'fix';
    } else if (changes.every(c => c.status === 'added')) {
      type = 'feat';
      primaryAction = 'add';
    } else if (changes.some(c => c.status === 'deleted')) {
      type = 'refactor';
      primaryAction = 'remove';
    } else if (allDiffs.includes('refactor') || allDiffs.includes('rename')) {
      type = 'refactor';
      primaryAction = 'refactor';
    } else if (allDiffs.includes('perf') || allDiffs.includes('optim')) {
      type = 'perf';
      primaryAction = 'optimize';
    } else if (allDiffs.includes('style') || extensions.has('.css') || extensions.has('.scss')) {
      type = 'style';
      primaryAction = 'style';
    } else {
      type = 'feat';
      primaryAction = 'update';
    }

    // Check for breaking changes
    const isBreaking = allDiffs.includes('breaking') || allDiffs.includes('BREAKING');

    return { type, scope, isBreaking, primaryAction };
  }

  private _generateConventional(
    analysis: ReturnType<typeof this._analyzeChanges>,
    changes: StagedChange[]
  ): GeneratedCommitMessage {
    const { type, scope, isBreaking, primaryAction } = analysis;

    // Generate title
    const files = changes.map(c => path.basename(c.file));
    let description = '';

    if (files.length === 1) {
      description = `${primaryAction} ${files[0]}`;
    } else if (files.length <= 3) {
      description = `${primaryAction} ${files.join(', ')}`;
    } else {
      description = `${primaryAction} ${files.length} files`;
    }

    // Truncate if needed
    const maxDescLength = this._config.maxLength - type.length - (scope ? scope.length + 4 : 2) - (isBreaking ? 1 : 0);
    if (description.length > maxDescLength) {
      description = description.substring(0, maxDescLength - 3) + '...';
    }

    // Build title
    let title = type;
    if (this._config.includeScope && scope) {
      title += `(${scope})`;
    }
    if (isBreaking) {
      title += '!';
    }
    title += `: ${description}`;

    // Generate body if requested
    let body: string | undefined;
    if (this._config.includeBody) {
      const bodyLines: string[] = [];

      if (changes.length > 3) {
        bodyLines.push('Changes:');
        for (const change of changes.slice(0, 10)) {
          const statusIcon = change.status === 'added' ? '+' : change.status === 'deleted' ? '-' : '~';
          bodyLines.push(`  ${statusIcon} ${change.file}`);
        }
        if (changes.length > 10) {
          bodyLines.push(`  ... and ${changes.length - 10} more files`);
        }
      }

      if (isBreaking) {
        bodyLines.push('');
        bodyLines.push('BREAKING CHANGE: This commit contains breaking changes.');
      }

      if (bodyLines.length > 0) {
        body = bodyLines.join('\n');
      }
    }

    return {
      title,
      body,
      type,
      scope: scope || undefined,
      breaking: isBreaking,
    };
  }

  private _generateSimple(
    analysis: ReturnType<typeof this._analyzeChanges>,
    changes: StagedChange[]
  ): GeneratedCommitMessage {
    const { primaryAction } = analysis;
    const files = changes.map(c => path.basename(c.file));

    let title: string;
    if (files.length === 1) {
      title = `${this._capitalize(primaryAction)} ${files[0]}`;
    } else if (files.length <= 3) {
      title = `${this._capitalize(primaryAction)} ${files.join(', ')}`;
    } else {
      title = `${this._capitalize(primaryAction)} ${files.length} files`;
    }

    if (title.length > this._config.maxLength) {
      title = title.substring(0, this._config.maxLength - 3) + '...';
    }

    return { title };
  }

  private _generateDetailed(
    analysis: ReturnType<typeof this._analyzeChanges>,
    changes: StagedChange[]
  ): GeneratedCommitMessage {
    const conv = this._generateConventional(analysis, changes);

    // Add more detailed body
    const bodyLines: string[] = [];

    // Group by status
    const added = changes.filter(c => c.status === 'added');
    const modified = changes.filter(c => c.status === 'modified');
    const deleted = changes.filter(c => c.status === 'deleted');

    if (added.length > 0) {
      bodyLines.push(`Added (${added.length}):`);
      added.slice(0, 5).forEach(c => bodyLines.push(`  + ${c.file}`));
      if (added.length > 5) bodyLines.push(`  ... and ${added.length - 5} more`);
      bodyLines.push('');
    }

    if (modified.length > 0) {
      bodyLines.push(`Modified (${modified.length}):`);
      modified.slice(0, 5).forEach(c => bodyLines.push(`  ~ ${c.file}`));
      if (modified.length > 5) bodyLines.push(`  ... and ${modified.length - 5} more`);
      bodyLines.push('');
    }

    if (deleted.length > 0) {
      bodyLines.push(`Deleted (${deleted.length}):`);
      deleted.slice(0, 5).forEach(c => bodyLines.push(`  - ${c.file}`));
      if (deleted.length > 5) bodyLines.push(`  ... and ${deleted.length - 5} more`);
    }

    return {
      ...conv,
      body: bodyLines.join('\n') || conv.body,
    };
  }

  private _formatMessage(message: GeneratedCommitMessage): string {
    let result = message.title;

    if (message.body) {
      result += '\n\n' + message.body;
    }

    return result;
  }

  private _capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Export singleton accessor
export function getCommitMessageGenerator(): CommitMessageGenerator {
  return CommitMessageGenerator.getInstance();
}
