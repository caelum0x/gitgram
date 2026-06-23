// Redis configuration (optional - falls back to in-memory cache)
// For production, install: npm install redis ioredis

import logger from '../utils/logger';

let redisClient: any = null;

export async function initializeRedis() {
  if (process.env.REDIS_URL) {
    try {
      // Try to use Redis if available
      const Redis = require('ioredis');
      redisClient = new Redis(process.env.REDIS_URL, {
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      redisClient.on('connect', () => {
        logger.info('Redis connected');
      });

      redisClient.on('error', (err: Error) => {
        logger.error('Redis error:', err);
        redisClient = null; // Fall back to in-memory cache
      });

      return redisClient;
    } catch (error) {
      logger.warn('Redis not available, using in-memory cache');
      return null;
    }
  }
  return null;
}

export function getRedisClient() {
  return redisClient;
}

export async function redisGet(key: string): Promise<string | null> {
  if (!redisClient) return null;
  
  try {
    return await redisClient.get(key);
  } catch (error) {
    logger.error('Redis get error:', error);
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  if (!redisClient) return false;
  
  try {
    if (ttlSeconds) {
      await redisClient.setex(key, ttlSeconds, value);
    } else {
      await redisClient.set(key, value);
    }
    return true;
  } catch (error) {
    logger.error('Redis set error:', error);
    return false;
  }
}

export async function redisDelete(key: string): Promise<boolean> {
  if (!redisClient) return false;
  
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error('Redis delete error:', error);
    return false;
  }
}

export async function redisDeletePattern(pattern: string): Promise<number> {
  if (!redisClient) return 0;
  
  try {
    const stream = redisClient.scanStream({
      match: pattern,
      count: 100,
    });

    let deleted = 0;
    for await (const keys of stream) {
      if (keys.length > 0) {
        const result = await redisClient.del(...keys);
        deleted += result;
      }
    }

    return deleted;
  } catch (error) {
    logger.error('Redis delete pattern error:', error);
    return 0;
  }
}

