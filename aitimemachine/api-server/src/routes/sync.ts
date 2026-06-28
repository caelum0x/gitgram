import { Router } from "express";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  blobQuotaCheck,
  addStorageUsage,
  formatBytes,
  getStorageUsage,
  recalculateStorageUsage,
  STORAGE_LIMITS,
  QuotaCheckRequest,
} from "../middleware/quotaCheck.js";
import { eq, and, inArray } from "drizzle-orm";
import { triggerWebhooksForUser } from "../services/webhookDelivery.js";
import {
  logAction,
  logCheckpointCreated,
  logProjectCreated,
} from "../services/auditLog.js";
import { buildAndStoreTrees } from "../services/treeService.js";
import type { FileInput } from "../services/treeService.js";
import { checkConsent } from "../services/consent.js";
import { logger } from "../lib/monitoring.js";
import {
  createSyncCheckpoint,
  getSyncStatus,
  pushProjectState,
  pullProjectState,
  listDevices,
  resolveConflict,
  type ConflictResolution,
} from "../services/syncService.js";

const router = Router();

// All sync routes require authentication
router.use(apiKeyAuth);

// ============================================
// PROJECT SYNC
// ============================================

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  rootPath: z.string().optional(),
});

router.post("/projects", async (req: AuthenticatedRequest, res) => {
  try {
    const data = projectSchema.parse(req.body);
    const userId = req.user!.userId;

    // Check if this is a new project or update
    const [existingProject] = await db
      .select({ id: schema.projects.id, userId: schema.projects.userId })
      .from(schema.projects)
      .where(eq(schema.projects.id, data.id))
      .limit(1);

    // If the project exists but belongs to another user, deny the update
    if (existingProject && existingProject.userId !== userId) {
      return res.status(403).json({ error: "Project belongs to another user" });
    }

    const isNewProject = !existingProject;

    await db
      .insert(schema.projects)
      .values({
        id: data.id,
        userId,
        name: data.name,
        rootPath: data.rootPath,
      })
      .onConflictDoUpdate({
        target: schema.projects.id,
        set: {
          name: data.name,
          rootPath: data.rootPath,
          updatedAt: new Date(),
        },
      });

    // Log audit event for new projects
    if (isNewProject) {
      await logProjectCreated(userId, data.id, data.name, req);
    }

    res.json({ success: true, projectId: data.id });
  } catch (error) {
    logger.error("Project sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid project data" });
  }
});

// ============================================
// CHECKPOINT SYNC
// ============================================

const checkpointSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  parentId: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  scope: z.string().optional(),
  manifestHash: z.string(),
  rootTreeHash: z.string().optional(), // Pre-computed tree hash from client
  triggerType: z.string().optional(),
  linkedCheckpointId: z.string().optional(),
  createdAt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  // Flat file list for server-side tree building (if rootTreeHash not provided)
  files: z
    .array(
      z.object({
        path: z.string(),
        hash: z.string(),
        size: z.number(),
        mode: z.number().optional(),
      })
    )
    .optional(),
});

router.post("/checkpoints", async (req: AuthenticatedRequest, res) => {
  try {
    const data = checkpointSchema.parse(req.body);
    const userId = req.user!.userId;

    // Consent gate: operational_capture must be allowed
    const consent = await checkConsent(userId, data.projectId, "operational_capture");
    await logAction(
      userId,
      "consent.checked",
      "consent",
      data.projectId,
      { consentType: "operational_capture", decision: consent, source: "sync.checkpoints" },
      req
    );
    if (!consent.allowed) {
      await logAction(
        userId,
        "capture.denied",
        "checkpoint",
        data.projectId,
        { consentType: "operational_capture", reason: consent.reason, source: "sync.checkpoints" },
        req
      );
      return res.status(403).json({
        error: "Capture blocked by consent policy",
        code: "CONSENT_REQUIRED",
        consentType: "operational_capture",
        reason: consent.reason,
      });
    }

    // Verify project belongs to user
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, data.projectId),
          eq(schema.projects.userId, userId)
        )
      )
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Build tree hierarchy if files are provided and no pre-computed tree hash
    let rootTreeHash = data.rootTreeHash || null;
    if (!rootTreeHash && data.files && data.files.length > 0) {
      try {
        rootTreeHash = await buildAndStoreTrees(data.projectId, data.files as FileInput[]);
      } catch (treeErr) {
        logger.error("Tree build error (non-fatal)", treeErr instanceof Error ? treeErr : undefined, { details: String(treeErr) });
        // Tree building is non-fatal: checkpoint still gets created
      }
    }

    await db
      .insert(schema.checkpoints)
      .values({
        id: data.id,
        projectId: data.projectId,
        userId,
        parentId: data.parentId,
        name: data.name,
        description: data.description,
        scope: data.scope,
        manifestHash: data.manifestHash,
        rootTreeHash,
        triggerType: data.triggerType,
        linkedCheckpointId: data.linkedCheckpointId,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        metadata: data.metadata,
      })
      .onConflictDoNothing();

    // Update project last synced
    await db
      .update(schema.projects)
      .set({ lastSyncedAt: new Date() })
      .where(eq(schema.projects.id, data.projectId));

    // Log audit event
    await logCheckpointCreated(
      userId,
      data.id,
      data.projectId,
      data.name,
      data.triggerType,
      req
    );

    // Trigger checkpoint.created webhook (fire and forget)
    triggerWebhooksForUser(userId, "checkpoint.created", {
      checkpointId: data.id,
      projectId: data.projectId,
      projectName: project.name,
      name: data.name,
      description: data.description,
      triggerType: data.triggerType,
      rootTreeHash,
      createdAt: data.createdAt || new Date().toISOString(),
    }).catch((err) => logger.error("Webhook trigger error", err instanceof Error ? err : undefined, { details: String(err) }));

    res.json({ success: true, checkpointId: data.id, rootTreeHash });
  } catch (error) {
    logger.error("Checkpoint sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid checkpoint data" });
  }
});

// Batch checkpoint sync
router.post("/checkpoints/batch", async (req: AuthenticatedRequest, res) => {
  try {
    const checkpoints = z.array(checkpointSchema).parse(req.body.checkpoints);
    const userId = req.user!.userId;

    // Pre-fetch all user's projects for ownership verification
    const userProjects = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId));
    const userProjectIds = new Set(userProjects.map((p: any) => p.id));

    // Cache consent decisions per project to avoid redundant lookups
    const consentCache = new Map<string, Awaited<ReturnType<typeof checkConsent>>>();

    let synced = 0;
    const syncedCheckpoints: string[] = [];
    const failedCheckpoints: string[] = [];

    for (const data of checkpoints) {
      try {
        // Verify project ownership for each checkpoint
        if (!userProjectIds.has(data.projectId)) {
          failedCheckpoints.push(data.id);
          continue;
        }

        // Consent gate: check once per project (cached)
        let consent = consentCache.get(data.projectId);
        if (!consent) {
          consent = await checkConsent(userId, data.projectId, "operational_capture");
          consentCache.set(data.projectId, consent);
          await logAction(
            userId,
            "consent.checked",
            "consent",
            data.projectId,
            { consentType: "operational_capture", decision: consent, source: "sync.checkpoints.batch" },
            req
          );
        }
        if (!consent.allowed) {
          await logAction(
            userId,
            "capture.denied",
            "checkpoint",
            data.projectId,
            { consentType: "operational_capture", reason: consent.reason, checkpointId: data.id, source: "sync.checkpoints.batch" },
            req
          );
          failedCheckpoints.push(data.id);
          continue;
        }

        // Build trees if files provided
        let rootTreeHash = data.rootTreeHash || null;
        if (!rootTreeHash && data.files && data.files.length > 0) {
          try {
            rootTreeHash = await buildAndStoreTrees(data.projectId, data.files as FileInput[]);
          } catch (treeErr) {
            logger.error("Tree build error in batch (non-fatal)", treeErr instanceof Error ? treeErr : undefined, { details: String(treeErr) });
          }
        }

        await db
          .insert(schema.checkpoints)
          .values({
            id: data.id,
            projectId: data.projectId,
            userId,
            parentId: data.parentId,
            name: data.name,
            description: data.description,
            scope: data.scope,
            manifestHash: data.manifestHash,
            rootTreeHash,
            triggerType: data.triggerType,
            linkedCheckpointId: data.linkedCheckpointId,
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            metadata: data.metadata,
          })
          .onConflictDoNothing();
        synced++;
        syncedCheckpoints.push(data.id);

        // Trigger checkpoint.created for each synced checkpoint
        triggerWebhooksForUser(userId, "checkpoint.created", {
          checkpointId: data.id,
          projectId: data.projectId,
          name: data.name,
          description: data.description,
          triggerType: data.triggerType,
          createdAt: data.createdAt || new Date().toISOString(),
        }).catch((err) => logger.error("Webhook trigger error", err instanceof Error ? err : undefined, { details: String(err) }));
      } catch (e) {
        logger.error("Failed to sync checkpoint", e instanceof Error ? e : undefined, { checkpointId: data.id, details: String(e) });
        failedCheckpoints.push(data.id);
      }
    }

    // Trigger sync.completed or sync.failed based on results
    if (failedCheckpoints.length === 0 && synced > 0) {
      triggerWebhooksForUser(userId, "sync.completed", {
        type: "checkpoints",
        synced,
        total: checkpoints.length,
        checkpointIds: syncedCheckpoints,
      }).catch((err) => logger.error("Webhook trigger error", err instanceof Error ? err : undefined, { details: String(err) }));
    } else if (failedCheckpoints.length > 0) {
      triggerWebhooksForUser(userId, "sync.failed", {
        type: "checkpoints",
        synced,
        failed: failedCheckpoints.length,
        total: checkpoints.length,
        failedCheckpointIds: failedCheckpoints,
      }).catch((err) => logger.error("Webhook trigger error", err instanceof Error ? err : undefined, { details: String(err) }));
    }

    res.json({ success: true, synced, total: checkpoints.length });
  } catch (error) {
    logger.error("Batch checkpoint sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid checkpoint data" });
  }
});

// ============================================
// BLOB SYNC
// ============================================

const blobSchema = z.object({
  hash: z.string(),
  size: z.number(),
  mimeType: z.string().optional(),
  content: z.string(), // Base64 encoded
});

router.post("/blobs", blobQuotaCheck, async (req: QuotaCheckRequest, res) => {
  try {
    const data = blobSchema.parse(req.body);
    const userId = req.user!.userId;

    // Check if blob already exists
    const [existing] = await db
      .select({ hash: schema.blobs.hash })
      .from(schema.blobs)
      .where(eq(schema.blobs.hash, data.hash))
      .limit(1);

    if (existing) {
      // Return quota warning even if blob exists
      const response: Record<string, unknown> = {
        success: true,
        exists: true,
        hash: data.hash,
      };
      if (req.quotaInfo?.warning) {
        response.quotaWarning = req.quotaInfo.warning;
      }
      return res.json(response);
    }

    await db.insert(schema.blobs).values({
      hash: data.hash,
      userId,
      size: data.size,
      mimeType: data.mimeType,
      content: data.content,
      storageType: "inline",
    });

    // Update user's storage usage
    await addStorageUsage(userId, data.size);

    // Include quota info in response
    const response: Record<string, unknown> = {
      success: true,
      exists: false,
      hash: data.hash,
      storageAdded: data.size,
      storageAddedFormatted: formatBytes(data.size),
    };

    if (req.quotaInfo) {
      response.quota = {
        used: req.quotaInfo.used + data.size,
        usedFormatted: formatBytes(req.quotaInfo.used + data.size),
        limit: req.quotaInfo.limit,
        limitFormatted: formatBytes(req.quotaInfo.limit),
        percentage: Math.round(((req.quotaInfo.used + data.size) / req.quotaInfo.limit) * 100),
      };
      if (req.quotaInfo.warning) {
        response.quotaWarning = req.quotaInfo.warning;
      }
    }

    res.json(response);
  } catch (error) {
    logger.error("Blob sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid blob data" });
  }
});

// Check which blobs already exist (for efficient sync) - scoped to user
router.post("/blobs/check", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { hashes } = z.object({ hashes: z.array(z.string()) }).parse(req.body);

    const existing = await db
      .select({ hash: schema.blobs.hash })
      .from(schema.blobs)
      .where(and(inArray(schema.blobs.hash, hashes), eq(schema.blobs.userId, userId)));

    const existingSet = new Set(existing.map((b: any) => b.hash));
    const missing = hashes.filter((h) => !existingSet.has(h));

    res.json({ existing: hashes.filter((h) => existingSet.has(h)), missing });
  } catch (error) {
    logger.error("Blob check error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid request" });
  }
});

// ============================================
// CHAT SESSION SYNC
// ============================================

const sessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  tool: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

router.post("/sessions", async (req: AuthenticatedRequest, res) => {
  try {
    const data = sessionSchema.parse(req.body);
    const userId = req.user!.userId;

    // Consent gate: session capture requires operational_capture
    const consent = await checkConsent(userId, data.projectId, "operational_capture");
    if (!consent.allowed) {
      await logAction(
        userId,
        "capture.denied",
        "session",
        data.projectId,
        { consentType: "operational_capture", reason: consent.reason, source: "sync.sessions" },
        req
      );
      return res.status(403).json({
        error: "Capture blocked by consent policy",
        code: "CONSENT_REQUIRED",
        consentType: "operational_capture",
        reason: consent.reason,
      });
    }

    await db
      .insert(schema.chatSessions)
      .values({
        id: data.id,
        projectId: data.projectId,
        userId,
        tool: data.tool,
        startedAt: data.startedAt ? new Date(data.startedAt) : new Date(),
        endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
        metadata: data.metadata,
      })
      .onConflictDoUpdate({
        target: schema.chatSessions.id,
        set: {
          endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
          metadata: data.metadata,
        },
      });

    res.json({ success: true, sessionId: data.id });
  } catch (error) {
    logger.error("Session sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid session data" });
  }
});

// ============================================
// MESSAGE SYNC
// ============================================

const messageSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string(),
  projectId: z.string(),
  checkpointId: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  contentHash: z.string().optional(),
  isContextInjection: z.boolean().optional(),
  timestamp: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

router.post("/messages", async (req: AuthenticatedRequest, res) => {
  try {
    const data = messageSchema.parse(req.body);
    const userId = req.user!.userId;

    // Consent gate: message capture requires operational_capture
    const consent = await checkConsent(userId, data.projectId, "operational_capture");
    if (!consent.allowed) {
      await logAction(
        userId,
        "capture.denied",
        "session",
        data.projectId,
        { consentType: "operational_capture", reason: consent.reason, source: "sync.messages" },
        req
      );
      return res.status(403).json({
        error: "Capture blocked by consent policy",
        code: "CONSENT_REQUIRED",
        consentType: "operational_capture",
        reason: consent.reason,
      });
    }

    const [inserted] = await db
      .insert(schema.chatMessages)
      .values({
        sessionId: data.sessionId,
        projectId: data.projectId,
        userId,
        checkpointId: data.checkpointId,
        role: data.role,
        content: data.content,
        contentHash: data.contentHash,
        isContextInjection: data.isContextInjection,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        metadata: data.metadata,
      })
      .returning({ id: schema.chatMessages.id });

    res.json({ success: true, messageId: inserted.id });
  } catch (error) {
    logger.error("Message sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid message data" });
  }
});

// Batch message sync
router.post("/messages/batch", async (req: AuthenticatedRequest, res) => {
  try {
    const messages = z.array(messageSchema).parse(req.body.messages);
    const userId = req.user!.userId;

    // Consent gate: cache per-project consent decisions
    const consentCache = new Map<string, Awaited<ReturnType<typeof checkConsent>>>();

    let synced = 0;
    for (const data of messages) {
      try {
        let consent = consentCache.get(data.projectId);
        if (!consent) {
          consent = await checkConsent(userId, data.projectId, "operational_capture");
          consentCache.set(data.projectId, consent);
        }
        if (!consent.allowed) {
          continue; // Skip messages for projects without consent
        }

        await db.insert(schema.chatMessages).values({
          sessionId: data.sessionId,
          projectId: data.projectId,
          userId,
          checkpointId: data.checkpointId,
          role: data.role,
          content: data.content,
          contentHash: data.contentHash,
          isContextInjection: data.isContextInjection,
          timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
          metadata: data.metadata,
        });
        synced++;
      } catch (e) {
        logger.error("Failed to sync message", e instanceof Error ? e : undefined, { details: String(e) });
      }
    }

    res.json({ success: true, synced, total: messages.length });
  } catch (error) {
    logger.error("Batch message sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid message data" });
  }
});

// ============================================
// TOOL CALL SYNC
// ============================================

const toolCallSchema = z.object({
  id: z.string().optional(),
  messageId: z.string().optional(),
  sessionId: z.string(),
  projectId: z.string(),
  checkpointBeforeId: z.string().optional(),
  checkpointAfterId: z.string().optional(),
  toolName: z.string(),
  arguments: z.record(z.unknown()).optional(),
  result: z.record(z.unknown()).optional(),
  success: z.boolean().optional(),
  error: z.string().optional(),
  timestamp: z.string().optional(),
});

router.post("/tool-calls", async (req: AuthenticatedRequest, res) => {
  try {
    const data = toolCallSchema.parse(req.body);
    const userId = req.user!.userId;

    // Consent gate: tool call capture requires operational_capture
    const consent = await checkConsent(userId, data.projectId, "operational_capture");
    if (!consent.allowed) {
      await logAction(
        userId,
        "capture.denied",
        "session",
        data.projectId,
        { consentType: "operational_capture", reason: consent.reason, source: "sync.tool-calls" },
        req
      );
      return res.status(403).json({
        error: "Capture blocked by consent policy",
        code: "CONSENT_REQUIRED",
        consentType: "operational_capture",
        reason: consent.reason,
      });
    }

    const [inserted] = await db
      .insert(schema.toolCalls)
      .values({
        sessionId: data.sessionId,
        projectId: data.projectId,
        userId,
        checkpointBeforeId: data.checkpointBeforeId,
        checkpointAfterId: data.checkpointAfterId,
        toolName: data.toolName,
        arguments: data.arguments,
        result: data.result,
        success: data.success,
        error: data.error,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      })
      .returning({ id: schema.toolCalls.id });

    res.json({ success: true, toolCallId: inserted.id });
  } catch (error) {
    logger.error("Tool call sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid tool call data" });
  }
});

// ============================================
// TERMINAL EVENT SYNC
// ============================================

const terminalEventSchema = z.object({
  id: z.string().optional(),
  sessionId: z.string().optional(),
  projectId: z.string(),
  eventType: z.string(),
  command: z.string().optional(),
  exitCode: z.number().optional(),
  stdoutHash: z.string().optional(),
  stderrHash: z.string().optional(),
  stderrPreview: z.string().optional(),
  cwd: z.string().optional(),
  durationMs: z.number().optional(),
  timestamp: z.string().optional(),
});

router.post("/terminal-events", async (req: AuthenticatedRequest, res) => {
  try {
    const data = terminalEventSchema.parse(req.body);
    const userId = req.user!.userId;

    // Consent gate: terminal event capture requires operational_capture
    const consent = await checkConsent(userId, data.projectId, "operational_capture");
    if (!consent.allowed) {
      await logAction(
        userId,
        "capture.denied",
        "session",
        data.projectId,
        { consentType: "operational_capture", reason: consent.reason, source: "sync.terminal-events" },
        req
      );
      return res.status(403).json({
        error: "Capture blocked by consent policy",
        code: "CONSENT_REQUIRED",
        consentType: "operational_capture",
        reason: consent.reason,
      });
    }

    const [inserted] = await db
      .insert(schema.terminalEvents)
      .values({
        sessionId: data.sessionId,
        projectId: data.projectId,
        userId,
        eventType: data.eventType,
        command: data.command,
        exitCode: data.exitCode,
        stdoutHash: data.stdoutHash,
        stderrHash: data.stderrHash,
        stderrPreview: data.stderrPreview,
        cwd: data.cwd,
        durationMs: data.durationMs,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      })
      .returning({ id: schema.terminalEvents.id });

    res.json({ success: true, eventId: inserted.id });
  } catch (error) {
    logger.error("Terminal event sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid terminal event data" });
  }
});

// ============================================
// GENERIC EVENT SYNC
// ============================================

const eventSchema = z.object({
  projectId: z.string(),
  eventType: z.string(),
  payload: z.record(z.unknown()).optional(),
  timestamp: z.string().optional(),
});

router.post("/events", async (req: AuthenticatedRequest, res) => {
  try {
    const data = eventSchema.parse(req.body);
    const userId = req.user!.userId;

    // Consent gate: event capture requires operational_capture
    const consent = await checkConsent(userId, data.projectId, "operational_capture");
    if (!consent.allowed) {
      await logAction(
        userId,
        "capture.denied",
        "session",
        data.projectId,
        { consentType: "operational_capture", reason: consent.reason, source: "sync.events" },
        req
      );
      return res.status(403).json({
        error: "Capture blocked by consent policy",
        code: "CONSENT_REQUIRED",
        consentType: "operational_capture",
        reason: consent.reason,
      });
    }

    const [inserted] = await db
      .insert(schema.events)
      .values({
        projectId: data.projectId,
        userId,
        eventType: data.eventType,
        payload: data.payload,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      })
      .returning({ id: schema.events.id });

    res.json({ success: true, eventId: inserted.id });
  } catch (error) {
    logger.error("Event sync error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(400).json({ error: "Invalid event data" });
  }
});

// ============================================
// STORAGE QUOTA
// ============================================

/**
 * Get current storage quota and usage
 */
router.get("/quota", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const usage = await getStorageUsage(userId);

    res.json({
      used: usage.used,
      usedFormatted: formatBytes(usage.used),
      limit: usage.limit,
      limitFormatted: formatBytes(usage.limit),
      percentage: Math.round(usage.percentage),
      plan: usage.plan,
      availablePlans: {
        free: {
          limit: STORAGE_LIMITS.free,
          limitFormatted: formatBytes(STORAGE_LIMITS.free),
        },
        pro: {
          limit: STORAGE_LIMITS.pro,
          limitFormatted: formatBytes(STORAGE_LIMITS.pro),
        },
        team: {
          limit: STORAGE_LIMITS.team,
          limitFormatted: formatBytes(STORAGE_LIMITS.team),
        },
      },
    });
  } catch (error) {
    logger.error("Quota fetch error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to fetch quota information" });
  }
});

/**
 * Recalculate storage usage (admin/manual trigger)
 * Useful if storage tracking gets out of sync
 */
router.post("/quota/recalculate", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const newTotal = await recalculateStorageUsage(userId);

    res.json({
      success: true,
      message: "Storage usage recalculated",
      storageUsedBytes: newTotal,
      storageUsedFormatted: formatBytes(newTotal),
    });
  } catch (error) {
    logger.error("Quota recalculation error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to recalculate storage usage" });
  }
});

// ============================================
// MULTI-DEVICE SYNC
// ============================================

const deviceStateSchema = z.object({
  projectPath: z.string().min(1),
  deviceId: z.string().min(1).max(256).default("default"),
  gitHash: z.string().max(128).optional(),
  fileHashes: z.record(z.string(), z.string()).optional(),
  envVarNames: z.array(z.string()).optional(),
  branch: z.string().max(256).optional(),
});

const CONFLICT_RESOLUTIONS = ["keep_local", "keep_remote", "merge"] as const;

const resolveConflictSchema = z.object({
  checkpointId: z.string().min(1),
  resolution: z.enum(CONFLICT_RESOLUTIONS),
});

/**
 * Create a device sync checkpoint (snapshot of local project state).
 */
router.post("/devices/checkpoint", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const parsed = deviceStateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }
    const { projectPath, deviceId, gitHash, fileHashes, envVarNames, branch } = parsed.data;
    const checkpoint = await createSyncCheckpoint(projectPath, userId, deviceId, {
      gitHash,
      fileHashes,
      envVarNames,
      branch,
    });
    res.json({ success: true, checkpoint });
  } catch (error) {
    logger.error("Device sync checkpoint error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to create sync checkpoint" });
  }
});

/**
 * Get sync status for a device relative to all other devices on a project.
 */
router.get("/devices/status", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const projectPath = typeof req.query.projectPath === "string" ? req.query.projectPath : "";
    const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : "default";
    if (!projectPath) {
      return res.status(400).json({ error: "projectPath query parameter is required" });
    }
    const status = await getSyncStatus(projectPath, userId, deviceId);
    res.json({ success: true, status });
  } catch (error) {
    logger.error("Device sync status error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to fetch sync status" });
  }
});

/**
 * Push local project state to the remote sync record.
 */
router.post("/devices/push", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const parsed = deviceStateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }
    const { projectPath, deviceId, gitHash, fileHashes, envVarNames, branch } = parsed.data;
    await pushProjectState(projectPath, userId, deviceId, {
      gitHash,
      fileHashes,
      envVarNames,
      branch,
    });
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Surface conflict errors to the client with a 409
    if (message.toLowerCase().includes("conflict")) {
      return res.status(409).json({ error: message });
    }
    logger.error("Device sync push error", error instanceof Error ? error : undefined, { details: message });
    res.status(500).json({ error: "Failed to push project state" });
  }
});

/**
 * Pull the latest remote project state from any other device.
 */
router.get("/devices/pull", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const projectPath = typeof req.query.projectPath === "string" ? req.query.projectPath : "";
    const deviceId = typeof req.query.deviceId === "string" ? req.query.deviceId : "default";
    if (!projectPath) {
      return res.status(400).json({ error: "projectPath query parameter is required" });
    }
    const state = await pullProjectState(projectPath, userId, deviceId);
    res.json({ success: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("not found") || message.includes("No remote state")) {
      return res.status(404).json({ error: message });
    }
    logger.error("Device sync pull error", error instanceof Error ? error : undefined, { details: message });
    res.status(500).json({ error: "Failed to pull project state" });
  }
});

/**
 * List all devices that have synced (optionally scoped to one project).
 */
router.get("/devices", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const projectPath = typeof req.query.projectPath === "string" ? req.query.projectPath : undefined;
    const devices = await listDevices(userId, projectPath);
    res.json({ success: true, devices });
  } catch (error) {
    logger.error("List devices error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to list devices" });
  }
});

/**
 * Resolve a sync conflict on a checkpoint owned by the requesting user.
 */
router.post("/devices/resolve-conflict", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const parsed = resolveConflictSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }
    const { checkpointId, resolution } = parsed.data;

    // Verify the checkpoint belongs to the requesting user before mutating it
    const [owned] = await db
      .select({ id: schema.checkpoints.id })
      .from(schema.checkpoints)
      .where(and(eq(schema.checkpoints.id, checkpointId), eq(schema.checkpoints.userId, userId)))
      .limit(1);
    if (!owned) {
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    await resolveConflict(checkpointId, resolution as ConflictResolution);
    res.json({ success: true });
  } catch (error) {
    logger.error("Resolve conflict error", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({ error: "Failed to resolve conflict" });
  }
});

export default router;
