import { describe, expect, it } from "vitest";
import { runRedactionBenchmark } from "../src/export/redaction-benchmark.js";

function readThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

describe("redaction quality gate", () => {
  it("meets configured precision/recall/f1 thresholds", () => {
    const minPrecision = readThreshold("AITM_REDACTION_MIN_PRECISION", 0.8);
    const minRecall = readThreshold("AITM_REDACTION_MIN_RECALL", 0.95);
    const minF1 = readThreshold("AITM_REDACTION_MIN_F1", 0.88);

    const report = runRedactionBenchmark();

    expect(report.metrics.precision).toBeGreaterThanOrEqual(minPrecision);
    expect(report.metrics.recall).toBeGreaterThanOrEqual(minRecall);
    expect(report.metrics.f1).toBeGreaterThanOrEqual(minF1);
  });
});
