import * as fs from "node:fs";
import * as path from "node:path";

export type BenchmarkOperation = "restore" | "diff";

export interface BenchmarkEvent {
  timestamp: string;
  operation: BenchmarkOperation;
  success: boolean;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface LatencySummary {
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface OperationSummary {
  operation: BenchmarkOperation;
  total: number;
  successes: number;
  failures: number;
  successRate: number;
  latencyMs: LatencySummary;
}

export interface BenchmarkDashboard {
  evaluatedAt: string;
  windowHours: number;
  totalEvents: number;
  operations: Record<BenchmarkOperation, OperationSummary>;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function metricsPath(projectPath: string): string {
  return path.join(projectPath, ".aitimemachine", "metrics", "benchmark-latency.jsonl");
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];

  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];

  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function summarizeLatencies(latencies: number[]): LatencySummary {
  if (latencies.length === 0) {
    return {
      count: 0,
      minMs: 0,
      maxMs: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
    };
  }

  const minMs = Math.min(...latencies);
  const maxMs = Math.max(...latencies);
  const avgMs = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;

  return {
    count: latencies.length,
    minMs,
    maxMs,
    avgMs,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
  };
}

function emptyOperationSummary(operation: BenchmarkOperation): OperationSummary {
  return {
    operation,
    total: 0,
    successes: 0,
    failures: 0,
    successRate: 0,
    latencyMs: summarizeLatencies([]),
  };
}

export function buildBenchmarkDashboard(events: BenchmarkEvent[], windowHours: number): BenchmarkDashboard {
  const byOp: Record<BenchmarkOperation, BenchmarkEvent[]> = {
    restore: [],
    diff: [],
  };

  for (const event of events) {
    byOp[event.operation].push(event);
  }

  const operations: Record<BenchmarkOperation, OperationSummary> = {
    restore: emptyOperationSummary("restore"),
    diff: emptyOperationSummary("diff"),
  };

  for (const op of ["restore", "diff"] as const) {
    const opEvents = byOp[op];
    const successes = opEvents.filter((e) => e.success).length;
    const failures = opEvents.length - successes;
    operations[op] = {
      operation: op,
      total: opEvents.length,
      successes,
      failures,
      successRate: opEvents.length > 0 ? successes / opEvents.length : 0,
      latencyMs: summarizeLatencies(opEvents.map((e) => e.durationMs)),
    };
  }

  return {
    evaluatedAt: new Date().toISOString(),
    windowHours,
    totalEvents: events.length,
    operations,
  };
}

export function recordBenchmarkEvent(projectPath: string, event: BenchmarkEvent): void {
  const mPath = metricsPath(projectPath);
  ensureDir(path.dirname(mPath));
  fs.appendFileSync(mPath, JSON.stringify(event) + "\n", "utf-8");
}

export function readBenchmarkEvents(projectPath: string, limit = 5000): BenchmarkEvent[] {
  const mPath = metricsPath(projectPath);
  if (!fs.existsSync(mPath)) return [];
  const text = fs.readFileSync(mPath, "utf-8").trim();
  if (!text) return [];

  const lines = text.split("\n").filter(Boolean).slice(-Math.max(1, limit));
  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as BenchmarkEvent;
      } catch {
        return null;
      }
    })
    .filter((evt): evt is BenchmarkEvent => evt !== null);
}

export function getBenchmarkDashboard(projectPath: string, options: { windowHours?: number; limit?: number } = {}): BenchmarkDashboard {
  const windowHours = Math.max(1, options.windowHours ?? 24);
  const limit = Math.max(1, options.limit ?? 5000);
  const all = readBenchmarkEvents(projectPath, limit);
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const inWindow = all.filter((evt) => {
    const ts = new Date(evt.timestamp).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  });
  return buildBenchmarkDashboard(inWindow, windowHours);
}
