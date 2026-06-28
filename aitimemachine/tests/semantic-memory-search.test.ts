/**
 * Semantic memory search tests.
 *
 * Guards that `aitm memory search --semantic` (the /v1/contexts/search/semantic
 * endpoint) performs REAL vector similarity ranking when an embedding provider
 * is available, and degrades to text search with accurate labelling when it is
 * not — instead of silently advertising semantic search backed by SQL LIKE.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { AgentsMemoryStore } from '../src/server/agents-memory-store.js';
import { cosineSimilarity, type EmbeddingProvider } from '../src/server/embedding-provider.js';

/**
 * Deterministic fake embedding provider: maps text to a small bag-of-words
 * vector over a fixed vocabulary so semantically related texts score higher.
 */
class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'fake';
  readonly model = 'fake-test-model';
  private vocab = ['database', 'sql', 'query', 'cat', 'animal', 'pet'];

  isAvailable(): boolean {
    return true;
  }

  private vectorize(text: string): number[] {
    const lower = text.toLowerCase();
    return this.vocab.map((w) => (lower.includes(w) ? 1 : 0));
  }

  async embed(text: string): Promise<number[]> {
    return this.vectorize(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vectorize(t));
  }
}

/** A provider that reports itself unavailable (mirrors NullEmbeddingProvider). */
class UnavailableEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'none';
  readonly model = null;
  isAvailable(): boolean {
    return false;
  }
  async embed(): Promise<number[]> {
    throw new Error('unavailable');
  }
  async embedBatch(): Promise<number[][]> {
    throw new Error('unavailable');
  }
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 for mismatched length or zero vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('AgentsMemoryStore semantic search', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `aitm-mem-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  });

  afterEach(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
  });

  it('ranks by vector similarity when an embedding provider is available', async () => {
    const store = new AgentsMemoryStore(dbPath, new FakeEmbeddingProvider());
    store.createContext({ name: 'Database tuning', description: 'sql query optimization', messages: [] });
    store.createContext({ name: 'My cat', description: 'a pet animal', messages: [] });

    const result = await store.semanticSearchContexts('sql database query', 10);

    expect(result.searchType).toBe('semantic');
    expect(result.provider).toBe('fake');
    expect(result.model).toBe('fake-test-model');
    expect(result.hits.length).toBeGreaterThan(0);
    // The database-related context must outrank the cat context.
    expect(result.hits[0].context.name).toBe('Database tuning');
    expect(result.hits[0].similarity).toBeGreaterThan(result.hits[1].similarity);
  });

  it('degrades to text search and labels it accurately without a provider', async () => {
    const store = new AgentsMemoryStore(dbPath, new UnavailableEmbeddingProvider());
    expect(store.hasEmbeddings()).toBe(false);
    store.createContext({ name: 'Database tuning', description: 'sql query optimization', messages: [] });

    const result = await store.semanticSearchContexts('database', 10);

    expect(result.searchType).toBe('text');
    expect(result.provider).toBe('none');
    expect(result.model).toBeNull();
    expect(result.hits.length).toBe(1);
    expect(result.hits[0].context.name).toBe('Database tuning');
  });

  it('backfills embeddings for contexts created before indexing', async () => {
    const store = new AgentsMemoryStore(dbPath, new FakeEmbeddingProvider());
    store.createContext({ name: 'SQL query', description: 'database', messages: [] });
    const indexed = await store.backfillEmbeddings();
    expect(indexed).toBe(1);
    // Second backfill is a no-op since the vector already exists.
    expect(await store.backfillEmbeddings()).toBe(0);
  });
});
