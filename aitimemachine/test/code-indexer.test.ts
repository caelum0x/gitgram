import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import { CodeIndexer } from '../src/services/code-indexer.js';

describe('CodeIndexer', () => {
  let db: Database.Database;
  let indexer: CodeIndexer;
  let testDir: string;
  const projectId = 'test-project-001';

  beforeEach(() => {
    // Use in-memory SQLite
    db = new Database(':memory:');
    indexer = new CodeIndexer(db);

    // Create a temp directory with test files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitm-indexer-test-'));

    // TypeScript file
    fs.writeFileSync(
      path.join(testDir, 'math.ts'),
      `/**
 * Add two numbers
 */
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export class Calculator {
  private history: number[] = [];

  add(a: number, b: number): number {
    const result = a + b;
    this.history.push(result);
    return result;
  }

  getHistory(): number[] {
    return this.history;
  }
}

export interface MathConfig {
  precision: number;
  roundingMode: string;
}

export type NumberPair = [number, number];

export enum Operation {
  ADD = 'add',
  SUBTRACT = 'subtract',
}
`
    );

    // Another TypeScript file that imports from math.ts
    fs.writeFileSync(
      path.join(testDir, 'app.ts'),
      `import { add, Calculator } from './math';
import { MathConfig } from './math';

const calc = new Calculator();
const result = add(1, 2);

export function main() {
  console.log(result);
}
`
    );

    // Python file
    fs.writeFileSync(
      path.join(testDir, 'utils.py'),
      `"""Utility functions"""

def greet(name: str) -> str:
    """Greet someone by name"""
    return f"Hello, {name}!"

class Greeter:
    def __init__(self, prefix: str = "Hello"):
        self.prefix = prefix

    def greet(self, name: str) -> str:
        return f"{self.prefix}, {name}!"
`
    );
  });

  afterEach(() => {
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('indexProject', () => {
    test('indexes TypeScript files and extracts symbols', () => {
      const result = indexer.indexProject(projectId, testDir, []);

      expect(result.projectId).toBe(projectId);
      expect(result.filesIndexed).toBeGreaterThanOrEqual(2);
      expect(result.symbolsFound).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
    });

    test('finds functions, classes, interfaces, types, enums', () => {
      indexer.indexProject(projectId, testDir, []);
      const stats = indexer.getStats(projectId);

      expect(stats.totalSymbols).toBeGreaterThan(0);
      expect(stats.byType['function']).toBeGreaterThanOrEqual(3); // add, subtract, main
      expect(stats.byType['class']).toBeGreaterThanOrEqual(1); // Calculator
      expect(stats.byType['interface']).toBeGreaterThanOrEqual(1); // MathConfig
      expect(stats.byType['type']).toBeGreaterThanOrEqual(1); // NumberPair
      expect(stats.byType['enum']).toBeGreaterThanOrEqual(1); // Operation
    });

    test('indexes Python files', () => {
      indexer.indexProject(projectId, testDir, []);

      const pySymbols = indexer.getFileSymbols(
        projectId,
        'utils.py'
      );

      expect(pySymbols.length).toBeGreaterThan(0);

      const funcNames = pySymbols.map((s) => s.symbolName);
      expect(funcNames).toContain('greet');
      expect(funcNames).toContain('Greeter');
    });

    test('respects ignore globs', () => {
      // Create a file in an ignored directory
      fs.mkdirSync(path.join(testDir, 'vendor'));
      fs.writeFileSync(
        path.join(testDir, 'vendor', 'lib.ts'),
        'export function vendorFunc() {}'
      );

      const result = indexer.indexProject(projectId, testDir, ['vendor/**']);

      // The vendor file should not be indexed (relative path)
      const vendorSymbols = indexer.getFileSymbols(
        projectId,
        path.join('vendor', 'lib.ts')
      );
      expect(vendorSymbols.length).toBe(0);
    });

    test('re-indexing replaces old data', () => {
      indexer.indexProject(projectId, testDir, []);
      const firstStats = indexer.getStats(projectId);

      // Add a new file
      fs.writeFileSync(
        path.join(testDir, 'extra.ts'),
        'export function extra() {}'
      );

      indexer.indexProject(projectId, testDir, []);
      const secondStats = indexer.getStats(projectId);

      expect(secondStats.totalSymbols).toBeGreaterThanOrEqual(
        firstStats.totalSymbols
      );
    });
  });

  describe('searchSymbols', () => {
    beforeEach(() => {
      indexer.indexProject(projectId, testDir, []);
    });

    test('finds symbols by exact name', () => {
      const results = indexer.searchSymbols(projectId, 'add');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].symbol.symbolName).toBe('add');
      expect(results[0].matchType).toBe('exact');
    });

    test('finds symbols by prefix', () => {
      const results = indexer.searchSymbols(projectId, 'sub');

      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.symbol.symbolName);
      expect(names).toContain('subtract');
    });

    test('filters by type', () => {
      const results = indexer.searchSymbols(projectId, 'Calculator', {
        type: 'class',
      });

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.symbol.symbolType).toBe('class');
      }
    });

    test('limits results', () => {
      const results = indexer.searchSymbols(projectId, 'a', { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('supports regex', () => {
      const results = indexer.searchSymbols(projectId, '^add$', {
        regex: true,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].symbol.symbolName).toBe('add');
    });

    test('returns empty for no matches', () => {
      const results = indexer.searchSymbols(projectId, 'nonexistent_xyz');
      expect(results.length).toBe(0);
    });
  });

  describe('findDefinition', () => {
    beforeEach(() => {
      indexer.indexProject(projectId, testDir, []);
    });

    test('finds function definition', () => {
      const results = indexer.findDefinition(projectId, 'add');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].symbolName).toBe('add');
      expect(results[0].symbolType).toBe('function');
      expect(results[0].filePath).toContain('math.ts');
    });

    test('finds class definition', () => {
      const results = indexer.findDefinition(projectId, 'Calculator');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].symbolName).toBe('Calculator');
      expect(results[0].symbolType).toBe('class');
    });

    test('returns empty for unknown symbol', () => {
      const results = indexer.findDefinition(projectId, 'NotARealThing');
      expect(results.length).toBe(0);
    });
  });

  describe('findUsages', () => {
    beforeEach(() => {
      indexer.indexProject(projectId, testDir, []);
    });

    test('finds imports of a symbol', () => {
      const results = indexer.findUsages(projectId, 'add');

      // Should find the import in app.ts
      const importResults = results.filter(
        (r) => r.symbolType === 'import'
      );
      expect(importResults.length).toBeGreaterThan(0);
    });

    test('finds references to a symbol', () => {
      const results = indexer.findUsages(projectId, 'Calculator');

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getProjectStructure', () => {
    beforeEach(() => {
      indexer.indexProject(projectId, testDir, []);
    });

    test('returns structure grouped by file', () => {
      const structure = indexer.getProjectStructure(projectId);

      expect(Object.keys(structure).length).toBeGreaterThan(0);

      // Check that math.ts has symbols
      const mathFile = Object.keys(structure).find((fp) =>
        fp.endsWith('math.ts')
      );
      expect(mathFile).toBeDefined();
      expect(structure[mathFile!].length).toBeGreaterThan(0);
    });

    test('only includes top-level symbols (no methods)', () => {
      const structure = indexer.getProjectStructure(projectId);

      for (const filePath of Object.keys(structure)) {
        for (const sym of structure[filePath]) {
          expect(sym.parentSymbol).toBeNull();
        }
      }
    });
  });

  describe('getFileSymbols', () => {
    beforeEach(() => {
      indexer.indexProject(projectId, testDir, []);
    });

    test('returns all symbols in a specific file', () => {
      // CodeIndexer stores relative paths
      const symbols = indexer.getFileSymbols(projectId, 'math.ts');

      expect(symbols.length).toBeGreaterThan(0);
      const names = symbols.map((s) => s.symbolName);
      expect(names).toContain('add');
      expect(names).toContain('subtract');
      expect(names).toContain('Calculator');
    });

    test('returns empty for unknown file', () => {
      const symbols = indexer.getFileSymbols(
        projectId,
        '/nonexistent/file.ts'
      );
      expect(symbols.length).toBe(0);
    });
  });

  describe('getStats', () => {
    test('returns zeros for empty project', () => {
      const stats = indexer.getStats('empty-project');

      expect(stats.totalSymbols).toBe(0);
      expect(stats.filesIndexed).toBe(0);
      expect(Object.keys(stats.byType).length).toBe(0);
    });

    test('returns accurate counts after indexing', () => {
      indexer.indexProject(projectId, testDir, []);
      const stats = indexer.getStats(projectId);

      expect(stats.totalSymbols).toBeGreaterThan(0);
      expect(stats.filesIndexed).toBeGreaterThan(0);
      expect(stats.indexedAt).not.toBeNull();
    });
  });
});
