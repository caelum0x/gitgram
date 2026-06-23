import { Router } from "express";
import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { eq, and, isNull, desc } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  requireScope,
  SCOPES,
  validateScopes,
  normalizeScopes,
  DEFAULT_SCOPES,
  ALL_SCOPES,
} from "../middleware/scopeCheck.js";
import {
  logKeyCreated,
  logKeyRevoked,
  logAction,
} from "../services/auditLog.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a new API key with the aitm_ prefix
 */
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  return `aitm_${randomBytes}`;
}

/**
 * Hash an API key for storage
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Generate a unique key ID
 */
function generateKeyId(): string {
  return `key_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /v1/keys - List all API keys for the authenticated user
 * Requires: read scope
 */
router.get(
  "/",
  apiKeyAuth,
  requireScope(SCOPES.READ),
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;

      const keys = await db
        .select({
          id: schema.apiKeys.id,
          name: schema.apiKeys.name,
          keyPrefix: schema.apiKeys.keyPrefix,
          scopes: schema.apiKeys.scopes,
          expiresAt: schema.apiKeys.expiresAt,
          allowedIps: schema.apiKeys.allowedIps,
          lastUsedAt: schema.apiKeys.lastUsedAt,
          createdAt: schema.apiKeys.createdAt,
          revokedAt: schema.apiKeys.revokedAt,
        })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.userId, userId))
        .orderBy(desc(schema.apiKeys.createdAt));

      // Mark expired keys
      const keysWithStatus = keys.map((key: any) => ({
        ...key,
        status: key.revokedAt
          ? "revoked"
          : key.expiresAt && new Date(key.expiresAt) < new Date()
            ? "expired"
            : "active",
      }));

      res.json({
        keys: keysWithStatus,
        total: keysWithStatus.length,
      });
    } catch (error) {
      logger.error("List keys error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to list API keys" });
    }
  }
);

/**
 * GET /v1/keys/:id - Get details of a specific API key
 * Requires: read scope
 */
router.get(
  "/:id",
  apiKeyAuth,
  requireScope(SCOPES.READ),
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const keyId = req.params.id;

      const [key] = await db
        .select({
          id: schema.apiKeys.id,
          name: schema.apiKeys.name,
          keyPrefix: schema.apiKeys.keyPrefix,
          scopes: schema.apiKeys.scopes,
          expiresAt: schema.apiKeys.expiresAt,
          allowedIps: schema.apiKeys.allowedIps,
          lastUsedAt: schema.apiKeys.lastUsedAt,
          createdAt: schema.apiKeys.createdAt,
          revokedAt: schema.apiKeys.revokedAt,
        })
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId)))
        .limit(1);

      if (!key) {
        return res.status(404).json({ error: "API key not found" });
      }

      const status = key.revokedAt
        ? "revoked"
        : key.expiresAt && new Date(key.expiresAt) < new Date()
          ? "expired"
          : "active";

      res.json({
        ...key,
        status,
      });
    } catch (error) {
      logger.error("Get key error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get API key" });
    }
  }
);

/**
 * POST /v1/keys - Create a new API key
 * Requires: admin scope
 */
router.post(
  "/",
  apiKeyAuth,
  requireScope(SCOPES.ADMIN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const {
        name = "API Key",
        scopes = DEFAULT_SCOPES,
        expiresAt,
        allowedIps,
      } = req.body;

      // Validate scopes
      const scopeValidation = validateScopes(scopes);
      if (!scopeValidation.valid) {
        return res.status(400).json({
          error: "Invalid scopes",
          message: `Invalid scope values: ${scopeValidation.invalidScopes.join(", ")}`,
          validScopes: ALL_SCOPES,
        });
      }

      // Normalize scopes (remove duplicates)
      const normalizedScopes = normalizeScopes(scopes);

      // Validate expiresAt if provided
      let expiresAtDate: Date | null = null;
      if (expiresAt) {
        expiresAtDate = new Date(expiresAt);
        if (isNaN(expiresAtDate.getTime())) {
          return res.status(400).json({
            error: "Invalid expiration date",
            message: "expiresAt must be a valid ISO 8601 date string",
          });
        }
        if (expiresAtDate < new Date()) {
          return res.status(400).json({
            error: "Invalid expiration date",
            message: "expiresAt must be in the future",
          });
        }
      }

      // Validate allowedIps if provided
      let validatedIps: string[] | null = null;
      if (allowedIps && Array.isArray(allowedIps) && allowedIps.length > 0) {
        // Basic IP validation (IPv4 and IPv6)
        const ipRegex =
          /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^localhost$/;
        const invalidIps = allowedIps.filter((ip: string) => !ipRegex.test(ip));
        if (invalidIps.length > 0) {
          return res.status(400).json({
            error: "Invalid IP addresses",
            message: `Invalid IP address format: ${invalidIps.join(", ")}`,
          });
        }
        validatedIps = allowedIps;
      }

      // Generate the API key
      const apiKey = generateApiKey();
      const keyHash = hashApiKey(apiKey);
      const keyPrefix = apiKey.substring(0, 12); // aitm_ + first 7 chars
      const keyId = generateKeyId();

      // Insert the key
      await db.insert(schema.apiKeys).values({
        id: keyId,
        userId,
        keyHash,
        keyPrefix,
        name,
        scopes: normalizedScopes,
        expiresAt: expiresAtDate,
        allowedIps: validatedIps,
        createdAt: new Date(),
      });

      // Log audit event
      await logKeyCreated(userId, keyId, keyPrefix, name, req);

      res.status(201).json({
        id: keyId,
        key: apiKey, // Only returned once at creation time
        name,
        keyPrefix,
        scopes: normalizedScopes,
        expiresAt: expiresAtDate,
        allowedIps: validatedIps,
        createdAt: new Date().toISOString(),
        message:
          "Store this API key securely. It will not be shown again.",
      });
    } catch (error) {
      logger.error("Create key error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to create API key" });
    }
  }
);

/**
 * DELETE /v1/keys/:id - Revoke an API key
 * Requires: admin scope (to revoke any key) or write scope (to revoke own non-admin keys)
 */
router.delete(
  "/:id",
  apiKeyAuth,
  requireScope(SCOPES.WRITE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const keyId = req.params.id;
      const userScopes = req.apiKeyScopes || [];

      // Find the key
      const [key] = await db
        .select()
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId)))
        .limit(1);

      if (!key) {
        return res.status(404).json({ error: "API key not found" });
      }

      if (key.revokedAt) {
        return res.status(400).json({ error: "API key is already revoked" });
      }

      // Prevent revoking the current key being used
      if (key.id === req.apiKeyId) {
        return res.status(400).json({
          error: "Cannot revoke current key",
          message: "You cannot revoke the API key you are currently using",
        });
      }

      // If the key has admin scope, require admin scope to revoke it
      if (key.scopes?.includes(SCOPES.ADMIN) && !userScopes.includes(SCOPES.ADMIN)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Admin scope required to revoke admin keys",
        });
      }

      // Revoke the key
      await db
        .update(schema.apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(schema.apiKeys.id, keyId));

      // Log audit event
      await logKeyRevoked(userId, keyId, key.keyPrefix, "User requested revocation", req);

      res.json({
        id: keyId,
        status: "revoked",
        revokedAt: new Date().toISOString(),
        message: "API key has been revoked",
      });
    } catch (error) {
      logger.error("Revoke key error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  }
);

/**
 * PATCH /v1/keys/:id/scopes - Update scopes of an API key
 * Requires: admin scope
 */
router.patch(
  "/:id/scopes",
  apiKeyAuth,
  requireScope(SCOPES.ADMIN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const keyId = req.params.id;
      const { scopes } = req.body;

      if (!scopes || !Array.isArray(scopes)) {
        return res.status(400).json({
          error: "Invalid request",
          message: "scopes must be an array of scope strings",
        });
      }

      // Validate scopes
      const scopeValidation = validateScopes(scopes);
      if (!scopeValidation.valid) {
        return res.status(400).json({
          error: "Invalid scopes",
          message: `Invalid scope values: ${scopeValidation.invalidScopes.join(", ")}`,
          validScopes: ALL_SCOPES,
        });
      }

      // Normalize scopes
      const normalizedScopes = normalizeScopes(scopes);

      if (normalizedScopes.length === 0) {
        return res.status(400).json({
          error: "Invalid scopes",
          message: "At least one valid scope is required",
        });
      }

      // Find the key
      const [key] = await db
        .select()
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId)))
        .limit(1);

      if (!key) {
        return res.status(404).json({ error: "API key not found" });
      }

      if (key.revokedAt) {
        return res.status(400).json({ error: "Cannot update a revoked API key" });
      }

      // Prevent updating the current key to remove admin scope
      if (key.id === req.apiKeyId && !normalizedScopes.includes(SCOPES.ADMIN)) {
        return res.status(400).json({
          error: "Cannot remove admin scope from current key",
          message:
            "You cannot remove admin scope from the API key you are currently using",
        });
      }

      // Update the scopes
      await db
        .update(schema.apiKeys)
        .set({ scopes: normalizedScopes })
        .where(eq(schema.apiKeys.id, keyId));

      // Log audit event
      await logAction(
        userId,
        "key.updated",
        "api_key",
        keyId,
        {
          apiKeyPrefix: key.keyPrefix,
          changes: { scopes: { old: key.scopes, new: normalizedScopes } },
        },
        req
      );

      res.json({
        id: keyId,
        scopes: normalizedScopes,
        message: "API key scopes updated successfully",
      });
    } catch (error) {
      logger.error("Update scopes error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to update API key scopes" });
    }
  }
);

/**
 * PATCH /v1/keys/:id - Update API key metadata (name, expiration, IPs)
 * Requires: admin scope
 */
router.patch(
  "/:id",
  apiKeyAuth,
  requireScope(SCOPES.ADMIN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const keyId = req.params.id;
      const { name, expiresAt, allowedIps } = req.body;

      // Find the key
      const [key] = await db
        .select()
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.userId, userId)))
        .limit(1);

      if (!key) {
        return res.status(404).json({ error: "API key not found" });
      }

      if (key.revokedAt) {
        return res.status(400).json({ error: "Cannot update a revoked API key" });
      }

      // Build update object
      const updates: Record<string, unknown> = {};

      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({
            error: "Invalid name",
            message: "name must be a non-empty string",
          });
        }
        updates.name = name.trim();
      }

      if (expiresAt !== undefined) {
        if (expiresAt === null) {
          updates.expiresAt = null;
        } else {
          const expiresAtDate = new Date(expiresAt);
          if (isNaN(expiresAtDate.getTime())) {
            return res.status(400).json({
              error: "Invalid expiration date",
              message: "expiresAt must be a valid ISO 8601 date string or null",
            });
          }
          if (expiresAtDate < new Date()) {
            return res.status(400).json({
              error: "Invalid expiration date",
              message: "expiresAt must be in the future",
            });
          }
          updates.expiresAt = expiresAtDate;
        }
      }

      if (allowedIps !== undefined) {
        if (allowedIps === null) {
          updates.allowedIps = null;
        } else if (Array.isArray(allowedIps)) {
          if (allowedIps.length === 0) {
            updates.allowedIps = null;
          } else {
            // Basic IP validation
            const ipRegex =
              /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^localhost$/;
            const invalidIps = allowedIps.filter((ip: string) => !ipRegex.test(ip));
            if (invalidIps.length > 0) {
              return res.status(400).json({
                error: "Invalid IP addresses",
                message: `Invalid IP address format: ${invalidIps.join(", ")}`,
              });
            }
            updates.allowedIps = allowedIps;
          }
        } else {
          return res.status(400).json({
            error: "Invalid allowedIps",
            message: "allowedIps must be an array of IP addresses or null",
          });
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          error: "No updates provided",
          message: "Provide at least one field to update: name, expiresAt, allowedIps",
        });
      }

      // Update the key
      await db
        .update(schema.apiKeys)
        .set(updates)
        .where(eq(schema.apiKeys.id, keyId));

      // Log audit event
      await logAction(
        userId,
        "key.updated",
        "api_key",
        keyId,
        {
          apiKeyPrefix: key.keyPrefix,
          changes: Object.keys(updates),
        },
        req
      );

      // Fetch updated key
      const [updatedKey] = await db
        .select({
          id: schema.apiKeys.id,
          name: schema.apiKeys.name,
          keyPrefix: schema.apiKeys.keyPrefix,
          scopes: schema.apiKeys.scopes,
          expiresAt: schema.apiKeys.expiresAt,
          allowedIps: schema.apiKeys.allowedIps,
          lastUsedAt: schema.apiKeys.lastUsedAt,
          createdAt: schema.apiKeys.createdAt,
        })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.id, keyId))
        .limit(1);

      res.json({
        ...updatedKey,
        message: "API key updated successfully",
      });
    } catch (error) {
      logger.error("Update key error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to update API key" });
    }
  }
);

/**
 * GET /v1/keys/scopes/available - List available scopes
 * Requires: read scope
 */
router.get(
  "/scopes/available",
  apiKeyAuth,
  requireScope(SCOPES.READ),
  async (req: AuthenticatedRequest, res) => {
    res.json({
      scopes: ALL_SCOPES,
      descriptions: {
        [SCOPES.READ]:
          "Read access - view resources, list items, get details",
        [SCOPES.WRITE]:
          "Write access - create, update, and delete resources",
        [SCOPES.ADMIN]:
          "Admin access - manage API keys, update scopes, full access to all operations",
      },
      default: DEFAULT_SCOPES,
    });
  }
);

export default router;
