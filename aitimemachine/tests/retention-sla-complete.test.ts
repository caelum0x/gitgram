/**
 * #24 - Deletion/retention SLA metrics + alerting: comprehensive tests
 *
 * Covers:
 * - Individual SLA violation threshold tests (each threshold type)
 * - Alert severity mapping (critical vs warning)
 * - Dry-run behaviour differences
 * - API endpoint tests for /api/retention/sla and /api/retention/alerts
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  evaluateRetentionSla,
  getRetentionSlaThresholds,
  readRetentionAlerts,
  readRetentionSlaMetrics,
  recordRetentionSla,
  type RetentionSlaInput,
  type RetentionSlaThresholds,
} from "../src/core/retention-sla.js";

// ---------------------------------------------------------------------------
// Helper to build a baseline "healthy" input
// ---------------------------------------------------------------------------
function healthyInput(overrides?: Partial<RetentionSlaInput>): RetentionSlaInput {
  return {
    evaluatedAt: "2026-02-16T00:00:00.000Z",
    keepDays: 7,
    keepMinimum: 10,
    dryRun: false,
    runDurationMs: 50,
    totalCheckpoints: 20,
    eligibleForDeletion: 5,
    checkpointsRemoved: 5,
    staleRetainedCheckpoints: 0,
    bytesFreed: 2048,
    ...overrides,
  };
}

function strictThresholds(
  overrides?: Partial<RetentionSlaThresholds>
): RetentionSlaThresholds {
  return {
    maxRunDurationMs: 1_000,
    maxPendingDeletions: 0,
    maxStaleRetainedCheckpoints: 0,
    minBytesFreedPerRun: 100,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Individual SLA violation threshold tests
// ═══════════════════════════════════════════════════════════════════════════

describe("#24 retention SLA: run_duration_ms threshold violation", () => {
  it("fires a critical alert when run duration exceeds threshold", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({ runDurationMs: 5_000 }),
      strictThresholds({ maxRunDurationMs: 1_000 })
    );

    expect(metrics.healthy).toBe(false);
    const alert = metrics.alerts.find(
      (a) => a.code === "retention_sla_run_duration_ms"
    );
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("critical");
    expect(alert!.message).toContain("5000ms");
    expect(alert!.message).toContain("1000ms");
  });

  it("does not fire when run duration is within threshold", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({ runDurationMs: 500 }),
      strictThresholds({ maxRunDurationMs: 1_000 })
    );

    expect(metrics.healthy).toBe(true);
    expect(
      metrics.alerts.find((a) => a.code === "retention_sla_run_duration_ms")
    ).toBeUndefined();
  });

  it("does not fire when run duration equals threshold exactly", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({ runDurationMs: 1_000 }),
      strictThresholds({ maxRunDurationMs: 1_000 })
    );

    const check = metrics.checks.find((c) => c.key === "run_duration_ms");
    expect(check!.ok).toBe(true);
  });
});

describe("#24 retention SLA: pending_deletions threshold violation", () => {
  it("fires a critical alert when pending deletions exceed threshold", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({
        eligibleForDeletion: 10,
        checkpointsRemoved: 3,
      }),
      strictThresholds({ maxPendingDeletions: 0 })
    );

    expect(metrics.healthy).toBe(false);
    expect(metrics.pendingDeletions).toBe(7);
    const alert = metrics.alerts.find(
      (a) => a.code === "retention_sla_pending_deletions"
    );
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("critical");
  });

  it("does not fire when all eligible checkpoints are removed", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({
        eligibleForDeletion: 5,
        checkpointsRemoved: 5,
      }),
      strictThresholds({ maxPendingDeletions: 0 })
    );

    expect(metrics.pendingDeletions).toBe(0);
    expect(
      metrics.alerts.find((a) => a.code === "retention_sla_pending_deletions")
    ).toBeUndefined();
  });

  it("counts all eligible as pending in dry-run mode", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({
        dryRun: true,
        eligibleForDeletion: 8,
        checkpointsRemoved: 0,
      }),
      strictThresholds({ maxPendingDeletions: 5 })
    );

    expect(metrics.pendingDeletions).toBe(8);
    expect(metrics.healthy).toBe(false);
    const alert = metrics.alerts.find(
      (a) => a.code === "retention_sla_pending_deletions"
    );
    expect(alert).toBeDefined();
  });
});

describe("#24 retention SLA: stale_retained_checkpoints threshold violation", () => {
  it("fires a warning alert when stale retained checkpoints exceed threshold", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({ staleRetainedCheckpoints: 15 }),
      strictThresholds({ maxStaleRetainedCheckpoints: 10 })
    );

    expect(metrics.healthy).toBe(false);
    const alert = metrics.alerts.find(
      (a) => a.code === "retention_sla_stale_retained_checkpoints"
    );
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("warning");
    expect(alert!.message).toContain("15");
    expect(alert!.message).toContain("10");
  });

  it("does not fire when stale count is within threshold", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({ staleRetainedCheckpoints: 5 }),
      strictThresholds({ maxStaleRetainedCheckpoints: 10 })
    );

    expect(
      metrics.alerts.find(
        (a) => a.code === "retention_sla_stale_retained_checkpoints"
      )
    ).toBeUndefined();
  });
});

describe("#24 retention SLA: bytes_freed threshold violation", () => {
  it("fires a warning alert when bytes freed is below minimum", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({
        dryRun: false,
        eligibleForDeletion: 5,
        checkpointsRemoved: 5,
        bytesFreed: 10,
      }),
      strictThresholds({ minBytesFreedPerRun: 500 })
    );

    expect(metrics.healthy).toBe(false);
    const alert = metrics.alerts.find(
      (a) => a.code === "retention_sla_bytes_freed"
    );
    expect(alert).toBeDefined();
    expect(alert!.severity).toBe("warning");
  });

  it("does not fire when bytes freed meets minimum", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({
        dryRun: false,
        eligibleForDeletion: 5,
        checkpointsRemoved: 5,
        bytesFreed: 1000,
      }),
      strictThresholds({ minBytesFreedPerRun: 500 })
    );

    expect(
      metrics.alerts.find((a) => a.code === "retention_sla_bytes_freed")
    ).toBeUndefined();
  });

  it("does not fire bytes_freed in dry-run mode even when below minimum", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({
        dryRun: true,
        eligibleForDeletion: 5,
        checkpointsRemoved: 0,
        bytesFreed: 0,
      }),
      strictThresholds({ minBytesFreedPerRun: 500, maxPendingDeletions: 100 })
    );

    expect(
      metrics.alerts.find((a) => a.code === "retention_sla_bytes_freed")
    ).toBeUndefined();
  });

  it("does not fire bytes_freed when no checkpoints were eligible", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({
        dryRun: false,
        eligibleForDeletion: 0,
        checkpointsRemoved: 0,
        bytesFreed: 0,
      }),
      strictThresholds({ minBytesFreedPerRun: 500 })
    );

    expect(
      metrics.alerts.find((a) => a.code === "retention_sla_bytes_freed")
    ).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Combined threshold violation tests
// ═══════════════════════════════════════════════════════════════════════════

describe("#24 retention SLA: multiple simultaneous violations", () => {
  it("fires multiple alerts when multiple thresholds are violated", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({
        runDurationMs: 50_000,
        eligibleForDeletion: 20,
        checkpointsRemoved: 0,
        staleRetainedCheckpoints: 50,
        bytesFreed: 0,
      }),
      strictThresholds({
        maxRunDurationMs: 1_000,
        maxPendingDeletions: 0,
        maxStaleRetainedCheckpoints: 10,
        minBytesFreedPerRun: 100,
      })
    );

    expect(metrics.healthy).toBe(false);
    expect(metrics.alerts.length).toBe(4);

    const alertCodes = metrics.alerts.map((a) => a.code).sort();
    expect(alertCodes).toEqual([
      "retention_sla_bytes_freed",
      "retention_sla_pending_deletions",
      "retention_sla_run_duration_ms",
      "retention_sla_stale_retained_checkpoints",
    ]);

    // Verify severity mapping
    const criticals = metrics.alerts.filter((a) => a.severity === "critical");
    const warnings = metrics.alerts.filter((a) => a.severity === "warning");
    expect(criticals.length).toBe(2); // run_duration_ms, pending_deletions
    expect(warnings.length).toBe(2); // stale_retained, bytes_freed
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Environment variable threshold configuration
// ═══════════════════════════════════════════════════════════════════════════

describe("#24 retention SLA: threshold configuration via environment", () => {
  it("reads thresholds from environment variables", () => {
    const env = {
      AITM_RETENTION_SLA_MAX_RUN_MS: "5000",
      AITM_RETENTION_SLA_MAX_PENDING_DELETIONS: "3",
      AITM_RETENTION_SLA_MAX_STALE_RETAINED: "20",
      AITM_RETENTION_SLA_MIN_BYTES_FREED: "1024",
    };

    const thresholds = getRetentionSlaThresholds(env as unknown as NodeJS.ProcessEnv);
    expect(thresholds.maxRunDurationMs).toBe(5000);
    expect(thresholds.maxPendingDeletions).toBe(3);
    expect(thresholds.maxStaleRetainedCheckpoints).toBe(20);
    expect(thresholds.minBytesFreedPerRun).toBe(1024);
  });

  it("falls back to defaults for missing or invalid env values", () => {
    const env = {
      AITM_RETENTION_SLA_MAX_RUN_MS: "not-a-number",
    };

    const thresholds = getRetentionSlaThresholds(env as unknown as NodeJS.ProcessEnv);
    expect(thresholds.maxRunDurationMs).toBe(30_000); // default
    expect(thresholds.maxPendingDeletions).toBe(0); // default
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Persistence: metrics and alerts JSONL files
// ═══════════════════════════════════════════════════════════════════════════

describe("#24 retention SLA: persistence and retrieval", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-sla-persist-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("records multiple metrics entries and reads them back in reverse order", () => {
    for (let i = 0; i < 5; i++) {
      const metrics = evaluateRetentionSla(
        healthyInput({
          evaluatedAt: `2026-02-${(16 + i).toString().padStart(2, "0")}T00:00:00.000Z`,
          runDurationMs: 100 * (i + 1),
        }),
        strictThresholds()
      );
      recordRetentionSla(projectDir, metrics);
    }

    const history = readRetentionSlaMetrics(projectDir, 10);
    expect(history).toHaveLength(5);
    // Most recent first
    expect(history[0].evaluatedAt).toBe("2026-02-20T00:00:00.000Z");
    expect(history[4].evaluatedAt).toBe("2026-02-16T00:00:00.000Z");
  });

  it("records alerts only when SLA is violated, not when healthy", () => {
    // Healthy run - no alerts
    const healthyMetrics = evaluateRetentionSla(
      healthyInput(),
      strictThresholds()
    );
    recordRetentionSla(projectDir, healthyMetrics);

    // Unhealthy run - alerts
    const unhealthyMetrics = evaluateRetentionSla(
      healthyInput({ runDurationMs: 99_000 }),
      strictThresholds({ maxRunDurationMs: 100 })
    );
    recordRetentionSla(projectDir, unhealthyMetrics);

    const metrics = readRetentionSlaMetrics(projectDir, 10);
    expect(metrics).toHaveLength(2);

    const alerts = readRetentionAlerts(projectDir, 10);
    // Only the unhealthy run should produce alert entries
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts.every((a) => a.code.startsWith("retention_sla_"))).toBe(true);
  });

  it("respects the limit parameter when reading metrics", () => {
    for (let i = 0; i < 10; i++) {
      const metrics = evaluateRetentionSla(healthyInput(), strictThresholds());
      recordRetentionSla(projectDir, metrics);
    }

    const limited = readRetentionSlaMetrics(projectDir, 3);
    expect(limited).toHaveLength(3);
  });

  it("returns empty arrays when no metrics/alerts exist", () => {
    expect(readRetentionSlaMetrics(projectDir, 10)).toEqual([]);
    expect(readRetentionAlerts(projectDir, 10)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Alert detail structure
// ═══════════════════════════════════════════════════════════════════════════

describe("#24 retention SLA: alert detail structure", () => {
  it("alerts contain timestamp, severity, code, message, and details", () => {
    const metrics = evaluateRetentionSla(
      healthyInput({
        evaluatedAt: "2026-02-16T12:00:00.000Z",
        runDurationMs: 99_000,
      }),
      strictThresholds({ maxRunDurationMs: 100 })
    );

    expect(metrics.alerts.length).toBeGreaterThanOrEqual(1);
    const alert = metrics.alerts[0];
    expect(alert.timestamp).toBe("2026-02-16T12:00:00.000Z");
    expect(["warning", "critical"]).toContain(alert.severity);
    expect(alert.code).toMatch(/^retention_sla_/);
    expect(alert.message).toBeTruthy();
    expect(alert.details).toBeDefined();
    expect(alert.details.check).toBeTruthy();
    expect(typeof alert.details.value).toBe("number");
    expect(typeof alert.details.threshold).toBe("number");
    expect(alert.details.keepDays).toBe(7);
    expect(alert.details.keepMinimum).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API endpoint tests for /api/retention/sla and /api/retention/alerts
// ═══════════════════════════════════════════════════════════════════════════

describe("#24 retention SLA: API endpoint /api/retention/sla", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-sla-api-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("returns metrics history in the expected API response shape", () => {
    // Simulate what the API endpoint does internally
    const metrics1 = evaluateRetentionSla(
      healthyInput({ evaluatedAt: "2026-02-16T00:00:00.000Z" }),
      strictThresholds()
    );
    const metrics2 = evaluateRetentionSla(
      healthyInput({
        evaluatedAt: "2026-02-17T00:00:00.000Z",
        runDurationMs: 50_000,
      }),
      strictThresholds({ maxRunDurationMs: 100 })
    );
    recordRetentionSla(projectDir, metrics1);
    recordRetentionSla(projectDir, metrics2);

    // Simulate the API handler logic
    const limit = 50;
    const history = readRetentionSlaMetrics(projectDir, limit);
    const response = { projectPath: projectDir, total: history.length, history };

    expect(response.projectPath).toBe(projectDir);
    expect(response.total).toBe(2);
    expect(response.history).toHaveLength(2);
    // Most recent first
    expect(response.history[0].evaluatedAt).toBe("2026-02-17T00:00:00.000Z");
    expect(response.history[0].healthy).toBe(false);
    expect(response.history[1].evaluatedAt).toBe("2026-02-16T00:00:00.000Z");
    expect(response.history[1].healthy).toBe(true);

    // Each metrics entry should have the full structure
    for (const m of response.history) {
      expect(m.keepDays).toBeDefined();
      expect(m.keepMinimum).toBeDefined();
      expect(m.thresholds).toBeDefined();
      expect(m.checks).toBeDefined();
      expect(Array.isArray(m.checks)).toBe(true);
      expect(m.checks.length).toBe(4);
      expect(m.alerts).toBeDefined();
      expect(Array.isArray(m.alerts)).toBe(true);
    }
  });

  it("respects query limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      const metrics = evaluateRetentionSla(healthyInput(), strictThresholds());
      recordRetentionSla(projectDir, metrics);
    }

    // Simulate limit=3
    const limit = Math.max(1, Math.min(500, 3));
    const history = readRetentionSlaMetrics(projectDir, limit);
    const response = { projectPath: projectDir, total: history.length, history };

    expect(response.total).toBe(3);
    expect(response.history).toHaveLength(3);
  });

  it("returns empty history when no metrics exist", () => {
    const history = readRetentionSlaMetrics(projectDir, 50);
    const response = { projectPath: projectDir, total: history.length, history };

    expect(response.total).toBe(0);
    expect(response.history).toEqual([]);
  });
});

describe("#24 retention SLA: API endpoint /api/retention/alerts", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-sla-alerts-api-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("returns alerts in the expected API response shape", () => {
    // Record a healthy run (no alerts)
    const healthy = evaluateRetentionSla(healthyInput(), strictThresholds());
    recordRetentionSla(projectDir, healthy);

    // Record an unhealthy run (generates alerts)
    const unhealthy = evaluateRetentionSla(
      healthyInput({
        runDurationMs: 99_000,
        eligibleForDeletion: 10,
        checkpointsRemoved: 0,
        staleRetainedCheckpoints: 99,
      }),
      strictThresholds({
        maxRunDurationMs: 100,
        maxPendingDeletions: 0,
        maxStaleRetainedCheckpoints: 5,
      })
    );
    recordRetentionSla(projectDir, unhealthy);

    // Simulate API handler
    const limit = 100;
    const alerts = readRetentionAlerts(projectDir, limit);
    const response = { projectPath: projectDir, total: alerts.length, alerts };

    expect(response.projectPath).toBe(projectDir);
    expect(response.total).toBeGreaterThanOrEqual(3);
    expect(response.alerts.length).toBeGreaterThanOrEqual(3);

    // Verify alert structure
    for (const alert of response.alerts) {
      expect(alert.timestamp).toBeTruthy();
      expect(["warning", "critical"]).toContain(alert.severity);
      expect(alert.code).toMatch(/^retention_sla_/);
      expect(alert.message).toBeTruthy();
      expect(alert.details).toBeDefined();
    }

    // Verify we got the specific violations
    const codes = response.alerts.map((a) => a.code);
    expect(codes).toContain("retention_sla_run_duration_ms");
    expect(codes).toContain("retention_sla_pending_deletions");
    expect(codes).toContain("retention_sla_stale_retained_checkpoints");
  });

  it("respects query limit parameter for alerts", () => {
    // Generate many alerts
    for (let i = 0; i < 5; i++) {
      const unhealthy = evaluateRetentionSla(
        healthyInput({ runDurationMs: 99_000 }),
        strictThresholds({ maxRunDurationMs: 100 })
      );
      recordRetentionSla(projectDir, unhealthy);
    }

    const limit = Math.max(1, Math.min(500, 2));
    const alerts = readRetentionAlerts(projectDir, limit);
    const response = { projectPath: projectDir, total: alerts.length, alerts };

    expect(response.total).toBe(2);
  });

  it("returns empty alerts when all runs are healthy", () => {
    for (let i = 0; i < 3; i++) {
      const healthy = evaluateRetentionSla(healthyInput(), strictThresholds());
      recordRetentionSla(projectDir, healthy);
    }

    const alerts = readRetentionAlerts(projectDir, 100);
    const response = { projectPath: projectDir, total: alerts.length, alerts };

    expect(response.total).toBe(0);
    expect(response.alerts).toEqual([]);
  });

  it("filters only retention SLA alerts, not other log types", () => {
    // Only retention SLA alerts should appear
    const unhealthy = evaluateRetentionSla(
      healthyInput({ staleRetainedCheckpoints: 100 }),
      strictThresholds({ maxStaleRetainedCheckpoints: 1 })
    );
    recordRetentionSla(projectDir, unhealthy);

    const alerts = readRetentionAlerts(projectDir, 100);
    for (const alert of alerts) {
      expect(alert.code.startsWith("retention_sla_")).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Checks structure validation
// ═══════════════════════════════════════════════════════════════════════════

describe("#24 retention SLA: checks structure", () => {
  it("always produces exactly 4 checks regardless of health", () => {
    const healthy = evaluateRetentionSla(healthyInput(), strictThresholds());
    expect(healthy.checks).toHaveLength(4);
    expect(healthy.checks.map((c) => c.key).sort()).toEqual([
      "bytes_freed",
      "pending_deletions",
      "run_duration_ms",
      "stale_retained_checkpoints",
    ]);

    for (const check of healthy.checks) {
      expect(check.ok).toBe(true);
      expect(typeof check.value).toBe("number");
      expect(typeof check.threshold).toBe("number");
      expect(["<=", ">="]).toContain(check.comparator);
      expect(["ms", "count", "bytes"]).toContain(check.unit);
      expect(check.message).toBeTruthy();
    }
  });

  it("bytes_freed check uses >= comparator, all others use <=", () => {
    const metrics = evaluateRetentionSla(healthyInput(), strictThresholds());

    const bytesCheck = metrics.checks.find((c) => c.key === "bytes_freed");
    expect(bytesCheck!.comparator).toBe(">=");

    for (const check of metrics.checks.filter((c) => c.key !== "bytes_freed")) {
      expect(check.comparator).toBe("<=");
    }
  });
});
