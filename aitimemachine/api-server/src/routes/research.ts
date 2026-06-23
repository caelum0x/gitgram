import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import crypto from "crypto";

const router = Router();

// All routes require authentication
router.use(apiKeyAuth);

/**
 * POST /v1/research/jobs
 * Create a new research job
 */
router.post(
  "/jobs",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, project_id, priority = 0, metadata } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    const jobId = `rj_${crypto.randomBytes(8).toString("hex")}`;

    const [job] = await db
      .insert(schema.researchJobs)
      .values({
        id: jobId,
        userId: req.user!.userId,
        projectId: project_id,
        query,
        status: "pending",
        priority,
        progress: 0,
        metadata,
      })
      .returning();

    res.status(201).json({
      id: job.id,
      query: job.query,
      status: job.status,
      created_at: job.createdAt,
      message: "Research job created. Poll GET /v1/research/jobs/:id for status.",
    });
  })
);

/**
 * GET /v1/research/jobs
 * List research jobs for the user
 */
router.get(
  "/jobs",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { project_id, status, limit = 20 } = req.query;

    const conditions = [eq(schema.researchJobs.userId, req.user!.userId)];

    if (project_id) {
      conditions.push(eq(schema.researchJobs.projectId, project_id as string));
    }

    if (status) {
      conditions.push(eq(schema.researchJobs.status, status as string));
    }

    const jobs = await db
      .select({
        id: schema.researchJobs.id,
        query: schema.researchJobs.query,
        status: schema.researchJobs.status,
        progress: schema.researchJobs.progress,
        projectId: schema.researchJobs.projectId,
        createdAt: schema.researchJobs.createdAt,
        startedAt: schema.researchJobs.startedAt,
        completedAt: schema.researchJobs.completedAt,
      })
      .from(schema.researchJobs)
      .where(and(...conditions))
      .orderBy(desc(schema.researchJobs.createdAt))
      .limit(Number(limit));

    res.json({
      jobs: jobs.map((j: any) => ({
        id: j.id,
        query: j.query,
        status: j.status,
        progress: j.progress,
        project_id: j.projectId,
        created_at: j.createdAt,
        started_at: j.startedAt,
        completed_at: j.completedAt,
      })),
      total: jobs.length,
    });
  })
);

/**
 * GET /v1/research/jobs/:id
 * Get a specific research job with results
 */
router.get(
  "/jobs/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [job] = await db
      .select()
      .from(schema.researchJobs)
      .where(
        and(
          eq(schema.researchJobs.id, id),
          eq(schema.researchJobs.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!job) {
      throw Errors.notFound("Research job", id);
    }

    res.json({
      id: job.id,
      query: job.query,
      status: job.status,
      progress: job.progress,
      result: job.result,
      sources: job.sources,
      summary: job.summary,
      error: job.error,
      project_id: job.projectId,
      created_at: job.createdAt,
      started_at: job.startedAt,
      completed_at: job.completedAt,
    });
  })
);

/**
 * DELETE /v1/research/jobs/:id
 * Cancel or delete a research job
 */
router.delete(
  "/jobs/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [job] = await db
      .select()
      .from(schema.researchJobs)
      .where(
        and(
          eq(schema.researchJobs.id, id),
          eq(schema.researchJobs.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!job) {
      throw Errors.notFound("Research job", id);
    }

    await db
      .delete(schema.researchJobs)
      .where(eq(schema.researchJobs.id, id));

    res.json({
      message: "Research job deleted",
      id,
    });
  })
);

/**
 * POST /v1/research/quick
 * Quick synchronous research for simple queries
 * Returns immediately with results (for simple lookups)
 */
router.post(
  "/quick",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, project_id, context } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    // For quick research, search across existing data
    const results: any = {
      query,
      findings: [],
      sources: [],
    };

    // Search checkpoints
    const checkpoints = await db
      .select({
        id: schema.checkpoints.id,
        name: schema.checkpoints.name,
        createdAt: schema.checkpoints.createdAt,
      })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.userId, req.user!.userId),
          project_id
            ? eq(schema.checkpoints.projectId, project_id)
            : undefined,
          sql`${schema.checkpoints.name} ILIKE ${`%${query}%`}`
        )
      )
      .limit(5);

    if (checkpoints.length > 0) {
      results.findings.push({
        type: "checkpoints",
        count: checkpoints.length,
          items: checkpoints.map((cp: any) => ({
          id: cp.id,
          name: cp.name,
          created_at: cp.createdAt,
        })),
      });
      results.sources.push("checkpoint_history");
    }

    // Search messages
    const messages = await db
      .select({
        id: schema.chatMessages.id,
        role: schema.chatMessages.role,
        content: schema.chatMessages.content,
        timestamp: schema.chatMessages.timestamp,
      })
      .from(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.userId, req.user!.userId),
          project_id
            ? eq(schema.chatMessages.projectId, project_id)
            : undefined,
          sql`${schema.chatMessages.content} ILIKE ${`%${query}%`}`
        )
      )
      .limit(10);

    if (messages.length > 0) {
      results.findings.push({
        type: "conversations",
        count: messages.length,
          items: messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          snippet: m.content?.slice(0, 200),
          timestamp: m.timestamp,
        })),
      });
      results.sources.push("conversation_history");
    }

    // Search code embeddings if available
    if (project_id) {
      const embeddings = await db
        .select({
          id: schema.codeEmbeddings.id,
          filePath: schema.codeEmbeddings.filePath,
          symbol: schema.codeEmbeddings.symbol,
          symbolType: schema.codeEmbeddings.symbolType,
          lineStart: schema.codeEmbeddings.lineStart,
        })
        .from(schema.codeEmbeddings)
        .where(
          and(
            eq(schema.codeEmbeddings.userId, req.user!.userId),
            eq(schema.codeEmbeddings.projectId, project_id),
            sql`(${schema.codeEmbeddings.symbol} ILIKE ${`%${query}%`} OR ${schema.codeEmbeddings.content} ILIKE ${`%${query}%`})`
          )
        )
        .limit(10);

      if (embeddings.length > 0) {
        results.findings.push({
          type: "code",
          count: embeddings.length,
          items: embeddings.map((e: any) => ({
            file: e.filePath,
            symbol: e.symbol,
            type: e.symbolType,
            line: e.lineStart,
          })),
        });
        results.sources.push("code_index");
      }
    }

    res.json(results);
  })
);

export default router;
