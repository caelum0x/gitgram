import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  timestamp: Date;
  memoryUsage: NodeJS.MemoryUsage;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetrics = 1000;

  recordMetric(metric: PerformanceMetrics) {
    this.metrics.push(metric);
    
    // Keep only last maxMetrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log slow requests
    if (metric.responseTime > 1000) {
      logger.warn('Slow request detected', {
        endpoint: metric.endpoint,
        method: metric.method,
        responseTime: metric.responseTime,
        statusCode: metric.statusCode,
      });
    }

    // Log high memory usage
    const heapUsedMB = metric.memoryUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 500) {
      logger.warn('High memory usage detected', {
        endpoint: metric.endpoint,
        heapUsed: `${Math.round(heapUsedMB)}MB`,
      });
    }
  }

  getMetrics() {
    return this.metrics;
  }

  getAverageResponseTime(endpoint?: string): number {
    const filtered = endpoint
      ? this.metrics.filter((m) => m.endpoint === endpoint)
      : this.metrics;

    if (filtered.length === 0) return 0;

    const sum = filtered.reduce((acc, m) => acc + m.responseTime, 0);
    return Math.round(sum / filtered.length);
  }

  getP95ResponseTime(endpoint?: string): number {
    const filtered = endpoint
      ? this.metrics.filter((m) => m.endpoint === endpoint)
      : this.metrics;

    if (filtered.length === 0) return 0;

    const sorted = [...filtered].sort((a, b) => a.responseTime - b.responseTime);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index]?.responseTime || 0;
  }

  getErrorRate(endpoint?: string): number {
    const filtered = endpoint
      ? this.metrics.filter((m) => m.endpoint === endpoint)
      : this.metrics;

    if (filtered.length === 0) return 0;

    const errors = filtered.filter((m) => m.statusCode >= 400).length;
    return Math.round((errors / filtered.length) * 100);
  }

  getMemoryStats() {
    const recent = this.metrics.slice(-100);
    if (recent.length === 0) return null;

    const avgHeapUsed = recent.reduce((sum, m) => sum + m.memoryUsage.heapUsed, 0) / recent.length;
    const avgHeapTotal = recent.reduce((sum, m) => sum + m.memoryUsage.heapTotal, 0) / recent.length;
    const avgExternal = recent.reduce((sum, m) => sum + m.memoryUsage.external, 0) / recent.length;

    return {
      heapUsed: Math.round(avgHeapUsed / 1024 / 1024),
      heapTotal: Math.round(avgHeapTotal / 1024 / 1024),
      external: Math.round(avgExternal / 1024 / 1024),
      rss: Math.round(recent[recent.length - 1].memoryUsage.rss / 1024 / 1024),
    };
  }

  getEndpointStats() {
    const endpointMap = new Map<string, {
      count: number;
      avgResponseTime: number;
      p95ResponseTime: number;
      errorRate: number;
      lastRequest: Date;
    }>();

    this.metrics.forEach((metric) => {
      const key = `${metric.method} ${metric.endpoint}`;
      const existing = endpointMap.get(key);

      if (!existing) {
        endpointMap.set(key, {
          count: 1,
          avgResponseTime: metric.responseTime,
          p95ResponseTime: metric.responseTime,
          errorRate: metric.statusCode >= 400 ? 100 : 0,
          lastRequest: metric.timestamp,
        });
      } else {
        existing.count++;
        existing.avgResponseTime = Math.round(
          (existing.avgResponseTime * (existing.count - 1) + metric.responseTime) / existing.count
        );
        existing.errorRate = Math.round(
          ((existing.errorRate / 100) * (existing.count - 1) + (metric.statusCode >= 400 ? 1 : 0)) / existing.count * 100
        );
        existing.lastRequest = metric.timestamp;
      }
    });

    // Calculate P95 for each endpoint
    endpointMap.forEach((stats, key) => {
      const [method, endpoint] = key.split(' ');
      const endpointMetrics = this.metrics.filter(
        (m) => m.method === method && m.endpoint === endpoint
      );
      if (endpointMetrics.length > 0) {
        const sorted = [...endpointMetrics].sort((a, b) => a.responseTime - b.responseTime);
        const index = Math.floor(sorted.length * 0.95);
        stats.p95ResponseTime = sorted[index]?.responseTime || 0;
      }
    });

    return Array.from(endpointMap.entries()).map(([key, stats]) => ({
      endpoint: key,
      ...stats,
    }));
  }

  clear() {
    this.metrics = [];
  }
}

export const performanceMonitor = new PerformanceMonitor();

export function performanceMonitoringMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const endMemory = process.memoryUsage();

    performanceMonitor.recordMetric({
      endpoint: req.path,
      method: req.method,
      responseTime,
      statusCode: res.statusCode,
      timestamp: new Date(),
      memoryUsage: endMemory,
    });
  });

  next();
}

