/**
 * S3 session backup/restore endpoints.
 *
 * Exposes the backupService over the API so sessions can be archived to and
 * restored from S3-compatible storage (AWS S3, Cloudflare R2, MinIO).
 *
 * All routes require API key authentication. Backups are scoped to the
 * authenticated user — a user can only back up / restore / delete their own
 * sessions.
 */

import { Router } from "express";
import { z } from "zod";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logger } from "../lib/monitoring.js";
import {
  isConfigured,
  backupUserSession,
  restoreSession,
  listBackups,
  deleteBackup,
  getStorageStats,
} from "../services/backupService.js";

const router = Router();

router.use(apiKeyAuth);

/**
 * GET /v1/backup/status — report whether S3 backup is configured.
 */
router.get("/status", (_req: AuthenticatedRequest, res) => {
  res.json({ configured: isConfigured() });
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  before: z.string().datetime().optional(),
});

/**
 * GET /v1/backup — list backups (optionally limited / filtered by date).
 */
router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: "S3 backup is not configured" });
    }
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    }
    const backups = await listBackups(parsed.data);
    res.json({ backups });
  } catch (error) {
    logger.error("List backups error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to list backups" });
  }
});

/**
 * GET /v1/backup/stats — aggregate storage statistics.
 */
router.get("/stats", async (_req: AuthenticatedRequest, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: "S3 backup is not configured" });
    }
    const stats = await getStorageStats();
    res.json(stats);
  } catch (error) {
    logger.error("Backup stats error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to fetch backup stats" });
  }
});

const sessionIdSchema = z.object({ sessionId: z.string().min(1).max(256) });

/**
 * POST /v1/backup/sessions/:sessionId — back up a single session to S3.
 */
router.post("/sessions/:sessionId", async (req: AuthenticatedRequest, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: "S3 backup is not configured" });
    }
    const parsed = sessionIdSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid session id" });
    }
    const userId = req.user!.userId;
    const result = await backupUserSession(userId, parsed.data.sessionId);
    res.json({ success: true, backup: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found")) {
      return res.status(404).json({ error: message });
    }
    logger.error("Backup session error", error instanceof Error ? error : undefined, { details: message });
    res.status(500).json({ error: "Failed to back up session" });
  }
});

/**
 * GET /v1/backup/sessions/:sessionId — restore a session payload from S3.
 *
 * Only returns the backup when it belongs to the authenticated user.
 */
router.get("/sessions/:sessionId", async (req: AuthenticatedRequest, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: "S3 backup is not configured" });
    }
    const parsed = sessionIdSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid session id" });
    }
    const userId = req.user!.userId;
    const backup = await restoreSession(parsed.data.sessionId);
    if (!backup) {
      return res.status(404).json({ error: "Backup not found" });
    }
    // Enforce ownership — never return another user's backup
    if (backup.userId !== userId) {
      return res.status(404).json({ error: "Backup not found" });
    }
    res.json({ backup });
  } catch (error) {
    logger.error("Restore session error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to restore session" });
  }
});

/**
 * DELETE /v1/backup/sessions/:sessionId — delete a session backup from S3.
 *
 * Verifies ownership before deleting.
 */
router.delete("/sessions/:sessionId", async (req: AuthenticatedRequest, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: "S3 backup is not configured" });
    }
    const parsed = sessionIdSchema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid session id" });
    }
    const userId = req.user!.userId;

    // Verify the backup belongs to this user before deleting
    const backup = await restoreSession(parsed.data.sessionId);
    if (!backup || backup.userId !== userId) {
      return res.status(404).json({ error: "Backup not found" });
    }

    const deleted = await deleteBackup(parsed.data.sessionId);
    res.json({ success: deleted });
  } catch (error) {
    logger.error("Delete backup error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to delete backup" });
  }
});

export default router;
