import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseCron,
  cronMatches,
  inMemoryLock,
  ScheduledWorker,
  WorkerScheduler,
  WorkerRunResult,
} from "../../src/services/scheduler.js";

// ---------------------------------------------------------------------------
// parseCron
// ---------------------------------------------------------------------------

describe("parseCron", () => {
  it("parses a simple every-minute expression", () => {
    const fields = parseCron("* * * * *");
    expect(fields.minutes).toHaveLength(60);
    expect(fields.hours).toHaveLength(24);
    expect(fields.daysOfMonth).toHaveLength(31);
    expect(fields.months).toHaveLength(12);
    expect(fields.daysOfWeek).toHaveLength(7);
  });

  it("parses a specific time expression", () => {
    const fields = parseCron("30 2 * * *");
    expect(fields.minutes).toEqual([30]);
    expect(fields.hours).toEqual([2]);
  });

  it("parses step expressions", () => {
    const fields = parseCron("*/5 * * * *");
    expect(fields.minutes).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it("parses range expressions", () => {
    const fields = parseCron("0 9-17 * * *");
    expect(fields.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it("parses comma-separated values", () => {
    const fields = parseCron("0,15,30,45 * * * *");
    expect(fields.minutes).toEqual([0, 15, 30, 45]);
  });

  it("parses day-of-week", () => {
    const fields = parseCron("0 4 * * 0");
    expect(fields.daysOfWeek).toEqual([0]); // Sunday
  });

  it("throws on invalid expression", () => {
    expect(() => parseCron("bad")).toThrow("Invalid cron expression");
    expect(() => parseCron("* * *")).toThrow("Invalid cron expression");
  });
});

// ---------------------------------------------------------------------------
// cronMatches
// ---------------------------------------------------------------------------

describe("cronMatches", () => {
  it("matches every minute", () => {
    const fields = parseCron("* * * * *");
    expect(cronMatches(fields, new Date("2026-02-16T10:30:00Z"))).toBe(true);
  });

  it("matches specific time", () => {
    const fields = parseCron("30 14 * * *");
    expect(cronMatches(fields, new Date("2026-02-16T14:30:00Z"))).toBe(true);
    expect(cronMatches(fields, new Date("2026-02-16T14:31:00Z"))).toBe(false);
  });

  it("matches step expression", () => {
    const fields = parseCron("*/15 * * * *");
    expect(cronMatches(fields, new Date("2026-02-16T10:00:00Z"))).toBe(true);
    expect(cronMatches(fields, new Date("2026-02-16T10:15:00Z"))).toBe(true);
    expect(cronMatches(fields, new Date("2026-02-16T10:07:00Z"))).toBe(false);
  });

  it("matches day of week", () => {
    // 2026-02-16 is a Monday (day=1)
    const sundayOnly = parseCron("0 0 * * 0");
    expect(cronMatches(sundayOnly, new Date("2026-02-16T00:00:00Z"))).toBe(false);

    // 2026-02-15 is a Sunday (day=0)
    expect(cronMatches(sundayOnly, new Date("2026-02-15T00:00:00Z"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// inMemoryLock
// ---------------------------------------------------------------------------

describe("inMemoryLock", () => {
  beforeEach(() => {
    // Clean up any leftover locks
    inMemoryLock.release("test-lock");
  });

  it("acquires and releases a lock", () => {
    expect(inMemoryLock.acquire("test-lock", 5000)).toBe(true);
    expect(inMemoryLock.isLocked("test-lock")).toBe(true);
    inMemoryLock.release("test-lock");
    expect(inMemoryLock.isLocked("test-lock")).toBe(false);
  });

  it("prevents double acquire", () => {
    expect(inMemoryLock.acquire("test-lock", 5000)).toBe(true);
    expect(inMemoryLock.acquire("test-lock", 5000)).toBe(false);
    inMemoryLock.release("test-lock");
  });

  it("auto-expires locks after TTL", () => {
    // Acquire with 0ms TTL (immediately expired)
    expect(inMemoryLock.acquire("test-lock", 0)).toBe(true);
    // Should be expired now
    expect(inMemoryLock.isLocked("test-lock")).toBe(false);
    // Can re-acquire
    expect(inMemoryLock.acquire("test-lock", 5000)).toBe(true);
    inMemoryLock.release("test-lock");
  });
});

// ---------------------------------------------------------------------------
// ScheduledWorker
// ---------------------------------------------------------------------------

describe("ScheduledWorker", () => {
  it("runs execute function and reports success", async () => {
    const worker = new ScheduledWorker({
      name: "test-worker",
      cronExpression: "* * * * *",
      enabled: true,
      execute: async () => ({ success: true, itemsProcessed: 5 }),
    });

    expect(worker.state).toBe("idle");

    const result = await worker.run();

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.itemsProcessed).toBe(5);
    expect(worker.state).toBe("idle");

    const health = worker.getHealth();
    expect(health.totalRuns).toBe(1);
    expect(health.totalSuccesses).toBe(1);
    expect(health.totalFailures).toBe(0);
    expect(health.lastRunSuccess).toBe(true);
    expect(health.lastRunItemsProcessed).toBe(5);
    expect(health.lastRunAt).not.toBeNull();
  });

  it("handles execute function errors", async () => {
    const worker = new ScheduledWorker({
      name: "failing-worker",
      cronExpression: "* * * * *",
      enabled: true,
      execute: async () => {
        throw new Error("Something broke");
      },
    });

    const result = await worker.run();

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.error).toBe("Something broke");

    const health = worker.getHealth();
    expect(health.totalRuns).toBe(1);
    expect(health.totalFailures).toBe(1);
    expect(health.lastRunSuccess).toBe(false);
    expect(health.lastRunError).toBe("Something broke");
  });

  it("returns null when disabled", async () => {
    const worker = new ScheduledWorker({
      name: "disabled-worker",
      cronExpression: "* * * * *",
      enabled: false,
      execute: async () => ({ success: true, itemsProcessed: 0 }),
    });

    expect(worker.state).toBe("disabled");
    const result = await worker.run();
    expect(result).toBeNull();
  });

  it("returns null when lock is held", async () => {
    const lock = { ...inMemoryLock };
    lock.acquire = () => false; // always fail

    const worker = new ScheduledWorker(
      {
        name: "locked-worker",
        cronExpression: "* * * * *",
        enabled: true,
        execute: async () => ({ success: true, itemsProcessed: 0 }),
      },
      lock
    );

    const result = await worker.run();
    expect(result).toBeNull();
  });

  it("shouldRunAt respects cron expression", () => {
    const worker = new ScheduledWorker({
      name: "cron-worker",
      cronExpression: "0 3 * * *",
      enabled: true,
      execute: async () => ({ success: true, itemsProcessed: 0 }),
    });

    expect(worker.shouldRunAt(new Date("2026-02-16T03:00:00Z"))).toBe(true);
    expect(worker.shouldRunAt(new Date("2026-02-16T03:01:00Z"))).toBe(false);
    expect(worker.shouldRunAt(new Date("2026-02-16T04:00:00Z"))).toBe(false);
  });

  it("reports error result without throwing", async () => {
    const worker = new ScheduledWorker({
      name: "error-result-worker",
      cronExpression: "* * * * *",
      enabled: true,
      execute: async () => ({
        success: false,
        itemsProcessed: 3,
        error: "partial failure",
      }),
    });

    const result = await worker.run();
    expect(result!.success).toBe(false);
    expect(result!.error).toBe("partial failure");
    expect(result!.itemsProcessed).toBe(3);

    const health = worker.getHealth();
    expect(health.totalFailures).toBe(1);
    expect(health.lastRunItemsProcessed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// WorkerScheduler
// ---------------------------------------------------------------------------

describe("WorkerScheduler", () => {
  let scheduler: WorkerScheduler;

  beforeEach(() => {
    scheduler = new WorkerScheduler();
  });

  afterEach(() => {
    scheduler.stop();
  });

  it("registers and retrieves workers", () => {
    scheduler.register({
      name: "w1",
      cronExpression: "* * * * *",
      enabled: true,
      execute: async () => ({ success: true, itemsProcessed: 0 }),
    });
    scheduler.register({
      name: "w2",
      cronExpression: "0 0 * * *",
      enabled: false,
      execute: async () => ({ success: true, itemsProcessed: 0 }),
    });

    expect(scheduler.getWorker("w1")).toBeDefined();
    expect(scheduler.getWorker("w2")).toBeDefined();
    expect(scheduler.getWorker("w3")).toBeUndefined();
    expect(scheduler.getAllWorkers()).toHaveLength(2);
  });

  it("getAllHealth returns all worker health reports", () => {
    scheduler.register({
      name: "h1",
      cronExpression: "* * * * *",
      enabled: true,
      execute: async () => ({ success: true, itemsProcessed: 0 }),
    });
    scheduler.register({
      name: "h2",
      cronExpression: "0 0 * * *",
      enabled: false,
      execute: async () => ({ success: true, itemsProcessed: 0 }),
    });

    const health = scheduler.getAllHealth();
    expect(health).toHaveLength(2);
    expect(health[0].name).toBe("h1");
    expect(health[0].enabled).toBe(true);
    expect(health[1].name).toBe("h2");
    expect(health[1].enabled).toBe(false);
  });

  it("trigger runs a worker manually", async () => {
    let called = false;
    scheduler.register({
      name: "manual",
      cronExpression: "0 0 31 2 *", // never matches (Feb 31)
      enabled: true,
      execute: async () => {
        called = true;
        return { success: true, itemsProcessed: 42 };
      },
    });

    const result = await scheduler.trigger("manual");
    expect(called).toBe(true);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.itemsProcessed).toBe(42);
  });

  it("trigger returns null for unknown worker", async () => {
    const result = await scheduler.trigger("nonexistent");
    expect(result).toBeNull();
  });

  it("tick fires matching workers", async () => {
    let executed = false;

    // Worker that matches every minute
    scheduler.register({
      name: "tick-worker",
      cronExpression: "* * * * *",
      enabled: true,
      execute: async () => {
        executed = true;
        return { success: true, itemsProcessed: 1 };
      },
    });

    // Force tick (resets lastTickMinute so it fires)
    (scheduler as any).lastTickMinute = -1;
    await scheduler.tick();

    // Give the async fire-and-forget a moment to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(executed).toBe(true);
  });
});
