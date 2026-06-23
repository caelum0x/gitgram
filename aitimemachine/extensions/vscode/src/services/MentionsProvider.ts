/**
 * MentionsProvider - @-mentions for files, symbols, and checkpoints
 * Provides autocomplete suggestions when typing @ in chat
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type MentionType = 'file' | 'symbol' | 'checkpoint' | 'url' | 'selection';

export interface Mention {
  type: MentionType;
  value: string;
  display: string;
  description?: string;
  icon?: string;
  range?: vscode.Range;
  uri?: vscode.Uri;
}

export interface MentionSuggestion {
  mention: Mention;
  relevance: number;
}

export class MentionsProvider implements vscode.Disposable {
  private static instance: MentionsProvider;
  private _disposables: vscode.Disposable[] = [];
  private _recentMentions: Mention[] = [];
  private _maxRecentMentions = 20;

  private constructor() {
    // Load recent mentions from workspace state
    this._loadRecentMentions();
  }

  public static getInstance(): MentionsProvider {
    if (!MentionsProvider.instance) {
      MentionsProvider.instance = new MentionsProvider();
    }
    return MentionsProvider.instance;
  }

  /**
   * Get suggestions for a mention query
   */
  public async getSuggestions(query: string, limit: number = 10): Promise<MentionSuggestion[]> {
    const suggestions: MentionSuggestion[] = [];
    const lowerQuery = query.toLowerCase();

    // Determine mention type from prefix
    let searchType: MentionType | null = null;
    let searchQuery = query;

    if (query.startsWith('file:')) {
      searchType = 'file';
      searchQuery = query.substring(5);
    } else if (query.startsWith('symbol:') || query.startsWith('sym:')) {
      searchType = 'symbol';
      searchQuery = query.replace(/^(symbol:|sym:)/, '');
    } else if (query.startsWith('checkpoint:') || query.startsWith('cp:')) {
      searchType = 'checkpoint';
      searchQuery = query.replace(/^(checkpoint:|cp:)/, '');
    } else if (query.startsWith('url:') || query.startsWith('http')) {
      searchType = 'url';
      searchQuery = query.replace(/^url:/, '');
    } else if (query.startsWith('selection') || query.startsWith('sel:')) {
      searchType = 'selection';
      searchQuery = '';
    }

    // Get suggestions based on type
    if (!searchType || searchType === 'file') {
      const fileSuggestions = await this._getFileSuggestions(searchQuery, limit);
      suggestions.push(...fileSuggestions);
    }

    if (!searchType || searchType === 'symbol') {
      const symbolSuggestions = await this._getSymbolSuggestions(searchQuery, limit);
      suggestions.push(...symbolSuggestions);
    }

    if (!searchType || searchType === 'checkpoint') {
      const checkpointSuggestions = await this._getCheckpointSuggestions(searchQuery, limit);
      suggestions.push(...checkpointSuggestions);
    }

    if (searchType === 'selection') {
      const selectionSuggestion = this._getSelectionSuggestion();
      if (selectionSuggestion) {
        suggestions.push(selectionSuggestion);
      }
    }

    // Add recent mentions if query is empty
    if (!query) {
      const recentSuggestions = this._recentMentions
        .slice(0, 5)
        .map((m, i) => ({
          mention: m,
          relevance: 100 - i,
        }));
      suggestions.push(...recentSuggestions);
    }

    // Sort by relevance and dedupe
    const seen = new Set<string>();
    return suggestions
      .filter(s => {
        const key = `${s.mention.type}:${s.mention.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  /**
   * Parse mentions from text
   */
  public parseMentions(text: string): Mention[] {
    const mentions: Mention[] = [];
    const mentionRegex = /@(\w+:)?([^\s@]+)/g;

    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const prefix = match[1] || '';
      const value = match[2];

      let type: MentionType = 'file';
      if (prefix.startsWith('symbol') || prefix.startsWith('sym')) {
        type = 'symbol';
      } else if (prefix.startsWith('checkpoint') || prefix.startsWith('cp')) {
        type = 'checkpoint';
      } else if (prefix.startsWith('url') || value.startsWith('http')) {
        type = 'url';
      } else if (prefix.startsWith('sel')) {
        type = 'selection';
      }

      mentions.push({
        type,
        value,
        display: match[0],
      });
    }

    return mentions;
  }

  /**
   * Resolve mention to content
   */
  public async resolveMention(mention: Mention): Promise<string> {
    switch (mention.type) {
      case 'file':
        return this._resolveFileMention(mention);
      case 'symbol':
        return this._resolveSymbolMention(mention);
      case 'checkpoint':
        return this._resolveCheckpointMention(mention);
      case 'url':
        return this._resolveUrlMention(mention);
      case 'selection':
        return this._resolveSelectionMention(mention);
      default:
        return mention.value;
    }
  }

  /**
   * Add to recent mentions
   */
  public addToRecent(mention: Mention): void {
    // Remove if already exists
    this._recentMentions = this._recentMentions.filter(
      m => !(m.type === mention.type && m.value === mention.value)
    );

    // Add to front
    this._recentMentions.unshift(mention);

    // Trim to max
    if (this._recentMentions.length > this._maxRecentMentions) {
      this._recentMentions = this._recentMentions.slice(0, this._maxRecentMentions);
    }

    // Save
    this._saveRecentMentions();
  }

  /**
   * Get recent mentions
   */
  public getRecentMentions(): Mention[] {
    return [...this._recentMentions];
  }

  /**
   * Clear recent mentions
   */
  public clearRecentMentions(): void {
    this._recentMentions = [];
    this._saveRecentMentions();
  }

  /**
   * Dispose
   */
  public dispose(): void {
    this._disposables.forEach(d => d.dispose());
  }

  // Private methods

  private async _getFileSuggestions(query: string, limit: number): Promise<MentionSuggestion[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];

    const suggestions: MentionSuggestion[] = [];

    try {
      // Use VS Code's findFiles API
      const pattern = query ? `**/*${query}*` : '**/*';
      const files = await vscode.workspace.findFiles(
        pattern,
        '**/node_modules/**',
        limit * 2
      );

      for (const file of files) {
        const relativePath = vscode.workspace.asRelativePath(file);
        const fileName = path.basename(file.fsPath);
        const lowerPath = relativePath.toLowerCase();
        const lowerQuery = query.toLowerCase();

        // Calculate relevance
        let relevance = 50;
        if (fileName.toLowerCase().includes(lowerQuery)) {
          relevance += 30;
        }
        if (fileName.toLowerCase().startsWith(lowerQuery)) {
          relevance += 20;
        }
        if (lowerPath === lowerQuery) {
          relevance = 100;
        }

        // Get icon based on extension
        const ext = path.extname(file.fsPath);
        let icon = '$(file)';
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
          icon = '$(file-code)';
        } else if (['.md', '.txt'].includes(ext)) {
          icon = '$(file-text)';
        } else if (['.json', '.yaml', '.yml'].includes(ext)) {
          icon = '$(settings-gear)';
        } else if (['.css', '.scss', '.less'].includes(ext)) {
          icon = '$(symbol-color)';
        }

        suggestions.push({
          mention: {
            type: 'file',
            value: relativePath,
            display: `@${relativePath}`,
            description: path.dirname(relativePath),
            icon,
            uri: file,
          },
          relevance,
        });
      }
    } catch (error) {
      console.error('File suggestion error:', error);
    }

    return suggestions.slice(0, limit);
  }

  private async _getSymbolSuggestions(query: string, limit: number): Promise<MentionSuggestion[]> {
    if (!query || query.length < 2) return [];

    const suggestions: MentionSuggestion[] = [];

    try {
      // Use VS Code's symbol search
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        query
      );

      if (symbols) {
        for (const symbol of symbols.slice(0, limit)) {
          const relativePath = vscode.workspace.asRelativePath(symbol.location.uri);

          // Get icon based on symbol kind
          let icon = '$(symbol-misc)';
          switch (symbol.kind) {
            case vscode.SymbolKind.Function:
            case vscode.SymbolKind.Method:
              icon = '$(symbol-method)';
              break;
            case vscode.SymbolKind.Class:
              icon = '$(symbol-class)';
              break;
            case vscode.SymbolKind.Interface:
              icon = '$(symbol-interface)';
              break;
            case vscode.SymbolKind.Variable:
            case vscode.SymbolKind.Constant:
              icon = '$(symbol-variable)';
              break;
            case vscode.SymbolKind.Property:
            case vscode.SymbolKind.Field:
              icon = '$(symbol-property)';
              break;
            case vscode.SymbolKind.Enum:
              icon = '$(symbol-enum)';
              break;
          }

          // Calculate relevance
          let relevance = 50;
          if (symbol.name.toLowerCase().startsWith(query.toLowerCase())) {
            relevance += 30;
          }
          if (symbol.name.toLowerCase() === query.toLowerCase()) {
            relevance += 20;
          }

          suggestions.push({
            mention: {
              type: 'symbol',
              value: `${symbol.name}@${relativePath}`,
              display: `@symbol:${symbol.name}`,
              description: `${relativePath}:${symbol.location.range.start.line + 1}`,
              icon,
              uri: symbol.location.uri,
              range: symbol.location.range,
            },
            relevance,
          });
        }
      }
    } catch (error) {
      console.error('Symbol suggestion error:', error);
    }

    return suggestions;
  }

  private async _getCheckpointSuggestions(query: string, limit: number): Promise<MentionSuggestion[]> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];

    const suggestions: MentionSuggestion[] = [];

    try {
      const { execSync } = require('child_process');
      const output = execSync('aitm list --json', {
        cwd: workspaceRoot,
        encoding: 'utf-8',
      });

      const checkpoints = JSON.parse(output);
      const lowerQuery = query.toLowerCase();

      for (const cp of checkpoints.slice(0, limit * 2)) {
        const description = cp.description || cp.name || cp.id;
        const lowerDesc = description.toLowerCase();

        // Calculate relevance
        let relevance = 50;
        if (lowerDesc.includes(lowerQuery)) {
          relevance += 30;
        }
        if (lowerDesc.startsWith(lowerQuery)) {
          relevance += 20;
        }

        suggestions.push({
          mention: {
            type: 'checkpoint',
            value: cp.id,
            display: `@cp:${cp.id.substring(0, 8)}`,
            description: description,
            icon: '$(history)',
          },
          relevance,
        });
      }
    } catch {
      // Checkpoint listing failed
    }

    return suggestions.slice(0, limit);
  }

  private _getSelectionSuggestion(): MentionSuggestion | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return null;
    }

    const selection = editor.document.getText(editor.selection);
    const lines = selection.split('\n').length;
    const relativePath = vscode.workspace.asRelativePath(editor.document.uri);

    return {
      mention: {
        type: 'selection',
        value: selection,
        display: '@selection',
        description: `${lines} line(s) from ${relativePath}`,
        icon: '$(selection)',
        uri: editor.document.uri,
        range: editor.selection,
      },
      relevance: 100,
    };
  }

  private async _resolveFileMention(mention: Mention): Promise<string> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return `[File: ${mention.value}]`;

    const filePath = path.join(workspaceRoot, mention.value);

    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const ext = path.extname(filePath).slice(1) || 'text';
        return `\`\`\`${ext}\n// File: ${mention.value}\n${content}\n\`\`\``;
      }
    } catch {
      // File read failed
    }

    return `[File: ${mention.value}]`;
  }

  private async _resolveSymbolMention(mention: Mention): Promise<string> {
    // Parse symbol@file format
    const [symbolName, filePath] = mention.value.split('@');

    if (mention.uri && mention.range) {
      try {
        const document = await vscode.workspace.openTextDocument(mention.uri);

        // Get the symbol definition with some context
        const startLine = Math.max(0, mention.range.start.line - 2);
        const endLine = Math.min(document.lineCount - 1, mention.range.end.line + 20);

        const contextRange = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
        const content = document.getText(contextRange);

        const relativePath = filePath || vscode.workspace.asRelativePath(mention.uri);
        const lang = document.languageId;

        return `\`\`\`${lang}\n// Symbol: ${symbolName} in ${relativePath}\n${content}\n\`\`\``;
      } catch {
        // Document read failed
      }
    }

    return `[Symbol: ${symbolName}${filePath ? ` in ${filePath}` : ''}]`;
  }

  private async _resolveCheckpointMention(mention: Mention): Promise<string> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return `[Checkpoint: ${mention.value}]`;

    try {
      const { execSync } = require('child_process');
      const output = execSync(`aitm show ${mention.value} --json`, {
        cwd: workspaceRoot,
        encoding: 'utf-8',
      });

      const checkpoint = JSON.parse(output);
      return `[Checkpoint: ${checkpoint.description || mention.value}]\n` +
             `- Created: ${checkpoint.timestamp}\n` +
             `- Files: ${checkpoint.stats?.totalFiles || 'N/A'}`;
    } catch {
      return `[Checkpoint: ${mention.value}]`;
    }
  }

  private async _resolveUrlMention(mention: Mention): Promise<string> {
    // For now, just format the URL
    // In a real implementation, this could fetch and summarize the content
    return `[URL: ${mention.value}]`;
  }

  private async _resolveSelectionMention(mention: Mention): Promise<string> {
    if (mention.value) {
      const editor = vscode.window.activeTextEditor;
      const lang = editor?.document.languageId || 'text';
      const relativePath = editor ? vscode.workspace.asRelativePath(editor.document.uri) : 'unknown';

      return `\`\`\`${lang}\n// Selected code from ${relativePath}\n${mention.value}\n\`\`\``;
    }
    return '[No selection]';
  }

  private _loadRecentMentions(): void {
    // Would load from workspace state in a real implementation
    this._recentMentions = [];
  }

  private _saveRecentMentions(): void {
    // Would save to workspace state in a real implementation
  }
}

// Export singleton accessor
export function getMentionsProvider(): MentionsProvider {
  return MentionsProvider.getInstance();
}
