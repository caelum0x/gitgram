/**
 * Embedding Provider
 *
 * Thin wrapper around an embedding backend used by the memory store's semantic
 * search. The provider is real (OpenAI) when OPENAI_API_KEY is configured and
 * reports itself as unavailable otherwise, so callers can degrade to text
 * search and label the response accurately instead of advertising semantic
 * search that silently falls back to SQL LIKE.
 */

import OpenAI from 'openai';

export interface EmbeddingProvider {
  /** Provider identifier surfaced in API responses (e.g. 'openai', 'none'). */
  readonly name: string;
  /** Embedding model identifier, or null when no provider is configured. */
  readonly model: string | null;
  /** Whether real embeddings can be produced. */
  isAvailable(): boolean;
  /** Produce an embedding vector for a single text. Throws if unavailable. */
  embed(text: string): Promise<number[]>;
  /** Produce embedding vectors for many texts in one round-trip. */
  embedBatch(texts: string[]): Promise<number[][]>;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
/** OpenAI embedding inputs are capped; keep well under the token limit. */
const MAX_INPUT_CHARS = 8000;

function truncate(text: string): string {
  return text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model: string;
  private client: OpenAI;

  constructor(apiKey: string, model = DEFAULT_MODEL) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  isAvailable(): boolean {
    return true;
  }

  async embed(text: string): Promise<number[]> {
    const [vector] = await this.embedBatch([text]);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts.map(truncate),
    });
    return response.data.map((d) => d.embedding);
  }
}

class NullEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'none';
  readonly model = null;

  isAvailable(): boolean {
    return false;
  }

  async embed(): Promise<number[]> {
    throw new Error('No embedding provider configured (set OPENAI_API_KEY)');
  }

  async embedBatch(): Promise<number[][]> {
    throw new Error('No embedding provider configured (set OPENAI_API_KEY)');
  }
}

/**
 * Resolve an embedding provider from the environment. Returns a working OpenAI
 * provider when OPENAI_API_KEY is set, otherwise a null provider that reports
 * itself unavailable so callers can fall back to text search explicitly.
 */
export function createEmbeddingProvider(opts?: {
  apiKey?: string;
  model?: string;
}): EmbeddingProvider {
  const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return new NullEmbeddingProvider();
  return new OpenAIEmbeddingProvider(apiKey, opts?.model ?? process.env.AITM_EMBEDDING_MODEL ?? DEFAULT_MODEL);
}

/**
 * Cosine similarity between two equal-length vectors. Returns a value in
 * [-1, 1]; returns 0 for mismatched-length or zero-magnitude vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
