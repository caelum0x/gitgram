/**
 * Augmented Tools for AITimeMachine MCP
 *
 * Nia-inspired tools for intelligent code indexing, semantic search, and research.
 * These tools extend the basic time machine functionality with AI-powered features.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { glob } from "glob";
import type { Repo } from "../store/repo.js";
import { TimeMachineEngine } from "../core/engine.js";
import type { UnifiedKnowledgeBaseSearchResponse } from "../cloud/sync-client.js";

// Types
interface IndexedSymbol {
  name: string;
  type: "function" | "class" | "method" | "interface" | "type" | "variable" | "constant";
  filePath: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  contentHash: string;
  language: string;
}

interface IndexingResult {
  filesIndexed: number;
  symbolsFound: number;
  errors: string[];
  duration: number;
}

// SearchResult type for internal use - matches the new Augmented Layer format
interface CodeSearchResult {
  file: string;
  symbol: string;
  content: string;
  lineStart: number;
  lineEnd: number;
  score: number;
}

interface RepositoryIndex {
  repositoryId: string;
  name: string;
  path: string;
  branch?: string;
  indexedAt: string;
  fileCount: number;
  symbolCount: number;
}

interface SavedContext {
  contextId: string;
  name: string;
  description?: string;
  projectPath?: string;
  messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// Language-specific patterns for symbol extraction
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?interface\s+(\w+)/g,
    /(?:export\s+)?type\s+(\w+)\s*=/g,
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*:/g,
  ],
  javascript: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g,
  ],
  python: [
    /^(?:async\s+)?def\s+(\w+)/gm,
    /^class\s+(\w+)/gm,
  ],
  go: [
    /^func\s+(?:\([^)]+\)\s+)?(\w+)/gm,
    /^type\s+(\w+)\s+(?:struct|interface)/gm,
  ],
  rust: [
    /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm,
    /^(?:pub\s+)?struct\s+(\w+)/gm,
    /^(?:pub\s+)?trait\s+(\w+)/gm,
    /^(?:pub\s+)?enum\s+(\w+)/gm,
  ],
};

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
};

export class AugmentedTools {
  private engine: TimeMachineEngine;
  private repo: Repo;
  private indexCache: Map<string, IndexedSymbol[]> = new Map();
  private repositoryIndexes: Map<string, RepositoryIndex> = new Map();
  private savedContexts: Map<string, SavedContext> = new Map();

  constructor(engine: TimeMachineEngine, repo: Repo) {
    this.engine = engine;
    this.repo = repo;
  }

  /**
   * Helper to get projectId from projectPath
   */
  private getProjectIdFromPath(projectPath: string): string | null {
    const projects = this.repo.listProjects();
    const project = projects.find(p => p.rootPath === projectPath);
    return project?.projectId || null;
  }

  /**
   * Get tool definitions for MCP registration
   */
  getToolDefinitions() {
    return [
      {
        name: "tm_index_project",
        description: "Index the current project for semantic code search. Extracts functions, classes, and other symbols for quick lookup.",
        inputSchema: {
          type: "object",
          required: ["projectPath"],
          properties: {
            projectPath: { type: "string", minLength: 1, description: "Path to project root" },
            patterns: {
              type: "array",
              items: { type: "string" },
              default: ["**/*.ts", "**/*.js", "**/*.py", "**/*.go", "**/*.rs"],
              description: "Glob patterns for files to index"
            },
            excludePatterns: {
              type: "array",
              items: { type: "string" },
              default: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
              description: "Patterns to exclude"
            },
            incremental: { type: "boolean", default: true, description: "Only index changed files" }
          }
        }
      },
      {
        name: "tm_search_code",
        description: "Search indexed code. Find functions, classes, and code patterns across indexed repositories.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, description: "Search query (supports natural language)" },
            repositoryId: { type: "string", description: "Repository ID to search (from tm_index_repository)" },
            projectPath: { type: "string", description: "Project path (uses current if not specified)" },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100, description: "Maximum results to return" },
            symbolType: {
              type: "string",
              enum: ["function", "class", "interface", "type", "variable", "all"],
              default: "all"
            }
          }
        }
      },
      {
        name: "tm_find_definition",
        description: "Find the definition of a symbol (function, class, variable, etc.)",
        inputSchema: {
          type: "object",
          required: ["symbol"],
          properties: {
            symbol: { type: "string", minLength: 1, description: "Symbol name to find" },
            projectPath: { type: "string", description: "Project path" }
          }
        }
      },
      {
        name: "tm_find_usages",
        description: "Find all usages/references of a symbol across the codebase",
        inputSchema: {
          type: "object",
          required: ["symbol"],
          properties: {
            symbol: { type: "string", minLength: 1, description: "Symbol name to find usages of" },
            projectPath: { type: "string", description: "Project path" },
            maxResults: { type: "integer", default: 50, minimum: 1, maximum: 200 }
          }
        }
      },
      {
        name: "tm_universal_search",
        description: "Search across code, conversation history, and checkpoints. Returns comprehensive results from all sources.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, description: "Search query" },
            projectPath: { type: "string", description: "Project path" },
            sources: {
              type: "array",
              items: { type: "string", enum: ["code", "conversations", "checkpoints", "files"] },
              default: ["code", "conversations", "checkpoints"]
            },
            maxResultsPerSource: { type: "integer", default: 10, minimum: 1, maximum: 50 }
          }
        }
      },
      {
        name: "tm_research",
        description: "Start a research query. Searches code, history, and synthesizes findings into an answer with sources.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1, description: "Research question or topic" },
            projectPath: { type: "string", description: "Project path for context" },
            depth: {
              type: "string",
              enum: ["quick", "deep"],
              default: "quick",
              description: "Research depth - quick for fast results, deep for comprehensive analysis"
            }
          }
        }
      },
      {
        name: "tm_get_context_for_file",
        description: "Get rich context for a file including history, related files, and recent changes",
        inputSchema: {
          type: "object",
          required: ["filePath"],
          properties: {
            filePath: { type: "string", minLength: 1, description: "Path to the file" },
            projectPath: { type: "string", description: "Project root path" },
            includeHistory: { type: "boolean", default: true },
            includeRelated: { type: "boolean", default: true },
            historyLimit: { type: "integer", default: 10 }
          }
        }
      },
      {
        name: "tm_suggest_restore_point",
        description: "Analyze current errors and suggest the best checkpoint to restore to",
        inputSchema: {
          type: "object",
          required: ["errorDescription"],
          properties: {
            errorDescription: { type: "string", minLength: 1, description: "Description of the current error or issue" },
            projectPath: { type: "string", description: "Project path" },
            maxSuggestions: { type: "integer", default: 3, minimum: 1, maximum: 10 }
          }
        }
      },
      // ============================================================================
      // AUGMENTED LAYER MCP TOOLS
      // ============================================================================
      {
        name: "tm_index_repository",
        description: "Index a local or GitHub repository for semantic code search. Creates a searchable index of all symbols.",
        inputSchema: {
          type: "object",
          required: ["path"],
          properties: {
            path: { type: "string", minLength: 1, description: "Path to local repository or GitHub URL (e.g., 'owner/repo')" },
            name: { type: "string", description: "Custom name for this repository index" },
            branch: { type: "string", description: "Git branch to index (default: main/master)" }
          }
        }
      },
      {
        name: "tm_save_context",
        description: "Save the current conversation context for later retrieval. Creates a named snapshot of messages.",
        inputSchema: {
          type: "object",
          required: ["name", "messages"],
          properties: {
            name: { type: "string", minLength: 1, description: "Name for this saved context" },
            description: { type: "string", description: "Optional description of what this context represents" },
            messages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  role: { type: "string", enum: ["user", "assistant", "system"] },
                  content: { type: "string" },
                  timestamp: { type: "string" }
                },
                required: ["role", "content"]
              },
              description: "Array of conversation messages to save"
            }
          }
        }
      },
      {
        name: "tm_load_context",
        description: "Load a previously saved conversation context by ID or name.",
        inputSchema: {
          type: "object",
          properties: {
            contextId: { type: "string", description: "Context ID to load" },
            name: { type: "string", description: "Context name to load (alternative to contextId)" }
          }
        }
      },
      {
        name: "tm_list_contexts",
        description: "List all saved conversation contexts.",
        inputSchema: {
          type: "object",
          properties: {
            projectPath: { type: "string", description: "Filter by project path" },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100, description: "Maximum number of contexts to return" }
          }
        }
      },
      {
        name: "tm_kb_list_repositories",
        description: "List knowledge base repositories stored in the cloud API.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "tm_kb_search",
        description: "Search the cloud knowledge base by query.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1 },
            repositoryId: { type: "string" },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 }
          }
        }
      },
      {
        name: "tm_kb_get_file",
        description: "Fetch a file from the cloud knowledge base.",
        inputSchema: {
          type: "object",
          required: ["repositoryId", "path"],
          properties: {
            repositoryId: { type: "string", minLength: 1 },
            path: { type: "string", minLength: 1 }
          }
        }
      },
      {
        name: "tm_kb_unified_search",
        description: "Unified knowledge base search across files, artifacts, and embeddings.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", minLength: 1 },
            repositoryId: { type: "string" },
            projectId: { type: "string" },
            limit: { type: "integer", default: 20, minimum: 1, maximum: 100 }
          }
        }
      }
    ];
  }

  /**
   * Handle tool calls
   */
  async handleToolCall(toolName: string, args: unknown): Promise<unknown> {
    switch (toolName) {
      case "tm_index_project":
          return this.indexProject(args as { projectPath: string; patterns?: string[]; excludePatterns?: string[]; incremental?: boolean });
      case "tm_search_code":
          return this.searchCode(args as { query: string; repositoryId?: string; projectPath?: string; limit?: number; symbolType?: "function" | "class" | "interface" | "type" | "variable" | "all" });
      case "tm_find_definition":
          return this.findDefinition(args as { symbol: string; projectPath?: string });
      case "tm_find_usages":
          return this.findUsages(args as { symbol: string; projectPath?: string; maxResults?: number });
      case "tm_universal_search":
          return this.universalSearch(args as {
            query: string;
            projectPath?: string;
            sources?: Array<"code" | "conversations" | "checkpoints">;
            maxResultsPerSource?: number;
          });
      case "tm_research":
          return this.research(args as { query: string; projectPath?: string; depth?: "quick" | "deep" });
      case "tm_get_context_for_file":
          return this.getContextForFile(args as { filePath: string; projectPath?: string; includeHistory?: boolean; includeRelated?: boolean; historyLimit?: number });
      case "tm_suggest_restore_point":
          return this.suggestRestorePoint(args as { errorDescription: string; projectPath?: string; maxSuggestions?: number });
      case "tm_index_repository":
          return this.indexRepository(args as { path: string; name?: string; branch?: string });
      case "tm_save_context":
          return this.saveContext(args as { name: string; description?: string; messages: SavedContext["messages"] });
      case "tm_load_context":
          return this.loadContext(args as { contextId?: string; name?: string });
      case "tm_list_contexts":
          return this.listContexts(args as { limit?: number });
      case "tm_kb_list_repositories":
        return this.kbListRepositories();
      case "tm_kb_search":
          return this.kbSearch(args as { query: string; repositoryId?: string; limit?: number });
      case "tm_kb_get_file":
          return this.kbGetFile(args as { repositoryId: string; path: string });
      case "tm_kb_unified_search":
          return this.kbUnifiedSearch(args as { query: string; repositoryId?: string; projectId?: string; limit?: number });
      default:
        throw new Error(`Unknown augmented tool: ${toolName}`);
    }
  }

  /**
   * Index a project for code search
   */
  async indexProject(args: {
    projectPath: string;
    patterns?: string[];
    excludePatterns?: string[];
    incremental?: boolean;
  }): Promise<IndexingResult> {
    const startTime = Date.now();
    const patterns = args.patterns || ["**/*.ts", "**/*.js", "**/*.py", "**/*.go", "**/*.rs"];
    const excludePatterns = args.excludePatterns || ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"];

    const result: IndexingResult = {
      filesIndexed: 0,
      symbolsFound: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Find all matching files
      const files: string[] = [];
      for (const pattern of patterns) {
        const matches = await glob(pattern, {
          cwd: args.projectPath,
          ignore: excludePatterns,
          absolute: true,
        });
        files.push(...matches);
      }

      // Index each file
      for (const filePath of files) {
        try {
          const symbols = await this.indexFile(filePath, args.projectPath);
          this.indexCache.set(filePath, symbols);
          result.filesIndexed++;
          result.symbolsFound += symbols.length;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          result.errors.push(`Error indexing ${filePath}: ${message}`);
        }
      }

      result.duration = Date.now() - startTime;
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Indexing failed: ${message}`);
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Index a single file and extract symbols
   */
  private async indexFile(filePath: string, projectRoot: string): Promise<IndexedSymbol[]> {
    const ext = path.extname(filePath);
    const language = LANGUAGE_EXTENSIONS[ext];
    if (!language) return [];

    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relativePath = path.relative(projectRoot, filePath);
    const symbols: IndexedSymbol[] = [];
    const patterns = LANGUAGE_PATTERNS[language] || [];

    for (const pattern of patterns) {
      let match;
      // Reset regex lastIndex
      pattern.lastIndex = 0;

      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (!name || name.length < 2) continue;

        // Skip common non-symbol matches
        if (["if", "for", "while", "switch", "catch", "with", "return"].includes(name)) continue;

        const lineStart = this.getLineNumber(content, match.index);
        const lineEnd = this.findBlockEnd(lines, lineStart, language);
        const symbolContent = lines.slice(lineStart, lineEnd + 1).join("\n");
        const contentHash = crypto.createHash("sha256").update(symbolContent).digest("hex").slice(0, 16);

        // Determine symbol type from match
        const matchStr = match[0].toLowerCase();
        let type: IndexedSymbol["type"] = "function";
        if (matchStr.includes("class")) type = "class";
        else if (matchStr.includes("interface")) type = "interface";
        else if (matchStr.includes("type ")) type = "type";
        else if (matchStr.includes("const") || matchStr.includes("let") || matchStr.includes("var")) type = "variable";

        symbols.push({
          name,
          type,
          filePath: relativePath,
          lineStart,
          lineEnd,
          content: symbolContent,
          contentHash,
          language,
        });
      }
    }

    return symbols;
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split("\n").length - 1;
  }

  private findBlockEnd(lines: string[], startLine: number, language: string): number {
    if (language === "python") {
      // Python uses indentation
      const startIndent = lines[startLine]?.match(/^(\s*)/)?.[1].length || 0;
      for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") continue;
        const indent = line.match(/^(\s*)/)?.[1].length || 0;
        if (indent <= startIndent && line.trim() !== "") {
          return i - 1;
        }
      }
      return lines.length - 1;
    } else {
      // Brace-based languages
      let braceCount = 0;
      let started = false;
      for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
          if (char === "{") {
            braceCount++;
            started = true;
          } else if (char === "}") {
            braceCount--;
          }
        }
        if (started && braceCount === 0) {
          return i;
        }
      }
      return Math.min(startLine + 50, lines.length - 1);
    }
  }

  /**
   * Search code using indexed symbols
   * Returns results matching the Augmented Layer format: { file, symbol, content, lineStart, lineEnd, score }
   */
  async searchCode(args: {
    query: string;
    repositoryId?: string;
    projectPath?: string;
    symbolType?: string;
    limit?: number;
    maxResults?: number;  // backward compatibility
  }): Promise<Array<{ file: string; symbol: string; content: string; lineStart: number; lineEnd: number; score: number }>> {
    const maxResults = args.limit || args.maxResults || 20;
    const query = args.query.toLowerCase();
    const results: Array<{ file: string; symbol: string; content: string; lineStart: number; lineEnd: number; score: number }> = [];

    // Search through indexed symbols
    for (const [filePath, symbols] of this.indexCache) {
      for (const symbol of symbols) {
        // Filter by type if specified
        if (args.symbolType && args.symbolType !== "all" && symbol.type !== args.symbolType) {
          continue;
        }

        // Calculate relevance score
        let score = 0;
        const symbolLower = symbol.name.toLowerCase();
        const contentLower = symbol.content.toLowerCase();

        // Exact name match
        if (symbolLower === query) {
          score = 100;
        } else if (symbolLower.startsWith(query)) {
          score = 80;
        } else if (symbolLower.includes(query)) {
          score = 60;
        } else if (contentLower.includes(query)) {
          score = 40;
        } else {
          continue; // No match
        }

        results.push({
          file: symbol.filePath,
          symbol: symbol.name,
          content: symbol.content.slice(0, 500),
          lineStart: symbol.lineStart,
          lineEnd: symbol.lineEnd,
          score,
        });
      }
    }

    // Sort by score and limit results
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  /**
   * Find definition of a symbol
   */
  async findDefinition(args: {
    symbol: string;
    projectPath?: string;
  }): Promise<{ found: boolean; definition?: IndexedSymbol; alternatives?: IndexedSymbol[] }> {
    const symbolLower = args.symbol.toLowerCase();
    const exactMatches: IndexedSymbol[] = [];
    const partialMatches: IndexedSymbol[] = [];

    for (const [, symbols] of this.indexCache) {
      for (const symbol of symbols) {
        if (symbol.name.toLowerCase() === symbolLower) {
          exactMatches.push(symbol);
        } else if (symbol.name.toLowerCase().includes(symbolLower)) {
          partialMatches.push(symbol);
        }
      }
    }

    if (exactMatches.length > 0) {
      return {
        found: true,
        definition: exactMatches[0],
        alternatives: exactMatches.slice(1).concat(partialMatches.slice(0, 3)),
      };
    } else if (partialMatches.length > 0) {
      return {
        found: false,
        alternatives: partialMatches.slice(0, 5),
      };
    }

    return { found: false };
  }

  /**
   * Find all usages of a symbol
   */
  async findUsages(args: {
    symbol: string;
    projectPath?: string;
    maxResults?: number;
  }): Promise<Array<{ filePath: string; line: number; context: string }>> {
    const maxResults = args.maxResults || 50;
    const usages: Array<{ filePath: string; line: number; context: string }> = [];
    const searchTerm = args.symbol;

    // Search through all indexed content
    for (const [filePath, symbols] of this.indexCache) {
      for (const symbol of symbols) {
        if (symbol.content.includes(searchTerm)) {
          const lines = symbol.content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(searchTerm)) {
              usages.push({
                filePath: symbol.filePath,
                line: symbol.lineStart + i,
                context: lines[i].trim().slice(0, 100),
              });
              if (usages.length >= maxResults) break;
            }
          }
        }
        if (usages.length >= maxResults) break;
      }
      if (usages.length >= maxResults) break;
    }

    return usages;
  }

  /**
   * Universal search across all sources (code, conversations, checkpoints)
   * Returns combined results with type, content, score
   */
  async universalSearch(args: {
    query: string;
    projectPath?: string;
    sources?: Array<"code" | "conversations" | "checkpoints">;
    maxResultsPerSource?: number;
  }): Promise<Array<{ type: string; content: string; score: number; source?: string }>> {
    const sources = args.sources || ["code", "conversations", "checkpoints"];
    const maxPerSource = args.maxResultsPerSource || 10;
    const combinedResults: Array<{ type: string; content: string; score: number; source?: string }> = [];

    // Search code
    if (sources.includes("code")) {
      const codeResults = await this.searchCode({
        query: args.query,
        projectPath: args.projectPath,
        limit: maxPerSource,
      });
      for (const result of codeResults) {
        combinedResults.push({
          type: "code",
          content: `${result.symbol} in ${result.file}:${result.lineStart}\n${result.content.slice(0, 200)}`,
          score: result.score / 100,
          source: result.file,
        });
      }
    }

    // Search checkpoints (through repo)
    if (sources.includes("checkpoints") && args.projectPath) {
      try {
        const projectId = this.getProjectIdFromPath(args.projectPath);
        if (projectId) {
          const checkpoints = this.repo.searchCheckpoints(projectId, args.query);
          for (const cp of checkpoints.slice(0, maxPerSource)) {
            combinedResults.push({
              type: "checkpoint",
              content: `${cp.name} (${cp.createdAt})`,
              score: 0.7,
              source: `checkpoint:${cp.checkpointId}`,
            });
          }
        }
      } catch {}
    }

    // Search conversations
    if (sources.includes("conversations") && args.projectPath) {
      try {
        const projectId = this.getProjectIdFromPath(args.projectPath);
        if (projectId) {
          const events = this.repo.listEvents(projectId, "chat.message", 500);
          const messages = events
            .filter((e) => {
              const payload = this.toRecord(e.payload);
              const content = typeof payload?.content === "string" ? payload.content : "";
              return content.toLowerCase().includes(args.query.toLowerCase());
            })
            .slice(0, maxPerSource);
          for (const e of messages) {
            const payload = this.toRecord(e.payload);
            const role = typeof payload?.role === "string" ? payload.role : "unknown";
            const content = typeof payload?.content === "string" ? payload.content : "";
            combinedResults.push({
              type: "conversation",
              content: `[${role}] ${content.slice(0, 200)}`,
              score: 0.6,
              source: "chat_history",
            });
          }
        }
      } catch {}
    }

    // Sort by score descending
    combinedResults.sort((a, b) => b.score - a.score);

    return combinedResults;
  }

  /**
   * Start a research query (simple version)
   * Returns { answer, sources, confidence }
   */
  async research(args: {
    query: string;
    projectPath?: string;
    depth?: "quick" | "deep";
  }): Promise<{ answer: string; sources: Array<{ type: string; location: string; relevance: number }>; confidence: number }> {
    const depth = args.depth || "quick";
    const sources: Array<{ type: string; location: string; relevance: number }> = [];

    // Search code for relevant symbols
    const codeResults = await this.searchCode({
      query: args.query,
      projectPath: args.projectPath,
      limit: depth === "deep" ? 30 : 10,
    });

    for (const result of codeResults) {
      sources.push({
        type: "code",
        location: `${result.file}:${result.lineStart}`,
        relevance: result.score / 100,
      });
    }

    // For deep research, also search history
    if (depth === "deep" && args.projectPath) {
      const universalResults = await this.universalSearch({
        query: args.query,
        projectPath: args.projectPath,
        sources: ["checkpoints", "conversations"],
        maxResultsPerSource: 20,
      });

      // universalResults is now an array of combined results
      for (const result of universalResults) {
        if (result.type === "checkpoint" || result.type === "conversation") {
          sources.push({
            type: result.type,
            location: result.source || result.type,
            relevance: result.score,
          });
        }
      }
    }

    // Generate answer
    let answer = `Research on "${args.query}":\n\n`;

    if (sources.length === 0) {
      answer += "No relevant findings in the codebase.";
    } else {
      const codeSources = sources.filter(s => s.type === "code");
      const historySources = sources.filter(s => s.type !== "code");

      if (codeSources.length > 0) {
        answer += `Found ${codeSources.length} code references. `;
        const topLocations = codeSources.slice(0, 3).map(s => s.location).join(", ");
        answer += `Key locations: ${topLocations}. `;
      }

      if (historySources.length > 0) {
        answer += `Found ${historySources.length} references in project history.`;
      }
    }

    // Calculate confidence based on number of sources and their relevance
    const avgRelevance = sources.length > 0
      ? sources.reduce((sum, s) => sum + s.relevance, 0) / sources.length
      : 0;
    const confidence = Math.min(1, avgRelevance * (sources.length > 5 ? 1.2 : sources.length > 0 ? 0.8 : 0.1));

    return {
      answer,
      sources,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /**
   * Get rich context for a file
   */
  async getContextForFile(args: {
    filePath: string;
    projectPath?: string;
    includeHistory?: boolean;
    includeRelated?: boolean;
    historyLimit?: number;
  }): Promise<{
    file: { path: string; exists: boolean; language?: string };
    symbols: IndexedSymbol[];
    history: Array<{ checkpointId: string; name: string; timestamp: string }>;
    relatedFiles: string[];
  }> {
    const projectPath = args.projectPath || process.cwd();
    const fullPath = path.isAbsolute(args.filePath) ? args.filePath : path.join(projectPath, args.filePath);
    const relativePath = path.relative(projectPath, fullPath);
    const ext = path.extname(fullPath);

    const result: {
      file: { path: string; exists: boolean; language?: string };
      symbols: IndexedSymbol[];
      history: Array<{ checkpointId: string; name: string; timestamp: string }>;
      relatedFiles: string[];
    } = {
      file: {
        path: relativePath,
        exists: fs.existsSync(fullPath),
        language: LANGUAGE_EXTENSIONS[ext],
      },
      symbols: [],
      history: [],
      relatedFiles: [],
    };

    // Get symbols from cache or index
    if (result.file.exists) {
      const cached = this.indexCache.get(fullPath);
      if (cached) {
        result.symbols = cached;
      } else {
        result.symbols = await this.indexFile(fullPath, projectPath);
        this.indexCache.set(fullPath, result.symbols);
      }
    }

    // Get file history from checkpoints
    if (args.includeHistory !== false && args.projectPath) {
      try {
        const projectId = this.getProjectIdFromPath(args.projectPath);
        if (projectId) {
          // Get recent checkpoints that might contain this file
          const checkpoints = this.repo.listCheckpointsNewestFirst(projectId, args.historyLimit || 10);
          result.history = checkpoints.map(cp => ({
            checkpointId: cp.checkpointId,
            name: cp.name,
            timestamp: cp.createdAt,
          }));
        }
      } catch {}
    }

    // Find related files (files that import this file or are imported by it)
    if (args.includeRelated !== false && result.file.exists) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const imports = content.match(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g) || [];
      result.relatedFiles = imports
        .map((imp: string) => {
          const match = imp.match(/['"]([^'"]+)['"]/);
          return match ? match[1] : null;
        })
        .filter((value): value is string => value !== null)
        .slice(0, 10);
    }

    return result;
  }

  /**
   * Suggest restore points based on error description
   */
  async suggestRestorePoint(args: {
    errorDescription: string;
    projectPath?: string;
    maxSuggestions?: number;
  }): Promise<{
    suggestions: Array<{
      checkpointId: string;
      name: string;
      timestamp: string;
      confidence: number;
      reason: string;
    }>;
    analysis: string;
  }> {
    const projectPath = args.projectPath || process.cwd();
    const maxSuggestions = args.maxSuggestions || 3;
    const errorLower = args.errorDescription.toLowerCase();

    const suggestions: Array<{
      checkpointId: string;
      name: string;
      timestamp: string;
      confidence: number;
      reason: string;
    }> = [];

    try {
      const projectId = this.getProjectIdFromPath(projectPath);
      if (!projectId) {
        return {
          suggestions: [],
          analysis: "Project not found. No restore points available.",
        };
      }
      const checkpoints = this.repo.listCheckpointsNewestFirst(projectId, 50);

      for (const cp of checkpoints) {
        let confidence = 0;
        let reason = "";
        const cpName = cp.name.toLowerCase();

        // Check for test/build success indicators
        if (cpName.includes("test") && (cpName.includes("pass") || cpName.includes("green"))) {
          confidence = 90;
          reason = "Tests were passing at this checkpoint";
        } else if (cpName.includes("build") && (cpName.includes("success") || cpName.includes("green"))) {
          confidence = 85;
          reason = "Build was successful at this checkpoint";
        } else if (cpName.includes("before") && cpName.includes(errorLower.split(" ")[0])) {
          confidence = 80;
          reason = "Checkpoint created before related changes";
        } else if (cpName.includes("fix") || cpName.includes("working")) {
          confidence = 70;
          reason = "Checkpoint indicates working state";
        } else if (!cpName.includes("fail") && !cpName.includes("error") && !cpName.includes("broke")) {
          confidence = 40;
          reason = "No failure indicators in checkpoint name";
        }

        if (confidence > 30) {
          suggestions.push({
            checkpointId: cp.checkpointId,
            name: cp.name,
            timestamp: cp.createdAt,
            confidence,
            reason,
          });
        }
      }

      // Sort by confidence and limit
      suggestions.sort((a, b) => b.confidence - a.confidence);
      suggestions.splice(maxSuggestions);

    } catch {}

    const analysis = suggestions.length > 0
      ? `Found ${suggestions.length} potential restore points. Highest confidence: ${suggestions[0]?.name || "N/A"} (${suggestions[0]?.confidence || 0}%)`
      : "No suitable restore points found. Consider checking older checkpoints manually.";

    return { suggestions, analysis };
  }

  // ============================================================================
  // AUGMENTED LAYER MCP TOOLS - Implementation
  // ============================================================================

  /**
   * Index a local or GitHub repository
   */
  async indexRepository(args: {
    path: string;
    name?: string;
    branch?: string;
  }): Promise<{ repositoryId: string; status: string; message: string }> {
    const repoPath = args.path;
    const repositoryId = crypto.createHash("sha256").update(repoPath).digest("hex").slice(0, 16);
    const name = args.name || path.basename(repoPath);

    // Check if it's a GitHub URL or local path
    const isGitHubUrl = repoPath.includes("github.com") || /^[\w-]+\/[\w-]+$/.test(repoPath);

    if (isGitHubUrl) {
      // For GitHub URLs, we would clone to a temp directory
      // For now, return a message indicating this needs git clone
      return {
        repositoryId,
        status: "pending",
        message: `GitHub repository indexing requires cloning. Path: ${repoPath}. Use a local path after cloning.`,
      };
    }

    // Index local repository
    if (!fs.existsSync(repoPath)) {
      return {
        repositoryId,
        status: "error",
        message: `Repository path does not exist: ${repoPath}`,
      };
    }

    // Use existing indexProject method
    const result = await this.indexProject({
      projectPath: repoPath,
      patterns: ["**/*.ts", "**/*.js", "**/*.py", "**/*.go", "**/*.rs", "**/*.java"],
      excludePatterns: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/target/**"],
    });

    // Store the repository index metadata
    const repoIndex: RepositoryIndex = {
      repositoryId,
      name,
      path: repoPath,
      branch: args.branch,
      indexedAt: new Date().toISOString(),
      fileCount: result.filesIndexed,
      symbolCount: result.symbolsFound,
    };
    this.repositoryIndexes.set(repositoryId, repoIndex);

    return {
      repositoryId,
      status: result.errors.length > 0 ? "partial" : "success",
      message: `Indexed ${result.filesIndexed} files with ${result.symbolsFound} symbols in ${result.duration}ms. ${result.errors.length > 0 ? `Errors: ${result.errors.length}` : ""}`,
    };
  }

  /**
   * Save current conversation context
   */
  async saveContext(args: {
    name: string;
    description?: string;
    messages: Array<{ role: string; content: string; timestamp?: string }>;
  }): Promise<{ contextId: string; saved: boolean }> {
    const contextId = `ctx_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const now = new Date().toISOString();

    const context: SavedContext = {
      contextId,
      name: args.name,
      description: args.description,
      messages: args.messages,
      createdAt: now,
      updatedAt: now,
    };

    this.savedContexts.set(contextId, context);

    // Also try to persist to disk
    try {
      const contextsDir = path.join(process.cwd(), ".aitm", "contexts");
      fs.mkdirSync(contextsDir, { recursive: true });
      fs.writeFileSync(
        path.join(contextsDir, `${contextId}.json`),
        JSON.stringify(context, null, 2)
      );
    } catch {
      // Disk persistence is optional
    }

    return { contextId, saved: true };
  }

  /**
   * Load a saved context
   */
  async loadContext(args: {
    contextId?: string;
    name?: string;
  }): Promise<SavedContext | { error: string }> {
    // Try to find by contextId first
    if (args.contextId) {
      const context = this.savedContexts.get(args.contextId);
      if (context) {
        return context;
      }

      // Try loading from disk
      try {
        const contextPath = path.join(process.cwd(), ".aitm", "contexts", `${args.contextId}.json`);
        if (fs.existsSync(contextPath)) {
          const data = JSON.parse(fs.readFileSync(contextPath, "utf-8"));
          this.savedContexts.set(args.contextId, data);
          return data;
        }
      } catch {
        // Continue to name search
      }
    }

    // Try to find by name
    if (args.name) {
      for (const context of this.savedContexts.values()) {
        if (context.name === args.name) {
          return context;
        }
      }

      // Try loading from disk by name
      try {
        const contextsDir = path.join(process.cwd(), ".aitm", "contexts");
        if (fs.existsSync(contextsDir)) {
          const files = fs.readdirSync(contextsDir);
          for (const file of files) {
            if (file.endsWith(".json")) {
              const data = JSON.parse(fs.readFileSync(path.join(contextsDir, file), "utf-8"));
              if (data.name === args.name) {
                this.savedContexts.set(data.contextId, data);
                return data;
              }
            }
          }
        }
      } catch {
        // Context not found
      }
    }

    return { error: "Context not found. Provide either contextId or name." };
  }

  /**
   * List all saved contexts
   */
  async listContexts(args: {
    projectPath?: string;
    limit?: number;
  }): Promise<Array<{ contextId: string; name: string; description?: string; messageCount: number; createdAt: string }>> {
    const limit = args.limit || 20;
    const contexts: Array<{ contextId: string; name: string; description?: string; messageCount: number; createdAt: string }> = [];

    // Load from memory
    for (const context of this.savedContexts.values()) {
      if (args.projectPath && context.projectPath !== args.projectPath) {
        continue;
      }
      contexts.push({
        contextId: context.contextId,
        name: context.name,
        description: context.description,
        messageCount: context.messages.length,
        createdAt: context.createdAt,
      });
    }

    // Also load from disk
    try {
      const contextsDir = path.join(process.cwd(), ".aitm", "contexts");
      if (fs.existsSync(contextsDir)) {
        const files = fs.readdirSync(contextsDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            try {
              const data = JSON.parse(fs.readFileSync(path.join(contextsDir, file), "utf-8"));
              // Skip if already in memory
              if (this.savedContexts.has(data.contextId)) {
                continue;
              }
              if (args.projectPath && data.projectPath !== args.projectPath) {
                continue;
              }
              contexts.push({
                contextId: data.contextId,
                name: data.name,
                description: data.description,
                messageCount: data.messages?.length || 0,
                createdAt: data.createdAt,
              });
              // Also cache in memory
              this.savedContexts.set(data.contextId, data);
            } catch {
              // Skip invalid files
            }
          }
        }
      }
    } catch {
      // Disk read is optional
    }

    // Sort by createdAt descending and limit
    contexts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return contexts.slice(0, limit);
  }

  private async getCloudClient() {
    const { createCloudSyncClient } = await import("../cloud/sync-client.js");
    const client = createCloudSyncClient();
    if (!client) {
      throw new Error("Cloud API not configured. Set AITM_API_URL and AITM_API_KEY.");
    }
    return client;
  }

  /**
   * List knowledge base repositories
   */
  async kbListRepositories(): Promise<Record<string, unknown>> {
    const client = await this.getCloudClient();
    return client.listKnowledgeBaseRepositories();
  }

  /**
   * Search knowledge base
   */
  async kbSearch(args: { query: string; repositoryId?: string; limit?: number }): Promise<Record<string, unknown>> {
    const client = await this.getCloudClient();
    return client.searchKnowledgeBase(args.query, {
      repositoryId: args.repositoryId,
      limit: args.limit,
    });
  }

  /**
   * Get a knowledge base file
   */
  async kbGetFile(args: { repositoryId: string; path: string }): Promise<Record<string, unknown>> {
    const client = await this.getCloudClient();
    return client.getKnowledgeBaseFile(args.repositoryId, args.path);
  }

  /**
   * Unified knowledge base search
   */
  async kbUnifiedSearch(args: {
    query: string;
    repositoryId?: string;
    projectId?: string;
    limit?: number;
  }): Promise<UnifiedKnowledgeBaseSearchResponse> {
    const client = await this.getCloudClient();
    return client.unifiedKnowledgeBaseSearch(args.query, {
      repositoryId: args.repositoryId,
      projectId: args.projectId,
      limit: args.limit,
    });
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") return null;
    return value as Record<string, unknown>;
  }
}

export function createAugmentedTools(engine: TimeMachineEngine, repo: Repo): AugmentedTools {
  return new AugmentedTools(engine, repo);
}
