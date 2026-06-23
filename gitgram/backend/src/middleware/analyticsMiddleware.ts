import { Request, Response, NextFunction } from 'express';
import { analytics, trackFeatureUsage } from '../utils/analytics';

export function analyticsMiddleware(req: Request, res: Response, next: NextFunction) {
  // Track page views for GET requests
  if (req.method === 'GET' && req.path !== '/health' && req.path !== '/metrics') {
    const userId = (req as any).user?.id;
    analytics.page(req.path, {
      method: req.method,
      query: req.query,
    }, userId);
  }

  // Track feature usage for authenticated requests
  if ((req as any).user) {
    const userId = (req as any).user.id;
    const feature = `${req.method} ${req.path}`;
    trackFeatureUsage(feature, userId, {
      query: req.query,
      params: req.params,
    });
  }

  next();
}

