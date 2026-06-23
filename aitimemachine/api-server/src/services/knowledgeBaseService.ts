import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KBDocumentType = "docs" | "tutorial" | "paper" | "snippet" | "session_notes";

export interface KBDocument {
  id: string;
  title: string;
  content: string;
  tags: string[];
  sourceUrl?: string;
  type: KBDocumentType;
  createdAt: Date;
  updatedAt: Date;
}

export interface KBDocumentInput {
  title: string;
  content: string;
  tags: string[];
  sourceUrl?: string;
  type: KBDocumentType;
}

export interface KBSearchFilters {
  type?: KBDocumentType;
  tags?: string[];
}

export interface KBSearchResult {
  document: KBDocument;
  relevanceScore: number;
  /** Relevant excerpt from the document with surrounding context. */
  snippet: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Tokenise a string into lowercase words, stripping punctuation.
 */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Build a term-frequency map for a list of tokens.
 */
function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

/**
 * Simple TF-IDF scoring against the in-memory corpus.
 *
 * score(doc) = sum over query terms of:
 *   tf(term, doc) * log(N / df(term) + 1)
 *
 * Normalised by document length so short, focused documents are not
 * unfairly penalised against large files.
 */
function tfidfScore(
  queryTokens: string[],
  docTokens: string[],
  dfMap: Map<string, number>,
  corpusSize: number
): number {
  const tf = termFrequency(docTokens);
  const docLength = docTokens.length || 1;
  let score = 0;

  for (const term of queryTokens) {
    const termTf = (tf.get(term) ?? 0) / docLength;
    const df = dfMap.get(term) ?? 0;
    const idf = Math.log((corpusSize + 1) / (df + 1)) + 1;
    score += termTf * idf;
  }

  return score;
}

/**
 * BM25 scoring (Okapi BM25) — outperforms plain TF-IDF on longer documents
 * because term-frequency contributions are saturated at high counts.
 *
 * score(doc) = sum over query terms of:
 *   IDF(term) * tf(term, doc) * (k1 + 1)
 *             / (tf(term, doc) + k1 * (1 - b + b * |D| / avgdl))
 *
 * k1 = 1.5  (term-saturation factor)
 * b  = 0.75 (length normalisation factor)
 */
function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  dfMap: Map<string, number>,
  corpusSize: number,
  avgDocLength: number
): number {
  const k1 = 1.5;
  const b = 0.75;
  const tf = termFrequency(docTokens);
  const docLength = docTokens.length || 1;
  let score = 0;

  for (const term of queryTokens) {
    const df = dfMap.get(term) ?? 0;
    if (df === 0) continue;
    const idf = Math.log((corpusSize - df + 0.5) / (df + 0.5) + 1);
    const freq = tf.get(term) ?? 0;
    const lengthNorm = 1 - b + b * (docLength / (avgDocLength || 1));
    const bm25tf = (freq * (k1 + 1)) / (freq + k1 * lengthNorm);
    score += idf * bm25tf;
  }

  return score;
}

/**
 * Levenshtein edit distance for fuzzy matching.
 * Uses the standard DP approach; capped at maxDist for early exit.
 */
function editDistance(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev.splice(0, b.length + 1, ...curr);
  }
  return prev[b.length];
}

/**
 * Expand a list of query tokens with fuzzy variants found in the corpus
 * vocabulary (edit distance <= 1 for terms >= 4 chars, exact otherwise).
 */
function fuzzyExpand(queryTokens: string[], vocabulary: Set<string>): string[] {
  const expanded = new Set<string>(queryTokens);
  for (const qToken of queryTokens) {
    if (qToken.length < 4) continue;
    const maxDist = qToken.length <= 6 ? 1 : 2;
    for (const vocabTerm of vocabulary) {
      if (Math.abs(vocabTerm.length - qToken.length) > maxDist) continue;
      if (editDistance(qToken, vocabTerm, maxDist) <= maxDist) {
        expanded.add(vocabTerm);
      }
    }
  }
  return [...expanded];
}

/**
 * Extract a ~160-character snippet from the document content that best
 * surrounds the first occurrence of any query term. Falls back to the
 * start of the content when no term is found.
 */
function extractSnippet(content: string, queryTokens: string[]): string {
  const WINDOW = 160;
  const lower = content.toLowerCase();
  let bestPos = -1;

  for (const token of queryTokens) {
    const idx = lower.indexOf(token);
    if (idx !== -1 && (bestPos === -1 || idx < bestPos)) {
      bestPos = idx;
    }
  }

  if (bestPos === -1) {
    return content.slice(0, WINDOW).trim() + (content.length > WINDOW ? "…" : "");
  }

  const half = Math.floor(WINDOW / 2);
  const start = Math.max(0, bestPos - half);
  const end = Math.min(content.length, bestPos + half + queryTokens[0].length);
  const raw = content.slice(start, end).trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${raw}${suffix}`;
}

// ---------------------------------------------------------------------------
// Auto-tagging
// ---------------------------------------------------------------------------

const LANGUAGE_KEYWORDS = new Set([
  "typescript", "javascript", "python", "golang", "go", "rust", "java", "kotlin",
  "swift", "csharp", "cpp", "ruby", "php", "scala", "haskell", "elixir",
  "bash", "shell", "sql", "graphql", "css", "html",
]);

const FRAMEWORK_KEYWORDS = new Set([
  "react", "nextjs", "vue", "angular", "svelte", "express", "fastapi", "django",
  "rails", "laravel", "spring", "nestjs", "hono", "drizzle", "prisma", "sequelize",
  "tailwind", "shadcn", "radix", "vitest", "jest", "playwright", "storybook",
  "webpack", "vite", "turbo", "nx", "docker", "kubernetes", "terraform",
  "postgres", "mysql", "mongodb", "redis", "elasticsearch", "supabase", "neon",
]);

const TECH_KEYWORDS = new Set([
  "api", "rest", "grpc", "websocket", "auth", "oauth", "jwt", "webhook",
  "cron", "queue", "cache", "migration", "schema", "index", "transaction",
  "llm", "openai", "anthropic", "claude", "embedding", "rag", "agent",
  "git", "ci", "cd", "deploy", "rollback", "snapshot", "checkpoint",
]);

/**
 * Scan content for programming language names, framework names, and tech
 * keywords. Returns a deduplicated array of matched tag strings.
 */
export function extractTags(content: string): string[] {
  const normalised = content.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const words = new Set(normalised.split(/\s+/).filter((w) => w.length > 1));
  const found: string[] = [];

  for (const word of words) {
    if (LANGUAGE_KEYWORDS.has(word)) found.push(word);
    else if (FRAMEWORK_KEYWORDS.has(word)) found.push(word);
    else if (TECH_KEYWORDS.has(word)) found.push(word);
  }

  return [...new Set(found)];
}

// ---------------------------------------------------------------------------
// TF-IDF vector helpers for cosine similarity
// ---------------------------------------------------------------------------

/**
 * Build a TF-IDF weight vector for a document, keyed by term.
 */
function buildTfidfVector(
  docTokens: string[],
  dfMap: Map<string, number>,
  corpusSize: number
): Map<string, number> {
  const tf = termFrequency(docTokens);
  const docLength = docTokens.length || 1;
  const vector = new Map<string, number>();

  for (const [term, count] of tf) {
    const termTf = count / docLength;
    const df = dfMap.get(term) ?? 0;
    const idf = Math.log((corpusSize + 1) / (df + 1)) + 1;
    vector.set(term, termTf * idf);
  }
  return vector;
}

/**
 * Cosine similarity between two TF-IDF vectors.
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [term, weightA] of a) {
    magA += weightA * weightA;
    const weightB = b.get(term);
    if (weightB !== undefined) dot += weightA * weightB;
  }
  for (const [, weightB] of b) magB += weightB * weightB;

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Extract function names, file paths, and error keywords from free-form text.
 */
function extractSessionKeywords(notes: string): string[] {
  const functionNames = [...notes.matchAll(/\bfunction\s+(\w+)/g)].map((m) => m[1]);
  const arrowFunctions = [...notes.matchAll(/\b(\w+)\s*=\s*(?:async\s*)?\(/g)].map((m) => m[1]);
  const filePaths = [...notes.matchAll(/[\w./\\-]+\.[a-z]{2,4}/gi)].map((m) =>
    m[0].replace(/[./\\]/g, " ").trim()
  );
  const errorWords = [...notes.matchAll(/\b(error|exception|fix|resolved|bug|issue|TypeError|ReferenceError)\b/gi)].map(
    (m) => m[1].toLowerCase()
  );

  return [...new Set([...functionNames, ...arrowFunctions, ...filePaths, ...errorWords])].filter(
    (k) => k.length > 1
  );
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const store = new Map<string, KBDocument>();

interface CorpusStats {
  dfMap: Map<string, number>;
  avgDocLength: number;
  vocabulary: Set<string>;
}

/**
 * Rebuild the document-frequency map, average document length, and full
 * vocabulary over the entire in-memory corpus. Called lazily before search
 * operations; cheap at typical corpus sizes.
 */
function buildCorpusStats(): CorpusStats {
  const dfMap = new Map<string, number>();
  const vocabulary = new Set<string>();
  let totalLength = 0;
  let docCount = 0;

  for (const doc of store.values()) {
    const tokens = tokenise(`${doc.title} ${doc.content} ${doc.tags.join(" ")}`);
    totalLength += tokens.length;
    docCount += 1;
    const unique = new Set(tokens);
    for (const term of unique) {
      dfMap.set(term, (dfMap.get(term) ?? 0) + 1);
      vocabulary.add(term);
    }
  }

  return { dfMap, avgDocLength: docCount > 0 ? totalLength / docCount : 1, vocabulary };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store a document and return its generated ID.
 */
export async function indexDocument(doc: KBDocumentInput): Promise<string> {
  const id = generateId("kb");
  const now = new Date();
  const stored: KBDocument = {
    id,
    title: doc.title,
    content: doc.content,
    tags: [...doc.tags],
    sourceUrl: doc.sourceUrl,
    type: doc.type,
    createdAt: now,
    updatedAt: now,
  };
  store.set(id, stored);
  return id;
}

/**
 * Full-text search with BM25 ranking, fuzzy query expansion, and snippet
 * extraction. Returns the top 10 documents matching the query and filters.
 *
 * Scoring pipeline:
 *  1. Tokenise the raw query.
 *  2. Fuzzy-expand tokens against the corpus vocabulary (edit distance <= 1
 *     for terms >= 4 chars, <= 2 for terms >= 7 chars).
 *  3. Rank all candidate documents with Okapi BM25.
 *  4. Attach a relevant ~160-char snippet from each document.
 */
export async function searchDocuments(
  query: string,
  filters?: KBSearchFilters
): Promise<KBSearchResult[]> {
  const rawTokens = tokenise(query);
  if (rawTokens.length === 0) return [];

  const { dfMap, avgDocLength, vocabulary } = buildCorpusStats();
  const corpusSize = store.size;
  const queryTokens = fuzzyExpand(rawTokens, vocabulary);

  const candidates = [...store.values()].filter((doc) => {
    if (filters?.type && doc.type !== filters.type) return false;
    if (filters?.tags && filters.tags.length > 0) {
      const hasTag = filters.tags.some((t) => doc.tags.includes(t));
      if (!hasTag) return false;
    }
    return true;
  });

  const scored: KBSearchResult[] = candidates.map((doc) => {
    const docText = `${doc.title} ${doc.content} ${doc.tags.join(" ")}`;
    const docTokens = tokenise(docText);
    const relevanceScore = bm25Score(queryTokens, docTokens, dfMap, corpusSize, avgDocLength);
    const snippet = extractSnippet(doc.content, rawTokens);
    return { document: doc, relevanceScore, snippet };
  });

  return scored
    .filter((r) => r.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10);
}

/**
 * Retrieve a single document by ID. Returns null when not found.
 */
export async function getDocument(id: string): Promise<KBDocument | null> {
  return store.get(id) ?? null;
}

/**
 * Index knowledge derived from a completed session.
 *
 * Extracts function names, file patterns, and error resolutions from the
 * provided session notes and indexes them as a `session_notes` document.
 */
export async function indexSessionKnowledge(
  sessionId: string,
  notes: string
): Promise<void> {
  const keywords = extractSessionKeywords(notes);
  const tags = ["session", `session:${sessionId}`, ...keywords.slice(0, 10)];

  await indexDocument({
    title: `Session notes — ${sessionId}`,
    content: notes,
    tags,
    type: "session_notes",
  });
}

/**
 * Return up to `limit` documents most similar to the given document ID,
 * ranked by cosine similarity on TF-IDF vectors. Excludes the source doc.
 */
export async function getRelated(
  docId: string,
  limit = 5
): Promise<KBDocument[]> {
  const sourceDoc = store.get(docId);
  if (!sourceDoc) return [];

  const { dfMap } = buildCorpusStats();
  const corpusSize = store.size;

  const sourceText = `${sourceDoc.title} ${sourceDoc.content} ${sourceDoc.tags.join(" ")}`;
  const sourceVector = buildTfidfVector(tokenise(sourceText), dfMap, corpusSize);

  const scored = [...store.values()]
    .filter((doc) => doc.id !== docId)
    .map((doc) => {
      const docText = `${doc.title} ${doc.content} ${doc.tags.join(" ")}`;
      const docVector = buildTfidfVector(tokenise(docText), dfMap, corpusSize);
      return { doc, score: cosineSimilarity(sourceVector, docVector) };
    });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.doc);
}

/**
 * Return documents relevant to the current codebase context using
 * cosine similarity on TF-IDF vectors. Returns the top 5 results.
 */
export async function getRelatedKnowledge(
  currentContext: string
): Promise<KBDocument[]> {
  const contextTokens = tokenise(currentContext);
  if (contextTokens.length === 0) return [];

  const { dfMap } = buildCorpusStats();
  const corpusSize = store.size;
  const contextVector = buildTfidfVector(contextTokens, dfMap, corpusSize);

  const scored = [...store.values()].map((doc) => {
    const docText = `${doc.title} ${doc.content} ${doc.tags.join(" ")}`;
    const docVector = buildTfidfVector(tokenise(docText), dfMap, corpusSize);
    return { doc, score: cosineSimilarity(contextVector, docVector) };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => r.doc);
}

/**
 * Fetch a package README from the npm registry and index it.
 * Returns the number of documents indexed (1 on success, 0 on failure).
 */
export async function bulkIndexPackageDocs(
  packageName: string,
  version: string
): Promise<number> {
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

  let readmeText: string;
  try {
    const response = await fetch(registryUrl);
    if (!response.ok) {
      return 0;
    }
    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("readme" in data) ||
      typeof (data as Record<string, unknown>).readme !== "string"
    ) {
      return 0;
    }
    readmeText = (data as Record<string, string>).readme;
  } catch {
    return 0;
  }

  const tags = ["npm", `package:${packageName}`, `version:${version}`];
  const majorMinor = version.split(".").slice(0, 2).join(".");
  if (majorMinor) tags.push(`semver:${majorMinor}`);

  await indexDocument({
    title: `${packageName}@${version} — README`,
    content: readmeText,
    tags,
    sourceUrl: `https://www.npmjs.com/package/${packageName}/v/${version}`,
    type: "docs",
  });

  return 1;
}
