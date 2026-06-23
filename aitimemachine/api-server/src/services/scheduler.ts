/**
 * Managed Scheduler for background workers.
 *
 * Provides cron-based scheduling with:
 * - Configurable schedules via env vars (RETENTION_CRON, DELETE_CRON, GC_CRON)
 * - Distributed lock mechanism to prevent concurrent runs
 * - Health reporting (last run time, success/failure, items processed)
 * - Manual trigger support
 */

import { logger } from "../lib/monitoring.js";

// ---------------------------------------------------------------------------
// Cron parsing (minimal, no external dependency)
// ---------------------------------------------------------------------------

interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

function expandField(field: string, min: number, max: number): number[] {
  if (field === "*") {
    return range(min, max);
  }

  const results = new Set<number>();

  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
    const base = stepMatch ? stepMatch[1] : part;

    if (base === "*") {
      for (let i = min; i <= max; i += step) {
        results.add(i);
      }
    } else if (base.includes("-")) {
      const [startStr, endStr] = base.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      for (let i = start; i <= end; i += step) {
        results.add(i);
      }
    } else {
      results.add(parseInt(base, 10));
    }
  }

  return Array.from(results).filter((n) => n >= min && n <= max).sort((a, b) => a - b);
}

function range(min: number, max: number): number[] {
  const r: number[] = [];
  for (let i = min; i <= max; i++) r.push(i);
  return r;
}

export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression "${expression}": expected 5 fields`);
  }

  return {
    minutes: expandField(parts[0], 0, 59),
    hours: expandField(parts[1], 0, 23),
    daysOfMonth: expandField(parts[2], 1, 31),
    months: expandField(parts[3], 1, 12),
    daysOfWeek: expandField(parts[4], 0, 6),
  };
}

export function cronMatches(fields: CronFields, date: Date): boolean {
  return (
    fields.minutes.includes(date.getUTCMinutes()) &&
    fields.hours.includes(date.getUTCHours()) &&
    fields.daysOfMonth.includes(date.getUTCDate()) &&
    fields.months.includes(date.getUTCMonth() + 1) &&
    fields.daysOfWeek.includes(date.getUTCDay())
  );
}

// ---------------------------------------------------------------------------
// Distributed lock (simple in-memory; upgrade to DB/Redis for multi-instance)
// ---------------------------------------------------------------------------

const activeLocks = new Map<string, { acquiredAt: number; expiresAt: number }>();

export interface DistributedLock {
  acquire(name: string, ttlMs: number): boolean;
  release(name: string): void;
  isLocked(name: string): boolean;
}

export const inMemoryLock: DistributedLock = {
  acquire(name: string, ttlMs: number): boolean {
    const existing = activeLocks.get(name);
    if (existing && existing.expiresAt > Date.now()) {
      return false;
    }
    activeLocks.set(name, {
      acquiredAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
    return true;
  },

  release(name: string): void {
    activeLocks.delete(name);
  },

  isLocked(name: string): boolean {
    const existing = activeLocks.get(name);
    if (!existing) return false;
    if (existing.expiresAt <= Date.now()) {
      activeLocks.delete(name);
      return false;
    }
    return true;
  },
};

// ---------------------------------------------------------------------------
// Worker health reporting
// ---------------------------------------------------------------------------

export type WorkerState = "idle" | "running" | "disabled";

export interface WorkerHealthReport {
  name: string;
  state: WorkerState;
  enabled: boolean;
  cronExpression: string;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunSuccess: boolean | null;
  lastRunError: string | null;
  lastRunItemsProcessed: number | null;
  totalRuns: number;
  totalSuccesses: number;
  totalFailures: number;
}

export interface WorkerRunResult {
  success: boolean;
  itemsProcessed: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Scheduled Worker
// ---------------------------------------------------------------------------

export interface WorkerDefinition {
  name: string;
  cronExpression: string;
  enabled: boolean;
  lockTtlMs?: number;
  execute: () => Promise<WorkerRunResult>;
}

export class ScheduledWorker {
  readonly name: string;
  readonly cronExpression: string;
  readonly enabled: boolean;
  private readonly cronFields: CronFields | null;
  private readonly lockTtlMs: number;
  private readonly executeFn: () => Promise<WorkerRunResult>;
  private readonly lock: DistributedLock;

  private _state: WorkerState;
  private _lastRunAt: Date | null = null;
  private _lastRunDurationMs: number | null = null;
  private _lastRunSuccess: boolean | null = null;
  private _lastRunError: string | null = null;
  private _lastRunItemsProcessed: number | null = null;
  private _totalRuns = 0;
  private _totalSuccesses = 0;
  private _totalFailures = 0;

  constructor(def: WorkerDefinition, lock?: DistributedLock) {
    this.name = def.name;
    this.cronExpression = def.cronExpression;
    this.enabled = def.enabled;
    this.lockTtlMs = def.lockTtlMs ?? 300_000; // 5 min default
    this.executeFn = def.execute;
    this.lock = lock ?? inMemoryLock;
    this._state = def.enabled ? "idle" : "disabled";

    try {
      this.cronFields = parseCron(def.cronExpression);
    } catch {
      this.cronFields = null;
      if (def.enabled) {
        logger.warn(`Worker "${def.name}" has invalid cron expression: ${def.cronExpression}`);
      }
    }
  }

  get state(): WorkerState {
    return this._state;
  }

  /** Returns true if the cron expression matches the given date. */
  shouldRunAt(date: Date): boolean {
    if (!this.enabled || !this.cronFields) return false;
    return cronMatches(this.cronFields, date);
  }

  /** Execute the worker job. Returns false if skipped (lock held or disabled). */
  async run(): Promise<WorkerRunResult | null> {
    if (!this.enabled) {
      return null;
    }

    const lockName = `worker:${this.name}`;
    if (!this.lock.acquire(lockName, this.lockTtlMs)) {
      logger.debug(`Worker "${this.name}" skipped: lock held`);
      return null;
    }

    this._state = "running";
    const startedAt = Date.now();

    try {
      const result = await this.executeFn();

      this._lastRunAt = new Date();
      this._lastRunDurationMs = Date.now() - startedAt;
      this._lastRunSuccess = result.success;
      this._lastRunError = result.error ?? null;
      this._lastRunItemsProcessed = result.itemsProcessed;
      this._totalRuns++;

      if (result.success) {
        this._totalSuccesses++;
        logger.info(`Worker "${this.name}" completed`, {
          durationMs: this._lastRunDurationMs,
          itemsProcessed: result.itemsProcessed,
        });
      } else {
        this._totalFailures++;
        logger.warn(`Worker "${this.name}" finished with error`, {
          durationMs: this._lastRunDurationMs,
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this._lastRunAt = new Date();
      this._lastRunDurationMs = durationMs;
      this._lastRunSuccess = false;
      this._lastRunError = errorMessage;
      this._lastRunItemsProcessed = 0;
      this._totalRuns++;
      this._totalFailures++;

      logger.error(
        `Worker "${this.name}" threw an exception`,
        error instanceof Error ? error : new Error(errorMessage),
        { durationMs }
      );

      return { success: false, itemsProcessed: 0, error: errorMessage };
    } finally {
      this._state = this.enabled ? "idle" : "disabled";
      this.lock.release(lockName);
    }
  }

  getHealth(): WorkerHealthReport {
    return {
      name: this.name,
      state: this._state,
      enabled: this.enabled,
      cronExpression: this.cronExpression,
      lastRunAt: this._lastRunAt?.toISOString() ?? null,
      lastRunDurationMs: this._lastRunDurationMs,
      lastRunSuccess: this._lastRunSuccess,
      lastRunError: this._lastRunError,
      lastRunItemsProcessed: this._lastRunItemsProcessed,
      totalRuns: this._totalRuns,
      totalSuccesses: this._totalSuccesses,
      totalFailures: this._totalFailures,
    };
  }
}

// ---------------------------------------------------------------------------
// Worker Scheduler (manages multiple ScheduledWorker instances)
// ---------------------------------------------------------------------------

export class WorkerScheduler {
  private readonly workers = new Map<string, ScheduledWorker>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastTickMinute = -1;
  private readonly lock: DistributedLock;

  constructor(lock?: DistributedLock) {
    this.lock = lock ?? inMemoryLock;
  }

  register(def: WorkerDefinition): ScheduledWorker {
    const worker = new ScheduledWorker(def, this.lock);
    this.workers.set(def.name, worker);
    return worker;
  }

  getWorker(name: string): ScheduledWorker | undefined {
    return this.workers.get(name);
  }

  getAllWorkers(): ScheduledWorker[] {
    return Array.from(this.workers.values());
  }

  getAllHealth(): WorkerHealthReport[] {
    return this.getAllWorkers().map((w) => w.getHealth());
  }

  /** Start the scheduler tick (checks every 30 seconds, fires workers once per matching minute). */
  start(): void {
    if (this.tickTimer) return;

    logger.info("Worker scheduler started", {
      workers: this.getAllWorkers().map((w) => ({
        name: w.name,
        enabled: w.enabled,
        cron: w.cronExpression,
      })),
    });

    this.tickTimer = setInterval(() => {
      void this.tick();
    }, 30_000);

    // Also do an immediate tick
    void this.tick();
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    logger.info("Worker scheduler stopped");
  }

  /** Evaluate cron expressions and run matching workers. */
  async tick(): Promise<void> {
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();

    // Only fire once per calendar minute
    if (currentMinute === this.lastTickMinute) return;
    this.lastTickMinute = currentMinute;

    for (const worker of this.workers.values()) {
      if (worker.shouldRunAt(now)) {
        // Fire and forget; the worker manages its own lock and error handling
        void worker.run();
      }
    }
  }

  /** Manually trigger a worker by name. Returns null if worker not found. */
  async trigger(name: string): Promise<WorkerRunResult | null> {
    const worker = this.workers.get(name);
    if (!worker) return null;

    // Manual triggers bypass the enabled check inside shouldRunAt
    // but we still respect the lock
    return worker.run();
  }
}
