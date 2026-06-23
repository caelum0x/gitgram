import { describe, expect, it } from "vitest";

import { runSearchRelevanceBenchmark } from "../src/core/search-relevance-benchmark.js";

describe("search relevance gate", () => {
  it("meets minimum search relevance thresholds", () => {
    const report = runSearchRelevanceBenchmark();

    if (!report.passed) {
      console.error("Search relevance gate failed:", JSON.stringify(report, null, 2));
    }

    expect(report.metrics.top1Accuracy).toBeGreaterThanOrEqual(report.thresholds.minTop1Accuracy);
    expect(report.metrics.mrr).toBeGreaterThanOrEqual(report.thresholds.minMrr);
    expect(report.metrics.recallAt3).toBeGreaterThanOrEqual(report.thresholds.minRecallAt3);
    expect(report.passed).toBe(true);
  });
});
