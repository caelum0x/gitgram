import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, gte, desc, SQL } from "drizzle-orm";
import crypto from "crypto";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { persistKnowledgeArtifact } from "../services/knowledgeBase.js";
import { checkConsent } from "../services/consent.js";
import { logAction } from "../services/auditLog.js";
import {
  exportSessionsAsJSON,
  exportSessionsAsMarkdown,
  exportSessionsAsCSV,
  generateActivityReport,
  exportToGitHistory,
} from "../services/exportService.js";
import { getArtifactByJobId } from "../services/knowledgeBase.js";
import { downloadS3ObjectText } from "../services/s3.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// ============================================================================
// Types
// ============================================================================

interface ExportJobResponse {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  type: "training" | "analytics" | "full";
  format: string;
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
  stats?: Record<string, number>;
  error?: string;
  s3?: {
    url: string;
    bucket: string;
    key: string;
  };
  config?: {
    destination?: "s3";
    s3Bucket?: string;
    s3Prefix?: string;
  };
}

type EventRow = typeof schema.events.$inferSelect;
type JobRow = typeof schema.jobs.$inferSelect;

// In-memory job store (production would use DB/Redis)
const exportJobs = new Map<
  string,
  ExportJobResponse & { ownerId: string; data?: string }
>();

function generateJobId(): string {
  return `exp_${crypto.randomBytes(8).toString("hex")}`;
}

// DB persistence helpers. The jobs table is the source of truth for status;
// these write-throughs surface failures via the logger rather than swallowing
// them silently, so a DB that has diverged from memory is observable.
async function persistJobToDB(job: ExportJobResponse & { ownerId: string }): Promise<void> {
  try {
    await db.insert(schema.jobs).values({
      id: job.id,
      userId: job.ownerId,
      type: "export",
      status: job.status === "processing" ? "running" : job.status,
      params: {
        exportType: job.type,
        format: job.format,
        destination: job.config?.destination,
        s3Bucket: job.config?.s3Bucket,
        s3Prefix: job.config?.s3Prefix,
      },
      progress: 0,
      createdAt: new Date(job.createdAt),
      updatedAt: new Date(),
    });
  } catch (err) {
    logger.error(
      "Failed to persist export job to DB",
      err instanceof Error ? err : undefined,
      { jobId: job.id }
    );
  }
}

async function updateJobInDB(
  jobId: string,
  updates: { status?: string; progress?: number; result?: Record<string, unknown>; error?: string; completedAt?: Date }
): Promise<void> {
  try {
    const dbUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.progress !== undefined) dbUpdates.progress = updates.progress;
    if (updates.result) dbUpdates.result = updates.result;
    if (updates.error) dbUpdates.error = updates.error;
    if (updates.completedAt) dbUpdates.completedAt = updates.completedAt;
    await db.update(schema.jobs).set(dbUpdates).where(eq(schema.jobs.id, jobId));
  } catch (err) {
    logger.error(
      "Failed to update export job in DB",
      err instanceof Error ? err : undefined,
      { jobId }
    );
  }
}

async function getJobFromDB(jobId: string): Promise<(ExportJobResponse & { ownerId: string }) | null> {
  try {
    const [row] = await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.type, "export")))
      .limit(1);
    if (!row) return null;
    const params = row.params as Record<string, unknown> | null;
    const result = row.result as Record<string, unknown> | null;
    return {
      id: row.id,
      ownerId: row.userId,
      status: (row.status === "running" ? "processing" : (row.status || "pending")) as ExportJobResponse["status"],
      type: ((params?.exportType as string) || "training") as ExportJobResponse["type"],
      format: (params?.format as string) || "generic",
      createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
      completedAt: row.completedAt?.toISOString(),
      stats: result?.stats as Record<string, number> | undefined,
      s3: result?.s3 as ExportJobResponse["s3"],
      config: {
        destination: params?.destination as "s3" | undefined,
        s3Bucket: params?.s3Bucket as string | undefined,
        s3Prefix: params?.s3Prefix as string | undefined,
      },
      error: row.error || undefined,
    };
  } catch {
    return null;
  }
}

type S3ClientType = { send(command: unknown): Promise<unknown> };
type PutObjectCommandType = new (params: { Bucket: string; Key: string; Body: string; ContentType: string }) => unknown;

let s3Client: S3ClientType | null = null;
let PutObjectCommandCtor: PutObjectCommandType | null = null;

async function loadS3Client(): Promise<{ client: S3ClientType; PutObjectCommand: PutObjectCommandType }> {
  if (!PutObjectCommandCtor) {
    const mod = await import("@aws-sdk/client-s3");
    PutObjectCommandCtor = mod.PutObjectCommand;
    const S3ClientCtor = mod.S3Client;
    s3Client = new S3ClientCtor({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return { client: s3Client!, PutObjectCommand: PutObjectCommandCtor };
}

async function uploadExportToS3(
  data: string,
  options: { bucket: string; prefix?: string; jobId: string; ext: string }
): Promise<{ bucket: string; key: string; url: string }> {
  const { client, PutObjectCommand } = await loadS3Client();
  const key = `${options.prefix || "exports"}/${options.jobId}.${options.ext}`;
  const contentType =
    options.ext === "csv"
      ? "text/csv"
      : options.ext === "json"
      ? "application/json"
      : "application/x-ndjson";

  await client.send(
    new PutObjectCommand({
      Bucket: options.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    })
  );

  return {
    bucket: options.bucket,
    key,
    url: `s3://${options.bucket}/${key}`,
  };
}

// ============================================================================
// POST /v1/export/training - Export training data (JSONL)
// ============================================================================

router.post("/training", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: { type: "auth_error", message: "Unauthorized" } });

    const {
      format = "generic",
      includeTools = true,
      includeErrors = true,
      redact = true,
      minTurns = 2,
      maxTurns,
      since,
      projectId,
      destination,
      s3_bucket,
      s3_prefix,
    } = req.body;

    if (projectId) {
      // Single project: check consent directly
      const consent = await checkConsent(userId, projectId, "training_export");
      await logAction(
        userId,
        "consent.checked",
        "consent",
        projectId,
        { consentType: "training_export", decision: consent, source: "export.training" },
        req
      );

      if (!consent.allowed) {
        await logAction(
          userId,
          "export.denied",
          "export_job",
          projectId,
          { consentType: "training_export", reason: consent.reason, source: "export.training" },
          req
        );
        return res.status(403).json({
          error: {
            type: "consent_error",
            code: "CONSENT_REQUIRED",
            message: "Training export blocked by consent policy",
            consentType: "training_export",
            reason: consent.reason,
          },
        });
      }
    } else {
      // No projectId: check consent across ALL user's projects.
      // Block if any project denies training_export consent.
      const userProjects = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.userId, userId));

      for (const proj of userProjects) {
        const consent = await checkConsent(userId, proj.id, "training_export");
        await logAction(
          userId,
          "consent.checked",
          "consent",
          proj.id,
          { consentType: "training_export", decision: consent, source: "export.training.all_projects" },
          req
        );

        if (!consent.allowed) {
          await logAction(
            userId,
            "export.denied",
            "export_job",
            proj.id,
            { consentType: "training_export", reason: consent.reason, source: "export.training.all_projects" },
            req
          );
          return res.status(403).json({
            error: {
              type: "consent_error",
              code: "CONSENT_REQUIRED",
              message: `Training export blocked by consent policy for project ${proj.id}`,
              consentType: "training_export",
              projectId: proj.id,
              reason: consent.reason,
            },
          });
        }
      }
    }

    if (!["openai", "anthropic", "generic"].includes(format)) {
      return res.status(400).json({
        error: { type: "invalid_request_error", message: "format must be openai, anthropic, or generic" },
      });
    }

    const jobId = generateJobId();
    const job: ExportJobResponse & { ownerId: string; data?: string } = {
      id: jobId,
      ownerId: userId,
      status: "processing",
      type: "training",
      format,
      config: {
        destination,
        s3Bucket: s3_bucket,
        s3Prefix: s3_prefix,
      },
      createdAt: new Date().toISOString(),
    };
    exportJobs.set(jobId, job);
    persistJobToDB(job);

    setImmediate(async () => {
      try {
        const conditions: (SQL | undefined)[] = [eq(schema.events.userId, userId)];
        if (since) conditions.push(gte(schema.events.timestamp, new Date(since)));
        if (projectId) conditions.push(eq(schema.events.projectId, projectId));

        let events: EventRow[];
        try {
          events = await db
            .select()
            .from(schema.events)
            .where(and(...conditions))
            .orderBy(desc(schema.events.timestamp))
            .limit(10000);
        } catch {
          events = [];
        }

        const messages = events
          .filter((e) => e.eventType === "chat.message" || e.eventType === "message")
          .map((e) => {
            const payload = e.payload as Record<string, unknown> | null;
            return {
              role: (payload?.role as string) || "user",
              content: (payload?.content as string) || "",
              timestamp: e.timestamp,
            };
          });

        const toolEvents = includeTools
          ? events.filter((e) => e.eventType === "tool.call" || e.eventType === "term.command")
          : [];

        const errorEvents = includeErrors
          ? events.filter((e) => {
              const payload = e.payload as Record<string, unknown> | null;
              return e.eventType === "error" ||
                (payload?.exitCode && payload.exitCode !== 0);
            })
          : [];

        const lines: string[] = [];

        // Group messages into conversations (30-min gap = new conversation)
        const conversations: typeof messages[] = [];
        let currentConvo: typeof messages = [];

        for (const msg of messages) {
          const msgTime = new Date(msg.timestamp || 0).getTime();
          const lastTime = currentConvo.length > 0
            ? new Date(currentConvo[currentConvo.length - 1].timestamp || 0).getTime()
            : 0;

          if (currentConvo.length > 0 && msgTime - lastTime > 30 * 60 * 1000) {
            if (currentConvo.length >= minTurns) conversations.push(currentConvo);
            currentConvo = [];
          }
          currentConvo.push(msg);
        }
        if (currentConvo.length >= minTurns) conversations.push(currentConvo);

        const filtered = maxTurns
          ? conversations.map((c) => c.slice(0, maxTurns))
          : conversations;

        for (const convo of filtered) {
          if (format === "openai") {
            lines.push(JSON.stringify({
              messages: convo.map((m) => ({ role: m.role, content: m.content })),
            }));
          } else if (format === "anthropic") {
            const system = convo.find((m) => m.role === "system");
            const nonSystem = convo.filter((m) => m.role !== "system");
            lines.push(JSON.stringify({
              system: system?.content || "",
              messages: nonSystem.map((m) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content,
              })),
            }));
          } else {
            lines.push(JSON.stringify({
              conversation: convo.map((m) => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
              })),
            }));
          }
        }

        if (toolEvents.length > 0) {
          for (const te of toolEvents.slice(0, 500)) {
            const p = te.payload as Record<string, unknown> | null;
            lines.push(JSON.stringify({
              type: "tool_example",
              tool: (p?.tool as string) || (p?.command as string) || "unknown",
              input: p?.args || p?.command,
              output: p?.result || p?.output,
              exitCode: p?.exitCode,
            }));
          }
        }

        if (errorEvents.length > 0) {
          for (const ee of errorEvents.slice(0, 200)) {
            const p = ee.payload as Record<string, unknown> | null;
            lines.push(JSON.stringify({
              type: "error_recovery",
              error: p?.error || p?.content,
              exitCode: p?.exitCode,
              timestamp: ee.timestamp,
            }));
          }
        }

        let output = lines.join("\n");
        if (redact) {
          const secretPatterns = [
            /(?:sk-|pk_)[A-Za-z0-9]{20,}/g,
            /(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{36}/g,
            /AKIA[A-Z0-9]{16}/g,
            /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
            /(?:password|secret|token|key)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
          ];
          for (const pattern of secretPatterns) {
            output = output.replace(pattern, "[REDACTED]");
          }
        }

        job.status = "completed";
        job.completedAt = new Date().toISOString();
        job.stats = {
          conversations: filtered.length,
          messages: messages.length,
          toolExamples: toolEvents.length,
          errorExamples: errorEvents.length,
          totalLines: lines.length,
        };

        const ext = "jsonl";
        let s3Result: { bucket: string; key: string; url: string } | null = null;
        if (job.config?.destination === "s3" && job.config.s3Bucket) {
          try {
            s3Result = await uploadExportToS3(output, {
              bucket: job.config.s3Bucket,
              prefix: job.config.s3Prefix,
              jobId,
              ext,
            });
            job.s3 = { url: s3Result.url, bucket: s3Result.bucket, key: s3Result.key };
          } catch (err: unknown) {
            job.status = "failed";
            job.error = err instanceof Error ? err.message : "S3 upload failed";
          }
        } else {
          job.data = output;
        }

        try {
          await persistKnowledgeArtifact({
            id: `kb_${jobId}`,
            userId,
            projectId: projectId || null,
            jobId,
            type: "export",
            format: ext,
            content: job.data ? output : null,
            stats: job.stats,
            storage: job.s3 ? "s3" : "db",
            s3: job.s3 ? { bucket: job.s3.bucket, key: job.s3.key, url: job.s3.url } : null,
          });
        } catch {
          // Best-effort persistence
        }

        updateJobInDB(jobId, {
          status: job.status === "failed" ? "failed" : "completed",
          progress: 100,
          result: {
            stats: job.stats,
            downloadUrl: `/v1/export/download/${jobId}`,
            s3: job.s3,
          },
          error: job.error,
          completedAt: new Date(),
        });
      } catch (err: unknown) {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : "Unknown error";
        updateJobInDB(jobId, { status: "failed", error: job.error });
      }
    });

    res.status(202).json({
      id: jobId,
      status: "processing",
      type: "training",
      format,
      createdAt: job.createdAt,
      message: "Export job created. Poll GET /v1/export/status/:id for progress.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: { type: "server_error", message } });
  }
});

// ============================================================================
// POST /v1/export/analytics - Export analytics data
// ============================================================================

router.post("/analytics", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: { type: "auth_error", message: "Unauthorized" } });

    const { format = "json", since, projectId, destination, s3_bucket, s3_prefix } = req.body;

    // Consent gate: analytics export requires operational_capture consent
    if (projectId) {
      const consent = await checkConsent(userId, projectId, "operational_capture");
      await logAction(
        userId,
        "consent.checked",
        "consent",
        projectId,
        { consentType: "operational_capture", decision: consent, source: "export.analytics" },
        req
      );
      if (!consent.allowed) {
        await logAction(
          userId,
          "export.denied",
          "export_job",
          projectId,
          { consentType: "operational_capture", reason: consent.reason, source: "export.analytics" },
          req
        );
        return res.status(403).json({
          error: {
            type: "consent_error",
            code: "CONSENT_REQUIRED",
            message: "Analytics export blocked by consent policy",
            consentType: "operational_capture",
            reason: consent.reason,
          },
        });
      }
    } else {
      // No projectId: check consent across all user's projects
      const userProjects = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.userId, userId));

      for (const proj of userProjects) {
        const consent = await checkConsent(userId, proj.id, "operational_capture");
        await logAction(
          userId,
          "consent.checked",
          "consent",
          proj.id,
          { consentType: "operational_capture", decision: consent, source: "export.analytics.all_projects" },
          req
        );
        if (!consent.allowed) {
          await logAction(
            userId,
            "export.denied",
            "export_job",
            proj.id,
            { consentType: "operational_capture", reason: consent.reason, source: "export.analytics.all_projects" },
            req
          );
          return res.status(403).json({
            error: {
              type: "consent_error",
              code: "CONSENT_REQUIRED",
              message: `Analytics export blocked by consent policy for project ${proj.id}`,
              consentType: "operational_capture",
              projectId: proj.id,
              reason: consent.reason,
            },
          });
        }
      }
    }

    if (!["json", "csv"].includes(format)) {
      return res.status(400).json({
        error: { type: "invalid_request_error", message: "format must be json or csv" },
      });
    }

    const jobId = generateJobId();
    const job: ExportJobResponse & { ownerId: string; data?: string } = {
      id: jobId,
      ownerId: userId,
      status: "processing",
      type: "analytics",
      format,
      config: {
        destination,
        s3Bucket: s3_bucket,
        s3Prefix: s3_prefix,
      },
      createdAt: new Date().toISOString(),
    };
    exportJobs.set(jobId, job);
    persistJobToDB(job);

    setImmediate(async () => {
      try {
        const conditions: (SQL | undefined)[] = [eq(schema.events.userId, userId)];
        if (since) conditions.push(gte(schema.events.timestamp, new Date(since)));
        if (projectId) conditions.push(eq(schema.events.projectId, projectId));

        let events: EventRow[];
        try {
          events = await db
            .select()
            .from(schema.events)
            .where(and(...conditions))
            .orderBy(desc(schema.events.timestamp))
            .limit(50000);
        } catch {
          events = [];
        }

        const analytics: Record<string, unknown> = {
          period: { from: since || "all", to: new Date().toISOString() },
          totals: {
            events: events.length,
            chatMessages: events.filter((e) => e.eventType === "chat.message").length,
            toolCalls: events.filter((e) => e.eventType === "tool.call").length,
            terminalCommands: events.filter((e) => e.eventType === "term.command").length,
            checkpoints: events.filter((e) => e.eventType === "checkpoint.created").length,
            errors: events.filter((e) => {
              const payload = e.payload as Record<string, unknown> | null;
              return e.eventType === "error" || (payload?.exitCode && payload.exitCode !== 0);
            }).length,
          },
          byDay: {} as Record<string, number>,
          byHour: Array(24).fill(0),
          byType: {} as Record<string, number>,
        };

        const byDay = analytics.byDay as Record<string, number>;
        const byHour = analytics.byHour as number[];
        const byType = analytics.byType as Record<string, number>;
        for (const e of events) {
          const ts = e.timestamp ? new Date(e.timestamp) : new Date();
          const day = ts.toISOString().slice(0, 10);
          const hour = ts.getHours();
          byDay[day] = (byDay[day] || 0) + 1;
          byHour[hour]++;
          byType[e.eventType] = (byType[e.eventType] || 0) + 1;
        }

        let output: string;
        if (format === "csv") {
          const csvLines = ["date,events"];
          for (const [day, cnt] of Object.entries(byDay)) {
            csvLines.push(`${day},${cnt}`);
          }
          output = csvLines.join("\n");
        } else {
          output = JSON.stringify(analytics, null, 2);
        }

        job.status = "completed";
        job.completedAt = new Date().toISOString();
        job.stats = analytics.totals as Record<string, number>;

        const ext = format === "csv" ? "csv" : "json";
        let s3Result: { bucket: string; key: string; url: string } | null = null;
        if (job.config?.destination === "s3" && job.config.s3Bucket) {
          try {
            s3Result = await uploadExportToS3(output, {
              bucket: job.config.s3Bucket,
              prefix: job.config.s3Prefix,
              jobId,
              ext,
            });
            job.s3 = { url: s3Result.url, bucket: s3Result.bucket, key: s3Result.key };
          } catch (err: unknown) {
            job.status = "failed";
            job.error = err instanceof Error ? err.message : "S3 upload failed";
          }
        } else {
          job.data = output;
        }

        try {
          await persistKnowledgeArtifact({
            id: `kb_${jobId}`,
            userId,
            projectId: projectId || null,
            jobId,
            type: "export",
            format: ext,
            content: job.data ? output : null,
            stats: job.stats,
            storage: job.s3 ? "s3" : "db",
            s3: job.s3 ? { bucket: job.s3.bucket, key: job.s3.key, url: job.s3.url } : null,
          });
        } catch {
          // Best-effort persistence
        }

        updateJobInDB(jobId, {
          status: job.status === "failed" ? "failed" : "completed",
          progress: 100,
          result: {
            stats: job.stats,
            downloadUrl: `/v1/export/download/${jobId}`,
            s3: job.s3,
          },
          error: job.error,
          completedAt: new Date(),
        });
      } catch (err: unknown) {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : "Unknown error";
        updateJobInDB(jobId, { status: "failed", error: job.error });
      }
    });

    res.status(202).json({
      id: jobId,
      status: "processing",
      type: "analytics",
      format,
      createdAt: job.createdAt,
      message: "Export job created. Poll GET /v1/export/status/:id for progress.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: { type: "server_error", message } });
  }
});

// ============================================================================
// GET /v1/export/status/:id - Check export job status
// ============================================================================

router.get("/status/:id", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  const jobId = req.params.id;
  let job: (ExportJobResponse & { ownerId: string; data?: string }) | undefined = exportJobs.get(jobId);

  // Fall back to DB if not in memory
  if (!job) {
    const dbJob = await getJobFromDB(jobId);
    if (!dbJob) {
      return res.status(404).json({ error: { type: "not_found_error", message: "Export job not found" } });
    }
    job = dbJob;
  }

  if (job.ownerId !== req.user?.userId) {
    return res.status(403).json({ error: { type: "permission_error", message: "Access denied" } });
  }

  const response: ExportJobResponse = {
    id: job.id,
    status: job.status,
    type: job.type,
    format: job.format,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    stats: job.stats,
    error: job.error,
    s3: job.s3,
  };

  if (job.status === "completed") {
    response.downloadUrl = `/v1/export/download/${jobId}`;
  }

  res.json(response);
});

// ============================================================================
// GET /v1/export/download/:id - Download export data
// ============================================================================

router.get("/download/:id", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  const jobId = req.params.id;
  let job: (ExportJobResponse & { ownerId: string; data?: string }) | undefined = exportJobs.get(jobId);

  // Fall back to DB for metadata (download data only available in memory)
  if (!job) {
    const dbJob = await getJobFromDB(jobId);
    if (!dbJob) {
      return res.status(404).json({ error: { type: "not_found_error", message: "Export job not found" } });
    }
    job = dbJob;
  }

  if (job.ownerId !== req.user?.userId) {
    return res.status(403).json({ error: { type: "permission_error", message: "Access denied" } });
  }

  if (job.status !== "completed") {
    return res.status(409).json({
      error: {
        type: "conflict_error",
        message: job.status === "failed"
          ? `Export failed: ${job.error}`
          : "Export not yet completed",
      },
    });
  }

  // Durable artifact fallback: the in-memory job.data buffer is lost on restart
  // and is not shared across instances. The export pipeline persists the
  // generated payload to the knowledge-base artifact store (DB) or S3, so when
  // the in-memory buffer is absent we serve the artifact as the source of truth.
  if (!job.data) {
    const artifact = await getArtifactByJobId(jobId, req.user!.userId);

    if (artifact?.storage === "s3" && artifact.s3) {
      // Try to stream the object back inline; fall back to returning the
      // pointer if the object is too large or unavailable.
      const text = await downloadS3ObjectText({
        bucket: artifact.s3.bucket,
        key: artifact.s3.key,
        maxBytes: 25 * 1024 * 1024,
      }).catch(() => null);
      if (text !== null) {
        job = { ...job, data: text };
      } else {
        return res.json({
          download: "s3",
          s3_url: artifact.s3.url,
          s3_bucket: artifact.s3.bucket,
          s3_key: artifact.s3.key,
        });
      }
    } else if (artifact?.content) {
      job = { ...job, data: artifact.content };
    } else if (job.s3) {
      return res.json({
        download: "s3",
        s3_url: job.s3.url,
        s3_bucket: job.s3.bucket,
        s3_key: job.s3.key,
      });
    }
  }

  if (!job.data && job.s3) {
    return res.json({
      download: "s3",
      s3_url: job.s3.url,
      s3_bucket: job.s3.bucket,
      s3_key: job.s3.key,
    });
  }

  if (!job.data) {
    return res.status(409).json({
      error: {
        type: "conflict_error",
        message: "Export data not available",
      },
    });
  }

  const contentType =
    job.format === "csv"
      ? "text/csv"
      : job.type === "training"
      ? "application/x-ndjson"
      : "application/json";

  const ext =
    job.format === "csv" ? "csv" : job.type === "training" ? "jsonl" : "json";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="aitm-${job.type}-${job.id}.${ext}"`);
  res.send(job.data);
});

// ============================================================================
// GET /v1/export/jobs - List export jobs for current user
// ============================================================================

router.get("/jobs", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: { type: "auth_error", message: "Unauthorized" } });

  // Query jobs from DB
  let dbRows: JobRow[] = [];
  try {
    dbRows = await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.userId, userId), eq(schema.jobs.type, "export")))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(100);
  } catch { /* fall back to in-memory only */ }

  // Merge: in-memory jobs take priority (more up-to-date for active jobs)
  const jobMap = new Map<string, ExportJobResponse>();

  for (const row of dbRows) {
    const params = row.params as Record<string, unknown> | null;
    const result = row.result as Record<string, unknown> | null;
    jobMap.set(row.id, {
      id: row.id,
      status: (row.status === "running" ? "processing" : (row.status || "pending")) as ExportJobResponse["status"],
      type: ((params?.exportType as string) || "training") as ExportJobResponse["type"],
      format: (params?.format as string) || "generic",
      createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
      completedAt: row.completedAt?.toISOString(),
      stats: result?.stats as Record<string, number> | undefined,
      error: row.error || undefined,
      s3: result?.s3 as ExportJobResponse["s3"],
      downloadUrl: row.status === "completed" ? `/v1/export/download/${row.id}` : undefined,
    });
  }

  // Override with in-memory data (more current for active jobs)
  for (const job of exportJobs.values()) {
    if (job.ownerId === userId) {
      jobMap.set(job.id, {
        id: job.id,
        status: job.status,
        type: job.type,
        format: job.format,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        stats: job.stats,
        error: job.error,
        s3: job.s3,
        downloadUrl: job.status === "completed" ? `/v1/export/download/${job.id}` : undefined,
      });
    }
  }

  const allJobs = Array.from(jobMap.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    jobs: allJobs,
    total: allJobs.length,
  });
});

// ============================================================================
// GET /v1/export/sessions.json - Export all user sessions as JSON
// ============================================================================

router.get("/sessions.json", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: { type: "auth_error", message: "Unauthorized" } });
    }

    const result = await exportSessionsAsJSON(userId);

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="aitm-sessions-${userId.slice(0, 8)}.json"`
    );
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: { type: "server_error", message } });
  }
});

// ============================================================================
// GET /v1/export/sessions.md - Export all user sessions as Markdown changelog
// ============================================================================

router.get("/sessions.md", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: { type: "auth_error", message: "Unauthorized" } });
    }

    const markdown = await exportSessionsAsMarkdown(userId);

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="aitm-sessions-${userId.slice(0, 8)}.md"`
    );
    res.send(markdown);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: { type: "server_error", message } });
  }
});

// ============================================================================
// GET /v1/export/sessions.csv - Export all user sessions as CSV
// ============================================================================

router.get("/sessions.csv", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: { type: "auth_error", message: "Unauthorized" } });
    }

    const csv = await exportSessionsAsCSV(userId);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="aitm-sessions-${userId.slice(0, 8)}.csv"`
    );
    res.send(csv);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: { type: "server_error", message } });
  }
});

// ============================================================================
// GET /v1/export/activity-report?days=30 - Activity report for the user
// ============================================================================

router.get("/activity-report", apiKeyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: { type: "auth_error", message: "Unauthorized" } });
    }

    const rawDays = req.query.days;
    const days = rawDays !== undefined ? parseInt(String(rawDays), 10) : 30;

    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({
        error: {
          type: "invalid_request_error",
          message: "days must be an integer between 1 and 365",
        },
      });
    }

    const report = await generateActivityReport(userId, days);
    res.json(report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: { type: "server_error", message } });
  }
});

// ============================================================================
// GET /v1/export/sessions/:id/git-history - Git-compatible diff for a session
// ============================================================================

router.get(
  "/sessions/:id/git-history",
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: { type: "auth_error", message: "Unauthorized" } });
      }

      const sessionId = req.params.id;
      if (!sessionId) {
        return res.status(400).json({
          error: { type: "invalid_request_error", message: "Session ID is required" },
        });
      }

      // Verify session ownership before exporting
      const ownerCheck = await db
        .select({ userId: schema.chatSessions.userId })
        .from(schema.chatSessions)
        .where(eq(schema.chatSessions.id, sessionId))
        .limit(1);

      if (ownerCheck.length === 0) {
        return res.status(404).json({
          error: { type: "not_found_error", message: "Session not found" },
        });
      }

      if (ownerCheck[0].userId !== userId) {
        return res.status(403).json({
          error: { type: "permission_error", message: "Access denied" },
        });
      }

      const result = await exportToGitHistory(sessionId);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("Session not found")) {
        return res.status(404).json({ error: { type: "not_found_error", message } });
      }
      res.status(500).json({ error: { type: "server_error", message } });
    }
  }
);

export default router;
