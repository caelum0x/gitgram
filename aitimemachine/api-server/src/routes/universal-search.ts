import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc, like, or, sql, inArray } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import { IndexingService, createIndexingService } from "../services/indexing.js";
import { getEmbeddingService } from "../services/embeddings.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// Initialize indexing service for code search
const indexingService = createIndexingService();
const embeddingService = getEmbeddingService();

// All routes require authentication
router.use(apiKeyAuth);

// ============================================================================
// Types
// ============================================================================

type SearchMode = "unified" | "hybrid" | "semantic";
type ResultSource =
  | "code"
  | "knowledge_base"
  | "artifact"
  | "context"
  | "message"
  | "repository"
  | "data_source";

interface SearchResult {
  id: string;
  source: ResultSource;
  score: number;
  title: string;
  snippet: string;
  match_offsets?: Array<{ field: string; start: number; end: number }>;
  metadata: {
    file_path?: string;
    symbol?: string;
    symbol_type?: string;
    language?: string;
    line_start?: number;
    line_end?: number;
    repository_id?: string;
    project_id?: string;
    session_id?: string;
    role?: string;
    timestamp?: string;
    tags?: string[];
    content_hash?: string;
    size?: number;
  };
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

const SOURCE_WEIGHTS: Record<ResultSource, number> = {
  code: 1.0,
  knowledge_base: 0.95,
  artifact: 0.9,
  context: 0.9,
  message: 0.8,
  repository: 0.85,
  data_source: 0.7,
};

const SEMANTIC_SCORE_SCALE = 10;
const CONTEXT_BOOST_MAX = 2.0;
const TEXT_SCORE_CAP = 18;
const MAX_QUERY_VARIANTS = 12;
const SNIPPET_WINDOW = 220;

// Scoring weights - calibrated to prevent semantic/text dominance
const WEIGHTS = {
  semanticBase: 0.4,        // Base weight for semantic similarity
  textBase: 0.6,            // Base weight for text matching
  exactTitleMatch: 12,      // Exact title match
  titleContains: 6,         // Query contained in title
  exactContentMatch: 4,     // Exact query match in content
  termInTitle: 2.5,         // Each term found in title
  termInContent: 0.8,       // Each term found in content
  fuzzyNear: 2.0,           // Fuzzy match within distance 1
  fuzzyClose: 1.25,         // Fuzzy match within distance 2
  fuzzyFar: 0.75,           // Fuzzy match within distance 3
  recencyDecay: 30,         // Days for recency half-life
  maxRecencyBoost: 2.0,     // Maximum recency boost
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const v0 = new Array(b.length + 1).fill(0);
  const v1 = new Array(b.length + 1).fill(0);

  for (let i = 0; i <= b.length; i++) v0[i] = i;

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(
        v1[j] + 1,
        v0[j + 1] + 1,
        v0[j] + cost
      );
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }

  return v1[b.length];
}

function fuzzyMatchBonus(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q || !t) return 0;

  const tokens = t.split(/[^a-z0-9_]+/).filter(Boolean).slice(0, 24);
  if (tokens.length === 0) return 0;

  let best = Infinity;
  for (const token of tokens) {
    const dist = levenshtein(q, token);
    if (dist < best) best = dist;
    if (best === 0) break;
  }

  if (best <= 1) return WEIGHTS.fuzzyNear;
  if (best === 2) return WEIGHTS.fuzzyClose;
  if (best === 3 && q.length >= 5) return WEIGHTS.fuzzyFar;
  return 0;
}

function recencyBoost(timestamp?: string): number {
  if (!timestamp) return 0;
  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) return 0;
  const ageMs = Math.max(0, Date.now() - ts);
  const ageDays = ageMs / 86_400_000;
  // Exponential decay with configurable half-life
  return WEIGHTS.maxRecencyBoost * Math.exp(-ageDays / WEIGHTS.recencyDecay);
}

function buildQueryVariants(query: string): string[] {
  const raw = query.trim();
  if (!raw) return [];

  const normalized = raw.toLowerCase();
  const variants = new Set<string>([normalized]);

  // Split into tokens
  const tokens = normalized.split(/[^a-z0-9_]+/).filter(Boolean).slice(0, 8);
  for (const token of tokens) {
    variants.add(token);
  }

  if (tokens.length > 1) {
    // snake_case
    const snake = tokens.join("_");
    variants.add(snake);
    
    // kebab-case
    const kebab = tokens.join("-");
    variants.add(kebab);
    
    // camelCase
    const camel = tokens[0] + tokens.slice(1).map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join("");
    variants.add(camel);
    
    // PascalCase
    const pascal = tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join("");
    variants.add(pascal);
    
    // SCREAMING_SNAKE_CASE
    const screaming = tokens.join("_").toUpperCase();
    variants.add(screaming);
    
    // No separator (concatenated)
    const concat = tokens.join("");
    variants.add(concat);
  }

  // Handle existing case patterns in the query
  // Split camelCase/PascalCase
  const camelSplit = raw.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/\s+/);
  for (const part of camelSplit) {
    if (part && part.length > 1) variants.add(part);
  }

  // Handle snake_case input
  for (const token of tokens) {
    if (token.includes("_")) {
      token.split("_").forEach((part) => {
        if (part && part.length > 1) variants.add(part);
      });
    }
    if (token.includes("-")) {
      token.split("-").forEach((part) => {
        if (part && part.length > 1) variants.add(part);
      });
    }
  }

  return Array.from(variants).filter(Boolean).slice(0, MAX_QUERY_VARIANTS);
}

function findMatchOffsets(text: string, variants: string[], field: string) {
  const lowered = text.toLowerCase();
  for (const variant of variants) {
    if (!variant) continue;
    const idx = lowered.indexOf(variant.toLowerCase());
    if (idx >= 0) {
      return [{ field, start: idx, end: idx + variant.length }];
    }
  }
  return [];
}

function buildSnippet(text: string, variants: string[]): { snippet: string; offsets: Array<{ field: string; start: number; end: number }> } {
  if (!text) return { snippet: "", offsets: [] };
  const offsets = findMatchOffsets(text, variants, "content");
  if (offsets.length === 0) {
    return { snippet: text.slice(0, SNIPPET_WINDOW), offsets: [] };
  }
  const { start, end } = offsets[0];
  const halfWindow = Math.floor(SNIPPET_WINDOW / 2);
  const snippetStart = Math.max(0, start - halfWindow);
  const snippetEnd = Math.min(text.length, end + halfWindow);
  const snippet = text.slice(snippetStart, snippetEnd);

  return {
    snippet,
    offsets: [{ field: "content", start: start - snippetStart, end: end - snippetStart }],
  };
}

async function getQueryEmbedding(query: string): Promise<number[] | null> {
  try {
    const result = await embeddingService.generateEmbedding(query);
    return result.embedding;
  } catch (error) {
    logger.warn("Query embedding generation failed", { details: String(error) });
    return null;
  }
}

function semanticSimilarity(queryEmbedding: number[] | null, candidate?: number[] | null): number {
  if (!queryEmbedding || !candidate || !Array.isArray(candidate)) return 0;
  try {
    return embeddingService.cosineSimilarity(queryEmbedding, candidate);
  } catch {
    return 0;
  }
}

function applyContextBoost(content: string, terms: string[], maxBoost = CONTEXT_BOOST_MAX): number {
  if (!content || terms.length === 0) return 0;
  let boost = 0;
  const contentLower = content.toLowerCase();
  for (const term of terms) {
    if (contentLower.includes(term.toLowerCase())) {
      boost += 0.5;
      if (boost >= maxBoost) return maxBoost;
    }
  }
  return boost;
}

/**
 * Calculate text similarity score between query and content
 * Calibrated to work well with semantic scores
 */
function calculateTextScore(query: string, content: string, title?: string): number {
  const queryLower = query.toLowerCase();
  const queryVariants = buildQueryVariants(query);
  const queryTerms = queryVariants.length > 0
    ? queryVariants
    : queryLower.split(/\s+/).filter((t) => t.length > 1);
  const contentLower = content.toLowerCase();
  const titleLower = title?.toLowerCase() || "";

  let score = 0;

  // Exact match in title (highest priority)
  if (titleLower === queryLower) {
    score += WEIGHTS.exactTitleMatch;
  } else if (titleLower.includes(queryLower)) {
    score += WEIGHTS.titleContains;
  }

  // Exact match in content
  if (contentLower.includes(queryLower)) {
    score += WEIGHTS.exactContentMatch;
  }

  // Term matching with diminishing returns
  let titleMatches = 0;
  let contentMatches = 0;
  for (const term of queryTerms) {
    if (titleLower.includes(term)) {
      titleMatches++;
      // Diminishing returns for many matches
      score += WEIGHTS.termInTitle * Math.pow(0.9, titleMatches - 1);
    }
    if (contentLower.includes(term)) {
      contentMatches++;
      score += WEIGHTS.termInContent * Math.pow(0.9, contentMatches - 1);
    }
  }

  // Bonus for high term coverage
  const coverage = (titleMatches + contentMatches) / (queryTerms.length * 2);
  if (coverage > 0.8) {
    score *= 1.2;
  }

  return Math.min(score, TEXT_SCORE_CAP);
}

/**
 * Compute combined score with balanced semantic/text weights
 */
function computeScore(
  query: string,
  content: string,
  title: string | undefined,
  source: ResultSource,
  timestamp?: string,
  semanticScore?: number
): number {
  const textScore = calculateTextScore(query, content, title);
  const fuzzy = Math.max(
    fuzzyMatchBonus(query, title || ""),
    fuzzyMatchBonus(query, content)
  );
  
  let finalScore: number;
  
  if (semanticScore !== undefined && semanticScore > 0) {
    // Hybrid scoring: balance semantic and text
    const normalizedSemantic = semanticScore * SEMANTIC_SCORE_SCALE;
    const normalizedText = textScore + fuzzy;
    
    // Dynamic weighting based on signal strength
    const textWeight = textScore > 8 ? 0.7 : WEIGHTS.textBase;
    const semanticWeight = 1 - textWeight;
    
    finalScore = (normalizedText * textWeight) + (normalizedSemantic * semanticWeight);
  } else {
    // Text-only scoring
    finalScore = textScore + fuzzy;
  }
  
  // Apply source weight
  finalScore *= (SOURCE_WEIGHTS[source] || 1);
  
  // Apply recency boost
  finalScore += recencyBoost(timestamp);
  
  return finalScore;
}

/**
 * Merge and deduplicate results from multiple sources
 */
function mergeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();

  for (const result of results) {
    const fileKey = result.metadata.file_path ? `file:${result.metadata.file_path}` : null;
    const key = fileKey || `${result.source}:${result.id}`;
    const existing = seen.get(key);

    if (!existing || result.score > existing.score) {
      seen.set(key, result);
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

// ============================================================================
// POST /v1/universal-search - Search across all sources
// ============================================================================

router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      query,
      repositories = [],
      data_sources = [],
      search_mode = "unified" as SearchMode,
      limit = 20,
      offset = 0,
      sources = ["code", "knowledge_base", "artifact", "context", "message"],
    } = req.body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw Errors.missingParameter("query");
    }

    const userId = req.user!.userId;
    const queryVariants = buildQueryVariants(query);
    const allResults: SearchResult[] = [];
    const queryEmbedding =
      search_mode === "semantic" || search_mode === "hybrid"
        ? await getQueryEmbedding(query)
        : null;

    // ========================================================================
    // Search Code Embeddings
    // ========================================================================
    if (sources.includes("code")) {
      try {
        // Build conditions for code search
        const codeConditions = [eq(schema.codeEmbeddings.userId, userId)];

        if (repositories.length > 0) {
          codeConditions.push(inArray(schema.codeEmbeddings.repositoryId, repositories));
        }

        // Use indexing service for semantic search if mode is semantic or hybrid
        if (search_mode === "semantic" || search_mode === "hybrid") {
          const codeResults = await indexingService.searchCode(userId, query, {
            repositoryId: repositories.length === 1 ? repositories[0] : undefined,
            limit: limit * 2,
          });

          for (const result of codeResults) {
            const timestamp = (result as any).timestamp || undefined;
          const weightedScore =
            result.score * SEMANTIC_SCORE_SCALE * SOURCE_WEIGHTS.code + recencyBoost(timestamp);
            const snippetInfo = buildSnippet(result.content, queryVariants);
            allResults.push({
              id: result.id,
              source: "code",
              score: weightedScore,
              title: result.symbol || result.filePath.split("/").pop() || "Unknown",
              snippet: snippetInfo.snippet,
              match_offsets: snippetInfo.offsets,
              metadata: {
                file_path: result.filePath,
                symbol: result.symbol || undefined,
                symbol_type: result.symbolType || undefined,
                language: result.language || undefined,
                line_start: result.lineStart || undefined,
                line_end: result.lineEnd || undefined,
              },
            });
          }
        }

        // Also do text-based search for unified mode or as fallback
        if (search_mode === "unified" || search_mode === "hybrid") {
          const codeEmbeddings = await db
            .select({
              id: schema.codeEmbeddings.id,
              filePath: schema.codeEmbeddings.filePath,
              symbol: schema.codeEmbeddings.symbol,
              symbolType: schema.codeEmbeddings.symbolType,
              content: schema.codeEmbeddings.content,
              lineStart: schema.codeEmbeddings.lineStart,
              lineEnd: schema.codeEmbeddings.lineEnd,
              language: schema.codeEmbeddings.language,
              repositoryId: schema.codeEmbeddings.repositoryId,
              projectId: schema.codeEmbeddings.projectId,
              createdAt: schema.codeEmbeddings.createdAt,
            })
            .from(schema.codeEmbeddings)
            .where(
              and(
                ...codeConditions,
                or(
                  like(schema.codeEmbeddings.content, `%${query}%`),
                  like(schema.codeEmbeddings.symbol, `%${query}%`),
                  like(schema.codeEmbeddings.filePath, `%${query}%`)
                )
              )
            )
            .orderBy(desc(schema.codeEmbeddings.createdAt))
            .limit(limit * 2);

          for (const emb of codeEmbeddings) {
            const score = computeScore(
              query,
              emb.content,
              emb.symbol || emb.filePath,
              "code",
              emb.createdAt?.toISOString()
            );

            if (score > 0) {
            const snippetInfo = buildSnippet(emb.content, queryVariants);
            allResults.push({
              id: emb.id,
              source: "code",
              score,
              title: emb.symbol || emb.filePath.split("/").pop() || "Unknown",
              snippet: snippetInfo.snippet,
              match_offsets: snippetInfo.offsets,
              metadata: {
                  file_path: emb.filePath,
                  symbol: emb.symbol || undefined,
                  symbol_type: emb.symbolType || undefined,
                  language: emb.language || undefined,
                  line_start: emb.lineStart || undefined,
                  line_end: emb.lineEnd || undefined,
                  repository_id: emb.repositoryId,
                  project_id: emb.projectId,
                },
              });
            }
          }
        }
      } catch (error) {
        logger.error("Code search error", error instanceof Error ? error : undefined, { details: String(error) });
        // Continue with other sources
      }
    }

    // ========================================================================
    // Search Knowledge Base Files
    // ========================================================================
    if (sources.includes("knowledge_base")) {
      try {
        const kbConditions = [eq(schema.knowledgeBaseFiles.userId, userId)];

        if (repositories.length > 0) {
          kbConditions.push(inArray(schema.knowledgeBaseFiles.repositoryId, repositories));
        }

        if (search_mode !== "semantic" || !queryEmbedding) {
          const kbFiles = await db
            .select({
              id: schema.knowledgeBaseFiles.id,
              filePath: schema.knowledgeBaseFiles.filePath,
              content: schema.knowledgeBaseFiles.content,
              contentHash: schema.knowledgeBaseFiles.contentHash,
              size: schema.knowledgeBaseFiles.size,
              language: schema.knowledgeBaseFiles.language,
              repositoryId: schema.knowledgeBaseFiles.repositoryId,
              projectId: schema.knowledgeBaseFiles.projectId,
              updatedAt: schema.knowledgeBaseFiles.updatedAt,
              embeddingJson: schema.knowledgeBaseFiles.embeddingJson,
            })
            .from(schema.knowledgeBaseFiles)
            .where(
              and(
                ...kbConditions,
                sql`(${schema.knowledgeBaseFiles.filePath} ILIKE ${`%${query}%`} OR ${schema.knowledgeBaseFiles.content} ILIKE ${`%${query}%`})`
              )
            )
            .orderBy(desc(schema.knowledgeBaseFiles.updatedAt))
            .limit(limit * 2);

          for (const kbFile of kbFiles) {
            const textScore = computeScore(
              query,
              kbFile.content || kbFile.filePath,
              kbFile.filePath.split("/").pop() || kbFile.filePath,
              "knowledge_base",
              kbFile.updatedAt?.toISOString()
            );
            const semanticScore =
              semanticSimilarity(queryEmbedding, kbFile.embeddingJson as number[] | null) *
              SEMANTIC_SCORE_SCALE *
              SOURCE_WEIGHTS.knowledge_base;
            const score = textScore + (semanticScore > 0 ? semanticScore * 0.6 : 0);

            if (score > 0) {
              const snippetInfo = buildSnippet(kbFile.content || kbFile.filePath, queryVariants);
              allResults.push({
                id: kbFile.id,
                source: "knowledge_base",
                score,
                title: kbFile.filePath.split("/").pop() || kbFile.filePath,
                snippet: snippetInfo.snippet,
                match_offsets: snippetInfo.offsets,
                metadata: {
                  file_path: kbFile.filePath,
                  language: kbFile.language || undefined,
                  repository_id: kbFile.repositoryId,
                  project_id: kbFile.projectId,
                  content_hash: kbFile.contentHash,
                  size: kbFile.size || undefined,
                  timestamp: kbFile.updatedAt?.toISOString(),
                },
              });
            }
          }
        }

        if ((search_mode === "semantic" || search_mode === "hybrid") && queryEmbedding) {
          const kbSemantic = await db
            .select({
              id: schema.knowledgeBaseFiles.id,
              filePath: schema.knowledgeBaseFiles.filePath,
              content: schema.knowledgeBaseFiles.content,
              contentHash: schema.knowledgeBaseFiles.contentHash,
              size: schema.knowledgeBaseFiles.size,
              language: schema.knowledgeBaseFiles.language,
              repositoryId: schema.knowledgeBaseFiles.repositoryId,
              projectId: schema.knowledgeBaseFiles.projectId,
              updatedAt: schema.knowledgeBaseFiles.updatedAt,
              embeddingJson: schema.knowledgeBaseFiles.embeddingJson,
            })
            .from(schema.knowledgeBaseFiles)
            .where(
              and(
                ...kbConditions,
                sql`${schema.knowledgeBaseFiles.embeddingJson} is not null`
              )
            )
            .orderBy(desc(schema.knowledgeBaseFiles.updatedAt))
            .limit(limit * 5);

          for (const kbFile of kbSemantic) {
            const semanticScore =
              semanticSimilarity(queryEmbedding, kbFile.embeddingJson as number[] | null) *
              SEMANTIC_SCORE_SCALE *
              SOURCE_WEIGHTS.knowledge_base;
            if (semanticScore <= 0) continue;

            const snippetInfo = buildSnippet(kbFile.content || kbFile.filePath, queryVariants);
            allResults.push({
              id: kbFile.id,
              source: "knowledge_base",
              score: semanticScore + recencyBoost(kbFile.updatedAt?.toISOString()),
              title: kbFile.filePath.split("/").pop() || kbFile.filePath,
              snippet: snippetInfo.snippet,
              match_offsets: snippetInfo.offsets,
              metadata: {
                file_path: kbFile.filePath,
                language: kbFile.language || undefined,
                repository_id: kbFile.repositoryId,
                project_id: kbFile.projectId,
                content_hash: kbFile.contentHash,
                size: kbFile.size || undefined,
                timestamp: kbFile.updatedAt?.toISOString(),
              },
            });
          }
        }
      } catch (error) {
        logger.error("Knowledge base search error", error instanceof Error ? error : undefined, { details: String(error) });
        // Continue with other sources
      }
    }

    // ========================================================================
    // Search Knowledge Base Artifacts
    // ========================================================================
    if (sources.includes("artifact")) {
      try {
        const artifactConditions = [eq(schema.knowledgeBaseArtifacts.userId, userId)];

        if (search_mode !== "semantic" || !queryEmbedding) {
          const artifacts = await db
            .select({
              id: schema.knowledgeBaseArtifacts.id,
              type: schema.knowledgeBaseArtifacts.type,
              format: schema.knowledgeBaseArtifacts.format,
              storage: schema.knowledgeBaseArtifacts.storage,
              size: schema.knowledgeBaseArtifacts.size,
              stats: schema.knowledgeBaseArtifacts.stats,
              content: schema.knowledgeBaseArtifacts.content,
              createdAt: schema.knowledgeBaseArtifacts.createdAt,
              embeddingJson: schema.knowledgeBaseArtifacts.embeddingJson,
              projectId: schema.knowledgeBaseArtifacts.projectId,
            })
            .from(schema.knowledgeBaseArtifacts)
            .where(
              and(
                ...artifactConditions,
                sql`${schema.knowledgeBaseArtifacts.content}::text ILIKE ${`%${query}%`}`
              )
            )
            .orderBy(desc(schema.knowledgeBaseArtifacts.createdAt))
            .limit(limit * 2);

          for (const artifact of artifacts) {
            const contentText =
              artifact.content
                ? JSON.stringify(artifact.content)
                : JSON.stringify(artifact.stats || {});
            const textScore = computeScore(
              query,
              contentText,
              `${artifact.type}.${artifact.format}`,
              "artifact",
              artifact.createdAt?.toISOString()
            );
            const semanticScore =
              semanticSimilarity(queryEmbedding, artifact.embeddingJson as number[] | null) *
              SEMANTIC_SCORE_SCALE *
              SOURCE_WEIGHTS.artifact;
            const score = textScore + (semanticScore > 0 ? semanticScore * 0.6 : 0);

            if (score > 0) {
              const snippetInfo = buildSnippet(contentText, queryVariants);
              allResults.push({
                id: artifact.id,
                source: "artifact",
                score,
                title: `${artifact.type}.${artifact.format}`,
                snippet: snippetInfo.snippet,
                match_offsets: snippetInfo.offsets,
                metadata: {
                  project_id: artifact.projectId || undefined,
                  size: artifact.size || undefined,
                  timestamp: artifact.createdAt?.toISOString(),
                },
              });
            }
          }
        }

        if ((search_mode === "semantic" || search_mode === "hybrid") && queryEmbedding) {
          const artifacts = await db
            .select({
              id: schema.knowledgeBaseArtifacts.id,
              type: schema.knowledgeBaseArtifacts.type,
              format: schema.knowledgeBaseArtifacts.format,
              storage: schema.knowledgeBaseArtifacts.storage,
              size: schema.knowledgeBaseArtifacts.size,
              stats: schema.knowledgeBaseArtifacts.stats,
              content: schema.knowledgeBaseArtifacts.content,
              createdAt: schema.knowledgeBaseArtifacts.createdAt,
              embeddingJson: schema.knowledgeBaseArtifacts.embeddingJson,
              projectId: schema.knowledgeBaseArtifacts.projectId,
            })
            .from(schema.knowledgeBaseArtifacts)
            .where(
              and(
                ...artifactConditions,
                sql`${schema.knowledgeBaseArtifacts.embeddingJson} is not null`
              )
            )
            .orderBy(desc(schema.knowledgeBaseArtifacts.createdAt))
            .limit(limit * 5);

          for (const artifact of artifacts) {
            const semanticScore =
              semanticSimilarity(queryEmbedding, artifact.embeddingJson as number[] | null) *
              SEMANTIC_SCORE_SCALE *
              SOURCE_WEIGHTS.artifact;
            if (semanticScore <= 0) continue;

            const contentText =
              artifact.content
                ? JSON.stringify(artifact.content)
                : JSON.stringify(artifact.stats || {});
            const snippetInfo = buildSnippet(contentText, queryVariants);
            allResults.push({
              id: artifact.id,
              source: "artifact",
              score: semanticScore + recencyBoost(artifact.createdAt?.toISOString()),
              title: `${artifact.type}.${artifact.format}`,
              snippet: snippetInfo.snippet,
              match_offsets: snippetInfo.offsets,
              metadata: {
                project_id: artifact.projectId || undefined,
                size: artifact.size || undefined,
                timestamp: artifact.createdAt?.toISOString(),
              },
            });
          }
        }
      } catch (error) {
        logger.error("Knowledge artifact search error", error instanceof Error ? error : undefined, { details: String(error) });
      }
    }

    // ========================================================================
    // Search Saved Contexts
    // ========================================================================
    if (sources.includes("context")) {
      try {
        const contexts = await db
          .select({
            id: schema.savedContexts.id,
            name: schema.savedContexts.name,
            description: schema.savedContexts.description,
            messages: schema.savedContexts.messages,
            tags: schema.savedContexts.tags,
            projectId: schema.savedContexts.projectId,
            checkpointId: schema.savedContexts.checkpointId,
            tool: schema.savedContexts.tool,
            createdAt: schema.savedContexts.createdAt,
            embeddingJson: schema.savedContexts.embeddingJson,
          })
          .from(schema.savedContexts)
          .where(
            and(
              eq(schema.savedContexts.userId, userId),
              or(
                like(schema.savedContexts.name, `%${query}%`),
                like(schema.savedContexts.description, `%${query}%`)
              )
            )
          )
          .orderBy(desc(schema.savedContexts.createdAt))
          .limit(limit * 2);

        for (const ctx of contexts) {
          const textScore = computeScore(
            query,
            (ctx.description || "") + " " + (ctx.name || ""),
            ctx.name,
            "context",
            ctx.createdAt?.toISOString()
          );
          const semanticScore =
            semanticSimilarity(queryEmbedding, ctx.embeddingJson as number[] | null) *
            SEMANTIC_SCORE_SCALE *
            SOURCE_WEIGHTS.context;

          // Also search within messages if available
          let messageScore = 0;
          if (ctx.messages && Array.isArray(ctx.messages)) {
            for (const msg of ctx.messages) {
              if (msg.content) {
                messageScore += Math.max(
                  0,
                  computeScore(
                    query,
                    msg.content,
                    ctx.name,
                    "context",
                    ctx.createdAt?.toISOString()
                  ) * 0.2
                );
              }
            }
          }

          const score =
            search_mode === "semantic"
              ? semanticScore
              : textScore + messageScore + (semanticScore > 0 ? semanticScore * 0.5 : 0);

          if (score > 0) {
            const snippetInfo = buildSnippet(ctx.description || ctx.name, queryVariants);
            allResults.push({
              id: ctx.id,
              source: "context",
              score,
              title: ctx.name,
              snippet: snippetInfo.snippet || ctx.description || `Saved context with ${(ctx.messages || []).length} messages`,
              match_offsets: snippetInfo.offsets,
              metadata: {
                project_id: ctx.projectId,
                tags: ctx.tags || undefined,
                timestamp: ctx.createdAt?.toISOString(),
              },
            });
          }
        }
      } catch (error) {
        logger.error("Context search error", error instanceof Error ? error : undefined, { details: String(error) });
        // Continue with other sources
      }

      if ((search_mode === "semantic" || search_mode === "hybrid") && queryEmbedding) {
        try {
          const semanticContexts = await db
            .select({
              id: schema.savedContexts.id,
              name: schema.savedContexts.name,
              description: schema.savedContexts.description,
              messages: schema.savedContexts.messages,
              tags: schema.savedContexts.tags,
              projectId: schema.savedContexts.projectId,
              createdAt: schema.savedContexts.createdAt,
              embeddingJson: schema.savedContexts.embeddingJson,
            })
            .from(schema.savedContexts)
            .where(
              and(
                eq(schema.savedContexts.userId, userId),
                sql`${schema.savedContexts.embeddingJson} is not null`
              )
            )
            .orderBy(desc(schema.savedContexts.createdAt))
            .limit(limit * 5);

          for (const ctx of semanticContexts) {
            const semanticScore =
              semanticSimilarity(queryEmbedding, ctx.embeddingJson as number[] | null) *
              SEMANTIC_SCORE_SCALE *
              SOURCE_WEIGHTS.context;
            if (semanticScore <= 0) continue;

            const snippetInfo = buildSnippet(ctx.description || ctx.name, queryVariants);
            allResults.push({
              id: ctx.id,
              source: "context",
              score: semanticScore + recencyBoost(ctx.createdAt?.toISOString()),
              title: ctx.name,
              snippet: snippetInfo.snippet || ctx.description || `Saved context with ${(ctx.messages || []).length} messages`,
              match_offsets: snippetInfo.offsets,
              metadata: {
                project_id: ctx.projectId,
                tags: ctx.tags || undefined,
                timestamp: ctx.createdAt?.toISOString(),
              },
            });
          }
        } catch (error) {
          logger.error("Context semantic search error", error instanceof Error ? error : undefined, { details: String(error) });
        }
      }
    }

    // ========================================================================
    // Search Chat Messages
    // ========================================================================
    if (sources.includes("message")) {
      try {
        const messages = await db
          .select({
            id: schema.chatMessages.id,
            role: schema.chatMessages.role,
            content: schema.chatMessages.content,
            timestamp: schema.chatMessages.timestamp,
            projectId: schema.chatMessages.projectId,
            sessionId: schema.chatMessages.sessionId,
          })
          .from(schema.chatMessages)
          .where(
            and(
              eq(schema.chatMessages.userId, userId),
              like(schema.chatMessages.content, `%${query}%`)
            )
          )
          .orderBy(desc(schema.chatMessages.timestamp))
          .limit(limit * 2);

        for (const msg of messages) {
          const score = computeScore(
            query,
            msg.content || "",
            undefined,
            "message",
            msg.timestamp?.toISOString()
          );

          if (score > 0) {
            const snippetInfo = buildSnippet(msg.content || "", queryVariants);
            allResults.push({
              id: msg.id,
              source: "message",
              score,
              title: `${msg.role}: ${(msg.content || "").slice(0, 50)}...`,
              snippet: snippetInfo.snippet,
              match_offsets: snippetInfo.offsets,
              metadata: {
                role: msg.role,
                project_id: msg.projectId,
                session_id: msg.sessionId,
                timestamp: msg.timestamp?.toISOString(),
              },
            });
          }
        }
      } catch (error) {
        logger.error("Message search error", error instanceof Error ? error : undefined, { details: String(error) });
        // Continue with other sources
      }
    }

    // ========================================================================
    // Search Repositories (documentation sources)
    // ========================================================================
    if (sources.includes("repository") || data_sources.length > 0) {
      try {
        const repoConditions = [eq(schema.repositories.userId, userId)];

        if (data_sources.length > 0) {
          // Data sources map to projects, find associated repos
          repoConditions.push(inArray(schema.repositories.projectId, data_sources));
        }

        const repos = await db
          .select({
            id: schema.repositories.id,
            name: schema.repositories.name,
            rootPath: schema.repositories.rootPath,
            projectId: schema.repositories.projectId,
            indexStatus: schema.repositories.indexStatus,
            fileCount: schema.repositories.fileCount,
            symbolCount: schema.repositories.symbolCount,
          })
          .from(schema.repositories)
          .where(
            and(
              ...repoConditions,
              or(
                like(schema.repositories.name, `%${query}%`),
                like(schema.repositories.rootPath, `%${query}%`)
              )
            )
          )
          .limit(limit);

        for (const repo of repos) {
          const score = computeScore(
            query,
            repo.rootPath || "",
            repo.name,
            "repository",
            undefined
          );

          if (score > 0) {
            allResults.push({
              id: repo.id,
              source: "repository",
              score,
              title: repo.name,
              snippet: `Repository with ${repo.fileCount || 0} files and ${repo.symbolCount || 0} symbols`,
              metadata: {
                file_path: repo.rootPath || undefined,
                project_id: repo.projectId,
              },
            });
          }
        }
      } catch (error) {
        logger.error("Repository search error", error instanceof Error ? error : undefined, { details: String(error) });
        // Continue with other sources
      }
    }

    // ========================================================================
    // Merge, deduplicate, and paginate results
    // ========================================================================
    const mergedResults = mergeResults(allResults);
    const total = mergedResults.length;
    const paginatedResults = mergedResults.slice(offset, offset + limit);

    const response: PaginatedResponse<SearchResult> = {
      data: paginatedResults,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
      },
    };

    res.json({
      query,
      search_mode,
      sources,
      ...response,
    });
  })
);

// ============================================================================
// POST /v1/query - Query with chat context (conversational search)
// ============================================================================

router.post(
  "/query",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      query,
      context = [],
      repositories = [],
      limit = 20,
      offset = 0,
      include_sources = true,
      search_mode = "hybrid" as SearchMode,
    } = req.body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw Errors.missingParameter("query");
    }

    // Validate context format
    if (!Array.isArray(context)) {
      throw Errors.invalidParameter("context", "Context must be an array of messages");
    }

    for (const msg of context) {
      if (!msg.role || !["user", "assistant", "system"].includes(msg.role)) {
        throw Errors.invalidParameter(
          "context",
          "Each context message must have a valid role (user, assistant, or system)"
        );
      }
      if (typeof msg.content !== "string") {
        throw Errors.invalidParameter(
          "context",
          "Each context message must have a string content"
        );
      }
    }

    const userId = req.user!.userId;
    const queryVariants = buildQueryVariants(query);
    const allResults: SearchResult[] = [];
    const queryEmbedding =
      search_mode === "semantic" || search_mode === "hybrid"
        ? await getQueryEmbedding(query)
        : null;

    // ========================================================================
    // Build enhanced query from context
    // ========================================================================
    // Extract key terms from recent context to enhance the search
    let enhancedQuery = query;
    const contextTerms: string[] = [];

    // Get terms from last 3 messages for context
    const recentContext = context.slice(-3);
    for (const msg of recentContext) {
      // Extract potential keywords (nouns, technical terms)
      const words = msg.content
        .split(/\s+/)
        .filter((w: string) => w.length > 3)
        .slice(0, 10);
      contextTerms.push(...words);
    }

    // Deduplicate context terms
    const uniqueContextTerms = [...new Set(contextTerms)].slice(0, 5);

    // ========================================================================
    // Search Code with context-aware ranking
    // ========================================================================
    try {
      const codeConditions = [eq(schema.codeEmbeddings.userId, userId)];

      if (repositories.length > 0) {
        codeConditions.push(inArray(schema.codeEmbeddings.repositoryId, repositories));
      }

      // Use indexing service for search
      const codeResults = await indexingService.searchCode(userId, query, {
        repositoryId: repositories.length === 1 ? repositories[0] : undefined,
        limit: limit * 2,
      });

      for (const result of codeResults) {
        // Boost score if content matches context terms
        const contextBoost = applyContextBoost(result.content, uniqueContextTerms);

        const timestamp = (result as any).timestamp || undefined;
        const weightedScore =
          result.score * SEMANTIC_SCORE_SCALE * SOURCE_WEIGHTS.code +
          recencyBoost(timestamp) +
          contextBoost;
        const snippetInfo = buildSnippet(result.content, queryVariants);
        allResults.push({
          id: result.id,
          source: "code",
          score: weightedScore,
          title: result.symbol || result.filePath.split("/").pop() || "Unknown",
          snippet: snippetInfo.snippet,
          match_offsets: snippetInfo.offsets,
          metadata: {
            file_path: result.filePath,
            symbol: result.symbol || undefined,
            symbol_type: result.symbolType || undefined,
            language: result.language || undefined,
            line_start: result.lineStart || undefined,
            line_end: result.lineEnd || undefined,
          },
        });
      }

      // Also do text-based search
      const codeEmbeddings = await db
        .select({
          id: schema.codeEmbeddings.id,
          filePath: schema.codeEmbeddings.filePath,
          symbol: schema.codeEmbeddings.symbol,
          symbolType: schema.codeEmbeddings.symbolType,
          content: schema.codeEmbeddings.content,
          lineStart: schema.codeEmbeddings.lineStart,
          lineEnd: schema.codeEmbeddings.lineEnd,
          language: schema.codeEmbeddings.language,
          repositoryId: schema.codeEmbeddings.repositoryId,
          projectId: schema.codeEmbeddings.projectId,
          createdAt: schema.codeEmbeddings.createdAt,
        })
        .from(schema.codeEmbeddings)
        .where(
          and(
            ...codeConditions,
            or(
              like(schema.codeEmbeddings.content, `%${query}%`),
              like(schema.codeEmbeddings.symbol, `%${query}%`)
            )
          )
        )
        .orderBy(desc(schema.codeEmbeddings.createdAt))
        .limit(limit * 2);

      for (const emb of codeEmbeddings) {
        let score = computeScore(
          query,
          emb.content,
          emb.symbol || emb.filePath,
          "code",
          emb.createdAt?.toISOString()
        );

        // Apply context boost
        score += applyContextBoost(emb.content, uniqueContextTerms);

        if (score > 0) {
          const snippetInfo = buildSnippet(emb.content, queryVariants);
          allResults.push({
            id: emb.id,
            source: "code",
            score,
            title: emb.symbol || emb.filePath.split("/").pop() || "Unknown",
            snippet: snippetInfo.snippet,
            match_offsets: snippetInfo.offsets,
            metadata: {
              file_path: emb.filePath,
              symbol: emb.symbol || undefined,
              symbol_type: emb.symbolType || undefined,
              language: emb.language || undefined,
              line_start: emb.lineStart || undefined,
              line_end: emb.lineEnd || undefined,
              repository_id: emb.repositoryId,
              project_id: emb.projectId,
            },
          });
        }
      }
    } catch (error) {
      logger.error("Code search error", error instanceof Error ? error : undefined, { details: String(error) });
    }

    // ========================================================================
    // Search Knowledge Base Files with context relevance
    // ========================================================================
    try {
      const kbConditions = [eq(schema.knowledgeBaseFiles.userId, userId)];

      if (repositories.length > 0) {
        kbConditions.push(inArray(schema.knowledgeBaseFiles.repositoryId, repositories));
      }

      if (search_mode !== "semantic" || !queryEmbedding) {
        const kbFiles = await db
          .select({
            id: schema.knowledgeBaseFiles.id,
            filePath: schema.knowledgeBaseFiles.filePath,
            content: schema.knowledgeBaseFiles.content,
            contentHash: schema.knowledgeBaseFiles.contentHash,
            size: schema.knowledgeBaseFiles.size,
            language: schema.knowledgeBaseFiles.language,
            repositoryId: schema.knowledgeBaseFiles.repositoryId,
            projectId: schema.knowledgeBaseFiles.projectId,
            updatedAt: schema.knowledgeBaseFiles.updatedAt,
            embeddingJson: schema.knowledgeBaseFiles.embeddingJson,
          })
          .from(schema.knowledgeBaseFiles)
          .where(
            and(
              ...kbConditions,
              sql`(${schema.knowledgeBaseFiles.filePath} ILIKE ${`%${query}%`} OR ${schema.knowledgeBaseFiles.content} ILIKE ${`%${query}%`})`
            )
          )
          .orderBy(desc(schema.knowledgeBaseFiles.updatedAt))
          .limit(limit * 2);

        for (const kbFile of kbFiles) {
          let score = computeScore(
            query,
            kbFile.content || kbFile.filePath,
            kbFile.filePath.split("/").pop() || kbFile.filePath,
            "knowledge_base",
            kbFile.updatedAt?.toISOString()
          );
          const semanticScore =
            semanticSimilarity(queryEmbedding, kbFile.embeddingJson as number[] | null) *
            SEMANTIC_SCORE_SCALE *
            SOURCE_WEIGHTS.knowledge_base;

          // Boost if file content matches context terms
          score += applyContextBoost(kbFile.content || kbFile.filePath, uniqueContextTerms);
          if (semanticScore > 0) score += semanticScore * 0.5;

        if (score > 0) {
          const snippetInfo = buildSnippet(kbFile.content || kbFile.filePath, queryVariants);
          allResults.push({
            id: kbFile.id,
            source: "knowledge_base",
            score,
            title: kbFile.filePath.split("/").pop() || kbFile.filePath,
            snippet: snippetInfo.snippet,
            match_offsets: snippetInfo.offsets,
            metadata: {
                file_path: kbFile.filePath,
                language: kbFile.language || undefined,
                repository_id: kbFile.repositoryId,
                project_id: kbFile.projectId,
                content_hash: kbFile.contentHash,
                size: kbFile.size || undefined,
                timestamp: kbFile.updatedAt?.toISOString(),
              },
            });
          }
        }
      }

      if ((search_mode === "semantic" || search_mode === "hybrid") && queryEmbedding) {
        const kbSemantic = await db
          .select({
            id: schema.knowledgeBaseFiles.id,
            filePath: schema.knowledgeBaseFiles.filePath,
            content: schema.knowledgeBaseFiles.content,
            contentHash: schema.knowledgeBaseFiles.contentHash,
            size: schema.knowledgeBaseFiles.size,
            language: schema.knowledgeBaseFiles.language,
            repositoryId: schema.knowledgeBaseFiles.repositoryId,
            projectId: schema.knowledgeBaseFiles.projectId,
            updatedAt: schema.knowledgeBaseFiles.updatedAt,
            embeddingJson: schema.knowledgeBaseFiles.embeddingJson,
          })
          .from(schema.knowledgeBaseFiles)
          .where(
            and(
              ...kbConditions,
              sql`${schema.knowledgeBaseFiles.embeddingJson} is not null`
            )
          )
          .orderBy(desc(schema.knowledgeBaseFiles.updatedAt))
          .limit(limit * 5);

        for (const kbFile of kbSemantic) {
          const semanticScore =
            semanticSimilarity(queryEmbedding, kbFile.embeddingJson as number[] | null) *
            SEMANTIC_SCORE_SCALE *
            SOURCE_WEIGHTS.knowledge_base;
          if (semanticScore <= 0) continue;

          const snippetInfo = buildSnippet(kbFile.content || kbFile.filePath, queryVariants);
          allResults.push({
            id: kbFile.id,
            source: "knowledge_base",
            score: semanticScore + recencyBoost(kbFile.updatedAt?.toISOString()),
            title: kbFile.filePath.split("/").pop() || kbFile.filePath,
            snippet: snippetInfo.snippet,
            match_offsets: snippetInfo.offsets,
            metadata: {
              file_path: kbFile.filePath,
              language: kbFile.language || undefined,
              repository_id: kbFile.repositoryId,
              project_id: kbFile.projectId,
              content_hash: kbFile.contentHash,
              size: kbFile.size || undefined,
              timestamp: kbFile.updatedAt?.toISOString(),
            },
          });
        }
      }
    } catch (error) {
      logger.error("Knowledge base search error", error instanceof Error ? error : undefined, { details: String(error) });
    }

    // ========================================================================
    // Search Saved Contexts with context relevance
    // ========================================================================
    try {
      const contexts = await db
        .select({
          id: schema.savedContexts.id,
          name: schema.savedContexts.name,
          description: schema.savedContexts.description,
          messages: schema.savedContexts.messages,
          tags: schema.savedContexts.tags,
          projectId: schema.savedContexts.projectId,
          createdAt: schema.savedContexts.createdAt,
          embeddingJson: schema.savedContexts.embeddingJson,
        })
        .from(schema.savedContexts)
        .where(
          and(
            eq(schema.savedContexts.userId, userId),
            or(
              like(schema.savedContexts.name, `%${query}%`),
              like(schema.savedContexts.description, `%${query}%`)
            )
          )
        )
        .orderBy(desc(schema.savedContexts.createdAt))
        .limit(limit);

      for (const ctx of contexts) {
        let score = computeScore(
          query,
          (ctx.description || "") + " " + (ctx.name || ""),
          ctx.name,
          "context",
          ctx.createdAt?.toISOString()
        );
        const semanticScore =
          semanticSimilarity(queryEmbedding, ctx.embeddingJson as number[] | null) *
          SEMANTIC_SCORE_SCALE *
          SOURCE_WEIGHTS.context;

        // Boost if context messages match current conversation topics
        if (ctx.messages && Array.isArray(ctx.messages)) {
          const messageText = ctx.messages.map((m: any) => m.content || "").join(" ");
          score += Math.min(CONTEXT_BOOST_MAX, applyContextBoost(messageText, uniqueContextTerms) * 0.6);
        }

        if (semanticScore > 0) score += semanticScore * 0.5;

        if (score > 0) {
          const snippetInfo = buildSnippet(ctx.description || ctx.name, queryVariants);
          allResults.push({
            id: ctx.id,
            source: "context",
            score,
            title: ctx.name,
            snippet: snippetInfo.snippet || ctx.description || `Saved context with ${(ctx.messages || []).length} messages`,
            match_offsets: snippetInfo.offsets,
            metadata: {
              project_id: ctx.projectId,
              tags: ctx.tags || undefined,
              timestamp: ctx.createdAt?.toISOString(),
            },
          });
        }
      }
    } catch (error) {
      logger.error("Context search error", error instanceof Error ? error : undefined, { details: String(error) });
    }

    if ((search_mode === "semantic" || search_mode === "hybrid") && queryEmbedding) {
      try {
        const contexts = await db
          .select({
            id: schema.savedContexts.id,
            name: schema.savedContexts.name,
            description: schema.savedContexts.description,
            messages: schema.savedContexts.messages,
            tags: schema.savedContexts.tags,
            projectId: schema.savedContexts.projectId,
            createdAt: schema.savedContexts.createdAt,
            embeddingJson: schema.savedContexts.embeddingJson,
          })
          .from(schema.savedContexts)
          .where(
            and(
              eq(schema.savedContexts.userId, userId),
              sql`${schema.savedContexts.embeddingJson} is not null`
            )
          )
          .orderBy(desc(schema.savedContexts.createdAt))
          .limit(limit * 5);

        for (const ctx of contexts) {
          const semanticScore =
            semanticSimilarity(queryEmbedding, ctx.embeddingJson as number[] | null) *
            SEMANTIC_SCORE_SCALE *
            SOURCE_WEIGHTS.context;
          if (semanticScore <= 0) continue;

          const snippetInfo = buildSnippet(ctx.description || ctx.name, queryVariants);
          allResults.push({
            id: ctx.id,
            source: "context",
            score: semanticScore + recencyBoost(ctx.createdAt?.toISOString()),
            title: ctx.name,
            snippet: snippetInfo.snippet || ctx.description || `Saved context with ${(ctx.messages || []).length} messages`,
            match_offsets: snippetInfo.offsets,
            metadata: {
              project_id: ctx.projectId,
              tags: ctx.tags || undefined,
              timestamp: ctx.createdAt?.toISOString(),
            },
          });
        }
      } catch (error) {
        logger.error("Context semantic search error", error instanceof Error ? error : undefined, { details: String(error) });
      }
    }

    // ========================================================================
    // Search Chat Messages
    // ========================================================================
    try {
      const messages = await db
        .select({
          id: schema.chatMessages.id,
          role: schema.chatMessages.role,
          content: schema.chatMessages.content,
          timestamp: schema.chatMessages.timestamp,
          projectId: schema.chatMessages.projectId,
          sessionId: schema.chatMessages.sessionId,
        })
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.userId, userId),
            like(schema.chatMessages.content, `%${query}%`)
          )
        )
        .orderBy(desc(schema.chatMessages.timestamp))
        .limit(limit * 2);

      for (const msg of messages) {
        const score = computeScore(
          query,
          msg.content || "",
          undefined,
          "message",
          msg.timestamp?.toISOString()
        );

        if (score > 0) {
          const snippetInfo = buildSnippet(msg.content || "", queryVariants);
          allResults.push({
            id: msg.id,
            source: "message",
            score,
            title: `${msg.role}: ${(msg.content || "").slice(0, 50)}...`,
            snippet: snippetInfo.snippet,
            match_offsets: snippetInfo.offsets,
            metadata: {
              role: msg.role,
              project_id: msg.projectId,
              session_id: msg.sessionId,
              timestamp: msg.timestamp?.toISOString(),
            },
          });
        }
      }
    } catch (error) {
      logger.error("Message search error", error instanceof Error ? error : undefined, { details: String(error) });
    }

    // ========================================================================
    // Merge and paginate results
    // ========================================================================
    const mergedResults = mergeResults(allResults);
    const total = mergedResults.length;
    const paginatedResults = mergedResults.slice(offset, offset + limit);

    // Build response
    const response: any = {
      query,
      context_length: context.length,
      search_mode,
      data: paginatedResults,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
      },
    };

    // Include source breakdown if requested
    if (include_sources) {
      const sourceBreakdown: Record<string, number> = {};
      for (const result of mergedResults) {
        sourceBreakdown[result.source] = (sourceBreakdown[result.source] || 0) + 1;
      }
      response.source_breakdown = sourceBreakdown;
    }

    res.json(response);
  })
);

// ============================================================================
// GET /v1/universal-search/sources - List available search sources
// ============================================================================

router.get(
  "/sources",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;

    // Get counts of available sources
    const [
      repoCount,
      contextCount,
      messageCount,
      kbFileCount,
      kbArtifactCount,
    ] = await Promise.all([
      db
        .select({ count: schema.repositories.id })
        .from(schema.repositories)
        .where(eq(schema.repositories.userId, userId))
        .then((r: any) => r.length),
      db
        .select({ count: schema.savedContexts.id })
        .from(schema.savedContexts)
        .where(eq(schema.savedContexts.userId, userId))
        .then((r: any) => r.length),
      db
        .select({ count: schema.chatMessages.id })
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.userId, userId))
        .then((r: any) => r.length),
      db
        .select({ count: schema.knowledgeBaseFiles.id })
        .from(schema.knowledgeBaseFiles)
        .where(eq(schema.knowledgeBaseFiles.userId, userId))
        .then((r: any) => r.length),
      db
        .select({ count: schema.knowledgeBaseArtifacts.id })
        .from(schema.knowledgeBaseArtifacts)
        .where(eq(schema.knowledgeBaseArtifacts.userId, userId))
        .then((r: any) => r.length),
    ]);

    res.json({
      sources: [
        {
          id: "code",
          name: "Code Embeddings",
          description: "Search indexed code symbols and content",
          available: true,
          indexed_repositories: repoCount,
        },
        {
          id: "knowledge_base",
          name: "Knowledge Base",
          description: "Search persistent knowledge base file content",
          available: true,
          count: kbFileCount,
        },
        {
          id: "artifact",
          name: "Knowledge Artifacts",
          description: "Search export and pipeline artifacts",
          available: true,
          count: kbArtifactCount,
        },
        {
          id: "context",
          name: "Saved Contexts",
          description: "Search saved conversation contexts",
          available: true,
          count: contextCount,
        },
        {
          id: "message",
          name: "Chat Messages",
          description: "Search chat message history",
          available: true,
          count: messageCount,
        },
        {
          id: "repository",
          name: "Repositories",
          description: "Search repository metadata",
          available: true,
          count: repoCount,
        },
        {
          id: "data_source",
          name: "Data Sources",
          description: "Search documentation and external data sources",
          available: true,
        },
      ],
      search_modes: [
        {
          id: "unified",
          name: "Unified",
          description: "Text-based search across all sources",
        },
        {
          id: "hybrid",
          name: "Hybrid",
          description: "Combined text and semantic search",
        },
        {
          id: "semantic",
          name: "Semantic",
          description: "Embedding-based semantic search",
        },
      ],
    });
  })
);

export default router;
