import express from "express";
import cors from "cors";
import syncRoutes from "./routes/sync.js";
import restoreRoutes from "./routes/restore.js";
import internalRoutes from "./routes/internal.js";
import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import webhookRoutes from "./routes/webhooks.js";
import repositoriesRoutes from "./routes/repositories.js";
import searchRoutes from "./routes/search.js";
import contextsRoutes from "./routes/contexts.js";
import researchRoutes from "./routes/research.js";
import billingRoutes from "./routes/billing.js";
import keysRoutes from "./routes/keys.js";
import healthRoutes from "./routes/health.js";
import sessionsRoutes from "./routes/sessions.js";
import auditRoutes from "./routes/audit.js";
import dataSourcesRoutes from "./routes/data-sources.js";
import oracleRoutes from "./routes/oracle.js";
import packageSearchRoutes from "./routes/package-search.js";
import sharedCheckpointsRoutes from "./routes/shared-checkpoints.js";
import ssoRoutes from "./routes/sso.js";
import universalSearchRoutes from "./routes/universal-search.js";
import webSearchRoutes from "./routes/web-search.js";
import usageRoutes from "./routes/usage.js";
import researchPapersRoutes from "./routes/research-papers.js";
import exportRoutes from "./routes/export.js";
import pipelineRoutes from "./routes/pipeline.js";
import knowledgeBaseRoutes from "./routes/knowledge-base.js";
import actionsRoutes from "./routes/actions.js";
import timeRoutes from "./routes/time.js";
import consentRoutes from "./routes/consent.js";
import gitgramRoutes from "./routes/gitgram.js";
import checkpointContextRoutes from "./routes/context.js";
import dataRoutes from "./routes/data.js";
import retentionRoutes from "./routes/retention.js";
import treesRoutes from "./routes/trees.js";
import workersRoutes from "./routes/workers.js";
import organizationsRoutes from "./routes/organizations.js";
import orgMembersRoutes from "./routes/orgMembers.js";
import a2aRouter from "./routes/a2a.js";
import workspaceRouter from "./routes/workspace.js";
import beadsRouter from "./routes/beads.js";
import gitgramWebhooksRouter from "./routes/gitgramWebhooks.js";
import gitNexusRoutes from "./routes/gitnexus.js";
import context7Routes from "./routes/context7.js";
import sharingRoutes from "./routes/sharing.js";
import teamsRoutes from "./routes/teams.js";
import { errorHandler, notFoundHandler, wrapErrorMessage } from "./middleware/errors.js";
import { combinedRateLimit, rateLimits } from "./middleware/rate-limit.js";
import { requestLogger, logger, logError } from "./lib/monitoring.js";
import { requestLogger as httpRequestLogger } from "./middleware/requestLogger.js";
import { auditMiddleware } from "./middleware/auditMiddleware.js";
import { versioningMiddleware } from "./middleware/versioning.js";
import { setupSwagger } from "./swagger.js";
import { startBackgroundWorkers } from "./services/backgroundWorkers.js";

import { validateEnvOrExit } from "./lib/validateEnv.js";

validateEnvOrExit();

// Initialize Sentry error tracking (conditional on SENTRY_DSN)
if (process.env.SENTRY_DSN) {
  const Sentry = require("@sentry/node");
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "127.0.0.1";
const API_VERSION = "1.0.0";
const shouldListen = process.env.NODE_ENV !== "test" && process.env.AITM_TEST_NO_LISTEN !== "1";

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true,
}));
app.use(express.json({
  limit: "50mb",
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  },
})); // Large limit for blob uploads

// Request logging middleware (applied early to capture all requests)
app.use(requestLogger);
// Structured per-request HTTP logger (method, path, status, duration, user-agent, ip)
app.use(httpRequestLogger());

// Add request ID header to all responses
app.use((req, res, next) => {
  res.setHeader("X-Request-Id", `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  next();
});

// API versioning middleware (resolves version from header or URL prefix)
app.use(versioningMiddleware);

// Normalize legacy error responses into standard API error shape
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    if (body && typeof body === "object" && typeof body.error === "string") {
      return originalJson(wrapErrorMessage(res.statusCode || 500, body.error));
    }
    return originalJson(body);
  };
  next();
});

// Health check routes (no rate limiting, no auth required)
app.use("/health", healthRoutes);

// API Info endpoint
app.get("/v1", (req, res) => {
  res.json({
    version: API_VERSION,
    endpoints: {
      auth: "/v1/auth",
      keys: "/v1/keys",
      sessions: "/v1/sessions",
      audit: "/v1/audit",
      sync: "/v1/sync",
      restore: "/v1/restore",
      dashboard: "/v1/dashboard",
      webhooks: "/v1/webhooks",
      repositories: "/v1/repositories",
      search: "/v1/search",
      contexts: "/v1/contexts",
      research: "/v1/research",
      billing: "/v1/billing",
      dataSources: "/v1/data-sources",
      oracle: "/v1/oracle",
      deepResearch: "/v1/deep-research",
      packageSearch: "/v1/package-search",
      sharedCheckpoints: "/v1/shared-checkpoints",
      sso: "/v1/sso",
      universalSearch: "/v1/universal-search",
      query: "/v1/query",
      webSearch: "/v1/web-search",
      usage: "/v1/usage",
      researchPapers: "/v1/research-papers",
      pipeline: "/v1/pipeline",
      knowledgeBase: "/v1/knowledge-base",
      actions: "/v1/actions",
      time: "/v1/time",
      consent: "/v1/consent",
      gitgram: "/v1/gitgram",
      context: "/v1/context",
      data: "/v1/data",
      retention: "/v1/retention",
      trees: "/v1/trees",
      workers: "/v1/workers",
      organizations: "/v1/organizations",
      gitnexus: "/v1/gitnexus",
      context7: "/v1/context7",
      sharing: "/v1/shared",
      teams: "/v1/teams",
    },
    documentation: "/docs",
  });
});

// Apply rate limiting to all API routes
app.use("/v1", combinedRateLimit());
app.use("/api", combinedRateLimit());

// Apply audit middleware to all API routes (logs sensitive operations)
app.use("/v1", auditMiddleware());
app.use("/api", auditMiddleware());

// ============================================================================
// V1 API Routes (new versioned API)
// ============================================================================
app.use("/v1/auth", authRoutes);
app.use("/v1/keys", keysRoutes);
app.use("/v1/sessions", sessionsRoutes);
app.use("/v1/audit", auditRoutes);
app.use("/v1/sync", syncRoutes);
app.use("/v1/restore", restoreRoutes);
app.use("/v1/dashboard", dashboardRoutes);
app.use("/v1/webhooks", webhookRoutes);
app.use("/v1/repositories", repositoriesRoutes);
app.use("/v1/search", searchRoutes);
app.use("/v1/contexts", contextsRoutes);
app.use("/v1/research", researchRoutes);
app.use("/v1/billing", billingRoutes);
app.use("/v1/data-sources", dataSourcesRoutes);
app.use("/v1/oracle", oracleRoutes);
app.use("/v1/deep-research", oracleRoutes);
app.use("/v1/package-search", packageSearchRoutes);
app.use("/v1/shared-checkpoints", sharedCheckpointsRoutes);
app.use("/v1/sso", ssoRoutes);
app.use("/v1/universal-search", universalSearchRoutes);
app.use("/v1/query", universalSearchRoutes);
app.use("/v1/web-search", webSearchRoutes);
app.use("/v1/usage", usageRoutes);
app.use("/v1/research-papers", researchPapersRoutes);
app.use("/v1/export", exportRoutes);
app.use("/v1/pipeline", pipelineRoutes);
app.use("/v1/knowledge-base", knowledgeBaseRoutes);
app.use("/v1/actions", actionsRoutes);
app.use("/v1/time", timeRoutes);
app.use("/v1/consent", consentRoutes);
app.use("/v1/gitgram", gitgramRoutes);
app.use("/v1/context", checkpointContextRoutes);
app.use("/v1/data", dataRoutes);
app.use("/v1/retention", retentionRoutes);
app.use("/v1/trees", treesRoutes);
app.use("/v1/workers", workersRoutes);
app.use("/v1/organizations", organizationsRoutes);
app.use("/v1/organizations/:id/members", orgMembersRoutes);
app.use("/a2a", a2aRouter);
app.use("/workspace", workspaceRouter);
app.use("/beads", beadsRouter);
app.use("/v1/gitgram-webhooks", gitgramWebhooksRouter);
app.use("/v1/gitnexus", gitNexusRoutes);
app.use("/v1/context7", context7Routes);
app.use("/v1", sharingRoutes);
app.use("/v1/teams", teamsRoutes);

// ============================================================================
// Legacy API Routes (backwards compatibility)
// ============================================================================
app.use("/api/auth", authRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/restore", restoreRoutes);
app.use("/api/internal", internalRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/actions", actionsRoutes);
app.use("/api/time", timeRoutes);
app.use("/api/consent", consentRoutes);
app.use("/api/gitgram", gitgramRoutes);
app.use("/api/context", checkpointContextRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/retention", retentionRoutes);
app.use("/api/trees", treesRoutes);
app.use("/api/workers", workersRoutes);

// PRD compatibility aliases for social APIs
app.use("/api", gitgramRoutes);

// ============================================================================
// API Documentation (Swagger UI)
// ============================================================================
setupSwagger(app);

// ============================================================================
// Error Handling (OpenAI-style)
// ============================================================================
// Error logging wrapper that logs before passing to error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logError(err, {
    requestId: res.getHeader("X-Request-Id") as string,
    userId: (req as any).userId,
    operation: `${req.method} ${req.path}`,
    metadata: {
      query: req.query,
      body: req.body ? "[REDACTED]" : undefined,
    },
  });
  next(err);
});
app.use(errorHandler);
app.use(notFoundHandler);

if (shouldListen) {
  const workerScheduler = startBackgroundWorkers();

  const shutdownWorkers = () => {
    workerScheduler.stop();
  };

  process.on("SIGINT", shutdownWorkers);
  process.on("SIGTERM", shutdownWorkers);

  const server = app.listen(Number(PORT), HOST, () => {
    const publicHost = HOST === "0.0.0.0" ? "localhost" : HOST;
    logger.info(`Gitgram TimeMachine API server started`, {
      version: API_VERSION,
      port: PORT,
      host: HOST,
      nodeEnv: process.env.NODE_ENV || "development",
    });
    logger.info(`Health check endpoints available`, {
      basic: `http://${publicHost}:${PORT}/health`,
      ready: `http://${publicHost}:${PORT}/health/ready`,
      live: `http://${publicHost}:${PORT}/health/live`,
    });
    logger.info(`API v1 available at http://${publicHost}:${PORT}/v1`);
    logger.info(`API documentation available at http://${publicHost}:${PORT}/docs`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.error(`Port ${PORT} is already in use on host ${HOST}`);
    } else if (error.code === "EACCES" || error.code === "EPERM") {
      logger.error(`Permission denied binding to ${HOST}:${PORT}`);
    } else {
      logger.error(`Failed to bind server on ${HOST}:${PORT}: ${error.message}`);
    }
    process.exit(1);
  });
} else if (process.env.NODE_ENV !== "test") {
  logger.info("AITM API started in no-listen mode (AITM_TEST_NO_LISTEN=1)");
}

export default app;
