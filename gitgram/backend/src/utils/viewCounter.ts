import redisClient from '../services/redisService';
import logger from './logger';

/**
 * Distributed counter helper for analytics view/clone tracking.
 *
 * Prefers the shared Redis instance (so counters survive restarts and are
 * shared across processes). When Redis is not connected (e.g. local dev
 * without Redis), it transparently falls back to a per-process in-memory map.
 *
 * Note: the in-memory fallback is intentionally simple — it is only a degraded
 * mode. Production deployments run with Redis configured.
 */

interface MemoryEntry {
  value: number;
  expiresAt: number;
}

const memory = new Map<string, MemoryEntry>();

function memoryIncr(key: string, ttlMs: number): number {
  const now = Date.now();
  const entry = memory.get(key);
  if (entry && entry.expiresAt > now) {
    entry.value += 1;
    return entry.value;
  }
  memory.set(key, { value: 1, expiresAt: now + ttlMs });
  return 1;
}

function memoryGet(key: string): number {
  const now = Date.now();
  const entry = memory.get(key);
  if (entry && entry.expiresAt > now) {
    return entry.value;
  }
  memory.delete(key);
  return 0;
}

function redisAvailable(): boolean {
  return redisClient.isOpen;
}

/**
 * Atomically increments a counter and (re)applies the TTL.
 * Returns the new value after the increment.
 */
export async function counterIncr(key: string, ttlMs: number): Promise<number> {
  if (!redisAvailable()) {
    return memoryIncr(key, ttlMs);
  }

  try {
    const value = await redisClient.incr(key);
    if (value === 1) {
      await redisClient.pExpire(key, ttlMs);
    }
    return value;
  } catch (error) {
    logger.error('viewCounter: redis incr failed, falling back to memory', { key, error });
    return memoryIncr(key, ttlMs);
  }
}

/**
 * Reads the current counter value. Returns 0 when missing/expired.
 */
export async function counterGet(key: string): Promise<number> {
  if (!redisAvailable()) {
    return memoryGet(key);
  }

  try {
    const raw = await redisClient.get(key);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch (error) {
    logger.error('viewCounter: redis get failed, falling back to memory', { key, error });
    return memoryGet(key);
  }
}

/**
 * Adds a member to a set used for unique-viewer counting and refreshes TTL.
 * Returns 1 if the member was newly added, 0 if it already existed.
 */
export async function counterSetAdd(key: string, member: string, ttlMs: number): Promise<number> {
  if (!redisAvailable()) {
    // In-memory degraded mode: approximate by treating each call as unique-add.
    const added = memoryIncr(`set:${key}:${member}`, ttlMs) === 1 ? 1 : 0;
    return added;
  }

  try {
    const added = await redisClient.sAdd(key, member);
    await redisClient.pExpire(key, ttlMs);
    return added;
  } catch (error) {
    logger.error('viewCounter: redis sAdd failed', { key, error });
    return 0;
  }
}

/**
 * Returns the cardinality of a unique-viewer set.
 */
export async function counterSetSize(key: string): Promise<number> {
  if (!redisAvailable()) {
    let count = 0;
    const prefix = `set:${key}:`;
    const now = Date.now();
    for (const [k, entry] of memory) {
      if (k.startsWith(prefix) && entry.expiresAt > now) count += 1;
    }
    return count;
  }

  try {
    return await redisClient.sCard(key);
  } catch (error) {
    logger.error('viewCounter: redis sCard failed', { key, error });
    return 0;
  }
}
