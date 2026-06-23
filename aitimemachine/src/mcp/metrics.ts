/**
 * MCP Server Metrics Collector
 *
 * Tracks tool call counters, latency percentiles, error rates,
 * and aggregate statistics for the MCP server runtime.
 *
 * All data is held in memory -- no persistence.
 */

export interface ToolMetrics {
  calls: number;
  errors: number;
  /** Raw latency samples in ms (capped to keep memory bounded). */
  latencies: number[];
}

export interface MetricsSnapshot {
  uptime_seconds: number;
  total_tool_calls: number;
  total_errors: number;
  tools: Record<
    string,
    {
      calls: number;
      errors: number;
      avg_latency_ms: number;
      p50_latency_ms: number;
      p95_latency_ms: number;
      p99_latency_ms: number;
      max_latency_ms: number;
    }
  >;
  memory_usage_mb: number;
  checkpoints_created: number;
  checkpoints_restored: number;
}

const MAX_LATENCY_SAMPLES = 10_000;

export class MetricsCollector {
  private startTime: number;
  private toolMetrics: Map<string, ToolMetrics> = new Map();
  private checkpointsCreated = 0;
  private checkpointsRestored = 0;
  private metricsEndpoint: string | null;

  constructor() {
    this.startTime = Date.now();
    this.metricsEndpoint = process.env.AITM_METRICS_ENDPOINT ?? null;
  }

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  /** Record the start of a tool call. Returns a finish callback. */
  startToolCall(toolName: string): () => void {
    const start = performance.now();
    return () => {
      const elapsed = performance.now() - start;
      this.recordLatency(toolName, elapsed);
    };
  }

  /** Increment the call counter and store a latency sample. */
  recordLatency(toolName: string, latencyMs: number): void {
    const m = this.getOrCreate(toolName);
    m.calls++;
    if (m.latencies.length < MAX_LATENCY_SAMPLES) {
      m.latencies.push(latencyMs);
    } else {
      // Reservoir-style: replace a random element to keep distribution representative
      const idx = Math.floor(Math.random() * MAX_LATENCY_SAMPLES);
      m.latencies[idx] = latencyMs;
    }
  }

  recordError(toolName: string): void {
    const m = this.getOrCreate(toolName);
    m.errors++;
  }

  recordCheckpointCreated(): void {
    this.checkpointsCreated++;
  }

  recordCheckpointRestored(): void {
    this.checkpointsRestored++;
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  getSnapshot(): MetricsSnapshot {
    let totalCalls = 0;
    let totalErrors = 0;
    const tools: MetricsSnapshot["tools"] = {};

    for (const [name, m] of this.toolMetrics) {
      totalCalls += m.calls;
      totalErrors += m.errors;

      const sorted = [...m.latencies].sort((a, b) => a - b);
      const avg = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;

      tools[name] = {
        calls: m.calls,
        errors: m.errors,
        avg_latency_ms: round2(avg),
        p50_latency_ms: round2(percentile(sorted, 50)),
        p95_latency_ms: round2(percentile(sorted, 95)),
        p99_latency_ms: round2(percentile(sorted, 99)),
        max_latency_ms: round2(sorted.length > 0 ? sorted[sorted.length - 1] : 0),
      };
    }

    const memUsage = process.memoryUsage();

    return {
      uptime_seconds: round2((Date.now() - this.startTime) / 1000),
      total_tool_calls: totalCalls,
      total_errors: totalErrors,
      tools,
      memory_usage_mb: round2(memUsage.rss / (1024 * 1024)),
      checkpoints_created: this.checkpointsCreated,
      checkpoints_restored: this.checkpointsRestored,
    };
  }

  // ---------------------------------------------------------------------------
  // Optional: push metrics to external endpoint
  // ---------------------------------------------------------------------------

  async pushMetrics(): Promise<void> {
    if (!this.metricsEndpoint) return;
    try {
      const snapshot = this.getSnapshot();
      await fetch(this.metricsEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
    } catch {
      // Silently ignore push failures -- metrics are best-effort
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private getOrCreate(toolName: string): ToolMetrics {
    let m = this.toolMetrics.get(toolName);
    if (!m) {
      m = { calls: 0, errors: 0, latencies: [] };
      this.toolMetrics.set(toolName, m);
    }
    return m;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
