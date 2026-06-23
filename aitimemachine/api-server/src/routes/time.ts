import { Router } from "express";
import { and, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { logCheckpointRestored } from "../services/auditLog.js";
import { recordRestoreEventAndEmitWebhooks } from "../services/restoreEvents.js";
import { logger } from "../lib/monitoring.js";

const router = Router();
router.use(apiKeyAuth);

const restoreSchema = z.object({
  projectId: z.string().min(1),
  checkpointId: z.string().min(1).optional(),
  restoreTime: z.string().datetime().optional(),
  scopeType: z.enum(["project", "folder", "file"]).default("project"),
  scopePath: z.string().optional(),
  includeContext: z.boolean().default(true),
  messageLimit: z.number().int().positive().max(200).default(50),
});

const undoSchema = z.object({
  projectId: z.string().min(1),
  includeContext: z.boolean().default(true),
  messageLimit: z.number().int().positive().max(200).default(50),
});

const restoreFileSchema = z.object({
  projectId: z.string().min(1),
  checkpointId: z.string().min(1).optional(),
  restoreTime: z.string().datetime().optional(),
  filePath: z.string().min(1),
  includeContext: z.boolean().default(true),
  messageLimit: z.number().int().positive().max(200).default(50),
});

const restoreFolderSchema = z.object({
  projectId: z.string().min(1),
  checkpointId: z.string().min(1).optional(),
  restoreTime: z.string().datetime().optional(),
  folderPath: z.string().min(1),
  includeContext: z.boolean().default(true),
  messageLimit: z.number().int().positive().max(200).default(50),
});

const previewSchema = z.object({
  projectId: z.string().min(1),
  toCheckpointId: z.string().min(1),
  fromCheckpointId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(500).default(200),
});

const diffQuerySchema = z.object({
  projectId: z.string().min(1),
  toCheckpointId: z.string().min(1),
  fromCheckpointId: z.string().min(1).optional(),
  scopeType: z.enum(["project", "folder", "file"]).default("project"),
  scopePath: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

const timelineQuerySchema = z.object({
  projectId: z.string().min(1),
  triggerType: z.enum(["manual", "auto", "before_action", "after_action"]).optional(),
  action: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  scopeType: z.enum(["project", "folder", "file"]).default("project"),
  scopePath: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const restoreEventsQuerySchema = z.object({
  projectId: z.string().min(1),
  scopeType: z.enum(["project", "folder", "file"]).optional(),
  status: z.enum(["requested", "applied", "failed"]).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function parseManifest(content: string | null | undefined): { files?: any[] } {
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
  files: any[],
  scopeType: "project" | "folder" | "file",
  scopePath?: string
) {
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

async function ensureProjectOwned(userId: string, projectId: string) {
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  return project;
}

async function findCheckpointForRestore(
  userId: string,
  projectId: string,
  checkpointId?: string,
  restoreTime?: string
) {
  if (checkpointId) {
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
    return checkpoint || null;
  }

  if (restoreTime) {
    const [checkpoint] = await db
      .select()
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.projectId, projectId),
          eq(schema.checkpoints.userId, userId),
          lte(schema.checkpoints.createdAt, new Date(restoreTime))
        )
      )
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(1);
    return checkpoint || null;
  }

  const [latest] = await db
    .select()
    .from(schema.checkpoints)
    .where(and(eq(schema.checkpoints.projectId, projectId), eq(schema.checkpoints.userId, userId)))
    .orderBy(desc(schema.checkpoints.createdAt))
    .limit(1);
  return latest || null;
}

async function resolveDiffBaseCheckpoint(
  userId: string,
  projectId: string,
  toCheckpointId: string,
  fromCheckpointId?: string
): Promise<{ toCheckpoint: typeof schema.checkpoints.$inferSelect; fromCheckpointId: string | null }> {
  const [toCheckpoint] = await db
    .select()
    .from(schema.checkpoints)
    .where(
      and(
        eq(schema.checkpoints.id, toCheckpointId),
        eq(schema.checkpoints.projectId, projectId),
        eq(schema.checkpoints.userId, userId)
      )
    )
    .limit(1);

  if (!toCheckpoint) {
    throw new Error("target_checkpoint_not_found");
  }

  let resolvedFrom = fromCheckpointId || toCheckpoint.parentId || undefined;

  if (fromCheckpointId) {
    const [fromCheckpoint] = await db
      .select({ id: schema.checkpoints.id })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, fromCheckpointId),
          eq(schema.checkpoints.projectId, projectId),
          eq(schema.checkpoints.userId, userId)
        )
      )
      .limit(1);

    if (!fromCheckpoint) {
      throw new Error("from_checkpoint_not_found");
    }
  }

  if (!resolvedFrom) {
    const previousRows = await db
      .select({ id: schema.checkpoints.id })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.projectId, projectId),
          eq(schema.checkpoints.userId, userId),
          lte(schema.checkpoints.createdAt, toCheckpoint.createdAt || new Date())
        )
      )
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(2);

    resolvedFrom =
      previousRows.find((r: any) => r.id !== toCheckpointId)?.id || previousRows[0]?.id;
  }

  return { toCheckpoint, fromCheckpointId: resolvedFrom || null };
}

async function buildRestoreResponse(
  userId: string,
  payload: z.infer<typeof restoreSchema>,
  req: AuthenticatedRequest,
  options: { fromCheckpointId?: string | null; source?: string } = {}
) {
  const project = await ensureProjectOwned(userId, payload.projectId);

  if (!project) {
    return { status: 404, body: { error: "Project not found" } };
  }

  const checkpoint = await findCheckpointForRestore(
    userId,
    payload.projectId,
    payload.checkpointId,
    payload.restoreTime
  );

  if (!checkpoint) {
    return { status: 404, body: { error: "Checkpoint not found" } };
  }

  const [manifestBlob] = await db
    .select({ content: schema.blobs.content })
    .from(schema.blobs)
    .where(eq(schema.blobs.hash, checkpoint.manifestHash))
    .limit(1);

  const manifest = parseManifest(manifestBlob?.content);
  const allFiles = Array.isArray(manifest.files) ? manifest.files : [];
  const restoredFiles = filterFilesByScope(
    allFiles,
    payload.scopeType,
    payload.scopePath
  );

  let messages: any[] = [];
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
          eq(schema.chatMessages.userId, userId),
          lte(schema.chatMessages.timestamp, checkpoint.createdAt || new Date())
        )
      )
      .orderBy(desc(schema.chatMessages.timestamp))
      .limit(payload.messageLimit);

    messages = messages.reverse();
  }

  await logCheckpointRestored(userId, checkpoint.id, payload.projectId, req);
  const restoreEvent = await recordRestoreEventAndEmitWebhooks({
    userId,
    projectId: payload.projectId,
    fromCheckpointId: options.fromCheckpointId || null,
    toCheckpointId: checkpoint.id,
    scopeType: payload.scopeType,
    scopePath: payload.scopePath || null,
    status: "applied",
    source: options.source || "restore",
    details: {
      includeContext: payload.includeContext,
      messageLimit: payload.messageLimit,
    },
  });

  return {
    status: 200,
    body: {
      success: true,
      checkpoint: {
        id: checkpoint.id,
        name: checkpoint.name,
        description: checkpoint.description,
        createdAt: checkpoint.createdAt,
        triggerType: checkpoint.triggerType,
      },
      scope: {
        type: payload.scopeType,
        path: payload.scopePath || null,
      },
      restoreEventId: restoreEvent.id,
      restoredCount: restoredFiles.length,
      restoredFiles,
      messages,
    },
  };
}

router.post("/restore", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = restoreSchema.parse(req.body);
    const result = await buildRestoreResponse(userId, payload, req, {
      fromCheckpointId: null,
      source: "restore",
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error("time restore error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid restore request" });
  }
});

router.post("/restore-file", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = restoreFileSchema.parse(req.body);

    const result = await buildRestoreResponse(
      userId,
      restoreSchema.parse({
        projectId: payload.projectId,
        checkpointId: payload.checkpointId,
        restoreTime: payload.restoreTime,
        scopeType: "file",
        scopePath: payload.filePath,
        includeContext: payload.includeContext,
        messageLimit: payload.messageLimit,
      }),
      req,
      { fromCheckpointId: null, source: "restore_file" }
    );

    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error("time restore-file error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid restore-file request" });
  }
});

router.post("/restore-folder", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = restoreFolderSchema.parse(req.body);

    const result = await buildRestoreResponse(
      userId,
      restoreSchema.parse({
        projectId: payload.projectId,
        checkpointId: payload.checkpointId,
        restoreTime: payload.restoreTime,
        scopeType: "folder",
        scopePath: payload.folderPath,
        includeContext: payload.includeContext,
        messageLimit: payload.messageLimit,
      }),
      req,
      { fromCheckpointId: null, source: "restore_folder" }
    );

    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error("time restore-folder error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid restore-folder request" });
  }
});

router.post("/undo", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = undoSchema.parse(req.body);

    const [lastAfter] = await db
      .select()
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.projectId, payload.projectId),
          eq(schema.checkpoints.userId, userId),
          eq(schema.checkpoints.triggerType, "after_action")
        )
      )
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(1);

    if (!lastAfter) {
      return res.status(404).json({ error: "No after_action checkpoint found" });
    }

    if (!lastAfter.linkedCheckpointId) {
      return res.status(409).json({ error: "Cannot undo: no linked before checkpoint" });
    }

    const restorePayload = {
      projectId: payload.projectId,
      checkpointId: lastAfter.linkedCheckpointId,
      scopeType: "project",
      includeContext: payload.includeContext,
      messageLimit: payload.messageLimit,
    };

    const result = await buildRestoreResponse(
      userId,
      restoreSchema.parse(restorePayload),
      req,
      { fromCheckpointId: lastAfter.id, source: "undo" }
    );

    return res.status(result.status).json({
      ...result.body,
      undoFromCheckpointId: lastAfter.id,
      undoToCheckpointId: lastAfter.linkedCheckpointId,
    });
  } catch (error) {
    logger.error("time undo error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid undo request" });
  }
});

router.post("/preview", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = previewSchema.parse(req.body);

    const { fromCheckpointId } = await resolveDiffBaseCheckpoint(
      userId,
      payload.projectId,
      payload.toCheckpointId,
      payload.fromCheckpointId
    );

    if (!fromCheckpointId) {
      return res.status(409).json({ error: "No baseline checkpoint available for preview" });
    }

    const rows = await db
      .select({
        filePath: schema.diffs.filePath,
        diffContent: schema.diffs.diffContent,
        stats: schema.diffs.stats,
      })
      .from(schema.diffs)
      .where(
        and(
          eq(schema.diffs.fromCheckpointId, fromCheckpointId),
          eq(schema.diffs.toCheckpointId, payload.toCheckpointId)
        )
      )
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
    logger.error("time preview error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid preview request" });
  }
});

// ============================================
// ENHANCED RESTORE PREVIEW (detailed preview without executing)
// ============================================

const restorePreviewSchema = z.object({
  projectId: z.string().min(1),
  toCheckpointId: z.string().min(1),
  fromCheckpointId: z.string().min(1).optional(),
  scopeType: z.enum(["project", "folder", "file"]).default("project"),
  scopePath: z.string().optional(),
  limit: z.number().int().positive().max(500).default(200),
  includeConversation: z.boolean().default(true),
  messageLimit: z.number().int().positive().max(200).default(50),
});

router.post("/restore-preview", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = restorePreviewSchema.parse(req.body);

    const project = await ensureProjectOwned(userId, payload.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Resolve from/to checkpoints
    const { toCheckpoint, fromCheckpointId } = await resolveDiffBaseCheckpoint(
      userId,
      payload.projectId,
      payload.toCheckpointId,
      payload.fromCheckpointId
    );

    // Get the from checkpoint metadata
    let fromCheckpoint = null;
    if (fromCheckpointId) {
      const [fcp] = await db
        .select()
        .from(schema.checkpoints)
        .where(eq(schema.checkpoints.id, fromCheckpointId))
        .limit(1);
      fromCheckpoint = fcp || null;
    }

    // Get both manifests to compare file trees
    const [toManifestBlob] = await db
      .select({ content: schema.blobs.content })
      .from(schema.blobs)
      .where(eq(schema.blobs.hash, toCheckpoint.manifestHash))
      .limit(1);

    const toManifest = parseManifest(toManifestBlob?.content);
    const toFiles: Array<{ path: string; hash: string; size: number }> = Array.isArray(toManifest.files) ? toManifest.files : [];

    let fromFiles: Array<{ path: string; hash: string; size: number }> = [];
    if (fromCheckpoint?.manifestHash) {
      const [fromManifestBlob] = await db
        .select({ content: schema.blobs.content })
        .from(schema.blobs)
        .where(eq(schema.blobs.hash, fromCheckpoint.manifestHash))
        .limit(1);

      const fromManifest = parseManifest(fromManifestBlob?.content);
      fromFiles = Array.isArray(fromManifest.files) ? fromManifest.files : [];
    }

    // Apply scope filtering
    const scopedToFiles = filterFilesByScope(toFiles, payload.scopeType, payload.scopePath);
    const scopedFromFiles = filterFilesByScope(fromFiles, payload.scopeType, payload.scopePath);

    // Build file maps for comparison
    const toFileMap = new Map(scopedToFiles.map(f => [f.path, f]));
    const fromFileMap = new Map(scopedFromFiles.map(f => [f.path, f]));

    // Categorize files
    const filesToRestore: Array<{ path: string; size: number; status: "added" }> = [];
    const filesToDelete: Array<{ path: string; size: number; status: "deleted" }> = [];
    const filesToModify: Array<{ path: string; size: number; oldSize: number; status: "modified" }> = [];
    const filesUnchanged: Array<{ path: string; size: number; status: "unchanged" }> = [];

    // Files in the target checkpoint
    for (const [filePath, toFile] of toFileMap) {
      const fromFile = fromFileMap.get(filePath);
      if (!fromFile) {
        filesToRestore.push({ path: filePath, size: toFile.size || 0, status: "added" });
      } else if (fromFile.hash !== toFile.hash) {
        filesToModify.push({
          path: filePath,
          size: toFile.size || 0,
          oldSize: fromFile.size || 0,
          status: "modified",
        });
      } else {
        filesUnchanged.push({ path: filePath, size: toFile.size || 0, status: "unchanged" });
      }
    }

    // Files that exist currently but not in target (will be deleted in hard mode)
    for (const [filePath, fromFile] of fromFileMap) {
      if (!toFileMap.has(filePath)) {
        filesToDelete.push({ path: filePath, size: fromFile.size || 0, status: "deleted" });
      }
    }

    // Get diff content for modified files
    const diffConditions: any[] = [];
    if (fromCheckpointId) {
      diffConditions.push(eq(schema.diffs.fromCheckpointId, fromCheckpointId));
      diffConditions.push(eq(schema.diffs.toCheckpointId, payload.toCheckpointId));
    }

    let diffRows: Array<{ filePath: string; diffContent: string | null; stats: unknown }> = [];
    if (diffConditions.length > 0) {
      diffRows = await db
        .select({
          filePath: schema.diffs.filePath,
          diffContent: schema.diffs.diffContent,
          stats: schema.diffs.stats,
        })
        .from(schema.diffs)
        .where(and(...diffConditions))
        .limit(payload.limit);
    }

    const diffMap = new Map(diffRows.map(d => [d.filePath, d]));

    // Build unified file list with diff content
    const allFiles = [
      ...filesToRestore.map(f => ({
        ...f,
        diff: diffMap.get(f.path)?.diffContent || null,
        diffStats: diffMap.get(f.path)?.stats || null,
      })),
      ...filesToDelete.map(f => ({
        ...f,
        diff: diffMap.get(f.path)?.diffContent || null,
        diffStats: diffMap.get(f.path)?.stats || null,
      })),
      ...filesToModify.map(f => ({
        ...f,
        diff: diffMap.get(f.path)?.diffContent || null,
        diffStats: diffMap.get(f.path)?.stats || null,
      })),
      ...filesUnchanged.map(f => ({
        ...f,
        diff: null,
        diffStats: null,
      })),
    ];

    // Disk space impact
    const currentTotalSize = scopedFromFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    const targetTotalSize = scopedToFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    const diskSpaceImpact = targetTotalSize - currentTotalSize;

    // Estimate restore time (rough: ~1ms per file + 500ms overhead)
    const estimatedRestoreMs = Math.max(500, allFiles.length * 1 + 500);

    // Conversation state
    let conversationState = null;
    if (payload.includeConversation) {
      // Messages up to the target checkpoint timestamp
      const targetTimestamp = toCheckpoint.createdAt || new Date();
      const currentTimestamp = fromCheckpoint?.createdAt || new Date();

      const [targetMessages, currentMessages] = await Promise.all([
        db
          .select({
            id: schema.chatMessages.id,
            role: schema.chatMessages.role,
            content: schema.chatMessages.content,
            timestamp: schema.chatMessages.timestamp,
          })
          .from(schema.chatMessages)
          .where(
            and(
              eq(schema.chatMessages.projectId, payload.projectId),
              eq(schema.chatMessages.userId, userId),
              lte(schema.chatMessages.timestamp, targetTimestamp)
            )
          )
          .orderBy(desc(schema.chatMessages.timestamp))
          .limit(payload.messageLimit),
        db
          .select({
            id: schema.chatMessages.id,
            role: schema.chatMessages.role,
            content: schema.chatMessages.content,
            timestamp: schema.chatMessages.timestamp,
          })
          .from(schema.chatMessages)
          .where(
            and(
              eq(schema.chatMessages.projectId, payload.projectId),
              eq(schema.chatMessages.userId, userId),
              lte(schema.chatMessages.timestamp, currentTimestamp)
            )
          )
          .orderBy(desc(schema.chatMessages.timestamp))
          .limit(payload.messageLimit),
      ]);

      conversationState = {
        targetMessageCount: targetMessages.length,
        currentMessageCount: currentMessages.length,
        messagesRestored: targetMessages.reverse(),
        messagesCurrent: currentMessages.reverse(),
      };
    }

    return res.json({
      success: true,
      fromCheckpoint: fromCheckpoint
        ? {
            id: fromCheckpoint.id,
            name: fromCheckpoint.name,
            description: fromCheckpoint.description,
            createdAt: fromCheckpoint.createdAt,
          }
        : null,
      toCheckpoint: {
        id: toCheckpoint.id,
        name: toCheckpoint.name,
        description: toCheckpoint.description,
        createdAt: toCheckpoint.createdAt,
      },
      scope: {
        type: payload.scopeType,
        path: payload.scopePath || null,
      },
      summary: {
        totalFiles: allFiles.length,
        added: filesToRestore.length,
        deleted: filesToDelete.length,
        modified: filesToModify.length,
        unchanged: filesUnchanged.length,
      },
      diskSpaceImpact: {
        currentBytes: currentTotalSize,
        targetBytes: targetTotalSize,
        deltaBytes: diskSpaceImpact,
      },
      estimatedRestoreMs,
      files: allFiles,
      conversation: conversationState,
    });
  } catch (error: any) {
    if (error.message === "target_checkpoint_not_found") {
      return res.status(404).json({ error: "Target checkpoint not found" });
    }
    if (error.message === "from_checkpoint_not_found") {
      return res.status(404).json({ error: "From checkpoint not found" });
    }
    logger.error("time restore-preview error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid restore-preview request" });
  }
});

router.get("/diff", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const query = diffQuerySchema.parse(req.query);

    const project = await ensureProjectOwned(userId, query.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { toCheckpoint, fromCheckpointId } = await resolveDiffBaseCheckpoint(
      userId,
      query.projectId,
      query.toCheckpointId,
      query.fromCheckpointId
    );

    if (!fromCheckpointId) {
      return res.status(409).json({ error: "No baseline checkpoint available for diff" });
    }

    const conditions: any[] = [
      eq(schema.diffs.fromCheckpointId, fromCheckpointId),
      eq(schema.diffs.toCheckpointId, toCheckpoint.id),
    ];

    if (query.scopeType !== "project") {
      if (!query.scopePath) {
        return res.status(400).json({ error: "scopePath is required for file/folder scope" });
      }

      if (query.scopeType === "file") {
        conditions.push(eq(schema.diffs.filePath, query.scopePath));
      } else {
        const normalized = query.scopePath.endsWith("/")
          ? query.scopePath
          : `${query.scopePath}/`;
        conditions.push(
          or(
            eq(schema.diffs.filePath, query.scopePath),
            like(schema.diffs.filePath, `${normalized}%`)
          )
        );
      }
    }

    const rows = await db
      .select({
        filePath: schema.diffs.filePath,
        diffContent: schema.diffs.diffContent,
        stats: schema.diffs.stats,
        algorithm: schema.diffs.algorithm,
        createdAt: schema.diffs.createdAt,
      })
      .from(schema.diffs)
      .where(and(...conditions))
      .orderBy(schema.diffs.filePath)
      .limit(query.limit)
      .offset(query.offset);

    return res.json({
      success: true,
      projectId: query.projectId,
      fromCheckpointId,
      toCheckpointId: query.toCheckpointId,
      scope: {
        type: query.scopeType,
        path: query.scopePath || null,
      },
      pagination: {
        limit: query.limit,
        offset: query.offset,
      },
      fileCount: rows.length,
      summary: summarizeDiffRows(rows),
      files: rows,
    });
  } catch (error) {
    logger.error("time diff error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid diff request" });
  }
});

router.get("/timeline", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const query = timelineQuerySchema.parse(req.query);

    const project = await ensureProjectOwned(userId, query.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const conditions: any[] = [
      eq(schema.checkpoints.projectId, query.projectId),
      eq(schema.checkpoints.userId, userId),
    ];

    if (query.triggerType) {
      conditions.push(eq(schema.checkpoints.triggerType, query.triggerType));
    }
    if (query.from) {
      conditions.push(gte(schema.checkpoints.createdAt, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lte(schema.checkpoints.createdAt, new Date(query.to)));
    }

    let scopedCheckpointIds: string[] | null = null;
    if (query.scopeType !== "project") {
      if (!query.scopePath) {
        return res.status(400).json({ error: "scopePath is required for file/folder scope" });
      }

      const normalized = query.scopePath.endsWith("/")
        ? query.scopePath
        : `${query.scopePath}/`;

      const filePathCondition = query.scopeType === "file"
        ? eq(schema.checkpointFiles.filePath, query.scopePath)
        : or(
          eq(schema.checkpointFiles.filePath, query.scopePath),
          like(schema.checkpointFiles.filePath, `${normalized}%`)
        );

      const fileRows = await db
        .select({ checkpointId: schema.checkpointFiles.checkpointId })
        .from(schema.checkpointFiles)
        .where(filePathCondition)
        .limit(2000);

      const diffPathCondition = query.scopeType === "file"
        ? eq(schema.diffs.filePath, query.scopePath)
        : or(
          eq(schema.diffs.filePath, query.scopePath),
          like(schema.diffs.filePath, `${normalized}%`)
        );

      const diffRows = await db
        .select({ checkpointId: schema.diffs.toCheckpointId })
        .from(schema.diffs)
        .where(diffPathCondition)
        .limit(2000);

      const idSet = new Set<string>();
      for (const row of fileRows) idSet.add(row.checkpointId);
      for (const row of diffRows) idSet.add(row.checkpointId);

      scopedCheckpointIds = Array.from(idSet);

      if (scopedCheckpointIds.length === 0) {
        return res.json({
          success: true,
          items: [],
          pagination: {
            limit: query.limit,
            offset: query.offset,
            hasMore: false,
          },
        });
      }

      conditions.push(inArray(schema.checkpoints.id, scopedCheckpointIds));
    }

    if (query.action) {
      conditions.push(sql`${schema.checkpoints.metadata}->>'action' = ${query.action}`);
    }

    const rows = await db
      .select({
        id: schema.checkpoints.id,
        parentId: schema.checkpoints.parentId,
        linkedCheckpointId: schema.checkpoints.linkedCheckpointId,
        name: schema.checkpoints.name,
        description: schema.checkpoints.description,
        triggerType: schema.checkpoints.triggerType,
        metadata: schema.checkpoints.metadata,
        createdAt: schema.checkpoints.createdAt,
      })
      .from(schema.checkpoints)
      .where(and(...conditions))
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(query.limit + 1)
      .offset(query.offset);

    const hasMore = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);

    const checkpointIds = pageRows.map((r: any) => r.id);
    const diffRows = checkpointIds.length > 0
      ? await db
        .select({
          checkpointId: schema.diffs.toCheckpointId,
          stats: schema.diffs.stats,
          filePath: schema.diffs.filePath,
        })
        .from(schema.diffs)
        .where(inArray(schema.diffs.toCheckpointId, checkpointIds))
      : [];

    const diffByCheckpoint = new Map<string, { fileCount: number; summary: { added: number; removed: number; modified: number } }>();

    for (const row of diffRows) {
      const existing = diffByCheckpoint.get(row.checkpointId) || {
        fileCount: 0,
        summary: { added: 0, removed: 0, modified: 0 },
      };

      existing.fileCount += 1;
      const st = (row.stats || {}) as Record<string, unknown>;
      existing.summary.added += Number(st.added || 0);
      existing.summary.removed += Number(st.removed || 0);
      existing.summary.modified += Number(st.modified || 0);

      diffByCheckpoint.set(row.checkpointId, existing);
    }

    return res.json({
      success: true,
      items: pageRows.map((row: any) => {
        const action = (row.metadata as Record<string, unknown> | null)?.action;
        const diff = diffByCheckpoint.get(row.id) || {
          fileCount: 0,
          summary: { added: 0, removed: 0, modified: 0 },
        };

        return {
          id: row.id,
          parentId: row.parentId,
          linkedCheckpointId: row.linkedCheckpointId,
          name: row.name,
          description: row.description,
          triggerType: row.triggerType,
          action: typeof action === "string" ? action : null,
          createdAt: row.createdAt,
          diff,
        };
      }),
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore,
      },
      filters: {
        triggerType: query.triggerType || null,
        action: query.action || null,
        from: query.from || null,
        to: query.to || null,
        scopeType: query.scopeType,
        scopePath: query.scopePath || null,
      },
    });
  } catch (error) {
    logger.error("time timeline error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid timeline request" });
  }
});

router.get("/restore-events", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const query = restoreEventsQuerySchema.parse(req.query);

    const project = await ensureProjectOwned(userId, query.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const conditions: any[] = [eq(schema.restoreEvents.projectId, query.projectId)];
    if (query.scopeType) {
      conditions.push(eq(schema.restoreEvents.scopeType, query.scopeType));
    }
    if (query.status) {
      conditions.push(eq(schema.restoreEvents.status, query.status));
    }

    const rows = await db
      .select({
        id: schema.restoreEvents.id,
        projectId: schema.restoreEvents.projectId,
        actorUserId: schema.restoreEvents.actorUserId,
        fromCheckpointId: schema.restoreEvents.fromCheckpointId,
        toCheckpointId: schema.restoreEvents.toCheckpointId,
        scopeType: schema.restoreEvents.scopeType,
        scopePath: schema.restoreEvents.scopePath,
        status: schema.restoreEvents.status,
        details: schema.restoreEvents.details,
        createdAt: schema.restoreEvents.createdAt,
      })
      .from(schema.restoreEvents)
      .where(and(...conditions))
      .orderBy(desc(schema.restoreEvents.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    return res.json({
      success: true,
      projectId: query.projectId,
      events: rows,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: rows.length === query.limit,
      },
    });
  } catch (error) {
    logger.error("time restore-events error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid restore-events request" });
  }
});

export default router;
