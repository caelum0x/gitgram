/**
 * performanceProfiler.ts
 *
 * Per-request performance profiling middleware for the Gitgram backend.
 *
 * Captures, for every request:
 *   - total duration + time-to-first-byte (TTFB)
 *   - DB query count and aggregate query time
 *   - cache hit / miss counts
 *   - heap-used delta (memory growth per request)
 *   - N+1 query detection (same table queried > N times)
 *
 * Emits structured warn/error logs for slow requests and memory spikes, and
 * exposes an Express router with a `GET /performance` admin endpoint.
 *
 * Usage:
 *   import { performanceProfiler, performanceAdminRouter } from './middleware/performanceProfiler';
 *   app.use(performanceProfiler);
 *   app.use('/admin', performanceAdminRouter); // -> GET /admin/performance
 *
 * Inside route handlers / data-access layers, record events against the active
 * request via the helpers:
 *   recordQuery(res, 'users', durationMs);
 *   recordCacheHit(res);
 *   recordCacheMiss(res);
 */

import { Request, Response, NextFunction, Router } from 'express';
import { randomUUID } from 'crypto';
import logger from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Immutable snapshot of a single completed request's performance. */
export type RequestProfile = {
  requestId: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  queries: number;
  queryTime: number;
  cacheHits: number;
};

/** Extended internal record retained in the in-memory store. */
type StoredProfile = RequestProfile & {
  ttfb: number;
  cacheMisses: number;
  heapDeltaMB: number;
  n1Detected: boolean;
  timestamp: number;
};

/** Mutable per-request accumulator attached to `res.locals.profilerCtx`. */
export type ProfilerContext = {
  requestId: string;
  startTime: number;
  startHeap: number;
  ttfb: number;
  queryCount: number;
  queryTime: number;
  cacheHits: number;
  cacheMisses: number;
  queriedTables: Map<string, number>;
};

type RouteStats = {
  route: string;
  count: number;
  totalDuration: number;
  errorCount: number;
};

/** Aggregate report returned by {@link getPerformanceStats}. */
export type PerformanceStats = {
  p50: number;
  p95: number;
  p99: number;
  slowestRoutes: Array<{ route: string; avgDuration: number; count: number }>;
  totalRequests: number;
  errorRate: number;
};

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_PROFILES = 2000;
const SLOW_THRESHOLD_MS = 500;
const ERROR_THRESHOLD_MS = 2000;
const MEMORY_DELTA_ALERT_MB = 50;
const N1_QUERY_THRESHOLD = 5;
const PROFILES_KEY = 'profilerCtx';

const BYTES_PER_MB = 1024 * 1024;

// ─── In-memory ring buffer ──────────────────────────────────────────────────

const profiles: StoredProfile[] = [];

function storeProfile(profile: StoredProfile): void {
  profiles.push(profile);
  if (profiles.length > MAX_PROFILES) {
    profiles.shift();
  }
}

function getContext(res: Response): ProfilerContext | undefined {
  return res.locals[PROFILES_KEY] as ProfilerContext | undefined;
}

// ─── Recording helpers ──────────────────────────────────────────────────────
//
// These are invoked from the data-access layer (e.g. a Prisma `$on('query')`
// hook) and the cache middleware, passing the active Express `Response` so the
// event is attributed to the correct in-flight request.

/** Record a single database query (count + time) against the active request. */
export function recordQuery(res: Response, table: string, durationMs: number): void {
  const ctx = getContext(res);
  if (!ctx) return;

  ctx.queryCount += 1;
  ctx.queryTime += durationMs;

  const seen = ctx.queriedTables.get(table) ?? 0;
  ctx.queriedTables.set(table, seen + 1);
}

/** Record a cache hit against the active request. */
export function recordCacheHit(res: Response): void {
  const ctx = getContext(res);
  if (ctx) ctx.cacheHits += 1;
}

/** Record a cache miss against the active request. */
export function recordCacheMiss(res: Response): void {
  const ctx = getContext(res);
  if (ctx) ctx.cacheMisses += 1;
}

// ─── Percentile helper ──────────────────────────────────────────────────────

function percentile(sortedAscending: ReadonlyArray<number>, p: number): number {
  if (sortedAscending.length === 0) return 0;
  const index = Math.min(
    Math.floor((p / 100) * sortedAscending.length),
    sortedAscending.length - 1,
  );
  return sortedAscending[index];
}

// ─── N+1 detection ──────────────────────────────────────────────────────────

function detectN1(ctx: ProfilerContext, req: Request): boolean {
  let detected = false;
  ctx.queriedTables.forEach((count, table) => {
    if (count > N1_QUERY_THRESHOLD) {
      detected = true;
      logger.warn('Potential N+1 query pattern detected', {
        requestId: ctx.requestId,
        table,
        queryCount: count,
        route: `${req.method} ${req.path}`,
      });
    }
  });
  return detected;
}

// ─── Threshold alerting ─────────────────────────────────────────────────────

function alertOnThresholds(req: Request, status: number, requestId: string, duration: number, heapDeltaMB: number): void {
  if (duration > ERROR_THRESHOLD_MS) {
    logger.error('Request exceeded error duration threshold', {
      requestId,
      method: req.method,
      route: req.path,
      status,
      durationMs: duration,
    });
  } else if (duration > SLOW_THRESHOLD_MS) {
    logger.warn('Slow request detected', {
      requestId,
      method: req.method,
      route: req.path,
      status,
      durationMs: duration,
    });
  }

  if (heapDeltaMB > MEMORY_DELTA_ALERT_MB) {
    logger.warn('Large per-request heap increase', {
      requestId,
      method: req.method,
      route: req.path,
      heapDeltaMB: Number(heapDeltaMB.toFixed(2)),
    });
  }
}

// ─── Middleware ─────────────────────────────────────────────────────────────

/**
 * Express middleware that profiles each request. Mount once, early in the
 * middleware chain, so it observes the full request lifecycle.
 */
export function performanceProfiler(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const startTime = Date.now();
  const startHeap = process.memoryUsage().heapUsed;

  const ctx: ProfilerContext = {
    requestId,
    startTime,
    startHeap,
    ttfb: 0,
    queryCount: 0,
    queryTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    queriedTables: new Map<string, number>(),
  };

  res.locals[PROFILES_KEY] = ctx;
  res.setHeader('X-Request-Id', requestId);

  // Capture time-to-first-byte: the first write/flush of the response body.
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function patchedWriteHead(this: Response, ...args: Parameters<Response['writeHead']>): Response {
    if (ctx.ttfb === 0) {
      ctx.ttfb = Date.now() - startTime;
    }
    return originalWriteHead(...args);
  } as Response['writeHead'];

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const ttfb = ctx.ttfb > 0 ? ctx.ttfb : duration;
    const endHeap = process.memoryUsage().heapUsed;
    const heapDeltaMB = (endHeap - startHeap) / BYTES_PER_MB;
    const status = res.statusCode;

    const n1Detected = detectN1(ctx, req);

    const profile: StoredProfile = {
      requestId,
      method: req.method,
      path: req.path,
      status,
      duration,
      queries: ctx.queryCount,
      queryTime: Number(ctx.queryTime.toFixed(2)),
      cacheHits: ctx.cacheHits,
      ttfb,
      cacheMisses: ctx.cacheMisses,
      heapDeltaMB: Number(heapDeltaMB.toFixed(2)),
      n1Detected,
      timestamp: Date.now(),
    };

    storeProfile(profile);
    alertOnThresholds(req, status, requestId, duration, heapDeltaMB);
  });

  next();
}

// ─── Stats computation ──────────────────────────────────────────────────────

/**
 * Compute aggregate performance statistics across all retained request
 * profiles: latency percentiles, slowest routes, throughput and error rate.
 */
export function getPerformanceStats(): PerformanceStats {
  if (profiles.length === 0) {
    return {
      p50: 0,
      p95: 0,
      p99: 0,
      slowestRoutes: [],
      totalRequests: 0,
      errorRate: 0,
    };
  }

  const durations = profiles.map((p) => p.duration).sort((a, b) => a - b);
  const errorCount = profiles.reduce((acc, p) => acc + (p.status >= 400 ? 1 : 0), 0);

  const routeMap = new Map<string, RouteStats>();
  for (const p of profiles) {
    const key = `${p.method} ${p.path}`;
    const existing = routeMap.get(key);
    if (!existing) {
      routeMap.set(key, {
        route: key,
        count: 1,
        totalDuration: p.duration,
        errorCount: p.status >= 400 ? 1 : 0,
      });
    } else {
      routeMap.set(key, {
        ...existing,
        count: existing.count + 1,
        totalDuration: existing.totalDuration + p.duration,
        errorCount: existing.errorCount + (p.status >= 400 ? 1 : 0),
      });
    }
  }

  const slowestRoutes = Array.from(routeMap.values())
    .map((s) => ({
      route: s.route,
      avgDuration: Math.round(s.totalDuration / s.count),
      count: s.count,
    }))
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 10);

  return {
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    p99: percentile(durations, 99),
    slowestRoutes,
    totalRequests: profiles.length,
    errorRate: Number(((errorCount / profiles.length) * 100).toFixed(2)),
  };
}

/** Clear all retained profiles. Primarily for tests and the admin endpoint. */
export function resetPerformanceStats(): void {
  profiles.length = 0;
}

// ─── Admin router ───────────────────────────────────────────────────────────

export const performanceAdminRouter = Router();

/** GET /admin/performance — aggregate latency + error stats. */
performanceAdminRouter.get('/performance', (_req: Request, res: Response): void => {
  res.json(getPerformanceStats());
});

/** GET /admin/performance/profiles — recent raw request profiles (debugging). */
performanceAdminRouter.get('/performance/profiles', (req: Request, res: Response): void => {
  const limitParam = req.query['limit'];
  const parsed = typeof limitParam === 'string' ? parseInt(limitParam, 10) : NaN;
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 100;
  const recent = profiles.slice(-limit).reverse();
  res.json({ total: profiles.length, profiles: recent });
});

/** DELETE /admin/performance — reset the in-memory profile store. */
performanceAdminRouter.delete('/performance', (_req: Request, res: Response): void => {
  resetPerformanceStats();
  res.json({ message: 'Performance profiles cleared.' });
});
