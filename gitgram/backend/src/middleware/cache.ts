import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { cache } from '../services/redisService';

export const cacheMiddleware = (ttl: number = 300) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const key = `cache:${req.originalUrl}:${req.userId || 'guest'}`;
    
    try {
      const cached = await cache.get(key);
      if (cached) {
        return res.json(cached);
      }

      const originalJson = res.json.bind(res);
      res.json = (data: any) => {
        cache.set(key, data, ttl);
        return originalJson(data);
      };

      next();
    } catch (error) {
      next();
    }
  };
};
