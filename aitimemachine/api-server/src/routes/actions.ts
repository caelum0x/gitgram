import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { checkConsent } from "../services/consent.js";
import { logAction } from "../services/auditLog.js";
import { logger } from "../lib/monitoring.js";

const router = Router();
router.use(apiKeyAuth);

const fileEntrySchema = z.object({
  path: z.string().min(1),
  content: z.string().optional(),
  hash: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  mode: z.number().int().optional(),
});

const beforeActionSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  action: z.string().min(1),
  args: z.record(z.unknown()).optional(),
  message: z
    .object({
      role: z.enum(["user", "assistant", "system"]).default("user"),
      content: z.string().min(1),
    })
    .optional(),
  files: z.array(fileEntrySchema).default([]),
  idempotencyKey: z.string().min(1).max(256).optional(),
});

const afterActionSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  action: z.string().min(1),
  actionId: z.string().uuid().optional(),
  beforeCheckpointId: z.string().min(1),
  files: z.array(fileEntrySchema).default([]),
  result: z.record(z.unknown()).optional(),
  success: z.boolean().optional(),
  error: z.string().optional(),
  // Structured test/build outcome for the resulting checkpoint, enabling
  // reliable last-green detection independent of the checkpoint name.
  testsPassed: z.boolean().optional(),
  testStatus: z.enum(["passed", "failed", "unknown", "skipped"]).optional(),
  idempotencyKey: z.string().min(1).max(256).optional(),
});

type AfterActionInput = z.infer<typeof afterActionSchema>;

/**
 * Derive the structured test-status columns for the after-action checkpoint.
 * Prefers an explicit testsPassed/testStatus; otherwise infers from the
 * action's success flag so test-runner actions record a usable green signal.
 */
function resolveAfterActionTestStatus(payload: AfterActionInput): {
  testsPassed: boolean | null;
  testStatus: string | null;
} {
  if (typeof payload.testsPassed === "boolean") {
    return {
      testsPassed: payload.testsPassed,
      testStatus:
        payload.testStatus ?? (payload.testsPassed ? "passed" : "failed"),
    };
  }
  if (payload.testStatus === "passed") {
    return { testsPassed: true, testStatus: "passed" };
  }
  if (payload.testStatus === "failed") {
    return { testsPassed: false, testStatus: "failed" };
  }
  return { testsPassed: null, testStatus: payload.testStatus ?? null };
}

function stableHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function makeManifestBlob(
  stage: "before" | "after",
  action: string,
  sessionId: string,
  files: Array<z.infer<typeof fileEntrySchema>>
): string {
  return JSON.stringify({
    version: 1,
    stage,
    action,
    sessionId,
    files,
    capturedAt: new Date().toISOString(),
  });
}

function parseManifest(content: string | null | undefined): { files?: any[] } {
  if (!content) return {};

  try {
    return JSON.parse(content);
  } catch {
    // fall through
  }

  try {
    const decoded = Buffer.from(content, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

function toFileMap(files: any[]): Map<string, any> {
  const out = new Map<string, any>();
  for (const f of files) {
    if (f && typeof f.path === "string") out.set(f.path, f);
  }
  return out;
}

function computeDiffText(oldFile: any | undefined, newFile: any | undefined): string {
  if (!oldFile && newFile) return `+ ${newFile.path} (added)`;
  if (oldFile && !newFile) return `- ${oldFile.path} (deleted)`;

  const oldContent = oldFile?.content ?? oldFile?.hash ?? "";
  const newContent = newFile?.content ?? newFile?.hash ?? "";
  if (oldContent === newContent) return `= ${newFile?.path || oldFile?.path} (unchanged)`;
  return `~ ${newFile?.path || oldFile?.path} (modified)`;
}

async function ensureProjectOwned(projectId: string, userId: string) {
  const [project] = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return project;
}

async function ensureSession(sessionId: string, projectId: string, userId: string) {
  const [existing] = await db
    .select({ id: schema.chatSessions.id })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.id, sessionId),
        eq(schema.chatSessions.projectId, projectId),
        eq(schema.chatSessions.userId, userId)
      )
    )
    .limit(1);

  if (!existing) {
    await db.insert(schema.chatSessions).values({
      id: sessionId,
      projectId,
      userId,
      tool: "unknown",
      startedAt: new Date(),
    });
  }
}

async function persistManifestBlob(
  userId: string,
  manifestContent: string
): Promise<{ hash: string; size: number }> {
  const hash = crypto.createHash("sha256").update(manifestContent).digest("hex");
  const size = Buffer.byteLength(manifestContent, "utf8");

  await db
    .insert(schema.blobs)
    .values({
      hash,
      userId,
      size,
      mimeType: "application/json",
      content: manifestContent,
      storageType: "inline",
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return { hash, size };
}

router.post("/before", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = beforeActionSchema.parse(req.body);

    const consent = await checkConsent(userId, payload.projectId, "operational_capture");
    await logAction(
      userId,
      "consent.checked",
      "consent",
      payload.projectId,
      { consentType: "operational_capture", decision: consent, source: "actions.before" },
      req
    );
    if (!consent.allowed) {
      await logAction(
        userId,
        "capture.denied",
        "checkpoint",
        payload.projectId,
        { consentType: "operational_capture", reason: consent.reason, source: "actions.before" },
        req
      );
      return res.status(403).json({
        error: "Capture blocked by consent policy",
        code: "CONSENT_REQUIRED",
        consentType: "operational_capture",
        reason: consent.reason,
      });
    }

    const project = await ensureProjectOwned(payload.projectId, userId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    await ensureSession(payload.sessionId, payload.projectId, userId);

    const dedupeBase =
      payload.idempotencyKey ||
      `${payload.projectId}:${payload.sessionId}:${payload.action}:${JSON.stringify(payload.args || {})}`;
    const dedupeHash = stableHash(dedupeBase);
    const checkpointId = `cp_before_${dedupeHash}`;

    const [existingCheckpoint] = await db
      .select({ id: schema.checkpoints.id, createdAt: schema.checkpoints.createdAt })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, checkpointId),
          eq(schema.checkpoints.projectId, payload.projectId),
          eq(schema.checkpoints.userId, userId)
        )
      )
      .limit(1);

    if (existingCheckpoint) {
      const [existingCall] = await db
        .select({ id: schema.toolCalls.id })
        .from(schema.toolCalls)
        .where(
          and(
            eq(schema.toolCalls.projectId, payload.projectId),
            eq(schema.toolCalls.userId, userId),
            eq(schema.toolCalls.checkpointBeforeId, checkpointId),
            eq(schema.toolCalls.toolName, payload.action)
          )
        )
        .orderBy(desc(schema.toolCalls.timestamp))
        .limit(1);

      return res.json({
        success: true,
        idempotent: true,
        actionId: existingCall?.id ?? null,
        checkpointBeforeId: checkpointId,
      });
    }

    if (payload.message) {
      await db.insert(schema.chatMessages).values({
        sessionId: payload.sessionId,
        projectId: payload.projectId,
        userId,
        role: payload.message.role,
        content: payload.message.content,
        timestamp: new Date(),
      });
    }

    const manifest = makeManifestBlob("before", payload.action, payload.sessionId, payload.files);
    const { hash: manifestHash } = await persistManifestBlob(userId, manifest);

    await db.insert(schema.checkpoints).values({
      id: checkpointId,
      projectId: payload.projectId,
      userId,
      name: `Before ${payload.action}`,
      description: `Before action ${payload.action}`,
      scope: "files+chat",
      manifestHash,
      triggerType: "before_action",
      metadata: {
        action: payload.action,
        args: payload.args || {},
        idempotencyKey: payload.idempotencyKey || null,
      },
      createdAt: new Date(),
    });

    const [toolCall] = await db
      .insert(schema.toolCalls)
      .values({
        sessionId: payload.sessionId,
        projectId: payload.projectId,
        userId,
        checkpointBeforeId: checkpointId,
        toolName: payload.action,
        arguments: payload.args || {},
        success: null,
        timestamp: new Date(),
      })
      .returning({ id: schema.toolCalls.id });

    return res.json({
      success: true,
      idempotent: false,
      actionId: toolCall?.id ?? null,
      checkpointBeforeId: checkpointId,
      manifestHash,
    });
  } catch (error) {
    logger.error("before action error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid before action payload" });
  }
});

router.post("/after", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const payload = afterActionSchema.parse(req.body);

    const consent = await checkConsent(userId, payload.projectId, "operational_capture");
    await logAction(
      userId,
      "consent.checked",
      "consent",
      payload.projectId,
      { consentType: "operational_capture", decision: consent, source: "actions.after" },
      req
    );
    if (!consent.allowed) {
      await logAction(
        userId,
        "capture.denied",
        "checkpoint",
        payload.projectId,
        { consentType: "operational_capture", reason: consent.reason, source: "actions.after" },
        req
      );
      return res.status(403).json({
        error: "Capture blocked by consent policy",
        code: "CONSENT_REQUIRED",
        consentType: "operational_capture",
        reason: consent.reason,
      });
    }

    const project = await ensureProjectOwned(payload.projectId, userId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    await ensureSession(payload.sessionId, payload.projectId, userId);

    const [beforeCheckpoint] = await db
      .select({ id: schema.checkpoints.id, manifestHash: schema.checkpoints.manifestHash })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, payload.beforeCheckpointId),
          eq(schema.checkpoints.projectId, payload.projectId),
          eq(schema.checkpoints.userId, userId)
        )
      )
      .limit(1);

    if (!beforeCheckpoint) {
      return res.status(404).json({ error: "Before checkpoint not found" });
    }

    const dedupeBase =
      payload.idempotencyKey ||
      `${payload.projectId}:${payload.beforeCheckpointId}:${payload.action}:${JSON.stringify(payload.result || {})}`;
    const dedupeHash = stableHash(dedupeBase);
    const checkpointAfterId = `cp_after_${dedupeHash}`;

    const [existingAfter] = await db
      .select({ id: schema.checkpoints.id })
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.id, checkpointAfterId),
          eq(schema.checkpoints.projectId, payload.projectId),
          eq(schema.checkpoints.userId, userId)
        )
      )
      .limit(1);

    if (existingAfter) {
      return res.json({
        success: true,
        idempotent: true,
        checkpointAfterId,
        checkpointBeforeId: payload.beforeCheckpointId,
      });
    }

    const manifest = makeManifestBlob("after", payload.action, payload.sessionId, payload.files);
    const { hash: manifestHash } = await persistManifestBlob(userId, manifest);

    await db.insert(schema.checkpoints).values({
      id: checkpointAfterId,
      projectId: payload.projectId,
      userId,
      parentId: payload.beforeCheckpointId,
      linkedCheckpointId: payload.beforeCheckpointId,
      name: `After ${payload.action}`,
      description: `After action ${payload.action}`,
      scope: "files+chat",
      manifestHash,
      triggerType: "after_action",
      ...resolveAfterActionTestStatus(payload),
      metadata: {
        action: payload.action,
        result: payload.result || null,
        idempotencyKey: payload.idempotencyKey || null,
      },
      createdAt: new Date(),
    });

    // Persist per-file diff records to canonical diffs table.
    const [beforeManifestBlob] = await db
      .select({ content: schema.blobs.content })
      .from(schema.blobs)
      .where(eq(schema.blobs.hash, beforeCheckpoint.manifestHash))
      .limit(1);

    const beforeManifest = parseManifest(beforeManifestBlob?.content);
    const beforeFiles = Array.isArray(beforeManifest.files) ? beforeManifest.files : [];
    const afterFiles = payload.files;
    const beforeMap = toFileMap(beforeFiles);
    const afterMap = toFileMap(afterFiles);
    const allPaths = new Set([...beforeMap.keys(), ...afterMap.keys()]);

    for (const filePath of allPaths) {
      const oldFile = beforeMap.get(filePath);
      const newFile = afterMap.get(filePath);
      const diffText = computeDiffText(oldFile, newFile);
      const stats = {
        added: !oldFile && newFile ? 1 : 0,
        removed: oldFile && !newFile ? 1 : 0,
        modified: oldFile && newFile && (oldFile.content ?? oldFile.hash) !== (newFile.content ?? newFile.hash) ? 1 : 0,
      };

      if (stats.added || stats.removed || stats.modified) {
        await db.insert(schema.diffs).values({
          fromCheckpointId: payload.beforeCheckpointId,
          toCheckpointId: checkpointAfterId,
          filePath,
          diffContent: diffText,
          stats,
          algorithm: "histogram",
          createdAt: new Date(),
        });
      }
    }

    if (payload.actionId) {
      await db
        .update(schema.toolCalls)
        .set({
          checkpointAfterId,
          result: payload.result || null,
          success: payload.success ?? (payload.error ? false : true),
          error: payload.error || null,
          timestamp: new Date(),
        })
        .where(
          and(
            eq(schema.toolCalls.id, payload.actionId),
            eq(schema.toolCalls.projectId, payload.projectId),
            eq(schema.toolCalls.userId, userId)
          )
        );
    } else {
      await db.insert(schema.toolCalls).values({
        sessionId: payload.sessionId,
        projectId: payload.projectId,
        userId,
        checkpointBeforeId: payload.beforeCheckpointId,
        checkpointAfterId,
        toolName: payload.action,
        arguments: {},
        result: payload.result || null,
        success: payload.success ?? (payload.error ? false : true),
        error: payload.error || null,
        timestamp: new Date(),
      });
    }

    return res.json({
      success: true,
      idempotent: false,
      checkpointAfterId,
      checkpointBeforeId: payload.beforeCheckpointId,
      manifestHash,
    });
  } catch (error) {
    logger.error("after action error", error instanceof Error ? error : undefined, { details: String(error) });
    return res.status(400).json({ error: "Invalid after action payload" });
  }
});

export default router;
