import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  evaluateRetentionSla,
  readRetentionAlerts,
  readRetentionSlaMetrics,
  recordRetentionSla,
} from "../src/core/retention-sla.js";

describe("retention SLA metrics and alerting", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-retention-sla-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("reports healthy status when checks meet thresholds", () => {
    const metrics = evaluateRetentionSla(
      {
        keepDays: 7,
        keepMinimum: 10,
        dryRun: false,
        runDurationMs: 100,
        totalCheckpoints: 20,
        eligibleForDeletion: 5,
        checkpointsRemoved: 5,
        staleRetainedCheckpoints: 0,
        bytesFreed: 1024,
      },
      {
        maxRunDurationMs: 1_000,
        maxPendingDeletions: 0,
        maxStaleRetainedCheckpoints: 0,
        minBytesFreedPerRun: 100,
      }
    );

    expect(metrics.healthy).toBe(true);
    expect(metrics.alerts).toHaveLength(0);
    expect(metrics.pendingDeletions).toBe(0);
  });

  it("emits critical and warning alerts when SLA checks fail", () => {
    const metrics = evaluateRetentionSla(
      {
        keepDays: 7,
        keepMinimum: 10,
        dryRun: false,
        runDurationMs: 5_000,
        totalCheckpoints: 50,
        eligibleForDeletion: 10,
        checkpointsRemoved: 3,
        staleRetainedCheckpoints: 4,
        bytesFreed: 10,
      },
      {
        maxRunDurationMs: 1_000,
        maxPendingDeletions: 0,
        maxStaleRetainedCheckpoints: 0,
        minBytesFreedPerRun: 100,
      }
    );

    expect(metrics.healthy).toBe(false);
    expect(metrics.pendingDeletions).toBe(7);
    expect(metrics.alerts.some((a) => a.severity === "critical")).toBe(true);
    expect(metrics.alerts.some((a) => a.code === "retention_sla_stale_retained_checkpoints")).toBe(true);
  });

  it("persists metrics and alerts to project-local logs", () => {
    const metrics = evaluateRetentionSla(
      {
        keepDays: 7,
        keepMinimum: 10,
        dryRun: false,
        runDurationMs: 1_500,
        totalCheckpoints: 12,
        eligibleForDeletion: 2,
        checkpointsRemoved: 0,
        staleRetainedCheckpoints: 2,
        bytesFreed: 0,
      },
      {
        maxRunDurationMs: 100,
        maxPendingDeletions: 0,
        maxStaleRetainedCheckpoints: 0,
        minBytesFreedPerRun: 0,
      }
    );

    recordRetentionSla(projectDir, metrics);

    const history = readRetentionSlaMetrics(projectDir, 10);
    const alerts = readRetentionAlerts(projectDir, 10);

    expect(history).toHaveLength(1);
    expect(history[0].eligibleForDeletion).toBe(2);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].code.startsWith("retention_sla_")).toBe(true);
  });
});
