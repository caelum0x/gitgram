import { Router } from "express";
import { and, desc, eq, lte, or } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logger } from "../lib/monitoring.js";

const router = Router();
router.use(apiKeyAuth);

router.get("/:checkpointId", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { checkpointId } = req.params;
    const messageLimit = Math.min(Math.max(Number(req.query.messageLimit || 100), 1), 500);
    const toolCallLimit = Math.min(Math.max(Number(req.query.toolCallLimit || 100), 1), 500);
    const contextLimit = Math.min(Math.max(Number(req.query.contextLimit || 20), 1), 100);

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

    const [messages, toolCalls, contexts] = await Promise.all([
      db
        .select({
          id: schema.chatMessages.id,
          sessionId: schema.chatMessages.sessionId,
          role: schema.chatMessages.role,
          content: schema.chatMessages.content,
          timestamp: schema.chatMessages.timestamp,
          metadata: schema.chatMessages.metadata,
        })
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.projectId, checkpoint.projectId),
            eq(schema.chatMessages.userId, userId),
            lte(schema.chatMessages.timestamp, checkpoint.createdAt || new Date())
          )
        )
        .orderBy(desc(schema.chatMessages.timestamp))
        .limit(messageLimit),
      db
        .select({
          id: schema.toolCalls.id,
          sessionId: schema.toolCalls.sessionId,
          toolName: schema.toolCalls.toolName,
          arguments: schema.toolCalls.arguments,
          result: schema.toolCalls.result,
          success: schema.toolCalls.success,
          error: schema.toolCalls.error,
          checkpointBeforeId: schema.toolCalls.checkpointBeforeId,
          checkpointAfterId: schema.toolCalls.checkpointAfterId,
          timestamp: schema.toolCalls.timestamp,
        })
        .from(schema.toolCalls)
        .where(
          and(
            eq(schema.toolCalls.projectId, checkpoint.projectId),
            eq(schema.toolCalls.userId, userId),
            or(
              eq(schema.toolCalls.checkpointBeforeId, checkpoint.id),
              eq(schema.toolCalls.checkpointAfterId, checkpoint.id)
            )
          )
        )
        .orderBy(desc(schema.toolCalls.timestamp))
        .limit(toolCallLimit),
      db
        .select({
          id: schema.savedContexts.id,
          name: schema.savedContexts.name,
          description: schema.savedContexts.description,
          tool: schema.savedContexts.tool,
          messages: schema.savedContexts.messages,
          createdAt: schema.savedContexts.createdAt,
          updatedAt: schema.savedContexts.updatedAt,
        })
        .from(schema.savedContexts)
        .where(
          and(
            eq(schema.savedContexts.userId, userId),
            eq(schema.savedContexts.projectId, checkpoint.projectId),
            eq(schema.savedContexts.checkpointId, checkpoint.id)
          )
        )
        .orderBy(desc(schema.savedContexts.createdAt))
        .limit(contextLimit),
    ]);

    return res.json({
      success: true,
      checkpoint: {
        id: checkpoint.id,
        projectId: checkpoint.projectId,
        name: checkpoint.name,
        description: checkpoint.description,
        triggerType: checkpoint.triggerType,
        createdAt: checkpoint.createdAt,
      },
      messages: messages.reverse(),
      toolCalls: toolCalls.reverse(),
      contexts,
    });
  } catch (error) {
    logger.error("checkpoint context error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid context request" });
  }
});

export default router;
