import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { eq, and, isNull, desc } from "drizzle-orm";
import {
  createSession,
  validateSession,
  updateActivity,
  SessionInfo,
} from "../services/sessionManager.js";
import { logger } from "../lib/monitoring.js";

/**
 * Extract client IP address from request.
 * Handles proxied requests (X-Forwarded-For, X-Real-IP).
 */
function getClientIp(req: Request): string {
  // Check for forwarded headers (from proxies/load balancers)
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (xForwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one (original client)
    const ips = Array.isArray(xForwardedFor)
      ? xForwardedFor[0]
      : xForwardedFor.split(",")[0];
    return ips.trim();
  }

  const xRealIp = req.headers["x-real-ip"];
  if (xRealIp) {
    return Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
  }

  // Fall back to direct connection IP
  return req.socket.remoteAddress || req.ip || "unknown";
}

export interface SubscriptionInfo {
  id: string;
  status: string;
  plan: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    plan: string;
    polarCustomerId?: string | null;
    subscription?: SubscriptionInfo | null;
  };
  apiKeyId?: string;
  apiKeyScopes?: string[];
  sessionId?: string;
  session?: SessionInfo;
}

/**
 * Authenticate requests using API key in X-API-Key header.
 * API keys are hashed and compared against the database.
 */
export async function apiKeyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey) {
    return res.status(401).json({
      error: "Missing API key",
      message: "Provide API key in X-API-Key header",
    });
  }

  if (!apiKey.startsWith("aitm_")) {
    return res.status(401).json({
      error: "Invalid API key format",
      message: "API keys start with aitm_",
    });
  }

  try {
    // Hash the API key
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    // Find the key in database (not revoked)
    const [keyRecord] = await db
      .select()
      .from(schema.apiKeys)
      .where(
        and(eq(schema.apiKeys.keyHash, keyHash), isNull(schema.apiKeys.revokedAt))
      )
      .limit(1);

    if (!keyRecord) {
      return res.status(401).json({
        error: "Invalid API key",
        message: "API key not found or revoked",
      });
    }

    // Check if key has expired
    if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
      return res.status(401).json({
        error: "API key expired",
        message: "This API key has expired. Please generate a new one.",
      });
    }

    // Check IP whitelist if configured
    if (keyRecord.allowedIps && keyRecord.allowedIps.length > 0) {
      const clientIp = getClientIp(req);
      if (!keyRecord.allowedIps.includes(clientIp)) {
        return res.status(403).json({
          error: "IP not allowed",
          message: "Your IP address is not authorized to use this API key",
        });
      }
    }

    // Get user info
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, keyRecord.userId))
      .limit(1);

    if (!user) {
      return res.status(401).json({
        error: "User not found",
        message: "User associated with API key not found",
      });
    }

    // Update last used timestamp
    await db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, keyRecord.id));

    // Fetch active subscription if exists
    let subscriptionInfo: SubscriptionInfo | null = null;
    const [activeSubscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, user.id),
          eq(schema.subscriptions.status, "active")
        )
      )
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);

    if (activeSubscription) {
      subscriptionInfo = {
        id: activeSubscription.id,
        status: activeSubscription.status,
        plan: activeSubscription.plan,
        currentPeriodEnd: activeSubscription.currentPeriodEnd,
        cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd ?? false,
      };
    }

    // Attach user to request
    req.user = {
      userId: user.id,
      email: user.email,
      plan: user.plan || "free",
      polarCustomerId: user.polarCustomerId,
      subscription: subscriptionInfo,
    };
    req.apiKeyId = keyRecord.id;
    req.apiKeyScopes = keyRecord.scopes || ["read", "write"];

    next();
  } catch (error) {
    logger.error("Auth error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(500).json({
      error: "Authentication failed",
      message: "Internal server error during authentication",
    });
  }
}

/**
 * Internal API authentication for server-to-server calls.
 * Uses X-Internal-Secret header.
 */
export function internalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const secret = req.headers["x-internal-secret"] as string;
  const expectedSecret = process.env.INTERNAL_SECRET;

  if (!expectedSecret) {
    logger.error("INTERNAL_SECRET not configured");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  if (secret !== expectedSecret) {
    return res.status(401).json({ error: "Invalid internal secret" });
  }

  next();
}

/**
 * Optional auth - allows unauthenticated requests but attaches user if present.
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.headers["x-api-key"] as string;

  if (!apiKey) {
    return next();
  }

  // Try to authenticate but don't fail if it doesn't work
  try {
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    const [keyRecord] = await db
      .select()
      .from(schema.apiKeys)
      .where(
        and(eq(schema.apiKeys.keyHash, keyHash), isNull(schema.apiKeys.revokedAt))
      )
      .limit(1);

    if (keyRecord) {
      // Skip expired keys in optional auth
      if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
        return next();
      }

      // Skip if IP not allowed
      if (keyRecord.allowedIps && keyRecord.allowedIps.length > 0) {
        const clientIp = getClientIp(req);
        if (!keyRecord.allowedIps.includes(clientIp)) {
          return next();
        }
      }

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, keyRecord.userId))
        .limit(1);

      if (user) {
        // Fetch active subscription if exists
        let subscriptionInfo: SubscriptionInfo | null = null;
        const [activeSubscription] = await db
          .select()
          .from(schema.subscriptions)
          .where(
            and(
              eq(schema.subscriptions.userId, user.id),
              eq(schema.subscriptions.status, "active")
            )
          )
          .orderBy(desc(schema.subscriptions.createdAt))
          .limit(1);

        if (activeSubscription) {
          subscriptionInfo = {
            id: activeSubscription.id,
            status: activeSubscription.status,
            plan: activeSubscription.plan,
            currentPeriodEnd: activeSubscription.currentPeriodEnd,
            cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd ?? false,
          };
        }

        req.user = {
          userId: user.id,
          email: user.email,
          plan: user.plan || "free",
          polarCustomerId: user.polarCustomerId,
          subscription: subscriptionInfo,
        };
        req.apiKeyId = keyRecord.id;
        req.apiKeyScopes = keyRecord.scopes || ["read", "write"];
      }
    }
  } catch (error) {
    // Ignore auth errors for optional auth
  }

  next();
}

/**
 * Authenticate requests using session token in Authorization header.
 * Session tokens use Bearer authentication scheme.
 */
export async function sessionAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers["authorization"] as string;

  if (!authHeader) {
    return res.status(401).json({
      error: "Missing authorization",
      message: "Provide session token in Authorization header as 'Bearer sess_...'",
    });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Invalid authorization format",
      message: "Use 'Bearer sess_...' format",
    });
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  if (!token.startsWith("sess_")) {
    return res.status(401).json({
      error: "Invalid token format",
      message: "Session tokens start with 'sess_'",
    });
  }

  try {
    const session = await validateSession(token);

    if (!session) {
      return res.status(401).json({
        error: "Invalid or expired session",
        message: "Session not found, expired, or revoked",
      });
    }

    // Get user info
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    if (!user) {
      return res.status(401).json({
        error: "User not found",
        message: "User associated with session not found",
      });
    }

    // Update session activity (non-blocking)
    updateActivity(session.id).catch((err) =>
      logger.error("Failed to update session activity", err instanceof Error ? err : undefined, { details: String(err) })
    );

    // Fetch active subscription if exists
    let subscriptionInfo: SubscriptionInfo | null = null;
    const [activeSubscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, user.id),
          eq(schema.subscriptions.status, "active")
        )
      )
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);

    if (activeSubscription) {
      subscriptionInfo = {
        id: activeSubscription.id,
        status: activeSubscription.status,
        plan: activeSubscription.plan,
        currentPeriodEnd: activeSubscription.currentPeriodEnd,
        cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd ?? false,
      };
    }

    // Attach user and session to request
    req.user = {
      userId: user.id,
      email: user.email,
      plan: user.plan || "free",
      polarCustomerId: user.polarCustomerId,
      subscription: subscriptionInfo,
    };
    req.sessionId = session.id;
    req.session = session;

    next();
  } catch (error) {
    logger.error("Session auth error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(500).json({
      error: "Authentication failed",
      message: "Internal server error during session authentication",
    });
  }
}

/**
 * Combined auth middleware that supports both API key and session token authentication.
 * Tries API key first (X-API-Key header), then session token (Authorization: Bearer).
 */
export async function combinedAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.headers["x-api-key"] as string;
  const authHeader = req.headers["authorization"] as string;

  // If API key is present, use API key auth
  if (apiKey) {
    return apiKeyAuth(req, res, next);
  }

  // If Authorization header with Bearer token is present, use session auth
  if (authHeader && authHeader.startsWith("Bearer sess_")) {
    return sessionAuth(req, res, next);
  }

  // Neither API key nor session token provided
  return res.status(401).json({
    error: "Missing authentication",
    message: "Provide API key in X-API-Key header or session token in Authorization header",
  });
}

/**
 * Create a session for the current user (to be called after successful API key auth).
 * Returns the session token that can be used for subsequent requests.
 */
export async function createUserSession(
  req: AuthenticatedRequest,
  res: Response
): Promise<{ sessionId: string; token: string; expiresAt: Date } | null> {
  if (!req.user) {
    return null;
  }

  try {
    const result = await createSession(req.user.userId, req);
    req.sessionId = result.sessionId;
    return result;
  } catch (error) {
    logger.error("Failed to create session", error instanceof Error ? error : undefined, { details: String(error) });
    return null;
  }
}

// Export getClientIp for use in other modules
export { getClientIp };
