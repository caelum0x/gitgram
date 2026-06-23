/**
 * Redis-backed data structures with automatic in-memory fallback.
 *
 * Provides sorted-set-like sliding window and set operations that use
 * Redis when available, falling back to in-memory Maps otherwise.
 */

import { getRedisClient } from '../config/redis';
import logger from './logger';

// ---------------------------------------------------------------------------
// Sliding Window (for rate limiting / abuse scoring timestamps)
// ---------------------------------------------------------------------------

/**
 * A sliding window counter backed by Redis sorted sets.
 * Falls back to in-memory Map when Redis is unavailable.
 */
export class RedisSlidingWindow {
  private fallback = new Map<string, number[]>();
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private get redis() {
    return getRedisClient();
  }

  private redisKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /** Record a hit and return the current count within the window. */
  async hit(key: string, windowMs: number): Promise<{ count: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;

    if (this.redis) {
      try {
        const rk = this.redisKey(key);
        const pipeline = this.redis.pipeline();
        pipeline.zremrangebyscore(rk, '-inf', windowStart);
        pipeline.zadd(rk, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
        pipeline.zcard(rk);
        pipeline.pexpire(rk, windowMs * 2);
        const results = await pipeline.exec();
        const count = (results?.[2]?.[1] as number) ?? 0;
        return { count };
      } catch (err) {
        logger.error('RedisSlidingWindow.hit error, falling back to memory:', err);
      }
    }

    // In-memory fallback
    let timestamps = this.fallback.get(key);
    if (!timestamps) {
      timestamps = [];
      this.fallback.set(key, timestamps);
    }
    // Trim expired
    const filtered = timestamps.filter(ts => ts > windowStart);
    filtered.push(now);
    this.fallback.set(key, filtered);
    return { count: filtered.length };
  }

  /** Peek at the current count without recording a hit. */
  async peek(key: string, windowMs: number): Promise<number> {
    const windowStart = Date.now() - windowMs;

    if (this.redis) {
      try {
        const count = await this.redis.zcount(this.redisKey(key), windowStart, '+inf');
        return count;
      } catch {
        // fall through to in-memory
      }
    }

    const timestamps = this.fallback.get(key);
    if (!timestamps) return 0;
    return timestamps.filter(ts => ts > windowStart).length;
  }

  /** Reset a key. */
  async reset(key: string): Promise<void> {
    this.fallback.delete(key);
    if (this.redis) {
      try {
        await this.redis.del(this.redisKey(key));
      } catch { /* ignore */ }
    }
  }

  /** Cleanup expired entries from fallback store. */
  cleanupFallback(maxAge: number = 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    for (const [key, timestamps] of this.fallback) {
      const filtered = timestamps.filter(ts => ts > cutoff);
      if (filtered.length === 0) {
        this.fallback.delete(key);
      } else {
        this.fallback.set(key, filtered);
      }
    }
  }

  get size(): number {
    return this.fallback.size;
  }

  clear(): void {
    this.fallback.clear();
  }
}

// ---------------------------------------------------------------------------
// Hash Store (for abuse detection records)
// ---------------------------------------------------------------------------

/**
 * A key-value store backed by Redis hashes.
 * Falls back to in-memory Map when Redis is unavailable.
 */
export class RedisHashStore<T> {
  private fallback = new Map<string, T>();
  private prefix: string;
  private ttlMs: number;

  constructor(prefix: string, ttlMs: number = 24 * 60 * 60 * 1000) {
    this.prefix = prefix;
    this.ttlMs = ttlMs;
  }

  private get redis() {
    return getRedisClient();
  }

  private redisKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get(key: string): Promise<T | undefined> {
    if (this.redis) {
      try {
        const data = await this.redis.get(this.redisKey(key));
        if (data) return JSON.parse(data);
        return undefined;
      } catch {
        // fall through to in-memory
      }
    }
    return this.fallback.get(key);
  }

  async set(key: string, value: T): Promise<void> {
    this.fallback.set(key, value);
    if (this.redis) {
      try {
        await this.redis.setex(
          this.redisKey(key),
          Math.ceil(this.ttlMs / 1000),
          JSON.stringify(value)
        );
      } catch { /* ignore */ }
    }
  }

  async delete(key: string): Promise<void> {
    this.fallback.delete(key);
    if (this.redis) {
      try {
        await this.redis.del(this.redisKey(key));
      } catch { /* ignore */ }
    }
  }

  has(key: string): boolean {
    return this.fallback.has(key);
  }

  clear(): void {
    this.fallback.clear();
  }

  entries(): IterableIterator<[string, T]> {
    return this.fallback.entries();
  }
}
