import { Router, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  probeConnection,
  probeLatency,
  probeReplication,
  probeTableSchema,
  probeMigrationDrift,
  EXPECTED_TABLES,
} from "../health/db-health.js";
import {
  checkProvider,
  checkAllProviders,
  getCachedHealth,
} from "../services/providerHealthService.js";
import { enginePaths, ENGINE_DIRS } from "../services/engineManager.js";

const router = Router();

// Track server start time for uptime calculation
const startTime = Date.now();

// Get version from environment or default
const API_VERSION = process.env.API_VERSION || "1.0.0";

/**
 * Health check response structure
 */
interface HealthResponse {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  version: string;
  uptime: number;
  uptimeFormatted: string;
  checks?: {
    [key: string]: {
      status: "pass" | "fail" | "warn";
      message?: string;
      duration_ms?: number;
    };
  };
}

/**
 * Format uptime into human-readable string
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * GET /health - Basic health check
 * Returns 200 OK if the server is running
 * No authentication required
 */
router.get("/", (req: Request, res: Response) => {
  const uptime = Date.now() - startTime;

  const response: HealthResponse = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: API_VERSION,
    uptime,
    uptimeFormatted: formatUptime(uptime),
  };

  res.status(200).json(response);
});

/**
 * GET /health/live - Liveness check
 * Returns 200 if the server process is running and responsive
 * Used by Kubernetes/container orchestrators to determine if container should be restarted
 */
router.get("/live", (req: Request, res: Response) => {
  const uptime = Date.now() - startTime;

  const response: HealthResponse = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: API_VERSION,
    uptime,
    uptimeFormatted: formatUptime(uptime),
    checks: {
      process: {
        status: "pass",
        message: "Process is running",
      },
    },
  };

  res.status(200).json(response);
});

/**
 * GET /health/ready - Readiness check
 * Returns 200 if the server is ready to accept traffic
 * Checks database connectivity and other critical dependencies
 * Used by Kubernetes/load balancers to determine if traffic should be routed to this instance
 */
router.get("/ready", async (req: Request, res: Response) => {
  const uptime = Date.now() - startTime;
  const checks: HealthResponse["checks"] = {};
  let overallStatus: HealthResponse["status"] = "healthy";

  // Check database connection
  const dbCheckStart = Date.now();
  try {
    // Execute a simple query to verify DB connectivity
    await db.execute(sql`SELECT 1 as health_check`);
    checks.database = {
      status: "pass",
      message: "Database connection successful",
      duration_ms: Date.now() - dbCheckStart,
    };
  } catch (error) {
    checks.database = {
      status: "fail",
      message: error instanceof Error ? error.message : "Database connection failed",
      duration_ms: Date.now() - dbCheckStart,
    };
    overallStatus = "unhealthy";
  }

  // Check memory usage
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const heapUsagePercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

  if (heapUsagePercent > 90) {
    checks.memory = {
      status: "warn",
      message: `High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)`,
    };
    if (overallStatus === "healthy") {
      overallStatus = "degraded";
    }
  } else {
    checks.memory = {
      status: "pass",
      message: `Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)`,
    };
  }

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: API_VERSION,
    uptime,
    uptimeFormatted: formatUptime(uptime),
    checks,
  };

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;
  res.status(statusCode).json(response);
});

/**
 * GET /health/db - Database health status
 * Returns connection, latency, and replication probe results.
 * No authentication required.
 */
router.get("/db", async (req: Request, res: Response) => {
  const connection = await probeConnection();
  const latency = await probeLatency();
  const replication = await probeReplication();

  const statuses = [connection.status, latency.status, replication.status];
  let overall: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (statuses.includes("fail")) {
    overall = "unhealthy";
  } else if (statuses.includes("warn")) {
    overall = "degraded";
  }

  const statusCode = overall === "unhealthy" ? 503 : 200;

  res.status(statusCode).json({
    status: overall,
    timestamp: new Date().toISOString(),
    checks: {
      connection,
      latency,
      replication,
    },
  });
});

/**
 * GET /health/schema - Schema verification results
 * Checks all expected tables, columns, indexes, and migration drift.
 * No authentication required.
 */
router.get("/schema", async (req: Request, res: Response) => {
  const schemaResults = [];
  for (const [tableName, def] of Object.entries(EXPECTED_TABLES)) {
    const result = await probeTableSchema(
      tableName,
      def.columns,
      def.indexes
    );
    schemaResults.push(result);
  }

  const migrationDrift = await probeMigrationDrift();

  const allStatuses = [
    ...schemaResults.map((s) => s.status),
    migrationDrift.status,
  ];

  let overall: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (allStatuses.includes("fail")) {
    overall = "unhealthy";
  } else if (allStatuses.includes("warn")) {
    overall = "degraded";
  }

  const failedTables = schemaResults.filter((s) => s.status === "fail");
  const warnTables = schemaResults.filter((s) => s.status === "warn");

  const statusCode = overall === "unhealthy" ? 503 : 200;

  res.status(statusCode).json({
    status: overall,
    timestamp: new Date().toISOString(),
    summary: {
      totalTables: schemaResults.length,
      passingTables: schemaResults.filter((s) => s.status === "pass").length,
      failingTables: failedTables.length,
      warningTables: warnTables.length,
    },
    migrationDrift,
    tables: schemaResults,
  });
});

/**
 * GET /health/providers - Full provider HealthReport
 * Returns the cached result (TTL 30s) or runs a fresh check.
 * No authentication required.
 */
router.get("/providers", async (req: Request, res: Response) => {
  try {
    const cached = getCachedHealth();
    if (cached) {
      const statusCode = cached.overall === "unavailable" ? 503 : 200;
      return res.status(statusCode).json(cached);
    }

    const report = await checkAllProviders();
    const statusCode = report.overall === "unavailable" ? 503 : 200;
    return res.status(statusCode).json(report);
  } catch (err) {
    return res.status(500).json({
      error: "Failed to run provider health checks",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /health/providers/:name - Single provider health
 * Checks a specific provider by name (case-sensitive).
 * Valid names: GitNexus, Context7, Beads, PAL, OpenAI, Anthropic, PostgreSQL, Redis
 * No authentication required.
 */
router.get("/providers/:name", async (req: Request, res: Response) => {
  const { name } = req.params;
  try {
    const result = await checkProvider(name);
    const statusCode = result.status === "unavailable" ? 503 : 200;
    return res.status(statusCode).json(result);
  } catch (err) {
    return res.status(500).json({
      error: `Failed to check provider: ${name}`,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /health/engines - Bundled engine binary resolution diagnostics.
 *
 * Reports whether each first-party engine (beads, git, pal) resolves to a
 * bundled build, an env override, the system PATH, or is unavailable.
 * No authentication required.
 */
router.get("/engines", (_req: Request, res: Response) => {
  const engines = enginePaths();
  const allResolved = Object.values(engines).every((e) => e.path !== null);
  return res.status(allResolved ? 200 : 503).json({
    status: allResolved ? "ok" : "degraded",
    dirs: ENGINE_DIRS,
    engines,
  });
});

export default router;
