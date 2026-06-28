import { createClient } from 'redis';
import logger from '../utils/logger';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('Redis connected'));

export const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
};

/** True when the shared Redis client is connected and usable. */
export const isRedisReady = (): boolean => redisClient.isOpen;

/**
 * Atomic counters used for cross-instance view counting / dedup.
 *
 * Every method degrades gracefully: on any Redis error it returns a sentinel
 * (null / 0) so callers can fall back to a local strategy rather than crash.
 */
export const counters = {
  /**
   * INCR a key and set its TTL on first creation. Returns the new value, or
   * null if Redis is unavailable so the caller can fall back.
   */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number | null> {
    if (!redisClient.isOpen) return null;
    try {
      const value = await redisClient.incr(key);
      if (value === 1) {
        await redisClient.expire(key, ttlSeconds);
      }
      return value;
    } catch (error) {
      logger.error('Redis incrWithTtl error:', error);
      return null;
    }
  },

  /** Read an integer counter. Returns 0 when missing/unavailable. */
  async getInt(key: string): Promise<number> {
    if (!redisClient.isOpen) return 0;
    try {
      const raw = await redisClient.get(key);
      if (raw === null) return 0;
      const parsed = parseInt(String(raw), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (error) {
      logger.error('Redis getInt error:', error);
      return 0;
    }
  },

  /** INCRBY a key and set TTL on first creation. Returns new value or null. */
  async incrByWithTtl(
    key: string,
    amount: number,
    ttlSeconds: number
  ): Promise<number | null> {
    if (!redisClient.isOpen) return null;
    try {
      const value = await redisClient.incrBy(key, amount);
      if (value === amount) {
        await redisClient.expire(key, ttlSeconds);
      }
      return value;
    } catch (error) {
      logger.error('Redis incrByWithTtl error:', error);
      return null;
    }
  },

  /**
   * Atomically read-and-reset a counter to zero (GETDEL semantics) so a flush
   * can claim a delta exactly once across instances. Returns the prior value.
   */
  async takeAndReset(key: string): Promise<number> {
    if (!redisClient.isOpen) return 0;
    try {
      const raw = await redisClient.getDel(key);
      if (raw === null) return 0;
      const parsed = parseInt(String(raw), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch (error) {
      logger.error('Redis takeAndReset error:', error);
      return 0;
    }
  },

  /** Enumerate keys matching a pattern using SCAN (non-blocking). */
  async scanKeys(pattern: string): Promise<string[]> {
    if (!redisClient.isOpen) return [];
    try {
      const keys: string[] = [];
      let cursor = '0';
      do {
        const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 200 });
        cursor = String(result.cursor);
        keys.push(...result.keys);
      } while (cursor !== '0');
      return keys;
    } catch (error) {
      logger.error('Redis scanKeys error:', error);
      return [];
    }
  },
};

export const cache = {
  async get(key: string) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data.toString()) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  },

  async set(key: string, value: any, ttl: number = 300) {
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis set error:', error);
    }
  },

  async del(key: string) {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error('Redis del error:', error);
    }
  },

  /**
   * Clear keys matching a pattern using SCAN instead of KEYS
   * to avoid blocking Redis on large datasets.
   */
  async clear(pattern: string) {
    try {
      let cursor = '0';
      do {
        const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(result.cursor);
        if (result.keys.length > 0) {
          await redisClient.del(result.keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      logger.error('Redis clear error:', error);
    }
  },
};

export default redisClient;
