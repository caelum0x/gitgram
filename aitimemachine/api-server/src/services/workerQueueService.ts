/**
 * workerQueueService.ts
 *
 * In-memory priority job queue for AITimeMachine background processing.
 * Supports pluggable handlers, priority scheduling, and basic observability.
 */

import { logger } from '../lib/monitoring.js';

// ---------------------------------------------------------------------------
// Job type enum
// ---------------------------------------------------------------------------

export enum JobType {
  SESSION_ANALYSIS = 'SESSION_ANALYSIS',
  CHECKPOINT_CLEANUP = 'CHECKPOINT_CLEANUP',
  GITGRAM_SYNC = 'GITGRAM_SYNC',
  S3_BACKUP = 'S3_BACKUP',
  INDEX_KNOWLEDGE = 'INDEX_KNOWLEDGE',
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export type JobState = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';

export interface JobOptions {
  priority?: JobPriority;
  /** Maximum retry attempts on failure (default: 3). */
  maxAttempts?: number;
  /** Delay in milliseconds before the job becomes eligible to run. */
  delayMs?: number;
}

export interface Job<T = unknown> {
  id: string;
  type: JobType;
  data: T;
  priority: JobPriority;
  maxAttempts: number;
  attempts: number;
  state: JobState;
  createdAt: Date;
  eligibleAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
}

export interface JobResult {
  jobId: string;
  type: JobType;
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface JobStatus {
  id: string;
  type: JobType;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
}

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  retrying: number;
  total: number;
  byType: Record<JobType, number>;
}

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const jobStore = new Map<string, Job>();
const handlers = new Map<JobType, JobHandler>();
let workerTimer: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// 1. enqueueJob
// ---------------------------------------------------------------------------

/**
 * Adds a new job to the queue and returns its ID.
 *
 * @param type    - One of the supported JobType values.
 * @param data    - Serialisable payload passed to the handler.
 * @param options - Optional priority, retry count, and delay overrides.
 */
export async function enqueueJob<T = unknown>(
  type: JobType,
  data: T,
  options: JobOptions = {},
): Promise<string> {
  const id = generateId();
  const now = new Date();
  const delayMs = options.delayMs ?? 0;

  const job: Job<T> = {
    id,
    type,
    data,
    priority: options.priority ?? 'normal',
    maxAttempts: options.maxAttempts ?? 3,
    attempts: 0,
    state: 'pending',
    createdAt: now,
    eligibleAt: new Date(now.getTime() + delayMs),
    startedAt: null,
    completedAt: null,
    error: null,
  };

  jobStore.set(id, job as Job);

  logger.info('Job enqueued', { jobId: id, type, priority: job.priority });

  return id;
}

// ---------------------------------------------------------------------------
// 2. registerHandler
// ---------------------------------------------------------------------------

/**
 * Associates a handler function with a job type.
 * The handler is called with the full Job object and must return a Promise.
 * Throw an error inside the handler to mark the job as failed / retrying.
 */
export function registerHandler<T = unknown>(
  type: JobType,
  handler: JobHandler<T>,
): void {
  handlers.set(type, handler as JobHandler);
}

// ---------------------------------------------------------------------------
// 3. processNextJob
// ---------------------------------------------------------------------------

/**
 * Picks the highest-priority eligible pending job, runs its handler, and
 * updates its state. Returns the result or `null` when the queue is empty.
 */
export async function processNextJob(): Promise<JobResult | null> {
  const now = new Date();

  // Collect eligible pending/retrying jobs
  const candidates: Job[] = [];
  for (const job of jobStore.values()) {
    if (
      (job.state === 'pending' || job.state === 'retrying') &&
      job.eligibleAt <= now
    ) {
      candidates.push(job);
    }
  }

  if (candidates.length === 0) return null;

  // Pick highest priority; break ties by oldest createdAt
  candidates.sort((a, b) => {
    const weightDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (weightDiff !== 0) return weightDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const job = candidates[0];

  const handler = handlers.get(job.type);
  if (!handler) {
    // No handler registered — mark failed immediately to avoid blocking the queue
    const updated: Job = {
      ...job,
      state: 'failed',
      error: `No handler registered for job type: ${job.type}`,
      completedAt: new Date(),
    };
    jobStore.set(job.id, updated);
    logger.warn('No handler registered', { jobId: job.id, type: job.type });
    return {
      jobId: job.id,
      type: job.type,
      success: false,
      error: updated.error ?? undefined,
      durationMs: 0,
    };
  }

  const startedAt = new Date();
  const runningJob: Job = {
    ...job,
    state: 'running',
    attempts: job.attempts + 1,
    startedAt,
  };
  jobStore.set(job.id, runningJob);

  try {
    await handler(runningJob);

    const durationMs = Date.now() - startedAt.getTime();
    const completedJob: Job = {
      ...runningJob,
      state: 'completed',
      completedAt: new Date(),
    };
    jobStore.set(job.id, completedJob);

    logger.info('Job completed', { jobId: job.id, type: job.type, durationMs });

    return { jobId: job.id, type: job.type, success: true, durationMs };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt.getTime();
    const hasRetriesLeft = runningJob.attempts < runningJob.maxAttempts;

    const nextState: JobState = hasRetriesLeft ? 'retrying' : 'failed';
    // Exponential back-off: 2^attempt * 1000 ms
    const backoffMs = hasRetriesLeft
      ? Math.pow(2, runningJob.attempts) * 1000
      : 0;

    const failedJob: Job = {
      ...runningJob,
      state: nextState,
      error: errorMessage,
      eligibleAt: hasRetriesLeft
        ? new Date(Date.now() + backoffMs)
        : runningJob.eligibleAt,
      completedAt: hasRetriesLeft ? null : new Date(),
    };
    jobStore.set(job.id, failedJob);

    logger.error(
      'Job failed',
      undefined,
      { jobId: job.id, type: job.type, attempt: runningJob.attempts, errorMessage },
    );

    return { jobId: job.id, type: job.type, success: false, error: errorMessage, durationMs };
  }
}

// ---------------------------------------------------------------------------
// 4. startWorker
// ---------------------------------------------------------------------------

/**
 * Starts a polling loop that calls `processNextJob` at a fixed interval.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param intervalMs - Polling interval in milliseconds (default: 5000).
 */
export function startWorker(intervalMs: number = 5000): void {
  if (workerTimer !== null) return;

  workerTimer = setInterval(() => {
    if (isProcessing) return;
    isProcessing = true;

    processNextJob()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Worker loop error', undefined, { message });
      })
      .finally(() => {
        isProcessing = false;
      });
  }, intervalMs);

  // Avoid keeping the Node.js process alive solely for the worker timer
  if (typeof workerTimer === 'object' && 'unref' in workerTimer) {
    workerTimer.unref();
  }

  logger.info('Worker started', { intervalMs });
}

/**
 * Stops the worker polling loop. Useful for graceful shutdown or testing.
 */
export function stopWorker(): void {
  if (workerTimer !== null) {
    clearInterval(workerTimer);
    workerTimer = null;
    logger.info('Worker stopped');
  }
}

// ---------------------------------------------------------------------------
// 5. getJobStatus
// ---------------------------------------------------------------------------

/**
 * Returns a lightweight status snapshot for a given job ID.
 * Throws if the job cannot be found.
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const job = jobStore.get(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  return {
    id: job.id,
    type: job.type,
    state: job.state,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
  };
}

// ---------------------------------------------------------------------------
// 6. getQueueStats
// ---------------------------------------------------------------------------

/**
 * Returns an aggregate snapshot of the current queue state.
 */
export function getQueueStats(): QueueStats {
  const byType = Object.fromEntries(
    Object.values(JobType).map((t) => [t, 0]),
  ) as Record<JobType, number>;

  const counts: Record<JobState, number> = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    retrying: 0,
  };

  for (const job of jobStore.values()) {
    counts[job.state]++;
    byType[job.type]++;
  }

  return {
    ...counts,
    total: jobStore.size,
    byType,
  };
}
