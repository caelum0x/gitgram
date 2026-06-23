import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  buildBenchmarkDashboard,
  getBenchmarkDashboard,
  percentile,
  recordBenchmarkEvent,
  type BenchmarkEvent,
  type BenchmarkDashboard,
} from "../src/core/benchmark-metrics.js";

describe("benchmark metrics dashboard", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    while (cleanup.length > 0) {
      const p = cleanup.pop();
      if (p) fs.rmSync(p, { recursive: true, force: true });
    }
  });

  it("computes percentile values deterministically", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 50)).toBe(30);
    expect(percentile(values, 95)).toBeGreaterThan(40);
    expect(percentile(values, 100)).toBe(50);
  });

  it("builds success-rate and latency summary for restore/diff", () => {
    const now = new Date().toISOString();
    const events: BenchmarkEvent[] = [
      { timestamp: now, operation: "restore", success: true, durationMs: 100 },
      { timestamp: now, operation: "restore", success: false, durationMs: 300 },
      { timestamp: now, operation: "restore", success: true, durationMs: 200 },
      { timestamp: now, operation: "diff", success: true, durationMs: 20 },
      { timestamp: now, operation: "diff", success: true, durationMs: 40 },
    ];

    const dashboard = buildBenchmarkDashboard(events, 24);

    expect(dashboard.totalEvents).toBe(5);
    expect(dashboard.operations.restore.total).toBe(3);
    expect(dashboard.operations.restore.successes).toBe(2);
    expect(dashboard.operations.restore.successRate).toBeCloseTo(2 / 3, 5);
    expect(dashboard.operations.restore.latencyMs.p95Ms).toBeGreaterThanOrEqual(200);

    expect(dashboard.operations.diff.total).toBe(2);
    expect(dashboard.operations.diff.successRate).toBe(1);
    expect(dashboard.operations.diff.latencyMs.p99Ms).toBeGreaterThanOrEqual(39);
  });

  it("filters dashboard to time window when reading from persisted metrics", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-benchmark-"));
    cleanup.push(projectRoot);

    const now = Date.now();
    const oldTs = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const freshTs = new Date(now - 30 * 60 * 1000).toISOString();

    recordBenchmarkEvent(projectRoot, {
      timestamp: oldTs,
      operation: "restore",
      success: false,
      durationMs: 500,
    });
    recordBenchmarkEvent(projectRoot, {
      timestamp: freshTs,
      operation: "restore",
      success: true,
      durationMs: 120,
    });
    recordBenchmarkEvent(projectRoot, {
      timestamp: freshTs,
      operation: "diff",
      success: true,
      durationMs: 40,
    });

    const dashboard = getBenchmarkDashboard(projectRoot, { windowHours: 24, limit: 50 });

    expect(dashboard.totalEvents).toBe(2);
    expect(dashboard.operations.restore.total).toBe(1);
    expect(dashboard.operations.restore.successRate).toBe(1);
    expect(dashboard.operations.diff.total).toBe(1);
  });
});

describe("percentile accuracy", () => {
  it("returns exact values for P0 and P100", () => {
    const values = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95];
    expect(percentile(values, 0)).toBe(5);
    expect(percentile(values, 100)).toBe(95);
  });

  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([], 95)).toBe(0);
  });

  it("returns the single value for a single-element array", () => {
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it("computes P50 (median) correctly for odd and even length arrays", () => {
    // Odd length: exact middle
    expect(percentile([10, 20, 30], 50)).toBe(20);

    // Even length: interpolated median
    const p50 = percentile([10, 20, 30, 40], 50);
    // rank = (50/100) * (4-1) = 1.5, so interpolated between index 1 (20) and index 2 (30)
    expect(p50).toBe(25);
  });

  it("computes P95 accurately for a known distribution", () => {
    // 100 values: 1, 2, 3, ..., 100
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const p95 = percentile(values, 95);
    // rank = (95/100) * 99 = 94.05
    // interpolation between index 94 (value 95) and index 95 (value 96)
    // p95 = 95 * 0.95 + 96 * 0.05 = 90.25 + 4.8 = 95.05
    expect(p95).toBeCloseTo(95.05, 2);
  });

  it("computes P99 accurately for a known distribution", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const p99 = percentile(values, 99);
    // rank = (99/100) * 99 = 98.01
    // interpolation between index 98 (value 99) and index 99 (value 100)
    // p99 = 99 * 0.99 + 100 * 0.01 = 98.01 + 1.0 = 99.01
    expect(p99).toBeCloseTo(99.01, 2);
  });

  it("is not affected by input order (sorts internally)", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const reversed = [...sorted].reverse();
    const shuffled = [50, 10, 90, 30, 70, 20, 80, 40, 100, 60];

    expect(percentile(sorted, 50)).toBe(percentile(reversed, 50));
    expect(percentile(sorted, 95)).toBe(percentile(shuffled, 95));
    expect(percentile(sorted, 99)).toBe(percentile(reversed, 99));
  });
});

describe("dashboard aggregation output format", () => {
  it("produces correct BenchmarkDashboard shape with all required fields", () => {
    const now = new Date().toISOString();
    const events: BenchmarkEvent[] = [
      { timestamp: now, operation: "restore", success: true, durationMs: 150 },
      { timestamp: now, operation: "diff", success: true, durationMs: 25 },
    ];

    const dashboard = buildBenchmarkDashboard(events, 24);

    // Top-level fields
    expect(dashboard).toHaveProperty("evaluatedAt");
    expect(typeof dashboard.evaluatedAt).toBe("string");
    expect(new Date(dashboard.evaluatedAt).getTime()).not.toBeNaN();
    expect(dashboard.windowHours).toBe(24);
    expect(dashboard.totalEvents).toBe(2);

    // Operations must have both restore and diff
    expect(dashboard.operations).toHaveProperty("restore");
    expect(dashboard.operations).toHaveProperty("diff");

    // Each operation summary has correct shape
    for (const op of ["restore", "diff"] as const) {
      const summary = dashboard.operations[op];
      expect(summary).toHaveProperty("operation", op);
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.successes).toBe("number");
      expect(typeof summary.failures).toBe("number");
      expect(typeof summary.successRate).toBe("number");
      expect(summary.successRate).toBeGreaterThanOrEqual(0);
      expect(summary.successRate).toBeLessThanOrEqual(1);

      // Latency summary shape
      const lat = summary.latencyMs;
      expect(lat).toHaveProperty("count");
      expect(lat).toHaveProperty("minMs");
      expect(lat).toHaveProperty("maxMs");
      expect(lat).toHaveProperty("avgMs");
      expect(lat).toHaveProperty("p50Ms");
      expect(lat).toHaveProperty("p95Ms");
      expect(lat).toHaveProperty("p99Ms");
      expect(typeof lat.count).toBe("number");
      expect(typeof lat.minMs).toBe("number");
      expect(typeof lat.maxMs).toBe("number");
      expect(typeof lat.avgMs).toBe("number");
      expect(typeof lat.p50Ms).toBe("number");
      expect(typeof lat.p95Ms).toBe("number");
      expect(typeof lat.p99Ms).toBe("number");
    }
  });

  it("produces correct values in aggregation with known inputs", () => {
    const now = new Date().toISOString();
    const events: BenchmarkEvent[] = [
      { timestamp: now, operation: "restore", success: true, durationMs: 100 },
      { timestamp: now, operation: "restore", success: true, durationMs: 200 },
      { timestamp: now, operation: "restore", success: true, durationMs: 300 },
      { timestamp: now, operation: "restore", success: false, durationMs: 400 },
      { timestamp: now, operation: "restore", success: true, durationMs: 500 },
    ];

    const dashboard = buildBenchmarkDashboard(events, 12);

    const restore = dashboard.operations.restore;
    expect(restore.total).toBe(5);
    expect(restore.successes).toBe(4);
    expect(restore.failures).toBe(1);
    expect(restore.successRate).toBeCloseTo(0.8, 5);

    // Latency stats
    expect(restore.latencyMs.count).toBe(5);
    expect(restore.latencyMs.minMs).toBe(100);
    expect(restore.latencyMs.maxMs).toBe(500);
    expect(restore.latencyMs.avgMs).toBe(300);
    expect(restore.latencyMs.p50Ms).toBe(300);
    // p95: rank = (95/100) * 4 = 3.8, interpolation between index 3 (400) and index 4 (500)
    // = 400 * 0.2 + 500 * 0.8 = 80 + 400 = 480
    expect(restore.latencyMs.p95Ms).toBeCloseTo(480, 0);

    // Diff should show empty
    const diff = dashboard.operations.diff;
    expect(diff.total).toBe(0);
    expect(diff.successRate).toBe(0);
    expect(diff.latencyMs.count).toBe(0);
    expect(diff.latencyMs.p95Ms).toBe(0);
  });

  it("handles empty events producing zero-value dashboard", () => {
    const dashboard = buildBenchmarkDashboard([], 24);

    expect(dashboard.totalEvents).toBe(0);
    expect(dashboard.operations.restore.total).toBe(0);
    expect(dashboard.operations.restore.successRate).toBe(0);
    expect(dashboard.operations.restore.latencyMs.count).toBe(0);
    expect(dashboard.operations.diff.total).toBe(0);
    expect(dashboard.operations.diff.latencyMs.p95Ms).toBe(0);
  });

  it("dashboard JSON is valid and re-parseable", () => {
    const now = new Date().toISOString();
    const events: BenchmarkEvent[] = [
      { timestamp: now, operation: "restore", success: true, durationMs: 100 },
    ];

    const dashboard = buildBenchmarkDashboard(events, 24);
    const json = JSON.stringify(dashboard);
    const parsed = JSON.parse(json) as BenchmarkDashboard;

    expect(parsed.totalEvents).toBe(1);
    expect(parsed.operations.restore.total).toBe(1);
    expect(parsed.operations.restore.latencyMs.p50Ms).toBe(100);
  });
});
