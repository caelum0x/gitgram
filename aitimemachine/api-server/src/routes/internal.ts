import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { internalAuth } from "../middleware/auth.js";
import { and, count, desc, eq, gte, inArray, like, lte, max, or, SQL } from "drizzle-orm";
import { getDeliveryStats, retryDelivery } from "../services/webhookDelivery.js";
import {
  backfillKnowledgeBaseEmbeddings,
  getKnowledgeStats,
  listKnowledgeArtifacts,
  unifiedKnowledgeSearch,
} from "../services/knowledgeBase.js";
import { getEmbeddingService } from "../services/embeddings.js";
import {
  createPipelineJob,
  getPipelineDownload,
  getPipelineJob,
  listPipelineJobs,
} from "../services/data-pipeline.js";
import { checkConsent } from "../services/consent.js";
import { purgeUserData } from "../services/dataDeletion.js";
import { getEmailService } from "../services/email.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// ============================================
// CLERK WEBHOOK (no auth - uses svix signature)
// ============================================

const clerkEventSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.string(),
    email_addresses: z.array(
      z.object({
        email_address: z.string(),
        id: z.string(),
      })
    ),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    primary_email_address_id: z.string().nullable().optional(),
  }),
});

function verifyClerkWebhook(
  payload: string,
  headers: {
    svixId: string;
    svixTimestamp: string;
    svixSignature: string;
  }
): boolean {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("CLERK_WEBHOOK_SECRET is not configured");
    return false;
  }

  // Clerk/svix secrets are prefixed with "whsec_" and base64-encoded after that
  const secretBytes = Buffer.from(
    secret.startsWith("whsec_") ? secret.slice(6) : secret,
    "base64"
  );

  const toSign = `${headers.svixId}.${headers.svixTimestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secretBytes)
    .update(toSign, "utf8")
    .digest("base64");

  // svix-signature header may contain multiple space-separated signatures (e.g. "v1,<sig1> v1,<sig2>")
  const signatures = headers.svixSignature.split(" ");
  for (const versionedSig of signatures) {
    const [version, sig] = versionedSig.split(",", 2);
    if (version === "v1" && sig === expectedSignature) {
      return true;
    }
  }

  return false;
}

function extractPrimaryEmail(
  data: z.infer<typeof clerkEventSchema>["data"]
): string | null {
  if (!data.email_addresses || data.email_addresses.length === 0) {
    return null;
  }

  if (data.primary_email_address_id) {
    const primary = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id
    );
    if (primary) return primary.email_address;
  }

  // Fallback to first email if no primary is set
  return data.email_addresses[0].email_address;
}

function buildName(
  firstName?: string | null,
  lastName?: string | null
): string | undefined {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

router.post("/webhooks/clerk", async (req, res) => {
  try {
    const svixId = req.headers["svix-id"] as string | undefined;
    const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
    const svixSignature = req.headers["svix-signature"] as string | undefined;

    if (!svixId || !svixTimestamp || !svixSignature) {
      logger.warn("Clerk webhook missing svix headers");
      return res.status(400).json({ error: "Missing svix headers" });
    }

    // Verify timestamp is within tolerance (5 minutes)
    const timestampSeconds = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampSeconds) > 300) {
      logger.warn("Clerk webhook timestamp outside tolerance");
      return res.status(400).json({ error: "Timestamp too old" });
    }

    const rawBody = typeof req.body === "string" ? req.body
      : Buffer.isBuffer(req.body) ? req.body.toString()
      : JSON.stringify(req.body);

    const isValid = verifyClerkWebhook(rawBody, {
      svixId,
      svixTimestamp,
      svixSignature,
    });

    if (!isValid) {
      logger.warn("Clerk webhook signature verification failed");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = clerkEventSchema.parse(req.body);
    const { type, data } = event;

    logger.info("Clerk webhook received", { type, userId: data.id });

    switch (type) {
      case "user.created": {
        const email = extractPrimaryEmail(data);
        if (!email) {
          logger.error("Clerk user.created: no email for user", undefined, { userId: data.id });
          break;
        }
        const name = buildName(data.first_name, data.last_name);

        await db
          .insert(schema.users)
          .values({
            id: data.id,
            email,
            name,
          })
          .onConflictDoUpdate({
            target: schema.users.id,
            set: {
              email,
              name,
              updatedAt: new Date(),
            },
          });

        logger.info("Clerk user.created: upserted user", { userId: data.id, email });
        break;
      }

      case "user.updated": {
        const email = extractPrimaryEmail(data);
        if (!email) {
          logger.error("Clerk user.updated: no email for user", undefined, { userId: data.id });
          break;
        }
        const name = buildName(data.first_name, data.last_name);

        await db
          .update(schema.users)
          .set({
            email,
            name,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, data.id));

        logger.info("Clerk user.updated: updated user", { userId: data.id, email });
        break;
      }

      case "user.deleted": {
        // GDPR right-to-erasure: purge all user-scoped data and anonymise the
        // account record. Idempotent — safe even if the user is already gone.
        if (!data.id) {
          logger.error("Clerk user.deleted: missing user id", undefined, {});
          break;
        }
        try {
          const summary = await purgeUserData(data.id);
          logger.info("Clerk user.deleted: purged user data", {
            userId: data.id,
            deletedProjects: summary.deletedProjectIds.length,
            deletedRepositories: summary.deletedRepositoryIds.length,
            deletedCheckpoints: summary.deletedCheckpointIds.length,
          });
        } catch (purgeError) {
          // Log and rethrow so the outer handler records it; Clerk will retry.
          logger.error(
            "Clerk user.deleted: failed to purge user data",
            purgeError instanceof Error ? purgeError : undefined,
            { userId: data.id, details: String(purgeError) }
          );
          throw purgeError;
        }
        break;
      }

      default: {
        logger.info("Clerk webhook: unhandled event type", { type });
      }
    }

    // Always return 200 to acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    logger.error("Clerk webhook error", error instanceof Error ? error : undefined, { details: String(error) });
    // Still return 200 to prevent Clerk from retrying on parse/DB errors
    res.status(200).json({ received: true, error: "Processing failed" });
  }
});

// All internal routes below require internal secret
router.use(internalAuth);

// ============================================
// WEBHOOKS (internal, called by website)
// ============================================

const internalWebhookListSchema = z.object({
  userId: z.string().min(1),
});

const internalWebhookCreateSchema = z.object({
  userId: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  secret: z.string().min(1),
});

const internalWebhookUpdateSchema = z.object({
  userId: z.string().min(1),
  enabled: z.boolean().optional(),
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).min(1).optional(),
});

router.get("/webhooks", async (req, res) => {
  try {
    const { userId } = internalWebhookListSchema.parse(req.query);

    const webhooks = await db
      .select({
        id: schema.webhooks.id,
        url: schema.webhooks.url,
        events: schema.webhooks.events,
        enabled: schema.webhooks.isActive,
        createdAt: schema.webhooks.createdAt,
        lastTriggered: schema.webhooks.lastTriggeredAt,
        failureCount: schema.webhooks.failureCount,
      })
      .from(schema.webhooks)
      .where(eq(schema.webhooks.userId, userId))
      .orderBy(desc(schema.webhooks.createdAt));

    // Never return secrets on list.
    res.json({ webhooks });
  } catch (error) {
    logger.error("Internal webhooks list error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid request" });
  }
});

router.post("/webhooks", async (req, res) => {
  try {
    const data = internalWebhookCreateSchema.parse(req.body);
    const id = crypto.randomBytes(16).toString("hex");

    await db.insert(schema.webhooks).values({
      id,
      userId: data.userId,
      url: data.url,
      secret: data.secret,
      events: data.events,
      isActive: true,
    });

    const [webhook] = await db
      .select({
        id: schema.webhooks.id,
        url: schema.webhooks.url,
        events: schema.webhooks.events,
        enabled: schema.webhooks.isActive,
        createdAt: schema.webhooks.createdAt,
        lastTriggered: schema.webhooks.lastTriggeredAt,
        failureCount: schema.webhooks.failureCount,
      })
      .from(schema.webhooks)
      .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.userId, data.userId)))
      .limit(1);

    res.json({ webhook });
  } catch (error) {
    logger.error("Internal webhooks create error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid request" });
  }
});

router.patch("/webhooks/:id", async (req, res) => {
  try {
    const webhookId = req.params.id;
    const data = internalWebhookUpdateSchema.parse(req.body);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof data.enabled === "boolean") update.isActive = data.enabled;
    if (typeof data.url === "string") update.url = data.url;
    if (Array.isArray(data.events)) update.events = data.events;

    const updated = await db
      .update(schema.webhooks)
      .set(update)
      .where(and(eq(schema.webhooks.id, webhookId), eq(schema.webhooks.userId, data.userId)))
      .returning({
        id: schema.webhooks.id,
        url: schema.webhooks.url,
        events: schema.webhooks.events,
        enabled: schema.webhooks.isActive,
        createdAt: schema.webhooks.createdAt,
        lastTriggered: schema.webhooks.lastTriggeredAt,
        failureCount: schema.webhooks.failureCount,
      });

    if (updated.length === 0) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    res.json({ webhook: updated[0] });
  } catch (error) {
    logger.error("Internal webhooks update error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid request" });
  }
});

router.delete("/webhooks/:id", async (req, res) => {
  try {
    const webhookId = req.params.id;
    const { userId } = internalWebhookListSchema.parse(req.query);

    const deleted = await db
      .delete(schema.webhooks)
      .where(and(eq(schema.webhooks.id, webhookId), eq(schema.webhooks.userId, userId)))
      .returning({ id: schema.webhooks.id });

    if (deleted.length === 0) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error("Internal webhooks delete error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid request" });
  }
});

router.get("/webhooks/:id/deliveries", async (req, res) => {
  try {
    const webhookId = req.params.id;
    const { userId } = internalWebhookListSchema.parse(req.query);
    const limit = Math.min(parseInt((req.query.limit as string) || "50", 10) || 50, 200);
    const offset = Math.max(parseInt((req.query.offset as string) || "0", 10) || 0, 0);
    const status = (req.query.status as string | undefined) || undefined;

    const [webhook] = await db
      .select({
        id: schema.webhooks.id,
        url: schema.webhooks.url,
        events: schema.webhooks.events,
        enabled: schema.webhooks.isActive,
        createdAt: schema.webhooks.createdAt,
        lastTriggered: schema.webhooks.lastTriggeredAt,
        failureCount: schema.webhooks.failureCount,
      })
      .from(schema.webhooks)
      .where(and(eq(schema.webhooks.id, webhookId), eq(schema.webhooks.userId, userId)))
      .limit(1);

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    const deliveries = await db
      .select({
        id: schema.webhookDeliveries.id,
        eventType: schema.webhookDeliveries.eventType,
        status: schema.webhookDeliveries.status,
        attempts: schema.webhookDeliveries.attempts,
        lastAttemptAt: schema.webhookDeliveries.lastAttemptAt,
        nextRetryAt: schema.webhookDeliveries.nextRetryAt,
        responseStatus: schema.webhookDeliveries.responseStatus,
        createdAt: schema.webhookDeliveries.createdAt,
      })
      .from(schema.webhookDeliveries)
      .where(
        status
          ? and(
              eq(schema.webhookDeliveries.webhookId, webhookId),
              eq(schema.webhookDeliveries.status, status)
            )
          : eq(schema.webhookDeliveries.webhookId, webhookId)
      )
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(limit)
      .offset(offset);

    const stats = await getDeliveryStats(webhookId);

    res.json({
      webhook,
      deliveries,
      stats,
      pagination: {
        limit,
        offset,
        hasMore: deliveries.length === limit,
      },
    });
  } catch (error) {
    logger.error("Internal webhooks deliveries error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid request" });
  }
});

router.post("/webhooks/:id/deliveries/:deliveryId/retry", async (req, res) => {
  try {
    const webhookId = req.params.id;
    const deliveryId = req.params.deliveryId;
    const body = z.object({ userId: z.string().min(1) }).parse(req.body);

    const [webhook] = await db
      .select({ id: schema.webhooks.id, enabled: schema.webhooks.isActive })
      .from(schema.webhooks)
      .where(and(eq(schema.webhooks.id, webhookId), eq(schema.webhooks.userId, body.userId)))
      .limit(1);

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    if (!webhook.enabled) {
      return res.status(400).json({ error: "Webhook is disabled" });
    }

    const [delivery] = await db
      .select({ id: schema.webhookDeliveries.id })
      .from(schema.webhookDeliveries)
      .where(and(eq(schema.webhookDeliveries.id, deliveryId), eq(schema.webhookDeliveries.webhookId, webhookId)))
      .limit(1);

    if (!delivery) {
      return res.status(404).json({ error: "Delivery not found" });
    }

    const success = await retryDelivery(deliveryId);

    const [updated] = await db
      .select({
        status: schema.webhookDeliveries.status,
        attempts: schema.webhookDeliveries.attempts,
        responseStatus: schema.webhookDeliveries.responseStatus,
        responseBody: schema.webhookDeliveries.responseBody,
      })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.id, deliveryId))
      .limit(1);

    res.json({
      success,
      deliveryId,
      status: updated?.status,
      attempts: updated?.attempts,
      responseStatus: updated?.responseStatus,
      message: success ? "Webhook retry successful" : "Webhook retry failed",
    });
  } catch (error) {
    logger.error("Internal webhooks retry error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid request" });
  }
});

// ============================================
// KNOWLEDGE BASE (internal)
// ============================================

const kbEmbeddingBackfillSchema = z.object({
  userId: z.string().optional(),
  repositoryId: z.string().optional(),
  projectId: z.string().optional(),
  limit: z.number().int().positive().max(5000).optional(),
  batchSize: z.number().int().positive().max(500).optional(),
  force: z.boolean().optional(),
  includeS3: z.boolean().optional(),
});

router.post("/knowledge-base/embeddings/backfill", async (req, res) => {
  try {
    const params = kbEmbeddingBackfillSchema.parse(req.body || {});
    const result = await backfillKnowledgeBaseEmbeddings(params);
    res.json({ success: true, result });
  } catch (error) {
    logger.error("KB embedding backfill error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid request" });
  }
});

router.get("/knowledge-base/embeddings/status", async (req, res) => {
  try {
    const userId = req.query.userId as string | undefined;
    const repositoryId = req.query.repositoryId as string | undefined;
    const projectId = req.query.projectId as string | undefined;

    const fileConditions = [];
    if (userId) fileConditions.push(eq(schema.knowledgeBaseFiles.userId, userId));
    if (repositoryId) fileConditions.push(eq(schema.knowledgeBaseFiles.repositoryId, repositoryId));
    if (projectId) fileConditions.push(eq(schema.knowledgeBaseFiles.projectId, projectId));

    const artifactConditions = [];
    if (userId) artifactConditions.push(eq(schema.knowledgeBaseArtifacts.userId, userId));
    if (projectId) artifactConditions.push(eq(schema.knowledgeBaseArtifacts.projectId, projectId));

    const files = await db
      .select({
        id: schema.knowledgeBaseFiles.id,
        embeddingModel: schema.knowledgeBaseFiles.embeddingModel,
        embeddingJson: schema.knowledgeBaseFiles.embeddingJson,
      })
      .from(schema.knowledgeBaseFiles)
      .where(fileConditions.length > 0 ? and(...fileConditions) : undefined);

    const artifacts = await db
      .select({
        id: schema.knowledgeBaseArtifacts.id,
        embeddingModel: schema.knowledgeBaseArtifacts.embeddingModel,
        embeddingJson: schema.knowledgeBaseArtifacts.embeddingJson,
      })
      .from(schema.knowledgeBaseArtifacts)
      .where(artifactConditions.length > 0 ? and(...artifactConditions) : undefined);

    const summarize = (rows: Array<{ embeddingModel: string | null; embeddingJson: unknown }>) => {
      const byModel: Record<string, number> = {};
      let withEmbeddings = 0;

      for (const row of rows) {
        if (row.embeddingJson) {
          withEmbeddings++;
          const model = row.embeddingModel || "unknown";
          byModel[model] = (byModel[model] || 0) + 1;
        }
      }

      return {
        total: rows.length,
        with_embeddings: withEmbeddings,
        without_embeddings: rows.length - withEmbeddings,
        coverage: rows.length > 0 ? withEmbeddings / rows.length : 0,
        by_model: byModel,
      };
    };

    const embeddingService = getEmbeddingService();
    const providerInfo = embeddingService.getProviderInfo();

    res.json({
      files: summarize(files),
      artifacts: summarize(artifacts),
      embedding_provider: providerInfo.provider,
      embedding_dimensions: providerInfo.dimensions,
    });
  } catch (error) {
    logger.error("KB embedding status error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to compute embedding status" });
  }
});

const internalKnowledgeSearchSchema = z.object({
  userId: z.string().min(1),
  query: z.string().min(1),
  repositoryId: z.string().optional(),
  projectId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

router.get("/knowledge-base/search", async (req, res) => {
  try {
    const query = internalKnowledgeSearchSchema.parse(req.query);
    const result = await unifiedKnowledgeSearch(query.userId, query.query, {
      repositoryId: query.repositoryId,
      projectId: query.projectId,
      limit: query.limit,
    });

    res.json({
      query: query.query,
      files: result.files.map((file: any) => ({
        id: file.id,
        repositoryId: file.repositoryId,
        filePath: file.filePath,
        language: file.language,
        size: file.size,
        updatedAt: file.updatedAt,
        snippet: file.content ? String(file.content).slice(0, 200) : null,
      })),
      artifacts: result.artifacts.map((artifact: any) => ({
        id: artifact.id,
        type: artifact.type,
        format: artifact.format,
        storage: artifact.storage,
        size: artifact.size,
        stats: artifact.stats,
        createdAt: artifact.createdAt,
      })),
      embeddings: result.embeddings.map((embedding: any) => ({
        id: embedding.id,
        repositoryId: embedding.repositoryId,
        filePath: embedding.filePath,
        symbol: embedding.symbol,
        symbolType: embedding.symbolType,
        language: embedding.language,
        lineStart: embedding.lineStart,
        lineEnd: embedding.lineEnd,
        snippet: embedding.content ? String(embedding.content).slice(0, 200) : null,
      })),
    });
  } catch (error) {
    logger.error("Internal KB search error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid knowledge base search request" });
  }
});

const internalKnowledgeStatsSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().optional(),
});

router.get("/knowledge-base/stats", async (req, res) => {
  try {
    const query = internalKnowledgeStatsSchema.parse(req.query);
    const stats = await getKnowledgeStats(query.userId, query.projectId);
    res.json(stats);
  } catch (error) {
    logger.error("Internal KB stats error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid knowledge base stats request" });
  }
});

const internalKnowledgeArtifactsSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/knowledge-base/artifacts", async (req, res) => {
  try {
    const query = internalKnowledgeArtifactsSchema.parse(req.query);
    const result = await listKnowledgeArtifacts(query.userId, {
      projectId: query.projectId,
      type: query.type,
      limit: query.limit,
      offset: query.offset,
    });
    res.json({
      artifacts: result.artifacts,
      total: result.total,
    });
  } catch (error) {
    logger.error("Internal KB artifacts error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid knowledge base artifacts request" });
  }
});

const internalTrainingConsentQuerySchema = z.object({
  userId: z.string().min(1),
});

const internalTrainingConsentUpdateSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().min(1),
  granted: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
});

router.get("/consent/training-export", async (req, res) => {
  try {
    const query = internalTrainingConsentQuerySchema.parse(req.query);
    const projects = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        rootPath: schema.projects.rootPath,
      })
      .from(schema.projects)
      .where(eq(schema.projects.userId, query.userId))
      .orderBy(desc(schema.projects.updatedAt));

    const consents = await Promise.all(
      projects.map(async (project) => ({
        projectId: project.id,
        projectName: project.name,
        projectPath: project.rootPath,
        decision: await checkConsent(query.userId, project.id, "training_export"),
      }))
    );

    res.json({ projects: consents });
  } catch (error) {
    logger.error("Internal training consent list error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid training consent request" });
  }
});

router.post("/consent/training-export", async (req, res) => {
  try {
    const body = internalTrainingConsentUpdateSchema.parse(req.body);
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, body.projectId), eq(schema.projects.userId, body.userId)))
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const [created] = await db
      .insert(schema.consents)
      .values({
        projectId: body.projectId,
        organizationId: null,
        consentType: "training_export",
        granted: body.granted,
        grantedByUserId: body.userId,
        effectiveFrom: new Date(),
        effectiveTo: null,
        metadata: body.metadata || {},
        createdAt: new Date(),
      })
      .returning();

    const decision = await checkConsent(body.userId, body.projectId, "training_export");
    res.status(201).json({
      success: true,
      consent: created,
      decision,
    });
  } catch (error) {
    logger.error("Internal training consent update error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid training consent update request" });
  }
});

const internalPipelineListSchema = z.object({
  userId: z.string().min(1),
});

const internalPipelineCreateSchema = z.object({
  userId: z.string().min(1),
  projectIds: z.array(z.string().min(1)).optional(),
  includeChats: z.boolean().optional(),
  includeCodeChanges: z.boolean().optional(),
  includeTerminalCommands: z.boolean().optional(),
  includeCheckpoints: z.boolean().optional(),
  minConversationTurns: z.number().int().positive().max(100).optional(),
  format: z.enum(["openai", "anthropic", "generic", "raw"]).optional(),
  redactSecrets: z.boolean().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

router.get("/pipeline", async (req, res) => {
  try {
    const query = internalPipelineListSchema.parse(req.query);
    const jobs = await listPipelineJobs(query.userId);
    res.json({ jobs });
  } catch (error) {
    logger.error("Internal pipeline list error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid pipeline list request" });
  }
});

router.post("/pipeline", async (req, res) => {
  try {
    const body = internalPipelineCreateSchema.parse(req.body);

    const selectedProjects = body.projectIds && body.projectIds.length > 0
      ? await db
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(and(eq(schema.projects.userId, body.userId), inArray(schema.projects.id, body.projectIds)))
      : await db
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(eq(schema.projects.userId, body.userId));

    const projectIds = selectedProjects.map((project: any) => project.id);
    if (body.projectIds && projectIds.length !== body.projectIds.length) {
      return res.status(404).json({ error: "One or more projects were not found" });
    }

    for (const projectId of projectIds) {
      const decision = await checkConsent(body.userId, projectId, "training_export");
      if (!decision.allowed) {
        return res.status(403).json({
          error: "Training export consent required",
          projectId,
          reason: decision.reason,
        });
      }
    }

    const job = await createPipelineJob(body.userId, {
      includeChats: body.includeChats ?? true,
      includeCodeChanges: body.includeCodeChanges ?? true,
      includeTerminalCommands: body.includeTerminalCommands ?? true,
      includeCheckpoints: body.includeCheckpoints ?? true,
      projectIds: body.projectIds,
      since: body.since,
      until: body.until,
      minConversationTurns: body.minConversationTurns ?? 2,
      format: body.format ?? "generic",
      redactSecrets: body.redactSecrets ?? true,
    });

    res.status(201).json({ job });
  } catch (error) {
    logger.error("Internal pipeline create error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid pipeline create request" });
  }
});

const internalPipelineDetailSchema = z.object({
  userId: z.string().min(1),
});

router.get("/pipeline/:id", async (req, res) => {
  try {
    const query = internalPipelineDetailSchema.parse(req.query);
    const job = await getPipelineJob(req.params.id);
    if (!job || job.userId !== query.userId) {
      return res.status(404).json({ error: "Pipeline job not found" });
    }
    res.json({ job });
  } catch (error) {
    logger.error("Internal pipeline detail error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid pipeline detail request" });
  }
});

router.get("/pipeline/:id/download", async (req, res) => {
  try {
    const query = internalPipelineDetailSchema.parse(req.query);
    const job = await getPipelineJob(req.params.id);
    if (!job || job.userId !== query.userId) {
      return res.status(404).json({ error: "Pipeline job not found" });
    }
    if (job.status !== "completed") {
      return res.status(409).json({ error: "Pipeline job is not completed" });
    }

    const download = await getPipelineDownload(req.params.id);
    if (!download) {
      return res.status(404).json({ error: "Pipeline download not available" });
    }

    if (download.data) {
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Content-Disposition", `attachment; filename="aitm-pipeline-${req.params.id}.jsonl"`);
      return res.send(download.data);
    }

    if (download.s3Url) {
      return res.redirect(download.s3Url);
    }

    return res.status(404).json({ error: "Pipeline download not available" });
  } catch (error) {
    logger.error("Internal pipeline download error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid pipeline download request" });
  }
});

// ============================================
// USER MANAGEMENT (called by website)
// ============================================

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
});

router.post("/users", async (req, res) => {
  try {
    const data = userSchema.parse(req.body);

    await db
      .insert(schema.users)
      .values({
        id: data.id,
        email: data.email,
        name: data.name,
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          email: data.email,
          name: data.name,
          updatedAt: new Date(),
        },
      });

    res.json({ success: true, userId: data.id });
  } catch (error) {
    logger.error("Create user error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid user data" });
  }
});

router.get("/users/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    logger.error("Get user error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get user" });
  }
});

// ============================================
// API KEY MANAGEMENT (called by website)
// ============================================

const apiKeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  keyHash: z.string(),
  keyPrefix: z.string(),
  name: z.string().optional(),
  // The caller (website) should pass the authenticated user's real email/name
  // so a newly-created user row is never seeded with placeholder data.
  email: z.string().email().optional(),
  userName: z.string().optional(),
});

/**
 * Fetch a user's primary email address from the Clerk Backend API.
 * Returns null when Clerk is not configured or the lookup fails.
 */
async function fetchClerkUserEmail(userId: string): Promise<string | null> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return null;
  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      primary_email_address_id?: string;
      email_addresses?: Array<{ id: string; email_address: string }>;
    };
    const emails = body.email_addresses ?? [];
    const primary =
      emails.find((e) => e.id === body.primary_email_address_id) ?? emails[0];
    return primary?.email_address ?? null;
  } catch (error) {
    logger.warn("Clerk user lookup failed", { userId, details: String(error) });
    return null;
  }
}

router.post("/keys", async (req, res) => {
  try {
    const data = apiKeySchema.parse(req.body);

    // Ensure user exists
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, data.userId))
      .limit(1);

    if (!user) {
      // Create the user if they don't exist yet (first key creation can race
      // ahead of the Clerk user.created webhook). Resolve the real email from
      // the request payload, falling back to the Clerk Backend API — never a
      // fabricated placeholder.
      const resolvedEmail = data.email ?? (await fetchClerkUserEmail(data.userId));
      if (!resolvedEmail) {
        return res.status(422).json({
          error:
            "Cannot create API key: user does not exist and no email could be resolved. " +
            "Provide 'email' in the request or configure CLERK_SECRET_KEY.",
        });
      }
      await db.insert(schema.users).values({
        id: data.userId,
        email: resolvedEmail,
        name: data.userName ?? null,
      });
    }

    await db.insert(schema.apiKeys).values({
      id: data.id,
      userId: data.userId,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      name: data.name || "Default",
    });

    res.json({ success: true, keyId: data.id });
  } catch (error) {
    logger.error("Create API key error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid API key data" });
  }
});

router.get("/keys", async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId required" });
    }

    const keys = await db
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        keyPrefix: schema.apiKeys.keyPrefix,
        createdAt: schema.apiKeys.createdAt,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        revokedAt: schema.apiKeys.revokedAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, userId as string));

    res.json(keys);
  } catch (error) {
    logger.error("Get keys error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to get keys" });
  }
});

router.delete("/keys/:keyId", async (req, res) => {
  try {
    const { keyId } = req.params;

    await db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.apiKeys.id, keyId));

    res.json({ success: true });
  } catch (error) {
    logger.error("Revoke key error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to revoke key" });
  }
});

// ============================================
// AUTH VERIFICATION (called by CLI/MCP)
// ============================================

router.get("/auth/me", async (req, res) => {
  // This is handled by apiKeyAuth middleware for public routes
  // For internal, we just verify the key exists
  res.json({ authenticated: true });
});

// ============================================
// TIMELINE + TIME MACHINE (called by website)
// ============================================

const timelineQuerySchema = z.object({
  userId: z.string().min(1),
  project: z.string().min(1).optional(),
  type: z.enum(["checkpoint", "restore", "sync", "project_init"]).optional(),
  action: z.string().min(1).optional(),
  scopeType: z.enum(["project", "folder", "file"]).default("project"),
  scopePath: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const previewSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().min(1),
  toCheckpointId: z.string().min(1),
  fromCheckpointId: z.string().min(1).optional(),
  scopeType: z.enum(["project", "folder", "file"]).default("project"),
  scopePath: z.string().optional(),
  limit: z.number().int().positive().max(500).default(200),
});

const internalRestoreSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().min(1),
  checkpointId: z.string().min(1),
  scopeType: z.enum(["project", "folder", "file"]).default("project"),
  scopePath: z.string().optional(),
  includeContext: z.boolean().default(true),
  messageLimit: z.number().int().positive().max(200).default(50),
  source: z.string().default("dashboard"),
  reason: z.string().max(500).optional(),
});

interface ManifestFile {
  path: string;
  [key: string]: unknown;
}

function parseManifest(content: string | null | undefined): { files?: ManifestFile[] } {
  if (!content) return {};

  try {
    return JSON.parse(content);
  } catch {
    // Some legacy manifests are stored as base64-encoded JSON.
  }

  try {
    const decoded = Buffer.from(content, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

function filterFilesByScope(
  files: ManifestFile[],
  scopeType: "project" | "folder" | "file",
  scopePath?: string
): ManifestFile[] {
  if (scopeType === "project") return files;
  if (!scopePath) return [];
  if (scopeType === "file") return files.filter((f) => f.path === scopePath);

  const normalized = scopePath.endsWith("/") ? scopePath : `${scopePath}/`;
  return files.filter(
    (f) => typeof f.path === "string" && (f.path === scopePath || f.path.startsWith(normalized))
  );
}

function summarizeDiffRows(rows: Array<{ stats: unknown }>) {
  return rows.reduce(
    (acc, row) => {
      const st = (row.stats || {}) as Record<string, unknown>;
      acc.added += Number(st.added || 0);
      acc.removed += Number(st.removed || 0);
      acc.modified += Number(st.modified || 0);
      return acc;
    },
    { added: 0, removed: 0, modified: 0 }
  );
}

router.get("/timeline", async (req, res) => {
  try {
    const query = timelineQuerySchema.parse(req.query);

    const projectConditions: (SQL | undefined)[] = [eq(schema.projects.userId, query.userId)];
    if (query.project) {
      projectConditions.push(or(eq(schema.projects.id, query.project), eq(schema.projects.name, query.project)));
    }

    const projects = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(...projectConditions));

    if (projects.length === 0) {
      return res.json({ events: [], hasMore: false, total: 0 });
    }

    const projectIds = projects.map((p) => p.id);
    const projectById = new Map(projects.map((p) => [p.id, p.name]));

    const checkpointConditions: (SQL | undefined)[] = [
      eq(schema.checkpoints.userId, query.userId),
      inArray(schema.checkpoints.projectId, projectIds),
    ];

    if (query.from) checkpointConditions.push(gte(schema.checkpoints.createdAt, new Date(query.from)));
    if (query.to) checkpointConditions.push(lte(schema.checkpoints.createdAt, new Date(query.to)));

    let scopedCheckpointIds: string[] = [];
    if (query.scopeType !== "project") {
      if (!query.scopePath) {
        return res.status(400).json({ error: "scopePath is required for folder/file scope" });
      }
      const normalized = query.scopePath.endsWith("/") ? query.scopePath : `${query.scopePath}/`;
      const pathCond = query.scopeType === "file"
        ? eq(schema.checkpointFiles.filePath, query.scopePath)
        : or(eq(schema.checkpointFiles.filePath, query.scopePath), like(schema.checkpointFiles.filePath, `${normalized}%`));
      const fileRows = await db
        .select({ checkpointId: schema.checkpointFiles.checkpointId })
        .from(schema.checkpointFiles)
        .where(pathCond)
        .limit(5000);
      scopedCheckpointIds = fileRows.map((r) => r.checkpointId);
      if (scopedCheckpointIds.length === 0) {
        return res.json({ events: [], hasMore: false, total: 0 });
      }
      checkpointConditions.push(inArray(schema.checkpoints.id, scopedCheckpointIds));
    }

    const checkpointRows = await db
      .select({
        id: schema.checkpoints.id,
        projectId: schema.checkpoints.projectId,
        triggerType: schema.checkpoints.triggerType,
        name: schema.checkpoints.name,
        description: schema.checkpoints.description,
        metadata: schema.checkpoints.metadata,
        createdAt: schema.checkpoints.createdAt,
      })
      .from(schema.checkpoints)
      .where(and(...checkpointConditions))
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(500);

    const restoreConditions: (SQL | undefined)[] = [
      eq(schema.restoreEvents.actorUserId, query.userId),
      inArray(schema.restoreEvents.projectId, projectIds),
    ];
    if (query.from) restoreConditions.push(gte(schema.restoreEvents.createdAt, new Date(query.from)));
    if (query.to) restoreConditions.push(lte(schema.restoreEvents.createdAt, new Date(query.to)));
    if (query.scopeType !== "project") {
      restoreConditions.push(eq(schema.restoreEvents.scopeType, query.scopeType));
      if (query.scopePath) {
        if (query.scopeType === "file") {
          restoreConditions.push(eq(schema.restoreEvents.scopePath, query.scopePath));
        } else {
          const normalized = query.scopePath.endsWith("/") ? query.scopePath : `${query.scopePath}/`;
          restoreConditions.push(
            or(
              eq(schema.restoreEvents.scopePath, query.scopePath),
              like(schema.restoreEvents.scopePath, `${normalized}%`)
            )
          );
        }
      }
    }

    const restoreRows = await db
      .select({
        id: schema.restoreEvents.id,
        projectId: schema.restoreEvents.projectId,
        toCheckpointId: schema.restoreEvents.toCheckpointId,
        scopeType: schema.restoreEvents.scopeType,
        scopePath: schema.restoreEvents.scopePath,
        createdAt: schema.restoreEvents.createdAt,
      })
      .from(schema.restoreEvents)
      .where(and(...restoreConditions))
      .orderBy(desc(schema.restoreEvents.createdAt))
      .limit(300);

    const checkpointEvents = checkpointRows.map((row) => {
      const action = (row.metadata as Record<string, unknown> | null)?.action;
      return {
        id: row.id,
        type: row.triggerType === "sync" ? "sync" : "checkpoint",
        project: projectById.get(row.projectId) || null,
        projectId: row.projectId,
        checkpointId: row.id,
        description: row.description || row.name || "Checkpoint created",
        timestamp: row.createdAt?.toISOString() || new Date().toISOString(),
        action: typeof action === "string" ? action : null,
        scopeType: "project",
        scopePath: null,
      };
    });

    const restoreEvents = restoreRows.map((row) => ({
      id: row.id,
      type: "restore",
      project: projectById.get(row.projectId) || null,
      projectId: row.projectId,
      checkpointId: row.toCheckpointId,
      description: row.scopePath
        ? `Restored ${row.scopeType} ${row.scopePath}`
        : `Restored ${row.scopeType}`,
      timestamp: row.createdAt?.toISOString() || new Date().toISOString(),
      action: "restore",
      scopeType: row.scopeType,
      scopePath: row.scopePath,
    }));

    let events = [...checkpointEvents, ...restoreEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (query.type) {
      events = events.filter((e) => e.type === query.type);
    }
    if (query.action) {
      const needle = query.action.toLowerCase();
      events = events.filter((e) => (e.action || "").toLowerCase().includes(needle));
    }

    const total = events.length;
    const page = events.slice(query.offset, query.offset + query.limit);

    return res.json({
      events: page,
      hasMore: query.offset + query.limit < total,
      total,
    });
  } catch (error) {
    logger.error("internal timeline error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid timeline query" });
  }
});

router.post("/time/preview", async (req, res) => {
  try {
    const payload = previewSchema.parse(req.body || {});

    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, payload.projectId), eq(schema.projects.userId, payload.userId)))
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const [toCheckpoint] = await db
      .select({
        id: schema.checkpoints.id,
        parentId: schema.checkpoints.parentId,
        createdAt: schema.checkpoints.createdAt,
      })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, payload.toCheckpointId),
          eq(schema.checkpoints.projectId, payload.projectId),
          eq(schema.checkpoints.userId, payload.userId)
        )
      )
      .limit(1);

    if (!toCheckpoint) {
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    let fromCheckpointId = payload.fromCheckpointId || toCheckpoint.parentId || null;
    if (!fromCheckpointId) {
      const previous = await db
        .select({ id: schema.checkpoints.id })
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.projectId, payload.projectId),
            eq(schema.checkpoints.userId, payload.userId),
            lte(schema.checkpoints.createdAt, toCheckpoint.createdAt || new Date())
          )
        )
        .orderBy(desc(schema.checkpoints.createdAt))
        .limit(2);
      fromCheckpointId = previous.find((r) => r.id !== payload.toCheckpointId)?.id || null;
    }

    if (!fromCheckpointId) {
      return res.status(409).json({ error: "No baseline checkpoint available for preview" });
    }

    const conditions: (SQL | undefined)[] = [
      eq(schema.diffs.fromCheckpointId, fromCheckpointId),
      eq(schema.diffs.toCheckpointId, payload.toCheckpointId),
    ];

    if (payload.scopeType !== "project") {
      if (!payload.scopePath) {
        return res.status(400).json({ error: "scopePath is required for file/folder scope" });
      }
      if (payload.scopeType === "file") {
        conditions.push(eq(schema.diffs.filePath, payload.scopePath));
      } else {
        const normalized = payload.scopePath.endsWith("/") ? payload.scopePath : `${payload.scopePath}/`;
        conditions.push(or(eq(schema.diffs.filePath, payload.scopePath), like(schema.diffs.filePath, `${normalized}%`)));
      }
    }

    const rows = await db
      .select({
        filePath: schema.diffs.filePath,
        diffContent: schema.diffs.diffContent,
        stats: schema.diffs.stats,
      })
      .from(schema.diffs)
      .where(and(...conditions))
      .limit(payload.limit);

    return res.json({
      success: true,
      fromCheckpointId,
      toCheckpointId: payload.toCheckpointId,
      fileCount: rows.length,
      summary: summarizeDiffRows(rows),
      files: rows,
    });
  } catch (error) {
    logger.error("internal time preview error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid time preview request" });
  }
});

router.post("/time/restore", async (req, res) => {
  try {
    const payload = internalRestoreSchema.parse(req.body || {});

    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(and(eq(schema.projects.id, payload.projectId), eq(schema.projects.userId, payload.userId)))
      .limit(1);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const [checkpoint] = await db
      .select()
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, payload.checkpointId),
          eq(schema.checkpoints.projectId, payload.projectId),
          eq(schema.checkpoints.userId, payload.userId)
        )
      )
      .limit(1);
    if (!checkpoint) {
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    const [manifestBlob] = await db
      .select({ content: schema.blobs.content })
      .from(schema.blobs)
      .where(eq(schema.blobs.hash, checkpoint.manifestHash))
      .limit(1);

    const manifest = parseManifest(manifestBlob?.content);
    const allFiles = Array.isArray(manifest.files) ? manifest.files : [];
    const restoredFiles = filterFilesByScope(allFiles, payload.scopeType, payload.scopePath);

    type RestoreMessage = {
      id: string;
      sessionId: string;
      role: string;
      content: string;
      timestamp: Date | null;
    };
    let messages: RestoreMessage[] = [];
    if (payload.includeContext) {
      messages = await db
        .select({
          id: schema.chatMessages.id,
          sessionId: schema.chatMessages.sessionId,
          role: schema.chatMessages.role,
          content: schema.chatMessages.content,
          timestamp: schema.chatMessages.timestamp,
        })
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.projectId, payload.projectId),
            eq(schema.chatMessages.userId, payload.userId),
            lte(schema.chatMessages.timestamp, checkpoint.createdAt || new Date())
          )
        )
        .orderBy(desc(schema.chatMessages.timestamp))
        .limit(payload.messageLimit);

      messages = messages.reverse();
    }

    const [restoreEvent] = await db
      .insert(schema.restoreEvents)
      .values({
        projectId: payload.projectId,
        actorUserId: payload.userId,
        fromCheckpointId: checkpoint.parentId || null,
        toCheckpointId: checkpoint.id,
        scopeType: payload.scopeType,
        scopePath: payload.scopePath || null,
        status: "applied",
        details: {
          source: payload.source,
          reason: payload.reason || null,
          restoredCount: restoredFiles.length,
        },
        createdAt: new Date(),
      })
      .returning({ id: schema.restoreEvents.id });

    return res.json({
      success: true,
      checkpoint: {
        id: checkpoint.id,
        name: checkpoint.name,
        description: checkpoint.description,
        createdAt: checkpoint.createdAt,
      },
      scope: { type: payload.scopeType, path: payload.scopePath || null },
      restoreEventId: restoreEvent.id,
      restoredCount: restoredFiles.length,
      restoredFiles,
      messages,
    });
  } catch (error) {
    logger.error("internal time restore error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid time restore request" });
  }
});

router.get("/context/:checkpointId", async (req, res) => {
  try {
    const { checkpointId } = req.params;
    const userId = String(req.query.userId || "");
    if (!userId) {
      return res.status(400).json({ error: "userId required" });
    }

    const messageLimit = Math.min(Math.max(Number(req.query.messageLimit || 100), 1), 500);
    const toolCallLimit = Math.min(Math.max(Number(req.query.toolCallLimit || 100), 1), 500);
    const contextLimit = Math.min(Math.max(Number(req.query.contextLimit || 20), 1), 100);

    const [checkpoint] = await db
      .select()
      .from(schema.checkpoints)
      .where(and(eq(schema.checkpoints.id, checkpointId), eq(schema.checkpoints.userId, userId)))
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
    logger.error("internal context error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid context request" });
  }
});

// ============================================
// PROJECTS (internal, called by website /api/v1/sessions)
// ============================================

const internalProjectsListSchema = z.object({
  userId: z.string().min(1),
  path: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

/**
 * GET /api/internal/projects
 * List a user's projects enriched with checkpoint counts and the
 * timestamp of their most recent checkpoint. Optionally filter by an
 * exact rootPath (used by the restore "verify project" flow).
 */
router.get("/projects", async (req, res) => {
  try {
    const query = internalProjectsListSchema.parse(req.query);

    const conditions: (SQL | undefined)[] = [
      eq(schema.projects.userId, query.userId),
    ];
    if (query.path) {
      conditions.push(eq(schema.projects.rootPath, query.path));
    }

    const projectRows = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        rootPath: schema.projects.rootPath,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
        lastSyncedAt: schema.projects.lastSyncedAt,
      })
      .from(schema.projects)
      .where(and(...conditions))
      .orderBy(desc(schema.projects.updatedAt))
      .limit(query.limit);

    if (projectRows.length === 0) {
      return res.json({ projects: [] });
    }

    const projectIds = projectRows.map((p) => p.id);

    const stats = await db
      .select({
        projectId: schema.checkpoints.projectId,
        checkpointCount: count(schema.checkpoints.id),
        lastCheckpointAt: max(schema.checkpoints.createdAt),
      })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.userId, query.userId),
          inArray(schema.checkpoints.projectId, projectIds)
        )
      )
      .groupBy(schema.checkpoints.projectId);

    const statsById = new Map(stats.map((s) => [s.projectId, s]));

    const projects = projectRows.map((p) => {
      const stat = statsById.get(p.id);
      return {
        id: p.id,
        name: p.name,
        rootPath: p.rootPath,
        createdAt: p.createdAt?.toISOString() ?? null,
        updatedAt: p.updatedAt?.toISOString() ?? null,
        lastSyncedAt: p.lastSyncedAt?.toISOString() ?? null,
        checkpointCount: Number(stat?.checkpointCount ?? 0),
        lastCheckpointAt: stat?.lastCheckpointAt
          ? new Date(stat.lastCheckpointAt).toISOString()
          : null,
      };
    });

    return res.json({ projects });
  } catch (error) {
    logger.error(
      "internal projects list error",
      error instanceof Error ? error : undefined,
      { details: String(error) }
    );
    return res.status(400).json({ error: "Invalid projects request" });
  }
});

const internalProjectCreateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(200),
  rootPath: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /api/internal/projects
 * Create a new project for the user. Used by the website "Use template"
 * flow to scaffold a real, user-owned project the timeline can target.
 */
router.post("/projects", async (req, res) => {
  try {
    const body = internalProjectCreateSchema.parse(req.body || {});

    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, body.userId))
      .limit(1);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const id = crypto.randomBytes(16).toString("hex");
    const now = new Date();

    const [project] = await db
      .insert(schema.projects)
      .values({
        id,
        userId: body.userId,
        name: body.name,
        rootPath: body.rootPath ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: schema.projects.id,
        name: schema.projects.name,
        rootPath: schema.projects.rootPath,
        createdAt: schema.projects.createdAt,
      });

    return res.status(201).json({
      project: {
        id: project.id,
        name: project.name,
        rootPath: project.rootPath,
        createdAt: project.createdAt?.toISOString() ?? now.toISOString(),
      },
    });
  } catch (error) {
    logger.error(
      "internal project create error",
      error instanceof Error ? error : undefined,
      { details: String(error) }
    );
    return res.status(400).json({ error: "Invalid project create request" });
  }
});

// ============================================
// USER SETTINGS (internal, called by website /api/settings)
// ============================================

const internalSettingsGetSchema = z.object({
  userId: z.string().min(1),
});

const internalSettingsPutSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().max(200).nullable().optional(),
  autoSync: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  weeklySummary: z.boolean().optional(),
  compress: z.boolean().optional(),
  retainDays: z.number().int().min(1).max(3650).optional(),
  timezone: z.string().max(100).optional(),
  notifications: z.record(z.unknown()).optional(),
});

const SETTINGS_DEFAULTS = {
  displayName: null as string | null,
  autoSync: true,
  emailNotifications: false,
  weeklySummary: true,
  compress: true,
  retainDays: 30,
  timezone: "UTC",
  notifications: {} as Record<string, unknown>,
};

router.get("/settings", async (req, res) => {
  try {
    const { userId } = internalSettingsGetSchema.parse(req.query);
    const [row] = await db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId))
      .limit(1);

    if (!row) {
      return res.json(SETTINGS_DEFAULTS);
    }

    return res.json({
      displayName: row.displayName,
      autoSync: row.autoSync,
      emailNotifications: row.emailNotifications,
      weeklySummary: row.weeklySummary,
      compress: row.compress,
      retainDays: row.retainDays,
      timezone: row.timezone,
      notifications: row.notifications ?? {},
    });
  } catch (error) {
    logger.error(
      "internal settings get error",
      error instanceof Error ? error : undefined,
      { details: String(error) }
    );
    return res.status(400).json({ error: "Invalid settings request" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const body = internalSettingsPutSchema.parse(req.body || {});
    const { userId, ...rest } = body;
    const now = new Date();

    // Only persist explicitly provided fields (partial update).
    const updates: Record<string, unknown> = { updatedAt: now };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) updates[key] = value;
    }

    await db
      .insert(schema.userSettings)
      .values({
        userId,
        displayName: rest.displayName ?? SETTINGS_DEFAULTS.displayName,
        autoSync: rest.autoSync ?? SETTINGS_DEFAULTS.autoSync,
        emailNotifications:
          rest.emailNotifications ?? SETTINGS_DEFAULTS.emailNotifications,
        weeklySummary: rest.weeklySummary ?? SETTINGS_DEFAULTS.weeklySummary,
        compress: rest.compress ?? SETTINGS_DEFAULTS.compress,
        retainDays: rest.retainDays ?? SETTINGS_DEFAULTS.retainDays,
        timezone: rest.timezone ?? SETTINGS_DEFAULTS.timezone,
        notifications: rest.notifications ?? SETTINGS_DEFAULTS.notifications,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.userSettings.userId,
        set: updates,
      });

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid settings payload" });
    }
    logger.error(
      "internal settings put error",
      error instanceof Error ? error : undefined,
      { details: String(error) }
    );
    return res.status(500).json({ error: "Failed to save settings" });
  }
});

// ============================================
// CONTACT (internal, called by website /api/contact)
// ============================================

const internalContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  subject: z.string().min(1).max(120),
  message: z.string().min(1).max(5000),
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * POST /api/internal/contact
 * Delivers a contact-form submission to the support inbox via the email
 * service. In environments without RESEND_API_KEY the email service logs to
 * stdout, so this never silently drops a message.
 */
router.post("/contact", async (req, res) => {
  try {
    const body = internalContactSchema.parse(req.body || {});
    const supportInbox = process.env.SUPPORT_EMAIL || "support@gitgram.app";

    const safeName = escapeHtml(body.name);
    const safeEmail = escapeHtml(body.email);
    const safeSubject = escapeHtml(body.subject);
    const safeMessage = escapeHtml(body.message).replace(/\n/g, "<br/>");

    const result = await getEmailService().send({
      to: supportInbox,
      replyTo: body.email,
      subject: `[Contact: ${body.subject}] from ${body.name}`,
      html: `<h2>New contact form submission</h2>
<p><strong>Name:</strong> ${safeName}</p>
<p><strong>Email:</strong> ${safeEmail}</p>
<p><strong>Subject:</strong> ${safeSubject}</p>
<hr/>
<p>${safeMessage}</p>`,
      text: `New contact form submission\n\nName: ${body.name}\nEmail: ${body.email}\nSubject: ${body.subject}\n\n${body.message}`,
    });

    return res.json({ success: true, id: result.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid contact submission" });
    }
    logger.error(
      "internal contact error",
      error instanceof Error ? error : undefined,
      { details: String(error) }
    );
    return res.status(502).json({ error: "Failed to deliver message" });
  }
});

export default router;
