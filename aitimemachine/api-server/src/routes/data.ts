import crypto from "crypto";
import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logAction } from "../services/auditLog.js";
import { logger } from "../lib/monitoring.js";
import {
  processDeleteRequestJob,
  processPendingDeleteRequestsForUser,
} from "../services/dataDeletion.js";

const router = Router();
router.use(apiKeyAuth);

const deleteRequestSchema = z
  .object({
    scope: z.enum(["project", "user"]),
    projectId: z.string().min(1).optional(),
    reason: z.string().max(1000).optional(),
  })
  .refine(
    (value) =>
      (value.scope === "project" && !!value.projectId) ||
      (value.scope === "user" && !value.projectId),
    {
      message: "projectId is required for project scope and must be omitted for user scope",
      path: ["projectId"],
    }
  );

router.post("/delete-request", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = deleteRequestSchema.parse(req.body || {});

    if (payload.scope === "project") {
      const [project] = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.id, payload.projectId!), eq(schema.projects.userId, userId)))
        .limit(1);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
    }

    const requestId = `delreq_${crypto.randomBytes(10).toString("hex")}`;

    await db.insert(schema.jobs).values({
      id: requestId,
      userId,
      type: "data_delete_request",
      status: "pending",
      params: {
        scope: payload.scope,
        projectId: payload.projectId || null,
        reason: payload.reason || null,
      },
      result: {
        state: "queued",
      },
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await logAction(
      userId,
      "data.delete_requested",
      "user",
      payload.projectId || userId,
      {
        scope: payload.scope,
        projectId: payload.projectId || undefined,
        reason: payload.reason || undefined,
      },
      req
    );

    return res.status(202).json({
      success: true,
      request: {
        id: requestId,
        status: "pending",
        scope: payload.scope,
        projectId: payload.projectId || null,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("data delete-request error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid delete-request payload" });
  }
});

router.get("/delete-request", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);

    const rows = await db
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
        params: schema.jobs.params,
        result: schema.jobs.result,
        progress: schema.jobs.progress,
        createdAt: schema.jobs.createdAt,
        updatedAt: schema.jobs.updatedAt,
        completedAt: schema.jobs.completedAt,
      })
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.userId, userId), eq(schema.jobs.type, "data_delete_request"))
      )
      .orderBy(desc(schema.jobs.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json({
      success: true,
      requests: rows,
      pagination: {
        limit,
        offset,
        hasMore: rows.length === limit,
      },
    });
  } catch (error) {
    logger.error("data delete-request list error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid delete-request list query" });
  }
});

router.get("/delete-request/:requestId", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { requestId } = req.params;

    const [row] = await db
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
        params: schema.jobs.params,
        result: schema.jobs.result,
        progress: schema.jobs.progress,
        error: schema.jobs.error,
        createdAt: schema.jobs.createdAt,
        updatedAt: schema.jobs.updatedAt,
        completedAt: schema.jobs.completedAt,
      })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.id, requestId),
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.type, "data_delete_request")
        )
      )
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: "Delete request not found" });
    }

    return res.json({ success: true, request: row });
  } catch (error) {
    logger.error("data delete-request get error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid delete-request id" });
  }
});

router.post("/delete-request/:requestId/process", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { requestId } = req.params;
    const dryRun = Boolean(req.body?.dryRun);

    const result = await processDeleteRequestJob(requestId, userId, { dryRun });

    await logAction(
      userId,
      "data.delete_processed",
      "user",
      requestId,
      {
        requestId,
        alreadyCompleted: result.alreadyCompleted,
        dryRun,
      },
      req
    );

    return res.json({ success: true, result });
  } catch (error) {
    const requestId = req.params.requestId;
    await logAction(
      req.user!.userId,
      "data.delete_failed",
      "user",
      requestId,
      {
        requestId,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      req
    );
    logger.error("data delete-request process error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Delete request processing failed" });
  }
});

router.post("/delete-request/process-pending", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(Math.max(Number(req.body?.limit || 10), 1), 50);
    const dryRun = Boolean(req.body?.dryRun);

    const results = await processPendingDeleteRequestsForUser(userId, limit, { dryRun });
    const succeeded = results.filter((r) => r.ok).length;
    const failed = results.length - succeeded;

    if (failed > 0) {
      await logAction(
        userId,
        "data.delete_failed",
        "user",
        userId,
        { mode: "batch", failed, succeeded, dryRun },
        req
      );
    } else {
      await logAction(
        userId,
        "data.delete_processed",
        "user",
        userId,
        { mode: "batch", processed: succeeded, dryRun },
        req
      );
    }

    return res.json({
      success: true,
      dryRun,
      processed: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    logger.error("data process pending error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Failed to process pending delete requests" });
  }
});

export default router;
