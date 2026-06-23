import { Router, Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import {
  createPipelineJob,
  getPipelineJob,
  listPipelineJobs,
  getPipelineDownload,
  schedulePipeline,
  cancelSchedule,
} from "../services/data-pipeline.js";
import { checkConsent } from "../services/consent.js";
import { logAction } from "../services/auditLog.js";

const router = Router();
router.use(apiKeyAuth);

// POST /v1/pipeline - Create a pipeline job
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const {
      include_chats = true,
      include_code_changes = true,
      include_terminal = true,
      include_checkpoints = true,
      project_ids,
      since,
      until,
      min_turns = 2,
      format = "generic",
      redact_secrets = true,
      schedule,
      webhook_url,
      destination,
      s3_bucket,
      s3_prefix,
    } = req.body;

    // Consent gate: pipeline produces training data, require training_export consent
    const projectIds: string[] = project_ids || [];
    let projectsToCheck: string[];
    if (projectIds.length > 0) {
      projectsToCheck = projectIds;
    } else {
      // No specific projects: check all user's projects
      const userProjects = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.userId, userId));
      projectsToCheck = userProjects.map((p: any) => p.id);
    }

    for (const projId of projectsToCheck) {
      const consent = await checkConsent(userId, projId, "training_export");
      await logAction(
        userId,
        "consent.checked",
        "consent",
        projId,
        { consentType: "training_export", decision: consent, source: "pipeline.create" },
        req
      );
      if (!consent.allowed) {
        await logAction(
          userId,
          "export.denied",
          "export_job",
          projId,
          { consentType: "training_export", reason: consent.reason, source: "pipeline.create" },
          req
        );
        return res.status(403).json({
          error: {
            type: "consent_error",
            code: "CONSENT_REQUIRED",
            message: `Pipeline export blocked by consent policy for project ${projId}`,
            consentType: "training_export",
            projectId: projId,
            reason: consent.reason,
          },
        });
      }
    }

    const config = {
      includeChats: include_chats,
      includeCodeChanges: include_code_changes,
      includeTerminalCommands: include_terminal,
      includeCheckpoints: include_checkpoints,
      projectIds: project_ids,
      since,
      until,
      minConversationTurns: min_turns,
      format,
      redactSecrets: redact_secrets,
      schedule: schedule || null,
      webhookUrl: webhook_url,
      ...(destination ? { destination } : {}),
      ...(s3_bucket ? { s3Bucket: s3_bucket } : {}),
      ...(s3_prefix ? { s3Prefix: s3_prefix } : {}),
    };

    const job = await createPipelineJob(userId, config);

    if (schedule) {
      schedulePipeline(req.user!.userId, config);
    }

    res.status(201).json({
      id: job.id,
      status: job.status,
      config: {
        format,
        redact_secrets,
        schedule: schedule || null,
      },
      created_at: job.createdAt.toISOString(),
    });
  })
);

// GET /v1/pipeline - List pipeline jobs
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const jobs = await listPipelineJobs(req.user!.userId);
    res.json({
      data: jobs.map(j => ({
        id: j.id,
        status: j.status,
        progress: j.progress,
        stats: j.stats,
        result: j.result,
        error: j.error,
        created_at: j.createdAt.toISOString(),
        updated_at: j.updatedAt.toISOString(),
      })),
    });
  })
);

// GET /v1/pipeline/:id - Get pipeline job details
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const job = await getPipelineJob(req.params.id);
    if (!job || job.userId !== req.user!.userId) {
      throw Errors.notFound("Pipeline job", req.params.id);
    }
    res.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      config: job.config,
      stats: job.stats,
      result: job.result,
      error: job.error,
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
    });
  })
);

// GET /v1/pipeline/:id/download - Download completed pipeline output
router.get(
  "/:id/download",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const job = await getPipelineJob(req.params.id);
    if (!job || job.userId !== req.user!.userId) {
      throw Errors.notFound("Pipeline job", req.params.id);
    }
    if (job.status !== "completed") {
      throw Errors.invalidParameter("id", "Pipeline job not completed yet");
    }

    const download = await getPipelineDownload(req.params.id);
    if (!download) {
      throw Errors.internal("Download data not available");
    }

    if (download.data) {
      const ext = job.config.format === "raw" ? "jsonl" : "jsonl";
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", `attachment; filename="aitm-pipeline-${job.id}.${ext}"`);
      return res.send(download.data);
    }

    if (download.s3Url) {
      return res.json({
        download: "s3",
        s3_url: download.s3Url,
        s3_bucket: download.s3Bucket,
        s3_key: download.s3Key,
      });
    }

    throw Errors.internal("Download data not available");
  })
);

// DELETE /v1/pipeline/schedule - Cancel scheduled pipeline
router.delete(
  "/schedule",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const cancelled = cancelSchedule(req.user!.userId);
    res.json({ cancelled, message: cancelled ? "Schedule cancelled" : "No active schedule found" });
  })
);

export default router;
