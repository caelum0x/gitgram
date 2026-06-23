import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { trackAPIUsage } from '../utils/analytics';

interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  timestamp: Date;
}

const requestMetrics: RequestMetrics[] = [];
const MAX_METRICS = 1000; // Keep last 1000 requests

export function trackRequestMetrics(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const timestamp = new Date();

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    const metric: RequestMetrics = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime,
      timestamp,
    };

    // Add to metrics array
    requestMetrics.push(metric);
    
    // Keep only last MAX_METRICS
    if (requestMetrics.length > MAX_METRICS) {
      requestMetrics.shift();
    }

    // Log slow requests
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        method: metric.method,
        path: metric.path,
        responseTime,
        statusCode: metric.statusCode,
      });
    }

    // Track API usage in analytics
    const userId = (req as any).user?.id;
    trackAPIUsage(
      metric.path,
      metric.method,
      metric.responseTime,
      metric.statusCode,
      userId
    );
  });

  next();
}

export function getRequestMetrics() {
  const now = Date.now();
  const lastMinute = requestMetrics.filter(
    (m) => now - m.timestamp.getTime() < 60000
  );
  const lastHour = requestMetrics.filter(
    (m) => now - m.timestamp.getTime() < 3600000
  );

  const avgResponseTime = requestMetrics.length > 0
    ? requestMetrics.reduce((sum, m) => sum + m.responseTime, 0) / requestMetrics.length
    : 0;

  const statusCodes = requestMetrics.reduce((acc, m) => {
    acc[m.statusCode] = (acc[m.statusCode] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return {
    total: requestMetrics.length,
    lastMinute: lastMinute.length,
    lastHour: lastHour.length,
    avgResponseTime: Math.round(avgResponseTime),
    statusCodes,
    slowRequests: requestMetrics.filter((m) => m.responseTime > 1000).length,
  };
}

export function getMetricsEndpoint() {
  return (req: Request, res: Response) => {
    const metrics = getRequestMetrics();
    const { getDatabaseStats } = require('../utils/dbHealth');
    
    Promise.all([
      getDatabaseStats(),
      Promise.resolve(metrics),
    ]).then(([dbStats, reqMetrics]) => {
      res.json({
        requests: reqMetrics,
        database: dbStats,
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          external: Math.round(process.memoryUsage().external / 1024 / 1024),
        },
        uptime: process.uptime(),
      });
    }).catch((error) => {
      logger.error('Failed to get metrics:', error);
      res.status(500).json({ error: 'Failed to get metrics' });
    });
  };
}

