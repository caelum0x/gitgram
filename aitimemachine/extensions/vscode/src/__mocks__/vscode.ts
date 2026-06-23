/**
 * Mock implementation of the vscode namespace for unit testing.
 * Provides stubs for commonly used VS Code APIs.
 */

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }
  isBefore(other: Position): boolean {
    if (this.line < other.line) return true;
    if (this.line === other.line && this.character < other.character) return true;
    return false;
  }
  isAfter(other: Position): boolean {
    return !this.isEqual(other) && !this.isBefore(other);
  }
  translate(lineDelta: number = 0, characterDelta: number = 0): Position {
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;
  constructor(startLine: number, startChar: number, endLine: number, endChar: number);
  constructor(start: Position, end: Position);
  constructor(
    startLineOrPos: number | Position,
    startCharOrEnd: number | Position,
    endLine?: number,
    endChar?: number
  ) {
    if (typeof startLineOrPos === 'number') {
      this.start = new Position(startLineOrPos, startCharOrEnd as number);
      this.end = new Position(endLine!, endChar!);
    } else {
      this.start = startLineOrPos;
      this.end = startCharOrEnd as Position;
    }
  }
  isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }
  contains(positionOrRange: Position | Range): boolean {
    if (positionOrRange instanceof Position) {
      return !positionOrRange.isBefore(this.start) && !positionOrRange.isAfter(this.end);
    }
    return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
  }
}

export class Uri {
  private constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string
  ) {}

  get fsPath(): string {
    return this.path;
  }

  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }

  static parse(value: string): Uri {
    return new Uri('file', '', value, '', '');
  }

  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  public severity: DiagnosticSeverity;
  public source?: string;
  public code?: string | number | { value: string | number; target: Uri };
  public relatedInformation?: any[];
  public tags?: number[];

  constructor(
    public range: Range,
    public message: string,
    severity?: DiagnosticSeverity
  ) {
    this.severity = severity ?? DiagnosticSeverity.Error;
  }
}

export class CodeLens {
  public isResolved: boolean;
  constructor(
    public range: Range,
    public command?: {
      title: string;
      command: string;
      tooltip?: string;
      arguments?: any[];
    }
  ) {
    this.isResolved = !!command;
  }
}

export class CodeAction {
  public command?: { title: string; command: string; arguments?: any[] };
  public diagnostics?: Diagnostic[];
  public isPreferred?: boolean;
  public edit?: any;

  constructor(public title: string, public kind?: any) {}
}

export const CodeActionKind = {
  Empty: 'empty',
  QuickFix: 'quickfix',
  Refactor: 'refactor',
  RefactorExtract: 'refactor.extract',
  RefactorInline: 'refactor.inline',
  RefactorRewrite: 'refactor.rewrite',
  Source: 'source',
  SourceOrganizeImports: 'source.organizeImports',
  SourceFixAll: 'source.fixAll',
};

export class ThemeColor {
  constructor(public id: string) {}
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

export enum QuickPickItemKind {
  Separator = -1,
  Default = 0,
}

export const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15,
};

export class EventEmitter<T> {
  private _listeners: Array<(e: T) => void> = [];

  get event(): (listener: (e: T) => void) => { dispose: () => void } {
    return (listener: (e: T) => void) => {
      this._listeners.push(listener);
      return {
        dispose: () => {
          const idx = this._listeners.indexOf(listener);
          if (idx >= 0) this._listeners.splice(idx, 1);
        },
      };
    };
  }

  fire(data: T): void {
    this._listeners.forEach((l) => l(data));
  }

  dispose(): void {
    this._listeners = [];
  }
}

// Mock workspace
export const workspace = {
  workspaceFolders: [
    {
      uri: Uri.file('/mock/workspace'),
      name: 'mock-workspace',
      index: 0,
    },
  ],
  getConfiguration: (_section?: string) => ({
    get: (key: string, defaultValue?: any) => defaultValue,
    has: (_key: string) => false,
    inspect: (_key: string) => undefined,
    update: async (_key: string, _value: any) => {},
  }),
  onDidSaveTextDocument: (_listener: any) => ({ dispose: () => {} }),
  onDidChangeTextDocument: (_listener: any) => ({ dispose: () => {} }),
  openTextDocument: async (_uri: any) => ({
    getText: () => '',
    lineAt: (_line: number) => ({ text: '', range: new Range(0, 0, 0, 0) }),
    lineCount: 0,
    uri: typeof _uri === 'string' ? Uri.parse(_uri) : _uri,
    languageId: 'typescript',
    fileName: typeof _uri === 'string' ? _uri : _uri?.fsPath || '',
  }),
  applyEdit: async (_edit: any) => true,
  fs: {
    readFile: async (_uri: Uri) => Buffer.from(''),
    writeFile: async (_uri: Uri, _content: Uint8Array) => {},
  },
};

// Mock window
export const window = {
  createStatusBarItem: (_alignment?: StatusBarAlignment, _priority?: number) => ({
    text: '',
    tooltip: '',
    command: '',
    backgroundColor: undefined as ThemeColor | undefined,
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  createOutputChannel: (_name: string) => ({
    appendLine: (_value: string) => {},
    append: (_value: string) => {},
    show: () => {},
    clear: () => {},
    dispose: () => {},
  }),
  showInformationMessage: async (..._args: any[]) => undefined,
  showWarningMessage: async (..._args: any[]) => undefined,
  showErrorMessage: async (..._args: any[]) => undefined,
  showQuickPick: async (_items: any[], _options?: any) => undefined,
  showInputBox: async (_options?: any) => undefined,
  createWebviewPanel: (_viewType: string, _title: string, _showOptions: any, _options?: any) => ({
    webview: {
      html: '',
      onDidReceiveMessage: (_listener: any) => ({ dispose: () => {} }),
      postMessage: async (_message: any) => true,
    },
    dispose: () => {},
  }),
  withProgress: async (_options: any, task: any) => {
    return task(
      { report: (_value: any) => {} },
      { isCancellationRequested: false }
    );
  },
  showTextDocument: async (_doc: any, _options?: any) => ({}),
  activeTextEditor: undefined,
};

// Mock languages
export const languages = {
  createDiagnosticCollection: (_name?: string) => ({
    set: (_uri: Uri, _diagnostics: Diagnostic[]) => {},
    delete: (_uri: Uri) => {},
    clear: () => {},
    forEach: (_callback: any) => {},
    get: (_uri: Uri) => [],
    has: (_uri: Uri) => false,
    dispose: () => {},
  }),
  getDiagnostics: (): [Uri, Diagnostic[]][] => [],
  onDidChangeDiagnostics: (_listener: any) => ({ dispose: () => {} }),
  registerCodeLensProvider: (_selector: any, _provider: any) => ({ dispose: () => {} }),
  registerCodeActionsProvider: (_selector: any, _provider: any) => ({ dispose: () => {} }),
};

// Mock commands
export const commands = {
  registerCommand: (_command: string, _callback: (...args: any[]) => any) => ({ dispose: () => {} }),
  executeCommand: async (_command: string, ..._rest: any[]) => undefined,
};

// Mock env
export const env = {
  clipboard: {
    writeText: async (_text: string) => {},
    readText: async () => '',
  },
  openExternal: async (_uri: Uri) => true,
};

// WorkspaceEdit mock
export class WorkspaceEdit {
  private _edits: any[] = [];

  insert(uri: Uri, position: Position, newText: string): void {
    this._edits.push({ type: 'insert', uri, position, newText });
  }

  replace(uri: Uri, range: Range, newText: string): void {
    this._edits.push({ type: 'replace', uri, range, newText });
  }

  delete(uri: Uri, range: Range): void {
    this._edits.push({ type: 'delete', uri, range });
  }

  get size(): number {
    return this._edits.length;
  }
}
