import { logger } from "../lib/monitoring.js";
import { processDeleteRequestsWorker } from "./deleteRequestsWorker.js";
import { processRetentionWorker } from "./retentionWorker.js";
import { processGCWorker } from "./gcWorker.js";
import { processQueue as processWebhookQueue } from "./webhookDelivery.js";
import { recoverStuckPaperIndexing } from "../routes/research-papers.js";
import { DATA_CLASSES, DataClass } from "./retention.js";
import { WorkerScheduler, WorkerRunResult } from "./scheduler.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseIntervalMs(value: string | undefined, fallbackMs: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackMs;
  }
  return Math.floor(parsed);
}

function parseDataClass(value: string | undefined): DataClass | undefined {
  if (!value) return undefined;
  return DATA_CLASSES.includes(value as DataClass) ? (value as DataClass) : undefined;
}

// ---------------------------------------------------------------------------
// Legacy interval-based scheduling (kept for backward compat)
// ---------------------------------------------------------------------------

interface LegacyWorkerHandle {
  stop: () => void;
}

function startLegacyWorkers(): LegacyWorkerHandle {
  const deleteEnabled = parseBoolean(process.env.DELETE_WORKER_ENABLED, false);
  const retentionEnabled = parseBoolean(process.env.RETENTION_WORKER_ENABLED, false);

  const webhookEnabled = parseBoolean(process.env.WEBHOOK_WORKER_ENABLED, false);

  const timers: NodeJS.Timeout[] = [];
  let deleteInFlight = false;
  let retentionInFlight = false;
  let webhookInFlight = false;

  const runDeleteWorker = async () => {
    if (!deleteEnabled || deleteInFlight) return;
    deleteInFlight = true;
    try {
      const result = await processDeleteRequestsWorker({
        limit: Math.min(Math.max(Number(process.env.DELETE_WORKER_LIMIT || 50), 1), 500),
        dryRun: parseBoolean(process.env.DELETE_WORKER_DRY_RUN, false),
        userId: process.env.DELETE_WORKER_USER_ID,
      });
      logger.info(
        "delete-request worker cycle complete",
        result as unknown as Record<string, unknown>
      );
    } catch (error) {
      logger.error(
        "delete-request worker cycle failed",
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      deleteInFlight = false;
    }
  };

  const runRetentionWorker = async () => {
    if (!retentionEnabled || retentionInFlight) return;
    retentionInFlight = true;
    try {
      const result = await processRetentionWorker({
        limit: Math.min(Math.max(Number(process.env.RETENTION_WORKER_LIMIT || 100), 1), 1000),
        dryRun: parseBoolean(process.env.RETENTION_WORKER_DRY_RUN, false),
        projectId: process.env.RETENTION_WORKER_PROJECT_ID,
        userId: process.env.RETENTION_WORKER_USER_ID,
        dataClass: parseDataClass(process.env.RETENTION_WORKER_DATA_CLASS),
      });
      logger.info(
        "retention worker cycle complete",
        result as unknown as Record<string, unknown>
      );
    } catch (error) {
      logger.error(
        "retention worker cycle failed",
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      retentionInFlight = false;
    }
  };

  const runWebhookWorker = async () => {
    if (!webhookEnabled || webhookInFlight) return;
    webhookInFlight = true;
    try {
      const processed = await processWebhookQueue();
      logger.info("webhook worker cycle complete", { processed });
    } catch (error) {
      logger.error(
        "webhook worker cycle failed",
        error instanceof Error ? error : new Error(String(error))
      );
    } finally {
      webhookInFlight = false;
    }
  };

  if (deleteEnabled) {
    const intervalMs = parseIntervalMs(process.env.DELETE_WORKER_INTERVAL_MS, 60_000);
    timers.push(setInterval(() => void runDeleteWorker(), intervalMs));
    logger.info("delete-request worker scheduled (legacy)", { intervalMs });
    if (parseBoolean(process.env.DELETE_WORKER_RUN_ON_START, true)) {
      void runDeleteWorker();
    }
  }

  if (retentionEnabled) {
    const intervalMs = parseIntervalMs(process.env.RETENTION_WORKER_INTERVAL_MS, 300_000);
    timers.push(setInterval(() => void runRetentionWorker(), intervalMs));
    logger.info("retention worker scheduled (legacy)", { intervalMs });
    if (parseBoolean(process.env.RETENTION_WORKER_RUN_ON_START, true)) {
      void runRetentionWorker();
    }
  }

  if (webhookEnabled) {
    const intervalMs = parseIntervalMs(process.env.WEBHOOK_WORKER_INTERVAL_MS, 60_000);
    timers.push(setInterval(() => void runWebhookWorker(), intervalMs));
    logger.info("webhook worker scheduled (legacy)", { intervalMs });
    if (parseBoolean(process.env.WEBHOOK_WORKER_RUN_ON_START, true)) {
      void runWebhookWorker();
    }
  }

  return {
    stop: () => {
      for (const timer of timers) clearInterval(timer);
    },
  };
}

// ---------------------------------------------------------------------------
// Managed scheduler (ENABLE_WORKERS=true)
// ---------------------------------------------------------------------------

let _scheduler: WorkerScheduler | null = null;

/** Returns the global WorkerScheduler instance, if active. */
export function getScheduler(): WorkerScheduler | null {
  return _scheduler;
}

function startManagedWorkers(): WorkerScheduler {
  const scheduler = new WorkerScheduler();

  // Retention worker
  const retentionCron = process.env.RETENTION_CRON || "0 3 * * *"; // default: daily 3 AM
  scheduler.register({
    name: "retention",
    cronExpression: retentionCron,
    enabled: parseBoolean(process.env.RETENTION_WORKER_ENABLED, true),
    lockTtlMs: 600_000, // 10 min
    execute: async (): Promise<WorkerRunResult> => {
      const result = await processRetentionWorker({
        limit: Math.min(Math.max(Number(process.env.RETENTION_WORKER_LIMIT || 100), 1), 1000),
        dryRun: parseBoolean(process.env.RETENTION_WORKER_DRY_RUN, false),
        projectId: process.env.RETENTION_WORKER_PROJECT_ID,
        userId: process.env.RETENTION_WORKER_USER_ID,
        dataClass: parseDataClass(process.env.RETENTION_WORKER_DATA_CLASS),
      });
      return {
        success: result.failed === 0,
        itemsProcessed: result.processed,
        error: result.failed > 0 ? `${result.failed} project(s) failed` : undefined,
      };
    },
  });

  // Delete requests worker
  const deleteCron = process.env.DELETE_CRON || "*/5 * * * *"; // default: every 5 min
  scheduler.register({
    name: "delete",
    cronExpression: deleteCron,
    enabled: parseBoolean(process.env.DELETE_WORKER_ENABLED, true),
    lockTtlMs: 300_000, // 5 min
    execute: async (): Promise<WorkerRunResult> => {
      const result = await processDeleteRequestsWorker({
        limit: Math.min(Math.max(Number(process.env.DELETE_WORKER_LIMIT || 50), 1), 500),
        dryRun: parseBoolean(process.env.DELETE_WORKER_DRY_RUN, false),
        userId: process.env.DELETE_WORKER_USER_ID,
      });
      return {
        success: result.failed === 0,
        itemsProcessed: result.processed,
        error: result.failed > 0 ? `${result.failed} request(s) failed` : undefined,
      };
    },
  });

  // Garbage collection worker
  const gcCron = process.env.GC_CRON || "0 4 * * 0"; // default: weekly Sunday 4 AM
  scheduler.register({
    name: "gc",
    cronExpression: gcCron,
    enabled: parseBoolean(process.env.GC_WORKER_ENABLED, true),
    lockTtlMs: 900_000, // 15 min
    execute: async (): Promise<WorkerRunResult> => {
      const result = await processGCWorker({
        limit: Math.min(Math.max(Number(process.env.GC_WORKER_LIMIT || 200), 1), 5000),
        dryRun: parseBoolean(process.env.GC_WORKER_DRY_RUN, false),
        olderThanDays: Math.max(Number(process.env.GC_WORKER_OLDER_THAN_DAYS || 30), 1),
        userId: process.env.GC_WORKER_USER_ID,
      });
      return {
        success: true,
        itemsProcessed: result.orphanedBlobsDeleted + result.staleCheckpointFilesDeleted,
      };
    },
  });

  // Webhook delivery worker — retries pending/retry-due webhook deliveries
  const webhookCron = process.env.WEBHOOK_CRON || "* * * * *"; // default: every minute
  scheduler.register({
    name: "webhook",
    cronExpression: webhookCron,
    enabled: parseBoolean(process.env.WEBHOOK_WORKER_ENABLED, true),
    lockTtlMs: 120_000, // 2 min
    execute: async (): Promise<WorkerRunResult> => {
      const processed = await processWebhookQueue();
      return {
        success: true,
        itemsProcessed: processed,
      };
    },
  });

  // Research-paper indexing recovery — re-processes papers stuck in
  // pending/indexing after a crash so they never strand with null content.
  const paperIndexingCron = process.env.PAPER_INDEXING_CRON || "*/5 * * * *"; // default: every 5 min
  scheduler.register({
    name: "paper-indexing",
    cronExpression: paperIndexingCron,
    enabled: parseBoolean(process.env.PAPER_INDEXING_WORKER_ENABLED, true),
    lockTtlMs: 600_000, // 10 min
    execute: async (): Promise<WorkerRunResult> => {
      const recovered = await recoverStuckPaperIndexing(
        Math.min(Math.max(Number(process.env.PAPER_INDEXING_LIMIT || 25), 1), 200)
      );
      return { success: true, itemsProcessed: recovered };
    },
  });

  _scheduler = scheduler;
  scheduler.start();
  return scheduler;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface BackgroundWorkersHandle {
  stop: () => void;
}

export function startBackgroundWorkers(): BackgroundWorkersHandle {
  const useManagedScheduler = parseBoolean(process.env.ENABLE_WORKERS, false);

  if (useManagedScheduler) {
    logger.info("Starting managed worker scheduler (ENABLE_WORKERS=true)");
    const scheduler = startManagedWorkers();
    return {
      stop: () => {
        scheduler.stop();
        _scheduler = null;
      },
    };
  }

  // Fallback: legacy interval-based workers
  logger.info("Starting legacy background workers");
  const legacy = startLegacyWorkers();
  return { stop: legacy.stop };
}
