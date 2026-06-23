/**
 * GhostService - Inline code suggestion service
 * Provides AI-powered inline code suggestions with keyboard shortcuts
 */

import * as vscode from 'vscode';
import { MCPClient } from '../mcp/MCPClient';

export interface GhostSuggestion {
  id: string;
  range: vscode.Range;
  text: string;
  description?: string;
  confidence: number;
}

export interface GhostConfig {
  enabled: boolean;
  triggerDelay: number;
  maxSuggestions: number;
  showInlineHints: boolean;
  keyboardShortcut: string;
}

export class GhostService implements vscode.Disposable {
  private static instance: GhostService;
  private _disposables: vscode.Disposable[] = [];
  private _config: GhostConfig;
  private _suggestions: GhostSuggestion[] = [];
  private _currentIndex: number = 0;
  private _decorationType: vscode.TextEditorDecorationType;
  private _statusBarItem: vscode.StatusBarItem;
  private _isActive: boolean = false;
  private _onSuggestionsChanged = new vscode.EventEmitter<GhostSuggestion[]>();
  private _mcpClient: MCPClient | null = null;
  private _contextCache: { data: any; timestamp: number } | null = null;
  private static CONTEXT_TTL = 5000; // 5 second cache

  public readonly onSuggestionsChanged = this._onSuggestionsChanged.event;

  private constructor() {
    this._config = this._loadConfig();

    // Create decoration type for ghost text
    this._decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        color: new vscode.ThemeColor('editorGhostText.foreground'),
        fontStyle: 'italic',
      },
      isWholeLine: false,
    });

    // Create status bar item
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this._statusBarItem.command = 'aitm.ghost.toggleSuggestions';
    this._updateStatusBar();

    // Watch config changes
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('aitm.ghost')) {
          this._config = this._loadConfig();
          this._updateStatusBar();
        }
      })
    );

    // Register commands
    this._registerCommands();
  }

  public static getInstance(): GhostService {
    if (!GhostService.instance) {
      GhostService.instance = new GhostService();
    }
    return GhostService.instance;
  }

  /**
   * Get current configuration
   */
  public getConfig(): GhostConfig {
    return { ...this._config };
  }

  /**
   * Check if ghost is active
   */
  public isActive(): boolean {
    return this._isActive;
  }

  /**
   * Generate suggestions for current cursor position
   */
  public async generateSuggestions(): Promise<void> {
    if (!this._config.enabled) {
      vscode.window.showInformationMessage('Ghost suggestions are disabled. Enable in settings.');
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    this._isActive = true;
    this._updateStatusBar();

    try {
      // Get context around cursor
      const document = editor.document;
      const position = editor.selection.active;
      const context = this._getContext(document, position);

      // Generate suggestions using AI with MCP checkpoint context
      const suggestions = await this._fetchSuggestions(context, document.languageId);

      this._suggestions = suggestions;
      this._currentIndex = 0;

      if (suggestions.length > 0) {
        this._showCurrentSuggestion(editor);
        vscode.window.showInformationMessage(
          `Ghost: ${suggestions.length} suggestion(s). Tab to apply, Esc to cancel.`
        );
      } else {
        vscode.window.showInformationMessage('Ghost: No suggestions available.');
        this._isActive = false;
      }

      this._onSuggestionsChanged.fire(this._suggestions);
    } catch (error) {
      console.error('Ghost suggestion error:', error);
      this._isActive = false;
    }

    this._updateStatusBar();
  }

  /**
   * Apply current suggestion
   */
  public async applyCurrentSuggestion(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || this._suggestions.length === 0) {
      return;
    }

    const suggestion = this._suggestions[this._currentIndex];

    await editor.edit(editBuilder => {
      editBuilder.replace(suggestion.range, suggestion.text);
    });

    // Clear suggestions after applying
    this.cancelSuggestions();

    vscode.window.showInformationMessage('Ghost: Suggestion applied!');
  }

  /**
   * Apply all suggestions
   */
  public async applyAllSuggestions(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || this._suggestions.length === 0) {
      return;
    }

    // Sort by range position (reverse order to maintain positions)
    const sorted = [...this._suggestions].sort((a, b) =>
      b.range.start.compareTo(a.range.start)
    );

    await editor.edit(editBuilder => {
      for (const suggestion of sorted) {
        editBuilder.replace(suggestion.range, suggestion.text);
      }
    });

    this.cancelSuggestions();

    vscode.window.showInformationMessage(`Ghost: Applied ${sorted.length} suggestion(s)!`);
  }

  /**
   * Go to next suggestion
   */
  public goToNextSuggestion(): void {
    if (this._suggestions.length === 0) return;

    this._currentIndex = (this._currentIndex + 1) % this._suggestions.length;

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this._showCurrentSuggestion(editor);
    }
  }

  /**
   * Go to previous suggestion
   */
  public goToPreviousSuggestion(): void {
    if (this._suggestions.length === 0) return;

    this._currentIndex = this._currentIndex === 0
      ? this._suggestions.length - 1
      : this._currentIndex - 1;

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this._showCurrentSuggestion(editor);
    }
  }

  /**
   * Cancel all suggestions
   */
  public cancelSuggestions(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this._decorationType, []);
    }

    this._suggestions = [];
    this._currentIndex = 0;
    this._isActive = false;
    this._updateStatusBar();
    this._onSuggestionsChanged.fire([]);
  }

  /**
   * Get current suggestions
   */
  public getSuggestions(): GhostSuggestion[] {
    return [...this._suggestions];
  }

  /**
   * Check if there are any active suggestions
   */
  public hasSuggestions(): boolean {
    return this._suggestions.length > 0;
  }

  /**
   * Toggle ghost suggestions on/off
   */
  public toggle(): void {
    if (this._isActive) {
      this.cancelSuggestions();
    } else {
      this.generateSuggestions();
    }
  }

  /**
   * Dispose service
   */
  public dispose(): void {
    this._decorationType.dispose();
    this._statusBarItem.dispose();
    this._onSuggestionsChanged.dispose();
    this._disposables.forEach(d => d.dispose());
    // Clean up MCP resources
    this._mcpClient = null;
    this._contextCache = null;
  }

  // Private methods

  private _loadConfig(): GhostConfig {
    const config = vscode.workspace.getConfiguration('aitm.ghost');

    return {
      enabled: config.get<boolean>('enabled', true),
      triggerDelay: config.get<number>('triggerDelay', 500),
      maxSuggestions: config.get<number>('maxSuggestions', 5),
      showInlineHints: config.get<boolean>('showInlineHints', true),
      keyboardShortcut: config.get<string>('keyboardShortcut', 'ctrl+l'),
    };
  }

  private _registerCommands(): void {
    this._disposables.push(
      vscode.commands.registerCommand('aitm.ghost.generateSuggestions', () => {
        this.generateSuggestions();
      }),
      vscode.commands.registerCommand('aitm.ghost.applyCurrentSuggestion', () => {
        this.applyCurrentSuggestion();
      }),
      vscode.commands.registerCommand('aitm.ghost.applyAllSuggestions', () => {
        this.applyAllSuggestions();
      }),
      vscode.commands.registerCommand('aitm.ghost.nextSuggestion', () => {
        this.goToNextSuggestion();
      }),
      vscode.commands.registerCommand('aitm.ghost.previousSuggestion', () => {
        this.goToPreviousSuggestion();
      }),
      vscode.commands.registerCommand('aitm.ghost.cancelSuggestions', () => {
        this.cancelSuggestions();
      }),
      vscode.commands.registerCommand('aitm.ghost.toggleSuggestions', () => {
        if (this._isActive) {
          this.cancelSuggestions();
        } else {
          this.generateSuggestions();
        }
      })
    );
  }

  private _updateStatusBar(): void {
    if (!this._config.enabled) {
      this._statusBarItem.text = '$(lightbulb) Ghost: Off';
      this._statusBarItem.tooltip = 'Click to enable Ghost suggestions';
    } else if (this._isActive) {
      this._statusBarItem.text = `$(lightbulb) Ghost: ${this._suggestions.length} suggestions`;
      this._statusBarItem.tooltip = 'Click to cancel suggestions';
    } else {
      this._statusBarItem.text = '$(lightbulb) Ghost';
      this._statusBarItem.tooltip = 'Click to generate suggestions (Ctrl+L)';
    }
    this._statusBarItem.show();
  }

  private _getContext(document: vscode.TextDocument, position: vscode.Position): string {
    // Get surrounding context
    const startLine = Math.max(0, position.line - 20);
    const endLine = Math.min(document.lineCount - 1, position.line + 5);

    const beforeCursor = document.getText(new vscode.Range(startLine, 0, position.line, position.character));
    const afterCursor = document.getText(new vscode.Range(position.line, position.character, endLine, 0));

    return `${beforeCursor}[CURSOR]${afterCursor}`;
  }

  private async _getMCPContext(filePath: string): Promise<{
    recentCheckpoints: Array<{ id: string; name: string; timestamp: string }>;
    fileHistory: Array<{ timestamp: string; summary?: string }>;
    recentDiff: string;
  } | null> {
    // Return cached if fresh
    if (this._contextCache && Date.now() - this._contextCache.timestamp < GhostService.CONTEXT_TTL) {
      return this._contextCache.data;
    }

    try {
      if (!this._mcpClient) {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspacePath) return null;

        // Lazy-create MCPClient
        const { MCPClient: MCPClientClass } = await import('../mcp/MCPClient');
        this._mcpClient = new MCPClientClass({ workspaceRoot: workspacePath });
      }

      // Fetch context data in parallel
      const [checkpointsRaw, historyRaw, diffRaw] = await Promise.allSettled([
        this._mcpClient.callTool('tm_checkpoint_list', { limit: 5 }),
        this._mcpClient.callTool('tm_file_history', { filePath, limit: 3 }),
        this._mcpClient.callTool('tm_diff', { fromCheckpointId: 'latest' }),
      ]);

      const recentCheckpoints = checkpointsRaw.status === 'fulfilled' && checkpointsRaw.value
        ? (() => { try { return JSON.parse(checkpointsRaw.value); } catch { return []; } })()
        : [];

      const fileHistory = historyRaw.status === 'fulfilled' && historyRaw.value
        ? (() => { try { return JSON.parse(historyRaw.value); } catch { return []; } })()
        : [];

      const recentDiff = diffRaw.status === 'fulfilled' && diffRaw.value
        ? diffRaw.value.slice(0, 1500)
        : '';

      const data = { recentCheckpoints, fileHistory, recentDiff };
      this._contextCache = { data, timestamp: Date.now() };
      return data;
    } catch {
      return null;
    }
  }

  private async _fetchSuggestions(context: string, languageId: string): Promise<GhostSuggestion[]> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return [];

    const position = editor.selection.active;

    // Try VS Code Language Model API first (available in VS Code 1.85+)
    try {
      const aiSuggestions = await this._fetchAISuggestions(context, languageId, position);
      if (aiSuggestions.length > 0) {
        return aiSuggestions;
      }
    } catch (error) {
      console.log('Ghost: AI suggestions unavailable, using pattern-based:', error);
    }

    // Fall back to pattern-based suggestions
    return this._getPatternBasedSuggestions(editor, position);
  }

  /**
   * Fetch AI-powered suggestions using VS Code Language Model API or OpenAI
   */
  private async _fetchAISuggestions(
    context: string,
    languageId: string,
    position: vscode.Position
  ): Promise<GhostSuggestion[]> {
    // Get MCP context for enhanced suggestions
    const editor = vscode.window.activeTextEditor;
    const mcpContext = editor ? await this._getMCPContext(editor.document.uri.fsPath) : null;
    const contextSection = mcpContext ? `
Recent project changes:
${mcpContext.recentDiff.slice(0, 800)}
${mcpContext.recentCheckpoints.length > 0 ? `\nRecent checkpoints: ${mcpContext.recentCheckpoints.map((c: any) => c.name || c.description).join(', ')}` : ''}
` : '';

    // Check if VS Code Language Model API is available (VS Code 1.85+)
    if (typeof vscode.lm !== 'undefined' && typeof vscode.lm.selectChatModels === 'function') {
      try {
        const suggestions = await this._fetchVSCodeLMSuggestions(context, languageId, position, contextSection);
        if (suggestions.length > 0) {
          return suggestions;
        }
      } catch {
        // Fall through to OpenAI
      }
    }

    // Try OpenAI API if configured
    const openaiKey = vscode.workspace.getConfiguration('aitm').get<string>('openaiApiKey');
    if (openaiKey) {
      return this._fetchOpenAISuggestions(context, languageId, position, openaiKey, contextSection);
    }

    return [];
  }

  /**
   * Fetch suggestions using VS Code Language Model API (Copilot-compatible)
   */
  private async _fetchVSCodeLMSuggestions(
    context: string,
    languageId: string,
    position: vscode.Position,
    contextSection: string = ''
  ): Promise<GhostSuggestion[]> {
    try {
      const models = await vscode.lm.selectChatModels({ family: 'gpt-4' });
      if (models.length === 0) {
        const fallbackModels = await vscode.lm.selectChatModels({});
        if (fallbackModels.length === 0) {
          return [];
        }
        models.push(...fallbackModels);
      }

      const model = models[0];
      const messages = [
        vscode.LanguageModelChatMessage.User(
          `You are a code completion assistant. Given the following ${languageId} code context with [CURSOR] marking the cursor position, suggest code completions. Return ONLY the code to insert at the cursor, no explanations. If multiple suggestions, separate them with |||.
${contextSection}
Context:
${context}

Provide 1-3 short, relevant code completions:`
        )
      ];

      const response = await model.sendRequest(messages, {});
      let responseText = '';

      for await (const part of response.text) {
        responseText += part;
      }

      // Parse suggestions from response
      const suggestions: GhostSuggestion[] = [];
      const parts = responseText.split('|||').map(s => s.trim()).filter(s => s.length > 0);

      for (let i = 0; i < Math.min(parts.length, this._config.maxSuggestions); i++) {
        const text = parts[i].replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
        if (text.length > 0 && text.length < 500) {
          suggestions.push({
            id: `ghost_ai_${Date.now()}_${i}`,
            range: new vscode.Range(position, position),
            text,
            description: 'AI suggestion',
            confidence: 0.9 - (i * 0.1),
          });
        }
      }

      return suggestions;
    } catch (error) {
      console.error('VS Code LM API error:', error);
      return [];
    }
  }

  /**
   * Fetch suggestions using OpenAI API
   */
  private async _fetchOpenAISuggestions(
    context: string,
    languageId: string,
    position: vscode.Position,
    apiKey: string,
    contextSection: string = ''
  ): Promise<GhostSuggestion[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a code completion assistant. Return ONLY code, no explanations. If multiple suggestions, separate them with |||.'
            },
            {
              role: 'user',
              content: `${contextSection}Complete this ${languageId} code at [CURSOR]:\n\n${context}\n\nProvide 1-3 short completions:`
            }
          ],
          max_tokens: 200,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const responseText = data.choices?.[0]?.message?.content || '';

      // Parse suggestions
      const suggestions: GhostSuggestion[] = [];
      const parts = responseText.split('|||').map((s: string) => s.trim()).filter((s: string) => s.length > 0);

      for (let i = 0; i < Math.min(parts.length, this._config.maxSuggestions); i++) {
        const text = parts[i].replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
        if (text.length > 0 && text.length < 500) {
          suggestions.push({
            id: `ghost_openai_${Date.now()}_${i}`,
            range: new vscode.Range(position, position),
            text,
            description: 'AI suggestion (OpenAI)',
            confidence: 0.85 - (i * 0.1),
          });
        }
      }

      return suggestions;
    } catch (error) {
      console.error('OpenAI API error:', error);
      return [];
    }
  }

  /**
   * Get pattern-based suggestions as fallback
   */
  private _getPatternBasedSuggestions(
    editor: vscode.TextEditor,
    position: vscode.Position
  ): GhostSuggestion[] {
    const document = editor.document;
    const suggestions: GhostSuggestion[] = [];
    const currentLine = document.lineAt(position.line).text;
    const lineBeforeCursor = currentLine.substring(0, position.character);

    // Function completion
    if (lineBeforeCursor.match(/function\s+\w*$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_1`,
        range: new vscode.Range(position, position),
        text: '() {\n  \n}',
        description: 'Complete function definition',
        confidence: 0.9,
      });
    }

    // Console.log completion
    if (lineBeforeCursor.match(/console\.$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_2`,
        range: new vscode.Range(position, position),
        text: "log('');",
        description: 'Console log statement',
        confidence: 0.95,
      });
    }

    // Arrow function
    if (lineBeforeCursor.match(/const\s+\w+\s*=\s*$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_3`,
        range: new vscode.Range(position, position),
        text: '() => {\n  \n};',
        description: 'Arrow function',
        confidence: 0.85,
      });
    }

    // Import statement
    if (lineBeforeCursor.match(/^import\s*$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_4`,
        range: new vscode.Range(position, position),
        text: " { } from '';",
        description: 'Named import',
        confidence: 0.8,
      });
    }

    // If statement
    if (lineBeforeCursor.match(/if\s*$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_5`,
        range: new vscode.Range(position, position),
        text: ' () {\n  \n}',
        description: 'If statement',
        confidence: 0.9,
      });
    }

    // Try-catch
    if (lineBeforeCursor.match(/try\s*$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_6`,
        range: new vscode.Range(position, position),
        text: ' {\n  \n} catch (error) {\n  console.error(error);\n}',
        description: 'Try-catch block',
        confidence: 0.88,
      });
    }

    // For loop
    if (lineBeforeCursor.match(/for\s*$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_7`,
        range: new vscode.Range(position, position),
        text: ' (let i = 0; i < array.length; i++) {\n  \n}',
        description: 'For loop',
        confidence: 0.85,
      });
    }

    // Async function
    if (lineBeforeCursor.match(/async\s+function\s+\w*$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_8`,
        range: new vscode.Range(position, position),
        text: '() {\n  try {\n    \n  } catch (error) {\n    throw error;\n  }\n}',
        description: 'Async function with try-catch',
        confidence: 0.85,
      });
    }

    // Class definition
    if (lineBeforeCursor.match(/class\s+\w+\s*$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_9`,
        range: new vscode.Range(position, position),
        text: ' {\n  constructor() {\n    \n  }\n}',
        description: 'Class definition',
        confidence: 0.9,
      });
    }

    // React component
    if (lineBeforeCursor.match(/export\s+(default\s+)?function\s+\w+$/)) {
      suggestions.push({
        id: `ghost_${Date.now()}_10`,
        range: new vscode.Range(position, position),
        text: '() {\n  return (\n    <div>\n      \n    </div>\n  );\n}',
        description: 'React functional component',
        confidence: 0.8,
      });
    }

    return suggestions.slice(0, this._config.maxSuggestions);
  }

  private _showCurrentSuggestion(editor: vscode.TextEditor): void {
    if (this._suggestions.length === 0) return;

    const suggestion = this._suggestions[this._currentIndex];

    // Create decoration
    const decorations: vscode.DecorationOptions[] = [{
      range: suggestion.range,
      renderOptions: {
        after: {
          contentText: suggestion.text.split('\n')[0] + (suggestion.text.includes('\n') ? '...' : ''),
          color: new vscode.ThemeColor('editorGhostText.foreground'),
          fontStyle: 'italic',
        },
      },
    }];

    editor.setDecorations(this._decorationType, decorations);

    // Move cursor to suggestion position
    editor.selection = new vscode.Selection(suggestion.range.start, suggestion.range.start);
    editor.revealRange(suggestion.range, vscode.TextEditorRevealType.InCenter);
  }
}

// Export singleton accessor
export function getGhostService(): GhostService {
  return GhostService.getInstance();
}
