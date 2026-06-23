import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * CodeIntelligenceProvider - Kilocode-inspired code intelligence features
 *
 * Provides:
 * - Symbol history (when was this function last changed)
 * - Function timeline (see all versions of a function)
 * - Smart search (natural language checkpoint search)
 * - Code context (understand what changed in context)
 */
export class CodeIntelligenceProvider {
  private workspaceRoot: string | undefined;

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  /**
   * Get the history of a specific symbol (function, class, etc.)
   */
  async getSymbolHistory(
    filePath: string,
    symbolName: string
  ): Promise<SymbolHistoryEntry[]> {
    if (!this.workspaceRoot) return [];

    try {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      const output = this.execAitm(`symbol-history "${relativePath}" "${symbolName}" --json`);
      return JSON.parse(output);
    } catch {
      // Fallback: use file history and filter
      return this.getSymbolHistoryFallback(filePath, symbolName);
    }
  }

  /**
   * Fallback method for symbol history using file history
   */
  private async getSymbolHistoryFallback(
    filePath: string,
    symbolName: string
  ): Promise<SymbolHistoryEntry[]> {
    if (!this.workspaceRoot) return [];

    try {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      const output = this.execAitm(`file-history "${relativePath}" --json`);
      const history = JSON.parse(output);

      // Filter to entries that might contain the symbol
      return history.map((h: any) => ({
        checkpointId: h.checkpointId,
        timestamp: h.timestamp,
        description: h.description,
        changeType: h.changeType,
        symbolName,
        filePath: relativePath,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Find when a specific piece of code was introduced
   */
  async findCodeOrigin(
    filePath: string,
    lineNumber: number
  ): Promise<CodeOriginResult | null> {
    if (!this.workspaceRoot) return null;

    try {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      const output = this.execAitm(`blame "${relativePath}" --line ${lineNumber} --json`);
      return JSON.parse(output);
    } catch {
      return null;
    }
  }

  /**
   * Natural language search for checkpoints
   */
  async naturalLanguageSearch(query: string): Promise<SearchResult[]> {
    try {
      // Try natural language search first
      const output = this.execAitm(`search "${query}" --natural --json`);
      return JSON.parse(output);
    } catch {
      // Fallback to basic search
      try {
        const output = this.execAitm(`search "${query}" --json`);
        const checkpoints = JSON.parse(output);
        return checkpoints.map((cp: any) => ({
          type: 'checkpoint',
          id: cp.id || cp.checkpointId,
          title: cp.description || cp.name,
          timestamp: cp.timestamp || cp.createdAt,
          relevance: 1.0,
        }));
      } catch {
        return [];
      }
    }
  }

  /**
   * Get code at a specific checkpoint
   */
  async getCodeAtCheckpoint(
    checkpointId: string,
    filePath: string
  ): Promise<string | null> {
    if (!this.workspaceRoot) return null;

    try {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      return this.execAitm(`get-file ${checkpointId} "${relativePath}"`);
    } catch {
      return null;
    }
  }

  /**
   * Compare a function across checkpoints
   */
  async compareFunctionVersions(
    filePath: string,
    symbolName: string,
    fromCheckpoint: string,
    toCheckpoint?: string
  ): Promise<FunctionComparison | null> {
    if (!this.workspaceRoot) return null;

    try {
      const relativePath = path.relative(this.workspaceRoot, filePath);
      const fromCode = await this.getCodeAtCheckpoint(fromCheckpoint, filePath);

      let toCode: string | null;
      if (toCheckpoint) {
        toCode = await this.getCodeAtCheckpoint(toCheckpoint, filePath);
      } else {
        // Current version
        const fullPath = path.join(this.workspaceRoot, relativePath);
        toCode = require('fs').readFileSync(fullPath, 'utf-8');
      }

      if (!fromCode || !toCode) return null;

      // Extract function from both versions (simplified)
      const fromFunction = this.extractFunction(fromCode, symbolName);
      const toFunction = this.extractFunction(toCode, symbolName);

      return {
        symbolName,
        filePath: relativePath,
        fromCheckpoint,
        toCheckpoint: toCheckpoint || 'current',
        fromCode: fromFunction,
        toCode: toFunction,
        changed: fromFunction !== toFunction,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract a function from source code (simplified)
   */
  private extractFunction(code: string, functionName: string): string | null {
    // Look for function patterns
    const patterns = [
      // function declaration
      new RegExp(`function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`, 'g'),
      // arrow function
      new RegExp(`(?:const|let|var)\\s+${functionName}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>`, 'g'),
      // method in class
      new RegExp(`(?:async\\s+)?${functionName}\\s*\\([^)]*\\)\\s*\\{`, 'g'),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(code);
      if (match) {
        // Find the end of the function (simplified - just get a chunk)
        const start = match.index;
        let braceCount = 0;
        let end = start;
        let foundFirst = false;

        for (let i = start; i < code.length; i++) {
          if (code[i] === '{') {
            braceCount++;
            foundFirst = true;
          } else if (code[i] === '}') {
            braceCount--;
          }
          if (foundFirst && braceCount === 0) {
            end = i + 1;
            break;
          }
        }

        return code.slice(start, end);
      }
    }

    return null;
  }

  /**
   * Get context for current editing session
   */
  async getCurrentContext(): Promise<EditingContext> {
    const activeEditor = vscode.window.activeTextEditor;
    const context: EditingContext = {
      currentFile: activeEditor?.document.uri.fsPath,
      recentFiles: [],
      recentCheckpoints: [],
      pendingChanges: [],
    };

    try {
      // Get recent checkpoints
      const output = this.execAitm('list --json --limit 5');
      context.recentCheckpoints = JSON.parse(output);
    } catch {
      // Ignore
    }

    try {
      // Get pending changes
      const output = this.execAitm('status --json');
      const status = JSON.parse(output);
      context.pendingChanges = status.modified || [];
    } catch {
      // Ignore
    }

    return context;
  }

  /**
   * Suggest a checkpoint description based on changes
   */
  async suggestCheckpointDescription(): Promise<string> {
    try {
      const output = this.execAitm('status --json');
      const status = JSON.parse(output);

      const modified = status.modified || [];
      const added = status.added || [];
      const deleted = status.deleted || [];

      if (modified.length === 1) {
        const file = path.basename(modified[0]);
        return `Update ${file}`;
      }

      if (added.length === 1 && modified.length === 0) {
        const file = path.basename(added[0]);
        return `Add ${file}`;
      }

      if (modified.length > 0) {
        // Find common directory
        const dirs = modified.map((f: string) => path.dirname(f));
        const commonDir = this.findCommonPrefix(dirs);
        if (commonDir && commonDir !== '.') {
          return `Update ${commonDir} (${modified.length} files)`;
        }
        return `Update ${modified.length} files`;
      }

      return 'Checkpoint';
    } catch {
      return 'Checkpoint';
    }
  }

  private findCommonPrefix(paths: string[]): string {
    if (paths.length === 0) return '';
    if (paths.length === 1) return paths[0];

    const sorted = paths.sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    let i = 0;
    while (i < first.length && first[i] === last[i]) {
      i++;
    }

    return first.slice(0, i).replace(/\/$/, '');
  }

  private execAitm(command: string): string {
    if (!this.workspaceRoot) {
      throw new Error('No workspace folder open');
    }

    return execSync(`aitm ${command}`, {
      cwd: this.workspaceRoot,
      encoding: 'utf-8',
    });
  }
}

// Types
export interface SymbolHistoryEntry {
  checkpointId: string;
  timestamp: string;
  description: string;
  changeType: 'added' | 'modified' | 'deleted';
  symbolName: string;
  filePath: string;
}

export interface CodeOriginResult {
  checkpointId: string;
  timestamp: string;
  description: string;
  line: number;
  content: string;
}

export interface SearchResult {
  type: 'checkpoint' | 'message' | 'file';
  id: string;
  title: string;
  timestamp: string;
  relevance: number;
  snippet?: string;
}

export interface FunctionComparison {
  symbolName: string;
  filePath: string;
  fromCheckpoint: string;
  toCheckpoint: string;
  fromCode: string | null;
  toCode: string | null;
  changed: boolean;
}

export interface EditingContext {
  currentFile?: string;
  recentFiles: string[];
  recentCheckpoints: any[];
  pendingChanges: string[];
}

/**
 * HoverProvider for showing checkpoint info on hover
 */
export class AitmHoverProvider implements vscode.HoverProvider {
  private codeIntelligence: CodeIntelligenceProvider;

  constructor() {
    this.codeIntelligence = new CodeIntelligenceProvider();
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    // Only show on function definitions
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) return null;

    const word = document.getText(wordRange);
    const line = document.lineAt(position.line).text;

    // Check if this is a function definition
    const isFunctionDef =
      line.includes(`function ${word}`) ||
      line.includes(`${word} =`) ||
      line.match(new RegExp(`(async\\s+)?${word}\\s*\\(`));

    if (!isFunctionDef) return null;

    // Get symbol history
    const history = await this.codeIntelligence.getSymbolHistory(
      document.uri.fsPath,
      word
    );

    if (history.length === 0) return null;

    const latest = history[0];
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**Time Machine**: Last modified in checkpoint\n\n`);
    markdown.appendMarkdown(`- ${latest.description}\n`);
    markdown.appendMarkdown(`- *${new Date(latest.timestamp).toLocaleString()}*\n\n`);
    markdown.appendMarkdown(`[View History](command:aitm.showSymbolHistory?${encodeURIComponent(JSON.stringify({ symbol: word, file: document.uri.fsPath }))})`);
    markdown.isTrusted = true;

    return new vscode.Hover(markdown, wordRange);
  }
}

/**
 * Quick Pick item for checkpoint selection
 */
export class CheckpointQuickPickItem implements vscode.QuickPickItem {
  label: string;
  description: string;
  detail?: string;
  checkpointId: string;

  constructor(checkpoint: any) {
    this.checkpointId = checkpoint.id || checkpoint.checkpointId;
    this.label = checkpoint.description || checkpoint.name;
    this.description = new Date(checkpoint.timestamp || checkpoint.createdAt).toLocaleString();
    this.detail = `${checkpoint.stats?.totalFiles || 0} files`;
  }
}
