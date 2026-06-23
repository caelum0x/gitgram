import * as fs from "fs";
import * as path from "path";

export interface RetentionSlaThresholds {
  maxRunDurationMs: number;
  maxPendingDeletions: number;
  maxStaleRetainedCheckpoints: number;
  minBytesFreedPerRun: number;
}

export interface RetentionSlaInput {
  evaluatedAt?: string;
  keepDays: number;
  keepMinimum: number;
  dryRun: boolean;
  runDurationMs: number;
  totalCheckpoints: number;
  eligibleForDeletion: number;
  checkpointsRemoved: number;
  staleRetainedCheckpoints: number;
  bytesFreed: number;
}

export interface RetentionSlaCheck {
  key: "run_duration_ms" | "pending_deletions" | "stale_retained_checkpoints" | "bytes_freed";
  ok: boolean;
  comparator: "<=" | ">=";
  value: number;
  threshold: number;
  unit: "ms" | "count" | "bytes";
  message: string;
}

export interface RetentionSlaAlert {
  timestamp: string;
  severity: "warning" | "critical";
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface RetentionSlaMetrics {
  evaluatedAt: string;
  keepDays: number;
  keepMinimum: number;
  dryRun: boolean;
  runDurationMs: number;
  totalCheckpoints: number;
  eligibleForDeletion: number;
  checkpointsRemoved: number;
  pendingDeletions: number;
  staleRetainedCheckpoints: number;
  bytesFreed: number;
  thresholds: RetentionSlaThresholds;
  checks: RetentionSlaCheck[];
  alerts: RetentionSlaAlert[];
  healthy: boolean;
}

const DEFAULT_THRESHOLDS: RetentionSlaThresholds = {
  maxRunDurationMs: 30_000,
  maxPendingDeletions: 0,
  maxStaleRetainedCheckpoints: 10,
  minBytesFreedPerRun: 0,
};

function parseEnvInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRetentionSlaThresholds(env: NodeJS.ProcessEnv = process.env): RetentionSlaThresholds {
  return {
    maxRunDurationMs: parseEnvInt(env.AITM_RETENTION_SLA_MAX_RUN_MS, DEFAULT_THRESHOLDS.maxRunDurationMs),
    maxPendingDeletions: parseEnvInt(env.AITM_RETENTION_SLA_MAX_PENDING_DELETIONS, DEFAULT_THRESHOLDS.maxPendingDeletions),
    maxStaleRetainedCheckpoints: parseEnvInt(
      env.AITM_RETENTION_SLA_MAX_STALE_RETAINED,
      DEFAULT_THRESHOLDS.maxStaleRetainedCheckpoints
    ),
    minBytesFreedPerRun: parseEnvInt(env.AITM_RETENTION_SLA_MIN_BYTES_FREED, DEFAULT_THRESHOLDS.minBytesFreedPerRun),
  };
}

export function evaluateRetentionSla(
  input: RetentionSlaInput,
  thresholds: RetentionSlaThresholds = getRetentionSlaThresholds()
): RetentionSlaMetrics {
  const evaluatedAt = input.evaluatedAt || new Date().toISOString();
  const pendingDeletions = input.dryRun
    ? input.eligibleForDeletion
    : Math.max(0, input.eligibleForDeletion - input.checkpointsRemoved);

  const checks: RetentionSlaCheck[] = [];
  checks.push({
    key: "run_duration_ms",
    ok: input.runDurationMs <= thresholds.maxRunDurationMs,
    comparator: "<=",
    value: input.runDurationMs,
    threshold: thresholds.maxRunDurationMs,
    unit: "ms",
    message: `GC run duration ${input.runDurationMs}ms exceeded SLA ${thresholds.maxRunDurationMs}ms`,
  });
  checks.push({
    key: "pending_deletions",
    ok: pendingDeletions <= thresholds.maxPendingDeletions,
    comparator: "<=",
    value: pendingDeletions,
    threshold: thresholds.maxPendingDeletions,
    unit: "count",
    message: `Pending deletions ${pendingDeletions} exceeded SLA ${thresholds.maxPendingDeletions}`,
  });
  checks.push({
    key: "stale_retained_checkpoints",
    ok: input.staleRetainedCheckpoints <= thresholds.maxStaleRetainedCheckpoints,
    comparator: "<=",
    value: input.staleRetainedCheckpoints,
    threshold: thresholds.maxStaleRetainedCheckpoints,
    unit: "count",
    message: `Stale retained checkpoints ${input.staleRetainedCheckpoints} exceeded SLA ${thresholds.maxStaleRetainedCheckpoints}`,
  });

  const shouldEnforceBytesFreed =
    !input.dryRun && input.eligibleForDeletion > 0 && thresholds.minBytesFreedPerRun > 0;
  checks.push({
    key: "bytes_freed",
    ok: shouldEnforceBytesFreed ? input.bytesFreed >= thresholds.minBytesFreedPerRun : true,
    comparator: ">=",
    value: input.bytesFreed,
    threshold: thresholds.minBytesFreedPerRun,
    unit: "bytes",
    message: `Bytes freed ${input.bytesFreed} was below SLA ${thresholds.minBytesFreedPerRun}`,
  });

  const alerts = checks
    .filter((c) => !c.ok)
    .map<RetentionSlaAlert>((check) => ({
      timestamp: evaluatedAt,
      severity: check.key === "run_duration_ms" || check.key === "pending_deletions" ? "critical" : "warning",
      code: `retention_sla_${check.key}`,
      message: check.message,
      details: {
        check: check.key,
        comparator: check.comparator,
        value: check.value,
        threshold: check.threshold,
        unit: check.unit,
        keepDays: input.keepDays,
        keepMinimum: input.keepMinimum,
        dryRun: input.dryRun,
      },
    }));

  return {
    evaluatedAt,
    keepDays: input.keepDays,
    keepMinimum: input.keepMinimum,
    dryRun: input.dryRun,
    runDurationMs: input.runDurationMs,
    totalCheckpoints: input.totalCheckpoints,
    eligibleForDeletion: input.eligibleForDeletion,
    checkpointsRemoved: input.checkpointsRemoved,
    pendingDeletions,
    staleRetainedCheckpoints: input.staleRetainedCheckpoints,
    bytesFreed: input.bytesFreed,
    thresholds,
    checks,
    alerts,
    healthy: alerts.length === 0,
  };
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function metricsPath(projectPath: string): string {
  return path.join(projectPath, ".aitimemachine", "metrics", "retention-sla.jsonl");
}

function alertsPath(projectPath: string): string {
  return path.join(projectPath, ".aitimemachine", "logs", "retention-alerts.log");
}

export function recordRetentionSla(projectPath: string, metrics: RetentionSlaMetrics): void {
  const mPath = metricsPath(projectPath);
  ensureDir(path.dirname(mPath));
  fs.appendFileSync(mPath, JSON.stringify(metrics) + "\n", "utf-8");

  if (metrics.alerts.length === 0) return;

  const aPath = alertsPath(projectPath);
  ensureDir(path.dirname(aPath));
  for (const alert of metrics.alerts) {
    fs.appendFileSync(aPath, JSON.stringify(alert) + "\n", "utf-8");
    console.warn(`[retention-sla:${alert.severity}] ${alert.code}: ${alert.message}`);
  }
}

function readJsonLines<T>(filePath: string, limit: number): T[] {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf-8").trim();
  if (!text) return [];

  const lines = text
    .split("\n")
    .filter(Boolean)
    .slice(-Math.max(1, limit));

  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((v): v is T => v !== null)
    .reverse();
}

export function readRetentionSlaMetrics(projectPath: string, limit = 50): RetentionSlaMetrics[] {
  return readJsonLines<RetentionSlaMetrics>(metricsPath(projectPath), limit);
}

export function readRetentionAlerts(projectPath: string, limit = 100): RetentionSlaAlert[] {
  return readJsonLines<RetentionSlaAlert>(alertsPath(projectPath), limit);
}
