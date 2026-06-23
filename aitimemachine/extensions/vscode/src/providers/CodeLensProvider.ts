import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

interface FileHistoryEntry {
  checkpointId: string;
  description: string;
  timestamp: string;
  changeType: 'added' | 'modified' | 'deleted';
}

export class AitmCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private _cache = new Map<string, { history: FileHistoryEntry[]; timestamp: number }>();
  private _cacheTimeout = 30000; // 30 seconds

  constructor() {
    // Refresh on save
    vscode.workspace.onDidSaveTextDocument(() => {
      this._cache.clear();
      this._onDidChangeCodeLenses.fire();
    });
  }

  public refresh() {
    this._cache.clear();
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] | undefined {
    const config = vscode.workspace.getConfiguration('aitm');
    if (!config.get('showCodeLens', true)) {
      return undefined;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return undefined;

    const relativePath = path.relative(workspaceRoot, document.uri.fsPath).replace(/\\/g, '/');
    const history = this._getFileHistory(relativePath, workspaceRoot);

    if (history.length === 0) return undefined;

    const codeLenses: vscode.CodeLens[] = [];

    // Add lens at the top of the file
    const topRange = new vscode.Range(0, 0, 0, 0);

    // Latest checkpoint info
    const latest = history[0];
    const timeAgo = this._getTimeAgo(new Date(latest.timestamp));
    codeLenses.push(new vscode.CodeLens(topRange, {
      title: `$(clock) Last saved: ${timeAgo} - ${latest.description}`,
      command: 'aitm.showFileHistory',
      arguments: [document.uri]
    }));

    // Show checkpoint count
    if (history.length > 1) {
      codeLenses.push(new vscode.CodeLens(topRange, {
        title: `$(git-commit) ${history.length} checkpoints`,
        command: 'aitm.compareWithCheckpoint',
        arguments: [document.uri, latest.checkpointId]
      }));
    }

    // View History lens - opens full file history
    codeLenses.push(new vscode.CodeLens(topRange, {
      title: '$(history) History',
      command: 'aitm.showFileHistory',
      arguments: [document.uri]
    }));

    // Compare lens - shows diff from last checkpoint
    codeLenses.push(new vscode.CodeLens(topRange, {
      title: '$(diff) Compare',
      command: 'aitm.compareWithCheckpoint',
      arguments: [document.uri]
    }));

    // Quick actions - restore
    codeLenses.push(new vscode.CodeLens(topRange, {
      title: '$(discard) Restore',
      command: 'aitm.restoreFile',
      arguments: [document.uri]
    }));

    return codeLenses;
  }

  private _getFileHistory(relativePath: string, workspaceRoot: string): FileHistoryEntry[] {
    // Check cache
    const cached = this._cache.get(relativePath);
    if (cached && Date.now() - cached.timestamp < this._cacheTimeout) {
      return cached.history;
    }

    try {
      const output = execSync(`aitm file-history "${relativePath}" --json 2>/dev/null || echo "[]"`, {
        cwd: workspaceRoot,
        encoding: 'utf-8'
      });

      const history: FileHistoryEntry[] = JSON.parse(output);
      this._cache.set(relativePath, { history, timestamp: Date.now() });
      return history;
    } catch {
      return [];
    }
  }

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
}

// ============================================================================
// AST-based Function Parsing
// ============================================================================

interface FunctionInfo {
  name: string;
  type: 'function' | 'class' | 'method' | 'arrow' | 'constructor' | 'getter' | 'setter';
  startLine: number;
  endLine: number;
  signature: string;
  body: string;
  hash: string; // Content hash for change detection
  parentClass?: string;
}

interface FunctionChange {
  name: string;
  checkpointId: string;
  timestamp: string;
  changeType: 'added' | 'modified' | 'deleted' | 'restored';
  linesChanged?: number;
  restoredFrom?: string; // Checkpoint ID if restored
}

interface FunctionHistoryEntry {
  checkpointId: string;
  timestamp: string;
  description: string;
  hash: string;
  changeType: 'added' | 'modified' | 'deleted';
}

// ============================================================================
// TypeScript/JavaScript AST Parser using RegExp-based parsing
// (More robust than simple regex, handles nested structures)
// ============================================================================

class ASTParser {
  /**
   * Parse functions and classes from TypeScript/JavaScript source
   */
  static parseTypeScript(source: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = source.split('\n');

    // Track class context for methods
    let currentClass: string | null = null;
    let classStartLine = -1;
    let classEndLine = -1;

    // First pass: find all classes
    const classRanges = this.findClassRanges(source, lines);

    // Parse top-level functions
    this.parseTopLevelFunctions(source, lines, functions, classRanges);

    // Parse class declarations and their methods
    this.parseClasses(source, lines, functions, classRanges);

    // Parse arrow functions assigned to variables
    this.parseArrowFunctions(source, lines, functions, classRanges);

    // Remove duplicates (keep the most specific match)
    return this.deduplicateFunctions(functions);
  }

  /**
   * Parse Python functions and classes
   */
  static parsePython(source: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = source.split('\n');

    // Match class definitions
    const classPattern = /^class\s+(\w+)(?:\([^)]*\))?:/gm;
    let classMatch;
    while ((classMatch = classPattern.exec(source)) !== null) {
      const name = classMatch[1];
      const startLine = this.getLineNumber(source, classMatch.index);
      const endLine = this.findPythonBlockEnd(lines, startLine);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      functions.push({
        name,
        type: 'class',
        startLine,
        endLine,
        signature: classMatch[0].trim(),
        body,
        hash: this.hashContent(body)
      });
    }

    // Match function definitions (both top-level and methods)
    const funcPattern = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\([^)]*\)(?:\s*->\s*[^:]+)?:/gm;
    let funcMatch;
    while ((funcMatch = funcPattern.exec(source)) !== null) {
      const indent = funcMatch[1];
      const name = funcMatch[2];
      const startLine = this.getLineNumber(source, funcMatch.index);
      const endLine = this.findPythonBlockEnd(lines, startLine);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      // Determine if this is a method (indented)
      const isMethod = indent.length > 0;
      let parentClass: string | undefined;

      if (isMethod) {
        // Find parent class
        for (const func of functions) {
          if (func.type === 'class' && startLine > func.startLine && startLine <= func.endLine) {
            parentClass = func.name;
            break;
          }
        }
      }

      functions.push({
        name,
        type: isMethod ? 'method' : 'function',
        startLine,
        endLine,
        signature: funcMatch[0].trim(),
        body,
        hash: this.hashContent(body),
        parentClass
      });
    }

    return functions;
  }

  /**
   * Parse Go functions
   */
  static parseGo(source: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = source.split('\n');

    // Match function declarations (including methods)
    const funcPattern = /^func\s+(?:\((\w+)\s+\*?(\w+)\)\s+)?(\w+)\s*\([^)]*\)(?:\s*(?:\([^)]*\)|[^{]*))?{/gm;
    let match;
    while ((match = funcPattern.exec(source)) !== null) {
      const receiver = match[2]; // struct type for methods
      const name = match[3];
      const startLine = this.getLineNumber(source, match.index);
      const endLine = this.findBraceBlockEnd(lines, startLine);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      functions.push({
        name,
        type: receiver ? 'method' : 'function',
        startLine,
        endLine,
        signature: match[0].trim().replace(/\{$/, '').trim(),
        body,
        hash: this.hashContent(body),
        parentClass: receiver
      });
    }

    // Match struct definitions
    const structPattern = /^type\s+(\w+)\s+struct\s*\{/gm;
    while ((match = structPattern.exec(source)) !== null) {
      const name = match[1];
      const startLine = this.getLineNumber(source, match.index);
      const endLine = this.findBraceBlockEnd(lines, startLine);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      functions.push({
        name,
        type: 'class',
        startLine,
        endLine,
        signature: `type ${name} struct`,
        body,
        hash: this.hashContent(body)
      });
    }

    return functions;
  }

  /**
   * Parse Rust functions and structs
   */
  static parseRust(source: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = source.split('\n');

    // Match function declarations
    const funcPattern = /^(?:\s*)(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)(?:<[^>]*>)?\s*\([^)]*\)(?:\s*->\s*[^{]+)?\s*(?:where[^{]*)?\s*\{/gm;
    let match;
    while ((match = funcPattern.exec(source)) !== null) {
      const name = match[1];
      const startLine = this.getLineNumber(source, match.index);
      const endLine = this.findBraceBlockEnd(lines, startLine);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      functions.push({
        name,
        type: 'function',
        startLine,
        endLine,
        signature: match[0].trim().replace(/\{$/, '').trim(),
        body,
        hash: this.hashContent(body)
      });
    }

    // Match struct definitions
    const structPattern = /^(?:\s*)(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)(?:<[^>]*>)?\s*(?:\{|;|\([^)]*\);)/gm;
    while ((match = structPattern.exec(source)) !== null) {
      const name = match[1];
      const startLine = this.getLineNumber(source, match.index);
      const endLine = match[0].includes('{')
        ? this.findBraceBlockEnd(lines, startLine)
        : startLine;
      const body = lines.slice(startLine, endLine + 1).join('\n');

      functions.push({
        name,
        type: 'class',
        startLine,
        endLine,
        signature: `struct ${name}`,
        body,
        hash: this.hashContent(body)
      });
    }

    // Match impl blocks
    const implPattern = /^(?:\s*)impl(?:<[^>]*>)?\s+(?:(\w+)\s+for\s+)?(\w+)(?:<[^>]*>)?\s*(?:where[^{]*)?\s*\{/gm;
    while ((match = implPattern.exec(source)) !== null) {
      const traitName = match[1];
      const typeName = match[2];
      const name = traitName ? `${traitName} for ${typeName}` : `impl ${typeName}`;
      const startLine = this.getLineNumber(source, match.index);
      const endLine = this.findBraceBlockEnd(lines, startLine);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      functions.push({
        name,
        type: 'class',
        startLine,
        endLine,
        signature: match[0].trim().replace(/\{$/, '').trim(),
        body,
        hash: this.hashContent(body)
      });
    }

    return functions;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private static findClassRanges(source: string, lines: string[]): Array<{ name: string; start: number; end: number }> {
    const ranges: Array<{ name: string; start: number; end: number }> = [];
    const classPattern = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[^{]+)?\s*\{/g;

    let match;
    while ((match = classPattern.exec(source)) !== null) {
      const name = match[1];
      const startLine = this.getLineNumber(source, match.index);
      const endLine = this.findBraceBlockEnd(lines, startLine);
      ranges.push({ name, start: startLine, end: endLine });
    }

    return ranges;
  }

  private static parseTopLevelFunctions(
    source: string,
    lines: string[],
    functions: FunctionInfo[],
    classRanges: Array<{ name: string; start: number; end: number }>
  ): void {
    // Match function declarations
    const funcPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{/g;

    let match;
    while ((match = funcPattern.exec(source)) !== null) {
      const name = match[1];
      const startLine = this.getLineNumber(source, match.index);

      // Skip if inside a class
      if (this.isInsideClass(startLine, classRanges)) continue;

      // Skip control flow keywords
      if (['if', 'for', 'while', 'switch', 'catch', 'with'].includes(name)) continue;

      const endLine = this.findBraceBlockEnd(lines, startLine);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      functions.push({
        name,
        type: 'function',
        startLine,
        endLine,
        signature: this.extractSignature(match[0]),
        body,
        hash: this.hashContent(body)
      });
    }
  }

  private static parseClasses(
    source: string,
    lines: string[],
    functions: FunctionInfo[],
    classRanges: Array<{ name: string; start: number; end: number }>
  ): void {
    for (const classRange of classRanges) {
      const classBody = lines.slice(classRange.start, classRange.end + 1).join('\n');

      // Add the class itself
      functions.push({
        name: classRange.name,
        type: 'class',
        startLine: classRange.start,
        endLine: classRange.end,
        signature: `class ${classRange.name}`,
        body: classBody,
        hash: this.hashContent(classBody)
      });

      // Parse methods within the class
      this.parseClassMethods(classBody, lines, functions, classRange);
    }
  }

  private static parseClassMethods(
    classBody: string,
    lines: string[],
    functions: FunctionInfo[],
    classRange: { name: string; start: number; end: number }
  ): void {
    // Match methods (including async, static, private, etc.)
    const methodPattern = /^\s+(?:(?:public|private|protected|static|async|readonly|override|abstract)\s+)*(?:get\s+|set\s+)?(\w+)(?:<[^>]*>)?\s*\([^)]*\)(?:\s*:\s*[^{;]+)?(?:\s*\{|;)/gm;

    let match;
    while ((match = methodPattern.exec(classBody)) !== null) {
      const name = match[1];
      if (!name || ['if', 'for', 'while', 'switch', 'catch', 'with', 'constructor'].includes(name)) continue;

      const lineInClass = this.getLineNumber(classBody, match.index);
      const actualLine = classRange.start + lineInClass;

      // Check if this is a getter/setter
      const isGetter = match[0].includes('get ');
      const isSetter = match[0].includes('set ');
      const type = isGetter ? 'getter' : isSetter ? 'setter' : 'method';

      // Find method end
      const endLine = match[0].trim().endsWith(';')
        ? actualLine
        : this.findBraceBlockEnd(lines, actualLine);

      const body = lines.slice(actualLine, endLine + 1).join('\n');

      functions.push({
        name,
        type,
        startLine: actualLine,
        endLine,
        signature: this.extractSignature(match[0]),
        body,
        hash: this.hashContent(body),
        parentClass: classRange.name
      });
    }

    // Parse constructor separately
    const constructorPattern = /^\s+constructor\s*\([^)]*\)\s*\{/gm;
    if ((match = constructorPattern.exec(classBody)) !== null) {
      const lineInClass = this.getLineNumber(classBody, match.index);
      const actualLine = classRange.start + lineInClass;
      const endLine = this.findBraceBlockEnd(lines, actualLine);
      const body = lines.slice(actualLine, endLine + 1).join('\n');

      functions.push({
        name: 'constructor',
        type: 'constructor',
        startLine: actualLine,
        endLine,
        signature: 'constructor',
        body,
        hash: this.hashContent(body),
        parentClass: classRange.name
      });
    }
  }

  private static parseArrowFunctions(
    source: string,
    lines: string[],
    functions: FunctionInfo[],
    classRanges: Array<{ name: string; start: number; end: number }>
  ): void {
    // Match arrow functions assigned to const/let/var
    const arrowPattern = /(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g;

    let match;
    while ((match = arrowPattern.exec(source)) !== null) {
      const name = match[1];
      const startLine = this.getLineNumber(source, match.index);

      // Skip if inside a class
      if (this.isInsideClass(startLine, classRanges)) continue;

      // Find the end of the arrow function
      const endLine = this.findArrowFunctionEnd(lines, source, match.index);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      functions.push({
        name,
        type: 'arrow',
        startLine,
        endLine,
        signature: this.extractSignature(match[0]),
        body,
        hash: this.hashContent(body)
      });
    }

    // Also match arrow functions without parentheses: const fn = async x =>
    const simpleArrowPattern = /(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*(?:async\s+)?(\w+)\s*=>/g;
    while ((match = simpleArrowPattern.exec(source)) !== null) {
      const name = match[1];
      const startLine = this.getLineNumber(source, match.index);

      if (this.isInsideClass(startLine, classRanges)) continue;

      const endLine = this.findArrowFunctionEnd(lines, source, match.index);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      // Check if already added
      if (functions.some(f => f.name === name && f.startLine === startLine)) continue;

      functions.push({
        name,
        type: 'arrow',
        startLine,
        endLine,
        signature: this.extractSignature(match[0]),
        body,
        hash: this.hashContent(body)
      });
    }
  }

  private static isInsideClass(line: number, classRanges: Array<{ name: string; start: number; end: number }>): boolean {
    return classRanges.some(r => line > r.start && line < r.end);
  }

  private static getLineNumber(source: string, index: number): number {
    return source.substring(0, index).split('\n').length - 1;
  }

  private static findBraceBlockEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let started = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      // Skip string contents to avoid counting braces inside strings
      const cleanLine = this.removeStrings(line);

      for (const char of cleanLine) {
        if (char === '{') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      if (started && braceCount === 0) {
        return i;
      }
    }

    return Math.min(startLine + 100, lines.length - 1);
  }

  private static findArrowFunctionEnd(lines: string[], source: string, matchIndex: number): number {
    const startLine = this.getLineNumber(source, matchIndex);

    // Look for opening brace or expression
    const restOfCode = source.substring(matchIndex);
    const arrowMatch = restOfCode.match(/=>\s*/);
    if (!arrowMatch) return startLine;

    const afterArrow = restOfCode.substring(arrowMatch.index! + arrowMatch[0].length);

    // Check if it's a block body (=>) { ... }
    if (afterArrow.trimStart().startsWith('{')) {
      return this.findBraceBlockEnd(lines, startLine);
    }

    // Expression body - find the end (semicolon or newline without continuation)
    let parenCount = 0;
    let bracketCount = 0;
    let braceCount = 0;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeStrings(line);

      for (const char of cleanLine) {
        if (char === '(') parenCount++;
        else if (char === ')') parenCount--;
        else if (char === '[') bracketCount++;
        else if (char === ']') bracketCount--;
        else if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        else if (char === ';' && parenCount === 0 && bracketCount === 0 && braceCount === 0) {
          return i;
        }
      }

      // If we're at the end of a balanced expression and the next line doesn't start with an operator
      if (parenCount === 0 && bracketCount === 0 && braceCount === 0) {
        const nextLine = lines[i + 1];
        if (nextLine && !/^\s*[.?:,]/.test(nextLine) && !/\s*&&|\|\|/.test(cleanLine.slice(-5))) {
          return i;
        }
      }
    }

    return Math.min(startLine + 20, lines.length - 1);
  }

  private static findPythonBlockEnd(lines: string[], startLine: number): number {
    const startIndent = lines[startLine].match(/^(\s*)/)?.[1].length || 0;

    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) continue;

      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      if (indent <= startIndent && line.trim() !== '') {
        return i - 1;
      }
    }

    return lines.length - 1;
  }

  private static removeStrings(line: string): string {
    // Remove string contents (simplified - handles basic cases)
    return line
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  }

  private static extractSignature(match: string): string {
    return match.trim()
      .replace(/\{$/, '')
      .replace(/;$/, '')
      .trim()
      .substring(0, 80);
  }

  private static hashContent(content: string): string {
    // Normalize whitespace for comparison
    const normalized = content.replace(/\s+/g, ' ').trim();
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 12);
  }

  private static deduplicateFunctions(functions: FunctionInfo[]): FunctionInfo[] {
    const seen = new Map<string, FunctionInfo>();

    for (const func of functions) {
      const key = `${func.name}:${func.startLine}`;
      const existing = seen.get(key);

      // Keep the more specific entry (method over function, etc.)
      if (!existing || func.type === 'method' || func.parentClass) {
        seen.set(key, func);
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.startLine - b.startLine);
  }
}

// ============================================================================
// Enhanced Function Change CodeLens Provider
// ============================================================================

export class FunctionChangeCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private _functionChangeCache = new Map<string, { changes: Map<string, FunctionChange>; timestamp: number }>();
  private _functionHashCache = new Map<string, Map<string, FunctionHistoryEntry[]>>();
  private _cacheTimeout = 30000; // 30 seconds

  constructor() {
    vscode.workspace.onDidSaveTextDocument(() => {
      this._functionChangeCache.clear();
      this._functionHashCache.clear();
      this._onDidChangeCodeLenses.fire();
    });
  }

  public refresh() {
    this._functionChangeCache.clear();
    this._functionHashCache.clear();
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('aitm');
    if (!config.get('showFunctionLens', true)) {
      return [];
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];

    const relativePath = path.relative(workspaceRoot, document.uri.fsPath).replace(/\\/g, '/');

    // Parse functions from the document
    const functions = this._parseFunctions(document);
    if (functions.length === 0) return [];

    // Get function changes from history
    const changes = this._getFunctionChanges(relativePath, workspaceRoot, functions);

    const codeLenses: vscode.CodeLens[] = [];

    for (const func of functions) {
      // Skip classes for now (they have their own handling)
      if (func.type === 'class') continue;

      const range = new vscode.Range(func.startLine, 0, func.startLine, 0);
      const change = changes.get(func.name);
      const displayName = func.parentClass ? `${func.parentClass}.${func.name}` : func.name;

      if (change) {
        const timeAgo = this._getTimeAgo(new Date(change.timestamp));

        // Determine icon based on change type
        let icon: string;
        let title: string;

        switch (change.changeType) {
          case 'added':
            icon = '$(add)';
            title = `${icon} ${displayName} added ${timeAgo}`;
            break;
          case 'deleted':
            icon = '$(remove)';
            title = `${icon} ${displayName} deleted ${timeAgo}`;
            break;
          case 'restored':
            icon = '$(debug-restart)';
            title = `${icon} ${displayName} restored from ${change.restoredFrom || 'checkpoint'} ${timeAgo}`;
            break;
          default:
            icon = '$(edit)';
            title = `${icon} ${displayName} modified ${timeAgo}`;
        }

        // Main lens showing modification time
        codeLenses.push(new vscode.CodeLens(range, {
          title,
          command: 'aitm.showFunctionHistory',
          arguments: [document.uri, func.name, func.startLine, func.endLine]
        }));

        // Quick diff lens for modified functions
        if (change.changeType === 'modified' || change.changeType === 'restored') {
          codeLenses.push(new vscode.CodeLens(range, {
            title: `$(diff) diff`,
            command: 'aitm.showFunctionDiff',
            arguments: [document.uri, func.name, change.checkpointId, func.startLine, func.endLine]
          }));
        }

        // History lens - view function-level history
        codeLenses.push(new vscode.CodeLens(range, {
          title: `$(history) history`,
          command: 'aitm.showFunctionHistory',
          arguments: [document.uri, func.name, func.startLine, func.endLine]
        }));

        // Compare lens - compare function with last checkpoint
        codeLenses.push(new vscode.CodeLens(range, {
          title: `$(diff) compare`,
          command: 'aitm.showFunctionDiff',
          arguments: [document.uri, func.name, change.checkpointId, func.startLine, func.endLine]
        }));

        // Restore lens
        codeLenses.push(new vscode.CodeLens(range, {
          title: `$(discard) restore`,
          command: 'aitm.restoreFunction',
          arguments: [document.uri, func.name, change.checkpointId, func.startLine, func.endLine]
        }));
      }
    }

    return codeLenses;
  }

  private _parseFunctions(document: vscode.TextDocument): FunctionInfo[] {
    const text = document.getText();
    const languageId = document.languageId;

    switch (languageId) {
      case 'typescript':
      case 'javascript':
      case 'typescriptreact':
      case 'javascriptreact':
        return ASTParser.parseTypeScript(text);

      case 'python':
        return ASTParser.parsePython(text);

      case 'go':
        return ASTParser.parseGo(text);

      case 'rust':
        return ASTParser.parseRust(text);

      default:
        // Fallback to generic parsing
        return this._parseGenericFunctions(text);
    }
  }

  private _parseGenericFunctions(text: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = text.split('\n');

    // Generic pattern that catches most function declarations
    const pattern = /(?:function|def|fn|func|sub|proc)\s+(\w+)/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      const startLine = text.substring(0, match.index).split('\n').length - 1;
      const endLine = this._findFunctionEnd(lines, startLine);
      const body = lines.slice(startLine, endLine + 1).join('\n');

      functions.push({
        name,
        type: 'function',
        startLine,
        endLine,
        signature: match[0],
        body,
        hash: crypto.createHash('md5').update(body.replace(/\s+/g, ' ')).digest('hex').substring(0, 12)
      });
    }

    return functions;
  }

  private _findFunctionEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let started = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '{') {
          braceCount++;
          started = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      if (started && braceCount === 0) {
        return i;
      }
    }

    return Math.min(startLine + 50, lines.length - 1);
  }

  private _getFunctionChanges(
    filePath: string,
    workspaceRoot: string,
    currentFunctions: FunctionInfo[]
  ): Map<string, FunctionChange> {
    // Check cache
    const cacheKey = filePath;
    const cached = this._functionChangeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this._cacheTimeout) {
      return cached.changes;
    }

    const changes = new Map<string, FunctionChange>();

    try {
      // Try to get function-level history directly
      const output = execSync(
        `aitm file-history "${filePath}" --functions --json 2>/dev/null || echo "[]"`,
        { cwd: workspaceRoot, encoding: 'utf-8', timeout: 5000 }
      );

      const history = JSON.parse(output);

      // Process function changes from history
      for (const entry of history) {
        if (entry.functions) {
          for (const func of entry.functions) {
            if (!changes.has(func.name)) {
              changes.set(func.name, {
                name: func.name,
                checkpointId: entry.checkpointId,
                timestamp: entry.timestamp,
                changeType: func.changeType || 'modified',
                linesChanged: func.linesChanged,
                restoredFrom: func.restoredFrom
              });
            }
          }
        }
      }
    } catch {
      // Fallback: compute changes by comparing with last checkpoint
      this._computeFunctionChangesFallback(filePath, workspaceRoot, currentFunctions, changes);
    }

    this._functionChangeCache.set(cacheKey, { changes, timestamp: Date.now() });
    return changes;
  }

  private _computeFunctionChangesFallback(
    filePath: string,
    workspaceRoot: string,
    currentFunctions: FunctionInfo[],
    changes: Map<string, FunctionChange>
  ): void {
    try {
      // Get the latest checkpoint info
      const checkpointOutput = execSync(
        'aitm list --json --limit 1 2>/dev/null || echo "[]"',
        { cwd: workspaceRoot, encoding: 'utf-8', timeout: 5000 }
      );

      const checkpoints = JSON.parse(checkpointOutput);
      if (checkpoints.length === 0) return;

      const latestCheckpoint = checkpoints[0];
      const checkpointId = latestCheckpoint.id || latestCheckpoint.checkpointId;

      // Try to get file content at the checkpoint
      let oldContent: string;
      try {
        oldContent = execSync(
          `aitm get-file ${checkpointId} "${filePath}" 2>/dev/null`,
          { cwd: workspaceRoot, encoding: 'utf-8', timeout: 5000 }
        );
      } catch {
        // File might not exist in checkpoint (new file)
        // Mark all functions as added
        for (const func of currentFunctions) {
          changes.set(func.name, {
            name: func.name,
            checkpointId,
            timestamp: latestCheckpoint.timestamp || latestCheckpoint.createdAt,
            changeType: 'added'
          });
        }
        return;
      }

      // Parse functions from old content
      const oldFunctions = ASTParser.parseTypeScript(oldContent);
      const oldFunctionMap = new Map(oldFunctions.map(f => [f.name, f]));
      const currentFunctionMap = new Map(currentFunctions.map(f => [f.name, f]));

      // Compare functions
      for (const [name, currentFunc] of currentFunctionMap) {
        const oldFunc = oldFunctionMap.get(name);

        if (!oldFunc) {
          // Function is new
          changes.set(name, {
            name,
            checkpointId,
            timestamp: latestCheckpoint.timestamp || latestCheckpoint.createdAt,
            changeType: 'added'
          });
        } else if (oldFunc.hash !== currentFunc.hash) {
          // Function was modified
          const linesChanged = Math.abs(
            currentFunc.body.split('\n').length - oldFunc.body.split('\n').length
          );
          changes.set(name, {
            name,
            checkpointId,
            timestamp: latestCheckpoint.timestamp || latestCheckpoint.createdAt,
            changeType: 'modified',
            linesChanged
          });
        }
      }

      // Check for deleted functions
      for (const [name, oldFunc] of oldFunctionMap) {
        if (!currentFunctionMap.has(name)) {
          changes.set(name, {
            name,
            checkpointId,
            timestamp: latestCheckpoint.timestamp || latestCheckpoint.createdAt,
            changeType: 'deleted'
          });
        }
      }
    } catch {
      // Ignore errors in fallback
    }
  }

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
}

// ============================================================================
// Register Function Commands
// ============================================================================

export function registerFunctionCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    // Show function history
    vscode.commands.registerCommand('aitm.showFunctionHistory', async (
      uri: vscode.Uri,
      functionName: string,
      startLine: number,
      endLine: number
    ) => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      const relativePath = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/');

      try {
        // Try to get function-specific history
        const output = execSync(
          `aitm file-history "${relativePath}" --function "${functionName}" --json 2>/dev/null || echo "[]"`,
          { cwd: workspaceRoot, encoding: 'utf-8' }
        );

        let history = JSON.parse(output);

        // If no function-specific history, fall back to file history
        if (history.length === 0) {
          const fileOutput = execSync(
            `aitm file-history "${relativePath}" --json 2>/dev/null || echo "[]"`,
            { cwd: workspaceRoot, encoding: 'utf-8' }
          );
          history = JSON.parse(fileOutput);
        }

        if (history.length === 0) {
          vscode.window.showInformationMessage(`No history found for function ${functionName}`);
          return;
        }

        interface HistoryQuickPickItem extends vscode.QuickPickItem {
          checkpointId: string;
        }

        const items: HistoryQuickPickItem[] = history.map((h: any) => ({
          label: h.description || h.checkpointId,
          description: new Date(h.timestamp).toLocaleString(),
          detail: h.changeType ? `${h.changeType}${h.linesChanged ? ` (${h.linesChanged} lines)` : ''}` : undefined,
          checkpointId: h.checkpointId
        }));

        const selected = await vscode.window.showQuickPick<HistoryQuickPickItem>(items, {
          title: `History of ${functionName}`,
          placeHolder: 'Select a checkpoint to view or restore'
        });

        if (selected) {
          const action = await vscode.window.showQuickPick([
            { label: '$(eye) View', description: 'View function at this checkpoint' },
            { label: '$(diff) Diff', description: 'Compare with current' },
            { label: '$(discard) Restore', description: 'Restore function from checkpoint' }
          ], { placeHolder: 'What would you like to do?' });

          if (action?.label.includes('Restore')) {
            vscode.commands.executeCommand('aitm.restoreFunction', uri, functionName, selected.checkpointId, startLine, endLine);
          } else if (action?.label.includes('Diff')) {
            vscode.commands.executeCommand('aitm.showFunctionDiff', uri, functionName, selected.checkpointId, startLine, endLine);
          } else if (action?.label.includes('View')) {
            // Show function at checkpoint
            await showFunctionAtCheckpoint(uri, functionName, selected.checkpointId, workspaceRoot);
          }
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to get history: ${error.message}`);
      }
    }),

    // Show function diff
    vscode.commands.registerCommand('aitm.showFunctionDiff', async (
      uri: vscode.Uri,
      functionName: string,
      checkpointId: string,
      startLine: number,
      endLine: number
    ) => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      try {
        const relativePath = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/');

        // Get file content at checkpoint
        const oldContent = execSync(
          `aitm get-file ${checkpointId} "${relativePath}" 2>/dev/null`,
          { cwd: workspaceRoot, encoding: 'utf-8' }
        );

        // Parse functions from both versions
        const currentDoc = await vscode.workspace.openTextDocument(uri);
        const currentText = currentDoc.getText();

        const oldFunctions = ASTParser.parseTypeScript(oldContent);
        const currentFunctions = ASTParser.parseTypeScript(currentText);

        const oldFunc = oldFunctions.find(f => f.name === functionName);
        const currentFunc = currentFunctions.find(f => f.name === functionName);

        if (!oldFunc && !currentFunc) {
          vscode.window.showErrorMessage(`Function ${functionName} not found`);
          return;
        }

        // Create temp files for diff
        const fs = require('fs');
        const tempDir = path.join(workspaceRoot, '.tm_internal', 'tmp_diff');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const ext = path.extname(uri.fsPath);
        const oldPath = path.join(tempDir, `${functionName}.old${ext}`);
        const newPath = path.join(tempDir, `${functionName}.current${ext}`);

        fs.writeFileSync(oldPath, oldFunc?.body || '// Function did not exist\n');
        fs.writeFileSync(newPath, currentFunc?.body || '// Function was deleted\n');

        // Show diff
        await vscode.commands.executeCommand('vscode.diff',
          vscode.Uri.file(oldPath),
          vscode.Uri.file(newPath),
          `${functionName} (checkpoint vs current)`
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to show diff: ${error.message}`);
      }
    }),

    // Restore function
    vscode.commands.registerCommand('aitm.restoreFunction', async (
      uri: vscode.Uri,
      functionName: string,
      checkpointId: string,
      startLine: number,
      endLine: number
    ) => {
      const confirm = await vscode.window.showWarningMessage(
        `Restore function ${functionName} from checkpoint ${checkpointId.substring(0, 8)}...?`,
        { modal: true },
        'Restore'
      );

      if (confirm !== 'Restore') return;

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) return;

      try {
        const relativePath = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/');

        // Get old file content
        const oldContent = execSync(
          `aitm get-file ${checkpointId} "${relativePath}" 2>/dev/null`,
          { cwd: workspaceRoot, encoding: 'utf-8' }
        );

        // Parse functions from old content
        const oldFunctions = ASTParser.parseTypeScript(oldContent);
        const oldFunc = oldFunctions.find(f => f.name === functionName);

        if (!oldFunc) {
          vscode.window.showErrorMessage(`Function ${functionName} not found in checkpoint`);
          return;
        }

        // Get current document
        const document = await vscode.workspace.openTextDocument(uri);
        const currentText = document.getText();

        // Find current function position
        const currentFunctions = ASTParser.parseTypeScript(currentText);
        const currentFunc = currentFunctions.find(f => f.name === functionName);

        if (!currentFunc) {
          const action = await vscode.window.showWarningMessage(
            `Function "${functionName}" was deleted from this file.`,
            'Insert at Original Position',
            'Insert at End of File',
            'Copy to Clipboard'
          );

          if (action === 'Insert at Original Position') {
            const document = await vscode.workspace.openTextDocument(uri);
            const edit = new vscode.WorkspaceEdit();
            // Insert at the original start line, or at the end if the file is shorter
            const insertLine = Math.min(startLine, document.lineCount);
            const position = new vscode.Position(insertLine, 0);
            edit.insert(uri, position, oldFunc.body + '\n\n');
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage(`Restored function "${functionName}" at line ${insertLine + 1}`);
          } else if (action === 'Insert at End of File') {
            const document = await vscode.workspace.openTextDocument(uri);
            const edit = new vscode.WorkspaceEdit();
            const lastLine = document.lineCount;
            const position = new vscode.Position(lastLine, 0);
            edit.insert(uri, position, '\n' + oldFunc.body + '\n');
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage(`Restored function "${functionName}" at end of file`);
          } else if (action === 'Copy to Clipboard') {
            await vscode.env.clipboard.writeText(oldFunc.body);
            vscode.window.showInformationMessage('Function code copied to clipboard');
          }
          return;
        }

        // Replace the function
        const edit = new vscode.WorkspaceEdit();
        const range = new vscode.Range(
          currentFunc.startLine, 0,
          currentFunc.endLine, document.lineAt(currentFunc.endLine).text.length
        );
        edit.replace(uri, range, oldFunc.body);
        await vscode.workspace.applyEdit(edit);

        vscode.window.showInformationMessage(`Restored function ${functionName}`);
      } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to restore: ${error.message}`);
      }
    })
  );
}

// Helper function to show function at a specific checkpoint
async function showFunctionAtCheckpoint(
  uri: vscode.Uri,
  functionName: string,
  checkpointId: string,
  workspaceRoot: string
): Promise<void> {
  try {
    const relativePath = path.relative(workspaceRoot, uri.fsPath).replace(/\\/g, '/');

    const oldContent = execSync(
      `aitm get-file ${checkpointId} "${relativePath}" 2>/dev/null`,
      { cwd: workspaceRoot, encoding: 'utf-8' }
    );

    const oldFunctions = ASTParser.parseTypeScript(oldContent);
    const func = oldFunctions.find(f => f.name === functionName);

    if (!func) {
      vscode.window.showErrorMessage(`Function ${functionName} not found in checkpoint`);
      return;
    }

    // Show in a new document
    const doc = await vscode.workspace.openTextDocument({
      content: func.body,
      language: path.extname(uri.fsPath).slice(1) || 'typescript'
    });

    await vscode.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode.ViewColumn.Beside
    });
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to view: ${error.message}`);
  }
}
