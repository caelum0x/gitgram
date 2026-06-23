import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service is degraded
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const { checkDatabaseHealth } = require('../utils/dbHealth');
  const dbHealth = await checkDatabaseHealth();
  const isProduction = process.env.NODE_ENV === 'production';

  const basicHealth = {
    status: dbHealth.status === 'unhealthy' ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
  };

  const response = isProduction ? basicHealth : {
    ...basicHealth,
    uptime: process.uptime(),
    database: dbHealth,
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    version: process.env.npm_package_version || '1.0.0',
  };

  const statusCode = basicHealth.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(response);
}));

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe - checks DB and Redis connectivity
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: All dependencies ready
 *       503:
 *         description: One or more dependencies not ready
 */
router.get('/ready', asyncHandler(async (_req: Request, res: Response) => {
  const { checkDatabaseHealth } = require('../utils/dbHealth');

  const checks: Record<string, { status: string; latency?: number }> = {};

  // Check database
  const dbStart = Date.now();
  try {
    const dbHealth = await checkDatabaseHealth();
    checks.database = {
      status: dbHealth.status === 'unhealthy' ? 'down' : 'up',
      latency: Date.now() - dbStart,
    };
  } catch {
    checks.database = { status: 'down', latency: Date.now() - dbStart };
  }

  // Check Redis
  const redisStart = Date.now();
  try {
    const { redisGet } = require('../config/redis');
    await redisGet('health-check');
    checks.redis = { status: 'up', latency: Date.now() - redisStart };
  } catch {
    checks.redis = { status: 'down', latency: Date.now() - redisStart };
  }

  const allReady = Object.values(checks).every(c => c.status === 'up');
  res.status(allReady ? 200 : 503).json({
    status: allReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
}));

/**
 * @swagger
 * /health/db:
 *   get:
 *     summary: Database health with latency
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database connection healthy
 *       503:
 *         description: Database connection unhealthy
 */
router.get('/db', asyncHandler(async (_req: Request, res: Response) => {
  const { checkDatabaseHealth } = require('../utils/dbHealth');
  const start = Date.now();
  const dbHealth = await checkDatabaseHealth();
  const latency = Date.now() - start;

  res.status(dbHealth.status === 'unhealthy' ? 503 : 200).json({
    status: dbHealth.status,
    latency: `${latency}ms`,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
