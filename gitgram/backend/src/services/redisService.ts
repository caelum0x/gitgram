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
