/**
 * Code Indexer Service
 *
 * Parses source files to extract structured symbols (functions, classes,
 * interfaces, types, exports, imports) and stores them in SQLite for
 * fast search and lookup.
 *
 * Powers: tm_index_project, tm_search_code, tm_find_definition, tm_find_usages
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { minimatch } from 'minimatch';
import type Database from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

export type SymbolType = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'method' | 'property' | 'export' | 'import';

export interface CodeSymbol {
  id: string;
  projectId: string;
  filePath: string;
  symbolName: string;
  symbolType: SymbolType;
  lineStart: number;
  lineEnd: number;
  signature: string;
  docComment: string;
  parentSymbol: string | null;
  contentHash: string;
  indexedAt: string;
}

export interface IndexResult {
  projectId: string;
  filesScanned: number;
  filesIndexed: number;
  symbolsFound: number;
  errors: string[];
  duration: number;
}

export interface SearchResult {
  symbol: CodeSymbol;
  score: number;
  matchType: 'exact' | 'prefix' | 'contains' | 'regex';
}

type DbCodeSymbolRow = {
  id: string;
  project_id: string;
  file_path: string;
  symbol_name: string;
  symbol_type: SymbolType;
  line_start: number;
  line_end: number;
  signature: string;
  doc_comment: string;
  parent_symbol: string | null;
  content_hash: string;
  indexed_at: string;
};

type DbCountRow = { cnt: number };
type DbLatestRow = { latest: string | null };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ============================================================================
// Language Parsers
// ============================================================================

interface ParsedSymbol {
  name: string;
  type: SymbolType;
  lineStart: number;
  lineEnd: number;
  signature: string;
  docComment: string;
  parent: string | null;
}

/**
 * Parse TypeScript/JavaScript files for symbols using regex-based extraction.
 * Not as precise as a full AST parser but works without external dependencies.
 */
function parseTypeScriptSymbols(content: string, filePath: string): ParsedSymbol[] {
  const symbols: ParsedSymbol[] = [];
  const lines = content.split('\n');

  let currentClass: string | null = null;
  let classStartLine = 0;
  let braceDepth = 0;
  let inClassBody = false;
  let pendingDocComment = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Track doc comments (/** ... */)
    if (trimmed.startsWith('/**')) {
      pendingDocComment = '';
      let j = i;
      while (j < lines.length) {
        pendingDocComment += lines[j].trim() + '\n';
        if (lines[j].includes('*/')) break;
        j++;
      }
      pendingDocComment = pendingDocComment.trim();
      continue;
    }

    // Skip single-line comments and empty lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed === '') {
      if (!trimmed.startsWith('/**')) {
        // Don't clear pending doc comment for adjacent comment lines
        if (trimmed === '' || trimmed.startsWith('//')) {
          // keep pendingDocComment
        }
      }
      continue;
    }

    // Track brace depth for class body detection
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    // ---- Imports ----
    const importMatch = trimmed.match(/^import\s+(?:(?:type\s+)?(?:\{([^}]*)\}|(\w+))\s+from\s+)?['"]([^'"]+)['"]/);
    if (importMatch) {
      const imported = importMatch[1] || importMatch[2] || '';
      const from = importMatch[3];
      symbols.push({
        name: imported || from,
        type: 'import',
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: trimmed,
        docComment: '',
        parent: null,
      });
      pendingDocComment = '';
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // ---- Exports (re-exports) ----
    const reExportMatch = trimmed.match(/^export\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/);
    if (reExportMatch) {
      symbols.push({
        name: reExportMatch[1].trim(),
        type: 'export',
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: trimmed,
        docComment: '',
        parent: null,
      });
      pendingDocComment = '';
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // ---- Class / Abstract Class ----
    const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{?/);
    if (classMatch) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: classMatch[1],
        type: 'class',
        lineStart: lineNum,
        lineEnd: endLine,
        signature: trimmed.replace(/\{.*$/, '').trim(),
        docComment: pendingDocComment,
        parent: null,
      });
      currentClass = classMatch[1];
      classStartLine = lineNum;
      inClassBody = true;
      pendingDocComment = '';
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // ---- Interface ----
    const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+[\w,\s<>]+)?\s*\{?/);
    if (ifaceMatch) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: ifaceMatch[1],
        type: 'interface',
        lineStart: lineNum,
        lineEnd: endLine,
        signature: trimmed.replace(/\{.*$/, '').trim(),
        docComment: pendingDocComment,
        parent: null,
      });
      pendingDocComment = '';
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // ---- Type Alias ----
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)(?:<[^>]*>)?\s*=/);
    if (typeMatch) {
      const endLine = findStatementEnd(lines, i);
      symbols.push({
        name: typeMatch[1],
        type: 'type',
        lineStart: lineNum,
        lineEnd: endLine,
        signature: trimmed,
        docComment: pendingDocComment,
        parent: null,
      });
      pendingDocComment = '';
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // ---- Enum ----
    const enumMatch = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+(\w+)\s*\{?/);
    if (enumMatch) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: enumMatch[1],
        type: 'enum',
        lineStart: lineNum,
        lineEnd: endLine,
        signature: trimmed.replace(/\{.*$/, '').trim(),
        docComment: pendingDocComment,
        parent: null,
      });
      pendingDocComment = '';
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // ---- Standalone Function ----
    const funcMatch = trimmed.match(
      /^(?:export\s+)?(?:export\s+default\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(/
    );
    if (funcMatch && !inClassBody) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: funcMatch[1],
        type: 'function',
        lineStart: lineNum,
        lineEnd: endLine,
        signature: extractSignature(lines, i),
        docComment: pendingDocComment,
        parent: null,
      });
      pendingDocComment = '';
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // ---- Arrow Function / Const Function ----
    const arrowMatch = trimmed.match(
      /^(?:export\s+)?(?:export\s+default\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/
    );
    if (arrowMatch && !inClassBody) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: arrowMatch[1],
        type: 'function',
        lineStart: lineNum,
        lineEnd: endLine,
        signature: extractSignature(lines, i),
        docComment: pendingDocComment,
        parent: null,
      });
      pendingDocComment = '';
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // ---- Const function expression ----
    const constFuncMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/
    );
    if (constFuncMatch && !inClassBody) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: constFuncMatch[1],
        type: 'function',
        lineStart: lineNum,
        lineEnd: endLine,
        signature: extractSignature(lines, i),
        docComment: pendingDocComment,
        parent: null,
      });
      pendingDocComment = '';
      braceDepth += openBraces - closeBraces;
      continue;
    }

    // ---- Class Method (when inside a class) ----
    if (inClassBody && currentClass) {
      const methodMatch = trimmed.match(
        /^(?:(?:public|private|protected|static|async|abstract|readonly|override|get|set)\s+)*(\w+)\s*(?:<[^>]*>)?\s*\(/
      );
      if (methodMatch && !trimmed.startsWith('if') && !trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('switch') && !trimmed.startsWith('return') && !trimmed.startsWith('new')) {
        const endLine = findBlockEnd(lines, i);
        symbols.push({
          name: methodMatch[1],
          type: 'method',
          lineStart: lineNum,
          lineEnd: endLine,
          signature: extractSignature(lines, i),
          docComment: pendingDocComment,
          parent: currentClass,
        });
        pendingDocComment = '';
        braceDepth += openBraces - closeBraces;
        continue;
      }

      // Class property
      const propMatch = trimmed.match(
        /^(?:(?:public|private|protected|static|readonly|abstract|override)\s+)*(\w+)\s*[?!]?\s*[:=]/
      );
      if (propMatch && !trimmed.startsWith('if') && !trimmed.startsWith('const') && !trimmed.startsWith('let') && !trimmed.startsWith('var') && !trimmed.startsWith('return')) {
        symbols.push({
          name: propMatch[1],
          type: 'property',
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: trimmed.replace(/[=;].*$/, '').trim(),
          docComment: pendingDocComment,
          parent: currentClass,
        });
        pendingDocComment = '';
        braceDepth += openBraces - closeBraces;
        continue;
      }
    }

    // ---- Exported variable/const ----
    const exportVarMatch = trimmed.match(/^export\s+(?:const|let|var)\s+(\w+)\s*/);
    if (exportVarMatch && !inClassBody) {
      symbols.push({
        name: exportVarMatch[1],
        type: 'variable',
        lineStart: lineNum,
        lineEnd: findStatementEnd(lines, i),
        signature: trimmed.replace(/[=;].*$/, '').trim(),
        docComment: pendingDocComment,
        parent: null,
      });
      pendingDocComment = '';
    }

    // Update brace depth and class tracking
    braceDepth += openBraces - closeBraces;
    if (inClassBody && braceDepth <= 0) {
      inClassBody = false;
      currentClass = null;
      braceDepth = 0;
    }

    // Clear doc comment if we hit a non-declaration line
    if (!trimmed.startsWith('*') && !trimmed.startsWith('//')) {
      pendingDocComment = '';
    }
  }

  return symbols;
}

/**
 * Parse Python files for symbols
 */
function parsePythonSymbols(content: string): ParsedSymbol[] {
  const symbols: ParsedSymbol[] = [];
  const lines = content.split('\n');

  let currentClass: string | null = null;
  let pendingDocstring = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;
    const indent = line.length - line.trimStart().length;

    // Reset class context at top-level definitions
    if (indent === 0 && (trimmed.startsWith('class ') || trimmed.startsWith('def ') || trimmed.startsWith('async def '))) {
      currentClass = null;
    }

    // ---- Import ----
    const importMatch = trimmed.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
    if (importMatch) {
      symbols.push({
        name: importMatch[2].split(',')[0].trim().split(' as ')[0],
        type: 'import',
        lineStart: lineNum,
        lineEnd: lineNum,
        signature: trimmed,
        docComment: '',
        parent: null,
      });
      continue;
    }

    // ---- Class ----
    const classMatch = trimmed.match(/^class\s+(\w+)(?:\(([^)]*)\))?\s*:/);
    if (classMatch && indent === 0) {
      const endLine = findPythonBlockEnd(lines, i, indent);
      // Check for docstring
      const docstring = extractPythonDocstring(lines, i + 1);
      symbols.push({
        name: classMatch[1],
        type: 'class',
        lineStart: lineNum,
        lineEnd: endLine,
        signature: trimmed,
        docComment: docstring,
        parent: null,
      });
      currentClass = classMatch[1];
      continue;
    }

    // ---- Function / Method ----
    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (funcMatch) {
      const endLine = findPythonBlockEnd(lines, i, indent);
      const docstring = extractPythonDocstring(lines, i + 1);
      const isMethod = indent > 0 && currentClass !== null;
      symbols.push({
        name: funcMatch[1],
        type: isMethod ? 'method' : 'function',
        lineStart: lineNum,
        lineEnd: endLine,
        signature: trimmed.replace(/:$/, '').trim(),
        docComment: docstring,
        parent: isMethod ? currentClass : null,
      });
      continue;
    }

    // ---- Top-level variable assignment ----
    if (indent === 0) {
      const varMatch = trimmed.match(/^(\w+)\s*(?::\s*\S+\s*)?=\s*/);
      if (varMatch && !trimmed.startsWith('#') && /^[A-Z_]/.test(varMatch[1])) {
        symbols.push({
          name: varMatch[1],
          type: 'variable',
          lineStart: lineNum,
          lineEnd: lineNum,
          signature: trimmed,
          docComment: '',
          parent: null,
        });
      }
    }
  }

  return symbols;
}

// ============================================================================
// Helper Functions
// ============================================================================

function findBlockEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let foundOpen = false;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') { depth++; foundOpen = true; }
      if (ch === '}') { depth--; }
      if (foundOpen && depth === 0) return i + 1;
    }
  }
  return Math.min(startLine + 1, lines.length);
}

function findStatementEnd(lines: string[], startLine: number): number {
  for (let i = startLine; i < Math.min(startLine + 50, lines.length); i++) {
    if (lines[i].includes(';') || (i > startLine && lines[i].trim() === '')) {
      return i + 1;
    }
  }
  return startLine + 1;
}

function findPythonBlockEnd(lines: string[], startLine: number, baseIndent: number): number {
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= baseIndent) return i;
  }
  return lines.length;
}

function extractPythonDocstring(lines: string[], startLine: number): string {
  if (startLine >= lines.length) return '';
  const trimmed = lines[startLine].trim();
  if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
    const quote = trimmed.slice(0, 3);
    if (trimmed.endsWith(quote) && trimmed.length > 6) {
      return trimmed.slice(3, -3).trim();
    }
    let doc = trimmed.slice(3) + '\n';
    for (let i = startLine + 1; i < lines.length; i++) {
      if (lines[i].trim().endsWith(quote)) {
        doc += lines[i].trim().slice(0, -3);
        return doc.trim();
      }
      doc += lines[i].trim() + '\n';
    }
  }
  return '';
}

function extractSignature(lines: string[], startLine: number): string {
  let sig = lines[startLine].trim();
  // Multi-line signatures
  if (!sig.includes(')') && !sig.includes('{')) {
    for (let i = startLine + 1; i < Math.min(startLine + 10, lines.length); i++) {
      sig += ' ' + lines[i].trim();
      if (lines[i].includes(')') || lines[i].includes('{')) break;
    }
  }
  // Clean up: remove body
  sig = sig.replace(/\{[\s\S]*$/, '').trim();
  return sig;
}

// ============================================================================
// File Scanner
// ============================================================================

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.aitimemachine', 'dist', 'lib', 'build',
  'coverage', '.next', '.nuxt', '__pycache__', '.venv', 'venv',
  '.cache', '.turbo', '.output',
]);

function scanFiles(rootPath: string, ignoreGlobs: string[] = []): string[] {
  const files: string[] = [];

  function isIgnored(relativePath: string): boolean {
    for (const pattern of ignoreGlobs) {
      if (minimatch(relativePath, pattern, { dot: true })) return true;
    }
    return false;
  }

  function walk(dir: string, relativeBase: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = relativeBase ? path.join(relativeBase, entry.name) : entry.name;

      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        if (isIgnored(relativePath) || isIgnored(relativePath + '/')) continue;
        walk(fullPath, relativePath);
      } else if (entry.isFile()) {
        if (isIgnored(relativePath)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          files.push(relativePath);
        }
      }
    }
  }

  walk(rootPath, '');
  return files;
}

// ============================================================================
// Code Indexer
// ============================================================================

export class CodeIndexer {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_symbols (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        symbol_name TEXT NOT NULL,
        symbol_type TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        signature TEXT NOT NULL DEFAULT '',
        doc_comment TEXT NOT NULL DEFAULT '',
        parent_symbol TEXT,
        content_hash TEXT NOT NULL,
        indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_symbols_project
        ON code_symbols(project_id);
      CREATE INDEX IF NOT EXISTS idx_symbols_name
        ON code_symbols(project_id, symbol_name);
      CREATE INDEX IF NOT EXISTS idx_symbols_type
        ON code_symbols(project_id, symbol_type);
      CREATE INDEX IF NOT EXISTS idx_symbols_file
        ON code_symbols(project_id, file_path);
      CREATE INDEX IF NOT EXISTS idx_symbols_parent
        ON code_symbols(project_id, parent_symbol);
    `);
  }

  /**
   * Index all supported files in a project directory
   */
  indexProject(projectId: string, rootPath: string, ignoreGlobs: string[] = []): IndexResult {
    const startTime = Date.now();
    const result: IndexResult = {
      projectId,
      filesScanned: 0,
      filesIndexed: 0,
      symbolsFound: 0,
      errors: [],
      duration: 0,
    };

    // Scan for files
    const files = scanFiles(rootPath, ignoreGlobs);
    result.filesScanned = files.length;

    // Clear existing index for this project
    this.db.prepare('DELETE FROM code_symbols WHERE project_id = ?').run(projectId);

    // Prepare insert statement
    const insert = this.db.prepare(`
      INSERT INTO code_symbols (id, project_id, file_path, symbol_name, symbol_type,
        line_start, line_end, signature, doc_comment, parent_symbol, content_hash, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    // Use a transaction for performance
    const insertAll = this.db.transaction((symbols: Array<{ filePath: string; sym: ParsedSymbol; hash: string }>) => {
      for (const { filePath, sym, hash } of symbols) {
        const id = `sym_${crypto.createHash('sha256')
          .update(`${projectId}:${filePath}:${sym.name}:${sym.lineStart}`)
          .digest('hex')
          .slice(0, 16)}`;

        insert.run(
          id,
          projectId,
          filePath,
          sym.name,
          sym.type,
          sym.lineStart,
          sym.lineEnd,
          sym.signature,
          sym.docComment,
          sym.parent,
          hash,
        );
      }
    });

    const allSymbols: Array<{ filePath: string; sym: ParsedSymbol; hash: string }> = [];

    for (const relPath of files) {
      const fullPath = path.join(rootPath, relPath);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

        const ext = path.extname(relPath).toLowerCase();
        let parsed: ParsedSymbol[];

        if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
          parsed = parseTypeScriptSymbols(content, relPath);
        } else if (ext === '.py') {
          parsed = parsePythonSymbols(content);
        } else {
          continue;
        }

        if (parsed.length > 0) {
          result.filesIndexed++;
          result.symbolsFound += parsed.length;
          for (const sym of parsed) {
            allSymbols.push({ filePath: relPath, sym, hash });
          }
        }
      } catch (err: unknown) {
        result.errors.push(`${relPath}: ${errorMessage(err)}`);
      }
    }

    insertAll(allSymbols);

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Search symbols by name with regex or fuzzy matching
   */
  searchSymbols(projectId: string, query: string, options: {
    type?: SymbolType;
    limit?: number;
    regex?: boolean;
  } = {}): SearchResult[] {
    const limit = options.limit || 50;
    const results: SearchResult[] = [];

    // Get all symbols for the project (filtered by type if specified)
    let sql = 'SELECT * FROM code_symbols WHERE project_id = ?';
    const params: Array<string | number> = [projectId];

    if (options.type) {
      sql += ' AND symbol_type = ?';
      params.push(options.type);
    }

    const rows = this.db.prepare(sql).all(...params) as DbCodeSymbolRow[];
    const queryLower = query.toLowerCase();

    for (const row of rows) {
      const name = row.symbol_name as string;
      const nameLower = name.toLowerCase();
      let score = 0;
      let matchType: SearchResult['matchType'] = 'contains';

      if (options.regex) {
        try {
          const re = new RegExp(query, 'i');
          if (re.test(name)) {
            score = 50;
            matchType = 'regex';
          } else if (re.test(row.signature)) {
            score = 20;
            matchType = 'regex';
          } else {
            continue;
          }
        } catch {
          continue;
        }
      } else {
        // Exact match
        if (nameLower === queryLower) {
          score = 100;
          matchType = 'exact';
        }
        // Prefix match
        else if (nameLower.startsWith(queryLower)) {
          score = 75;
          matchType = 'prefix';
        }
        // Contains match (name)
        else if (nameLower.includes(queryLower)) {
          score = 50;
          matchType = 'contains';
        }
        // Contains match (signature)
        else if ((row.signature as string).toLowerCase().includes(queryLower)) {
          score = 25;
          matchType = 'contains';
        }
        // Contains match (doc comment)
        else if ((row.doc_comment as string).toLowerCase().includes(queryLower)) {
          score = 10;
          matchType = 'contains';
        }
        else {
          continue;
        }
      }

      // Boost exported/top-level symbols
      if (!row.parent_symbol) score += 5;
      if ((row.signature as string).includes('export')) score += 3;

      results.push({
        symbol: this.rowToSymbol(row),
        score,
        matchType,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Find the definition of a symbol by exact name
   */
  findDefinition(projectId: string, symbolName: string): CodeSymbol[] {
    const definitionTypes: SymbolType[] = ['function', 'class', 'interface', 'type', 'enum', 'method', 'variable'];

    const rows = this.db.prepare(`
      SELECT * FROM code_symbols
      WHERE project_id = ? AND symbol_name = ? AND symbol_type IN (${definitionTypes.map(() => '?').join(',')})
      ORDER BY symbol_type, file_path
    `).all(projectId, symbolName, ...definitionTypes) as DbCodeSymbolRow[];

    return rows.map(r => this.rowToSymbol(r));
  }

  /**
   * Find all usages/references of a symbol (imports and references)
   */
  findUsages(projectId: string, symbolName: string): CodeSymbol[] {
    // Find imports that reference this symbol
    const rows = this.db.prepare(`
      SELECT * FROM code_symbols
      WHERE project_id = ? AND (
        (symbol_type = 'import' AND signature LIKE ?)
        OR (symbol_name = ? AND symbol_type != 'import')
      )
      ORDER BY file_path, line_start
    `).all(projectId, `%${symbolName}%`, symbolName) as DbCodeSymbolRow[];

    return rows.map(r => this.rowToSymbol(r));
  }

  /**
   * Get project structure: top-level symbols grouped by file
   */
  getProjectStructure(projectId: string): Record<string, CodeSymbol[]> {
    const rows = this.db.prepare(`
      SELECT * FROM code_symbols
      WHERE project_id = ? AND parent_symbol IS NULL
      ORDER BY file_path, line_start
    `).all(projectId) as DbCodeSymbolRow[];

    const structure: Record<string, CodeSymbol[]> = {};
    for (const row of rows) {
      const fp = row.file_path as string;
      if (!structure[fp]) structure[fp] = [];
      structure[fp].push(this.rowToSymbol(row));
    }
    return structure;
  }

  /**
   * Get all symbols in a file
   */
  getFileSymbols(projectId: string, filePath: string): CodeSymbol[] {
    const rows = this.db.prepare(`
      SELECT * FROM code_symbols
      WHERE project_id = ? AND file_path = ?
      ORDER BY line_start
    `).all(projectId, filePath) as DbCodeSymbolRow[];

    return rows.map(r => this.rowToSymbol(r));
  }

  /**
   * Get index statistics
   */
  getStats(projectId: string): {
    totalSymbols: number;
    byType: Record<string, number>;
    filesIndexed: number;
    indexedAt: string | null;
  } {
    const total = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM code_symbols WHERE project_id = ?'
    ).get(projectId) as DbCountRow | undefined;

    const byType = this.db.prepare(`
      SELECT symbol_type, COUNT(*) as cnt
      FROM code_symbols WHERE project_id = ?
      GROUP BY symbol_type
    `).all(projectId) as Array<{ symbol_type: string; cnt: number }>;

    const files = this.db.prepare(`
      SELECT COUNT(DISTINCT file_path) as cnt
      FROM code_symbols WHERE project_id = ?
    `).get(projectId) as DbCountRow | undefined;

    const latest = this.db.prepare(`
      SELECT MAX(indexed_at) as latest
      FROM code_symbols WHERE project_id = ?
    `).get(projectId) as DbLatestRow | undefined;

    const typeMap: Record<string, number> = {};
    for (const row of byType) {
      typeMap[row.symbol_type] = row.cnt;
    }

    return {
      totalSymbols: total?.cnt || 0,
      byType: typeMap,
      filesIndexed: files?.cnt || 0,
      indexedAt: latest?.latest || null,
    };
  }

  /**
   * Clear index for a project
   */
  clearIndex(projectId: string): void {
    this.db.prepare('DELETE FROM code_symbols WHERE project_id = ?').run(projectId);
  }

  private rowToSymbol(row: DbCodeSymbolRow): CodeSymbol {
    return {
      id: row.id,
      projectId: row.project_id,
      filePath: row.file_path,
      symbolName: row.symbol_name,
      symbolType: row.symbol_type,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      signature: row.signature,
      docComment: row.doc_comment,
      parentSymbol: row.parent_symbol,
      contentHash: row.content_hash,
      indexedAt: row.indexed_at,
    };
  }
}
