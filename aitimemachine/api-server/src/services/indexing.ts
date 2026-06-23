/**
 * Code Indexing Service
 *
 * Provides code indexing and semantic search capabilities:
 * - File parsing and symbol extraction
 * - Embedding generation for semantic search
 * - Incremental indexing with change detection
 * - Repository-wide code understanding
 */

import { db, schema } from "../db/index.js";
import { eq, and, inArray } from "drizzle-orm";
import crypto from "crypto";
import { getEmbeddingService, EmbeddingService } from "./embeddings.js";
import { upsertKnowledgeFile } from "./knowledgeBase.js";
import { logger } from "../lib/monitoring.js";

// Symbol types we can extract
export type SymbolType =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "variable"
  | "constant"
  | "enum"
  | "module"
  | "import"
  | "export";

export interface ExtractedSymbol {
  name: string;
  type: SymbolType;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  language: string;
  signature?: string;
  docstring?: string;
  dependencies?: string[];
}

export interface IndexingJob {
  repositoryId: string;
  projectId: string;
  userId: string;
  status: "pending" | "indexing" | "completed" | "failed";
  progress: number;
  filesTotal: number;
  filesIndexed: number;
  symbolsExtracted: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface IndexingOptions {
  forceReindex?: boolean;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number;
  generateEmbeddings?: boolean;
  persistContent?: boolean;
  source?: "local" | "git";
}

// Language detection based on file extension
const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".rb": "ruby",
  ".php": "php",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".vue": "vue",
  ".svelte": "svelte",
};

// Patterns for symbol extraction by language
const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?interface\s+(\w+)/g,
    /(?:export\s+)?type\s+(\w+)/g,
    /(?:export\s+)?const\s+(\w+)/g,
    /(?:export\s+)?enum\s+(\w+)/g,
  ],
  javascript: [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?const\s+(\w+)/g,
  ],
  python: [
    /def\s+(\w+)/g,
    /class\s+(\w+)/g,
    /(\w+)\s*=\s*(?:lambda|def)/g,
  ],
  rust: [
    /(?:pub\s+)?fn\s+(\w+)/g,
    /(?:pub\s+)?struct\s+(\w+)/g,
    /(?:pub\s+)?enum\s+(\w+)/g,
    /(?:pub\s+)?trait\s+(\w+)/g,
    /(?:pub\s+)?impl(?:<[^>]+>)?\s+(\w+)/g,
  ],
  go: [
    /func\s+(?:\([^)]+\)\s+)?(\w+)/g,
    /type\s+(\w+)\s+struct/g,
    /type\s+(\w+)\s+interface/g,
  ],
};

/**
 * Code Indexing Service
 */
export class IndexingService {
  private embeddingProvider?: EmbeddingProvider;
  private embeddingService: EmbeddingService;

  constructor(embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider;
    this.embeddingService = getEmbeddingService();
  }

  /**
   * Start indexing a repository
   */
  async indexRepository(
    repositoryId: string,
    files: Array<{ path: string; content: string }>,
    options: IndexingOptions = {}
  ): Promise<IndexingJob> {
    // Get repository info
    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, repositoryId))
      .limit(1);

    if (!repo) {
      throw new Error(`Repository not found: ${repositoryId}`);
    }

    // Update repository status
    await db
      .update(schema.repositories)
      .set({ indexStatus: "indexing", updatedAt: new Date() })
      .where(eq(schema.repositories.id, repositoryId));

    const job: IndexingJob = {
      repositoryId,
      projectId: repo.projectId,
      userId: repo.userId,
      status: "indexing",
      progress: 0,
      filesTotal: files.length,
      filesIndexed: 0,
      symbolsExtracted: 0,
      startedAt: new Date(),
    };

    try {
      // Process files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Check file size limit
        if (options.maxFileSize && file.content.length > options.maxFileSize) {
          continue;
        }

        // Check if file needs reindexing
        const contentHash = this.hashContent(file.content);

        if (!options.forceReindex) {
          const [existingFile] = await db
            .select()
            .from(schema.indexedFiles)
            .where(
              and(
                eq(schema.indexedFiles.repositoryId, repositoryId),
                eq(schema.indexedFiles.filePath, file.path),
                eq(schema.indexedFiles.fileHash, contentHash)
              )
            )
            .limit(1);

          if (existingFile) {
            job.filesIndexed++;
            job.progress = Math.round((job.filesIndexed / job.filesTotal) * 100);
            continue;
          }
        }

        // Extract symbols
        const language = this.detectLanguage(file.path);
        const symbols = this.extractSymbols(file.content, file.path, language);

        // Delete old embeddings for this file
        await db
          .delete(schema.codeEmbeddings)
          .where(
            and(
              eq(schema.codeEmbeddings.repositoryId, repositoryId),
              eq(schema.codeEmbeddings.filePath, file.path)
            )
          );

        // Store symbols with embeddings
        for (const symbol of symbols) {
          // Generate embedding for the symbol content if enabled
          let embeddingJson: number[] | null = null;
          if (options.generateEmbeddings !== false) {
            try {
              const embeddingText = `${symbol.type} ${symbol.name}: ${symbol.content}`;
              const result = await this.embeddingService.generateEmbedding(embeddingText);
              embeddingJson = result.embedding;
            } catch (error) {
              // Log but don't fail - embedding is optional
              logger.warn("Failed to generate embedding for symbol", { symbolName: symbol.name, details: String(error) });
            }
          }

          // Let the database generate the UUID with defaultRandom()
          await db.insert(schema.codeEmbeddings).values({
            repositoryId,
            projectId: repo.projectId,
            userId: repo.userId,
            filePath: symbol.filePath,
            symbol: symbol.name,
            symbolType: symbol.type,
            content: symbol.content,
            contentHash: this.hashContent(symbol.content),
            embeddingJson,
            lineStart: symbol.lineStart,
            lineEnd: symbol.lineEnd,
            language: symbol.language,
          });

          job.symbolsExtracted++;
        }

        // Update or insert indexed file record
        const lines = file.content.split("\n").length;

        // Try to find existing record
        const [existingFile] = await db
          .select()
          .from(schema.indexedFiles)
          .where(
            and(
              eq(schema.indexedFiles.repositoryId, repositoryId),
              eq(schema.indexedFiles.filePath, file.path)
            )
          )
          .limit(1);

        if (existingFile) {
          await db
            .update(schema.indexedFiles)
            .set({
              fileHash: contentHash,
              lastIndexedAt: new Date(),
              symbolCount: symbols.length,
              lineCount: lines,
              language,
            })
            .where(eq(schema.indexedFiles.id, existingFile.id));
        } else {
          // Let the database generate the UUID with defaultRandom()
          await db.insert(schema.indexedFiles).values({
            repositoryId,
            filePath: file.path,
            fileHash: contentHash,
            lastIndexedAt: new Date(),
            symbolCount: symbols.length,
            lineCount: lines,
            language,
          });
        }

        if (options.persistContent) {
          try {
            await upsertKnowledgeFile({
              repositoryId,
              projectId: repo.projectId,
              userId: repo.userId,
              filePath: file.path,
              content: file.content,
              language,
              source: options.source || "local",
              storage: "db",
            });
          } catch {
            // Best-effort persistence
          }
        }

        job.filesIndexed++;
        job.progress = Math.round((job.filesIndexed / job.filesTotal) * 100);
      }

      // Update repository status
      await db
        .update(schema.repositories)
        .set({
          indexStatus: "completed",
          lastIndexedAt: new Date(),
          fileCount: job.filesIndexed,
          symbolCount: job.symbolsExtracted,
          updatedAt: new Date(),
        })
        .where(eq(schema.repositories.id, repositoryId));

      job.status = "completed";
      job.completedAt = new Date();
    } catch (error) {
      // Update repository status on failure
      await db
        .update(schema.repositories)
        .set({ indexStatus: "failed", updatedAt: new Date() })
        .where(eq(schema.repositories.id, repositoryId));

      job.status = "failed";
      job.error = (error as Error).message;
    }

    return job;
  }

  /**
   * Search indexed code by keyword or semantic query
   */
  async searchCode(
    userId: string,
    query: string,
    options: {
      repositoryId?: string;
      projectId?: string;
      symbolType?: SymbolType;
      language?: string;
      limit?: number;
      semantic?: boolean; // Use semantic search with embeddings
    } = {}
  ): Promise<
    Array<{
      id: string;
      filePath: string;
      symbol: string | null;
      symbolType: string | null;
      content: string;
      lineStart: number | null;
      lineEnd: number | null;
      language: string | null;
      score: number;
    }>
  > {
    const limit = options.limit || 20;
    const useSemantic = options.semantic !== false; // Default to semantic search

    // Build query conditions
    const conditions = [eq(schema.codeEmbeddings.userId, userId)];

    if (options.repositoryId) {
      conditions.push(eq(schema.codeEmbeddings.repositoryId, options.repositoryId));
    }
    if (options.projectId) {
      conditions.push(eq(schema.codeEmbeddings.projectId, options.projectId));
    }
    if (options.symbolType) {
      conditions.push(eq(schema.codeEmbeddings.symbolType, options.symbolType));
    }
    if (options.language) {
      conditions.push(eq(schema.codeEmbeddings.language, options.language));
    }

    // Get all embeddings matching conditions
    const embeddings = await db
      .select()
      .from(schema.codeEmbeddings)
      .where(and(...conditions))
      .limit(1000); // Get more for scoring

    // Try semantic search first if enabled
    if (useSemantic) {
      const embeddingsWithVectors = embeddings.filter(
        (emb: any) => emb.embeddingJson && Array.isArray(emb.embeddingJson)
      );

      if (embeddingsWithVectors.length > 0) {
        try {
          // Generate query embedding
          const queryEmbedding = await this.embeddingService.generateEmbedding(query);

          // Calculate semantic similarity scores
          const semanticScored = embeddingsWithVectors
            .map((emb: any) => {
              const similarity = this.embeddingService.cosineSimilarity(
                queryEmbedding.embedding,
                emb.embeddingJson as number[]
              );

              // Combine semantic score with text matching for hybrid ranking
              let textBoost = 0;
              const queryLower = query.toLowerCase();

              // Exact symbol name match bonus
              if (emb.symbol?.toLowerCase() === queryLower) {
                textBoost = 0.3;
              } else if (emb.symbol?.toLowerCase().includes(queryLower)) {
                textBoost = 0.15;
              }

              return {
                ...emb,
                score: Math.min(1, similarity + textBoost), // Cap at 1.0
              };
            })
            .filter((r: any) => r.score > 0.2) // Minimum similarity threshold
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, limit);

          if (semanticScored.length > 0) {
            return semanticScored;
          }
        } catch (error) {
          logger.warn("Semantic search failed, falling back to text search", { details: String(error) });
        }
      }
    }

    // Fall back to text-based search
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const scored = embeddings
      .map((emb: any) => {
        let score = 0;

        // Exact symbol name match
        if (emb.symbol?.toLowerCase() === queryLower) {
          score += 10;
        }
        // Symbol name contains query
        else if (emb.symbol?.toLowerCase().includes(queryLower)) {
          score += 5;
        }
        // Query contains symbol name
        else if (emb.symbol && queryLower.includes(emb.symbol.toLowerCase())) {
          score += 3;
        }

        // Content matching
        const contentLower = emb.content.toLowerCase();
        for (const term of queryTerms) {
          if (contentLower.includes(term)) {
            score += 1;
          }
        }

        // File path matching
        if (emb.filePath.toLowerCase().includes(queryLower)) {
          score += 2;
        }

        return { ...emb, score };
      })
      .filter((r: any) => r.score > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  /**
   * Regenerate embeddings for a repository
   */
  async regenerateEmbeddings(
    repositoryId: string,
    options: { force?: boolean } = {}
  ): Promise<{ processed: number; errors: number }> {
    // Get all code embeddings for this repository
    const embeddings = await db
      .select()
      .from(schema.codeEmbeddings)
      .where(eq(schema.codeEmbeddings.repositoryId, repositoryId));

    let processed = 0;
    let errors = 0;

    for (const emb of embeddings) {
      // Skip if already has embedding and not forcing
      if (emb.embeddingJson && !options.force) {
        continue;
      }

      try {
        const embeddingText = `${emb.symbolType} ${emb.symbol}: ${emb.content}`;
        const result = await this.embeddingService.generateEmbedding(embeddingText);

        await db
          .update(schema.codeEmbeddings)
          .set({
            embeddingJson: result.embedding,
            updatedAt: new Date(),
          })
          .where(eq(schema.codeEmbeddings.id, emb.id));

        processed++;
      } catch (error) {
        logger.warn("Failed to regenerate embedding", { embeddingId: emb.id, details: String(error) });
        errors++;
      }
    }

    return { processed, errors };
  }

  /**
   * Get symbols for a specific file
   */
  async getFileSymbols(
    repositoryId: string,
    filePath: string
  ): Promise<ExtractedSymbol[]> {
    const embeddings = await db
      .select()
      .from(schema.codeEmbeddings)
      .where(
        and(
          eq(schema.codeEmbeddings.repositoryId, repositoryId),
          eq(schema.codeEmbeddings.filePath, filePath)
        )
      );

    return embeddings.map((emb: any) => ({
      name: emb.symbol || "",
      type: (emb.symbolType as SymbolType) || "function",
      filePath: emb.filePath,
      lineStart: emb.lineStart || 0,
      lineEnd: emb.lineEnd || 0,
      content: emb.content,
      language: emb.language || "unknown",
    }));
  }

  /**
   * Get indexing statistics for a repository
   */
  async getRepositoryStats(repositoryId: string): Promise<{
    fileCount: number;
    symbolCount: number;
    lastIndexed: Date | null;
    status: string;
    languageBreakdown: Record<string, number>;
    symbolTypeBreakdown: Record<string, number>;
  }> {
    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, repositoryId))
      .limit(1);

    if (!repo) {
      throw new Error(`Repository not found: ${repositoryId}`);
    }

    // Get language breakdown
    const files = await db
      .select()
      .from(schema.indexedFiles)
      .where(eq(schema.indexedFiles.repositoryId, repositoryId));

    const languageBreakdown: Record<string, number> = {};
    for (const file of files) {
      const lang = file.language || "unknown";
      languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
    }

    // Get symbol type breakdown
    const symbols = await db
      .select()
      .from(schema.codeEmbeddings)
      .where(eq(schema.codeEmbeddings.repositoryId, repositoryId));

    const symbolTypeBreakdown: Record<string, number> = {};
    for (const sym of symbols) {
      const type = sym.symbolType || "unknown";
      symbolTypeBreakdown[type] = (symbolTypeBreakdown[type] || 0) + 1;
    }

    return {
      fileCount: repo.fileCount || 0,
      symbolCount: repo.symbolCount || 0,
      lastIndexed: repo.lastIndexedAt,
      status: repo.indexStatus || "pending",
      languageBreakdown,
      symbolTypeBreakdown,
    };
  }

  /**
   * Detect programming language from file path
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.slice(filePath.lastIndexOf("."));
    return LANGUAGE_MAP[ext] || "unknown";
  }

  /**
   * Extract symbols from file content
   */
  private extractSymbols(
    content: string,
    filePath: string,
    language: string
  ): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];
    const patterns = SYMBOL_PATTERNS[language] || SYMBOL_PATTERNS.typescript;
    const lines = content.split("\n");

    for (const pattern of patterns) {
      // Reset regex
      pattern.lastIndex = 0;

      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (!name) continue;

        // Find line number
        const beforeMatch = content.slice(0, match.index);
        const lineStart = beforeMatch.split("\n").length;

        // Determine symbol type from pattern
        let type: SymbolType = "function";
        const matchText = match[0].toLowerCase();
        if (matchText.includes("class")) type = "class";
        else if (matchText.includes("interface")) type = "interface";
        else if (matchText.includes("type")) type = "type";
        else if (matchText.includes("const")) type = "constant";
        else if (matchText.includes("enum")) type = "enum";
        else if (matchText.includes("struct")) type = "class";
        else if (matchText.includes("trait")) type = "interface";
        else if (matchText.includes("impl")) type = "class";

        // Extract content around the symbol (simplified)
        const lineEnd = Math.min(lineStart + 10, lines.length);
        const symbolContent = lines.slice(lineStart - 1, lineEnd).join("\n");

        symbols.push({
          name,
          type,
          filePath,
          lineStart,
          lineEnd,
          content: symbolContent,
          language,
        });
      }
    }

    return symbols;
  }

  /**
   * Hash content for change detection
   */
  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }
}

/**
 * Interface for embedding providers (OpenAI, local models, etc.)
 */
export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

/**
 * Create a default indexing service
 */
export function createIndexingService(
  embeddingProvider?: EmbeddingProvider
): IndexingService {
  return new IndexingService(embeddingProvider);
}

export default IndexingService;
