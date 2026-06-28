import { Router } from "express";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { eq, and, desc, asc, gte, lte, like, inArray } from "drizzle-orm";
import { triggerWebhooksForUser } from "../services/webhookDelivery.js";
import { logCheckpointRestored } from "../services/auditLog.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// All restore routes require authentication
router.use(apiKeyAuth);

// ============================================
// GET PROJECTS
// ============================================

router.get("/projects", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;

    const projects = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt));

    res.json({ projects });
  } catch (error) {
    logger.error("Get projects error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get projects" });
  }
});

router.get("/projects/:projectId", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { projectId } = req.params;

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId))
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ project });
  } catch (error) {
    logger.error("Get project error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get project" });
  }
});

// ============================================
// GET CHECKPOINTS
// ============================================

router.get(
  "/projects/:projectId/checkpoints",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId } = req.params;
      const { limit = "50", offset = "0", search } = req.query;

      // Verify project ownership
      const [project] = await db
        .select()
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, projectId),
            eq(schema.projects.userId, userId)
          )
        )
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      let query = db
        .select()
        .from(schema.checkpoints)
        .where(eq(schema.checkpoints.projectId, projectId))
        .orderBy(desc(schema.checkpoints.createdAt))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

      const checkpoints = await query;

      res.json({ checkpoints, project });
    } catch (error) {
      logger.error("Get checkpoints error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get checkpoints" });
    }
  }
);

router.get(
  "/projects/:projectId/checkpoints/:checkpointId",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId, checkpointId } = req.params;

      const [checkpoint] = await db
        .select()
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.id, checkpointId),
            eq(schema.checkpoints.projectId, projectId),
            eq(schema.checkpoints.userId, userId)
          )
        )
        .limit(1);

      if (!checkpoint) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      res.json({ checkpoint });
    } catch (error) {
      logger.error("Get checkpoint error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get checkpoint" });
    }
  }
);

// Get checkpoint with full manifest (for restore)
router.get(
  "/projects/:projectId/checkpoints/:checkpointId/manifest",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId, checkpointId } = req.params;

      const [checkpoint] = await db
        .select()
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.id, checkpointId),
            eq(schema.checkpoints.projectId, projectId),
            eq(schema.checkpoints.userId, userId)
          )
        )
        .limit(1);

      if (!checkpoint) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      // Get manifest blob
      const [manifestBlob] = await db
        .select()
        .from(schema.blobs)
        .where(eq(schema.blobs.hash, checkpoint.manifestHash))
        .limit(1);

      if (!manifestBlob) {
        return res.status(404).json({ error: "Manifest not found" });
      }

      res.json({
        checkpoint,
        manifest: manifestBlob.content, // Base64 encoded
      });
    } catch (error) {
      logger.error("Get manifest error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get manifest" });
    }
  }
);

// ============================================
// GET BLOBS
// ============================================

router.get("/blobs/:hash", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { hash } = req.params;

    const [blob] = await db
      .select()
      .from(schema.blobs)
      .where(and(eq(schema.blobs.hash, hash), eq(schema.blobs.userId, userId)))
      .limit(1);

    if (!blob) {
      return res.status(404).json({ error: "Blob not found" });
    }

    res.json({ blob });
  } catch (error) {
    logger.error("Get blob error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get blob" });
  }
});

// Batch get blobs
router.post("/blobs/batch", async (req: AuthenticatedRequest, res) => {
  try {
    const { hashes } = req.body;

    if (!Array.isArray(hashes) || hashes.length === 0) {
      return res.status(400).json({ error: "hashes array required" });
    }

    const userId = req.user!.userId;

    // Batch fetch all blobs in a single query (scoped to user)
    const blobs = await db
      .select()
      .from(schema.blobs)
      .where(and(inArray(schema.blobs.hash, hashes), eq(schema.blobs.userId, userId)));

    res.json({ blobs });
  } catch (error) {
    logger.error("Batch get blobs error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get blobs" });
  }
});

// ============================================
// GET CHAT SESSIONS & MESSAGES
// ============================================

router.get(
  "/projects/:projectId/sessions",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId } = req.params;
      const { limit = "50" } = req.query;

      const sessions = await db
        .select()
        .from(schema.chatSessions)
        .where(
          and(
            eq(schema.chatSessions.projectId, projectId),
            eq(schema.chatSessions.userId, userId)
          )
        )
        .orderBy(desc(schema.chatSessions.startedAt))
        .limit(parseInt(limit as string));

      res.json({ sessions });
    } catch (error) {
      logger.error("Get sessions error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get sessions" });
    }
  }
);

router.get(
  "/projects/:projectId/sessions/:sessionId/messages",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId, sessionId } = req.params;
      const { limit = "100" } = req.query;

      const messages = await db
        .select()
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.sessionId, sessionId),
            eq(schema.chatMessages.projectId, projectId),
            eq(schema.chatMessages.userId, userId)
          )
        )
        .orderBy(asc(schema.chatMessages.timestamp))
        .limit(parseInt(limit as string));

      res.json({ messages });
    } catch (error) {
      logger.error("Get messages error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get messages" });
    }
  }
);

// Get all messages for a project (recent)
router.get(
  "/projects/:projectId/messages",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId } = req.params;
      const { limit = "50", before, after } = req.query;

      let whereClause = and(
        eq(schema.chatMessages.projectId, projectId),
        eq(schema.chatMessages.userId, userId)
      );

      const messages = await db
        .select()
        .from(schema.chatMessages)
        .where(whereClause)
        .orderBy(desc(schema.chatMessages.timestamp))
        .limit(parseInt(limit as string));

      res.json({ messages: messages.reverse() }); // Return in chronological order
    } catch (error) {
      logger.error("Get project messages error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get messages" });
    }
  }
);

// ============================================
// GET TOOL CALLS
// ============================================

router.get(
  "/projects/:projectId/tool-calls",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId } = req.params;
      const { limit = "50", sessionId } = req.query;

      let whereClause = and(
        eq(schema.toolCalls.projectId, projectId),
        eq(schema.toolCalls.userId, userId)
      );

      if (sessionId) {
        whereClause = and(
          whereClause,
          eq(schema.toolCalls.sessionId, sessionId as string)
        );
      }

      const toolCalls = await db
        .select()
        .from(schema.toolCalls)
        .where(whereClause)
        .orderBy(desc(schema.toolCalls.timestamp))
        .limit(parseInt(limit as string));

      res.json({ toolCalls });
    } catch (error) {
      logger.error("Get tool calls error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get tool calls" });
    }
  }
);

// ============================================
// GET TERMINAL EVENTS
// ============================================

router.get(
  "/projects/:projectId/terminal-events",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId } = req.params;
      const { limit = "50" } = req.query;

      const events = await db
        .select()
        .from(schema.terminalEvents)
        .where(
          and(
            eq(schema.terminalEvents.projectId, projectId),
            eq(schema.terminalEvents.userId, userId)
          )
        )
        .orderBy(desc(schema.terminalEvents.timestamp))
        .limit(parseInt(limit as string));

      res.json({ events });
    } catch (error) {
      logger.error("Get terminal events error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get terminal events" });
    }
  }
);

// ============================================
// FULL CONTEXT RESTORE
// ============================================

// Get everything needed to restore to a checkpoint
router.get(
  "/projects/:projectId/checkpoints/:checkpointId/full",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId, checkpointId } = req.params;
      const { includeMessages = "true", messageLimit = "20" } = req.query;

      // Get checkpoint
      const [checkpoint] = await db
        .select()
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.id, checkpointId),
            eq(schema.checkpoints.projectId, projectId),
            eq(schema.checkpoints.userId, userId)
          )
        )
        .limit(1);

      if (!checkpoint) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      // Get manifest blob
      const [manifestBlob] = await db
        .select()
        .from(schema.blobs)
        .where(eq(schema.blobs.hash, checkpoint.manifestHash))
        .limit(1);

      // Get recent messages before checkpoint
      let messages: any[] = [];
      if (includeMessages === "true") {
        messages = await db
          .select()
          .from(schema.chatMessages)
          .where(
            and(
              eq(schema.chatMessages.projectId, projectId),
              eq(schema.chatMessages.userId, userId),
              lte(
                schema.chatMessages.timestamp,
                checkpoint.createdAt || new Date()
              )
            )
          )
          .orderBy(desc(schema.chatMessages.timestamp))
          .limit(parseInt(messageLimit as string));

        messages = messages.reverse(); // Chronological order
      }

      // Get recent terminal events
      const terminalEvents = await db
        .select()
        .from(schema.terminalEvents)
        .where(
          and(
            eq(schema.terminalEvents.projectId, projectId),
            eq(schema.terminalEvents.userId, userId),
            lte(
              schema.terminalEvents.timestamp,
              checkpoint.createdAt || new Date()
            )
          )
        )
        .orderBy(desc(schema.terminalEvents.timestamp))
        .limit(10);

      // Log audit event
      await logCheckpointRestored(
        userId,
        checkpoint.id,
        checkpoint.projectId,
        req
      );

      // Trigger checkpoint.restored webhook (fire and forget)
      triggerWebhooksForUser(userId, "checkpoint.restored", {
        checkpointId: checkpoint.id,
        projectId: checkpoint.projectId,
        checkpointName: checkpoint.name,
        checkpointDescription: checkpoint.description,
        checkpointCreatedAt: checkpoint.createdAt,
        restoredAt: new Date().toISOString(),
      }).catch((err) => logger.error("Webhook trigger error", err instanceof Error ? err : undefined, { details: String(err) }));

      res.json({
        checkpoint,
        manifest: manifestBlob?.content || null,
        messages,
        terminalEvents: terminalEvents.reverse(),
      });
    } catch (error) {
      logger.error("Full restore error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get full restore data" });
    }
  }
);

// Find last "green" checkpoint
router.get(
  "/projects/:projectId/checkpoints/last-green",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId } = req.params;

      // Primary path: query the structured testsPassed flag. This is the
      // authoritative signal for "green" — a checkpoint created with passing
      // tests regardless of its name. Most recent passing checkpoint wins.
      const [structuredGreen] = await db
        .select()
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.projectId, projectId),
            eq(schema.checkpoints.userId, userId),
            eq(schema.checkpoints.testsPassed, true)
          )
        )
        .orderBy(desc(schema.checkpoints.createdAt))
        .limit(1);

      if (structuredGreen) {
        return res.json({ checkpoint: structuredGreen, matchedBy: "tests_passed" });
      }

      // Fallback for legacy checkpoints that predate the testsPassed field:
      // fuzzy-match green/passed/success in the name. New checkpoints should
      // set testsPassed so this branch is only hit for historical data.
      const checkpoints = await db
        .select()
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.projectId, projectId),
            eq(schema.checkpoints.userId, userId)
          )
        )
        .orderBy(desc(schema.checkpoints.createdAt))
        .limit(100);

      const greenCheckpoint = checkpoints.find((cp) => {
        // Never fall back onto a checkpoint explicitly marked as failed.
        if (cp.testsPassed === false) return false;
        const name = cp.name.toLowerCase();
        return (
          name.includes("green") ||
          name.includes("passed") ||
          name.includes("success")
        );
      });

      if (!greenCheckpoint) {
        return res.status(404).json({ error: "No green checkpoint found" });
      }

      res.json({ checkpoint: greenCheckpoint, matchedBy: "name" });
    } catch (error) {
      logger.error("Find last green error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to find last green checkpoint" });
    }
  }
);

export default router;
