import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { execSync } from 'child_process';

// Mock child_process before importing modules under test
vi.mock('child_process', () => ({
  execSync: vi.fn().mockReturnValue('[]'),
}));

// Mock crypto for deterministic hashing in tests
vi.mock('crypto', () => ({
  createHash: (_algo: string) => ({
    update: (content: string) => ({
      digest: (_encoding: string) => {
        // Produce a deterministic hash based on content
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
          const char = content.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(12, '0').substring(0, 12);
      },
    }),
  }),
}));

const mockedExecSync = vi.mocked(execSync);

import {
  AitmCodeLensProvider,
  FunctionChangeCodeLensProvider,
} from '../providers/CodeLensProvider';

// We need to also import the ASTParser. It is not exported directly, so we
// re-import the module and access the class through parsing functions exposed
// by FunctionChangeCodeLensProvider. However, the ASTParser is a private class.
// We will test it indirectly through the providers' _parseFunctions method and
// by importing the module to access the class via its namespace.

// Helper: access the ASTParser class from the module
// Since ASTParser is not exported, we test it indirectly via FunctionChangeCodeLensProvider
// which exposes _parseFunctions.

describe('AitmCodeLensProvider', () => {
  let provider: AitmCodeLensProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    provider = new AitmCodeLensProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('time formatting (_getTimeAgo)', () => {
    it('should return "just now" for very recent times', () => {
      const getTimeAgo = (provider as any)._getTimeAgo.bind(provider);
      const now = new Date();
      expect(getTimeAgo(now)).toBe('just now');
    });

    it('should return minutes ago for times within the hour', () => {
      const getTimeAgo = (provider as any)._getTimeAgo.bind(provider);
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60000);
      expect(getTimeAgo(fiveMinAgo)).toBe('5m ago');
    });

    it('should return hours ago for times within the day', () => {
      const getTimeAgo = (provider as any)._getTimeAgo.bind(provider);
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 3600000);
      expect(getTimeAgo(twoHoursAgo)).toBe('2h ago');
    });

    it('should return days ago for times beyond a day', () => {
      const getTimeAgo = (provider as any)._getTimeAgo.bind(provider);
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
      expect(getTimeAgo(threeDaysAgo)).toBe('3d ago');
    });
  });

  describe('provideCodeLenses', () => {
    it('should return undefined when showCodeLens config is false', () => {
      vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        get: (key: string, defaultValue?: any) => {
          if (key === 'showCodeLens') return false;
          return defaultValue;
        },
        has: () => false,
        inspect: () => undefined,
        update: async () => {},
      } as any);

      const document = {
        uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
        getText: () => '',
        languageId: 'typescript',
      } as any;

      const result = provider.provideCodeLenses(document);
      expect(result).toBeUndefined();
    });

    it('should return undefined when there is no workspace root', () => {
      const origFolders = vscode.workspace.workspaceFolders;
      (vscode.workspace as any).workspaceFolders = undefined;

      const document = {
        uri: vscode.Uri.file('/some/path/test.ts'),
        getText: () => '',
        languageId: 'typescript',
      } as any;

      const result = provider.provideCodeLenses(document);
      expect(result).toBeUndefined();

      (vscode.workspace as any).workspaceFolders = origFolders;
    });

    it('should return undefined when file history is empty', () => {
      mockedExecSync.mockReturnValue('[]');

      const document = {
        uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
        getText: () => '',
        languageId: 'typescript',
      } as any;

      const result = provider.provideCodeLenses(document);
      expect(result).toBeUndefined();
    });

    it('should return code lenses when file history exists', () => {
      const historyEntries = [
        {
          checkpointId: 'cp-1',
          description: 'Initial commit',
          timestamp: new Date().toISOString(),
          changeType: 'added',
        },
      ];

      // Directly populate cache to avoid reliance on execSync mock behavior
      const cache = (provider as any)._cache as Map<string, any>;
      cache.set('src/test.ts', { history: historyEntries, timestamp: Date.now() });

      const document = {
        uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
        getText: () => '',
        languageId: 'typescript',
      } as any;

      const result = provider.provideCodeLenses(document);
      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);

      // Should have at least the "Last saved" lens and "History" lens
      const titles = result!.map((l: vscode.CodeLens) => l.command?.title || '');
      expect(titles.some((t: string) => t.includes('Last saved'))).toBe(true);
      expect(titles.some((t: string) => t.includes('History'))).toBe(true);
    });

    it('should show checkpoint count lens when there are multiple history entries', () => {
      const historyEntries = [
        {
          checkpointId: 'cp-2',
          description: 'Second checkpoint',
          timestamp: new Date().toISOString(),
          changeType: 'modified',
        },
        {
          checkpointId: 'cp-1',
          description: 'First checkpoint',
          timestamp: new Date(Date.now() - 60000).toISOString(),
          changeType: 'added',
        },
      ];

      // Directly populate cache
      const cache = (provider as any)._cache as Map<string, any>;
      cache.set('src/test.ts', { history: historyEntries, timestamp: Date.now() });

      const document = {
        uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
        getText: () => '',
        languageId: 'typescript',
      } as any;

      const result = provider.provideCodeLenses(document);
      expect(result).toBeDefined();
      const titles = result!.map((l: vscode.CodeLens) => l.command?.title || '');
      expect(titles.some((t: string) => t.includes('2 checkpoints'))).toBe(true);
    });
  });

  describe('cache behavior', () => {
    it('should cache file history results', () => {
      const history = JSON.stringify([
        {
          checkpointId: 'cp-1',
          description: 'Test',
          timestamp: new Date().toISOString(),
          changeType: 'added',
        },
      ]);
      mockedExecSync.mockReturnValue(history as any);

      const getFileHistory = (provider as any)._getFileHistory.bind(provider);

      // First call
      const result1 = getFileHistory('src/test.ts', '/mock/workspace');
      expect(result1.length).toBe(1);

      // Change the mock return value
      mockedExecSync.mockReturnValue('[]' as any);

      // Second call should use cache
      const result2 = getFileHistory('src/test.ts', '/mock/workspace');
      expect(result2.length).toBe(1); // Still from cache
    });

    it('should invalidate cache after refresh()', () => {
      const cache = (provider as any)._cache as Map<string, any>;
      cache.set('test-key', { history: [{ id: 'old' }], timestamp: Date.now() });

      expect(cache.size).toBe(1);

      provider.refresh();

      expect(cache.size).toBe(0);
    });
  });
});

// =========================================================================
// AST Parsing (tested through FunctionChangeCodeLensProvider._parseFunctions)
// =========================================================================
describe('AST Parsing via FunctionChangeCodeLensProvider', () => {
  let provider: FunctionChangeCodeLensProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    provider = new FunctionChangeCodeLensProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function parseFunctions(text: string, languageId: string) {
    const document = {
      getText: () => text,
      languageId,
      uri: vscode.Uri.file('/mock/workspace/test'),
      lineCount: text.split('\n').length,
    } as any;
    return (provider as any)._parseFunctions(document);
  }

  describe('TypeScript function parsing', () => {
    it('should parse a regular function declaration', () => {
      const source = `function hello(name: string): string {
  return "Hello, " + name;
}`;
      const functions = parseFunctions(source, 'typescript');
      expect(functions.length).toBeGreaterThanOrEqual(1);
      const helloFn = functions.find((f: any) => f.name === 'hello');
      expect(helloFn).toBeDefined();
      expect(helloFn.type).toBe('function');
      expect(helloFn.startLine).toBe(0);
    });

    it('should parse exported async function', () => {
      const source = `export async function fetchData(url: string): Promise<any> {
  const response = await fetch(url);
  return response.json();
}`;
      const functions = parseFunctions(source, 'typescript');
      const fetchFn = functions.find((f: any) => f.name === 'fetchData');
      expect(fetchFn).toBeDefined();
      expect(fetchFn.type).toBe('function');
    });

    it('should parse arrow functions assigned to const', () => {
      const source = `const greet = (name: string): string => {
  return "Hi " + name;
};`;
      const functions = parseFunctions(source, 'typescript');
      const greetFn = functions.find((f: any) => f.name === 'greet');
      expect(greetFn).toBeDefined();
      expect(greetFn.type).toBe('arrow');
    });

    it('should parse a class and its methods', () => {
      const source = `class Calculator {
  private value: number = 0;

  add(n: number): Calculator {
    this.value += n;
    return this;
  }

  subtract(n: number): Calculator {
    this.value -= n;
    return this;
  }

  getResult(): number {
    return this.value;
  }
}`;
      const functions = parseFunctions(source, 'typescript');

      const classFn = functions.find((f: any) => f.name === 'Calculator' && f.type === 'class');
      expect(classFn).toBeDefined();

      const addMethod = functions.find((f: any) => f.name === 'add' && f.parentClass === 'Calculator');
      expect(addMethod).toBeDefined();
      expect(addMethod.type).toBe('method');

      const subtractMethod = functions.find((f: any) => f.name === 'subtract');
      expect(subtractMethod).toBeDefined();

      const getResultMethod = functions.find((f: any) => f.name === 'getResult');
      expect(getResultMethod).toBeDefined();
    });

    it('should parse a constructor in a class', () => {
      const source = `class MyService {
  constructor(private db: Database) {
    this.db = db;
  }

  query(sql: string) {
    return this.db.exec(sql);
  }
}`;
      const functions = parseFunctions(source, 'typescript');
      const ctor = functions.find((f: any) => f.name === 'constructor');
      expect(ctor).toBeDefined();
      expect(ctor.type).toBe('constructor');
      expect(ctor.parentClass).toBe('MyService');
    });

    it('should not confuse control flow keywords with function names', () => {
      const source = `function process() {
  if (true) {
    for (let i = 0; i < 10; i++) {
      while (false) {
        break;
      }
    }
  }
}`;
      const functions = parseFunctions(source, 'typescript');
      // Should find "process" but not "if", "for", "while"
      const names = functions.map((f: any) => f.name);
      expect(names).toContain('process');
      expect(names).not.toContain('if');
      expect(names).not.toContain('for');
      expect(names).not.toContain('while');
    });

    it('should deduplicate functions with same name at same line', () => {
      const source = `function doStuff() {
  return 42;
}`;
      const functions = parseFunctions(source, 'typescript');
      const doStuffFns = functions.filter((f: any) => f.name === 'doStuff');
      expect(doStuffFns.length).toBe(1);
    });
  });

  describe('Python function parsing', () => {
    it('should parse a simple Python function', () => {
      const source = `def greet(name):
    return f"Hello, {name}"
`;
      const functions = parseFunctions(source, 'python');
      const greetFn = functions.find((f: any) => f.name === 'greet');
      expect(greetFn).toBeDefined();
      expect(greetFn.type).toBe('function');
      expect(greetFn.startLine).toBe(0);
    });

    it('should parse an async Python function', () => {
      const source = `async def fetch_data(url):
    response = await aiohttp.get(url)
    return await response.json()
`;
      const functions = parseFunctions(source, 'python');
      const fetchFn = functions.find((f: any) => f.name === 'fetch_data');
      expect(fetchFn).toBeDefined();
      expect(fetchFn.type).toBe('function');
    });

    it('should parse a Python class with methods', () => {
      const source = `class Calculator:
    def __init__(self, value=0):
        self.value = value

    def add(self, n):
        self.value += n
        return self

    def get_result(self):
        return self.value
`;
      const functions = parseFunctions(source, 'python');

      const classFn = functions.find((f: any) => f.name === 'Calculator' && f.type === 'class');
      expect(classFn).toBeDefined();

      const initMethod = functions.find((f: any) => f.name === '__init__');
      expect(initMethod).toBeDefined();
      expect(initMethod.type).toBe('method');
      expect(initMethod.parentClass).toBe('Calculator');

      const addMethod = functions.find((f: any) => f.name === 'add');
      expect(addMethod).toBeDefined();
      expect(addMethod.parentClass).toBe('Calculator');
    });

    it('should parse Python function with type annotations', () => {
      const source = `def compute(x: int, y: int) -> int:
    return x + y
`;
      const functions = parseFunctions(source, 'python');
      const fn = functions.find((f: any) => f.name === 'compute');
      expect(fn).toBeDefined();
    });

    it('should distinguish between top-level functions and methods by indentation', () => {
      const source = `def top_level():
    pass

class MyClass:
    def method(self):
        pass
`;
      const functions = parseFunctions(source, 'python');

      const topLevel = functions.find((f: any) => f.name === 'top_level');
      expect(topLevel).toBeDefined();
      expect(topLevel.type).toBe('function');
      expect(topLevel.parentClass).toBeUndefined();

      const method = functions.find((f: any) => f.name === 'method');
      expect(method).toBeDefined();
      expect(method.type).toBe('method');
      expect(method.parentClass).toBe('MyClass');
    });
  });

  describe('function change detection', () => {
    it('should detect when two functions have different content hashes', () => {
      const source1 = `function add(a: number, b: number) {
  return a + b;
}`;
      const source2 = `function add(a: number, b: number) {
  return a + b + 1;
}`;

      const funcs1 = parseFunctions(source1, 'typescript');
      const funcs2 = parseFunctions(source2, 'typescript');

      const add1 = funcs1.find((f: any) => f.name === 'add');
      const add2 = funcs2.find((f: any) => f.name === 'add');

      expect(add1).toBeDefined();
      expect(add2).toBeDefined();
      expect(add1.hash).not.toBe(add2.hash);
    });

    it('should produce the same hash for identical function content', () => {
      const source = `function multiply(a: number, b: number) {
  return a * b;
}`;

      const funcs1 = parseFunctions(source, 'typescript');
      const funcs2 = parseFunctions(source, 'typescript');

      const fn1 = funcs1.find((f: any) => f.name === 'multiply');
      const fn2 = funcs2.find((f: any) => f.name === 'multiply');

      expect(fn1.hash).toBe(fn2.hash);
    });

    it('should detect added functions by comparing old and new parsed results', () => {
      const oldSource = `function existing() {
  return 1;
}`;
      const newSource = `function existing() {
  return 1;
}

function newFunction() {
  return 2;
}`;

      const oldFuncs = parseFunctions(oldSource, 'typescript');
      const newFuncs = parseFunctions(newSource, 'typescript');

      const oldNames = new Set(oldFuncs.map((f: any) => f.name));
      const addedFuncs = newFuncs.filter((f: any) => !oldNames.has(f.name));

      expect(addedFuncs.length).toBe(1);
      expect(addedFuncs[0].name).toBe('newFunction');
    });

    it('should detect deleted functions by comparing old and new parsed results', () => {
      const oldSource = `function keep() {
  return 1;
}

function remove() {
  return 2;
}`;
      const newSource = `function keep() {
  return 1;
}`;

      const oldFuncs = parseFunctions(oldSource, 'typescript');
      const newFuncs = parseFunctions(newSource, 'typescript');

      const newNames = new Set(newFuncs.map((f: any) => f.name));
      const deletedFuncs = oldFuncs.filter((f: any) => !newNames.has(f.name));

      expect(deletedFuncs.length).toBe(1);
      expect(deletedFuncs[0].name).toBe('remove');
    });

    it('should detect modified functions by comparing hashes', () => {
      const oldSource = `function transform(x: number) {
  return x * 2;
}`;
      const newSource = `function transform(x: number) {
  return x * 3;
}`;

      const oldFuncs = parseFunctions(oldSource, 'typescript');
      const newFuncs = parseFunctions(newSource, 'typescript');

      const oldMap = new Map(oldFuncs.map((f: any) => [f.name, f]));
      const modifiedFuncs = newFuncs.filter((f: any) => {
        const old = oldMap.get(f.name) as any;
        return old && old.hash !== (f as any).hash;
      });

      expect(modifiedFuncs.length).toBe(1);
      expect(modifiedFuncs[0].name).toBe('transform');
    });
  });

  describe('CodeLens creation', () => {
    it('should return empty array when showFunctionLens is disabled', () => {
      vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
        get: (key: string, defaultValue?: any) => {
          if (key === 'showFunctionLens') return false;
          return defaultValue;
        },
        has: () => false,
        inspect: () => undefined,
        update: async () => {},
      } as any);

      const document = {
        uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
        getText: () => 'function foo() {}',
        languageId: 'typescript',
      } as any;

      const result = provider.provideCodeLenses(document);
      expect(result).toEqual([]);
    });

    it('should return empty array when there is no workspace root', () => {
      const origFolders = vscode.workspace.workspaceFolders;
      (vscode.workspace as any).workspaceFolders = undefined;

      const document = {
        uri: vscode.Uri.file('/some/path/test.ts'),
        getText: () => 'function foo() {}',
        languageId: 'typescript',
      } as any;

      const result = provider.provideCodeLenses(document);
      expect(result).toEqual([]);

      (vscode.workspace as any).workspaceFolders = origFolders;
    });

    it('should return empty array when there are no parseable functions', () => {
      const document = {
        uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
        getText: () => '// just a comment\nconst x = 42;\n',
        languageId: 'typescript',
      } as any;

      const result = provider.provideCodeLenses(document);
      expect(result).toEqual([]);
    });

    it('should create CodeLens items for functions with change history', () => {
      // Directly populate the function change cache with a known modification
      const timestamp = new Date().toISOString();
      const changesMap = new Map();
      changesMap.set('myFunc', {
        name: 'myFunc',
        checkpointId: 'cp-1',
        timestamp,
        changeType: 'modified',
        linesChanged: 3,
      });

      const functionChangeCache = (provider as any)._functionChangeCache as Map<string, any>;
      functionChangeCache.set('src/test.ts', { changes: changesMap, timestamp: Date.now() });

      const source = `function myFunc(x: number) {
  return x * 2;
}`;
      const document = {
        uri: vscode.Uri.file('/mock/workspace/src/test.ts'),
        getText: () => source,
        languageId: 'typescript',
      } as any;

      const result = provider.provideCodeLenses(document);
      expect(result.length).toBeGreaterThan(0);

      // Should have lenses for the function (modified info, diff, history, compare, restore)
      const titles = result.map((l: vscode.CodeLens) => l.command?.title || '');
      expect(titles.some((t: string) => t.includes('myFunc'))).toBe(true);
    });

    it('should invalidate function change cache on refresh', () => {
      const cache = (provider as any)._functionChangeCache as Map<string, any>;
      const hashCache = (provider as any)._functionHashCache as Map<string, any>;
      cache.set('test', { changes: new Map(), timestamp: Date.now() });
      hashCache.set('test', new Map());

      expect(cache.size).toBe(1);
      expect(hashCache.size).toBe(1);

      provider.refresh();

      expect(cache.size).toBe(0);
      expect(hashCache.size).toBe(0);
    });
  });

  describe('generic function parsing fallback', () => {
    it('should parse functions from unknown language using generic pattern', () => {
      const source = `function doSomething() {
  console.log("hello");
}`;
      // Use a language ID that is not specifically handled
      const functions = parseFunctions(source, 'plaintext');
      const fn = functions.find((f: any) => f.name === 'doSomething');
      expect(fn).toBeDefined();
      expect(fn.type).toBe('function');
    });
  });
});
