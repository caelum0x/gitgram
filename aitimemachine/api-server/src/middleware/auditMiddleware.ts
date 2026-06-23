import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { logApiKeyUsed, logAction, AuditAction, ResourceType } from "../services/auditLog.js";
import { logger } from "../lib/monitoring.js";

// ============================================
// TYPES
// ============================================

interface AuditMiddlewareOptions {
  /**
   * Whether to log every API key usage.
   * Default: false (only logs sensitive operations)
   */
  logAllRequests?: boolean;

  /**
   * Paths to exclude from logging (exact match or regex)
   */
  excludePaths?: (string | RegExp)[];

  /**
   * Methods to exclude from logging
   */
  excludeMethods?: string[];
}

// ============================================
// SENSITIVE OPERATIONS MAP
// ============================================

interface AuditOperationConfig {
  action: AuditAction;
  resourceType: ResourceType;
  getResourceId?: (req: AuthenticatedRequest) => string | null;
  getMetadata?: (req: AuthenticatedRequest) => Record<string, unknown> | null;
}

/**
 * Map of sensitive operations that should be automatically logged.
 * Key format: "METHOD:path_pattern"
 */
const SENSITIVE_OPERATIONS: Record<string, AuditOperationConfig> = {
  // Key management
  "POST:/v1/auth/keys": {
    action: "key.created",
    resourceType: "api_key",
    getMetadata: (req) => ({
      keyName: req.body?.name,
      scopes: req.body?.scopes,
    }),
  },
  "DELETE:/v1/auth/keys/:keyId": {
    action: "key.revoked",
    resourceType: "api_key",
    getResourceId: (req) => req.params.keyId,
  },
  "PATCH:/v1/auth/keys/:keyId": {
    action: "key.updated",
    resourceType: "api_key",
    getResourceId: (req) => req.params.keyId,
    getMetadata: (req) => ({
      changes: Object.keys(req.body || {}),
    }),
  },

  // Webhook management
  "POST:/v1/webhooks/register": {
    action: "webhook.created",
    resourceType: "webhook",
    getMetadata: (req) => ({
      url: req.body?.url,
      events: req.body?.events,
    }),
  },
  "DELETE:/v1/webhooks/:webhookId": {
    action: "webhook.deleted",
    resourceType: "webhook",
    getResourceId: (req) => req.params.webhookId,
  },
  "PATCH:/v1/webhooks/:webhookId": {
    action: "webhook.updated",
    resourceType: "webhook",
    getResourceId: (req) => req.params.webhookId,
    getMetadata: (req) => ({
      changes: Object.keys(req.body || {}),
    }),
  },

  // Checkpoint operations
  "POST:/v1/sync/checkpoints": {
    action: "checkpoint.created",
    resourceType: "checkpoint",
    getResourceId: (req) => req.body?.id,
    getMetadata: (req) => ({
      projectId: req.body?.projectId,
      name: req.body?.name,
      triggerType: req.body?.triggerType,
    }),
  },
  "POST:/v1/restore/checkpoint": {
    action: "checkpoint.restored",
    resourceType: "checkpoint",
    getResourceId: (req) => req.body?.checkpointId,
    getMetadata: (req) => ({
      projectId: req.body?.projectId,
    }),
  },

  // Project operations
  "POST:/v1/sync/projects": {
    action: "project.created",
    resourceType: "project",
    getResourceId: (req) => req.body?.id,
    getMetadata: (req) => ({
      name: req.body?.name,
      rootPath: req.body?.rootPath,
    }),
  },

  // Repository operations
  "POST:/v1/repositories": {
    action: "repository.created",
    resourceType: "repository",
    getResourceId: (req) => req.body?.id,
    getMetadata: (req) => ({
      projectId: req.body?.projectId,
      name: req.body?.name,
    }),
  },
  "POST:/v1/repositories/:repoId/index": {
    action: "repository.indexed",
    resourceType: "repository",
    getResourceId: (req) => req.params.repoId,
  },
  "DELETE:/v1/repositories/:repoId": {
    action: "repository.deleted",
    resourceType: "repository",
    getResourceId: (req) => req.params.repoId,
  },

  // Research operations
  "POST:/v1/research": {
    action: "research.started",
    resourceType: "research_job",
    getMetadata: (req) => ({
      query: req.body?.query?.substring(0, 200), // Truncate for privacy
      projectId: req.body?.projectId,
    }),
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Match a request path against a pattern with :params
 */
function matchPath(requestPath: string, pattern: string): boolean {
  // Convert pattern to regex (e.g., "/v1/webhooks/:webhookId" -> "/v1/webhooks/[^/]+")
  const regexPattern = pattern.replace(/:[^/]+/g, "[^/]+");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(requestPath);
}

/**
 * Find the operation config for a request
 */
function findOperationConfig(
  method: string,
  path: string
): AuditOperationConfig | null {
  // Direct match
  const directKey = `${method}:${path}`;
  if (SENSITIVE_OPERATIONS[directKey]) {
    return SENSITIVE_OPERATIONS[directKey];
  }

  // Pattern match
  for (const [key, config] of Object.entries(SENSITIVE_OPERATIONS)) {
    const [keyMethod, keyPattern] = key.split(":", 2);
    if (keyMethod === method && matchPath(path, keyPattern)) {
      return config;
    }
  }

  return null;
}

/**
 * Check if a path should be excluded
 */
function shouldExclude(
  path: string,
  method: string,
  options: AuditMiddlewareOptions
): boolean {
  // Check excluded methods
  if (options.excludeMethods?.includes(method)) {
    return true;
  }

  // Check excluded paths
  if (options.excludePaths) {
    for (const excludePath of options.excludePaths) {
      if (typeof excludePath === "string") {
        if (path === excludePath || path.startsWith(excludePath + "/")) {
          return true;
        }
      } else if (excludePath.test(path)) {
        return true;
      }
    }
  }

  return false;
}

// ============================================
// MIDDLEWARE FUNCTIONS
// ============================================

/**
 * Middleware to automatically log sensitive API operations.
 * Logs operations after the response is sent (non-blocking).
 */
export function auditMiddleware(options: AuditMiddlewareOptions = {}) {
  const defaultExcludePaths = [
    "/health",
    "/v1/audit", // Don't log audit log access
  ];

  const mergedOptions: AuditMiddlewareOptions = {
    logAllRequests: false,
    excludePaths: [...defaultExcludePaths, ...(options.excludePaths || [])],
    excludeMethods: options.excludeMethods || ["OPTIONS", "HEAD"],
  };

  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    // Skip if user is not authenticated
    if (!req.user) {
      return next();
    }

    // Skip excluded paths/methods
    if (shouldExclude(req.path, req.method, mergedOptions)) {
      return next();
    }

    // Store original end function
    const originalEnd = res.end;
    const startTime = Date.now();

    // Override end to log after response
    res.end = function (
      this: Response,
      chunk?: unknown,
      encoding?: BufferEncoding | (() => void),
      cb?: () => void
    ): Response {
      // Restore original end
      res.end = originalEnd;

      // Call original end with proper type handling
      let result: Response;
      if (typeof encoding === "function") {
        // encoding is actually the callback
        result = (originalEnd as Function).call(this, chunk, encoding);
      } else if (typeof cb === "function") {
        result = (originalEnd as Function).call(this, chunk, encoding, cb);
      } else {
        result = (originalEnd as Function).call(this, chunk, encoding);
      }

      // Log asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          // Only log successful operations (2xx status codes)
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return;
          }

          const operationConfig = findOperationConfig(req.method, req.path);

          if (operationConfig) {
            // Log sensitive operation
            const resourceId = operationConfig.getResourceId
              ? operationConfig.getResourceId(req)
              : null;
            const metadata = operationConfig.getMetadata
              ? operationConfig.getMetadata(req)
              : null;

            await logAction(
              req.user!.userId,
              operationConfig.action,
              operationConfig.resourceType,
              resourceId,
              {
                ...metadata,
                responseTime: Date.now() - startTime,
                statusCode: res.statusCode,
              },
              req
            );
          } else if (mergedOptions.logAllRequests && req.apiKeyId) {
            // Log API key usage for all requests
            await logApiKeyUsed(
              req.user!.userId,
              req.apiKeyId,
              "****", // Don't include prefix in generic logging
              req.path,
              req.method,
              req
            );
          }
        } catch (error) {
          logger.error("Audit middleware logging error", error instanceof Error ? error : undefined, { details: String(error) });
        }
      });

      return result;
    } as typeof res.end;

    next();
  };
}

/**
 * Middleware to log all API key authentication events.
 * Use this sparingly as it creates a lot of log entries.
 */
export function logAllApiKeyUsage() {
  return auditMiddleware({ logAllRequests: true });
}

/**
 * Middleware factory for logging specific actions.
 * Use this for custom audit logging in specific routes.
 */
export function createAuditLogger(
  action: AuditAction,
  resourceType: ResourceType,
  getResourceId?: (req: AuthenticatedRequest) => string | null,
  getMetadata?: (req: AuthenticatedRequest) => Record<string, unknown> | null
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    // Store original json function
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      // Log after successful response
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        setImmediate(async () => {
          try {
            const resourceId = getResourceId ? getResourceId(req) : null;
            const metadata = getMetadata ? getMetadata(req) : null;
            await logAction(
              req.user!.userId,
              action,
              resourceType,
              resourceId,
              metadata,
              req
            );
          } catch (error) {
            logger.error("Custom audit logger error", error instanceof Error ? error : undefined, { details: String(error) });
          }
        });
      }

      return originalJson(body);
    };

    next();
  };
}

export default auditMiddleware;
