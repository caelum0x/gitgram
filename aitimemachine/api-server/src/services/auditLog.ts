import { Request } from "express";
import { db, schema } from "../db/index.js";
import { logger } from "../lib/monitoring.js";

// ============================================
// AUDIT LOG TYPES
// ============================================

export type AuditAction =
  // API Key actions
  | "key.created"
  | "key.revoked"
  | "key.updated"
  // Checkpoint actions
  | "checkpoint.created"
  | "checkpoint.restored"
  | "checkpoint.deleted"
  // Webhook actions
  | "webhook.created"
  | "webhook.updated"
  | "webhook.deleted"
  // Settings actions
  | "settings.updated"
  // Authentication actions
  | "login"
  | "logout"
  | "api_key.used"
  // Project actions
  | "project.created"
  | "project.updated"
  | "project.deleted"
  // Repository actions
  | "repository.created"
  | "repository.indexed"
  | "repository.deleted"
  // Research actions
  | "research.started"
  | "research.completed"
  // Governance actions
  | "consent.checked"
  | "consent.updated"
  | "capture.denied"
  | "export.denied"
  | "data.delete_requested"
  | "data.delete_processed"
  | "data.delete_failed"
  | "retention.updated"
  | "retention.applied";

export type ResourceType =
  | "api_key"
  | "checkpoint"
  | "webhook"
  | "settings"
  | "project"
  | "repository"
  | "research_job"
  | "user"
  | "session"
  | "consent"
  | "export_job";

export interface AuditLogMetadata {
  [key: string]: unknown;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string;
  apiKeyPrefix?: string;
  projectId?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract IP address from request.
 * Handles proxy headers (X-Forwarded-For, X-Real-IP).
 */
function getIpAddress(req: Request): string | null {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    // X-Forwarded-For can be a comma-separated list; take the first IP
    const ips = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(",")[0];
    return ips.trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return req.ip || req.socket?.remoteAddress || null;
}

/**
 * Extract user agent from request.
 */
function getUserAgent(req: Request): string | null {
  const userAgent = req.headers["user-agent"];
  if (!userAgent) return null;
  // Truncate to reasonable length
  return userAgent.substring(0, 500);
}

// ============================================
// MAIN AUDIT LOG FUNCTION
// ============================================

/**
 * Log an audit action to the database.
 *
 * @param userId - The user ID performing the action
 * @param action - The type of action being performed
 * @param resourceType - The type of resource being affected
 * @param resourceId - The ID of the affected resource (optional)
 * @param metadata - Additional context about the action (optional)
 * @param req - Express request object for IP/user agent extraction (optional)
 */
export async function logAction(
  userId: string,
  action: AuditAction,
  resourceType: ResourceType | null,
  resourceId: string | null,
  metadata: AuditLogMetadata | null = null,
  req?: Request
): Promise<void> {
  try {
    await db.insert(schema.auditLogs).values({
      userId,
      action,
      resourceType,
      resourceId,
      ipAddress: req ? getIpAddress(req) : null,
      userAgent: req ? getUserAgent(req) : null,
      metadata,
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break the main flow
    logger.error("Failed to write audit log", error instanceof Error ? error : undefined, {
      userId,
      action,
      resourceType,
      resourceId,
      details: String(error),
    });
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Log API key creation.
 */
export async function logKeyCreated(
  userId: string,
  keyId: string,
  keyPrefix: string,
  keyName: string | null,
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "key.created",
    "api_key",
    keyId,
    {
      apiKeyPrefix: keyPrefix,
      keyName,
    },
    req
  );
}

/**
 * Log API key revocation.
 */
export async function logKeyRevoked(
  userId: string,
  keyId: string,
  keyPrefix: string,
  reason?: string,
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "key.revoked",
    "api_key",
    keyId,
    {
      apiKeyPrefix: keyPrefix,
      reason,
    },
    req
  );
}

/**
 * Log checkpoint creation.
 */
export async function logCheckpointCreated(
  userId: string,
  checkpointId: string,
  projectId: string,
  checkpointName: string,
  triggerType?: string,
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "checkpoint.created",
    "checkpoint",
    checkpointId,
    {
      projectId,
      checkpointName,
      triggerType,
    },
    req
  );
}

/**
 * Log checkpoint restoration.
 */
export async function logCheckpointRestored(
  userId: string,
  checkpointId: string,
  projectId: string,
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "checkpoint.restored",
    "checkpoint",
    checkpointId,
    {
      projectId,
    },
    req
  );
}

/**
 * Log webhook creation.
 */
export async function logWebhookCreated(
  userId: string,
  webhookId: string,
  url: string,
  events: string[],
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "webhook.created",
    "webhook",
    webhookId,
    {
      url,
      events,
    },
    req
  );
}

/**
 * Log webhook update.
 */
export async function logWebhookUpdated(
  userId: string,
  webhookId: string,
  changes: Record<string, unknown>,
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "webhook.updated",
    "webhook",
    webhookId,
    {
      newValues: changes,
    },
    req
  );
}

/**
 * Log webhook deletion.
 */
export async function logWebhookDeleted(
  userId: string,
  webhookId: string,
  req?: Request
): Promise<void> {
  await logAction(userId, "webhook.deleted", "webhook", webhookId, null, req);
}

/**
 * Log settings update.
 */
export async function logSettingsUpdated(
  userId: string,
  settingsType: string,
  changes: Record<string, unknown>,
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "settings.updated",
    "settings",
    settingsType,
    {
      newValues: changes,
    },
    req
  );
}

/**
 * Log API key usage (authentication event).
 */
export async function logApiKeyUsed(
  userId: string,
  keyId: string,
  keyPrefix: string,
  endpoint: string,
  method: string,
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "api_key.used",
    "api_key",
    keyId,
    {
      apiKeyPrefix: keyPrefix,
      endpoint,
      method,
    },
    req
  );
}

/**
 * Log project creation.
 */
export async function logProjectCreated(
  userId: string,
  projectId: string,
  projectName: string,
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "project.created",
    "project",
    projectId,
    {
      projectName,
    },
    req
  );
}

/**
 * Log login event.
 */
export async function logLogin(
  userId: string,
  method: string,
  req?: Request
): Promise<void> {
  await logAction(
    userId,
    "login",
    "user",
    userId,
    {
      method,
    },
    req
  );
}

/**
 * Log logout event.
 */
export async function logLogout(userId: string, req?: Request): Promise<void> {
  await logAction(userId, "logout", "user", userId, null, req);
}
