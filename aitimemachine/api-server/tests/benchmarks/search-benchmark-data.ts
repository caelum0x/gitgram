/**
 * Semantic Search Relevance Benchmark Dataset
 *
 * 50+ query-result pairs covering code search, checkpoint search,
 * conversation search, and multi-modal (mixed) queries. Each pair
 * specifies expected results with ranked ordering.
 *
 * Categories:
 *   code        - Finding source files, functions, classes
 *   checkpoint  - Finding checkpoints by description / time
 *   conversation- Finding chat messages / discussion threads
 *   multi       - Mixed results spanning multiple sources
 *
 * Difficulty:
 *   easy   - Exact keyword match expected
 *   medium - Requires fuzzy / synonym matching
 *   hard   - Requires semantic understanding or multi-hop reasoning
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BenchmarkCategory = "code" | "checkpoint" | "conversation" | "multi";
export type BenchmarkDifficulty = "easy" | "medium" | "hard";

export interface ExpectedResult {
  /** Which search source this result should come from */
  source: "code" | "knowledge_base" | "artifact" | "context" | "message" | "repository";
  /** If set, the result title must contain this substring (case-insensitive) */
  title_contains?: string;
  /** If set, the result snippet must contain this substring (case-insensitive) */
  snippet_contains?: string;
  /** If set, metadata.file_path must contain this substring */
  file_path_contains?: string;
  /** If set, metadata.symbol must contain this substring */
  symbol_contains?: string;
  /** If set, metadata.symbol_type must equal this value */
  symbol_type?: string;
  /** Relevance grade used for NDCG: 3 = perfect, 2 = good, 1 = partial, 0 = irrelevant */
  relevance_grade: number;
}

export interface BenchmarkQuery {
  /** Unique identifier for this benchmark case */
  id: string;
  /** Human-readable name */
  name: string;
  /** The search query string */
  query: string;
  /** Which endpoint to target: "search" uses /universal-search, "query" uses /universal-search/query */
  endpoint?: "search" | "query";
  /** Search mode override */
  search_mode?: "unified" | "hybrid" | "semantic";
  /** Restrict to specific sources */
  sources?: string[];
  /** Restrict to specific repositories */
  repositories?: string[];
  /** Expected results in priority order (first = most relevant) */
  expected_results: ExpectedResult[];
  /** Search category */
  category: BenchmarkCategory;
  /** Difficulty level */
  difficulty: BenchmarkDifficulty;
  /** Optional weight for aggregate metrics (default 1.0) */
  weight?: number;
}

// ---------------------------------------------------------------------------
// Benchmark Dataset
// ---------------------------------------------------------------------------

export const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  // =========================================================================
  // CODE SEARCH - Easy (exact matches)
  // =========================================================================
  {
    id: "code-001",
    name: "Find authentication middleware",
    query: "authentication middleware",
    sources: ["code", "knowledge_base"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "auth", relevance_grade: 3 },
      { source: "code", symbol_contains: "auth", relevance_grade: 2 },
      { source: "knowledge_base", file_path_contains: "auth", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-002",
    name: "Find the search engine implementation",
    query: "SearchEngine class",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", symbol_contains: "SearchEngine", symbol_type: "class", relevance_grade: 3 },
      { source: "code", file_path_contains: "search-engine", relevance_grade: 3 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-003",
    name: "Find checkpoint creation logic",
    query: "createCheckpoint function",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", symbol_contains: "createCheckpoint", relevance_grade: 3 },
      { source: "code", snippet_contains: "checkpoint", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-004",
    name: "Find database schema definitions",
    query: "database schema table definition",
    sources: ["code", "knowledge_base"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "schema", relevance_grade: 3 },
      { source: "knowledge_base", file_path_contains: "schema", relevance_grade: 2 },
      { source: "code", snippet_contains: "CREATE TABLE", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-005",
    name: "Find error handling utilities",
    query: "error handling middleware",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "error", relevance_grade: 3 },
      { source: "code", symbol_contains: "Error", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-006",
    name: "Find API route definitions",
    query: "router.post API endpoint",
    sources: ["code"],
    search_mode: "unified",
    expected_results: [
      { source: "code", snippet_contains: "router.post", relevance_grade: 3 },
      { source: "code", file_path_contains: "routes", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-007",
    name: "Find embedding generation code",
    query: "generateEmbedding",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", symbol_contains: "generateEmbedding", relevance_grade: 3 },
      { source: "code", file_path_contains: "embedding", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-008",
    name: "Find session management code",
    query: "session manager",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "session", relevance_grade: 3 },
      { source: "code", symbol_contains: "Session", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },

  // =========================================================================
  // CODE SEARCH - Medium (fuzzy / variant matching)
  // =========================================================================
  {
    id: "code-009",
    name: "Find code indexer using snake_case query",
    query: "code_indexer",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "code-indexer", relevance_grade: 3 },
      { source: "code", symbol_contains: "CodeIndexer", relevance_grade: 3 },
      { source: "code", snippet_contains: "index", relevance_grade: 1 },
    ],
    category: "code",
    difficulty: "medium",
  },
  {
    id: "code-010",
    name: "Find diff engine with natural language",
    query: "file difference comparison",
    sources: ["code", "knowledge_base"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "diff", relevance_grade: 3 },
      { source: "code", symbol_contains: "diff", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "diff", relevance_grade: 1 },
    ],
    category: "code",
    difficulty: "medium",
  },
  {
    id: "code-011",
    name: "Find bloom filter with typo",
    query: "bloom filtr implementation",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "bloom-filter", relevance_grade: 3 },
      { source: "code", symbol_contains: "BloomFilter", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "medium",
  },
  {
    id: "code-012",
    name: "Find retention policy using synonym",
    query: "data lifecycle cleanup policy",
    sources: ["code", "knowledge_base"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "retention", relevance_grade: 3 },
      { source: "code", snippet_contains: "retention", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "retention", relevance_grade: 1 },
    ],
    category: "code",
    difficulty: "medium",
  },
  {
    id: "code-013",
    name: "Find webhook delivery logic",
    query: "webhook event delivery notification",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "webhook", relevance_grade: 3 },
      { source: "code", symbol_contains: "webhook", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "medium",
  },

  // =========================================================================
  // CODE SEARCH - Hard (semantic understanding)
  // =========================================================================
  {
    id: "code-014",
    name: "Find code that handles user permissions",
    query: "who can access what resources",
    sources: ["code", "knowledge_base"],
    search_mode: "semantic",
    expected_results: [
      { source: "code", file_path_contains: "auth", relevance_grade: 3 },
      { source: "code", snippet_contains: "permission", relevance_grade: 2 },
      { source: "code", snippet_contains: "role", relevance_grade: 1 },
    ],
    category: "code",
    difficulty: "hard",
    weight: 1.5,
  },
  {
    id: "code-015",
    name: "Find code for making things faster",
    query: "performance optimization caching strategy",
    sources: ["code", "knowledge_base"],
    search_mode: "semantic",
    expected_results: [
      { source: "code", snippet_contains: "cache", relevance_grade: 3 },
      { source: "code", file_path_contains: "cache", relevance_grade: 2 },
      { source: "code", snippet_contains: "optim", relevance_grade: 1 },
    ],
    category: "code",
    difficulty: "hard",
    weight: 1.5,
  },
  {
    id: "code-016",
    name: "Find how data is persisted to storage",
    query: "save data to disk persistence layer",
    sources: ["code", "knowledge_base"],
    search_mode: "semantic",
    expected_results: [
      { source: "code", file_path_contains: "storage", relevance_grade: 3 },
      { source: "code", snippet_contains: "write", relevance_grade: 2 },
      { source: "code", snippet_contains: "save", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "hard",
    weight: 1.5,
  },

  // =========================================================================
  // CHECKPOINT SEARCH - Easy
  // =========================================================================
  {
    id: "cp-001",
    name: "Find checkpoint about API routes refactor",
    query: "refactored API routes",
    sources: ["context", "knowledge_base"],
    search_mode: "hybrid",
    expected_results: [
      { source: "context", title_contains: "refactor", relevance_grade: 3 },
      { source: "context", snippet_contains: "route", relevance_grade: 2 },
    ],
    category: "checkpoint",
    difficulty: "easy",
  },
  {
    id: "cp-002",
    name: "Find checkpoint for database migration",
    query: "database migration schema change",
    sources: ["context", "knowledge_base"],
    search_mode: "hybrid",
    expected_results: [
      { source: "context", snippet_contains: "migration", relevance_grade: 3 },
      { source: "context", snippet_contains: "schema", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "migration", relevance_grade: 1 },
    ],
    category: "checkpoint",
    difficulty: "easy",
  },
  {
    id: "cp-003",
    name: "Find checkpoint about adding new feature",
    query: "added search functionality",
    sources: ["context"],
    search_mode: "hybrid",
    expected_results: [
      { source: "context", snippet_contains: "search", relevance_grade: 3 },
      { source: "context", title_contains: "search", relevance_grade: 2 },
    ],
    category: "checkpoint",
    difficulty: "easy",
  },
  {
    id: "cp-004",
    name: "Find checkpoint about fixing a bug",
    query: "fixed authentication bug",
    sources: ["context"],
    search_mode: "hybrid",
    expected_results: [
      { source: "context", snippet_contains: "fix", relevance_grade: 3 },
      { source: "context", snippet_contains: "auth", relevance_grade: 2 },
    ],
    category: "checkpoint",
    difficulty: "easy",
  },

  // =========================================================================
  // CHECKPOINT SEARCH - Medium
  // =========================================================================
  {
    id: "cp-005",
    name: "Find when I refactored the API routes",
    query: "when did I refactor the API routes",
    endpoint: "query",
    search_mode: "hybrid",
    expected_results: [
      { source: "context", snippet_contains: "refactor", relevance_grade: 3 },
      { source: "context", snippet_contains: "API", relevance_grade: 2 },
      { source: "message", snippet_contains: "refactor", relevance_grade: 1 },
    ],
    category: "checkpoint",
    difficulty: "medium",
  },
  {
    id: "cp-006",
    name: "Find checkpoint about deployment changes",
    query: "production deployment configuration update",
    sources: ["context", "knowledge_base"],
    search_mode: "hybrid",
    expected_results: [
      { source: "context", snippet_contains: "deploy", relevance_grade: 3 },
      { source: "knowledge_base", file_path_contains: "deploy", relevance_grade: 2 },
    ],
    category: "checkpoint",
    difficulty: "medium",
  },
  {
    id: "cp-007",
    name: "Find checkpoint about test improvements",
    query: "improved test coverage integration tests",
    sources: ["context", "knowledge_base"],
    search_mode: "hybrid",
    expected_results: [
      { source: "context", snippet_contains: "test", relevance_grade: 3 },
      { source: "knowledge_base", snippet_contains: "test", relevance_grade: 2 },
    ],
    category: "checkpoint",
    difficulty: "medium",
  },

  // =========================================================================
  // CHECKPOINT SEARCH - Hard
  // =========================================================================
  {
    id: "cp-008",
    name: "Find checkpoint about performance issue resolution",
    query: "resolved the slow query issue that was causing timeouts",
    endpoint: "query",
    search_mode: "semantic",
    expected_results: [
      { source: "context", snippet_contains: "performance", relevance_grade: 3 },
      { source: "context", snippet_contains: "timeout", relevance_grade: 3 },
      { source: "message", snippet_contains: "slow", relevance_grade: 2 },
    ],
    category: "checkpoint",
    difficulty: "hard",
    weight: 1.5,
  },

  // =========================================================================
  // CONVERSATION SEARCH - Easy
  // =========================================================================
  {
    id: "conv-001",
    name: "Find discussion about database schema",
    query: "discussion about database schema",
    sources: ["message", "context"],
    search_mode: "hybrid",
    expected_results: [
      { source: "message", snippet_contains: "database", relevance_grade: 3 },
      { source: "message", snippet_contains: "schema", relevance_grade: 2 },
      { source: "context", snippet_contains: "database", relevance_grade: 1 },
    ],
    category: "conversation",
    difficulty: "easy",
  },
  {
    id: "conv-002",
    name: "Find messages about API design",
    query: "API endpoint design",
    sources: ["message"],
    search_mode: "hybrid",
    expected_results: [
      { source: "message", snippet_contains: "API", relevance_grade: 3 },
      { source: "message", snippet_contains: "endpoint", relevance_grade: 2 },
    ],
    category: "conversation",
    difficulty: "easy",
  },
  {
    id: "conv-003",
    name: "Find messages about error handling",
    query: "error handling discussion",
    sources: ["message"],
    search_mode: "unified",
    expected_results: [
      { source: "message", snippet_contains: "error", relevance_grade: 3 },
      { source: "message", snippet_contains: "handling", relevance_grade: 2 },
    ],
    category: "conversation",
    difficulty: "easy",
  },
  {
    id: "conv-004",
    name: "Find messages about testing strategy",
    query: "testing strategy unit tests",
    sources: ["message"],
    search_mode: "hybrid",
    expected_results: [
      { source: "message", snippet_contains: "test", relevance_grade: 3 },
      { source: "message", snippet_contains: "unit", relevance_grade: 2 },
    ],
    category: "conversation",
    difficulty: "easy",
  },
  {
    id: "conv-005",
    name: "Find messages about deployment",
    query: "deploying to production",
    sources: ["message"],
    search_mode: "hybrid",
    expected_results: [
      { source: "message", snippet_contains: "deploy", relevance_grade: 3 },
      { source: "message", snippet_contains: "production", relevance_grade: 2 },
    ],
    category: "conversation",
    difficulty: "easy",
  },

  // =========================================================================
  // CONVERSATION SEARCH - Medium
  // =========================================================================
  {
    id: "conv-006",
    name: "Find conversation about architecture decisions",
    query: "architecture decision trade-offs",
    sources: ["message", "context"],
    search_mode: "hybrid",
    expected_results: [
      { source: "message", snippet_contains: "architect", relevance_grade: 3 },
      { source: "context", snippet_contains: "decision", relevance_grade: 2 },
      { source: "message", snippet_contains: "design", relevance_grade: 1 },
    ],
    category: "conversation",
    difficulty: "medium",
  },
  {
    id: "conv-007",
    name: "Find debugging session conversation",
    query: "debugging the memory leak",
    sources: ["message", "context"],
    search_mode: "hybrid",
    expected_results: [
      { source: "message", snippet_contains: "debug", relevance_grade: 3 },
      { source: "message", snippet_contains: "memory", relevance_grade: 2 },
      { source: "context", snippet_contains: "leak", relevance_grade: 1 },
    ],
    category: "conversation",
    difficulty: "medium",
  },
  {
    id: "conv-008",
    name: "Find conversation about code review feedback",
    query: "code review feedback suggestions",
    sources: ["message"],
    search_mode: "hybrid",
    expected_results: [
      { source: "message", snippet_contains: "review", relevance_grade: 3 },
      { source: "message", snippet_contains: "feedback", relevance_grade: 2 },
    ],
    category: "conversation",
    difficulty: "medium",
  },

  // =========================================================================
  // CONVERSATION SEARCH - Hard
  // =========================================================================
  {
    id: "conv-009",
    name: "Find conversation about why we chose this approach",
    query: "why did we decide to use this approach instead of the alternative",
    endpoint: "query",
    search_mode: "semantic",
    expected_results: [
      { source: "message", snippet_contains: "decision", relevance_grade: 3 },
      { source: "message", snippet_contains: "approach", relevance_grade: 2 },
      { source: "context", snippet_contains: "alternative", relevance_grade: 1 },
    ],
    category: "conversation",
    difficulty: "hard",
    weight: 1.5,
  },
  {
    id: "conv-010",
    name: "Find conversation about that tricky problem yesterday",
    query: "the tricky edge case we found in parsing",
    endpoint: "query",
    search_mode: "semantic",
    expected_results: [
      { source: "message", snippet_contains: "edge case", relevance_grade: 3 },
      { source: "message", snippet_contains: "pars", relevance_grade: 2 },
      { source: "context", snippet_contains: "bug", relevance_grade: 1 },
    ],
    category: "conversation",
    difficulty: "hard",
    weight: 1.5,
  },

  // =========================================================================
  // MULTI-MODAL SEARCH - Easy
  // =========================================================================
  {
    id: "multi-001",
    name: "Find everything about search implementation",
    query: "search implementation",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "search", relevance_grade: 3 },
      { source: "knowledge_base", file_path_contains: "search", relevance_grade: 2 },
      { source: "message", snippet_contains: "search", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "easy",
  },
  {
    id: "multi-002",
    name: "Find everything about checkpoints",
    query: "checkpoint system",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", snippet_contains: "checkpoint", relevance_grade: 3 },
      { source: "context", snippet_contains: "checkpoint", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "checkpoint", relevance_grade: 2 },
      { source: "message", snippet_contains: "checkpoint", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "easy",
  },
  {
    id: "multi-003",
    name: "Find everything about embeddings",
    query: "embeddings vector storage",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "embedding", relevance_grade: 3 },
      { source: "code", symbol_contains: "embedding", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "embedding", relevance_grade: 2 },
    ],
    category: "multi",
    difficulty: "easy",
  },
  {
    id: "multi-004",
    name: "Find everything about the billing system",
    query: "billing subscription payment",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "billing", relevance_grade: 3 },
      { source: "code", snippet_contains: "payment", relevance_grade: 2 },
      { source: "message", snippet_contains: "billing", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "easy",
  },

  // =========================================================================
  // MULTI-MODAL SEARCH - Medium
  // =========================================================================
  {
    id: "multi-005",
    name: "Changes to payment processing last week",
    query: "changes to payment processing last week",
    endpoint: "query",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "billing", relevance_grade: 3 },
      { source: "context", snippet_contains: "payment", relevance_grade: 2 },
      { source: "message", snippet_contains: "payment", relevance_grade: 2 },
      { source: "code", snippet_contains: "payment", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "medium",
  },
  {
    id: "multi-006",
    name: "How does the sync system work end to end",
    query: "sync system architecture end to end flow",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "sync", relevance_grade: 3 },
      { source: "knowledge_base", snippet_contains: "sync", relevance_grade: 2 },
      { source: "message", snippet_contains: "sync", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "medium",
  },
  {
    id: "multi-007",
    name: "Find all knowledge base indexing references",
    query: "knowledge base indexing pipeline",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "knowledge", relevance_grade: 3 },
      { source: "code", file_path_contains: "index", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "index", relevance_grade: 2 },
      { source: "artifact", snippet_contains: "index", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "medium",
  },
  {
    id: "multi-008",
    name: "Find SSO and authentication related items",
    query: "single sign-on SSO authentication SAML",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "sso", relevance_grade: 3 },
      { source: "code", file_path_contains: "auth", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "SSO", relevance_grade: 2 },
    ],
    category: "multi",
    difficulty: "medium",
  },
  {
    id: "multi-009",
    name: "Find export and restore functionality",
    query: "export session data restore backup",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "export", relevance_grade: 3 },
      { source: "code", file_path_contains: "restore", relevance_grade: 3 },
      { source: "knowledge_base", snippet_contains: "export", relevance_grade: 2 },
      { source: "context", snippet_contains: "backup", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "medium",
  },

  // =========================================================================
  // MULTI-MODAL SEARCH - Hard
  // =========================================================================
  {
    id: "multi-010",
    name: "Understand the complete data flow",
    query: "how does data flow from user input to persistent storage",
    endpoint: "query",
    search_mode: "semantic",
    expected_results: [
      { source: "code", file_path_contains: "storage", relevance_grade: 3 },
      { source: "code", snippet_contains: "save", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "architecture", relevance_grade: 2 },
      { source: "message", snippet_contains: "flow", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "hard",
    weight: 2.0,
  },
  {
    id: "multi-011",
    name: "Find security-related code and discussions",
    query: "security vulnerability prevention input validation sanitization",
    search_mode: "semantic",
    expected_results: [
      { source: "code", snippet_contains: "valid", relevance_grade: 3 },
      { source: "code", snippet_contains: "saniti", relevance_grade: 2 },
      { source: "code", file_path_contains: "auth", relevance_grade: 2 },
      { source: "message", snippet_contains: "security", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "hard",
    weight: 2.0,
  },
  {
    id: "multi-012",
    name: "Find rate limiting and abuse prevention",
    query: "rate limiting throttling abuse prevention",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", snippet_contains: "rate", relevance_grade: 3 },
      { source: "code", snippet_contains: "limit", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "throttl", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "hard",
    weight: 1.5,
  },

  // =========================================================================
  // ADDITIONAL CODE SEARCH queries to reach 50+
  // =========================================================================
  {
    id: "code-017",
    name: "Find the timeline visualization code",
    query: "timeline visualizer",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "timeline", relevance_grade: 3 },
      { source: "code", symbol_contains: "Timeline", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-018",
    name: "Find the three-way merge implementation",
    query: "three way merge conflict resolution",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "three-way-merge", relevance_grade: 3 },
      { source: "code", snippet_contains: "merge", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-019",
    name: "Find file watcher implementation",
    query: "file watcher filesystem monitoring",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "file-watcher", relevance_grade: 3 },
      { source: "code", symbol_contains: "FileWatcher", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-020",
    name: "Find garbage collection code",
    query: "garbage collection gc cleanup",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "gc", relevance_grade: 3 },
      { source: "code", snippet_contains: "gc", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "easy",
  },
  {
    id: "code-021",
    name: "Find S3 storage integration",
    query: "S3 upload download bucket",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "s3", relevance_grade: 3 },
      { source: "code", snippet_contains: "S3", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "medium",
  },
  {
    id: "code-022",
    name: "Find web scraping / content extraction",
    query: "web content extraction HTML parsing",
    sources: ["code", "knowledge_base"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "web-search", relevance_grade: 3 },
      { source: "code", snippet_contains: "cheerio", relevance_grade: 2 },
      { source: "code", snippet_contains: "html", relevance_grade: 1 },
    ],
    category: "code",
    difficulty: "medium",
  },
  {
    id: "code-023",
    name: "Find the LLM integration service",
    query: "LLM language model AI integration",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "llm", relevance_grade: 3 },
      { source: "code", snippet_contains: "model", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "medium",
  },
  {
    id: "code-024",
    name: "Find email notification service",
    query: "email notification send template",
    sources: ["code"],
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "email", relevance_grade: 3 },
      { source: "code", snippet_contains: "resend", relevance_grade: 2 },
    ],
    category: "code",
    difficulty: "medium",
  },

  // =========================================================================
  // ADDITIONAL CONVERSATION queries
  // =========================================================================
  {
    id: "conv-011",
    name: "Find message about refactoring plan",
    query: "refactoring plan next steps",
    sources: ["message"],
    search_mode: "hybrid",
    expected_results: [
      { source: "message", snippet_contains: "refactor", relevance_grade: 3 },
      { source: "message", snippet_contains: "plan", relevance_grade: 2 },
    ],
    category: "conversation",
    difficulty: "easy",
  },
  {
    id: "conv-012",
    name: "Find message about configuration changes",
    query: "environment variable configuration",
    sources: ["message"],
    search_mode: "hybrid",
    expected_results: [
      { source: "message", snippet_contains: "config", relevance_grade: 3 },
      { source: "message", snippet_contains: "env", relevance_grade: 2 },
    ],
    category: "conversation",
    difficulty: "easy",
  },

  // =========================================================================
  // ADDITIONAL MULTI-MODAL queries
  // =========================================================================
  {
    id: "multi-013",
    name: "Find organization management features",
    query: "organization team member management",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "org", relevance_grade: 3 },
      { source: "code", snippet_contains: "member", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "organization", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "easy",
  },
  {
    id: "multi-014",
    name: "Find data pipeline processing code and docs",
    query: "data pipeline processing transformation",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "pipeline", relevance_grade: 3 },
      { source: "code", file_path_contains: "data-pipeline", relevance_grade: 3 },
      { source: "knowledge_base", snippet_contains: "pipeline", relevance_grade: 2 },
    ],
    category: "multi",
    difficulty: "medium",
  },
  {
    id: "multi-015",
    name: "Find health check and monitoring",
    query: "health check monitoring status endpoint",
    search_mode: "hybrid",
    expected_results: [
      { source: "code", file_path_contains: "health", relevance_grade: 3 },
      { source: "code", snippet_contains: "health", relevance_grade: 2 },
      { source: "knowledge_base", snippet_contains: "monitor", relevance_grade: 1 },
    ],
    category: "multi",
    difficulty: "easy",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get queries filtered by category */
export function getQueriesByCategory(category: BenchmarkCategory): BenchmarkQuery[] {
  return BENCHMARK_QUERIES.filter((q) => q.category === category);
}

/** Get queries filtered by difficulty */
export function getQueriesByDifficulty(difficulty: BenchmarkDifficulty): BenchmarkQuery[] {
  return BENCHMARK_QUERIES.filter((q) => q.difficulty === difficulty);
}

/** Get total count */
export function getBenchmarkCount(): number {
  return BENCHMARK_QUERIES.length;
}

/** Category summary */
export function getCategorySummary(): Record<BenchmarkCategory, number> {
  const summary: Record<BenchmarkCategory, number> = {
    code: 0,
    checkpoint: 0,
    conversation: 0,
    multi: 0,
  };
  for (const q of BENCHMARK_QUERIES) {
    summary[q.category]++;
  }
  return summary;
}

/** Difficulty summary */
export function getDifficultySummary(): Record<BenchmarkDifficulty, number> {
  const summary: Record<BenchmarkDifficulty, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
  };
  for (const q of BENCHMARK_QUERIES) {
    summary[q.difficulty]++;
  }
  return summary;
}
