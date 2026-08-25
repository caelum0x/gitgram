import crypto from "node:crypto";
import { Router, type Response } from "express";
import { and, count, countDistinct, desc, eq, gte, min } from "drizzle-orm";
import { z } from "zod";
import { db, schema, transactionDb } from "../db/index.js";
import { logger } from "../lib/monitoring.js";
import { evaluateCoverageFreshness } from "../services/adoptionEvidenceHealth.js";
import {
  adoptionIngestionAuth,
  type AdoptionIngestionRequest,
} from "../middleware/adoptionIngestionAuth.js";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;
const OPAQUE_KEY = /^[0-9a-f]{64}$/;

const coverageBatchSchema = z
  .object({
    collectorVersion: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
    windowStartedAt: z.coerce.date(),
    windowEndedAt: z.coerce.date(),
    repositoriesMeasured: z.number().int().positive().max(1_000_000),
    contributions: z
      .array(
        z.object({
          repositoryKey: z.string().regex(OPAQUE_KEY),
          contributorKey: z.string().regex(OPAQUE_KEY),
          contributorType: z.literal("external"),
          contributionKey: z.string().regex(OPAQUE_KEY),
          openedAt: z.coerce.date(),
          firstMaintainerResponseAt: z.coerce.date().nullable().optional(),
        }).strict()
      )
      .max(5000),
  }).strict()
  .superRefine((batch, context) => {
    if (batch.windowEndedAt <= batch.windowStartedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["windowEndedAt"],
        message: "windowEndedAt must be after windowStartedAt",
      });
    }
    if (batch.windowEndedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["windowEndedAt"],
        message: "windowEndedAt cannot be more than five minutes in the future",
      });
    }
    if (batch.windowEndedAt.getTime() - batch.windowStartedAt.getTime() > 366 * DAY_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["windowStartedAt"],
        message: "coverage window cannot exceed 366 days",
      });
    }

    const repositoryKeys = new Set<string>();
    const contributionKeys = new Set<string>();
    for (const [index, contribution] of batch.contributions.entries()) {
      repositoryKeys.add(contribution.repositoryKey);
      if (contributionKeys.has(contribution.contributionKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["contributions", index, "contributionKey"],
          message: "contributionKey must be unique within a batch",
        });
      }
      contributionKeys.add(contribution.contributionKey);

      if (
        contribution.openedAt < batch.windowStartedAt ||
        contribution.openedAt > batch.windowEndedAt
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["contributions", index, "openedAt"],
          message: "openedAt must fall inside the coverage window",
        });
      }
      if (
        contribution.firstMaintainerResponseAt &&
        contribution.firstMaintainerResponseAt < contribution.openedAt
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["contributions", index, "firstMaintainerResponseAt"],
          message: "firstMaintainerResponseAt cannot precede openedAt",
        });
      }
    }

    if (repositoryKeys.size > batch.repositoriesMeasured) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repositoriesMeasured"],
        message: "repositoriesMeasured cannot be lower than the contributed repository count",
      });
    }
  });

const caseEvidenceSchema = z.object({
  collectorVersion: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  repositoryKey: z.string().regex(OPAQUE_KEY),
  projectId: z.string().min(1).max(255),
  checkpointId: z.string().min(1).max(255),
  restoreEventId: z.string().uuid(),
}).strict();

class IngestionConflict extends Error {}

function requireIdempotencyKey(req: AdoptionIngestionRequest): string {
  const value = req.get("idempotency-key")?.trim() || "";
  if (value.length < 8 || value.length > 128 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new z.ZodError([{
      code: z.ZodIssueCode.custom,
      path: ["Idempotency-Key"],
      message: "Idempotency-Key must contain 8 to 128 visible characters",
    }]);
  }
  return value;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function requestId(res: Response): string {
  return String(res.getHeader("X-Request-Id") || crypto.randomUUID()).slice(0, 128);
}

function coverageRequestHash(batch: z.infer<typeof coverageBatchSchema>): string {
  return sha256(JSON.stringify({
    collectorVersion: batch.collectorVersion,
    windowStartedAt: batch.windowStartedAt.toISOString(),
    windowEndedAt: batch.windowEndedAt.toISOString(),
    repositoriesMeasured: batch.repositoriesMeasured,
    contributions: batch.contributions.map((record) => ({
      repositoryKey: record.repositoryKey,
      contributorKey: record.contributorKey,
      contributorType: record.contributorType,
      contributionKey: record.contributionKey,
      openedAt: record.openedAt.toISOString(),
      firstMaintainerResponseAt: record.firstMaintainerResponseAt?.toISOString() ?? null,
    })),
  }));
}

function caseRequestHash(evidence: z.infer<typeof caseEvidenceSchema>): string {
  return sha256(JSON.stringify({
    collectorVersion: evidence.collectorVersion,
    repositoryKey: evidence.repositoryKey,
    projectId: evidence.projectId,
    checkpointId: evidence.checkpointId,
    restoreEventId: evidence.restoreEventId,
  }));
}

function setReplayHeader(res: Response, replayed: boolean) {
  res.setHeader("Idempotency-Replayed", String(replayed));
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error as { code?: unknown }).code === "23505") return true;
  return "cause" in error && isUniqueViolation((error as { cause?: unknown }).cause);
}

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function windowDays(startsAt: Date, endsAt: Date): number {
  return Math.max(1, Math.ceil((endsAt.getTime() - startsAt.getTime()) / DAY_MS));
}

/**
 * Public aggregate evidence. The response contains no account, repository,
 * project, checkpoint, restore, contributor, or contribution identifiers.
 */
router.get("/summary", async (_req, res: Response) => {
  const generatedAt = new Date();
  const adoptionDays = 30;
  const adoptionStart = new Date(generatedAt.getTime() - adoptionDays * DAY_MS);

  try {
    const [
      [activeDevelopers],
      [lifetimeDevelopers],
      [lifetimeProjects],
      [lifetimeCheckpoints],
      [recentCheckpoints],
      [lifetimeRestores],
      [recentRestores],
      [firstCheckpoint],
      [latestCoverage],
      [caseCounts],
    ] = await Promise.all([
      db
        .select({ value: countDistinct(schema.checkpoints.userId) })
        .from(schema.checkpoints)
        .where(gte(schema.checkpoints.createdAt, adoptionStart)),
      db.select({ value: countDistinct(schema.checkpoints.userId) }).from(schema.checkpoints),
      db.select({ value: count() }).from(schema.projects),
      db.select({ value: count() }).from(schema.checkpoints),
      db
        .select({ value: count() })
        .from(schema.checkpoints)
        .where(gte(schema.checkpoints.createdAt, adoptionStart)),
      db
        .select({ value: count() })
        .from(schema.restoreEvents)
        .where(eq(schema.restoreEvents.status, "applied")),
      db
        .select({ value: count() })
        .from(schema.restoreEvents)
        .where(
          and(
            eq(schema.restoreEvents.status, "applied"),
            gte(schema.restoreEvents.createdAt, adoptionStart)
          )
        ),
      db.select({ value: min(schema.checkpoints.createdAt) }).from(schema.checkpoints),
      db
        .select({
          id: schema.ossCoverageBatches.id,
          startsAt: schema.ossCoverageBatches.windowStartedAt,
          endsAt: schema.ossCoverageBatches.windowEndedAt,
          completedAt: schema.ossCoverageBatches.completedAt,
          repositoriesMeasured: schema.ossCoverageBatches.repositoriesMeasured,
          contributionCount: schema.ossCoverageBatches.contributionCount,
        })
        .from(schema.ossCoverageBatches)
        .where(eq(schema.ossCoverageBatches.status, "completed"))
        .orderBy(
          desc(schema.ossCoverageBatches.windowEndedAt),
          desc(schema.ossCoverageBatches.completedAt)
        )
        .limit(1),
      db
        .select({
          cases: count(),
          repositories: countDistinct(schema.ossCaseEvidence.repositoryKey),
          projects: countDistinct(schema.ossCaseEvidence.projectId),
        })
        .from(schema.ossCaseEvidence),
    ]);

    let ossWindow: {
      startsAt: string | null;
      endsAt: string | null;
      days: number | null;
      status: "measured" | "unmeasured";
    } = { startsAt: null, endsAt: null, days: null, status: "unmeasured" };
    let externalContributors: number | null = null;
    let repeatContributors: number | null = null;
    let contributionsReceived: number | null = null;
    let responsesSent: number | null = null;
    let awaitingResponse: number | null = null;
    let averageFirstResponseHours: number | null = null;
    let repositoriesMeasured: number | null = null;

    if (latestCoverage) {
      const records = await db
        .select({
          contributorKey: schema.ossContributionRecords.contributorKey,
          openedAt: schema.ossContributionRecords.openedAt,
          respondedAt: schema.ossContributionRecords.firstMaintainerResponseAt,
        })
        .from(schema.ossContributionRecords)
        .where(
          and(
            eq(schema.ossContributionRecords.batchId, latestCoverage.id),
            eq(schema.ossContributionRecords.contributorType, "external")
          )
        );

      if (records.length !== latestCoverage.contributionCount) {
        throw new Error("Completed OSS coverage batch record count does not match its receipt");
      }

      const contributorCounts = new Map<string, number>();
      let responseHours = 0;
      responsesSent = 0;
      for (const record of records) {
        contributorCounts.set(
          record.contributorKey,
          (contributorCounts.get(record.contributorKey) ?? 0) + 1
        );
        if (record.respondedAt) {
          responsesSent += 1;
          responseHours +=
            (record.respondedAt.getTime() - record.openedAt.getTime()) / (60 * 60 * 1000);
        }
      }

      ossWindow = {
        startsAt: latestCoverage.startsAt.toISOString(),
        endsAt: latestCoverage.endsAt.toISOString(),
        days: windowDays(latestCoverage.startsAt, latestCoverage.endsAt),
        status: "measured",
      };
      repositoriesMeasured = latestCoverage.repositoriesMeasured;
      externalContributors = contributorCounts.size;
      repeatContributors = [...contributorCounts.values()].filter((value) => value > 1).length;
      contributionsReceived = records.length;
      awaitingResponse = records.length - responsesSent;
      averageFirstResponseHours =
        responsesSent > 0 ? Math.round((responseHours / responsesSent) * 10) / 10 : null;
    }

    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.setHeader("X-Adoption-Evidence-Schema", "2");
    const coverageFreshness = evaluateCoverageFreshness(
      latestCoverage
        ? { windowEndedAt: latestCoverage.endsAt, completedAt: latestCoverage.completedAt }
        : undefined,
      generatedAt
    );
    return res.json({
      schemaVersion: 2,
      status: "measured",
      generatedAt: generatedAt.toISOString(),
      period: {
        days: adoptionDays,
        startsAt: adoptionStart.toISOString(),
        endsAt: generatedAt.toISOString(),
        status: "measured",
      },
      windows: {
        adoption: {
          startsAt: adoptionStart.toISOString(),
          endsAt: generatedAt.toISOString(),
          days: adoptionDays,
          status: "measured",
        },
        oss: ossWindow,
      },
      activeDevelopers: asNumber(activeDevelopers?.value),
      lifetimeDevelopers: asNumber(lifetimeDevelopers?.value),
      projects: asNumber(lifetimeProjects?.value),
      checkpoints: {
        lifetime: asNumber(lifetimeCheckpoints?.value),
        period: asNumber(recentCheckpoints?.value),
      },
      appliedRestores: {
        lifetime: asNumber(lifetimeRestores?.value),
        period: asNumber(recentRestores?.value),
      },
      firstCheckpointAt: firstCheckpoint?.value?.toISOString() ?? null,
      oss: {
        status: ossWindow.status,
        freshness: coverageFreshness,
        repositoriesMeasured,
        externalContributors,
        repeatContributors,
        maintainerResponseLoad: {
          contributionsReceived,
          responsesSent,
          awaitingResponse,
          averageFirstResponseHours,
        },
      },
      caseEvidence: (() => {
        const cases = asNumber(caseCounts?.cases);
        const status = cases > 0 ? "measured" : "unmeasured";
        return {
          status,
          cases: status === "measured" ? cases : null,
          repositoriesCovered:
            status === "measured" ? asNumber(caseCounts?.repositories) : null,
          projectsCovered: status === "measured" ? asNumber(caseCounts?.projects) : null,
        };
      })(),
      methodology: {
        source: "AITimeMachine cloud sync and maintainer evidence database",
        activeDeveloper: "Distinct account with at least one checkpoint in the adoption window",
        externalContributor: "Distinct opaque contributor key in the latest completed OSS coverage batch",
        repeatContributor: "Opaque contributor key with two or more contribution records in that batch",
        maintainerResponse: "First maintainer response time for external contributions opened in that batch",
        caseEvidence: "Applied restore linked to a checkpoint and project after server-side consistency checks; no rows is unmeasured, not zero",
        restore: "Restore event whose status is applied",
        privacy:
          "Aggregate counts only; no account, repository, project, checkpoint, restore, contributor, or contribution identifiers",
      },
    });
  } catch (error) {
    logger.error(
      "Public adoption summary failed",
      error instanceof Error ? error : undefined,
      { details: String(error) }
    );
    return res.status(503).json({
      status: "unavailable",
      error: {
        message: "Adoption evidence is temporarily unavailable",
        type: "service_unavailable",
      },
    });
  }
});

router.post("/oss-coverage/batches", adoptionIngestionAuth, async (req: AdoptionIngestionRequest, res) => {
  let replayFingerprint: { idempotencyKeyHash: string; requestHash: string } | null = null;
  try {
    const idempotencyKeyHash = sha256(requireIdempotencyKey(req));
    const batch = coverageBatchSchema.parse(req.body);
    const requestHash = coverageRequestHash(batch);
    replayFingerprint = { idempotencyKeyHash, requestHash };

    const [existing] = await db
      .select({
        id: schema.ossCoverageBatches.id,
        requestHash: schema.ossCoverageBatches.requestHash,
        status: schema.ossCoverageBatches.status,
        completedAt: schema.ossCoverageBatches.completedAt,
        contributionCount: schema.ossCoverageBatches.contributionCount,
      })
      .from(schema.ossCoverageBatches)
      .where(eq(schema.ossCoverageBatches.idempotencyKeyHash, idempotencyKeyHash))
      .limit(1);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new IngestionConflict("Idempotency-Key was already used with a different coverage batch");
      if (existing.status !== "completed" || !existing.completedAt) throw new IngestionConflict("Coverage batch is not in a replayable state");
      setReplayHeader(res, true);
      return res.status(200).json({
        recorded: true,
        replayed: true,
        batchId: existing.id,
        contributionCount: existing.contributionCount,
        completedAt: existing.completedAt.toISOString(),
      });
    }

    const result = await transactionDb.transaction(async (tx) => {
      const [duplicate] = await tx
        .select({
          id: schema.ossCoverageBatches.id,
          requestHash: schema.ossCoverageBatches.requestHash,
          status: schema.ossCoverageBatches.status,
          completedAt: schema.ossCoverageBatches.completedAt,
          contributionCount: schema.ossCoverageBatches.contributionCount,
        })
        .from(schema.ossCoverageBatches)
        .where(eq(schema.ossCoverageBatches.idempotencyKeyHash, idempotencyKeyHash))
        .limit(1);
      if (duplicate) {
        if (duplicate.requestHash !== requestHash) throw new IngestionConflict("Idempotency-Key was already used with a different coverage batch");
        if (duplicate.status !== "completed" || !duplicate.completedAt) throw new IngestionConflict("Coverage batch is not in a replayable state");
        return { ...duplicate, replayed: true };
      }

      const [createdBatch] = await tx
        .insert(schema.ossCoverageBatches)
        .values({
          idempotencyKeyHash,
          requestHash,
          requestId: requestId(res),
          collectorVersion: batch.collectorVersion,
          collectorKeySlot: req.collectorKeySlot || "current",
          windowStartedAt: batch.windowStartedAt,
          windowEndedAt: batch.windowEndedAt,
          status: "collecting",
          repositoriesMeasured: batch.repositoriesMeasured,
          contributionCount: batch.contributions.length,
        })
        .returning({ id: schema.ossCoverageBatches.id });

      if (batch.contributions.length > 0) {
        await tx.insert(schema.ossContributionRecords).values(
          batch.contributions.map((contribution) => ({
            batchId: createdBatch.id,
            repositoryKey: contribution.repositoryKey,
            contributorKey: contribution.contributorKey,
            contributorType: contribution.contributorType,
            contributionKey: contribution.contributionKey,
            openedAt: contribution.openedAt,
            firstMaintainerResponseAt: contribution.firstMaintainerResponseAt ?? null,
          }))
        );
      }

      const completedAt = new Date();
      await tx
        .update(schema.ossCoverageBatches)
        .set({ status: "completed", completedAt })
        .where(eq(schema.ossCoverageBatches.id, createdBatch.id));

      return {
        id: createdBatch.id,
        contributionCount: batch.contributions.length,
        completedAt,
        replayed: false,
      };
    });

    setReplayHeader(res, result.replayed);
    return res.status(result.replayed ? 200 : 201).json({
      recorded: true,
      replayed: result.replayed,
      batchId: result.id,
      contributionCount: result.contributionCount,
      completedAt: result.completedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid OSS coverage batch", details: error.issues });
    }
    if (error instanceof IngestionConflict) {
      return res.status(409).json({ error: error.message });
    }
    if (isUniqueViolation(error)) {
      if (replayFingerprint) {
        try {
          const [winner] = await db
            .select({
              id: schema.ossCoverageBatches.id,
              requestHash: schema.ossCoverageBatches.requestHash,
              status: schema.ossCoverageBatches.status,
              completedAt: schema.ossCoverageBatches.completedAt,
              contributionCount: schema.ossCoverageBatches.contributionCount,
            })
            .from(schema.ossCoverageBatches)
            .where(eq(schema.ossCoverageBatches.idempotencyKeyHash, replayFingerprint.idempotencyKeyHash))
            .limit(1);
          if (winner?.requestHash === replayFingerprint.requestHash && winner.status === "completed" && winner.completedAt) {
            setReplayHeader(res, true);
            return res.status(200).json({
              recorded: true,
              replayed: true,
              batchId: winner.id,
              contributionCount: winner.contributionCount,
              completedAt: winner.completedAt.toISOString(),
            });
          }
        } catch {
          return res.status(503).json({ error: "Coverage replay could not be resolved" });
        }
      }
      return res.status(409).json({ error: "Concurrent coverage ingestion conflicted; retry with the same Idempotency-Key" });
    }
    logger.error(
      "OSS coverage ingestion failed",
      error instanceof Error ? error : undefined,
      { details: String(error) }
    );
    return res.status(503).json({ error: "OSS coverage batch was not completed" });
  }
});

router.post("/case-evidence", adoptionIngestionAuth, async (req: AdoptionIngestionRequest, res) => {
  let replayFingerprint: { idempotencyKeyHash: string; requestHash: string; restoreEventId: string } | null = null;
  try {
    const idempotencyKeyHash = sha256(requireIdempotencyKey(req));
    const evidence = caseEvidenceSchema.parse(req.body);
    const requestHash = caseRequestHash(evidence);
    replayFingerprint = { idempotencyKeyHash, requestHash, restoreEventId: evidence.restoreEventId };
    const result = await transactionDb.transaction(async (tx) => {
      const [receipt] = await tx
        .select({
          id: schema.ossCaseEvidence.id,
          requestHash: schema.ossCaseEvidence.requestHash,
          recordedAt: schema.ossCaseEvidence.recordedAt,
        })
        .from(schema.ossCaseEvidence)
        .where(eq(schema.ossCaseEvidence.idempotencyKeyHash, idempotencyKeyHash))
        .limit(1);
      if (receipt) {
        if (receipt.requestHash !== requestHash) throw new IngestionConflict("Idempotency-Key was already used with different case evidence");
        return { ...receipt, replayed: true };
      }

      const [[project], [checkpoint], [restore]] = await Promise.all([
        tx
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(eq(schema.projects.id, evidence.projectId))
          .limit(1),
        tx
          .select({ projectId: schema.checkpoints.projectId })
          .from(schema.checkpoints)
          .where(eq(schema.checkpoints.id, evidence.checkpointId))
          .limit(1),
        tx
          .select({
            projectId: schema.restoreEvents.projectId,
            toCheckpointId: schema.restoreEvents.toCheckpointId,
            status: schema.restoreEvents.status,
          })
          .from(schema.restoreEvents)
          .where(eq(schema.restoreEvents.id, evidence.restoreEventId))
          .limit(1),
      ]);

      const linksMatch =
        project &&
        checkpoint &&
        restore &&
        checkpoint.projectId === project.id &&
        restore.projectId === project.id &&
        restore.status === "applied" &&
        restore.toCheckpointId === evidence.checkpointId;

      if (!linksMatch) throw new IngestionConflict("Case evidence links are inconsistent");

      const [sameRestore] = await tx
        .select({
          id: schema.ossCaseEvidence.id,
          requestHash: schema.ossCaseEvidence.requestHash,
          recordedAt: schema.ossCaseEvidence.recordedAt,
        })
        .from(schema.ossCaseEvidence)
        .where(eq(schema.ossCaseEvidence.restoreEventId, evidence.restoreEventId))
        .limit(1);
      if (sameRestore) {
        if (sameRestore.requestHash !== requestHash) throw new IngestionConflict("Restore event already has different case evidence");
        return { ...sameRestore, replayed: true };
      }

      const [created] = await tx
        .insert(schema.ossCaseEvidence)
        .values({
          ...evidence,
          idempotencyKeyHash,
          requestHash,
          requestId: requestId(res),
          collectorKeySlot: req.collectorKeySlot || "current",
        })
        .returning({
          id: schema.ossCaseEvidence.id,
          recordedAt: schema.ossCaseEvidence.recordedAt,
        });
      return { ...created, replayed: false };
    });

    setReplayHeader(res, result.replayed);
    return res.status(result.replayed ? 200 : 201).json({
      recorded: true,
      replayed: result.replayed,
      evidenceId: result.id,
      recordedAt: result.recordedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid case evidence", details: error.issues });
    }
    if (error instanceof IngestionConflict) {
      return res.status(409).json({ error: error.message });
    }
    if (isUniqueViolation(error)) {
      if (replayFingerprint) {
        try {
          const [winner] = await db
            .select({
              id: schema.ossCaseEvidence.id,
              requestHash: schema.ossCaseEvidence.requestHash,
              recordedAt: schema.ossCaseEvidence.recordedAt,
            })
            .from(schema.ossCaseEvidence)
            .where(eq(schema.ossCaseEvidence.restoreEventId, replayFingerprint.restoreEventId))
            .limit(1);
          if (winner?.requestHash === replayFingerprint.requestHash) {
            setReplayHeader(res, true);
            return res.status(200).json({
              recorded: true,
              replayed: true,
              evidenceId: winner.id,
              recordedAt: winner.recordedAt.toISOString(),
            });
          }
        } catch {
          return res.status(503).json({ error: "Case evidence replay could not be resolved" });
        }
      }
      return res.status(409).json({ error: "Concurrent case ingestion conflicted; retry with the same Idempotency-Key" });
    }
    logger.error(
      "OSS case evidence ingestion failed",
      error instanceof Error ? error : undefined,
      { details: String(error) }
    );
    return res.status(503).json({ error: "Case evidence was not recorded" });
  }
});

export default router;
