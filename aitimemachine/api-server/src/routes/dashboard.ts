import { Router } from "express";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { sendSuccess, sendError } from "../utils/response.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// All dashboard routes require authentication
router.use(apiKeyAuth);

// ============================================
// DASHBOARD OVERVIEW
// ============================================

router.get("/overview", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;

    // Get project count
    const [projectCount] = await db
      .select({ count: count() })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId));

    // Get checkpoint count
    const [checkpointCount] = await db
      .select({ count: count() })
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.userId, userId));

    // Get message count
    const [messageCount] = await db
      .select({ count: count() })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.userId, userId));

    // Get recent activity
    const recentCheckpoints = await db
      .select({
        id: schema.checkpoints.id,
        name: schema.checkpoints.name,
        projectId: schema.checkpoints.projectId,
        createdAt: schema.checkpoints.createdAt,
      })
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.userId, userId))
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(5);

    const recentMessages = await db
      .select({
        id: schema.chatMessages.id,
        role: schema.chatMessages.role,
        content: schema.chatMessages.content,
        projectId: schema.chatMessages.projectId,
        timestamp: schema.chatMessages.timestamp,
      })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.userId, userId))
      .orderBy(desc(schema.chatMessages.timestamp))
      .limit(10);

    sendSuccess(res, {
      stats: {
        projects: projectCount?.count || 0,
        checkpoints: checkpointCount?.count || 0,
        messages: messageCount?.count || 0,
      },
      recentCheckpoints,
      recentMessages: recentMessages.map((m: any) => ({
        ...m,
        content: m.content.substring(0, 200) + (m.content.length > 200 ? "..." : ""),
      })),
    });
  } catch (error) {
    logger.error("Dashboard overview error", error instanceof Error ? error : undefined, { details: String(error) });
    sendError(res, 500, "Failed to get dashboard overview");
  }
});

// ============================================
// ACTIVITY TIMELINE
// ============================================

router.get("/activity", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { limit = "50", projectId } = req.query;

    // Get checkpoints as activity
    let checkpointQuery = db
      .select({
        type: sql<string>`'checkpoint'`,
        id: schema.checkpoints.id,
        projectId: schema.checkpoints.projectId,
        name: schema.checkpoints.name,
        description: schema.checkpoints.description,
        timestamp: schema.checkpoints.createdAt,
      })
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.userId, userId))
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(parseInt(limit as string));

    // Get messages as activity
    let messageQuery = db
      .select({
        type: sql<string>`'message'`,
        id: schema.chatMessages.id,
        projectId: schema.chatMessages.projectId,
        role: schema.chatMessages.role,
        content: schema.chatMessages.content,
        timestamp: schema.chatMessages.timestamp,
      })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.userId, userId))
      .orderBy(desc(schema.chatMessages.timestamp))
      .limit(parseInt(limit as string));

    // Get tool calls as activity
    let toolCallQuery = db
      .select({
        type: sql<string>`'tool_call'`,
        id: schema.toolCalls.id,
        projectId: schema.toolCalls.projectId,
        toolName: schema.toolCalls.toolName,
        success: schema.toolCalls.success,
        timestamp: schema.toolCalls.timestamp,
      })
      .from(schema.toolCalls)
      .where(eq(schema.toolCalls.userId, userId))
      .orderBy(desc(schema.toolCalls.timestamp))
      .limit(parseInt(limit as string));

    const [checkpoints, messages, toolCalls] = await Promise.all([
      checkpointQuery,
      messageQuery,
      toolCallQuery,
    ]);

    // Combine and sort by timestamp
    const activity = [
      ...checkpoints.map((c: any) => ({ ...c, activityType: "checkpoint" })),
      ...messages.map((m: any) => ({
        ...m,
        activityType: "message",
        content: m.content.substring(0, 100),
      })),
      ...toolCalls.map((t: any) => ({ ...t, activityType: "tool_call" })),
    ]
      .sort((a, b) => {
        const aTime = new Date(a.timestamp || 0).getTime();
        const bTime = new Date(b.timestamp || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, parseInt(limit as string));

    res.json({ activity });
  } catch (error) {
    logger.error("Activity timeline error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get activity timeline" });
  }
});

// ============================================
// SEARCH
// ============================================

router.get("/search", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { q, type, projectId, limit = "20" } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Query parameter 'q' required" });
    }

    const results: any = { checkpoints: [], messages: [], toolCalls: [] };

    // Search checkpoints
    if (!type || type === "checkpoints") {
      const checkpoints = await db
        .select()
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.userId, userId),
            sql`(${schema.checkpoints.name} ILIKE ${`%${q}%`} OR ${schema.checkpoints.description} ILIKE ${`%${q}%`})`
          )
        )
        .orderBy(desc(schema.checkpoints.createdAt))
        .limit(parseInt(limit as string));
      results.checkpoints = checkpoints;
    }

    // Search messages
    if (!type || type === "messages") {
      const messages = await db
        .select()
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.userId, userId),
            sql`${schema.chatMessages.content} ILIKE ${`%${q}%`}`
          )
        )
        .orderBy(desc(schema.chatMessages.timestamp))
        .limit(parseInt(limit as string));
      results.messages = messages.map((m: any) => ({
        ...m,
        content: m.content.substring(0, 300),
      }));
    }

    // Search tool calls
    if (!type || type === "tool_calls") {
      const toolCalls = await db
        .select()
        .from(schema.toolCalls)
        .where(
          and(
            eq(schema.toolCalls.userId, userId),
            sql`${schema.toolCalls.toolName} ILIKE ${`%${q}%`}`
          )
        )
        .orderBy(desc(schema.toolCalls.timestamp))
        .limit(parseInt(limit as string));
      results.toolCalls = toolCalls;
    }

    res.json(results);
  } catch (error) {
    logger.error("Search error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Search failed" });
  }
});

// ============================================
// PROJECT DETAILS
// ============================================

router.get("/projects/:projectId/stats", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { projectId } = req.params;

    // Verify project ownership
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

    // Get stats
    const [checkpointCount] = await db
      .select({ count: count() })
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.projectId, projectId));

    const [messageCount] = await db
      .select({ count: count() })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.projectId, projectId));

    const [sessionCount] = await db
      .select({ count: count() })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.projectId, projectId));

    const [toolCallCount] = await db
      .select({ count: count() })
      .from(schema.toolCalls)
      .where(eq(schema.toolCalls.projectId, projectId));

    // Get first and last checkpoint dates
    const [firstCheckpoint] = await db
      .select({ createdAt: schema.checkpoints.createdAt })
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.projectId, projectId))
      .orderBy(schema.checkpoints.createdAt)
      .limit(1);

    const [lastCheckpoint] = await db
      .select({ createdAt: schema.checkpoints.createdAt })
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.projectId, projectId))
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(1);

    res.json({
      project,
      stats: {
        checkpoints: checkpointCount?.count || 0,
        messages: messageCount?.count || 0,
        sessions: sessionCount?.count || 0,
        toolCalls: toolCallCount?.count || 0,
        firstCheckpoint: firstCheckpoint?.createdAt || null,
        lastCheckpoint: lastCheckpoint?.createdAt || null,
      },
    });
  } catch (error) {
    logger.error("Project stats error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get project stats" });
  }
});

// ============================================
// CONVERSATION REPLAY
// ============================================

router.get(
  "/projects/:projectId/conversation",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId } = req.params;
      const { sessionId, before, after, limit = "100" } = req.query;

      // Build query conditions
      let conditions = and(
        eq(schema.chatMessages.projectId, projectId),
        eq(schema.chatMessages.userId, userId)
      );

      if (sessionId) {
        conditions = and(
          conditions,
          eq(schema.chatMessages.sessionId, sessionId as string)
        );
      }

      const messages = await db
        .select({
          id: schema.chatMessages.id,
          sessionId: schema.chatMessages.sessionId,
          role: schema.chatMessages.role,
          content: schema.chatMessages.content,
          timestamp: schema.chatMessages.timestamp,
          checkpointId: schema.chatMessages.checkpointId,
          isContextInjection: schema.chatMessages.isContextInjection,
        })
        .from(schema.chatMessages)
        .where(conditions)
        .orderBy(schema.chatMessages.timestamp)
        .limit(parseInt(limit as string));

      // Get tool calls that happened during this conversation
      const toolCalls = await db
        .select({
          id: schema.toolCalls.id,
          toolName: schema.toolCalls.toolName,
          arguments: schema.toolCalls.arguments,
          result: schema.toolCalls.result,
          success: schema.toolCalls.success,
          error: schema.toolCalls.error,
          timestamp: schema.toolCalls.timestamp,
        })
        .from(schema.toolCalls)
        .where(
          and(
            eq(schema.toolCalls.projectId, projectId),
            eq(schema.toolCalls.userId, userId)
          )
        )
        .orderBy(schema.toolCalls.timestamp)
        .limit(parseInt(limit as string));

      res.json({ messages, toolCalls });
    } catch (error) {
      logger.error("Conversation replay error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get conversation" });
    }
  }
);

// ============================================
// CHECKPOINT DIFF
// ============================================

router.get(
  "/projects/:projectId/checkpoints/:checkpointId/diff",
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      const { projectId, checkpointId } = req.params;
      const { compareWith } = req.query;

      // Get the checkpoint
      const [checkpoint] = await db
        .select()
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.id, checkpointId),
            eq(schema.checkpoints.userId, userId)
          )
        )
        .limit(1);

      if (!checkpoint) {
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      // Get manifest
      const [manifestBlob] = await db
        .select()
        .from(schema.blobs)
        .where(eq(schema.blobs.hash, checkpoint.manifestHash))
        .limit(1);

      if (!manifestBlob) {
        return res.status(404).json({ error: "Manifest not found" });
      }

      let manifest;
      try {
        manifest = JSON.parse(
          Buffer.from(manifestBlob.content || "", "base64").toString("utf8")
        );
      } catch {
        return res.status(500).json({ error: "Failed to parse manifest" });
      }

      // If comparing with another checkpoint
      let compareManifest = null;
      if (compareWith) {
        const [compareCheckpoint] = await db
          .select()
          .from(schema.checkpoints)
          .where(
            and(
              eq(schema.checkpoints.id, compareWith as string),
              eq(schema.checkpoints.userId, userId)
            )
          )
          .limit(1);

        if (compareCheckpoint) {
          const [compareBlob] = await db
            .select()
            .from(schema.blobs)
            .where(eq(schema.blobs.hash, compareCheckpoint.manifestHash))
            .limit(1);

          if (compareBlob) {
            try {
              compareManifest = JSON.parse(
                Buffer.from(compareBlob.content || "", "base64").toString("utf8")
              );
            } catch {}
          }
        }
      }

      // Calculate diff
      const currentFiles = new Map<string, any>(
        manifest.files?.map((f: any) => [f.path, f] as [string, any]) || []
      );
      const compareFiles = new Map<string, any>(
        compareManifest?.files?.map((f: any) => [f.path, f] as [string, any]) || []
      );

      const added: string[] = [];
      const removed: string[] = [];
      const modified: string[] = [];

      for (const [filePath, file] of currentFiles) {
        if (!compareFiles.has(filePath)) {
          added.push(filePath);
        } else if (compareFiles.get(filePath)?.hash !== (file as any).hash) {
          modified.push(filePath);
        }
      }

      for (const filePath of compareFiles.keys()) {
        if (!currentFiles.has(filePath)) {
          removed.push(filePath);
        }
      }

      res.json({
        checkpoint,
        manifest: {
          fileCount: manifest.files?.length || 0,
          capturedAt: manifest.capturedAt,
        },
        diff: compareManifest
          ? { added, removed, modified }
          : null,
      });
    } catch (error) {
      logger.error("Checkpoint diff error", error instanceof Error ? error : undefined, { details: String(error) });
      res.status(500).json({ error: "Failed to get checkpoint diff" });
    }
  }
);

export default router;
