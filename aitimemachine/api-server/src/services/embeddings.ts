/**
 * Embedding Service
 *
 * Provides embedding generation for semantic search using multiple providers:
 * - OpenAI (text-embedding-3-small)
 * - Voyage AI
 * - Local/fallback (TF-IDF based)
 */

import crypto from "crypto";

// Embedding dimensions by provider
const EMBEDDING_DIMENSIONS = {
  "openai-small": 1536,
  "openai-large": 3072,
  "voyage": 1024,
  "local": 384,
} as const;

type EmbeddingProvider = keyof typeof EMBEDDING_DIMENSIONS;

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  tokensUsed?: number;
}

export interface EmbeddingBatchResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
  tokensUsed?: number;
}

interface CacheEntry {
  embedding: number[];
  timestamp: number;
}

/**
 * Embedding Service with provider abstraction and caching
 */
export class EmbeddingService {
  private provider: EmbeddingProvider;
  private apiKey?: string;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheMaxAge = 1000 * 60 * 60; // 1 hour
  private cacheMaxSize = 10000;

  constructor(options?: { provider?: EmbeddingProvider; apiKey?: string }) {
    this.provider = options?.provider || this.detectProvider();
    this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || process.env.VOYAGE_API_KEY;
  }

  /**
   * Auto-detect available provider based on environment
   */
  private detectProvider(): EmbeddingProvider {
    if (process.env.OPENAI_API_KEY) return "openai-small";
    if (process.env.VOYAGE_API_KEY) return "voyage";
    return "local";
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return {
        embedding: cached.embedding,
        model: this.provider,
        dimensions: cached.embedding.length,
      };
    }

    let embedding: number[];

    switch (this.provider) {
      case "openai-small":
      case "openai-large":
        embedding = await this.generateOpenAIEmbedding(text);
        break;
      case "voyage":
        embedding = await this.generateVoyageEmbedding(text);
        break;
      case "local":
      default:
        embedding = this.generateLocalEmbedding(text);
        break;
    }

    // Cache the result
    this.cacheEmbedding(cacheKey, embedding);

    return {
      embedding,
      model: this.provider,
      dimensions: embedding.length,
    };
  }

  /**
   * Generate embeddings for multiple texts (batched for efficiency)
   */
  async generateBatchEmbeddings(texts: string[]): Promise<EmbeddingBatchResult> {
    // Check cache for each text
    const uncachedIndices: number[] = [];
    const results: (number[] | null)[] = texts.map((text, i) => {
      const cacheKey = this.getCacheKey(text);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
        return cached.embedding;
      }
      uncachedIndices.push(i);
      return null;
    });

    // Generate embeddings for uncached texts
    if (uncachedIndices.length > 0) {
      const uncachedTexts = uncachedIndices.map((i) => texts[i]);
      let newEmbeddings: number[][];

      switch (this.provider) {
        case "openai-small":
        case "openai-large":
          newEmbeddings = await this.generateOpenAIBatchEmbeddings(uncachedTexts);
          break;
        case "voyage":
          newEmbeddings = await this.generateVoyageBatchEmbeddings(uncachedTexts);
          break;
        case "local":
        default:
          newEmbeddings = uncachedTexts.map((t) => this.generateLocalEmbedding(t));
          break;
      }

      // Fill in results and cache
      uncachedIndices.forEach((originalIndex, batchIndex) => {
        const embedding = newEmbeddings[batchIndex];
        results[originalIndex] = embedding;
        this.cacheEmbedding(this.getCacheKey(texts[originalIndex]), embedding);
      });
    }

    return {
      embeddings: results as number[][],
      model: this.provider,
      dimensions: EMBEDDING_DIMENSIONS[this.provider],
    };
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Find most similar embeddings from a list
   */
  findSimilar(
    queryEmbedding: number[],
    candidates: Array<{ id: string; embedding: number[] }>,
    topK: number = 10
  ): Array<{ id: string; similarity: number }> {
    const scored = candidates
      .map((c) => ({
        id: c.id,
        similarity: this.cosineSimilarity(queryEmbedding, c.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    return scored;
  }

  // ============================================
  // Provider-specific implementations
  // ============================================

  /**
   * OpenAI embedding generation
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const model = this.provider === "openai-large"
      ? "text-embedding-3-large"
      : "text-embedding-3-small";

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: text.slice(0, 8191), // OpenAI limit
        model,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * OpenAI batch embedding generation
   */
  private async generateOpenAIBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const model = this.provider === "openai-large"
      ? "text-embedding-3-large"
      : "text-embedding-3-small";

    // OpenAI supports batch of up to 2048 texts
    const batchSize = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 8191));

      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI batch embedding failed: ${error}`);
      }

      const data = await response.json();
      const embeddings = data.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((d: any) => d.embedding);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  /**
   * Voyage AI embedding generation
   */
  private async generateVoyageEmbedding(text: string): Promise<number[]> {
    const voyageKey = process.env.VOYAGE_API_KEY;
    if (!voyageKey) {
      throw new Error("Voyage API key not configured");
    }

    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voyageKey}`,
      },
      body: JSON.stringify({
        input: text.slice(0, 16000), // Voyage limit
        model: "voyage-code-2",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Voyage embedding failed: ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * Voyage AI batch embedding generation
   */
  private async generateVoyageBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const voyageKey = process.env.VOYAGE_API_KEY;
    if (!voyageKey) {
      throw new Error("Voyage API key not configured");
    }

    const batchSize = 128; // Voyage batch limit
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 16000));

      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${voyageKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model: "voyage-code-2",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Voyage batch embedding failed: ${error}`);
      }

      const data = await response.json();
      const embeddings = data.data
        .sort((a: any, b: any) => a.index - b.index)
        .map((d: any) => d.embedding);
      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  }

  /**
   * Local TF-IDF based embedding (fallback when no API key)
   * Uses a deterministic hash-based approach for consistent embeddings
   */
  private generateLocalEmbedding(text: string): number[] {
    const dimensions = EMBEDDING_DIMENSIONS.local;
    const embedding = new Array(dimensions).fill(0);

    // Tokenize text
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);

    if (tokens.length === 0) {
      return embedding;
    }

    // Build term frequency
    const termFreq: Record<string, number> = {};
    for (const token of tokens) {
      termFreq[token] = (termFreq[token] || 0) + 1;
    }

    // Generate embedding using hash-based feature mapping
    for (const [term, freq] of Object.entries(termFreq)) {
      // Use SHA-256 hash to deterministically map term to dimensions
      const hash = crypto.createHash("sha256").update(term).digest();

      // Use multiple positions from hash for feature distribution
      for (let i = 0; i < 4; i++) {
        const position = hash.readUInt16BE(i * 2) % dimensions;
        const sign = hash[8 + i] % 2 === 0 ? 1 : -1;
        const weight = Math.log(1 + freq) * sign;
        embedding[position] += weight;
      }
    }

    // Add character n-gram features
    const text2 = text.toLowerCase();
    for (let i = 0; i < text2.length - 2; i++) {
      const ngram = text2.slice(i, i + 3);
      const hash = crypto.createHash("md5").update(ngram).digest();
      const position = hash.readUInt16BE(0) % dimensions;
      embedding[position] += 0.1;
    }

    // Normalize to unit vector
    const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
    if (norm > 0) {
      for (let i = 0; i < dimensions; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  // ============================================
  // Cache management
  // ============================================

  private getCacheKey(text: string): string {
    return crypto.createHash("sha256").update(`${this.provider}:${text}`).digest("hex").slice(0, 32);
  }

  private cacheEmbedding(key: string, embedding: number[]): void {
    // Evict old entries if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current provider info
   */
  getProviderInfo(): { provider: EmbeddingProvider; dimensions: number } {
    return {
      provider: this.provider,
      dimensions: EMBEDDING_DIMENSIONS[this.provider],
    };
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

/**
 * Get or create the embedding service singleton
 */
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

export default EmbeddingService;
